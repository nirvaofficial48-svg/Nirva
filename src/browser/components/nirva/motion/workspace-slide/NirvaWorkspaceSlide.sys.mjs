/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.workspaceslide.enabled";

export const NirvaWorkspaceSlide = {
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
      root.setAttribute("data-nirva-workspace-slide", "true");
      this._attachWindowListeners(win);
    } else {
      root.removeAttribute("data-nirva-workspace-slide");
      const box = win.document?.getElementById("tabbrowser-tabbox");
      box?.removeAttribute("data-nirva-workspace-sliding");
    }
  },

  _attachWindowListeners(win) {
    if (win._nirvaWorkspaceSlideAttached) {
      return;
    }
    win._nirvaWorkspaceSlideAttached = true;
    win.addEventListener("NirvaWorkspaceChanged", () => {
      this.trigger(win);
    });
  },

  trigger(win) {
    const box = win.document?.getElementById("tabbrowser-tabbox");
    if (!box || !this.enabled) {
      return;
    }
    box.removeAttribute("data-nirva-workspace-sliding");
    void box.offsetWidth;
    box.setAttribute("data-nirva-workspace-sliding", "true");
    const cleanup = event => {
      if (event && event.target !== box) {
        return;
      }
      box.removeAttribute("data-nirva-workspace-sliding");
      box.removeEventListener("animationend", cleanup);
    };
    box.addEventListener("animationend", cleanup);
    win.setTimeout(cleanup, 250);
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "nirva-workspace-slide-toggle",
      feature: "motion",
      l10nId: "nirva-command-workspace-slide-toggle",
      keywords: "motion workspace slide parallax animation",
      run: () => {
        this.enabled = !this.enabled;
      },
      isAvailable: () => true,
    });
  },
};
