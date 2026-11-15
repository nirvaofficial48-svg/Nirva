/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SelectableProfileService:
    "resource:///modules/profiles/SelectableProfileService.sys.mjs",
});

const PREF_ENABLED = "nirva.profiles.enabled";
const PREF_CHOOSER_SET = "nirva.profiles.chooser-set";

/**
 * Profiles: one per person or account, each with its own sign-in, sync, history and
 * look. Built on the browser's selectable profiles; Nirva adds commands and turns on
 * the "who is browsing?" chooser at start once there is more than one profile.
 */
export const NirvaProfiles = {
  _initialized: false,

  get enabled() {
    return (
      Services.prefs.getBoolPref(PREF_ENABLED, true) &&
      !!lazy.SelectableProfileService?.isEnabled
    );
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registerCommands();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
  },

  observe() {
    Services.obs.removeObserver(this, "browser-delayed-startup-finished");
    this.maybeTurnOnChooser().catch(console.error);
  },

  /**
   * Turns on the "who is browsing?" chooser at start once, from the first start of a
   * profile the browser launched by itself; after that the chooser's own checkbox decides.
   *
   * @returns {Promise<boolean>} whether it was turned on now
   */
  async maybeTurnOnChooser() {
    const service = lazy.SelectableProfileService;
    if (
      !this.enabled ||
      Services.prefs.getBoolPref(PREF_CHOOSER_SET, false) ||
      !service.groupToolkitProfile
    ) {
      return false;
    }
    await service.maybeSetupDataStore();
    await service.setShowProfileSelectorWindow(true);
    Services.prefs.setBoolPref(PREF_CHOOSER_SET, true);
    return true;
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "profiles-switch",
      feature: "profiles",
      l10nId: "nirva-command-profiles-switch",
      keywords: "profile profiles switch account person who choose",
      isAvailable: win => this.enabled && !!win.gProfiles,
      run: win => win.gProfiles.manageProfiles(),
    });
    NirvaCommands.register({
      id: "profiles-new",
      feature: "profiles",
      l10nId: "nirva-command-profiles-new",
      keywords: "profile new add account person sync",
      isAvailable: win => this.enabled && !!win.gProfiles,
      run: win => win.gProfiles.createNewProfile("nirva-command"),
    });
  },
};
