/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, EventUtils, gBrowser, info, PlacesUtils, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { NirvaCommandBar } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommandBar.sys.mjs"
);
const { NirvaWorkspaces } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
);

const { PlacesTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PlacesTestUtils.sys.mjs"
);

const bar = document.getElementById("nirva-commandbar");
const input = document.getElementById("nirva-commandbar-input");
const list = document.getElementById("nirva-commandbar-results");

function rows() {
  return [...list.querySelectorAll("li[data-index]")].map(li => ({
    kind: li.dataset.kind,
    title: li.querySelector(".nirva-result-title").textContent,
    detail: li.querySelector(".nirva-result-detail")?.textContent ?? "",
    selected: li.getAttribute("aria-selected") == "true",
  }));
}

async function type(text) {
  input.value = text;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  // Results from bookmarks and history arrive a moment after the instant ones.
  const { results } = await NirvaCommandBar.search(window, text);
  await TestUtils.waitForCondition(
    () => rows().length == results.length,
    `results for "${text}" are shown`
  );
  return rows();
}

function pressCtrlK() {
  EventUtils.synthesizeKey("k", { accelKey: true });
}

registerCleanupFunction(async () => {
  NirvaCommandBar.close(window);
  for (const pref of [
    "nirva.look",
    "nirva.mode",
    "nirva.commandbar.enabled",
    "nirva.workspaces.list",
  ]) {
    Services.prefs.clearUserPref(pref);
  }
  await PlacesUtils.bookmarks.eraseEverything();
  await PlacesUtils.history.clear();
});

add_task(async function test_every_feature_has_commands() {
  const byFeature = Map.groupBy(NirvaCommands.all(window), c => c.feature);
  for (const feature of [
    "browser",
    "privacy",
    "looks",
    "motion",
    "sidebar",
    "workspaces",
    "island",
    "welcome",
    // NIRVA: Theme Studio contributes commands to the feature command bar.
    "theme",
    // NIRVA: Time Travel contributes its timeline command to the bar.
    "time-travel",
    // NIRVA: Read-Everything Search is available from the command bar.
    "read-search",
    // NIRVA: Live Clips can be managed or captured from supported pages.
    "live-clips",
    // NIRVA: The Personal Web Library opens and saves from the command bar.
    "library",
    // NIRVA: Page Remix adjusts sites and hides page elements.
    "remix",
    // NIRVA: The Privacy Receipt shows what protection recorded.
    "receipt",
    // NIRVA: Burner tabs are temporary and erase their data on close.
    "burner",
    // NIRVA: The home screen can be opened and edited from the command bar.
    "home",
    // NIRVA: Tab rules can be opened and paused from the command bar.
    "tabrules",
    // NIRVA: Link cleaning can be switched per site and per link.
    "linkcleaner",
    // NIRVA: Macros are opened and run from the command bar.
    "macros",
    // NIRVA: Split view of two to four tabs.
    "split",
  ]) {
    Assert.greater(
      byFeature.get(feature)?.length ?? 0,
      0,
      `${feature} has registered commands`
    );
  }
  for (const command of NirvaCommands.all(window)) {
    const title = NirvaCommands.titleOf(command);
    Assert.ok(
      title && !title.startsWith("nirva-command-"),
      `${command.id} has a readable title: ${title}`
    );
  }
  Assert.throws(
    () =>
      NirvaCommands.register({
        id: "look-glass",
        feature: "x",
        title: "x",
        run() {},
      }),
    /already registered/,
    "two commands cannot share an id"
  );
});

add_task(async function test_ctrl_k_opens_and_closes() {
  Assert.ok(bar.hidden, "closed to begin with");
  gBrowser.selectedBrowser.focus();
  pressCtrlK();
  Assert.ok(!bar.hidden, "Ctrl+K opens it");
  Assert.equal(document.activeElement, input, "with the cursor in its input");
  const box = bar.getBoundingClientRect();
  const page = document
    .getElementById("tabbrowser-tabbox")
    .getBoundingClientRect();
  Assert.equal(
    Math.round(box.width),
    Math.min(560, Math.round(page.width) - 48),
    "560 px wide"
  );
  Assert.less(
    Math.abs(box.x + box.width / 2 - (page.x + page.width / 2)),
    1,
    "centred over the page"
  );
  Assert.less(
    page.bottom - box.bottom,
    60,
    "resting near the bottom of the page"
  );
  const pill = document
    .getElementById("nirva-commandbar-pill")
    .getBoundingClientRect();
  Assert.less(
    list.getBoundingClientRect().top,
    pill.top,
    "results grow upward from it"
  );
  Assert.greaterOrEqual(
    input.getBoundingClientRect().height,
    44,
    "full-size input"
  );
  Assert.greater(
    rows().length,
    0,
    "it lists commands before anything is typed"
  );
  Assert.ok(
    rows().every(r => r.kind == "command"),
    "commands only, at first"
  );

  pressCtrlK();
  Assert.ok(bar.hidden, "Ctrl+K again closes it");
  pressCtrlK();
  EventUtils.synthesizeKey("KEY_Escape");
  Assert.ok(bar.hidden, "Escape closes it");
  Assert.notEqual(document.activeElement, input, "and focus goes back");
});

