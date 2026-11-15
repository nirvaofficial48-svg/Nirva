/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, info, Assert, BrowserTestUtils, EventUtils, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, TestUtils, window, document */

"use strict";

const { NirvaSplit } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/split/NirvaSplit.sys.mjs"
);
const { SplitLayout } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/split/NirvaSplitLayout.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { SessionStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
);

const PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}page.html`;

Services.prefs.setBoolPref("nirva.autohide.enabled", false);
registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.autohide.enabled");
  Services.prefs.clearUserPref("nirva.split.enabled");
  NirvaSplit.closePanel(window);
  for (const tab of gBrowser.tabs.slice(1)) {
    gBrowser.removeTab(tab);
  }
});

async function openTabs(count) {
  const tabs = [];
  for (let i = 1; i <= count; i++) {
    tabs.push(
      await BrowserTestUtils.openNewForegroundTab(gBrowser, `${PAGE}?${i}`)
    );
  }
  return tabs;
}

function closeTabs(tabs) {
  for (const tab of tabs) {
    if (tab.isConnected) {
      gBrowser.removeTab(tab);
    }
  }
}

const panelOf = tab => document.getElementById(tab.linkedPanel);
const rectOf = tab => panelOf(tab).getBoundingClientRect();
const panel = () => document.getElementById("nirva-split-panel");
const rowOf = tab =>
  [...panel().querySelectorAll(".nirva-split-row")].find(
    row => row.querySelector(".nirva-split-row-label").textContent == tab.label
  );
const rowFor = tab => rowOf(tab).querySelector(".nirva-split-row-main");
const markOf = tab => rowOf(tab).querySelector(".nirva-split-mark").textContent;
const upOf = tab => rowOf(tab).querySelector(".nirva-split-up");
const popup = () => document.getElementById("nirva-split-popup");
const opened = () =>
  TestUtils.waitForCondition(() => popup().state == "open", "panel opened");
const closed = () =>
  TestUtils.waitForCondition(() => popup().state == "closed", "panel closed");
const overlay = () => document.getElementById("nirva-split-overlay");

async function settled() {
  await new Promise(resolve =>
    window.requestAnimationFrame(() => window.requestAnimationFrame(resolve))
  );
}

/**
 * Every pane inside the content area, none overlapping, together filling it but gaps.
 *
 * @param {MozTabbrowserTab[]} tabs in pane order
 * @param {number} gap
 */
function checkTiling(tabs, gap) {
  const box = gBrowser.tabpanels.getBoundingClientRect();
  const rects = tabs.map(rectOf);
  let area = 0;
  rects.forEach((r, i) => {
    Assert.greater(r.width, 100, `pane ${i + 1} has width`);
    Assert.greater(r.height, 100, `pane ${i + 1} has height`);
    Assert.greaterOrEqual(r.left, box.left - 0.5, `pane ${i + 1} inside left`);
    Assert.greaterOrEqual(r.top, box.top - 0.5, `pane ${i + 1} inside top`);
    Assert.lessOrEqual(r.right, box.right + 0.5, `pane ${i + 1} inside right`);
    Assert.lessOrEqual(
      r.bottom,
      box.bottom + 0.5,
      `pane ${i + 1} inside bottom`
    );
    area += r.width * r.height;
    for (const other of rects.slice(i + 1)) {
      const overlaps =
        r.left < other.right - 0.5 &&
        other.left < r.right - 0.5 &&
        r.top < other.bottom - 0.5 &&
        other.top < r.bottom - 0.5;
      Assert.ok(!overlaps, `pane ${i + 1} overlaps no other pane`);
    }
  });
  Assert.less(area, box.width * box.height, "gaps are left between panes");
  Assert.greater(
    area,
    (box.width - 2 * gap) * (box.height - 2 * gap) * 0.85,
    "panes fill the content area apart from the gaps"
  );
  return rects;
}

add_task(async function test_buttons_and_pref() {
  Assert.ok(NirvaSplit.enabled, "split view layouts are on by default");
  Assert.ok(
    document.documentElement.hasAttribute("nirva-split-on"),
    "root is marked"
  );
  Assert.ok(document.getElementById("nirva-split-button"), "island button");
  const tabs = await openTabs(1);
  Assert.ok(
    tabs[0].querySelector(".nirva-split-tab-button"),
    "new tabs get the split button"
  );
  closeTabs(tabs);
});

add_task(async function test_panel_pick_four_and_open_grid() {
  const tabs = await openTabs(5);
  const [a, b, c, d, e] = tabs;
  gBrowser.selectedTab = a;

  // The hover button on tab A opens the panel beside the tab, with A ticked.
  const button = a.querySelector(".nirva-split-tab-button");
  EventUtils.synthesizeMouseAtCenter(a, { type: "mousemove" });
  await TestUtils.waitForCondition(
    () => button.getBoundingClientRect().width > 0,
    "split button shows on hover"
  );
  EventUtils.synthesizeMouseAtCenter(button, {});
  Assert.ok(NirvaSplit.isPanelOpen(window), "the panel is open");
  await opened();
  Assert.greaterOrEqual(
    panel().getBoundingClientRect().left,
    a.getBoundingClientRect().right,
    "it opens beside the tab"
  );
  Assert.equal(markOf(a), "1", "tab A is place 1");
  const open = () => panel().querySelector('[data-action="open"]');
  Assert.ok(open().disabled, "cannot open with one tab");

  for (const tab of [b, c, d]) {
    EventUtils.synthesizeMouseAtCenter(rowFor(tab), {});
  }
  Assert.equal(gBrowser.selectedTab, a, "ticking does not switch tabs");
  Assert.deepEqual(
    [a, b, c, d].map(markOf),
    ["1", "2", "3", "4"],
    "rows show their places"
  );
  Assert.ok(rowFor(e).disabled, "a fifth tab cannot be ticked");
  Assert.equal(
    panel().querySelector(".nirva-split-shape[aria-checked=true]").dataset
      .shape,
    "grid",
    "four tabs default to the grid"
  );

  EventUtils.synthesizeMouseAtCenter(open(), {});
  await settled();
  const wrapper = a.splitview;
  Assert.ok(wrapper, "a split view was made");
  Assert.equal(wrapper.tabs.length, 4, "with four tabs");
  Assert.ok(!NirvaSplit.isPanelOpen(window), "the panel closed");
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split"), "grid");
  const gap = 12;
  const [ra, rb, rc, rd] = checkTiling([a, b, c, d], gap);
  Assert.less(Math.abs(ra.top - rb.top), 1, "top row lines up");
  Assert.less(Math.abs(rc.top - rd.top), 1, "bottom row lines up");
  Assert.less(Math.abs(ra.left - rc.left), 1, "left column lines up");
  Assert.less(Math.abs(rb.left - ra.right - gap), 1, "gap between columns");
  Assert.less(Math.abs(rc.top - ra.bottom - gap), 1, "gap between rows");

  const saved = JSON.parse(SessionStore.getCustomTabValue(c, "nirva-split"));
  Assert.equal(saved.slot, 2, "pane order is kept with the session");
  Assert.equal(saved.layout.shape, "grid", "and so is the layout");

  closeTabs(tabs);
});

add_task(async function test_drag_snap_keyboard() {
  const tabs = await openTabs(2);
  const [a, b] = tabs;
  NirvaSplit.openSplit(window, [a, b]);
  await settled();
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split"), "cols");
  const before = rectOf(a).width;
  const divider = overlay().querySelector(".nirva-split-divider");
  Assert.ok(divider, "a divider is drawn");
  const d = divider.getBoundingClientRect();
  const x = d.width / 2;
  const y = d.height / 3;

  // Drag the divider 120 px to the left.
  EventUtils.synthesizeMouse(divider, x, y, { type: "mousedown" });
  EventUtils.synthesizeMouse(divider, x - 60, y, { type: "mousemove" });
  EventUtils.synthesizeMouse(divider, x - 120, y, { type: "mousemove" });
  EventUtils.synthesizeMouse(divider, x - 120, y, { type: "mouseup" });
  await settled();
  Assert.less(
    Math.abs(rectOf(a).width - (before - 120)),
    3,
    `pane 1 shrank by the drag: ${before} -> ${rectOf(a).width}`
  );
  checkTiling([a, b], 12);

  // Dropping a few pixels from the middle snaps to exactly half.
  const box = gBrowser.tabpanels.getBoundingClientRect();
  const nearMiddle = box.left + box.width / 2 + 7;
  const start = divider.getBoundingClientRect();
  EventUtils.synthesizeMouse(divider, x, y, { type: "mousedown" });
  EventUtils.synthesizeMouse(divider, nearMiddle - start.left, y, {
    type: "mousemove",
  });
  EventUtils.synthesizeMouse(divider, nearMiddle - start.left, y, {
    type: "mouseup",
  });
  await settled();
  Assert.lessOrEqual(
    Math.abs(rectOf(a).width - rectOf(b).width),
    1,
    "snapped to halves"
  );

  // Keyboard: the arrow keys move a focused divider.
  const half = rectOf(a).width;
  divider.focus();
  EventUtils.synthesizeKey("KEY_ArrowRight", {});
  await settled();
  Assert.less(Math.abs(rectOf(a).width - (half + 16)), 2, "arrow nudges 16 px");
  EventUtils.synthesizeKey("KEY_Enter", {});
  await settled();
  Assert.lessOrEqual(
    Math.abs(rectOf(a).width - rectOf(b).width),
    1,
    "Enter evens"
  );
  closeTabs(tabs);
});

add_task(async function test_tab_menu_adds_third_tab() {
  const tabs = await openTabs(3);
  const [a, b, c] = tabs;
  NirvaSplit.openSplit(window, [a, b]);
  await settled();

  // Right-click a tab: one Nirva item, none of Firefox's split items.
  const menu = document.getElementById("tabContextMenu");
  const shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");
  EventUtils.synthesizeMouseAtCenter(a, { type: "contextmenu", button: 2 });
  await shown;
  const item = document.getElementById("context_nirvaSplit");
  Assert.ok(BrowserTestUtils.isVisible(item), "Nirva's split item shows");
  for (const id of [
    "context_moveTabToSplitView",
    "context_separateSplitView",
    "context_reverseSplitView",
  ]) {
    Assert.ok(
      !BrowserTestUtils.isVisible(document.getElementById(id)),
      `Firefox's ${id} is hidden`
    );
  }
  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
  menu.activateItem(item);
  await hidden;
  await TestUtils.waitForCondition(() => NirvaSplit.isPanelOpen(window));
  await opened();

  // Every open tab is listed; the split's two are ticked; tick the third.
  Assert.deepEqual([a, b, c].map(markOf), ["1", "2", ""], "split tabs ticked");
  Assert.equal(
    panel().querySelector('[data-action="done"]') !== null,
    true,
    "nothing changed yet: Done"
  );
  EventUtils.synthesizeMouseAtCenter(rowFor(c), {});
  Assert.equal(markOf(c), "3", "the third tab takes place 3");
  EventUtils.synthesizeMouseAtCenter(
    panel().querySelector('[data-action="apply"]'),
    {}
  );
  await settled();
  Assert.equal(a.splitview?.tabs.length, 3, "the split now has three tabs");
  Assert.equal(
    gBrowser.tabpanels.getAttribute("nirva-split"),
    "main-left",
    "three tabs default to one large pane"
  );
  checkTiling([a, b, c], 12);

  // From the island button: move C up to place 2.
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("nirva-split-button"),
    {}
  );
  Assert.ok(NirvaSplit.isPanelOpen(window), "island button opens it");
  await opened();
  {
    const button = document
      .getElementById("nirva-split-button")
      .getBoundingClientRect();
    const box = panel().getBoundingClientRect();
    info(`button ${JSON.stringify(button)} panel ${JSON.stringify(box)}`);
    Assert.greaterOrEqual(box.top, button.bottom, "it opens under the button");
    Assert.less(Math.abs(box.right - button.right), 24, "right edges line up");
  }
  EventUtils.synthesizeMouseAtCenter(upOf(c), {});
  Assert.equal(markOf(c), "2", "C moved to place 2");
  EventUtils.synthesizeMouseAtCenter(
    panel().querySelector('[data-action="apply"]'),
    {}
  );
  await settled();
  const box = gBrowser.tabpanels.getBoundingClientRect();
  Assert.less(Math.abs(rectOf(c).top - box.top), 1, "C is top right now");
  Assert.greater(rectOf(c).left, rectOf(a).right, "right of the large pane");

  // Change the layout.
  NirvaSplit.openPanel(window);
  await opened();
  EventUtils.synthesizeMouseAtCenter(
    panel().querySelector('.nirva-split-shape[data-shape="cols"]'),
    {}
  );
  EventUtils.synthesizeMouseAtCenter(
    panel().querySelector('[data-action="apply"]'),
    {}
  );
  await settled();
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split"), "cols");
  checkTiling([a, c, b], 12);

  // Untick B: it leaves, two stay.
  NirvaSplit.openPanel(window);
  await opened();
  EventUtils.synthesizeMouseAtCenter(rowFor(b), {});
  EventUtils.synthesizeMouseAtCenter(
    panel().querySelector('[data-action="apply"]'),
    {}
  );
  await settled();
  Assert.ok(!b.splitview, "B left the split");
  Assert.equal(a.splitview?.tabs.length, 2, "two stay together");
  Assert.ok(
    !panelOf(b).classList.contains("split-view-panel"),
    "its page is no longer a pane"
  );
  Assert.ok(!panelOf(b).style.width, "and has no pane size");
  checkTiling([a, c], 12);

  // Escape and a click outside both close the panel without changes.
  NirvaSplit.openPanel(window);
  await opened();
  EventUtils.synthesizeKey("KEY_Escape", {});
  await closed();
  Assert.ok(!NirvaSplit.isPanelOpen(window), "Escape closes");
  NirvaSplit.openPanel(window);
  await opened();
  EventUtils.synthesizeMouseAtCenter(gBrowser.tabpanels, {});
  await closed();
  Assert.ok(!NirvaSplit.isPanelOpen(window), "a click inside a page closes");
  closeTabs(tabs);
});

