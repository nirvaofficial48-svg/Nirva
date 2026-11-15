/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaMotion } from "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs";

const PREF_ENABLED = "nirva.memory.enabled";
const PREF_MINUTES = "nirva.memory.sleepMinutes";
const CHECK_MS = 60 * 1000;

/**
 * Memory saver: tabs nobody has looked at for a while go to sleep and give
 * their memory back. They wake, as they were, when clicked. Tabs in use,
 * pinned, playing sound, sharing or on screen in a split view stay awake.
 */
export const NirvaMemory = {
  _initialized: false,
  _timer: null,

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get sleepMinutes() {
    return Math.max(1, Services.prefs.getIntPref(PREF_MINUTES, 30));
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(PREF_ENABLED, this);
    this._update();
    this._registerCommands();
  },

  observe() {
    this._update();
  },

  _update() {
    this._timer?.cancel();
    this._timer = null;
    if (!this.enabled) {
      return;
    }
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(
      () => this.sleepIdleTabsEverywhere().catch(console.error),
      CHECK_MS,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
  },

  /**
   * @param {number} [now] the time to measure from, in milliseconds
   * @returns {Promise<MozTabbrowserTab[]>} the tabs put to sleep
   */
  async sleepIdleTabsEverywhere(now = Date.now()) {
    if (!this.enabled) {
      return [];
    }
    const slept = [];
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.gBrowser) {
        slept.push(
          ...(await NirvaMotion.sleepIdleTabs(win, now, this.sleepMinutes))
        );
      }
    }
    return slept;
  },

  _registerCommands() {
    for (const on of [false, true]) {
      NirvaCommands.register({
        id: `memory-${on ? "on" : "off"}`,
        feature: "memory",
        l10nId: `nirva-command-memory-${on ? "on" : "off"}`,
        keywords: "memory saver sleep tabs ram speed",
        isAvailable: () => this.enabled !== on,
        run: () => Services.prefs.setBoolPref(PREF_ENABLED, on),
      });
    }
    NirvaCommands.register({
      id: "memory-sleep-now",
      feature: "memory",
      l10nId: "nirva-command-memory-sleep-now",
      keywords: "memory saver sleep other tabs now free ram",
      run: async win => {
        for (const tab of win.gBrowser.tabs) {
          await NirvaMotion.sleepTab(win, tab);
        }
      },
    });
  },
};
