/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, EventUtils, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaCommandBar } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommandBar.sys.mjs"
);
const { NirvaReadSearch } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs"
);
const { NirvaReadSearchStore, buildMatchQuery, normalizeDomain, normalizeURL } =
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/readsearch/NirvaReadSearchStore.sys.mjs"
  );

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "http://mochi.test:8888"
)}page.html`;
const SEARCH_PHRASE = "quartz observatory compass";
const READ_SEARCH_URL = "chrome://browser/content/nirva/read-search.html";

registerCleanupFunction(async () => {
  Services.prefs.setBoolPref("nirva.readsearch.paused", true);
  await NirvaReadSearch.clear();
  await NirvaReadSearch.allowDomain("mochi.test");
  await NirvaReadSearch.allowPage(TEST_PAGE);
  await NirvaReadSearch.setRetentionDays(30);
  Services.prefs.setBoolPref("nirva.readsearch.paused", false);
  NirvaCommandBar.close(window);
  const tab = [...gBrowser.tabs].find(
    item => item.linkedBrowser.currentURI.spec == READ_SEARCH_URL
  );
  if (tab) {
    await BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_read_search_uses_readable_page_text() {
  await NirvaReadSearchStore.init();
  await NirvaReadSearch.clear();
  await NirvaReadSearch.allowDomain("mochi.test");
  await NirvaReadSearch.setPaused(false);

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    NirvaReadSearch._cancelScheduledIndexes();
    const indexed = await NirvaReadSearch._indexBrowser(window, browser);
    Assert.ok(indexed, "the PageExtractor indexed the visited page");

    const matches = await NirvaReadSearch.search(SEARCH_PHRASE, window, 10);
    Assert.equal(matches.length, 1, "the remembered phrase finds the page");
    Assert.equal(
      matches[0].title,
      "Field notes from the violet observatory",
      "the page title is returned"
    );
    Assert.ok(
      matches[0].passage.includes("⟦quartz⟧"),
      "the result includes a matching passage"
    );
    Assert.equal(
      matches[0].sourceKind,
      "live",
      "the source is identified as live"
    );
    Assert.equal(matches[0].visitCount, 1, "the visit context is recorded");

    const byURL = await NirvaReadSearch.search(
      "readsearch page html",
      window,
      10
    );
    Assert.ok(
      byURL.some(page => page.url == TEST_PAGE),
      "the page address is searchable"
    );

    const { results } = await NirvaCommandBar.search(window, SEARCH_PHRASE);
    Assert.ok(
      results.some(
        item => item.kind == "page" && item.title == matches[0].title
      ),
      "the Ctrl+K command bar also finds a remembered phrase"
    );

    const savedIndexed = await NirvaReadSearchStore.indexDocument({
      url: TEST_PAGE,
      title: "Field notes saved locally",
      body: "quartz observatory compass archived for offline reading",
      sourceKind: "saved",
      localURI: "file:///tmp/nirva-read-search-saved-copy.html",
      visitedAt: Date.now(),
    });
    Assert.ok(savedIndexed, "a local saved copy can enter the same index");
    const bothSources = await NirvaReadSearch.search(SEARCH_PHRASE, window, 10);
    Assert.ok(
      bothSources.some(page => page.sourceKind == "saved" && page.localURI),
      "saved-copy results retain their local open target and source label"
    );
  });
  await NirvaReadSearch.clear();
});

add_task(async function test_read_search_controls_privacy_and_search_ui() {
  Assert.equal(
    buildMatchQuery('quartz "observatory"'),
    '"quartz" AND "observatory"',
    "search terms are quoted before they reach FTS5"
  );
  Assert.equal(normalizeDomain("https://example.test"), "example.test");
  Assert.equal(normalizeDomain("example.test/path"), null);
  Assert.equal(
    normalizeURL("https://example.test/read?token=secret&chapter=2#private"),
    "https://example.test/read?chapter=2",
    "secrets and fragments are removed from stored page addresses"
  );

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    NirvaReadSearch._cancelScheduledIndexes();
    await NirvaReadSearch._indexBrowser(window, browser);
    await NirvaReadSearch.excludePage(TEST_PAGE);
    Assert.deepEqual(
      await NirvaReadSearch.search(SEARCH_PHRASE, window),
      [],
      "excluding a page removes it from results"
    );
    await NirvaReadSearch.allowPage(TEST_PAGE);
    await NirvaReadSearch.excludeDomain("mochi.test");
    Assert.deepEqual(
      await NirvaReadSearch.search(SEARCH_PHRASE, window),
      [],
      "excluding a domain removes all of its page text"
    );
    await NirvaReadSearch.allowDomain("mochi.test");
    await NirvaReadSearch._indexBrowser(window, browser);
    Assert.ok(
      (await NirvaReadSearch.search(SEARCH_PHRASE, window)).length,
      "allowing the domain lets the page be indexed again"
    );

    const tab = gBrowser.getTabForBrowser(browser);
    tab.setAttribute("nirva-burner", "true");
    Assert.ok(
      NirvaReadSearch._shouldSkip(window, browser),
      "Burner tabs are skipped"
    );
    tab.removeAttribute("nirva-burner");

    const secretURL = `${TEST_PAGE}?token=private`;
    const loaded = BrowserTestUtils.browserLoaded(browser, false, secretURL);
    await BrowserTestUtils.loadURIString({ browser, uriString: secretURL });
    await loaded;
    Assert.ok(
      NirvaReadSearch._shouldSkip(window, browser),
      "pages carrying secret URL parameters are skipped"
    );
    Assert.equal(
      browser.currentURI.spec,
      secretURL,
      "the privacy check used the secret URL"
    );
  });

  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    const privateTab = await BrowserTestUtils.openNewForegroundTab(
      privateWindow,
      TEST_PAGE
    );
    Assert.ok(
      NirvaReadSearch._shouldSkip(privateWindow, privateTab.linkedBrowser),
      "private browsing tabs are skipped"
    );
    Assert.ok(
      !(await NirvaReadSearch._indexBrowser(
        privateWindow,
        privateTab.linkedBrowser
      )),
      "private page text never enters the index"
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }

  const searchTab = NirvaReadSearch.openSearch(window);
  await TestUtils.waitForCondition(
    () =>
      searchTab.linkedBrowser.currentURI.spec == READ_SEARCH_URL &&
      searchTab.linkedBrowser.contentDocument?.readyState == "complete",
    "the Read-Everything Search page loads"
  );
  const page = searchTab.linkedBrowser.contentDocument;
  await page.l10n.ready;
  Assert.ok(page.getElementById("domains"), "site controls are in the page");
  Assert.ok(
    page.getElementById("excluded-domains"),
    "site exclusions are in the page"
  );
  const input = page.getElementById("query");
  input.value = SEARCH_PHRASE;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => page.querySelector("#results .result-card"),
    "the search page renders the indexed match"
  );
  Assert.ok(
    page
      .querySelector("#results .result-passage")
      ?.textContent.includes("quartz"),
    "the search page shows the matching passage"
  );
  await TestUtils.waitForCondition(
    () =>
      page.querySelector("#results .source-badge")?.textContent == "Live page",
    "the live result source is localized"
  );
  Assert.ok(
    page.querySelector("#results .source-badge")?.textContent.includes("Live"),
    "the search page labels a live result"
  );

  // Filters narrow the results without searching again.
  const filter = (kind, value) =>
    page.querySelector(
      `#filters [data-filter="${kind}"][data-value="${value}"]`
    );
  filter("kind", "saved").click();
  Assert.equal(
    page.querySelectorAll("#results .result-card").length,
    0,
    "a live page is hidden when only saved copies are wanted"
  );
  Assert.equal(filter("kind", "saved").getAttribute("aria-pressed"), "true");
  filter("kind", "all").click();
  filter("time", "7").click();
  Assert.equal(
    page.querySelectorAll("#results .result-card").length,
    1,
    "a page read today is within the past week"
  );
  filter("time", "any").click();

  // The card opens its page: by keyboard from the search box, or by a click.
  const opened = [];
  const realOpen = NirvaReadSearch.openResult;
  NirvaReadSearch.openResult = (win, result) => opened.push(result.url);
  try {
    input.focus();
    EventUtils.synthesizeKey(
      "KEY_ArrowDown",
      {},
      searchTab.linkedBrowser.contentWindow
    );
    const card = page.querySelector("#results .result-card");
    Assert.equal(page.activeElement, card, "Down moves into the results");
    EventUtils.synthesizeKey(
      "KEY_Enter",
      {},
      searchTab.linkedBrowser.contentWindow
    );
    page.querySelector("#results .result-passage").click();
  } finally {
    NirvaReadSearch.openResult = realOpen;
  }
  Assert.equal(opened.length, 2, "Enter and a click each open the page");
  Assert.ok(opened[0].startsWith(TEST_PAGE.split("?")[0]), "the right page");

  // With the box empty, the pages read most recently are offered.
  input.value = "";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => !page.getElementById("recent").hidden,
    "recent reading shows before typing"
  );
  Assert.greater(
    page.querySelectorAll("#recent-list .recent-row").length,
    0,
    "with the page just read"
  );
  input.value = SEARCH_PHRASE;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => page.querySelector("#results .result-card"),
    "the search comes back"
  );

  const pause = page.getElementById("pause-toggle");
  pause.click();
  await TestUtils.waitForCondition(
    () =>
      Services.prefs.getBoolPref("nirva.readsearch.paused") &&
      pause.textContent == "Resume indexing",
    "the pause control stops indexing"
  );
  page.getElementById("pause-toggle").click();
  await TestUtils.waitForCondition(
    () =>
      !Services.prefs.getBoolPref("nirva.readsearch.paused") &&
      pause.textContent == "Pause indexing",
    "the resume control restarts indexing"
  );

  page.getElementById("retention").value = "7";
  page
    .getElementById("retention")
    .dispatchEvent(new Event("change", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => Services.prefs.getIntPref("nirva.readsearch.retentionDays") == 7,
    "the retention setting is applied"
  );
  await NirvaReadSearch.setRetentionDays(30);

  await NirvaReadSearch.deleteBefore(Date.now() + 1000);
  Assert.deepEqual(
    await NirvaReadSearch.search(SEARCH_PHRASE, window),
    [],
    "date deletion removes the matching indexed page"
  );
  Assert.equal(
    await NirvaReadSearchStore.indexDocument({
      url: TEST_PAGE,
      title: "Restored test text",
      body: SEARCH_PHRASE,
    }),
    true,
    "the page can be indexed after date deletion"
  );
  page.getElementById("clear-all").click();
  await TestUtils.waitForCondition(
    () => page.getElementById("confirm-dialog").open,
    "clear all asks before deleting"
  );
  page.getElementById("confirm-action").click();
  await TestUtils.waitForCondition(
    async () => !(await NirvaReadSearch.search(SEARCH_PHRASE, window)).length,
    "confirming removes all indexed page text"
  );
});
