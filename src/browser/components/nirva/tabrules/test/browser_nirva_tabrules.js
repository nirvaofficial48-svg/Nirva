/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gNotificationBox, gTestPath, registerCleanupFunction, Services, TestUtils, window */

"use strict";

const { NirvaTabRules, cleanHost } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/tabrules/NirvaTabRules.sys.mjs"
);
const { NirvaWorkspaces } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const PATH = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content/",
  ""
);
const page = host => `https://${host}/${PATH}page.html`;
const MANAGER_URL = "chrome://browser/content/nirva/tabrules.html";
const PREFS = [
  "nirva.tabrules.enabled",
  "nirva.tabrules.paused",
  "nirva.tabrules.rules",
  "nirva.tabrules.suggestSleep",
  "nirva.tabrules.sleepMinutes",
  "nirva.workspaces.list",
];
let play;

function reset() {
  for (const pref of PREFS.slice(0, 5)) {
    Services.prefs.clearUserPref(pref);
  }
  gNotificationBox.removeAllNotifications(true);
}

registerCleanupFunction(() => {
  NirvaWorkspaces.switchTo(window, "home");
  reset();
  Services.prefs.clearUserPref("nirva.workspaces.list");
  NirvaWorkspaces.updateWindow(window);
});

add_task(async function test_a_site_rule_moves_tabs_and_can_be_undone() {
  play = NirvaWorkspaces.create("Play");
  Assert.equal(cleanHost(" https://WWW.Example.com/a?b "), "example.com");
  Assert.equal(cleanHost("not a site"), "", "nonsense is refused");
  Assert.equal(NirvaTabRules.addRule("nonsense", play), null, "and not saved");
  const rule = NirvaTabRules.addRule("example.com", play);
  Assert.equal(NirvaTabRules.rules.length, 1, "the rule is saved");

  // A tab opened in the background moves without taking the person along.
  const tab = BrowserTestUtils.addTab(gBrowser, page("test1.example.com"));
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  Assert.equal(
    NirvaWorkspaces.workspaceOf(tab),
    play,
    "a page on part of the site moves its tab to the chosen workspace"
  );
  Assert.equal(NirvaWorkspaces.getActive(window), "home", "the window stays");
  Assert.ok(tab.hidden, "the tab now lives in the other workspace");
  await TestUtils.waitForCondition(
    () => gNotificationBox.getNotificationWithValue("nirva-tabrules-moved"),
    "the move is announced"
  );
  const [entry] = NirvaTabRules.log;
  Assert.ok(entry.canUndo && entry.toName == "Play", "and listed");

  Assert.ok(NirvaTabRules.undo(entry.id), "the move can be undone");
  Assert.equal(NirvaWorkspaces.workspaceOf(tab), "home", "the tab is back");
  Assert.ok(!tab.hidden, "and visible again");
  BrowserTestUtils.startLoadingURIString(
    tab.linkedBrowser,
    page("example.com")
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  Assert.equal(
    NirvaWorkspaces.workspaceOf(tab),
    "home",
    "a tab whose move was undone is left alone afterwards"
  );
  BrowserTestUtils.removeTab(tab);

  // A tab the person is looking at takes the window with it.
  const front = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    page("example.com")
  );
  Assert.equal(NirvaWorkspaces.workspaceOf(front), play, "the front tab moves");
  Assert.equal(
    NirvaWorkspaces.getActive(window),
    play,
    "and the window follows"
  );
  NirvaWorkspaces.switchTo(window, "home");
  BrowserTestUtils.removeTab(front);

  // Other sites, a switched-off rule and the pause switch.
  const other = BrowserTestUtils.addTab(gBrowser, page("example.org"));
  await BrowserTestUtils.browserLoaded(other.linkedBrowser);
  Assert.equal(NirvaWorkspaces.workspaceOf(other), "home", "other sites stay");
  BrowserTestUtils.removeTab(other);
  for (const [label, change, undo] of [
    [
      "a rule that is switched off",
      () => NirvaTabRules.setRuleEnabled(rule.id, false),
      () => NirvaTabRules.setRuleEnabled(rule.id, true),
    ],
    [
      "paused rules",
      () => (NirvaTabRules.paused = true),
      () => (NirvaTabRules.paused = false),
    ],
  ]) {
    change();
    const still = BrowserTestUtils.addTab(gBrowser, page("example.com"));
    await BrowserTestUtils.browserLoaded(still.linkedBrowser);
    Assert.equal(
      NirvaWorkspaces.workspaceOf(still),
      "home",
      `${label}: no move`
    );
    BrowserTestUtils.removeTab(still);
    undo();
  }
  Assert.ok(NirvaTabRules.removeRule(rule.id), "the rule can be removed");
  Assert.ok(!NirvaTabRules.removeRule(rule.id), "only once");
  reset();
});

