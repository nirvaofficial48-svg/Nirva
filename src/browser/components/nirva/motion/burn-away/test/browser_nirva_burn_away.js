/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, CustomEvent, gBrowser, registerCleanupFunction, Services */

"use strict";

const { NirvaBurnAway } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/burn-away/NirvaBurnAway.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.burnaway.enabled");
  NirvaBurnAway.applyToWindow(window);
});

add_task(async function test_burn_away_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.burnaway.enabled", true);
  NirvaBurnAway.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-burn-away"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaBurnAway.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.burnaway.enabled", false);
  NirvaBurnAway.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-burn-away"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaBurnAway.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.burnaway.enabled");
  NirvaBurnAway.applyToWindow(window);
});

add_task(async function test_burn_away_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-burn-away-toggle"
  );
  Assert.ok(cmd, "Toggle Burn-Away Close command is registered");

  const initial = NirvaBurnAway.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaBurnAway.enabled,
    !initial,
    "Running the command toggles Burn-Away Close"
  );
  cmd.run(window);
  Assert.equal(
    NirvaBurnAway.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_burn_away_tab_close_marking() {
  const tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  tab.setAttribute("nirva-burner", "true");
  Services.prefs.setBoolPref("nirva.burnaway.enabled", true);
  NirvaBurnAway.applyToWindow(window);

  tab.dispatchEvent(new CustomEvent("TabClose", { bubbles: true }));
  Assert.equal(
    tab.getAttribute("nirva-burn-away"),
    "closing",
    "Burner tab receives closing attribute on TabClose"
  );
  BrowserTestUtils.removeTab(tab);
});
