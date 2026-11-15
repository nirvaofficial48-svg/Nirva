/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, gBrowser, registerCleanupFunction, Services, TestUtils */

"use strict";

// These checks are about the sidebar in place; hiding it at the edge has its own test.
Services.prefs.setBoolPref("nirva.autohide.enabled", false);
registerCleanupFunction(() =>
  Services.prefs.clearUserPref("nirva.autohide.enabled")
);

const SIDEBAR_WIDTH = 244;
const RAIL_WIDTH = 52;
const HIT = 44;

function rect(selector) {
  return document.querySelector(selector).getBoundingClientRect();
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.sidebar.enabled");
});

add_task(async function test_tabs_are_in_the_sidebar() {
  Assert.ok(
    document.documentElement.hasAttribute("nirva-sidebar"),
    "the Nirva sidebar is on"
  );
  Assert.equal(
    gBrowser.tabContainer.getAttribute("orient"),
    "vertical",
    "tabs are vertical"
  );
  const sidebar = rect("sidebar-main");
  await TestUtils.waitForCondition(
    () => Math.round(rect("sidebar-main").width) == SIDEBAR_WIDTH,
    "the sidebar takes its width from the tokens"
  );
  Assert.equal(sidebar.x, 0, "it is on the left");
  Assert.less(
    rect("#nirva-workspaces").bottom,
    rect("#tabbrowser-tabs").top + 1,
    "the workspace switcher sits above the tabs"
  );
});

