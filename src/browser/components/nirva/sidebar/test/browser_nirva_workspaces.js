/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, EventUtils, gBrowser, registerCleanupFunction, Services, SessionStore */

"use strict";

// These checks are about the sidebar in place; hiding it at the edge has its own test.
Services.prefs.setBoolPref("nirva.autohide.enabled", false);
registerCleanupFunction(() =>
  Services.prefs.clearUserPref("nirva.autohide.enabled")
);

const { NirvaWorkspaces } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
);

const HOME = NirvaWorkspaces.DEFAULT_ID;

function switcherButtons() {
  return [...document.querySelectorAll("#nirva-workspaces .nirva-workspace")];
}

function buttonFor(id) {
  return switcherButtons().find(b => b.dataset.id == id);
}

function visibleUrls() {
  return gBrowser.visibleTabs
    .filter(t => !t.pinned)
    .map(t => t.linkedBrowser.currentURI.spec);
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.workspaces.list");
  Services.prefs.clearUserPref("nirva.workspaces.enabled");
  NirvaWorkspaces.updateWindow(window);
});

add_task(async function test_a_new_profile_has_one_workspace() {
  Assert.deepEqual(
    NirvaWorkspaces.list,
    [{ id: HOME, name: "Home" }],
    "one workspace called Home"
  );
  const buttons = switcherButtons();
  Assert.equal(buttons.length, 1, "the switcher shows it");
  Assert.equal(buttons[0].textContent, "Home", "by name");
  Assert.equal(buttons[0].getAttribute("aria-selected"), "true", "as active");
  Assert.equal(NirvaWorkspaces.getActive(window), HOME, "and it is active");
});

add_task(async function test_switching_hides_and_shows_tabs() {
  const homeTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:robots"
  );
  const pinned = BrowserTestUtils.addTab(gBrowser, "about:mozilla");
  gBrowser.pinTab(pinned);
  Assert.equal(
    NirvaWorkspaces.workspaceOf(homeTab),
    HOME,
    "new tabs join Home"
  );

  const work = NirvaWorkspaces.create("Work");
  Assert.equal(buttonFor(work)?.textContent, "Work", "the switcher adds Work");

  const opened = BrowserTestUtils.waitForEvent(
    gBrowser.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtCenter(buttonFor(work), {});
  const firstWorkTab = (await opened).target;

  Assert.equal(NirvaWorkspaces.getActive(window), work, "Work is active");
  Assert.equal(buttonFor(work).getAttribute("aria-selected"), "true");
  Assert.equal(buttonFor(HOME).getAttribute("aria-selected"), "false");
  Assert.equal(
    gBrowser.selectedTab,
    firstWorkTab,
    "an empty workspace starts with a new tab"
  );
  Assert.ok(homeTab.hidden, "the Home tab is hidden");
  Assert.ok(!pinned.hidden, "pinned sites stay in every workspace");
  Assert.ok(homeTab.linkedPanel && !homeTab.closing, "hidden tabs stay open");

  const workTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:license"
  );
  Assert.equal(
    NirvaWorkspaces.workspaceOf(workTab),
    work,
    "tabs opened here join Work"
  );
  Assert.equal(
    SessionStore.getCustomTabValue(workTab, "nirva-workspace"),
    work,
    "the workspace is saved with the session"
  );
  Assert.ok(visibleUrls().includes("about:license"), "the Work tab shows");
  Assert.ok(!visibleUrls().includes("about:robots"), "the Home tab does not");

  EventUtils.synthesizeMouseAtCenter(buttonFor(HOME), {});
  Assert.equal(NirvaWorkspaces.getActive(window), HOME, "back in Home");
  Assert.equal(gBrowser.selectedTab, homeTab, "on the tab that was open there");
  Assert.ok(workTab.hidden && firstWorkTab.hidden, "Work tabs are hidden");
  Assert.ok(visibleUrls().includes("about:robots"), "Home tabs show again");

  NirvaWorkspaces.switchTo(window, work);
  Assert.equal(gBrowser.selectedTab, workTab, "Work remembers its last tab");

  // Selecting a hidden tab from elsewhere brings its workspace along.
  gBrowser.selectedTab = homeTab;
  Assert.equal(
    NirvaWorkspaces.getActive(window),
    HOME,
    "the window follows the tab"
  );
  Assert.ok(workTab.hidden, "and hides the other workspace again");

  NirvaWorkspaces.rename(work, "Build");
  Assert.equal(
    buttonFor(work).textContent,
    "Build",
    "renaming updates the switcher"
  );

  NirvaWorkspaces.remove(work);
  Assert.ok(!buttonFor(work), "a deleted workspace leaves the switcher");
  Assert.ok(!workTab.hidden && !workTab.closing, "its tabs are kept and shown");
  Assert.equal(
    NirvaWorkspaces.workspaceOf(workTab),
    HOME,
    "in the first workspace"
  );
  Assert.throws(
    () => NirvaWorkspaces.remove(HOME),
    /cannot be deleted/,
    "the last workspace cannot be deleted"
  );
  Assert.throws(() => NirvaWorkspaces.create("   "), /needs a name/);

  for (const tab of [homeTab, pinned, workTab, firstWorkTab]) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_switching_workspaces_off_shows_everything() {
  const homeTab = BrowserTestUtils.addTab(gBrowser, "about:robots");
  const other = NirvaWorkspaces.create("Other");
  NirvaWorkspaces.switchTo(window, other);
  Assert.ok(homeTab.hidden, "hidden while Other is active");

  Services.prefs.setBoolPref("nirva.workspaces.enabled", false);
  Assert.ok(!homeTab.hidden, "every tab shows when workspaces are off");
  Assert.ok(
    document.getElementById("nirva-workspaces").hidden,
    "and the switcher goes away"
  );
  Services.prefs.setBoolPref("nirva.workspaces.enabled", true);
  Assert.ok(homeTab.hidden, "and they come back when switched on");

  NirvaWorkspaces.switchTo(window, HOME);
  NirvaWorkspaces.remove(other);
  while (gBrowser.tabs.length > 1) {
    BrowserTestUtils.removeTab(gBrowser.tabs.at(-1));
  }
});

add_task(async function test_new_windows_have_their_own_active_workspace() {
  const other = NirvaWorkspaces.create("Other");
  const win = await BrowserTestUtils.openNewBrowserWindow();
  const buttons = [
    ...win.document.querySelectorAll("#nirva-workspaces .nirva-workspace"),
  ];
  Assert.deepEqual(
    buttons.map(b => b.textContent),
    ["Home", "Other"],
    "the new window lists the same workspaces"
  );
  NirvaWorkspaces.switchTo(win, other);
  Assert.equal(NirvaWorkspaces.getActive(win), other, "it switched");
  Assert.equal(NirvaWorkspaces.getActive(window), HOME, "this window did not");
  await BrowserTestUtils.closeWindow(win);
  NirvaWorkspaces.remove(other);
});