add_task(async function test_footer_and_closing_one_of_three() {
  const tabs = await openTabs(3);
  const [a, b, c] = tabs;
  NirvaSplit.openSplit(window, [a, b, c]);
  gBrowser.selectedTab = a;
  await settled();

  // The menu button at the foot of another pane opens Nirva's panel.
  const footerButton = panelOf(b).querySelector(
    "split-view-footer toolbarbutton"
  );
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isVisible(footerButton),
    "footer shows in the other pane"
  );
  EventUtils.synthesizeMouseAtCenter(footerButton, {});
  await TestUtils.waitForCondition(() => NirvaSplit.isPanelOpen(window));
  await opened();
  Assert.notEqual(
    document.getElementById("split-view-menu").state,
    "open",
    "Firefox's split menu stays shut"
  );
  NirvaSplit.closePanel(window);
  await closed();

  // Closing one of three leaves a two-pane split that still shows both.
  gBrowser.removeTab(b);
  await TestUtils.waitForCondition(() => a.splitview?.tabs.length == 2);
  gBrowser.selectedTab = a;
  await settled();
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split-count"), "2");
  checkTiling([a, c], 12);
  Assert.ok(
    panelOf(c).classList.contains("split-view-panel-active"),
    "the other pane is still shown"
  );
  closeTabs(tabs);
});

