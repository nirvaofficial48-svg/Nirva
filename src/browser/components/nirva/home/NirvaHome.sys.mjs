/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AboutNewTab: "resource:///modules/AboutNewTab.sys.mjs",
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  NirvaBurner: "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs",
  NirvaClipsStore:
    "moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs",
  NirvaPrivacyRules:
    "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs",
  NirvaTimeTravel:
    "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs",
  NirvaTrust: "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/home.ftl"], true)
);

export const HOME_URL = "chrome://browser/content/nirva/home.html";
export const HOME_CHANGE_TOPIC = "nirva-home-changed";
export const HOME_WIDGETS = [
  "todo",
  "focus",
  "clips",
  "note",
  "countdown",
  "computer",
  "reading",
  "energy",
  "privacy",
  "ribbon",
];

const PREF_ENABLED = "nirva.home.enabled";
const PREF_DATA = "nirva.home.data";
const PREF_READING = "nirva.home.reading";
const PREF_HOMEPAGE = "browser.startup.homepage";
const FOCUS_MS = 25 * 60 * 1000;
const MAX_READING = 12;
const LOCK_NOTICE = "nirva-home-focus-locked";

function webURL(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch (_error) {
    return null;
  }
}

function cleanHost(value) {
  const host = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#:].*$/, "")
    .replace(/^www\./, "");
  return /^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host) ? host : "";
}

function clip(value, max) {
  return String(value ?? "").slice(0, max);
}

function normalize(raw) {
  const d = raw && typeof raw == "object" ? raw : {};
  const list = value => (Array.isArray(value) ? value : []);
  return {
    todo: list(d.todo)
      .filter(t => t && typeof t.id == "string" && typeof t.text == "string")
      .slice(0, 50)
      .map(t => ({ id: t.id, text: clip(t.text, 200), done: !!t.done })),
    note: clip(d.note, 2000),
    countdown: {
      title: clip(d.countdown?.title, 60),
      date: /^\d{4}-\d{2}-\d{2}$/.test(d.countdown?.date)
        ? d.countdown.date
        : "",
    },
    links: list(d.links)
      .filter(l => l && typeof l.id == "string" && webURL(l.url))
      .slice(0, 12)
      .map(l => ({ id: l.id, url: l.url, title: clip(l.title, 40) })),
    widgets: Object.fromEntries(
      HOME_WIDGETS.filter(id => typeof d.widgets?.[id] == "boolean").map(id => [
        id,
        d.widgets[id],
      ])
    ),
    focusSites: [...new Set(list(d.focusSites).map(cleanHost))]
      .filter(Boolean)
      .slice(0, 30),
  };
}

/**
 * The home screen: Nirva's own new-tab and start page. This module keeps what
 * the person put on it and gathers what its widgets show. Everything stays on
 * this computer.
 */
