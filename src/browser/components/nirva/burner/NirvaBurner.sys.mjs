/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  ContextualIdentityService:
    "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(["branding/brand.ftl", "browser/nirva/burner.ftl"], true)
);

const PREF_ENABLED = "nirva.burner.enabled";
// Containers that were alive when the browser last wrote this; cleared at the next start.
const PREF_CONTAINERS = "nirva.burner.containers";
// "YYYY-MM-DD|count": how many burners were erased on that day, for the home screen.
const PREF_WIPED = "nirva.burner.wiped";
const ABOUT_URL = "chrome://browser/content/nirva/burner.html";
const TAB_ATTRIBUTE = "nirva-burner";
const SESSION_KEY = "nirva-burner";
const WIPED_TOPIC = "nirva-burner-wiped";
const CONTEXT_ITEM_ID = "nirva-burner-context-link";
const CHIP_ID = "nirva-burner-chip";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
export const FLAME_PATH =
  "M12 3c1 3.2 4.5 4.8 4.5 9a4.5 4.5 0 0 1-9 0c0-1.6.7-2.8 1.6-3.7.3 1.2.9 1.9 1.7 2C10.6 8 11 5.4 12 3z";

function selectedTab(win) {
  return win?.gBrowser?.selectedTab;
}

function webURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (_error) {
    return null;
  }
}

/**
 * Temporary tabs, each in its own container. When the last tab of a burner
 * closes, the container's cookies and site data are erased with it.
 */