add_task(async function test_enter_runs_the_first_result() {
  Services.prefs.setStringPref("nirva.mode", "bright");
  pressCtrlK();
  const found = await type("paper");
  Assert.equal(found[0].title, "Look: Paper", "the best match is first");
  Assert.ok(found[0].selected, "and selected");
  Assert.equal(found.at(-1).kind, "web", "the web search is last");
  EventUtils.synthesizeKey("KEY_Enter");
  Assert.ok(bar.hidden, "running a result closes the bar");
  Assert.equal(
    document.documentElement.getAttribute("data-nirva-look"),
    "paper",
    "the command ran"
  );

  pressCtrlK();
  const dark = await type("dark");
  Assert.equal(
    dark[0].title,
    "Appearance: Dark",
    "found by a word inside the title"
  );
  EventUtils.synthesizeKey("KEY_ArrowDown");
  Assert.ok(rows()[1].selected, "Down moves the selection");
  EventUtils.synthesizeKey("KEY_ArrowUp");
  Assert.ok(rows()[0].selected, "Up moves it back");
  EventUtils.synthesizeKey("KEY_Enter");
  Assert.equal(
    document.documentElement.getAttribute("data-nirva-mode"),
    "dark",
    "Appearance: Dark ran"
  );
});

add_task(async function test_open_tabs_including_other_workspaces() {
  const tab = BrowserTestUtils.addTab(
    gBrowser,
    "https://example.com/document-builder.sjs?html=" +
      encodeURIComponent("<title>Waveguide solver</title>hello")
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  const other = NirvaWorkspaces.create("Elsewhere");
  NirvaWorkspaces.switchTo(window, other);
  Assert.ok(tab.hidden, "the tab is in a workspace that is not showing");

  pressCtrlK();
  const found = await type("waveguide");
  const row = found.find(r => r.kind == "tab");
  Assert.equal(row?.title, "Waveguide solver", "open tabs are found by title");
  Assert.ok(row.detail.includes("example.com"), "with their address");
  list.querySelector('li[data-kind="tab"]').click();
  Assert.equal(gBrowser.selectedTab, tab, "choosing it goes to the tab");
  Assert.equal(
    NirvaWorkspaces.getActive(window),
    NirvaWorkspaces.DEFAULT_ID,
    "and to its workspace"
  );

  pressCtrlK();
  const spaces = await type("elsewhere");
  Assert.equal(
    spaces[0].title,
    "Go to workspace Elsewhere",
    "each workspace has a command"
  );
  NirvaCommandBar.close(window);
  NirvaWorkspaces.remove(other);
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_bookmarks_history_and_the_web() {
  await PlacesUtils.bookmarks.insert({
    parentGuid: PlacesUtils.bookmarks.unfiledGuid,
    url: "https://example.org/ring-resonators",
    title: "Ring resonator notes",
  });
  await PlacesTestUtils.addVisits({
    uri: "https://example.net/lumen-journal",
    title: "Lumen Journal",
  });

  pressCtrlK();
  let found = await type("resonator");
  const bookmark = found.find(r => r.kind == "bookmark");
  Assert.equal(bookmark?.title, "Ring resonator notes", "bookmarks are found");
  Assert.equal(
    bookmark.detail,
    "https://example.org/ring-resonators",
    "with address"
  );

  found = await type("lumen");
  Assert.equal(
    found.find(r => r.kind == "history")?.title,
    "Lumen Journal",
    "history is found"
  );
  Assert.equal(
    found.at(-1).title,
    "Search the web for “lumen”",
    "a web search is offered last"
  );

  found = await type("example.org/page");
  Assert.equal(
    found.at(-1).title,
    "Go to example.org/page",
    "an address is recognised"
  );

  found = await type("zzzz-nothing-like-this");
  Assert.deepEqual(
    found.map(r => r.kind),
    ["web"],
    "with no match only the web row remains"
  );

  found = await type("resonator");
  // From a blank tab a page opens in place; from any other tab it opens in a new one.
  const url = "https://example.org/ring-resonators";
  Assert.ok(gBrowser.selectedTab.isEmpty, "starting from a blank tab");
  let loaded = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    url,
    true
  );
  list.querySelector('li[data-kind="bookmark"]').click();
  await loaded;
  Assert.ok(bar.hidden, "the bar closed");
  Assert.equal(gBrowser.tabs.length, 1, "the blank tab was reused");

  pressCtrlK();
  await type("resonator");
  const opened = BrowserTestUtils.waitForNewTab(gBrowser, url, false, true);
  list.querySelector('li[data-kind="bookmark"]').click();
  const tab = await opened;
  Assert.equal(gBrowser.tabs.length, 2, "from a page it opens a new tab");
  BrowserTestUtils.removeTab(tab);
  loaded = BrowserTestUtils.browserLoaded(
    gBrowser.selectedBrowser,
    false,
    "about:blank"
  );
  BrowserTestUtils.startLoadingURIString(
    gBrowser.selectedBrowser,
    "about:blank"
  );
  await loaded;
});

add_task(async function test_local_results_arrive_within_50_ms() {
  await NirvaCommandBar.search(window, "warm up");
  const local = [];
  const total = [];
  for (const query of [
    "l",
    "lo",
    "look",
    "resonator",
    "lumen journal",
    "new tab",
  ]) {
    const timing = await NirvaCommandBar.search(window, query);
    local.push(timing.localMs);
    total.push(timing.totalMs);
  }
  const worst = list_ => Math.max(...list_);
  info(`commands and tabs: worst ${worst(local).toFixed(1)} ms`);
  info(`with bookmarks and history: worst ${worst(total).toFixed(1)} ms`);
  Assert.less(worst(local), 50, "commands and tabs within 50 ms");
  Assert.less(worst(total), 50, "bookmarks and history within 50 ms too");
});

add_task(async function test_switching_the_command_bar_off() {
  Services.prefs.setBoolPref("nirva.commandbar.enabled", false);
  pressCtrlK();
  Assert.ok(bar.hidden, "Ctrl+K does nothing when the feature is off");
  Services.prefs.setBoolPref("nirva.commandbar.enabled", true);
  pressCtrlK();
  Assert.ok(!bar.hidden, "and works again when it is on");
  NirvaCommandBar.close(window);
});