export const NirvaHome = {
  _initialized: false,
  _nextId: 1,
  _focus: { running: false, remainingMs: FOCUS_MS, endsAt: 0 },
  _focusTimer: null,

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaReading", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/home/NirvaReadingParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/home/NirvaReadingChild.sys.mjs",
        events: { pagehide: {}, visibilitychange: {} },
      },
      messageManagerGroups: ["browsers"],
      // The page side sends an address, a title and a number; the window side
      // checks all three and applies the privacy rules before keeping anything.
      safeForUntrustedWebProcess: true,
    });
    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_DATA, this);
    Services.prefs.addObserver(PREF_READING, this);
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "browser:purge-session-history");
    this._applyPages();
    NirvaCommands.register({
      id: "home-open",
      feature: "home",
      l10nId: "nirva-command-home-open",
      keywords: "home start page new tab widgets",
      isAvailable: win => this.enabled && !!win.gBrowser,
      run: win => this.open(win),
    });
    NirvaCommands.register({
      id: "home-edit",
      feature: "home",
      l10nId: "nirva-command-home-edit",
      keywords: "home edit widgets customise customize countdown quick links",
      isAvailable: win => this.enabled && !!win.gBrowser,
      run: win => this.open(win, true),
    });
  },

  observe(subject, topic, data) {
    if (topic == "browser-delayed-startup-finished") {
      this._setupWindow(subject);
    } else if (topic == "browser:purge-session-history") {
      this.clearReading();
    } else if (topic == "nsPref:changed") {
      if (data == PREF_ENABLED) {
        this._applyPages();
      }
      this._changed();
    }
  },

  _changed() {
    Services.obs.notifyObservers(null, HOME_CHANGE_TOPIC);
  },

  // Makes the home screen the new-tab page and the default start page.
  _applyPages() {
    const defaults = Services.prefs.getDefaultBranch("");
    if (this.enabled) {
      lazy.AboutNewTab.newTabURL = HOME_URL;
      defaults.setStringPref(PREF_HOMEPAGE, HOME_URL);
    } else {
      if (lazy.AboutNewTab.newTabURL == HOME_URL) {
        lazy.AboutNewTab.resetNewTabURL();
      }
      defaults.setStringPref(PREF_HOMEPAGE, "about:home");
    }
  },

  /**
   * Firefox code that opens its own new-tab or home page by name (for example after a new
   * profile is set up) lands on the Nirva home screen instead.
   *
   * @param {Element} browser
   * @param {nsIURI} uri
   */
  _replaceFirefoxHome(browser, uri) {
    if (!this.enabled || !["about:newtab", "about:home"].includes(uri?.spec)) {
      return;
    }
    Services.tm.dispatchToMainThread(() =>
      browser.loadURI(Services.io.newURI(HOME_URL), {
        triggeringPrincipal:
          Services.scriptSecurityManager.getSystemPrincipal(),
        loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
      })
    );
  },

  open(win, editing = false) {
    const url = editing ? `${HOME_URL}#edit` : HOME_URL;
    win.gBrowser.selectedTab = win.gBrowser.addTrustedTab(url);
  },

  _setupWindow(win) {
    if (!win?.gBrowser) {
      return;
    }
    if (!win.gInitialPages?.includes(HOME_URL)) {
      win.gInitialPages?.push(HOME_URL);
    }
    win.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress, _request, uri) => {
        if (webProgress.isTopLevel) {
          this._lockIfFocusing(win, browser, uri);
          this._replaceFirefoxHome(browser, uri);
        }
      },
    });
  },

  // ---------- What the person keeps on the page ----------

  get data() {
    try {
      return normalize(JSON.parse(Services.prefs.getStringPref(PREF_DATA, "")));
    } catch (_error) {
      return normalize(null);
    }
  },

  _update(change) {
    const data = this.data;
    change(data);
    Services.prefs.setStringPref(PREF_DATA, JSON.stringify(normalize(data)));
  },

  _id() {
    return `${Date.now().toString(36)}-${this._nextId++}`;
  },

  addTodo(text) {
    const clean = clip(text, 200).trim();
    if (clean) {
      this._update(d =>
        d.todo.push({ id: this._id(), text: clean, done: false })
      );
    }
    return !!clean;
  },

  toggleTodo(id) {
    this._update(d => {
      const item = d.todo.find(t => t.id == id);
      if (item) {
        item.done = !item.done;
      }
    });
  },

  removeTodo(id) {
    this._update(d => {
      d.todo = d.todo.filter(t => t.id != id);
    });
  },

  setNote(text) {
    this._update(d => {
      d.note = text;
    });
  },

  setCountdown(title, date) {
    this._update(d => {
      d.countdown = { title, date };
    });
  },

  /**
   * Adds a quick link.
   *
   * @param {string} address what the person typed; "https://" is added if missing
   * @param {string} [title]
   * @returns {boolean} false when the address is not a web address
   */
  addLink(address, title = "") {
    const typed = String(address ?? "").trim();
    const url = webURL(/^[a-z]+:/i.test(typed) ? typed : `https://${typed}`);
    if (!url || !cleanHost(url)) {
      return false;
    }
    this._update(d =>
      d.links.push({
        id: this._id(),
        url,
        title: clip(title, 40).trim() || cleanHost(url),
      })
    );
    return true;
  },

  removeLink(id) {
    this._update(d => {
      d.links = d.links.filter(l => l.id != id);
    });
  },

  setWidget(id, shown) {
    if (HOME_WIDGETS.includes(id)) {
      this._update(d => {
        d.widgets[id] = !!shown;
      });
    }
  },

  setFocusSites(lines) {
    this._update(d => {
      d.focusSites = String(lines ?? "").split(/[\s,]+/);
    });
  },

  // ---------- Focus session ----------

  get focus() {
    const { running, endsAt, remainingMs } = this._focus;
    return {
      running,
      totalMs: FOCUS_MS,
      remainingMs: running ? Math.max(0, endsAt - Date.now()) : remainingMs,
      locking: running && !!this.data.focusSites.length,
    };
  },

  startFocus() {
    const focus = this._focus;
    if (focus.running) {
      return;
    }
    if (focus.remainingMs <= 0) {
      focus.remainingMs = FOCUS_MS;
    }
    focus.running = true;
    focus.endsAt = Date.now() + focus.remainingMs;
    this._focusTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._focusTimer.initWithCallback(
      () => this._finishFocus(),
      focus.remainingMs,
      Ci.nsITimer.TYPE_ONE_SHOT
    );
    this._changed();
  },

  pauseFocus() {
    const focus = this._focus;
    if (!focus.running) {
      return;
    }
    focus.remainingMs = Math.max(0, focus.endsAt - Date.now());
    this._stopFocus();
  },

  resetFocus() {
    this._focus.remainingMs = FOCUS_MS;
    this._stopFocus();
  },

  _stopFocus() {
    this._focus.running = false;
    this._focusTimer?.cancel();
    this._focusTimer = null;
    this._changed();
  },

  _finishFocus() {
    this.resetFocus();
    const box = lazy.BrowserWindowTracker.getTopWindow()?.gNotificationBox;
    box?.appendNotification(
      "nirva-home-focus-done",
      {
        label: lazy.l10n.formatValueSync("nirva-home-focus-done"),
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      []
    );
  },

  // While a session runs, the chosen sites send the tab back to the home screen.
  _lockIfFocusing(win, browser, uri) {
    if (!this._focus.running || !this.enabled) {
      return;
    }
    const host =
      uri?.schemeIs("http") || uri?.schemeIs("https") ? uri.host : "";
    const locked = this.data.focusSites.find(
      site => host == site || host.endsWith(`.${site}`)
    );
    if (!locked) {
      return;
    }
    browser.stop();
    browser.fixupAndLoadURIString(HOME_URL, {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    const box = win.gNotificationBox;
    box?.getNotificationWithValue(LOCK_NOTICE)?.close();
    box?.appendNotification(
      LOCK_NOTICE,
      {
        label: lazy.l10n.formatValueSync("nirva-home-focus-locked", {
          site: locked,
        }),
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      [
        {
          label: lazy.l10n.formatValueSync("nirva-home-focus-end"),
          callback: () => {
            this.resetFocus();
          },
        },
      ]
    );
  },

  // ---------- Continue reading ----------

  /** @returns {{url: string, title: string, percent: number, time: number}[]} */
  get reading() {
    try {
      const list = JSON.parse(Services.prefs.getStringPref(PREF_READING, "[]"));
      return (Array.isArray(list) ? list : []).filter(
        item =>
          item &&
          webURL(item.url) &&
          typeof item.title == "string" &&
          Number.isInteger(item.percent)
      );
    } catch (_error) {
      return [];
    }
  },

  /**
   * Remembers how far down a long article the person got.
   *
   * @param {MozBrowser} browser the tab's browser
   * @param {{url: string, title: string, percent: number}} progress
   * @returns {boolean} whether anything was kept
   */
  recordReading(browser, progress) {
    const { NirvaPrivacyRules } = lazy;
    const url = webURL(progress?.url);
    const title = clip(progress?.title, 120).trim();
    const percent = Math.round(Number(progress?.percent));
    const tab = browser?.documentGlobal?.gBrowser?.getTabForBrowser(browser);
    if (
      !this.enabled ||
      !url ||
      !title ||
      !(percent >= 0 && percent <= 100) ||
      !tab ||
      lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) ||
      NirvaPrivacyRules.isBurnerTab(tab) ||
      !NirvaPrivacyRules.storableURL(url) ||
      NirvaPrivacyRules.isSensitivePage(url, title)
    ) {
      return false;
    }
    const list = this.reading.filter(item => item.url != url);
    const known = list.length != this.reading.length;
    // Barely started pages are not worth listing; finished ones leave the list.
    if (percent < 97 && (percent >= 10 || known)) {
      list.unshift({ url, title, percent, time: Date.now() });
    } else if (!known) {
      return false;
    }
    Services.prefs.setStringPref(
      PREF_READING,
      JSON.stringify(list.slice(0, MAX_READING))
    );
    return true;
  },

  removeReading(url) {
    Services.prefs.setStringPref(
      PREF_READING,
      JSON.stringify(this.reading.filter(item => item.url != url))
    );
  },

  clearReading() {
    Services.prefs.clearUserPref(PREF_READING);
  },

  // ---------- What the widgets show ----------

  _tabs() {
    const tabs = [];
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      if (!lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
        tabs.push(...win.gBrowser.tabs.filter(tab => !tab.closing));
      }
    }
    return tabs;
  },

  /**
   * Counts of tabs and the memory the browser is using.
   *
   * @returns {Promise<{tabs: number, asleep: number, memory: number,
   *   totalMemory: number, energy: {title: string, bytes: number}[]}>}
   */
  async stats() {
    const tabs = this._tabs();
    const byWindowId = new Map();
    for (const tab of tabs) {
      const id = tab.linkedBrowser?.outerWindowID;
      if (id != null && !lazy.NirvaPrivacyRules.isBurnerTab(tab)) {
        byWindowId.set(id, tab);
      }
    }
    let memory = 0;
    const energy = [];
    try {
      const info = await ChromeUtils.requestProcInfo();
      memory = info.memory;
      for (const child of info.children) {
        memory += child.memory;
        const seen = new Set();
        for (const frame of child.windows ?? []) {
          const tab = byWindowId.get(frame.outerWindowId);
          if (tab && !seen.has(tab)) {
            seen.add(tab);
            energy.push({ title: tab.label, bytes: child.memory });
          }
        }
      }
    } catch (error) {
      console.error("Nirva could not read memory use", error);
    }
    energy.sort((a, b) => b.bytes - a.bytes);
    return {
      tabs: tabs.length,
      asleep: tabs.filter(tab => tab.hasAttribute("pending")).length,
      memory,
      totalMemory: Number(Services.sysinfo.getProperty("memsize")) || 0,
      energy: energy.slice(0, 4),
    };
  },

  /**
   * Today's protection numbers, from the browser's own records.
   *
   * @returns {Promise<{trackers: number, fingerprinters: number,
   *   burnersWiped: number, strictSites: number}>}
   */
  async privacyToday() {
    const today = { trackers: 0, fingerprinters: 0 };
    try {
      const service = Cc["@mozilla.org/tracking-db-service;1"].getService(
        Ci.nsITrackingDBService
      );
      const kinds = {
        [service.TRACKERS_ID]: "trackers",
        [service.SOCIAL_ID]: "trackers",
        [service.CRYPTOMINERS_ID]: "trackers",
        [service.FINGERPRINTERS_ID]: "fingerprinters",
        [service.SUSPICIOUS_FINGERPRINTERS_ID]: "fingerprinters",
      };
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      for (const row of await service.getEventsByDateRange(
        start.getTime(),
        Date.now()
      )) {
        const kind = kinds[row.getResultByName("type")];
        if (kind) {
          today[kind] += row.getResultByName("count");
        }
      }
    } catch (error) {
      console.error("Nirva could not read today's protection numbers", error);
    }
    return {
      ...today,
      burnersWiped: lazy.NirvaBurner.wipedToday,
      strictSites: lazy.NirvaTrust.strictSiteCount(),
    };
  },

  async clips() {
    try {
      return (await lazy.NirvaClipsStore.list()).slice(0, 2).map(c => ({
        id: c.id,
        title: c.title || c.sourceTitle || "",
        text: c.text || "",
        updatedAt: c.updatedAt,
      }));
    } catch (_error) {
      return [];
    }
  },

  // The three most recent saved sessions, oldest first.
  async sessions() {
    try {
      const { snapshots } = await lazy.NirvaTimeTravel.getTimeline();
      return [...snapshots]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3)
        .reverse()
        .map(s => ({
          id: s.id,
          createdAt: s.createdAt,
          tabCount: s.tabCount,
          windowCount: s.windowCount,
        }));
    } catch (_error) {
      return [];
    }
  },
};
