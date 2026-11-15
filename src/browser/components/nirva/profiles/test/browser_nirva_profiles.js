/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, registerCleanupFunction, Services, window */

"use strict";

const { NirvaProfiles } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/profiles/NirvaProfiles.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { SelectableProfileService } = ChromeUtils.importESModule(
  "resource:///modules/profiles/SelectableProfileService.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.profiles.chooser-set");
});

add_task(async function test_commands() {
  const ids = NirvaCommands.all(window).map(c => c.id);
  Assert.equal(
    ids.includes("profiles-switch"),
    SelectableProfileService.isEnabled,
    "Switch profile is offered when profiles are on"
  );
  Assert.equal(
    ids.includes("profiles-new"),
    SelectableProfileService.isEnabled
  );
});

add_task(async function test_chooser_turns_on_at_the_first_start() {
  const calls = [];
  const saved = {};
  const stub = {
    groupToolkitProfile: {},
    maybeSetupDataStore: async () => calls.push("setup"),
    setShowProfileSelectorWindow: async value => calls.push(value),
  };
  for (const name of Object.keys(stub)) {
    saved[name] = Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(SelectableProfileService),
      name
    );
    Object.defineProperty(SelectableProfileService, name, {
      configurable: true,
      get: () => stub[name],
    });
  }
  const enabled = Object.getOwnPropertyDescriptor(NirvaProfiles, "enabled");
  Object.defineProperty(NirvaProfiles, "enabled", {
    configurable: true,
    get: () => true,
  });
  registerCleanupFunction(() => {
    for (const name of Object.keys(stub)) {
      delete SelectableProfileService[name];
    }
    Object.defineProperty(NirvaProfiles, "enabled", enabled);
  });

  Services.prefs.clearUserPref("nirva.profiles.chooser-set");
  Assert.ok(
    await NirvaProfiles.maybeTurnOnChooser(),
    "first start: chooser on"
  );
  Assert.deepEqual(calls, ["setup", true], "this profile is listed first");
  Assert.ok(
    !(await NirvaProfiles.maybeTurnOnChooser()),
    "only once; afterwards the chooser's own checkbox decides"
  );
});

add_task(async function test_chooser_uses_the_nirva_design() {
  for (const file of ["profile-selector.css", "profile-card.css"]) {
    const text = await (
      await fetch(`chrome://browser/content/profiles/${file}`)
    ).text();
    Assert.stringContains(text, "Nirva", `${file} is Nirva's`);
  }
});