add_task(async function test_rows_are_full_size_targets() {
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const rowHeight = () =>
    tab.querySelector(".tab-background").getBoundingClientRect().height;
  // The row grows in with the tab-open animation; measure it once it has settled.
  await TestUtils.waitForCondition(
    () => rowHeight() >= HIT,
    "a tab row is at least 44 px high once it has opened"
  );
  Assert.greaterOrEqual(rowHeight(), HIT, "a tab row is at least 44 px high");
  Assert.greaterOrEqual(
    rect(".nirva-workspace").height,
    HIT,
    "workspace: height"
  );
  Assert.greaterOrEqual(
    rect(".nirva-workspace").width,
    HIT,
    "workspace: width"
  );
  Assert.greaterOrEqual(rect("#tabs-newtab-button").height, HIT, "New tab");
  Assert.equal(
    getComputedStyle(tab.querySelector(".tab-label")).fontWeight,
    "500",
    "the active tab's title is medium weight"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_new_tab_is_at_the_foot() {
  const sidebar = rect("sidebar-main");
  const button = rect("#tabs-newtab-button");
  Assert.less(
    sidebar.bottom - button.bottom,
    32 + HIT,
    "New tab is at the bottom, above only the time travel and burner row"
  );
  const before = gBrowser.tabs.length;
  document.getElementById("tabs-newtab-button").click();
  await TestUtils.waitForCondition(() => gBrowser.tabs.length == before + 1);
  Assert.ok(true, "and it opens a tab");
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_asleep_tabs_are_labelled() {
  // Only tabs showing a website can sleep, so use the test web server.
  const tab = BrowserTestUtils.addTab(gBrowser, "https://example.com/");
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  const content = tab.querySelector(".tab-content");
  Assert.equal(
    getComputedStyle(content, "::after").content,
    "none",
    "an awake tab has no label"
  );
  gBrowser.discardBrowser(tab, { forceDiscard: true });
  await TestUtils.waitForCondition(
    () => tab.hasAttribute("pending"),
    "the tab is asleep"
  );
  Assert.equal(
    getComputedStyle(content, "::after").content,
    '"Asleep"',
    "a sleeping tab is labelled Asleep"
  );
  Assert.equal(
    getComputedStyle(content, "::after").textTransform,
    "uppercase",
    "in small capitals"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_firefox_launcher_buttons_are_not_shown() {
  const shadow = document.querySelector("sidebar-main").shadowRoot;
  await TestUtils.waitForCondition(() => {
    const wrapper = shadow.querySelector(".buttons-wrapper");
    return wrapper && getComputedStyle(wrapper).display == "none";
  }, "Firefox's launcher buttons are hidden");
  Assert.ok(true, "hidden");
});

add_task(async function test_collapsing_to_the_rail_and_back() {
  const button = document.getElementById("sidebar-button");
  button.click();
  await TestUtils.waitForCondition(
    () => Math.round(rect("sidebar-main").width) == RAIL_WIDTH,
    "the sidebar collapses to the icon rail"
  );
  Assert.equal(
    getComputedStyle(
      document.querySelector(".nirva-workspace > span"),
      "::before"
    ).content,
    '"H"',
    "the rail shows the workspace's first letter"
  );
  button.click();
  await TestUtils.waitForCondition(
    () => Math.round(rect("sidebar-main").width) == SIDEBAR_WIDTH,
    "and expands again"
  );
});

add_task(async function test_switching_the_sidebar_styling_off() {
  Services.prefs.setBoolPref("nirva.sidebar.enabled", false);
  Assert.ok(
    !document.documentElement.hasAttribute("nirva-sidebar"),
    "the attribute is removed"
  );
  Assert.ok(
    document.getElementById("nirva-workspaces").hidden,
    "the switcher is hidden"
  );
  Services.prefs.setBoolPref("nirva.sidebar.enabled", true);
  Assert.ok(document.documentElement.hasAttribute("nirva-sidebar"), "and back");
});

add_task(async function test_many_tabs_shrink_then_scroll_under_the_foot() {
  const tabs = document.getElementById("tabbrowser-tabs");
  const opened = [];
  while (!tabs.hasAttribute("nirva-squeezed") && opened.length < 60) {
    opened.push(
      BrowserTestUtils.addTab(gBrowser, "about:robots", { skipAnimation: true })
    );
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  Assert.ok(tabs.hasAttribute("nirva-squeezed"), "rows shrink once tabs crowd");
  await TestUtils.waitForCondition(
    () =>
      Math.round(
        gBrowser.selectedTab
          .querySelector(".tab-background")
          .getBoundingClientRect().height
      ) == 34,
    "to 34 px"
  );
  // More tabs than fit even when shrunk: the list now scrolls.
  while (!tabs.hasAttribute("overflow") && opened.length < 120) {
    opened.push(
      BrowserTestUtils.addTab(gBrowser, "about:robots", { skipAnimation: true })
    );
    await new Promise(resolve => requestAnimationFrame(resolve));
  }
  await TestUtils.waitForCondition(
    () =>
      document
        .querySelector("#vertical-tabs-newtab-button .toolbarbutton-icon")
        .getBoundingClientRect().width,
    "Firefox's own new-tab button shows below the list"
  );
  const column = gBrowser.selectedTab
    .querySelector(".tab-icon-stack")
    .getBoundingClientRect();
  for (const icon of [
    "#vertical-tabs-newtab-button .toolbarbutton-icon",
    "#nirva-burner-button svg",
  ]) {
    Assert.less(
      Math.abs(
        document.querySelector(icon).getBoundingClientRect().left - column.left
      ),
      1,
      `${icon} lines up with the tab icons`
    );
  }
  const list = document
    .getElementById("tabbrowser-arrowscrollbox")
    .getBoundingClientRect();
  for (const id of ["nirva-timetravel-button", "nirva-burner-button"]) {
    const button = document.getElementById(id);
    Assert.ok(
      !button.closest("#tabbrowser-arrowscrollbox"),
      `${id} is not inside the scrolling list`
    );
    Assert.greaterOrEqual(
      Math.round(button.getBoundingClientRect().top),
      Math.round(list.bottom),
      `${id} sits below it, so tabs never run under it`
    );
  }
  for (const tab of opened) {
    BrowserTestUtils.removeTab(tab);
  }
  await TestUtils.waitForCondition(
    () => !tabs.hasAttribute("nirva-squeezed"),
    "with fewer tabs the rows grow back"
  );
});
