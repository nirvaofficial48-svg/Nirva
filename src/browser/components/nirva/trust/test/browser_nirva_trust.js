/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, Ci, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, window */

"use strict";

const { NirvaTrust } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs"
);
const { NirvaReceipt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { ContentBlockingAllowList } = ChromeUtils.importESModule(
  "resource://gre/modules/ContentBlockingAllowList.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}page.html`;
const { UNKNOWN_ACTION, DENY_ACTION, ALLOW_ACTION } = Services.perms;

function stored(browser, type) {
  return Services.perms.testExactPermissionFromPrincipal(
    browser.contentPrincipal,
    type
  );
}

registerCleanupFunction(() => {
  Services.perms.removeAll();
  Services.prefs.clearUserPref("nirva.trust.enabled");
});

add_task(async function test_each_step_is_made_of_real_controls() {
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    Assert.ok(NirvaTrust.canUse(browser), "a website has a trust dial");
    Assert.equal(NirvaTrust.levelFor(browser), "balanced", "sites start here");

    NirvaTrust.setLevel(browser, "strict");
    Assert.equal(
      stored(browser, "cookie"),
      Ci.nsICookiePermission.ACCESS_SESSION,
      "Strict keeps the site's cookies only until the browser closes"
    );
    Assert.equal(
      stored(browser, "autoplay-media"),
      Ci.nsIAutoplay.BLOCKED_ALL,
      "Strict stops media starting by itself"
    );
    for (const type of [
      "geo",
      "camera",
      "microphone",
      "desktop-notification",
    ]) {
      Assert.equal(stored(browser, type), DENY_ACTION, `Strict blocks ${type}`);
    }
    Assert.equal(
      NirvaTrust.levelFor(browser),
      "strict",
      "the dial reads Strict"
    );
    Assert.ok(
      !ContentBlockingAllowList.includes(browser),
      "tracking protection stays on"
    );

    NirvaTrust.cyclePermission(browser, "geo");
    Assert.equal(
      stored(browser, "geo"),
      UNKNOWN_ACTION,
      "one permission can be changed by itself"
    );
    Assert.equal(
      NirvaTrust.levelFor(browser),
      "balanced",
      "the dial then no longer claims Strict"
    );
    NirvaTrust.cyclePermission(browser, "geo");
    Assert.equal(stored(browser, "geo"), ALLOW_ACTION, "and changed again");
    Assert.equal(
      stored(browser, "camera"),
      DENY_ACTION,
      "the other choices stay as they were"
    );

    NirvaTrust.setLevel(browser, "strict");
    let reloaded = BrowserTestUtils.browserLoaded(browser, false, TEST_PAGE);
    NirvaTrust.setLevel(browser, "trusted");
    await reloaded;
    Assert.ok(
      ContentBlockingAllowList.includes(browser),
      "Trusted switches tracking protection off for this site"
    );
    Assert.equal(stored(browser, "cookie"), UNKNOWN_ACTION, "and lifts Strict");
    Assert.equal(stored(browser, "camera"), UNKNOWN_ACTION, "for every part");
    Assert.equal(NirvaTrust.levelFor(browser), "trusted", "the dial reads it");

    reloaded = BrowserTestUtils.browserLoaded(browser, false, TEST_PAGE);
    NirvaTrust.setLevel(browser, "balanced");
    await reloaded;
    Assert.ok(
      !ContentBlockingAllowList.includes(browser),
      "Balanced switches tracking protection back on"
    );
    Assert.equal(NirvaTrust.levelFor(browser), "balanced", "the dial reads it");
  });
});

add_task(async function test_the_dial_in_the_receipt_panel() {
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    NirvaReceipt.update(window);
    const section = document.querySelector("#nirva-receipt-panel .nirva-trust");
    await document.l10n.translateFragment(section);
    Assert.ok(section && !section.hidden, "the panel has the dial");
    const dial = section.querySelector(".nirva-trust-dial");
    Assert.equal(dial.value, "1", "it starts in the middle");
    Assert.ok(
      !section.textContent.match(/\d/),
      "it shows no number or score of any kind"
    );

    dial.value = 0;
    dial.dispatchEvent(new Event("change"));
    Assert.equal(
      NirvaTrust.levelFor(browser),
      "strict",
      "moving it left works"
    );
    Assert.equal(
      section.querySelector(".nirva-trust-steps [data-current]").dataset.level,
      "strict",
      "the step under it is marked"
    );
    Assert.equal(
      section.querySelector(".nirva-trust-note").dataset.l10nId,
      "nirva-trust-note-strict",
      "the note says what Strict does and may break"
    );

    const list = section.querySelector(".nirva-trust-permissions");
    Assert.ok(list.hidden, "the permission list starts closed");
    section.querySelector(".nirva-trust-toggle").click();
    Assert.ok(!list.hidden, "and opens");
    Assert.equal(list.children.length, 6, "it lists six permissions");
    const camera = list.querySelector('[data-id="camera"]');
    Assert.ok(
      camera.textContent.trim().length > 3,
      "each row has the browser's own name and state"
    );
    camera.click();
    Assert.notEqual(
      stored(browser, "camera"),
      DENY_ACTION,
      "selecting a row changes that permission"
    );
    Assert.equal(dial.value, "1", "and the dial moves off Strict");

    Services.perms.removeAll();
  });
});

add_task(async function test_boundaries_and_commands() {
  await BrowserTestUtils.withNewTab("about:blank", async browser => {
    Assert.ok(!NirvaTrust.canUse(browser), "only websites have a dial");
    Assert.ok(!NirvaTrust.setLevel(browser, "strict"), "so nothing is set");
  });
  await BrowserTestUtils.withNewTab(TEST_PAGE, async browser => {
    const ids = () =>
      NirvaCommands.all(window)
        .filter(command => command.feature == "trust")
        .map(command => command.id);
    Assert.deepEqual(
      ids().sort(),
      ["trust-strict", "trust-trusted"],
      "the command bar offers the two other steps"
    );
    NirvaCommands.all(window)
      .find(command => command.id == "trust-strict")
      .run(window);
    Assert.equal(NirvaTrust.levelFor(browser), "strict", "a command sets it");
    Services.perms.removeAll();

    Services.prefs.setBoolPref("nirva.trust.enabled", false);
    Assert.ok(!NirvaTrust.canUse(browser), "the switch turns the dial off");
    NirvaReceipt.update(window);
    Assert.ok(
      document.querySelector("#nirva-receipt-panel .nirva-trust").hidden,
      "and hides it in the panel"
    );
    Services.prefs.setBoolPref("nirva.trust.enabled", true);
  });
  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    await BrowserTestUtils.withNewTab(
      { gBrowser: privateWindow.gBrowser, url: TEST_PAGE },
      async browser => {
        Assert.ok(
          !NirvaTrust.canUse(browser),
          "private windows keep nothing, so they have no dial"
        );
      }
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});
