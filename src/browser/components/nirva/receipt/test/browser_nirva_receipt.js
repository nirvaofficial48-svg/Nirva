/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_setup, add_task, Assert, BrowserTestUtils, Ci, document, window, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaReceipt, summarizeLog } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs"
);
const { UrlClassifierTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/UrlClassifierTestUtils.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}page.html`;
const MANAGER_URL = "chrome://browser/content/nirva/receipt.html";

add_setup(async function () {
  await UrlClassifierTestUtils.addTestTrackers();
  registerCleanupFunction(() => {
    UrlClassifierTestUtils.cleanupTestTrackers();
    Services.prefs.clearUserPref("nirva.receipt.enabled");
    NirvaReceipt.clearSession();
  });
});

add_task(function test_numbers_come_only_from_logged_events() {
  const state = Ci.nsIWebProgressListener;
  const summary = summarizeLog({
    "https://ads.example": [
      [state.STATE_BLOCKED_TRACKING_CONTENT, true, 3],
      [state.STATE_COOKIES_BLOCKED_TRACKER, true, 1],
    ],
    "https://social.example": [
      [state.STATE_BLOCKED_SOCIALTRACKING_CONTENT, true, 1],
    ],
    "https://print.example": [
      [state.STATE_BLOCKED_FINGERPRINTING_CONTENT, true, 1],
      [state.STATE_BLOCKED_TRACKING_CONTENT, true, 1],
    ],
    "https://cdn.example": [[state.STATE_COOKIES_PARTITIONED_FOREIGN, true, 2]],
    "https://analytics.example": [
      [state.STATE_LOADED_LEVEL_1_TRACKING_CONTENT, true, 1],
    ],
    "https://quiet.example": [[state.STATE_BLOCKED_TRACKING_CONTENT, false, 1]],
  });
  Assert.deepEqual(
    summary,
    { trackers: 3, fingerprinters: 1, cookies: 2, loaded: 1, blocked: 3 },
    "each number counts distinct sites, and a site blocked twice counts once"
  );
  Assert.deepEqual(
    summarizeLog({}),
    { trackers: 0, fingerprinters: 0, cookies: 0, loaded: 0, blocked: 0 },
    "an empty log gives an empty receipt"
  );
});

add_task(async function test_receipt_for_a_page_with_a_blocked_tracker() {
  const button = document.getElementById("nirva-receipt-button");
  const panel = document.getElementById("nirva-receipt-panel");
  Assert.ok(button && panel, "each window has the receipt button and panel");

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    await TestUtils.waitForCondition(
      () => NirvaReceipt.summaryFor(browser)?.trackers >= 1,
      "the blocked tracker is recorded for the page"
    );
    const summary = NirvaReceipt.summaryFor(browser);
    await TestUtils.waitForCondition(
      () =>
        button.querySelector(".nirva-receipt-count").textContent ==
        String(summary.blocked),
      "the island button shows how many sites were blocked"
    );
    Assert.ok(!button.hidden, "the button is shown on a web page");

    const shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
    button.click();
    await shown;
    Assert.equal(
      button.getAttribute("open"),
      "true",
      "the button is marked open"
    );
    Assert.equal(
      panel.querySelector("[data-row='trackers'] .nirva-receipt-value")
        .textContent,
      String(summary.trackers),
      "the panel reports the same tracker count"
    );
    Assert.deepEqual(
      document.l10n.getAttributes(
        panel.querySelector(".nirva-receipt-headline")
      ),
      { id: "nirva-receipt-headline", args: { count: summary.blocked } },
      "the headline states the measured number"
    );
    Assert.greaterOrEqual(
      summary.loaded,
      1,
      "a listed tracker that loaded is counted"
    );
    Assert.equal(
      panel.querySelector("[data-row='loaded'] .nirva-receipt-value")
        .textContent,
      String(summary.loaded),
      "and reported, not hidden"
    );
    const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
    panel.hidePopup();
    await hidden;

    const site = NirvaReceipt.sessionSites().find(s => s.host == "example.com");
    Assert.greaterOrEqual(site?.trackers, 1, "the session list has this site");

    Services.prefs.setBoolPref("nirva.receipt.enabled", false);
    Assert.ok(button.hidden, "the switch removes the button");
    Services.prefs.setBoolPref("nirva.receipt.enabled", true);
    Assert.ok(!button.hidden, "and brings it back");
  });

  await BrowserTestUtils.withNewTab(
    TEST_PAGE.replace("page.html", "plain.html"),
    async () => {
      await TestUtils.waitForCondition(
        () =>
          !button.hidden &&
          !button.querySelector(".nirva-receipt-count").textContent,
        "a page with nothing to block shows the shield without a number"
      );
      const shown = BrowserTestUtils.waitForEvent(panel, "popupshown");
      Assert.ok(NirvaReceipt.showPanel(window), "the command opens the panel");
      await shown;
      Assert.equal(
        document.l10n.getAttributes(
          panel.querySelector(".nirva-receipt-headline")
        ).id,
        "nirva-receipt-headline-none",
        "the headline says no known trackers were seen"
      );
      Assert.equal(
        document.l10n.getAttributes(
          panel.querySelector("[data-row='loaded'] .nirva-receipt-value")
        ).id,
        "nirva-receipt-none-seen",
        "an empty row says none were seen rather than claiming none exist"
      );
      const hidden = BrowserTestUtils.waitForEvent(panel, "popuphidden");
      panel.hidePopup();
      await hidden;
    }
  );

  await BrowserTestUtils.withNewTab("about:robots", async () => {
    Assert.ok(button.hidden, "pages that are not web pages have no receipt");
  });
});

add_task(async function test_summary_page_lists_sites_and_totals() {
  const totals = await NirvaReceipt.totals();
  Assert.equal(
    typeof totals?.week.trackers,
    "number",
    "weekly totals are numbers"
  );
  Assert.equal(typeof totals?.month.cookies, "number", "monthly totals too");

  const tab = NirvaReceipt.openManager(window);
  const manager = tab.linkedBrowser;
  await BrowserTestUtils.browserLoaded(manager, false, MANAGER_URL);
  await TestUtils.waitForCondition(
    () => manager.contentDocument.querySelector("#sites tbody tr"),
    "the page lists this session's sites"
  );
  Assert.ok(
    manager.contentDocument
      .querySelector("#sites tbody")
      .textContent.includes("example.com"),
    "the visited test site is listed"
  );
  Assert.equal(
    manager.contentDocument.querySelectorAll(".meaning").length,
    4,
    "every number has its explanation"
  );
  manager.contentDocument.getElementById("clear-session").click();
  await TestUtils.waitForCondition(
    () => !manager.contentDocument.querySelector("#sites tbody tr"),
    "Clear this list empties the session list"
  );
  Assert.equal(NirvaReceipt.sessionSites().length, 0, "nothing is kept");
  BrowserTestUtils.removeTab(tab);
});
