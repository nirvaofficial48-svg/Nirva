/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, gBrowser, info, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaMotion } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs"
);
const { NirvaWelcome } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/welcome/NirvaWelcome.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const root = document.documentElement;
const toolbox = document.getElementById("navigator-toolbox");
const SMOOTH = "cubic-bezier(0.2, 0, 0, 1)";
const SPRING = "cubic-bezier(0.34, 1.4, 0.64, 1)";

const PREFS = [
  "nirva.motion.enabled",
  "nirva.motion.style",
  "nirva.motion.speed",
  "nirva.lite.enabled",
  "nirva.lite.sleepMinutes",
  "nirva.look",
  "nirva.mode",
  "nirva.welcome.done",
];

// The island's fade is the reference animation: every other one uses the same variables.
function islandTiming() {
  const style = getComputedStyle(toolbox);
  return {
    seconds: parseFloat(style.transitionDuration),
    ease: style.transitionTimingFunction.split(/,\s*(?=cubic|ease|linear)/)[0],
  };
}

function moves() {
  return getComputedStyle(root).getPropertyValue("--nirva-motion-move").trim();
}

registerCleanupFunction(() => {
  for (const pref of PREFS) {
    Services.prefs.clearUserPref(pref);
  }
  NirvaMotion._machineOverride = null;
});

add_task(async function test_defaults() {
  Assert.equal(
    root.getAttribute("data-nirva-motion"),
    "smooth",
    "Smooth by default"
  );
  Assert.ok(!root.hasAttribute("data-nirva-lite"), "Lite mode is off");
  Assert.deepEqual(
    islandTiming(),
    { seconds: 0.18, ease: SMOOTH },
    "token timing"
  );
  Assert.equal(moves(), "1", "things may move");
});

add_task(async function test_the_three_styles() {
  NirvaMotion.style = "springy";
  Assert.equal(
    root.getAttribute("data-nirva-motion"),
    "springy",
    "attribute follows"
  );
  Assert.equal(islandTiming().ease, SPRING, "Springy uses the spring curve");
  Assert.equal(moves(), "1", "and movement");

  NirvaMotion.style = "minimal";
  Assert.equal(moves(), "0", "Minimal turns movement off");
  Assert.equal(islandTiming().ease, SMOOTH, "and uses the plain curve");
  root.setAttribute("nirva-island-collapsed", "true");
  Assert.ok(
    !getComputedStyle(toolbox).translate.includes("-8px"),
    "the island fades out in place instead of sliding"
  );
  root.removeAttribute("nirva-island-collapsed");
  root.setAttribute("nirva-island-loading", "true");
  Assert.equal(
    getComputedStyle(document.querySelector("#nirva-island-sweep > span"))
      .animationName,
    "none",
    "the loading line stands still"
  );
  root.removeAttribute("nirva-island-loading");

  NirvaMotion.style = "smooth";
  Assert.equal(moves(), "1", "Smooth moves again");
  Assert.throws(() => (NirvaMotion.style = "bouncy"), /Unknown motion style/);
});

add_task(async function test_speed() {
  NirvaMotion.speed = 200;
  Assert.equal(islandTiming().seconds, 0.09, "twice the speed halves the time");
  NirvaMotion.speed = 300;
  Assert.equal(islandTiming().seconds, 0.06, "three times is the fastest");
  Assert.throws(
    () => (NirvaMotion.speed = 50),
    /between/,
    "slower than the design is refused"
  );
  Assert.throws(
    () => (NirvaMotion.speed = 400),
    /between/,
    "and faster than 300"
  );
  // A hand-edited preference cannot break the 200 ms limit either.
  Services.prefs.setIntPref("nirva.motion.speed", 10);
  Assert.equal(NirvaMotion.speed, 100, "out-of-range values are clamped");
  Assert.lessOrEqual(
    islandTiming().seconds,
    0.2,
    "nothing runs longer than 200 ms"
  );
  Services.prefs.clearUserPref("nirva.motion.speed");
});

add_task(async function test_reduce_motion_setting_of_the_computer() {
  await SpecialPowers.pushPrefEnv({ set: [["ui.prefersReducedMotion", 1]] });
  await TestUtils.waitForCondition(() => moves() == "0", "movement is off");
  await TestUtils.waitForCondition(
    () => islandTiming().seconds == 0.08,
    "what is left is a short fade"
  );
  await SpecialPowers.popPrefEnv();
  await TestUtils.waitForCondition(() => moves() == "1", "and back");
});

add_task(async function test_lite_mode_look() {
  Services.prefs.setStringPref("nirva.look", "glass");
  Services.prefs.setStringPref("nirva.mode", "bright");
  Assert.notEqual(
    getComputedStyle(toolbox).backdropFilter,
    "none",
    "Glass blurs"
  );
  NirvaMotion.lite = true;
  Assert.equal(
    root.getAttribute("data-nirva-lite"),
    "true",
    "Lite marks the window"
  );
  Assert.equal(
    getComputedStyle(toolbox).backdropFilter,
    "none",
    "no blur in Lite mode"
  );
  Assert.equal(moves(), "0", "no movement");
  Assert.equal(islandTiming().seconds, 0.08, "short fades");
  NirvaMotion.lite = false;
  Assert.ok(!root.hasAttribute("data-nirva-lite"), "and off again");
  Assert.notEqual(
    getComputedStyle(toolbox).backdropFilter,
    "none",
    "blur returns"
  );
});

