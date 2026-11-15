/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, CustomEvent, gBrowser, registerCleanupFunction, Services */

"use strict";

const { NirvaPageTransitions } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/page-transitions/NirvaPageTransitions.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.pagetransitions.enabled");
  NirvaPageTransitions.applyToWindow(window);
});

add_task(async function test_page_transitions_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.pagetransitions.enabled", true);
  NirvaPageTransitions.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-page-transitions"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaPageTransitions.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.pagetransitions.enabled", false);
  NirvaPageTransitions.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-page-transitions"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaPageTransitions.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.pagetransitions.enabled");
  NirvaPageTransitions.applyToWindow(window);
});

add_task(async function test_page_transitions_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-page-transitions-toggle"
  );
  Assert.ok(cmd, "Toggle Page Transitions command is registered");

  const initial = NirvaPageTransitions.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaPageTransitions.enabled,
    !initial,
    "Running the command toggles Page Transitions"
  );
  cmd.run(window);
  Assert.equal(
    NirvaPageTransitions.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_page_transitions_loading() {
  const root = document.documentElement;
  Services.prefs.setBoolPref("nirva.pagetransitions.enabled", true);
  NirvaPageTransitions.applyToWindow(window);

  NirvaPageTransitions.setLoading(window, true);
  Assert.equal(
    root.getAttribute("data-nirva-page-loading"),
    "true",
    "Loading attribute is applied"
  );

  NirvaPageTransitions.setLoading(window, false);
  Assert.ok(
    !root.hasAttribute("data-nirva-page-loading"),
    "Loading attribute is removed"
  );
});

add_task(async function test_page_transitions_island_loading_integration() {
  const root = document.documentElement;
  Services.prefs.setBoolPref("nirva.pagetransitions.enabled", true);
  NirvaPageTransitions.applyToWindow(window);

  root.setAttribute("nirva-island-loading", "true");
  Assert.ok(
    root.hasAttribute("nirva-island-loading"),
    "Root has nirva-island-loading active during page loads"
  );
  root.removeAttribute("nirva-island-loading");
});
