/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, TestUtils */

"use strict";

const OLD_NAMES = /firefox|nightly|mozilla/i;

add_task(async function test_app_identity() {
  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );

  // Artifact builds keep Firefox's prebuilt appinfo values. Check the configured
  // display name in every build, and runtime identity when it is compiled here.
  Assert.equal(
    AppConstants.MOZ_APP_DISPLAYNAME_DO_NOT_USE,
    "Nirva",
    "configured application display name"
  );
  if (AppConstants.MOZ_APP_NAME !== "firefox") {
    Assert.equal(Services.appinfo.name, "Nirva", "runtime application name");
    Assert.equal(Services.appinfo.vendor, "Nirva", "runtime vendor name");
  }

  const bundle = Services.strings.createBundle(
    "chrome://branding/locale/brand.properties"
  );
  for (const key of ["brandShorterName", "brandShortName", "brandFullName"]) {
    Assert.equal(bundle.GetStringFromName(key), "Nirva", key);
  }
});

add_task(async function test_window_title() {
  await BrowserTestUtils.withNewTab("about:blank", async () => {
    await TestUtils.waitForCondition(
      () => document.title.includes("Nirva"),
      "window title shows the Nirva name"
    );
    Assert.ok(!OLD_NAMES.test(document.title), `title: ${document.title}`);
  });
});

add_task(async function test_icon_is_the_nirva_icon() {
  const img = new Image();
  img.src = "chrome://branding/content/icon64.png";
  await img.decode();
  const canvas = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "canvas"
  );
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const pixel = (x, y) => Array.from(ctx.getImageData(x, y, 1, 1).data);
  Assert.equal(pixel(0, 0)[3], 0, "the corner is outside the rounded square");
  Assert.deepEqual(pixel(32, 4), [0x14, 0x18, 0x1d, 255], "dark ground");
  Assert.deepEqual(pixel(20, 32), [0xf2, 0xf1, 0xee, 255], "light left stem");
  Assert.deepEqual(pixel(43, 40), [0xf2, 0xf1, 0xee, 255], "light right stem");
});

add_task(async function test_about_dialog_has_no_old_names() {
  const win = window.openDialog(
    "chrome://browser/content/aboutDialog.xhtml",
    "",
    "chrome,centerscreen"
  );
  await BrowserTestUtils.waitForEvent(win, "load");
  await win.document.l10n.ready;
  await win.document.l10n.translateRoots();
  const visibleText = [];
  for (const el of win.document.querySelectorAll("label, description, span")) {
    if (el.checkVisibility() && el.textContent.trim()) {
      visibleText.push(el.textContent.trim());
    }
  }
  Assert.greater(visibleText.length, 0, "the dialog shows some text");
  for (const text of visibleText) {
    Assert.ok(!OLD_NAMES.test(text), `about dialog text: "${text}"`);
  }
  const logo = win.getComputedStyle(win.document.getElementById("leftBox"));
  Assert.ok(
    logo.backgroundImage.includes("chrome://branding/content/about-logo"),
    "the dialog shows the branding logo"
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_user_agent_stays_firefox_compatible() {
  const ua = Cc["@mozilla.org/network/protocol;1?name=http"].getService(
    Ci.nsIHttpProtocolHandler
  ).userAgent;
  Assert.ok(/ Firefox\/\d+\.0$/.test(ua), `user agent: ${ua}`);
  Assert.ok(!/nirva/i.test(ua), "the user agent does not name Nirva");
});
