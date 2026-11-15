/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.welcome.enabled";
const PREF_DONE = "nirva.welcome.done";
const PREF_VERSION = "nirva.welcome.version";
// Raised whenever the guide gains steps, so profiles that saw an older one see it once more.
const GUIDE_VERSION = 2;
const WELCOME_URL = "chrome://browser/content/nirva/welcome.html";

/**
 * The first-launch chooser (S2): one full-window page, shown once per profile before the
 * first normal window, where the owner picks a look and a mode.
 */
export const NirvaWelcome = {
  URL: WELCOME_URL,

  _initialized: false,

  /** Registers this feature's commands. The chooser itself is shown by showIfFirstRun. */
  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    NirvaCommands.register({
      id: "welcome-reset",
      feature: "welcome",
      l10nId: "nirva-command-welcome-reset",
      keywords: "first launch welcome reset",
      run: () => this.reset(),
      isAvailable: () => Services.prefs.getBoolPref(PREF_ENABLED, true),
    });
    NirvaCommands.register({
      id: "welcome-open",
      feature: "welcome",
      l10nId: "nirva-command-welcome-open",
      keywords:
        "welcome guide tour first run import chrome bookmarks passwords look privacy",
      run: () => this.open(),
      isAvailable: () => Services.prefs.getBoolPref(PREF_ENABLED, true),
    });
  },

  get done() {
    return (
      Services.prefs.getBoolPref(PREF_DONE, false) &&
      Services.prefs.getIntPref(PREF_VERSION, 0) >= GUIDE_VERSION
    );
  },

  shouldShow() {
    return (
      Services.prefs.getBoolPref(PREF_ENABLED, true) &&
      !this.done &&
      // Firefox's own test runs have nobody to press Continue.
      !Cu.isInAutomation &&
      !Services.appinfo.inSafeMode
    );
  },

  /**
   * Shows the chooser if this profile has not seen it, and returns only when it is closed,
   * so the choice is in place before the first normal window opens.
   */
  showIfFirstRun() {
    if (!this.shouldShow()) {
      return;
    }
    try {
      this.open({ modal: true });
    } finally {
      // Once, whatever happened: a broken chooser must not come back at every start.
      this.markDone();
    }
  },

  /**
   * @param {object} [options]
   * @param {boolean} [options.modal] wait here until the window is closed
   * @returns {Window} the chooser window
   */
  open({ modal = false } = {}) {
    return Services.ww.openWindow(
      null,
      WELCOME_URL,
      "_blank",
      `chrome,dialog=no,resizable,centerscreen,width=1200,height=820${modal ? ",modal" : ""}`,
      null
    );
  },

  markDone() {
    Services.prefs.setBoolPref(PREF_DONE, true);
    Services.prefs.setIntPref(PREF_VERSION, GUIDE_VERSION);
  },

  /** Makes the chooser appear again at the next start. Used by Theme studio. */
  reset() {
    Services.prefs.clearUserPref(PREF_DONE);
    Services.prefs.clearUserPref(PREF_VERSION);
  },
};
