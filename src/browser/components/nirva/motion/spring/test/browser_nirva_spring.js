/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, gBrowser, registerCleanupFunction, Services */

"use strict";

const { NirvaSpring } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/spring/NirvaSpring.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.springphysics.enabled");
  NirvaSpring.applyToWindow(window);
});

add_task(async function test_spring_physics_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.springphysics.enabled", true);
  NirvaSpring.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-spring-physics"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaSpring.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.springphysics.enabled", false);
  NirvaSpring.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-spring-physics"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaSpring.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.springphysics.enabled");
  NirvaSpring.applyToWindow(window);
});

add_task(async function test_spring_physics_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-spring-physics-toggle"
  );
  Assert.ok(cmd, "Toggle Spring Physics command is registered");

  const initial = NirvaSpring.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaSpring.enabled,
    !initial,
    "Running the command toggles Spring Physics"
  );
  cmd.run(window);
  Assert.equal(
    NirvaSpring.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_spring_physics_lite_mode() {
  const root = document.documentElement;
  root.setAttribute("data-nirva-lite", "true");
  Services.prefs.setBoolPref("nirva.springphysics.enabled", true);
  NirvaSpring.applyToWindow(window);

  Assert.equal(
    root.getAttribute("data-nirva-spring-physics"),
    "true",
    "Spring physics is enabled under lite mode"
  );
  root.removeAttribute("data-nirva-lite");
});

add_task(async function test_spring_physics_tab_drag_attributes() {
  const tabs = document.getElementById("tabbrowser-tabs");
  const tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  Services.prefs.setBoolPref("nirva.springphysics.enabled", true);
  NirvaSpring.applyToWindow(window);

  tabs.setAttribute("movingtab", "true");
  tab.setAttribute("dragtarget", "true");
  Assert.ok(tabs.hasAttribute("movingtab"), "movingtab is set on tabstrip");
  Assert.ok(tab.hasAttribute("dragtarget"), "dragtarget is set on tab");

  tabs.removeAttribute("movingtab");
  tab.removeAttribute("dragtarget");
  BrowserTestUtils.removeTab(tab);
});
