/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.pagetransitions.enabled";

export const NirvaPageTransitions = {
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
      root.setAttribute("data-nirva-page-transitions", "true");
      this._attachWindowListeners(win);
    } else {
      root.removeAttribute("data-nirva-page-transitions");
      root.removeAttribute("data-nirva-page-loading");
    }
  },

  _attachWindowListeners(win) {
    if (win._nirvaPageTransitionsAttached) {
      return;
    }
    const tabContainer = win.gBrowser?.tabContainer;
    if (!tabContainer) {
      return;
    }
    win._nirvaPageTransitionsAttached = true;
    tabContainer.addEventListener("TabAttrModified", event => {
      if (!this.enabled) {
        return;
      }
      const tab = event.target;
      const isSelected = tab?.selected || tab === win.gBrowser?.selectedTab;
      if (isSelected && event.detail?.changed?.includes("busy")) {
        this.setLoading(win, tab.hasAttribute("busy"));
      }
    });
    tabContainer.addEventListener("TabSelect", event => {
      if (!this.enabled) {
        return;
      }
      const tab = event.target || win.gBrowser?.selectedTab;
      this.setLoading(win, !!tab?.hasAttribute("busy"));
    });
    tabContainer.addEventListener("TabClose", () => {
      if (!this.enabled) {
        return;
      }
      win.setTimeout(() => {
        if (!win.closed && win.gBrowser?.selectedTab) {
          this.setLoading(win, win.gBrowser.selectedTab.hasAttribute("busy"));
        }
      }, 0);
    });
  },

  setLoading(win, loading) {
    const root = win.document?.documentElement;
    if (!root?.style || !this.enabled) {
      return;
    }
    if (loading) {
      root.setAttribute("data-nirva-page-loading", "true");
    } else {
      root.removeAttribute("data-nirva-page-loading");
    }
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "nirva-page-transitions-toggle",
      feature: "motion",
      l10nId: "nirva-command-page-transitions-toggle",
      keywords: "motion page transition crossfade navigation",
      run: () => {
        this.enabled = !this.enabled;
      },
      isAvailable: () => true,
    });
  },
};
