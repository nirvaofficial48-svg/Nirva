/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, EventUtils, gBrowser, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const root = document.documentElement;
const container = document.getElementById("sidebar-container");
const shown = () => root.hasAttribute("nirva-sidebar-shown");
const onScreen = () => {
  const box = container.getBoundingClientRect();
  return box.left >= -1 && box.right > 100;
};

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.autohide.enabled");
  root.removeAttribute("nirva-sidebar-shown");
});

add_task(async function test_the_page_fills_the_window() {
  Services.prefs.setBoolPref("nirva.autohide.enabled", true);
  Assert.ok(root.hasAttribute("nirva-sidebar-autohide"), "hiding is on");
  const tabbox = document
    .getElementById("tabbrowser-tabbox")
    .getBoundingClientRect();
  Assert.lessOrEqual(tabbox.left, 0, "the page starts at the window's edge");
  Assert.greaterOrEqual(
    Math.round(tabbox.right),
    window.innerWidth,
    "and reaches the other edge"
  );
  Assert.ok(!shown(), "the sidebar starts out of sight");
  Assert.equal(getComputedStyle(container).opacity, "0", "it is not drawn");
});

add_task(async function test_the_edge_slides_the_sidebar_in_and_out() {
  const edge = document.getElementById("nirva-sidebar-edge");
  Assert.greater(edge.getBoundingClientRect().width, 0, "the edge is there");
  EventUtils.synthesizeMouseAtCenter(edge, { type: "mousemove" });
  await TestUtils.waitForCondition(shown, "the pointer at the edge opens it");
  await TestUtils.waitForCondition(onScreen, "it slides onto the screen");
  Assert.equal(edge.getBoundingClientRect().width, 0, "the edge steps aside");

  const tab = document.querySelector(".tabbrowser-tab[selected]");
  EventUtils.synthesizeMouseAtCenter(tab, { type: "mousemove" });
  // Longer than the sidebar waits before it slides away.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  Assert.ok(shown(), "it stays while the pointer is on it");

  EventUtils.synthesizeMouse(
    document.getElementById("tabbrowser-tabbox"),
    window.innerWidth / 2,
    window.innerHeight / 2,
    { type: "mousemove" }
  );
  await TestUtils.waitForCondition(
    () => !shown(),
    "it leaves with the pointer"
  );
});

add_task(async function test_the_foot_opens_a_burner_tab() {
  const button = document.getElementById("nirva-burner-button");
  Assert.ok(button, "the sidebar foot has a burner button");
  const before = gBrowser.tabs.length;
  button.click();
  await TestUtils.waitForCondition(
    () => gBrowser.tabs.length == before + 1,
    "a tab opens"
  );
  const tab = gBrowser.selectedTab;
  Assert.ok(tab.hasAttribute("nirva-burner"), "and it is a burner tab");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_the_command_bar_pins_the_sidebar() {
  const off = NirvaCommands.get("sidebar-autohide-off", window);
  Assert.ok(off, "the command bar offers to always show the sidebar");
  off.run(window);
  Assert.ok(!root.hasAttribute("nirva-sidebar-autohide"), "hiding is off");
  Assert.ok(onScreen(), "the sidebar is in place");
  Assert.ok(
    !NirvaCommands.get("sidebar-autohide-off", window),
    "only the opposite command is offered now"
  );
  NirvaCommands.get("sidebar-autohide-on", window).run(window);
  Assert.ok(root.hasAttribute("nirva-sidebar-autohide"), "and back on");
});

add_task(async function test_full_screen_keeps_the_sidebar_usable() {
  Services.prefs.setBoolPref("nirva.autohide.enabled", true);
  const onFullscreen = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onFullscreen;
  await TestUtils.waitForCondition(
    () => root.hasAttribute("fullscreenNavToolboxHidden"),
    "Firefox folds its toolbar away in full screen"
  );
  const island = document
    .getElementById("navigator-toolbox")
    .getBoundingClientRect();
  Assert.greaterOrEqual(island.top, 0, "the island stays on the screen");

  const edge = document.getElementById("nirva-sidebar-edge");
  EventUtils.synthesizeMouseAtCenter(edge, { type: "mousemove" });
  await TestUtils.waitForCondition(shown, "the edge opens the sidebar");
  await TestUtils.waitForCondition(
    onScreen,
    "it slides in at full width in full screen"
  );
  Assert.greater(
    document.querySelector("sidebar-main").getBoundingClientRect().width,
    100,
    "its tabs and buttons are drawn"
  );
  root.removeAttribute("nirva-sidebar-shown");

  Services.prefs.setBoolPref("nirva.autohide.enabled", false);
  await TestUtils.waitForCondition(
    onScreen,
    "a pinned sidebar stays in place in full screen"
  );
  Services.prefs.setBoolPref("nirva.autohide.enabled", true);

  const onExit = BrowserTestUtils.waitForEvent(window, "fullscreen");
  document.getElementById("View:FullScreen").doCommand();
  await onExit;
});
