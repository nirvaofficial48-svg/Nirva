/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.burnaway.enabled";

export const NirvaBurnAway = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.obs.addObserver(this, "document-element-inserted");
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    this.applyToAllWindows();
    this._registerCommands();
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  set enabled(value) {
    Services.prefs.setBoolPref(PREF_ENABLED, !!value);
  },

  observe(subject, topic) {
    if (topic === "nsPref:changed") {
      this.applyToAllWindows();
    } else if (topic === "document-element-inserted") {
      const win = subject.defaultView;
      if (
        win &&
        win.top === win &&
        subject.nodePrincipal?.isSystemPrincipal &&
        subject.documentURI?.startsWith("chrome://")
      ) {
        this.applyToWindow(win);
      }
    } else if (topic === "browser-delayed-startup-finished") {
      this.applyToWindow(subject);
    }
  },

  applyToAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed && win.document?.documentURI?.startsWith("chrome://")) {
        this.applyToWindow(win);
      }
    }
  },

  applyToWindow(win) {
    const root = win.document?.documentElement;
    if (!root?.style) {
      return;
    }
    if (this.enabled) {
      root.setAttribute("data-nirva-burn-away", "true");
      this._attachWindowListeners(win);
    } else {
      root.removeAttribute("data-nirva-burn-away");
    }
  },

  _attachWindowListeners(win) {
    if (win._nirvaBurnAwayAttached) {
      return;
    }
    win._nirvaBurnAwayAttached = true;
    win.addEventListener(
      "TabClose",
      event => {
        if (!this.enabled) {
          return;
        }
        const tab = event.target;
        if (tab?.hasAttribute("nirva-burner")) {
          tab.setAttribute("nirva-burn-away", "closing");
        }
      },
      { capture: true }
    );
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "nirva-burn-away-toggle",
      feature: "motion",
      l10nId: "nirva-command-burn-away-toggle",
      keywords: "motion burner burn away tab close animation dissolve",
      run: () => {
        this.enabled = !this.enabled;
      },
      isAvailable: () => true,
    });
  },
};
