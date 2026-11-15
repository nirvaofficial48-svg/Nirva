/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_task, Assert, BrowserTestUtils, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaLooks } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs"
);

// Ground and text colour of each look, from design/tokens.css.
const EXPECTED = [
  ["glass", "bright", "rgb(232, 236, 239)", "rgb(24, 33, 43)"],
  ["glass", "dark", "rgb(14, 19, 24)", "rgb(238, 242, 245)"],
  ["cockpit", "dark", "rgb(11, 14, 17)", "rgb(230, 235, 239)"],
  ["paper", "bright", "rgb(245, 240, 230)", "rgb(42, 40, 38)"],
  ["paper", "dark", "rgb(31, 29, 26)", "rgb(237, 230, 217)"],
];

function attrs(win = window) {
  const root = win.document.documentElement;
  return [
    root.getAttribute("data-nirva-look"),
    root.getAttribute("data-nirva-mode"),
  ];
}

// Firefox fades the window ground for a moment when it changes; wait for the final colour.
async function settledColours(expectedBackground, win = window) {
  await TestUtils.waitForCondition(
    () => colours(win)[0] == expectedBackground,
    `window ground becomes ${expectedBackground}`
  ).catch(() => {});
  return colours(win);
}

function colours(win = window) {
  // Firefox paints the window ground on <body>; the toolbars sit on top of it.
  const body = win.getComputedStyle(win.document.body);
  return [body.backgroundColor, body.color];
}

registerCleanupFunction(() => {
  for (const pref of ["nirva.look", "nirva.mode", "nirva.looks.enabled"]) {
    Services.prefs.clearUserPref(pref);
  }
});

add_task(async function test_default_look() {
  Assert.equal(attrs()[0], "glass", "a new profile starts in Glass");
  Assert.ok(
    ["bright", "dark"].includes(attrs()[1]),
    "the mode attribute is always bright or dark, never 'system'"
  );
});

add_task(async function test_every_look_restyles_the_window_at_once() {
  for (const [look, mode, background, text] of EXPECTED) {
    NirvaLooks.mode = mode;
    NirvaLooks.look = look;
    Assert.deepEqual(attrs(), [look, mode], `${look} ${mode}: attributes`);
    Assert.deepEqual(
      await settledColours(background),
      [background, text],
      `${look} ${mode}: toolbar colours come from the tokens`
    );
    await TestUtils.waitForCondition(
      () =>
        window.matchMedia("(prefers-color-scheme: dark)").matches ==
        (mode == "dark"),
      `${look} ${mode}: Firefox's own bright/dark setting follows`
    );
  }
});

add_task(async function test_no_colour_is_left_from_the_previous_look() {
  NirvaLooks.mode = "bright";
  NirvaLooks.look = "paper";
  const paper = await settledColours("rgb(245, 240, 230)");
  NirvaLooks.look = "cockpit";
  const cockpit = await settledColours("rgb(11, 14, 17)");
  for (const id of ["nav-bar", "TabsToolbar", "urlbar-input"]) {
    const el = document.getElementById(id);
    if (!el) {
      continue;
    }
    const style = getComputedStyle(el);
    Assert.equal(style.color, cockpit[1], `${id} text is Cockpit's`);
    Assert.notEqual(
      style.backgroundColor,
      paper[0],
      `${id} background is not Paper's`
    );
  }
  Assert.equal(cockpit[0], "rgb(11, 14, 17)", "the window is in Cockpit");
});

add_task(async function test_cockpit_is_dark_only() {
  NirvaLooks.mode = "bright";
  NirvaLooks.look = "cockpit";
  Assert.ok(NirvaLooks.modeIsFixed, "Cockpit has a fixed mode");
  Assert.deepEqual(attrs(), ["cockpit", "dark"], "Cockpit ignores Bright");
  NirvaLooks.look = "paper";
  Assert.deepEqual(attrs(), ["paper", "bright"], "the Bright choice is kept");
});

add_task(async function test_new_windows_get_the_look_before_showing() {
  NirvaLooks.mode = "dark";
  NirvaLooks.look = "paper";
  const win = await BrowserTestUtils.openNewBrowserWindow();
  Assert.deepEqual(attrs(win), ["paper", "dark"], "new window attributes");
  Assert.equal(
    (await settledColours("rgb(31, 29, 26)", win))[0],
    "rgb(31, 29, 26)",
    "new window colours"
  );
  NirvaLooks.look = "glass";
  Assert.deepEqual(attrs(win), ["glass", "dark"], "open windows all switch");
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_fonts_are_bundled() {
  const families = {
    glass: "Hanken Grotesk",
    cockpit: "Manrope",
    paper: "Figtree",
  };
  for (const [look, family] of Object.entries(families)) {
    NirvaLooks.look = look;
    Assert.ok(
      getComputedStyle(document.documentElement).fontFamily.includes(family),
      `${look} uses ${family}`
    );
  }
  for (const family of [
    "Hanken Grotesk",
    "Manrope",
    "JetBrains Mono",
    "Newsreader",
    "Figtree",
  ]) {
    const faces = await document.fonts.load(`16px "${family}"`);
    Assert.greater(faces.length, 0, `${family} loads`);
    for (const face of faces) {
      Assert.equal(face.status, "loaded", `${family} is ready`);
    }
  }
  const italic = await document.fonts.load('italic 20px "Newsreader"');
  Assert.equal(italic[0]?.style, "italic", "Newsreader italic is bundled");
});

add_task(async function test_switching_the_feature_off() {
  Services.prefs.setBoolPref("nirva.looks.enabled", false);
  Assert.deepEqual(attrs(), [null, null], "attributes are removed");
  Assert.ok(
    !Services.prefs.prefHasUserValue("ui.systemUsesDarkTheme"),
    "Firefox's bright/dark setting is released"
  );
  Services.prefs.setBoolPref("nirva.looks.enabled", true);
  Assert.equal(attrs()[0], NirvaLooks.look, "and come back when re-enabled");
});

add_task(async function test_invalid_values_are_rejected() {
  Assert.throws(() => (NirvaLooks.look = "neon"), /Unknown look/);
  Assert.throws(() => (NirvaLooks.mode = "dim"), /Unknown mode/);
  Services.prefs.setStringPref("nirva.look", "neon");
  Assert.equal(attrs()[0], "glass", "a bad stored value falls back to Glass");
});
