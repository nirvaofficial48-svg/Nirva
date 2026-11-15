/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.morph.enabled";

export const NirvaMorph = {
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
      root.setAttribute("data-nirva-morph", "true");
      this._attachWindowListeners(win);
    } else {
      root.removeAttribute("data-nirva-morph");
    }
  },

  _attachWindowListeners(win) {
    if (win._nirvaMorphAttached) {
      return;
    }
    win._nirvaMorphAttached = true;

    win.addEventListener(
      "TabOpen",
      event => {
        if (!this.enabled) {
          return;
        }
        const tab = event.target;
        if (!tab) {
          return;
        }
        tab.setAttribute("nirva-morph", "opening");
        const onEnd = event => {
          if (event && event.target !== tab) {
            return;
          }
          tab.removeEventListener("animationend", onEnd);
          if (!tab.isConnected || win.closed) {
            return;
          }
          if (tab.getAttribute("nirva-morph") === "opening") {
            tab.removeAttribute("nirva-morph");
          }
        };
        tab.addEventListener("animationend", onEnd);
        win.setTimeout(onEnd, 240);
      },
      { capture: true }
    );

    win.addEventListener(
      "TabClose",
      event => {
        if (!this.enabled) {
          return;
        }
        const tab = event.target;
        if (tab) {
          tab.setAttribute("nirva-morph", "closing");
        }
      },
      { capture: true }
    );
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "nirva-morph-toggle",
      feature: "morph",
      l10nId: "nirva-command-morph-toggle",
      keywords: "motion morph tab link transition animation grow shrink",
      run: () => {
        this.enabled = !this.enabled;
      },
      isAvailable: () => true,
    });
  },
};
