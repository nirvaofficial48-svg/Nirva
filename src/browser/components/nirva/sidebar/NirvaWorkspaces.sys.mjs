/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/sidebar.ftl"], true)
);

const PREF_ENABLED = "nirva.workspaces.enabled";
const PREF_LIST = "nirva.workspaces.list";
const TAB_KEY = "nirva-workspace";
const WINDOW_KEY = "nirva-workspace";
const DEFAULT_ID = "home";
export const WORKSPACES_CHANGED_TOPIC = "nirva-workspaces-changed";

/**
 * Workspaces: named sets of tabs. Each window shows one workspace at a time; tabs of the
 * others stay open but hidden. Pinned tabs belong to every workspace.
 *
 * The list of workspaces is stored in the nirva.workspaces.list preference. The workspace of
 * each tab and the active workspace of each window are stored with the session, so they
 * survive a restart.
 */
export const NirvaWorkspaces = {
  DEFAULT_ID,
  _lastSelected: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  /** @returns {{id: string, name: string}[]} never empty */
  get list() {
    let list = [];
    try {
      list = JSON.parse(Services.prefs.getStringPref(PREF_LIST, "") || "[]");
    } catch (e) {
      console.error("Nirva: stored workspace list is unreadable", e);
    }
    list = Array.isArray(list)
      ? list.filter(w => typeof w?.id == "string" && typeof w?.name == "string")
      : [];
    if (!list.length) {
      list = [
        {
          id: DEFAULT_ID,
          name: lazy.l10n.formatValueSync("nirva-workspace-default-name"),
        },
      ];
    }
    return list;
  },

  _save(list) {
    Services.prefs.setStringPref(PREF_LIST, JSON.stringify(list));
    Services.obs.notifyObservers(null, WORKSPACES_CHANGED_TOPIC);
  },

  _has(id) {
    return this.list.some(w => w.id == id);
  },

  _cleanName(name) {
    const clean = String(name ?? "")
      .trim()
      .slice(0, 40);
    if (!clean) {
      throw new Error("A workspace needs a name");
    }
    return clean;
  },

  /**
   * @param {string} name
   * @returns {string} the id of the new workspace
   */
  create(name) {
    const list = this.list;
    const id = "w" + Services.uuid.generateUUID().toString().slice(1, 9);
    list.push({ id, name: this._cleanName(name) });
    this._save(list);
    return id;
  },

  rename(id, name) {
    const list = this.list;
    const workspace = list.find(w => w.id == id);
    if (!workspace) {
      throw new Error(`No such workspace: ${id}`);
    }
    workspace.name = this._cleanName(name);
    this._save(list);
  },

  /**
   * Deletes a workspace. Its tabs are kept: they move to the first remaining workspace.
   * The last workspace cannot be deleted.
   *
   * @param {string} id
   */
  remove(id) {
    const list = this.list;
    if (list.length < 2 || !list.some(w => w.id == id)) {
      throw new Error("This workspace cannot be deleted");
    }
    const remaining = list.filter(w => w.id != id);
    const fallback = remaining[0].id;
    this._save(remaining);
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.closed || !win.gBrowser) {
        continue;
      }
      for (const tab of win.gBrowser.tabs) {
        if (this._storedWorkspaceOf(tab) == id) {
          this.assign(tab, fallback);
        }
      }
      if (this._storedActive(win) == id) {
        this._setActive(win, fallback);
      }
      this.updateWindow(win);
    }
  },

  _storedWorkspaceOf(tab) {
    return lazy.SessionStore.getCustomTabValue(tab, TAB_KEY) || "";
  },

  /**
   * The workspace a tab belongs to. Tabs never assigned belong to the first workspace.
   *
   * @param {MozTabbrowserTab} tab
   */
  workspaceOf(tab) {
    const id = this._storedWorkspaceOf(tab);
    return id && this._has(id) ? id : this.list[0].id;
  },

  assign(tab, id) {
    if (!this._has(id)) {
      throw new Error(`No such workspace: ${id}`);
    }
    lazy.SessionStore.setCustomTabValue(tab, TAB_KEY, id);
  },

  // The session store refuses windows it is not tracking yet, so keep a copy in memory.
  _active: new WeakMap(),

  _storedActive(win) {
    if (this._active.has(win)) {
      return this._active.get(win);
    }
    try {
      return lazy.SessionStore.getCustomWindowValue(win, WINDOW_KEY) || "";
    } catch (e) {
      return "";
    }
  },

  _setActive(win, id) {
    this._active.set(win, id);
    try {
      lazy.SessionStore.setCustomWindowValue(win, WINDOW_KEY, id);
    } catch (e) {
      // Not tracked by the session store (yet); the in-memory copy is used.
    }
  },

  /**
   * The workspace a window is showing.
   *
   * @param {Window} win
   */
  getActive(win) {
    const id = this._storedActive(win);
    return id && this._has(id) ? id : this.list[0].id;
  },

  /**
   * Shows another workspace in a window.
   *
   * @param {Window} win a browser window
   * @param {string} id
   */
  switchTo(win, id) {
    if (!this._has(id)) {
      throw new Error(`No such workspace: ${id}`);
    }
    const { gBrowser } = win;
    const previous = this.getActive(win);
    if (previous == id) {
      this.updateWindow(win);
      return;
    }
    const remembered = this._lastSelected.get(win) ?? new Map();
    this._lastSelected.set(win, remembered);
    if (!gBrowser.selectedTab.pinned) {
      remembered.set(previous, gBrowser.selectedTab);
    }

    this._setActive(win, id);
    const candidates = gBrowser.tabs.filter(
      t => !t.pinned && !t.closing && this.workspaceOf(t) == id
    );
    let target = remembered.get(id);
    if (!candidates.includes(target)) {
      target = candidates[0];
    }
    if (!target && !gBrowser.selectedTab.pinned) {
      // An empty workspace starts with a fresh tab. TabOpen assigns it to the workspace.
      target = gBrowser.addTrustedTab(win.BROWSER_NEW_TAB_URL);
    }
    if (target) {
      gBrowser.showTab(target);
      gBrowser.selectedTab = target;
    }
    this.updateWindow(win);
  },

  /**
   * Makes the visible tabs of a window match its active workspace.
   *
   * @param {Window} win a browser window
   */
  updateWindow(win) {
    const { gBrowser } = win;
    if (!gBrowser) {
      return;
    }
    const active = this.getActive(win);
    for (const tab of gBrowser.tabs) {
      if (tab.pinned || tab.closing) {
        continue;
      }
      if (!this.enabled || this.workspaceOf(tab) == active) {
        if (tab.hasAttribute("nirva-workspace-hidden")) {
          tab.removeAttribute("nirva-workspace-hidden");
          gBrowser.showTab(tab);
        }
      } else if (!tab.selected) {
        gBrowser.hideTab(tab);
        if (tab.hidden) {
          tab.setAttribute("nirva-workspace-hidden", "true");
        }
      }
    }
    win.dispatchEvent(new win.CustomEvent("NirvaWorkspaceChanged"));
  },

  /**
   * Called once for every browser window.
   *
   * @param {Window} win
   */
  initWindow(win) {
    const { gBrowser } = win;
    const container = gBrowser.tabContainer;
    container.addEventListener("TabOpen", event => {
      const tab = event.target;
      if (!this._storedWorkspaceOf(tab)) {
        this.assign(tab, this.getActive(win));
      }
    });
    container.addEventListener("TabSelect", event => {
      const tab = event.target;
      if (!this.enabled || tab.pinned) {
        return;
      }
      // Something outside the sidebar selected a tab of another workspace (a restored
      // session, a link from another program): follow it.
      const id = this.workspaceOf(tab);
      if (id != this.getActive(win)) {
        this._setActive(win, id);
        this.updateWindow(win);
      }
    });
    win.addEventListener("SSWindowRestored", () => {
      // A restored session brings its own active workspace.
      this._active.delete(win);
      this.updateWindow(win);
    });
    container.addEventListener("SSTabRestoring", () => this.updateWindow(win));
    for (const tab of gBrowser.tabs) {
      if (!this._storedWorkspaceOf(tab) && !tab.pinned) {
        this.assign(tab, this.getActive(win));
      }
    }
    this.updateWindow(win);
  },
};
