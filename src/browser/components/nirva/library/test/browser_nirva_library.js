/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, ContentTaskUtils, content, getRootDirectory, gBrowser, gTestPath, IOUtils, PathUtils, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaLibrary } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibrary.sys.mjs"
);
const { NirvaLibraryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibraryStore.sys.mjs"
);
const { NirvaPrivacyRules } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs"
);
const { NirvaReadSearch } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const TEST_ROOT = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "http://127.0.0.1:8888"
);
const TEST_PAGE = `${TEST_ROOT}page.html`;
const MANAGER_URL = "chrome://browser/content/nirva/library.html";
const PHRASE = "seventeen amber lanterns";

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref("nirva.library.enabled");
  await NirvaLibrary.clear();
  for (const tab of [...gBrowser.tabs]) {
    if (tab.linkedBrowser.currentURI.spec.startsWith(MANAGER_URL)) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

function selectContents(browser, selector) {
  return SpecialPowers.spawn(browser, [selector], target => {
    const range = content.document.createRange();
    range.selectNodeContents(content.document.querySelector(target));
    const selection = content.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

// Waits until the page paints `count` highlights and describes them.
function paintedHighlights(browser, count) {
  return SpecialPowers.spawn(browser, [count], async expected => {
    const read = () => {
      const found = [];
      for (const name of ["nirva-library-highlight", "nirva-library-note"]) {
        const highlight = content.wrappedJSObject.CSS.highlights.get(name);
        for (const range of highlight ? [...highlight] : []) {
          found.push({
            name,
            text: range.toString().replace(/\s+/g, " ").trim(),
            inOther: content.document
              .querySelector("#other")
              .contains(range.startContainer),
          });
        }
      }
      return found;
    };
    await ContentTaskUtils.waitForCondition(
      () => read().length == expected,
      `the page paints ${expected} highlight(s)`
    );
    return read();
  });
}

add_task(async function test_save_a_script_free_copy_and_open_it() {
  await NirvaLibrary.clear();
  let page;
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    Assert.ok(NirvaLibrary.canSave(window, browser), "a web page can be saved");
    page = await NirvaLibrary.savePage(window, browser);
    Assert.ok(page?.copy, "saving records a copy against the page");
    Assert.equal(page.url, TEST_PAGE, "the source address is kept");
    Assert.equal(page.title, "Harbour field notes", "the title is kept");
    Assert.ok(
      gBrowser
        .getNotificationBox(browser)
        .getNotificationWithValue("nirva-library-notice"),
      "the owner is told the page was saved"
    );
  });

  const path = NirvaLibraryStore.copyPath(page.id);
  const html = await IOUtils.readUTF8(path);
  Assert.equal(
    (await IOUtils.stat(path)).size,
    page.copy.bytes,
    "the recorded size is the size on disk"
  );
  Assert.ok(!/<script/i.test(html), "scripts are left out");
  Assert.ok(!html.includes("onclick"), "inline event handlers are left out");
  Assert.ok(!html.includes("javascript:"), "script links are left out");
  for (const secret of [
    "hunter2-secret",
    "csrf-secret-123",
    "private-typed-value",
    "private-draft-text",
  ]) {
    Assert.ok(!html.includes(secret), `form data "${secret}" is not saved`);
  }
  Assert.ok(
    html.includes("Content-Security-Policy") &&
      html.includes("default-src 'none'"),
    "the copy forbids scripts and network requests"
  );
  Assert.ok(
    /<img[^>]+src="data:image\/png;base64,/.test(html),
    "the image is embedded in the file"
  );
  Assert.ok(html.includes("rgb(12, 34, 56)"), "the stylesheet is embedded");
  Assert.ok(
    /background-image:\s*url\("data:image\/png;base64,/.test(html),
    "images used by the stylesheet are embedded"
  );
  Assert.ok(!html.includes("page.css"), "no stylesheet is left to fetch");
  Assert.ok(
    html.includes(`href="${TEST_ROOT}other.html"`),
    "links point at the original site"
  );
  Assert.equal(page.copy.skipped, 0, "every resource was embedded");

  const hits = await NirvaReadSearch.searchSavedCopies("lighthouse");
  Assert.equal(hits.length, 1, "the saved text is searchable");
  Assert.equal(hits[0].sourceKind, "saved", "the result is a saved copy");
  Assert.equal(
    hits[0].localURI,
    NirvaLibrary.copyURL(page.id),
    "the search result opens the local copy"
  );
  Assert.deepEqual(
    (await NirvaLibrary.search("lighthouse tide")).map(item => item.id),
    [page.id],
    "the library finds a page by its saved text"
  );
  Assert.equal(
    (await NirvaLibrary.search("no-such-word")).length,
    0,
    "unrelated searches find nothing"
  );

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    NirvaLibrary.copyURL(page.id)
  );
  const browser = tab.linkedBrowser;
  const notice = await TestUtils.waitForCondition(
    () =>
      gBrowser
        .getNotificationBox(browser)
        .getNotificationWithValue("nirva-library-saved-copy"),
    "a saved copy is labelled as one"
  );
  Assert.ok(
    notice.messageText.textContent.includes("127.0.0.1"),
    "the label names the source site"
  );
  const shown = await SpecialPowers.spawn(browser, [], async () => {
    const doc = content.document;
    const image = doc.querySelector("#photo");
    await ContentTaskUtils.waitForCondition(
      () => image.complete,
      "the embedded image finishes decoding"
    );
    const style = content.getComputedStyle(doc.querySelector("#styled"));
    return {
      imageWidth: image.naturalWidth,
      color: style.color,
      background: style.backgroundImage.slice(0, 20),
      scriptRan: content.wrappedJSObject.scriptRan,
      scripts: doc.scripts.length,
      password: doc.querySelector("input[type=password]").value,
      text: doc.querySelector("#passage").textContent,
    };
  });
  Assert.equal(shown.imageWidth, 8, "the image shows from the local file");
  Assert.equal(shown.color, "rgb(12, 34, 56)", "the page keeps its styles");
  Assert.ok(
    shown.background.startsWith('url("data:image/png'),
    "the background image shows from the local file"
  );
  Assert.equal(shown.scriptRan, undefined, "no script runs in the copy");
  Assert.equal(shown.scripts, 0, "the copy holds no scripts");
  Assert.equal(shown.password, "", "no password is in the copy");
  Assert.ok(shown.text.includes("lighthouse"), "the text is readable");
  Assert.ok(
    NirvaLibrary.canAnnotate(window, browser) &&
      !NirvaLibrary.canSave(window, browser),
    "a saved copy can be annotated but not saved again as a copy"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_highlights_and_notes_return_with_the_page() {
  const [page] = await NirvaLibraryStore.list();
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    Assert.equal(
      await NirvaLibrary.highlightSelection(window),
      null,
      "nothing is highlighted without a selection"
    );

    await selectContents(browser, "#phrase");
    const first = await NirvaLibrary.highlightSelection(window);
    Assert.equal(first.annotation.quote, PHRASE, "the selected text is kept");
    Assert.equal(first.page.id, page.id, "it joins the saved page's entry");
    let painted = await paintedHighlights(browser, 1);
    Assert.equal(painted[0].text, PHRASE, "the highlight is painted at once");
    Assert.ok(
      painted[0].inOther,
      "the right occurrence is highlighted, not an earlier identical phrase"
    );

    await selectContents(browser, "#passage");
    const second = await NirvaLibrary.highlightSelection(window);
    Assert.ok(
      second.annotation.quote.startsWith("The lighthouse keeper logs"),
      "a selection crossing inline elements is kept"
    );
    await NirvaLibrary.setAnnotationNote(
      page.id,
      second.annotation.id,
      "Compare with the ferry log"
    );
    painted = await paintedHighlights(browser, 2);
    Assert.ok(
      painted.some(item => item.name == "nirva-library-note" && !item.inOther),
      "a highlight with a note is marked as such"
    );

    const reloaded = BrowserTestUtils.browserLoaded(browser);
    browser.reload();
    await reloaded;
    painted = await paintedHighlights(browser, 2);
    Assert.deepEqual(
      painted.map(item => item.text).sort(),
      [PHRASE, second.annotation.quote].sort(),
      "highlights reappear on a return visit"
    );
    Assert.deepEqual(
      (await NirvaLibrary.search("ferry log")).map(item => item.id),
      [page.id],
      "the library finds a page by a note"
    );

    const menu = document.getElementById("contentAreaContextMenu");
    let shownMenu = BrowserTestUtils.waitForEvent(menu, "popupshown");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#phrase",
      { type: "contextmenu", button: 2 },
      browser
    );
    await shownMenu;
    const remove = document.getElementById("nirva-context-remove-highlight");
    Assert.ok(!remove.hidden, "a highlight offers its removal on right-click");
    Assert.ok(
      document.getElementById("nirva-context-highlight").hidden,
      "highlighting is not offered without a selection"
    );
    let hiddenMenu = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(remove);
    await hiddenMenu;
    painted = await paintedHighlights(browser, 1);
    Assert.equal(
      painted[0].name,
      "nirva-library-note",
      "the removed highlight is gone from the page"
    );
    Assert.equal(
      (await NirvaLibraryStore.get(page.id)).annotations.length,
      1,
      "and gone from the library"
    );

    await selectContents(browser, "#phrase");
    shownMenu = BrowserTestUtils.waitForEvent(menu, "popupshown");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#phrase",
      { type: "contextmenu", button: 2 },
      browser
    );
    await shownMenu;
    const highlight = document.getElementById("nirva-context-highlight");
    Assert.ok(!highlight.hidden, "selected text offers highlighting");
    Assert.ok(remove.hidden, "removal is offered only on a highlight");
    hiddenMenu = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(highlight);
    await hiddenMenu;
    await paintedHighlights(browser, 2);
  });

  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    NirvaLibrary.copyURL(page.id)
  );
  const painted = await paintedHighlights(tab.linkedBrowser, 2);
  Assert.ok(
    painted.some(item => item.text == PHRASE),
    "the saved copy shows the same highlights"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_library_page_organises_exports_and_deletes() {
  const [page] = await NirvaLibraryStore.list();
  const tab = NirvaLibrary.openManager(window);
  const browser = tab.linkedBrowser;
  const doc = () => browser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc()?.querySelector(".page-card"),
    "the Library page lists the saved page"
  );
  const card = () => doc().querySelector(".page-card");
  Assert.equal(
    card().querySelector(".page-title").textContent,
    "Harbour field notes"
  );
  Assert.equal(
    card().querySelectorAll(".highlight").length,
    2,
    "the page's highlights are listed with it"
  );
  Assert.ok(
    !card().querySelector(".open-copy").hidden,
    "a saved copy can be opened from its card"
  );

  const typeInto = (selector, value, type) => {
    const field = doc().querySelector(selector);
    field.value = value;
    const { Event } = doc().defaultView;
    field.dispatchEvent(new Event(type, { bubbles: true }));
  };
  typeInto(".page-tags", "Harbour, reference, harbour", "change");
  await TestUtils.waitForCondition(
    async () => (await NirvaLibraryStore.get(page.id)).tags.length == 2,
    "tags are saved without duplicates"
  );
  typeInto(".page-note", "Read before the survey", "change");
  await TestUtils.waitForCondition(
    async () =>
      (await NirvaLibraryStore.get(page.id)).note == "Read before the survey",
    "a note about the page is saved"
  );
  await TestUtils.waitForCondition(
    () => doc().querySelector("#tag-filter").options.length == 3,
    "tags can be used to filter the list"
  );

  typeInto("#search", "no-such-word", "input");
  await TestUtils.waitForCondition(
    () => !doc().querySelector("#no-results").hidden && !card(),
    "a search with no match says so"
  );
  typeInto("#search", "survey", "input");
  await TestUtils.waitForCondition(
    () => card(),
    "searching finds the page by its note"
  );
  typeInto("#search", "", "input");

  const folder = PathUtils.join(PathUtils.tempDir, "nirva-library-export");
  await IOUtils.remove(folder, { recursive: true, ignoreAbsent: true });
  const exported = await NirvaLibrary.exportAll(folder);
  Assert.deepEqual(exported, { pages: 1, copies: 1 }, "one copy is exported");
  const names = (await IOUtils.getChildren(folder)).map(PathUtils.filename);
  Assert.ok(
    names.some(name => /^Harbour-field-notes-[0-9a-f]{8}\.html$/.test(name)),
    "the saved copy is exported as an HTML file"
  );
  const notes = await IOUtils.readUTF8(PathUtils.join(folder, "notes.md"));
  Assert.ok(
    notes.includes(`> ${PHRASE}`) &&
      notes.includes("Compare with the ferry log") &&
      notes.includes(TEST_PAGE),
    "highlights, notes and the source address are exported"
  );
  Assert.equal(
    (await IOUtils.readJSON(PathUtils.join(folder, "library.json"))).pages
      .length,
    1,
    "the index is exported"
  );
  await IOUtils.remove(folder, { recursive: true });

  browser.contentWindow.confirm = () => true;
  card().querySelector(".remove-copy").click();
  await TestUtils.waitForCondition(
    async () => !(await NirvaLibraryStore.get(page.id)).copy,
    "the saved copy can be removed on its own"
  );
  Assert.ok(
    !(await IOUtils.exists(NirvaLibraryStore.copyPath(page.id))),
    "its file is deleted"
  );
  Assert.equal(
    (await NirvaReadSearch.searchSavedCopies("lighthouse")).length,
    0,
    "its text leaves the search index"
  );
  await TestUtils.waitForCondition(
    () => card()?.querySelector(".open-copy").hidden,
    "the card no longer offers a saved copy"
  );
  Assert.equal(
    card().querySelectorAll(".highlight").length,
    2,
    "highlights and notes are kept"
  );

  card().querySelector(".delete-page").click();
  await TestUtils.waitForCondition(
    async () => !(await NirvaLibraryStore.list()).length,
    "deleting a page removes its notes and highlights"
  );
  await TestUtils.waitForCondition(
    () => !doc().querySelector("#empty-state").hidden,
    "the empty Library explains how to begin"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_private_and_sensitive_pages_are_left_out() {
  Assert.equal(
    NirvaPrivacyRules.storableURL(`${TEST_PAGE}?token=secret`),
    null,
    "addresses with secret parameters are refused"
  );
  Assert.equal(
    NirvaPrivacyRules.storableURL("file:///tmp/page.html"),
    null,
    "local files are not library sources"
  );
  Assert.ok(
    NirvaPrivacyRules.isSensitivePage("https://example.com/account/login", ""),
    "sign-in pages are recognised"
  );
  const names = () =>
    NirvaCommands.search("library", window).map(item => item.command.id);

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    Assert.ok(names().includes("library-save"), "saving is a command");
    const tab = gBrowser.getTabForBrowser(browser);
    tab.setAttribute("nirva-burner", "true");
    Assert.ok(
      !NirvaLibrary.canSave(window, browser),
      "Burner tabs are left out"
    );
    Assert.equal(
      await NirvaLibrary.savePage(window, browser),
      null,
      "asking to save a Burner tab saves nothing"
    );
    tab.removeAttribute("nirva-burner");

    await selectContents(browser, "#phrase");
    await NirvaLibrary.highlightSelection(window);
    await paintedHighlights(browser, 1);
    Services.prefs.setBoolPref("nirva.library.enabled", false);
    await paintedHighlights(browser, 0);
    Assert.ok(
      !NirvaLibrary.canSave(window, browser),
      "the switch turns it off"
    );
    Assert.ok(!names().includes("library-save"), "and hides its commands");
    Services.prefs.setBoolPref("nirva.library.enabled", true);
    await paintedHighlights(browser, 1);

    const secretURL = `${TEST_PAGE}?token=secret`;
    const loaded = BrowserTestUtils.browserLoaded(browser, false, secretURL);
    BrowserTestUtils.startLoadingURIString(browser, secretURL);
    await loaded;
    Assert.ok(
      !NirvaLibrary.canSave(window, browser),
      "pages carrying secret URL parameters are left out"
    );
  });

  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    const privateTab = await BrowserTestUtils.openNewForegroundTab(
      privateWindow.gBrowser,
      TEST_PAGE
    );
    Assert.ok(
      !NirvaLibrary.canSave(privateWindow, privateTab.linkedBrowser),
      "private windows are left out"
    );
    Assert.equal(
      await NirvaLibrary.pageReady(privateTab.linkedBrowser, TEST_PAGE),
      null,
      "highlights are never painted in private windows"
    );
    Assert.equal(
      NirvaLibrary.openManager(privateWindow),
      null,
      "the Library does not open in a private window"
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }

  await NirvaLibrary.clear();
  Assert.deepEqual(
    await NirvaLibraryStore.usage(),
    { pages: 0, copies: 0, notes: 0, bytes: 0 },
    "deleting everything leaves nothing behind"
  );
});
