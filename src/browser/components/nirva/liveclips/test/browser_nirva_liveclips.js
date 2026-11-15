/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, ContentTaskUtils, content, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaClips } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClips.sys.mjs"
);
const { NirvaClipsStore, clipSelector, clipURL } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "http://127.0.0.1:8888"
)}page.html`;
const MANAGER_URL = "chrome://browser/content/nirva/live-clips.html";

registerCleanupFunction(async () => {
  NirvaClips._clearSchedule();
  Services.prefs.setBoolPref("nirva.liveclips.enabled", true);
  await NirvaClipsStore.setPaused(false);
  await NirvaClipsStore.clear();
  for (const tab of [...gBrowser.tabs]) {
    if (tab.linkedBrowser.currentURI.spec == MANAGER_URL) {
      await BrowserTestUtils.removeTab(tab);
    }
  }
});

add_task(async function test_user_can_create_refresh_and_manage_a_live_clip() {
  await NirvaClipsStore.clear();
  await NirvaClipsStore.setPaused(false);

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const capture = NirvaClips.captureSelected(window);
    await SpecialPowers.spawn(browser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector("[data-nirva-clip-picker]"),
        "the region picker is active on the page"
      );
    });
    await BrowserTestUtils.synthesizeMouseAtCenter("#clip-region", {}, browser);
    Assert.equal(await capture, true, "clicking a region saves a clip");

    const [clip] = await NirvaClipsStore.list();
    Assert.ok(clip, "the clip is persisted in the profile store");
    Assert.equal(clip.selector, "#clip-region", "the region selector is saved");
    Assert.ok(
      clip.text.includes("quartz pears are 41 credits"),
      "the selected region's text is saved"
    );
    Assert.equal(clip.refreshHours, 0, "refresh remains manual by default");
    Assert.equal(clip.error, null, "a new clip starts in a supported state");

    const managerTab = await TestUtils.waitForCondition(
      () =>
        [...gBrowser.tabs].find(
          tab => tab.linkedBrowser.currentURI.spec == MANAGER_URL
        ),
      "saving a clip opens the management page"
    );
    const managerBrowser = managerTab.linkedBrowser;
    await TestUtils.waitForCondition(
      () => managerBrowser.contentDocument?.querySelector(".clip-card"),
      "the management page displays the saved region"
    );
    Assert.ok(
      managerBrowser.contentDocument
        .querySelector(".clip-card")
        .textContent.includes("quartz pears are 41 credits"),
      "the management page renders text without page markup"
    );

    const refreshed = await NirvaClips.refreshClip(clip.id, true);
    Assert.ok(refreshed, "manual refresh extracts the stored selector");
    Assert.ok(
      refreshed.text.includes("quartz pears are 41 credits"),
      "the anonymous PageExtractor returned the selected region"
    );
    Assert.ok(
      refreshed.updatedAt >= clip.updatedAt,
      "last-updated is advanced"
    );

    await SpecialPowers.spawn(managerBrowser, [], () => {
      const select = content.document.querySelector(".clip-schedule");
      select.value = "6";
      select.dispatchEvent(new content.Event("change", { bubbles: true }));
    });
    await TestUtils.waitForCondition(
      async () => (await NirvaClipsStore.get(clip.id))?.refreshHours == 6,
      "the schedule selector saves the six-hour option"
    );

    await SpecialPowers.spawn(managerBrowser, [], () => {
      content.document.querySelector(".pause-clip").click();
    });
    await TestUtils.waitForCondition(
      async () => (await NirvaClipsStore.get(clip.id))?.paused,
      "the clip pause control pauses its schedule"
    );
    const pausedManualRefresh = await NirvaClips.refreshClip(clip.id, true);
    Assert.ok(
      pausedManualRefresh,
      "a paused schedule still allows manual refresh"
    );

    await SpecialPowers.spawn(managerBrowser, [], () => {
      const card = content.document.querySelector(".clip-card");
      card.querySelector(".edit-clip").click();
      card.querySelector(".edit-title").value = "Market basket price";
      card
        .querySelector(".clip-editor")
        .dispatchEvent(
          new content.Event("submit", { bubbles: true, cancelable: true })
        );
    });
    await TestUtils.waitForCondition(
      async () =>
        (await NirvaClipsStore.get(clip.id))?.title == "Market basket price",
      "the edit form saves the clip name"
    );

    // A refresh that finds new text marks the card and keeps what it said before.
    await NirvaClipsStore.recordRefresh(clip.id, {
      text: "Pears were 39 credits last week.",
      sourceTitle: "Market",
    });
    await NirvaClips.refreshClip(clip.id, true);
    const managerDoc = managerBrowser.contentDocument;
    await TestUtils.waitForCondition(
      () => !managerDoc.querySelector(".clip-card .clip-changed")?.hidden,
      "the changed mark shows"
    );
    Assert.equal(
      managerDoc.querySelector(".clip-previous-text").textContent,
      "Pears were 39 credits last week.",
      "the earlier text is kept to compare"
    );
    managerDoc.querySelector(".clip-changed").click();
    await TestUtils.waitForCondition(
      () => managerDoc.querySelector(".clip-card .clip-changed")?.hidden,
      "marking it as seen clears the mark"
    );
    Assert.equal(NirvaClips.changeFor(clip.id), null, "and forgets the change");

    // Refresh all refreshes every clip and says how many changed.
    managerDoc.getElementById("refresh-all").click();
    await TestUtils.waitForCondition(
      () =>
        managerDoc
          .getElementById("status")
          .textContent.includes("Nothing changed"),
      "refresh all reports an unchanged clip"
    );

    // New clip offers the open web page to clip from.
    managerDoc.getElementById("new-clip").click();
    Assert.ok(
      !managerDoc.getElementById("new-clip-menu").hidden,
      "the menu opens"
    );
    Assert.ok(
      [...managerDoc.querySelectorAll(".new-clip-tab")].some(
        row => row.textContent.length
      ),
      "with the open page listed"
    );
    managerDoc.getElementById("new-clip").click();
    Assert.ok(managerDoc.getElementById("new-clip-menu").hidden, "and closes");

    Assert.ok(await NirvaClipsStore.remove(clip.id), "a clip can be removed");
    Assert.equal(
      (await NirvaClipsStore.list()).length,
      0,
      "removed clips are gone"
    );
  });
});

add_task(async function test_clip_privacy_and_selector_validation() {
  Assert.equal(
    clipURL(`${TEST_PAGE}?token=secret`),
    null,
    "addresses with secret query parameters are refused"
  );
  Assert.equal(
    clipURL("file:///tmp/page.html"),
    null,
    "local files are unsupported"
  );
  Assert.equal(
    clipSelector(":has(input)"),
    null,
    "expensive selectors are refused"
  );
  Assert.equal(clipSelector("#clip-region"), "#clip-region");

  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const tab = gBrowser.getTabForBrowser(browser);
    tab.setAttribute("nirva-burner", "true");
    Assert.ok(
      !NirvaClips.canCapture(window, browser),
      "Burner tabs are excluded"
    );
    tab.removeAttribute("nirva-burner");

    const loaded = BrowserTestUtils.browserLoaded(
      browser,
      false,
      `${TEST_PAGE}?token=secret`
    );
    await BrowserTestUtils.loadURIString({
      browser,
      uriString: `${TEST_PAGE}?token=secret`,
    });
    await loaded;
    Assert.ok(
      !NirvaClips.canCapture(window, browser),
      "pages carrying secret URL parameters are excluded"
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
      !NirvaClips.canCapture(privateWindow, privateTab.linkedBrowser),
      "private browsing tabs are excluded"
    );
    const privateManager = privateWindow.gBrowser.addTrustedTab(MANAGER_URL);
    privateWindow.gBrowser.selectedTab = privateManager;
    await BrowserTestUtils.browserLoaded(
      privateManager.linkedBrowser,
      false,
      MANAGER_URL
    );
    await SpecialPowers.spawn(privateManager.linkedBrowser, [], async () => {
      await ContentTaskUtils.waitForCondition(
        () => content.document.querySelector("#private-notice:not([hidden])"),
        "the manager explains that it is unavailable in private windows"
      );
    });
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});