add_task(async function test_multiselect_commands_and_pref() {
  const tabs = await openTabs(4);
  const [a, b, c] = tabs;
  gBrowser.selectedTab = a;
  gBrowser.addToMultiSelectedTabs(b);
  gBrowser.addToMultiSelectedTabs(c);
  NirvaSplit.startFromTab(window, a);
  await settled();
  Assert.equal(a.splitview?.tabs.length, 3, "selected tabs open at once");
  Assert.ok(!NirvaSplit.isPanelOpen(window), "without choosing");
  a.splitview.unsplitTabs();
  await settled();
  gBrowser.clearMultiSelectedTabs();

  gBrowser.selectedTab = tabs[3];
  const four = NirvaCommands.get("split-recent-4", window);
  Assert.ok(four, "the four-tab command is offered");
  four.run(window);
  await settled();
  Assert.equal(tabs[3].splitview?.tabs.length, 4, "four recent tabs split");
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split"), "grid");

  Services.prefs.setBoolPref("nirva.split.enabled", false);
  await settled();
  Assert.ok(
    !gBrowser.tabpanels.hasAttribute("nirva-split"),
    "turned off: Firefox's own layout returns"
  );
  Assert.ok(!panelOf(a).style.width, "pane sizes are removed");
  Assert.ok(NirvaCommands.get("split-on", window), "can be turned back on");
  NirvaCommands.get("split-on", window).run(window);
  await settled();
  Assert.equal(gBrowser.tabpanels.getAttribute("nirva-split"), "grid");
  NirvaCommands.get("split-separate", window).run(window);
  await settled();
  Assert.ok(!tabs[3].splitview, "separated");
  Assert.ok(!gBrowser.tabpanels.hasAttribute("nirva-split"), "layout cleared");
  closeTabs(tabs);
});

add_task(function test_saved_layout_round_trip() {
  const layout = new SplitLayout(3, "main-top");
  const metrics = { width: 1000, height: 700, gap: 12 };
  layout.moveDivider(":0", 250, metrics);
  const again = SplitLayout.fromJSON(JSON.parse(JSON.stringify(layout)), 3);
  Assert.deepEqual(
    again.compute(metrics).panes,
    layout.compute(metrics).panes,
    "a saved layout comes back the same"
  );
  Assert.equal(
    SplitLayout.fromJSON(layout.toJSON(), 4).shape,
    "main-top",
    "a shape that also fits the new count is kept"
  );
  Assert.equal(
    SplitLayout.fromJSON(layout.toJSON(), 2).shape,
    "cols",
    "otherwise the default for the new count is used"
  );
});