export const NirvaBurner = {
  _initialized: false,
  // Containers with open burner tabs.
  _alive: new Set(),
  // Containers already erased; a tab that reappears in one is closed again.
  _dead: new Set(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._eraseLeftovers();
    const command = (id, keywords, isAvailable, run) =>
      NirvaCommands.register({
        id: `burner-${id}`,
        feature: "burner",
        l10nId: `nirva-command-burner-${id}`,
        keywords,
        isAvailable,
        run,
      });
    command(
      "new",
      "burner tab temporary throwaway disposable isolated new",
      win => this.canOpen(win),
      win => this.open(win)
    );
    command(
      "reopen",
      "burner reopen this page temporary isolated",
      win => this.canReopen(win),
      win => this.reopen(win)
    );
    command(
      "close-all",
      "burner close all erase wipe temporary tabs",
      win => this.enabled && !!this._alive.size && !!win.gBrowser,
      () => this.closeAll()
    );
    command(
      "about",
      "burner tabs explain what is erased help",
      win => this.enabled && !!win.gBrowser,
      win => this.openAbout(win)
    );
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "domwindowclosed");
    Services.obs.addObserver(this, "sessionstore-closed-objects-changed");
    Services.obs.addObserver(this, "quit-application-granted");
  },

  observe(subject, topic) {
    switch (topic) {
      case "browser-delayed-startup-finished":
        this._setupWindow(subject);
        break;
      case "domwindowclosed":
        Services.tm.dispatchToMainThread(() => this._sweep());
        break;
      case "sessionstore-closed-objects-changed":
        this._forgetClosed();
        break;
      case "quit-application-granted":
        for (const id of this._alive) {
          this._erase(id);
        }
        break;
    }
  },

  // Data left by burners that were open at the last exit or crash.
  _eraseLeftovers() {
    let ids = [];
    try {
      ids = JSON.parse(Services.prefs.getStringPref(PREF_CONTAINERS, "[]"));
    } catch (_error) {}
    for (const id of Array.isArray(ids) ? ids : []) {
      if (Number.isSafeInteger(id) && id > 0) {
        this._erase(id);
        this._dead.add(id);
      }
    }
    Services.prefs.clearUserPref(PREF_CONTAINERS);
  },

  _remember() {
    if (this._alive.size) {
      Services.prefs.setStringPref(
        PREF_CONTAINERS,
        JSON.stringify([...this._alive])
      );
    } else {
      Services.prefs.clearUserPref(PREF_CONTAINERS);
    }
  },

  _erase(userContextId) {
    try {
      if (!lazy.ContextualIdentityService.remove(userContextId)) {
        Services.clearData.deleteDataFromOriginAttributesPattern({
          userContextId,
        });
      }
    } catch (error) {
      console.error("Nirva could not erase a burner tab's data", error);
    }
  },

  get wipedToday() {
    const [day, count] = Services.prefs
      .getStringPref(PREF_WIPED, "")
      .split("|");
    return day == new Date().toDateString() ? Number(count) || 0 : 0;
  },

  isBurnerContext(userContextId) {
    return this._alive.has(userContextId);
  },

  isBurner(tab) {
    return (
      !!tab &&
      (tab.hasAttribute(TAB_ATTRIBUTE) || this._alive.has(tab.userContextId))
    );
  },

  canOpen(win) {
    return (
      this.enabled &&
      !!win?.gBrowser &&
      !lazy.PrivateBrowsingUtils.isWindowPrivate(win)
    );
  },

  canReopen(win) {
    const tab = selectedTab(win);
    return (
      this.canOpen(win) &&
      !this.isBurner(tab) &&
      !!webURL(tab?.linkedBrowser.currentURI?.spec)
    );
  },

  _mark(tab) {
    tab.setAttribute(TAB_ATTRIBUTE, "true");
    try {
      lazy.SessionStore.setCustomTabValue(tab, SESSION_KEY, "1");
    } catch (_error) {}
    const browser = tab.linkedBrowser;
    browser?.setAttribute("disableglobalhistory", "true");
    this._noHistory(browser);
    const win = tab.documentGlobal;
    if (win?.gBrowser?.selectedTab == tab) {
      this._updateChip(win);
    }
  },

  _noHistory(browser) {
    try {
      if (browser?.browsingContext?.useGlobalHistory) {
        browser.browsingContext.useGlobalHistory = false;
      }
    } catch (_error) {}
  },

  /**
   * Opens a new burner tab, on the explainer page or on a web address.
   *
   * @param {Window} win
   * @param {string} [url]
   * @returns {MozTabbrowserTab|null}
   */
  open(win, url = null) {
    if (!this.canOpen(win)) {
      return null;
    }
    const identity = lazy.ContextualIdentityService.create(
      lazy.l10n.formatValueSync("nirva-burner-container-name"),
      "fingerprint",
      "orange"
    );
    const id = identity.userContextId;
    this._alive.add(id);
    this._remember();
    const tab = win.gBrowser.addTrustedTab(webURL(url) || ABOUT_URL, {
      userContextId: id,
    });
    this._mark(tab);
    win.gBrowser.selectedTab = tab;
    if (!webURL(url)) {
      // The explainer invites an address, so the address bar is ready for one.
      win.gURLBar?.select();
    }
    return tab;
  },

  openAbout(win) {
    win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(ABOUT_URL);
  },

  // Moves the current page into a new burner tab and closes the ordinary one.
  reopen(win) {
    if (!this.canReopen(win)) {
      return null;
    }
    const original = selectedTab(win);
    const tab = this.open(win, original.linkedBrowser.currentURI.spec);
    if (tab) {
      win.gBrowser.removeTab(original);
    }
    return tab;
  },

  closeAll() {
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      for (const tab of [...(win.gBrowser?.tabs || [])]) {
        if (this.isBurner(tab)) {
          this._close(win, tab);
        }
      }
    }
  },

  _close(win, tab) {
    if (win.gBrowser.tabs.length == 1) {
      win.gBrowser.addTrustedTab("about:blank");
    }
    win.gBrowser.removeTab(tab, {
      animate: false,
      skipPermitUnload: true,
      skipSessionStore: true,
    });
  },

  /**
   * Takes burner tabs out of session state that is about to be written to
   * disk, including the records of closed tabs and closed windows.
   *
   * @param {object} state Browser state from SessionStore; changed in place.
   */
  filterSessionState(state) {
    const burner = tab =>
      !!tab?.extData?.[SESSION_KEY] ||
      this._alive.has(tab?.userContextId) ||
      this._dead.has(tab?.userContextId);
    try {
      for (const win of [
        ...(state?.windows || []),
        ...(state?._closedWindows || []),
      ]) {
        if (Array.isArray(win._closedTabs) && win._closedTabs.length) {
          const closed = win._closedTabs.filter(entry => !burner(entry.state));
          if (closed.length != win._closedTabs.length) {
            win._closedTabs = closed;
          }
        }
        if (!Array.isArray(win.tabs) || !win.tabs.some(burner)) {
          continue;
        }
        const selected = win.tabs[(win.selected || 1) - 1];
        const removedBefore = win.tabs
          .slice(0, (win.selected || 1) - 1)
          .filter(burner).length;
        win.tabs = win.tabs.filter(tab => !burner(tab));
        const index = win.tabs.indexOf(selected);
        win.selected =
          index >= 0
            ? index + 1
            : Math.max(
                1,
                Math.min((win.selected || 1) - removedBefore, win.tabs.length)
              );
      }
    } catch (error) {
      console.error(
        "Nirva could not leave burner tabs out of the session",
        error
      );
    }
  },

  _setupWindow(win) {
    const doc = win?.document;
    const popup = doc?.getElementById("contentAreaContextMenu");
    if (!win?.gBrowser || !popup || doc.getElementById(CONTEXT_ITEM_ID)) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/burner.ftl");
    const item = doc.createXULElement("menuitem");
    item.id = CONTEXT_ITEM_ID;
    item.hidden = true;
    doc.l10n.setAttributes(item, "nirva-burner-context-link");
    item.addEventListener("command", () =>
      this.open(win, win.gContextMenu?.linkURL)
    );
    popup.insertBefore(item, doc.getElementById("context-openlinkprivate"));
    popup.addEventListener("popupshowing", event => {
      if (event.target == popup) {
        item.hidden =
          !this.canOpen(win) ||
          !win.gContextMenu?.onLink ||
          !webURL(win.gContextMenu.linkURL);
      }
    });

    // The explainer is a start page: the address bar stays empty on it.
    if (!win.gInitialPages?.includes(ABOUT_URL)) {
      win.gInitialPages?.push(ABOUT_URL);
    }
    this._addChip(win);
    const tabs = win.gBrowser.tabContainer;
    tabs.addEventListener("TabSelect", () => this._updateChip(win));
    tabs.addEventListener("TabOpen", event =>
      this._onTabOpen(win, event.target)
    );
    tabs.addEventListener("TabClose", event => {
      if (this.isBurner(event.target) && !event.detail?.adoptedBy) {
        Services.tm.dispatchToMainThread(() => this._sweep());
      }
    });
    win.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress) => {
        if (
          webProgress.isTopLevel &&
          this._alive.has(win.gBrowser.getTabForBrowser(browser)?.userContextId)
        ) {
          this._noHistory(browser);
        }
      },
    });
    for (const tab of [...win.gBrowser.tabs]) {
      this._onTabOpen(win, tab);
    }
  },

  // The marker in the address bar that says the page in front is in a burner tab.
  _addChip(win) {
    const doc = win.document;
    const container = doc.querySelector("#urlbar .urlbar-input-container");
    if (!container || doc.getElementById(CHIP_ID)) {
      return;
    }
    const chip = doc.createElementNS(HTML_NS, "button");
    chip.id = CHIP_ID;
    chip.type = "button";
    chip.hidden = true;
    const flame = doc.createElementNS(SVG_NS, "svg");
    for (const [name, value] of Object.entries({
      width: 14,
      height: 14,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.8,
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    })) {
      flame.setAttribute(name, value);
    }
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", FLAME_PATH);
    flame.append(path);
    const label = doc.createElementNS(HTML_NS, "span");
    label.className = "nirva-burner-chip-label";
    chip.append(flame, label);
    doc.l10n.setAttributes(chip, "nirva-burner-chip");
    doc.l10n.setAttributes(label, "nirva-burner-chip-label");
    chip.addEventListener("click", () => this.openAbout(win));
    container.append(chip);
    this._updateChip(win);
  },

  _updateChip(win) {
    const chip = win.document?.getElementById(CHIP_ID);
    if (chip) {
      const burner = this.isBurner(selectedTab(win));
      chip.hidden = !this.enabled || !burner;
      chip.parentNode.toggleAttribute("nirva-burner", burner);
    }
  },

  _onTabOpen(win, tab) {
    const id = tab.userContextId;
    if (this._alive.has(id)) {
      // A link opened from a burner tab stays inside the same burner.
      this._mark(tab);
    } else if (this._dead.has(id)) {
      // Session restore or "reopen closed window" brought back an erased burner.
      Services.tm.dispatchToMainThread(() => {
        if (tab.isConnected && !win.closed) {
          this._close(win, tab);
        }
      });
    }
  },

  // Erases every burner that no longer has an open tab.
  _sweep() {
    const open = new Set();
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      for (const tab of win.gBrowser?.tabs || []) {
        if (!tab.closing) {
          open.add(tab.userContextId);
        }
      }
    }
    for (const id of [...this._alive]) {
      if (!open.has(id)) {
        this._alive.delete(id);
        this._dead.add(id);
        this._erase(id);
        this._remember();
        this._forgetClosed();
        Services.prefs.setStringPref(
          PREF_WIPED,
          `${new Date().toDateString()}|${this.wipedToday + 1}`
        );
        Services.obs.notifyObservers(null, WIPED_TOPIC, String(id));
      }
    }
  },

  // Burner tabs must not come back through "reopen closed tab".
  _forgetClosed() {
    if (this._forgetting) {
      return;
    }
    this._forgetting = true;
    try {
      for (const win of lazy.BrowserWindowTracker.orderedWindows) {
        for (const closed of lazy.SessionStore.getClosedTabDataForWindow(win)) {
          const id = closed.state?.userContextId;
          if (
            closed.state?.extData?.[SESSION_KEY] ||
            this._alive.has(id) ||
            this._dead.has(id)
          ) {
            lazy.SessionStore.forgetClosedTabById(closed.closedId);
          }
        }
      }
    } catch (error) {
      console.error("Nirva could not forget a closed burner tab", error);
    } finally {
      this._forgetting = false;
    }
  },
};
