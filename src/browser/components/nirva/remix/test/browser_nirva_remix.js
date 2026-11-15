/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_task, Assert, BrowserTestUtils, ContentTaskUtils, content, document, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaRemix } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs"
);
const { NirvaRemixStore, remixSelector, remixKey } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "http://127.0.0.1:8888"
)}page.html`;
const MANAGER_URL = "chrome://browser/content/nirva/remix.html";

registerCleanupFunction(async () => {
  Services.prefs.clearUserPref("nirva.remix.enabled");
  await NirvaRemix.resetAll();
  for (const tab of [...gBrowser.tabs]) {
    if (tab.linkedBrowser.currentURI.spec == MANAGER_URL) {
      BrowserTestUtils.removeTab(tab);
    }
  }
});

function pageState(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    const style = id =>
      content.getComputedStyle(content.document.getElementById(id));
    return {
      promo: style("promo").display,
      consent: style("cookie-consent").display,
      signin: style("signin").display,
      font: style("story").fontFamily,
      lineHeight:
        parseFloat(style("story").lineHeight) /
        parseFloat(style("story").fontSize),
      textZoom: content.browsingContext.textZoom,
    };
  });
}

async function pickElement(browser, selector) {
  const picking = NirvaRemix.pickToHide(window);
  await SpecialPowers.spawn(browser, [], async () => {
    await ContentTaskUtils.waitForCondition(
      () =>
        content.document.querySelector("[data-nirva-remix-overlay='picker']"),
      "the element picker is active on the page"
    );
  });
  await BrowserTestUtils.synthesizeMouseAtCenter(selector, {}, browser);
  return picking;
}

add_task(async function test_hide_persists_and_protected_parts_stay() {
  await NirvaRemix.resetAll();
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const tab = gBrowser.getTabForBrowser(browser);
    Assert.ok(
      NirvaRemix.canRemix(window, browser),
      "a web page can be remixed"
    );
    Assert.equal((await pageState(browser)).promo, "block", "starts visible");

    const picked = await pickElement(browser, "#promo");
    Assert.equal(
      picked?.entry.selector,
      "#promo",
      "the clicked element is stored"
    );
    Assert.equal(picked.remix.scope, "site", "a new remix covers the site");
    Assert.equal(picked.remix.key, "127.0.0.1", "it is filed under the site");
    await TestUtils.waitForCondition(
      async () => (await pageState(browser)).promo == "none",
      "the chosen element is hidden at once"
    );
    Assert.ok(
      tab.hasAttribute("nirva-remixed"),
      "the tab is marked as remixed"
    );

    Assert.equal(
      await pickElement(browser, "#cookie-consent"),
      null,
      "a consent prompt cannot be hidden"
    );
    Assert.equal(
      await pickElement(browser, "#signin"),
      null,
      "a sign-in form cannot be hidden"
    );
    const state = await pageState(browser);
    Assert.equal(state.consent, "block", "the consent prompt is untouched");
    Assert.equal(state.signin, "block", "the sign-in form is untouched");
    Assert.equal(
      (await NirvaRemixStore.lookup(TEST_PAGE)).hidden.length,
      1,
      "refused elements are not stored"
    );

    BrowserTestUtils.startLoadingURIString(browser, TEST_PAGE);
    await BrowserTestUtils.browserLoaded(browser, false, TEST_PAGE);
    await TestUtils.waitForCondition(
      async () => (await pageState(browser)).promo == "none",
      "the element is hidden again on the next visit"
    );
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () =>
          content.document.querySelector("[data-nirva-remix-overlay='chip']"),
        "the page says it was remixed by the user"
      );
    });
  });
});

add_task(async function test_typography_toggle_and_reset() {
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const tab = gBrowser.getTabForBrowser(browser);
    const remix = await NirvaRemixStore.lookup(TEST_PAGE);
    await NirvaRemix.update(remix.id, {
      fontFamily: "serif",
      lineHeight: 1.8,
      textScale: 125,
    });
    await TestUtils.waitForCondition(async () => {
      const state = await pageState(browser);
      return (
        state.font.includes("serif") &&
        !state.font.includes("sans") &&
        Math.abs(state.lineHeight - 1.8) < 0.05 &&
        Math.abs(state.textZoom - 1.25) < 0.01
      );
    }, "font, line spacing and text size are applied to the open page");

    await NirvaRemix.stepText(window, 1);
    Assert.equal(
      (await NirvaRemixStore.get(remix.id)).textScale,
      150,
      "the larger-text command moves one step up"
    );

    await NirvaRemix.setEnabled(remix.id, false);
    await TestUtils.waitForCondition(async () => {
      const state = await pageState(browser);
      return (
        state.promo == "block" &&
        state.font.includes("sans") &&
        Math.abs(state.textZoom - 1) < 0.01
      );
    }, "turning the remix off restores the original page");
    Assert.ok(!tab.hasAttribute("nirva-remixed"), "the tab mark is removed");

    await NirvaRemix.setEnabled(remix.id, true);
    await TestUtils.waitForCondition(
      async () => (await pageState(browser)).promo == "none",
      "turning it on applies it again"
    );

    await NirvaRemix.reset(remix.id);
    await TestUtils.waitForCondition(async () => {
      const state = await pageState(browser);
      return state.promo == "block" && Math.abs(state.textZoom - 1) < 0.01;
    }, "reset returns the page to its original look in one step");
    Assert.equal(
      await NirvaRemixStore.lookup(TEST_PAGE),
      null,
      "nothing is kept"
    );
  });
});

add_task(async function test_page_scope_and_manager_page() {
  const otherPage = `${TEST_PAGE}?edition=2`;
  const pageRemix = await NirvaRemix.ensureFor(otherPage, "page");
  await NirvaRemixStore.addHidden(pageRemix.id, {
    selector: "#story",
    label: "p: The ferry timetable",
  });
  Assert.equal(pageRemix.key, otherPage, "a page remix is filed by address");
  Assert.equal(
    await NirvaRemixStore.lookup(TEST_PAGE),
    null,
    "it does not apply to other pages of the site"
  );

  await BrowserTestUtils.withNewTab(otherPage, async browser => {
    await TestUtils.waitForCondition(
      () =>
        SpecialPowers.spawn(
          browser,
          [],
          () =>
            content.getComputedStyle(content.document.getElementById("story"))
              .display == "none"
        ),
      "the page remix is applied on its own page"
    );

    const managerTab = NirvaRemix.openManager(window, otherPage);
    const manager = managerTab.linkedBrowser;
    await TestUtils.waitForCondition(
      () => manager.contentDocument?.querySelector(".page-card .show-again"),
      "the manager lists the remix and its hidden element"
    );
    const card = manager.contentDocument.querySelector(".page-card");
    Assert.equal(
      card.dataset.remixId,
      pageRemix.id,
      "the asked page comes first"
    );

    const font = card.querySelector(".remix-font");
    font.value = "monospace";
    font.dispatchEvent(new manager.contentWindow.Event("change"));
    await TestUtils.waitForCondition(
      async () =>
        (await NirvaRemixStore.get(pageRemix.id))?.fontFamily == "monospace",
      "the font control saves its choice"
    );

    await TestUtils.waitForCondition(
      () => manager.contentDocument.querySelector(".page-card .show-again"),
      "the page redraws after the change"
    );
    manager.contentDocument.querySelector(".page-card .show-again").click();
    await TestUtils.waitForCondition(
      async () => !(await NirvaRemixStore.get(pageRemix.id))?.hidden.length,
      "Show again removes the hidden element"
    );
    await TestUtils.waitForCondition(
      () =>
        SpecialPowers.spawn(
          browser,
          [],
          () =>
            content.getComputedStyle(content.document.getElementById("story"))
              .display != "none"
        ),
      "the element is visible again on the open page"
    );

    await TestUtils.waitForCondition(
      () => manager.contentDocument.querySelector(".page-card .reset-remix"),
      "the page redraws with its reset button"
    );
    manager.contentDocument.querySelector(".page-card .reset-remix").click();
    await TestUtils.waitForCondition(
      async () => !(await NirvaRemixStore.get(pageRemix.id)),
      "the reset button removes the remix in one click"
    );
    BrowserTestUtils.removeTab(managerTab);
  });
});

add_task(async function test_right_click_hides_an_element() {
  await NirvaRemix.resetAll();
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const menu = document.getElementById("contentAreaContextMenu");
    const item = document.getElementById("nirva-remix-context-hide");
    const shown = BrowserTestUtils.waitForEvent(menu, "popupshown");
    await BrowserTestUtils.synthesizeMouseAtCenter(
      "#promo",
      { type: "contextmenu", button: 2 },
      browser
    );
    await shown;
    Assert.ok(!item.hidden, "the page menu offers Hide This Element");
    const closed = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(item);
    await closed;
    await TestUtils.waitForCondition(
      async () => (await pageState(browser)).promo == "none",
      "the right-clicked element is hidden"
    );
    Assert.equal(
      (await NirvaRemixStore.lookup(TEST_PAGE))?.hidden[0]?.selector,
      "#promo",
      "and it is saved for the site"
    );
  });
  await NirvaRemix.resetAll();
});

add_task(async function test_privacy_boundaries() {
  Assert.equal(
    remixSelector("a { color: red }"),
    null,
    "rules cannot be smuggled in"
  );
  Assert.equal(
    remixSelector("div:has(input)"),
    null,
    "costly selectors are refused"
  );
  Assert.equal(remixSelector("#promo"), "#promo");
  Assert.equal(remixKey("file:///tmp/a.html", "site"), null, "only web pages");
  Assert.equal(
    remixKey(`${TEST_PAGE}?token=abc`, "page"),
    null,
    "addresses with secret parameters are not stored"
  );

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const tab = gBrowser.getTabForBrowser(browser);
    tab.setAttribute("nirva-burner", "true");
    Assert.ok(
      !NirvaRemix.canRemix(window, browser),
      "Burner tabs are left alone"
    );
    tab.removeAttribute("nirva-burner");

    Services.prefs.setBoolPref("nirva.remix.enabled", false);
    Assert.ok(!NirvaRemix.canRemix(window, browser), "the switch turns it off");
    Services.prefs.setBoolPref("nirva.remix.enabled", true);
  });
  Assert.ok(
    !NirvaRemix._allowed(
      window,
      gBrowser.selectedBrowser,
      "https://example.com/account/login"
    ),
    "sign-in pages are never remixed"
  );

  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    const privateTab = await BrowserTestUtils.openNewForegroundTab(
      privateWindow,
      TEST_PAGE
    );
    Assert.ok(
      !NirvaRemix.canRemix(privateWindow, privateTab.linkedBrowser),
      "private windows are left alone"
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});
