/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, gBrowser, Services, SpecialPowers, TestUtils, window */

"use strict";

const { NirvaMemory } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/memory/NirvaMemory.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const MINUTE = 60 * 1000;

async function openTabs(urls) {
  const tabs = urls.map(url => BrowserTestUtils.addTab(gBrowser, url));
  await Promise.all(
    tabs.map(t => BrowserTestUtils.browserLoaded(t.linkedBrowser))
  );
  return tabs;
}

add_task(async function test_defaults() {
  Assert.ok(NirvaMemory.enabled, "memory saver is on by default");
  Assert.equal(NirvaMemory.sleepMinutes, 30, "after 30 minutes");
  Assert.ok(
    Services.prefs
      .getDefaultBranch("")
      .getBoolPref("browser.tabs.unloadOnLowMemory"),
    "low-memory tab unloading is on by default (the test harness turns it off)"
  );
});

add_task(async function test_idle_tabs_sleep_and_wake() {
  const [idle, recent, pinned] = await openTabs([
    "https://example.com/",
    "https://example.org/",
    "https://example.net/",
  ]);
  gBrowser.pinTab(pinned);
  const now = Date.now() + 31 * MINUTE;
  recent.updateLastAccessed(now - 10 * MINUTE);

  const slept = await NirvaMemory.sleepIdleTabsEverywhere(now);
  Assert.deepEqual(slept, [idle], "only the tab idle for 30 minutes sleeps");
  Assert.ok(idle.hasAttribute("pending"), "it is asleep");
  Assert.ok(
    !idle.linkedBrowser.isConnected || !idle.linkedPanel,
    "its page is gone from memory"
  );
  Assert.ok(!recent.hasAttribute("pending"), "a recent tab stays awake");
  Assert.ok(!pinned.hasAttribute("pending"), "a pinned tab stays awake");

  const woke = BrowserTestUtils.waitForEvent(idle, "SSTabRestored");
  await BrowserTestUtils.switchTab(gBrowser, idle);
  await woke;
  Assert.ok(!idle.hasAttribute("pending"), "the tab is awake again");
  Assert.equal(
    idle.linkedBrowser.currentURI.spec,
    "https://example.com/",
    "clicking the tab brings the page back"
  );
  for (const tab of [idle, recent, pinned]) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_pref_off() {
  await SpecialPowers.pushPrefEnv({ set: [["nirva.memory.enabled", false]] });
  const [tab] = await openTabs(["https://example.com/"]);
  Assert.deepEqual(
    await NirvaMemory.sleepIdleTabsEverywhere(Date.now() + 60 * MINUTE),
    [],
    "nothing sleeps while memory saver is off"
  );
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_commands() {
  Assert.ok(NirvaCommands.get("memory-off", window), "can turn it off");
  NirvaCommands.run("memory-off", window);
  Assert.ok(!NirvaMemory.enabled, "off");
  NirvaCommands.run("memory-on", window);
  Assert.ok(NirvaMemory.enabled, "on again");

  const [a, b] = await openTabs([
    "https://example.com/",
    "https://example.org/",
  ]);
  NirvaCommands.run("memory-sleep-now", window);
  await TestUtils.waitForCondition(
    () => a.hasAttribute("pending") && b.hasAttribute("pending"),
    "sleep other tabs now"
  );
  Assert.ok(
    !gBrowser.selectedTab.hasAttribute("pending"),
    "the tab in front stays awake"
  );
  BrowserTestUtils.removeTab(a);
  BrowserTestUtils.removeTab(b);
});