add_task(async function test_sleep_is_suggested_never_forced() {
  const tab = BrowserTestUtils.addTab(gBrowser, page("example.org"));
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  const later = Date.now() + 61 * 60 * 1000;
  Assert.ok(!NirvaTabRules.suggestSleepIn(window), "fresh tabs: no suggestion");
  Assert.ok(NirvaTabRules.idleTabs(window, later).includes(tab), "an hour on");
  Assert.ok(
    !NirvaTabRules.idleTabs(window, later).includes(gBrowser.selectedTab),
    "the tab in front is never suggested"
  );

  NirvaTabRules.paused = true;
  Assert.ok(!NirvaTabRules.suggestSleepIn(window, later), "paused: none");
  NirvaTabRules.paused = false;
  Assert.ok(
    NirvaTabRules.suggestSleepIn(window, later),
    "a suggestion is made"
  );
  await TestUtils.waitForCondition(
    () => gNotificationBox.getNotificationWithValue("nirva-tabrules-sleep"),
    "as a message with buttons"
  );
  Assert.ok(!tab.hasAttribute("pending"), "the tab is still awake");
  Assert.ok(
    !NirvaTabRules.suggestSleepIn(window, later),
    "the same tabs are not suggested twice"
  );
  Assert.equal(
    await NirvaTabRules.sleepTabs(window, [tab]),
    1,
    "agreeing sleeps it"
  );
  Assert.ok(tab.hasAttribute("pending"), "the tab is asleep");
  BrowserTestUtils.removeTab(tab);
  reset();
});

add_task(async function test_page_and_commands() {
  const ids = () =>
    NirvaCommands.all(window)
      .filter(command => command.feature == "tabrules")
      .map(command => command.id);
  Assert.ok(ids().includes("tabrules-pause"), "the command bar can pause");
  NirvaCommands.all(window)
    .find(command => command.id == "tabrules-pause")
    .run(window);
  Assert.ok(
    NirvaTabRules.paused && ids().includes("tabrules-resume"),
    "paused"
  );
  NirvaTabRules.paused = false;

  const tab = NirvaTabRules.openManager(window);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, MANAGER_URL);
  const doc = tab.linkedBrowser.contentDocument;
  doc.querySelector("#add-site").value = "example.net";
  doc.querySelector("#add-workspace").value = play;
  doc.querySelector("#add button").click();
  Assert.equal(NirvaTabRules.rules[0]?.host, "example.net", "the form adds");
  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("#rules .row").length == 1,
    "and the page lists the rule"
  );
  doc.querySelector("#add-site").value = "???";
  doc.querySelector("#add button").click();
  Assert.ok(!doc.querySelector("#add-error").hidden, "a bad name is explained");

  doc.querySelector("#pause").click();
  Assert.ok(NirvaTabRules.paused, "the page's button pauses everything");
  await TestUtils.waitForCondition(
    () => !doc.querySelector("#paused-note").hidden,
    "and the page says so"
  );
  doc.querySelector("#pause").click();
  Assert.ok(!NirvaTabRules.paused, "and resumes");

  doc.querySelector("#rules .row button").click();
  Assert.equal(NirvaTabRules.rules.length, 0, "Remove deletes the rule");
  BrowserTestUtils.removeTab(tab);
  reset();
});
