/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

/**
 * Every window Nirva styles: the top-level windows, and Nirva's own pages that
 * are open in tabs (the home screen, Theme Studio and the like).
 *
 * @yields {Window}
 */
export function* nirvaInterfaceWindows() {
  for (const win of Services.wm.getEnumerator(null)) {
    if (win.closed) {
      continue;
    }
    yield win;
    for (const browser of win.gBrowser?.browsers ?? []) {
      const page = browser.isRemoteBrowser ? null : browser.contentWindow;
      if (
        page?.document?.nodePrincipal.isSystemPrincipal &&
        page.document.documentURI.startsWith("chrome://")
      ) {
        yield page;
      }
    }
  }
}

const PREF_ENABLED = "nirva.looks.enabled";
const PREF_LOOK = "nirva.look";
const PREF_MODE = "nirva.mode";
// Firefox's own switch for "the computer is in dark mode": 1 dark, 0 bright, unset = ask the system.
const PREF_FORCE_SCHEME = "ui.systemUsesDarkTheme";

const LOOKS = ["glass", "cockpit", "paper"];
const MODES = ["bright", "dark", "system"];
const DARK_ONLY_LOOKS = ["cockpit"];

/**
 * Marks every browser interface window with data-nirva-look and data-nirva-mode, and keeps
 * them in step with the nirva.look and nirva.mode preferences. All styling hangs off these
 * two attributes (see browser/themes/shared/nirva/tokens.css).
 */
export const NirvaLooks = {
  LOOKS,
  MODES,
  _initialized: false,
  _watched: new WeakSet(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    for (const pref of [PREF_ENABLED, PREF_LOOK, PREF_MODE]) {
      Services.prefs.addObserver(pref, this);
    }
    Services.obs.addObserver(this, "document-element-inserted");
    this.applyToAllWindows();
    this._registerCommands();
  },

  _registerCommands() {
    NirvaCommands.registerAll([
      ...LOOKS.map(look => ({
        id: `look-${look}`,
        feature: "looks",
        l10nId: `nirva-command-look-${look}`,
        keywords: "theme style appearance",
        run: () => (this.look = look),
        isAvailable: () => this.enabled,
      })),
      ...MODES.map(mode => ({
        id: `mode-${mode}`,
        feature: "looks",
        l10nId: `nirva-command-mode-${mode}`,
        keywords: "theme light night mode look",
        run: () => (this.mode = mode),
        // Cockpit has no bright version, so there is nothing to choose.
        isAvailable: () => this.enabled && !this.modeIsFixed,
      })),
    ]);
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get look() {
    const look = Services.prefs.getStringPref(PREF_LOOK, LOOKS[0]);
    return LOOKS.includes(look) ? look : LOOKS[0];
  },

  set look(value) {
    if (!LOOKS.includes(value)) {
      throw new Error(`Unknown look: ${value}`);
    }
    Services.prefs.setStringPref(PREF_LOOK, value);
  },

  /** The mode setting as chosen: bright, dark or system. */
  get mode() {
    const mode = Services.prefs.getStringPref(PREF_MODE, "system");
    return MODES.includes(mode) ? mode : "system";
  },

  set mode(value) {
    if (!MODES.includes(value)) {
      throw new Error(`Unknown mode: ${value}`);
    }
    Services.prefs.setStringPref(PREF_MODE, value);
  },

  /** True when the current look has no bright version. */
  get modeIsFixed() {
    return DARK_ONLY_LOOKS.includes(this.look);
  },

  /**
   * The mode actually shown in a window: bright or dark.
   *
   * @param {Window} win
   */
  resolvedMode(win) {
    if (this.modeIsFixed) {
      return "dark";
    }
    if (this.mode != "system") {
      return this.mode;
    }
    return win.matchMedia("(-moz-system-dark-theme)").matches
      ? "dark"
      : "bright";
  },

  observe(subject, topic) {
    if (topic == "nsPref:changed") {
      this.applyToAllWindows();
    } else if (topic == "document-element-inserted") {
      const win = subject.defaultView;
      if (win && this._isInterfaceWindow(win)) {
        this.applyToWindow(win);
      }
    }
  },

  _isInterfaceWindow(win) {
    return (
      win.top === win &&
      win.document.nodePrincipal.isSystemPrincipal &&
      win.document.documentURI.startsWith("chrome://")
    );
  },

  applyToAllWindows() {
    this._syncColorScheme();
    for (const win of nirvaInterfaceWindows()) {
      if (this._isInterfaceWindow(win)) {
        this.applyToWindow(win);
      }
    }
  },

  /**
   * Firefox's menus, built-in pages and websites follow the same bright or dark choice.
   */
  _syncColorScheme() {
    let forced = null;
    if (this.enabled) {
      if (this.modeIsFixed || this.mode == "dark") {
        forced = 1;
      } else if (this.mode == "bright") {
        forced = 0;
      }
    }
    if (forced === null) {
      Services.prefs.clearUserPref(PREF_FORCE_SCHEME);
    } else if (Services.prefs.getIntPref(PREF_FORCE_SCHEME, -1) !== forced) {
      Services.prefs.setIntPref(PREF_FORCE_SCHEME, forced);
    }
  },

  applyToWindow(win) {
    const root = win.document.documentElement;
    if (!root) {
      return;
    }
    if (!this._watched.has(win)) {
      this._watched.add(win);
      win
        .matchMedia("(-moz-system-dark-theme)")
        .addEventListener("change", () => this.applyToWindow(win));
    }
    if (!this.enabled) {
      root.removeAttribute("data-nirva-look");
      root.removeAttribute("data-nirva-mode");
      return;
    }
    root.setAttribute("data-nirva-look", this.look);
    root.setAttribute("data-nirva-mode", this.resolvedMode(win));
  },
};
