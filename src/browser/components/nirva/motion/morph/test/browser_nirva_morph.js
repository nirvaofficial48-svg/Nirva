/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, CustomEvent, gBrowser, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaMorph } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/morph/NirvaMorph.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.morph.enabled");
  NirvaMorph.applyToWindow(window);
});

add_task(async function test_morph_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.morph.enabled", true);
  NirvaMorph.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-morph"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaMorph.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.morph.enabled", false);
  NirvaMorph.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-morph"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaMorph.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.morph.enabled");
  NirvaMorph.applyToWindow(window);
});

add_task(async function test_morph_tab_events() {
  Services.prefs.setBoolPref("nirva.morph.enabled", true);
  NirvaMorph.applyToWindow(window);

  const tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  Assert.equal(
    tab.getAttribute("nirva-morph"),
    "opening",
    "New tab gets opening morph attribute"
  );

  await TestUtils.waitForCondition(
    () => !tab.hasAttribute("nirva-morph"),
    "Opening morph attribute is cleared after animation"
  );

  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_morph_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-morph-toggle"
  );
  Assert.ok(cmd, "Toggle Link-to-Tab Morph command is registered");

  const initial = NirvaMorph.enabled;
  cmd.run(window);
  Assert.equal(NirvaMorph.enabled, !initial, "Running command toggles morph");
  cmd.run(window);
  Assert.equal(
    NirvaMorph.enabled,
    initial,
    "Running command again restores state"
  );
});

add_task(async function test_morph_closing_event() {
  Services.prefs.setBoolPref("nirva.morph.enabled", true);
  NirvaMorph.applyToWindow(window);

  const tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  tab.dispatchEvent(new CustomEvent("TabClose", { bubbles: true }));
  Assert.equal(
    tab.getAttribute("nirva-morph"),
    "closing",
    "Closing morph attribute is set on TabClose"
  );
  BrowserTestUtils.removeTab(tab);
});
