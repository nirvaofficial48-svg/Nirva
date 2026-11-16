/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, SpecialPowers */

"use strict";

// What a web page itself experiences under each trust step, not only what is stored.

const { NirvaTrust } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs"
);

const PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}page.html`;

registerCleanupFunction(() => Services.perms.removeAll());

function pageSees(browser) {
  return SpecialPowers.spawn(browser, [], async () => {
    const query = async name =>
      (await content.navigator.permissions.query({ name })).state;
    return {
      geolocation: await query("geolocation"),
      notifications: content.Notification.permission,
    };
  });
}

add_task(async function test_strict_really_blocks_and_balanced_releases() {
  await BrowserTestUtils.withNewTab(PAGE, async browser => {
    const before = await pageSees(browser);
    Assert.equal(
      before.geolocation,
      "prompt",
      "balanced: the site must ask for location"
    );
    Assert.equal(
      before.notifications,
      "default",
      "balanced: the site must ask to notify"
    );

    NirvaTrust.setLevel(browser, "strict");
    const strict = await pageSees(browser);
    Assert.equal(
      strict.geolocation,
      "denied",
      "strict: the page is refused location"
    );
    Assert.equal(
      strict.notifications,
      "denied",
      "strict: the page is refused notifications"
    );

    NirvaTrust.setLevel(browser, "balanced");
    const after = await pageSees(browser);
    Assert.equal(after.geolocation, "prompt", "back to balanced: asks again");
  });
});

add_task(
  async function test_trusted_turns_tracking_protection_off_for_the_site() {
    await BrowserTestUtils.withNewTab(PAGE, async browser => {
      const loaded = BrowserTestUtils.browserLoaded(browser);
      NirvaTrust.setLevel(browser, "trusted");
      await loaded;
      const cjs = browser.browsingContext.currentWindowGlobal.cookieJarSettings;
      Assert.ok(
        cjs?.isOnContentBlockingAllowList ??
          browser.browsingContext.currentWindowGlobal
            .contentBlockingAllowListPrincipal,
        "trusted: the page loads with protection relaxed for this site"
      );
      const loaded2 = BrowserTestUtils.browserLoaded(browser);
      NirvaTrust.setLevel(browser, "balanced");
      await loaded2;
    });
  }
);
