/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, registerCleanupFunction, Services */

"use strict";

const { NirvaSplitSnap } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/split-snap/NirvaSplitSnap.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.splitsnap.enabled");
  NirvaSplitSnap.applyToWindow(window);
});

add_task(async function test_split_snap_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.splitsnap.enabled", true);
  NirvaSplitSnap.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-split-snap"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaSplitSnap.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.splitsnap.enabled", false);
  NirvaSplitSnap.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-split-snap"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaSplitSnap.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.splitsnap.enabled");
  NirvaSplitSnap.applyToWindow(window);
});

add_task(async function test_split_snap_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-split-snap-toggle"
  );
  Assert.ok(cmd, "Toggle Split Snap command is registered");

  const initial = NirvaSplitSnap.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaSplitSnap.enabled,
    !initial,
    "Running the command toggles Split Snap"
  );
  cmd.run(window);
  Assert.equal(
    NirvaSplitSnap.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_split_snap_lite_mode() {
  const root = document.documentElement;
  root.setAttribute("data-nirva-lite", "true");
  Services.prefs.setBoolPref("nirva.splitsnap.enabled", true);
  NirvaSplitSnap.applyToWindow(window);

  Assert.equal(
    root.getAttribute("data-nirva-split-snap"),
    "true",
    "Split snap is enabled under lite mode"
  );
  root.removeAttribute("data-nirva-lite");
});
