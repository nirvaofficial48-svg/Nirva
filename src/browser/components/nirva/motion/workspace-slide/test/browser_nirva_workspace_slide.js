/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, CustomEvent, registerCleanupFunction, Services */

"use strict";

const { NirvaWorkspaceSlide } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/workspace-slide/NirvaWorkspaceSlide.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.workspaceslide.enabled");
  NirvaWorkspaceSlide.applyToWindow(window);
});

add_task(async function test_workspace_slide_pref_and_attribute() {
  const root = document.documentElement;

  Services.prefs.setBoolPref("nirva.workspaceslide.enabled", true);
  NirvaWorkspaceSlide.applyToWindow(window);
  Assert.equal(
    root.getAttribute("data-nirva-workspace-slide"),
    "true",
    "Attribute is present when enabled"
  );
  Assert.ok(NirvaWorkspaceSlide.enabled, "enabled getter returns true");

  Services.prefs.setBoolPref("nirva.workspaceslide.enabled", false);
  NirvaWorkspaceSlide.applyToWindow(window);
  Assert.ok(
    !root.hasAttribute("data-nirva-workspace-slide"),
    "Attribute is removed when disabled"
  );
  Assert.ok(!NirvaWorkspaceSlide.enabled, "enabled getter returns false");

  Services.prefs.clearUserPref("nirva.workspaceslide.enabled");
  NirvaWorkspaceSlide.applyToWindow(window);
});

add_task(async function test_workspace_slide_command() {
  const cmd = NirvaCommands.all(window).find(
    c => c.id === "nirva-workspace-slide-toggle"
  );
  Assert.ok(cmd, "Toggle Workspace Slide command is registered");

  const initial = NirvaWorkspaceSlide.enabled;
  cmd.run(window);
  Assert.equal(
    NirvaWorkspaceSlide.enabled,
    !initial,
    "Running the command toggles Workspace Slide"
  );
  cmd.run(window);
  Assert.equal(
    NirvaWorkspaceSlide.enabled,
    initial,
    "Running the command again restores initial state"
  );
});

add_task(async function test_workspace_slide_trigger() {
  const box = document.getElementById("tabbrowser-tabbox");
  Services.prefs.setBoolPref("nirva.workspaceslide.enabled", true);
  NirvaWorkspaceSlide.applyToWindow(window);
  NirvaWorkspaceSlide.trigger(window);
  Assert.equal(
    box.getAttribute("data-nirva-workspace-sliding"),
    "true",
    "Workspace slide attribute is set on trigger"
  );
  box.removeAttribute("data-nirva-workspace-sliding");
});

add_task(async function test_workspace_slide_on_event() {
  const box = document.getElementById("tabbrowser-tabbox");
  Services.prefs.setBoolPref("nirva.workspaceslide.enabled", true);
  NirvaWorkspaceSlide.applyToWindow(window);

  window.dispatchEvent(new CustomEvent("NirvaWorkspaceChanged"));
  Assert.equal(
    box.getAttribute("data-nirva-workspace-sliding"),
    "true",
    "Workspace slide is triggered automatically on NirvaWorkspaceChanged event"
  );
  box.removeAttribute("data-nirva-workspace-sliding");
});
