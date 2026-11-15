/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, Services, SpecialPowers, TestUtils, window */

"use strict";

const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const DIR = getRootDirectory(gTestPath);
const TOP = `${DIR.replace("chrome://mochitests/content", "https://example.com")}dark.html`;
const FRAMES = DIR.replace(
  "chrome://mochitests/content",
  "https://example.org"
);

// Paints the top of the tab and returns the colour at a corner of the frame,
// where only a see-through frame lets the dark page show.
async function cornerColour(browser) {
  const bitmap = await browser.browsingContext.currentWindowGlobal.drawSnapshot(
    new DOMRect(0, 0, 200, 100),
    1,
    "white"
  );
  const canvas = new OffscreenCanvas(200, 100);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bitmap, 0, 0);
  return Array.from(ctx.getImageData(5, 5, 1, 1).data.slice(0, 3));
}

async function openWith(frame) {
  const url = `${TOP}?frame=${encodeURIComponent(FRAMES + frame)}`;
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, url);
  const frameContext = await TestUtils.waitForCondition(
    () =>
      tab.linkedBrowser.browsingContext.children[0]?.currentWindowGlobal?.documentURI?.spec.endsWith(
        frame
      ) && tab.linkedBrowser.browsingContext.children[0],
    "frame loaded"
  );
  await SpecialPowers.spawn(frameContext, [], () =>
    ContentTaskUtils.waitForCondition(
      () => content.document.readyState === "complete",
      "frame complete"
    )
  );
  return { tab, frameContext };
}

function rootSchemes(frameContext) {
  return SpecialPowers.spawn(frameContext, [], () => [
    content.getComputedStyle(content.document.documentElement).colorScheme,
    content.getComputedStyle(content.document.body).colorScheme,
  ]);
}

async function checkSeeThrough(frame) {
  const { tab, frameContext } = await openWith(frame);
  await TestUtils.waitForCondition(
    async () => (await rootSchemes(frameContext))[0] === "dark",
    "frame takes the page's dark scheme at its root"
  );
  Assert.deepEqual(
    await rootSchemes(frameContext),
    ["dark", "light"],
    "inside the frame, content keeps its light defaults"
  );
  await TestUtils.waitForCondition(async () => {
    const [r, g, b] = await cornerColour(tab.linkedBrowser);
    return r < 40 && g < 40 && b < 40;
  }, "the dark page shows through the frame's corner, not a white box");
  BrowserTestUtils.removeTab(tab);
}

add_task(async function test_see_through_frame_has_no_white_box() {
  await checkSeeThrough("frame.html");
});

add_task(async function test_frame_that_says_light_has_no_white_box() {
  await checkSeeThrough("frame-light.html");
});

add_task(async function test_opaque_frame_is_left_alone() {
  const { tab, frameContext } = await openWith("frame-white.html");
  // Give the actor time to answer, if it wrongly would.
  await SpecialPowers.spawn(
    frameContext,
    [],
    () => new Promise(r => content.setTimeout(r, 300))
  );
  Assert.equal(
    (await rootSchemes(frameContext))[0],
    "normal",
    "a frame with its own background is not touched"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_pref_off_keeps_engine_behaviour() {
  await SpecialPowers.pushPrefEnv({ set: [["nirva.frames.enabled", false]] });
  const { tab, frameContext } = await openWith("frame.html");
  await SpecialPowers.spawn(
    frameContext,
    [],
    () => new Promise(r => content.setTimeout(r, 300))
  );
  Assert.equal(
    (await rootSchemes(frameContext))[0],
    "normal",
    "pref off: untouched"
  );
  const [r, g, b] = await cornerColour(tab.linkedBrowser);
  Assert.greater(r + g + b, 600, "pref off: the engine's white box is back");
  BrowserTestUtils.removeTab(tab);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_command_bar_entries() {
  Assert.ok(
    NirvaCommands.get("frames-off", window),
    "offered: turn the fix off"
  );
  Assert.ok(
    !NirvaCommands.get("frames-on", window),
    "not offered while already on"
  );
  NirvaCommands.run("frames-off", window);
  Assert.ok(
    !Services.prefs.getBoolPref("nirva.frames.enabled"),
    "command turns it off"
  );
  NirvaCommands.run("frames-on", window);
  Assert.ok(
    Services.prefs.getBoolPref("nirva.frames.enabled"),
    "command turns it on"
  );
});