add_task(async function test_lite_mode_puts_idle_tabs_to_sleep() {
  const idle = BrowserTestUtils.addTab(gBrowser, "https://example.com/");
  const recent = BrowserTestUtils.addTab(gBrowser, "https://example.org/");
  const pinned = BrowserTestUtils.addTab(gBrowser, "https://example.net/");
  await Promise.all(
    [idle, recent, pinned].map(t =>
      BrowserTestUtils.browserLoaded(t.linkedBrowser)
    )
  );
  gBrowser.pinTab(pinned);
  const selected = gBrowser.selectedTab;
  const minutes = 60 * 1000;
  const now = Date.now() + 6 * minutes;
  // "recent" was looked at one minute before the check.
  recent.updateLastAccessed(now - 1 * minutes);

  const slept = await NirvaMotion.sleepIdleTabs(window, now);
  Assert.deepEqual(
    slept,
    [idle],
    "only the tab idle for over 5 minutes sleeps"
  );
  Assert.ok(idle.hasAttribute("pending"), "it is asleep");
  Assert.ok(!recent.hasAttribute("pending"), "a recently used tab stays awake");
  Assert.ok(!pinned.hasAttribute("pending"), "pinned sites stay awake");
  Assert.ok(!selected.hasAttribute("pending"), "the tab in front stays awake");
  Assert.ok(
    !NirvaMotion.maySleep(selected),
    "the tab in front may never sleep"
  );

  Services.prefs.setIntPref("nirva.lite.sleepMinutes", 1);
  Assert.deepEqual(
    await NirvaMotion.sleepIdleTabs(window, now),
    [recent],
    "the waiting time is a setting"
  );
  for (const tab of [idle, recent, pinned]) {
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_when_lite_mode_is_offered() {
  const offer = (memoryGB, cores) =>
    NirvaMotion.shouldOfferLite({ memoryGB, cores });
  Assert.ok(offer(4, 8), "4 GB of memory");
  Assert.ok(offer(3.8, 8), "a 4 GB machine that reports a little less");
  Assert.ok(offer(2, 4), "less than 4 GB");
  Assert.ok(offer(16, 2), "two cores");
  Assert.ok(offer(16, 1), "one core");
  Assert.ok(!offer(8, 4), "not on 8 GB and four cores");
  Assert.ok(!offer(4.5, 3), "not just above the limits");

  const real = await NirvaMotion.machine();
  info(`this computer: ${real.memoryGB.toFixed(1)} GB, ${real.cores} cores`);
  Assert.greater(real.memoryGB, 0.5, "the real memory size is read");
  Assert.ok(Number.isFinite(real.memoryGB), "as a number");
  Assert.greaterOrEqual(real.cores, 1, "the real core count is read");
  Assert.ok(Number.isFinite(real.cores), "as a number");
});

add_task(
  async function test_first_launch_offers_lite_mode_on_a_small_computer() {
    const open = async () => {
      const win = NirvaWelcome.open();
      await TestUtils.waitForCondition(
        () => win.document?.documentElement?.getAttribute("ready") == "true"
      );
      // NIRVA: Lite mode is offered on the guide's look step.
      win.document.getElementById("continue").click();
      return win;
    };

    NirvaMotion._machineOverride = { memoryGB: 16, cores: 8 };
    let win = await open();
    Assert.ok(
      win.document.getElementById("lite").hidden,
      "not offered on a strong computer"
    );
    await BrowserTestUtils.closeWindow(win);

    NirvaMotion._machineOverride = { memoryGB: 4, cores: 2 };
    win = await open();
    const offer = win.document.getElementById("lite");
    Assert.ok(!offer.hidden, "offered on a small computer");
    Assert.greaterOrEqual(
      offer.getBoundingClientRect().height,
      44,
      "a full-size target"
    );
    const box = win.document.getElementById("lite-choice");
    Assert.ok(!box.checked, "but not switched on for the owner");
    box.click();
    // NIRVA: Continue applies the look step and moves on in the guide.
    win.document.getElementById("continue").click();
    await BrowserTestUtils.closeWindow(win);
    Assert.ok(NirvaMotion.lite, "accepting it turns Lite mode on");
    Assert.equal(
      root.getAttribute("data-nirva-lite"),
      "true",
      "in the browser window"
    );
    NirvaMotion.lite = false;
  }
);

add_task(async function test_commands_and_switching_off() {
  Assert.ok(
    NirvaCommands.run("motion-springy", window),
    "Motion: Springy is a command"
  );
  Assert.equal(NirvaMotion.style, "springy", "and it works");
  Assert.ok(
    NirvaCommands.get("lite-on", window),
    "Lite mode can be turned on by command"
  );
  Assert.ok(
    !NirvaCommands.get("lite-off", window),
    "off is offered only while it is on"
  );
  NirvaCommands.run("motion-speed-150", window);
  Assert.equal(NirvaMotion.speed, 150, "speed commands work");

  Services.prefs.setBoolPref("nirva.motion.enabled", false);
  Assert.ok(
    !root.hasAttribute("data-nirva-motion"),
    "attributes removed when off"
  );
  Assert.ok(
    !NirvaCommands.get("motion-smooth", window),
    "and its commands hidden"
  );
  Services.prefs.setBoolPref("nirva.motion.enabled", true);
  Assert.equal(root.getAttribute("data-nirva-motion"), "springy", "and back");
});
