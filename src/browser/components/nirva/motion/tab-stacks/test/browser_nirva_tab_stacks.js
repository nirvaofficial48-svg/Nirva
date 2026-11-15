/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, registerCleanupFunction, Services */

"use strict";

const { NirvaTabStacks } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/tab-stacks/NirvaTabStacks.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.tabstacks.enabled");
  NirvaTabStacks.applyToWindow(window);
});

add_task(async function test_tab_stacks_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.tabstacks.enabled", true);
  NirvaTabStacks.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-tab-stacks"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaTabStacks.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.tabstacks.enabled", false);
  NirvaTabStacks.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-tab-stacks"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaTabStacks.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.tabstacks.enabled");
  NirvaTabStacks.applyToWindow(window);
});

add_task(async function test_tab_stacks_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-tab-stacks-toggle"
  );
  Assert.ok(cmd, "Toggle Tab Stacks Fan command is registered");

  const initial = NirvaTabStacks.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaTabStacks.enabled,
    !initial,
    "Running the command toggles Tab Stacks Fan"
  );
  cmd.run(window);
  Assert.equal(
    NirvaTabStacks.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_tab_stacks_lite_mode() {
  const root = document.documentElement;
  root.setAttribute("data-nirva-lite", "true");
  Services.prefs.setBoolPref("nirva.tabstacks.enabled", true);
  NirvaTabStacks.applyToWindow(window);

  Assert.equal(
    root.getAttribute("data-nirva-tab-stacks"),
    "true",
    "Tab stacks is enabled under lite mode"
  );
  root.removeAttribute("data-nirva-lite");
});
