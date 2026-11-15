/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  NirvaMotion: "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs",
  NirvaPrivacyRules:
    "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs",
  NirvaWorkspaces:
    "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/tabrules.ftl"], true)
);

const PREF_ENABLED = "nirva.tabrules.enabled";
const PREF_PAUSED = "nirva.tabrules.paused";
const PREF_RULES = "nirva.tabrules.rules";
const PREF_SUGGEST_SLEEP = "nirva.tabrules.suggestSleep";
const PREF_SLEEP_MINUTES = "nirva.tabrules.sleepMinutes";
const CHANGE_TOPIC = "nirva-tabrules-changed";
const MANAGER_URL = "chrome://browser/content/nirva/tabrules.html";
const MOVED_NOTICE = "nirva-tabrules-moved";
const SLEEP_NOTICE = "nirva-tabrules-sleep";
const CHECK_MS = 60 * 1000;
const MAX_LOG = 20;

export const SLEEP_MINUTE_CHOICES = [30, 60, 120, 240];

/**
 * Turns what a person typed into a plain site name, or "" when it is not one.
 *
 * @param {string} value
 * @returns {string}
 */
export function cleanHost(value) {
  let host = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#:].*$/, "")
    .replace(/^www\./, "");
  return /^([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host) ? host : "";
}

function hostMatches(host, ruleHost) {
  return host == ruleHost || host.endsWith(`.${ruleHost}`);
}

function webHost(uri) {
  return uri?.schemeIs("http") || uri?.schemeIs("https")
    ? uri.host.toLowerCase().replace(/^www\./, "")
    : "";
}

/**
 * A small set of tab rules: open a site's tabs in a chosen workspace, and
 * suggest sleep for tabs that have not been used. Every automatic move is
 * announced, listed and can be undone; one switch pauses everything.
 */
export const NirvaTabRules = {
  _initialized: false,
  _timer: null,
  // Automatic moves, newest first.
  _log: [],
  _nextId: 1,
  // Tabs whose move was undone; a rule leaves them alone afterwards.
  _released: new WeakSet(),
  // Tabs already offered for sleep, so the same offer is not repeated.
  _offered: new WeakSet(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get paused() {
    return Services.prefs.getBoolPref(PREF_PAUSED, false);
  },

  set paused(value) {
    Services.prefs.setBoolPref(PREF_PAUSED, !!value);
  },

  get active() {
    return this.enabled && !this.paused;
  },

  get suggestSleep() {
    return Services.prefs.getBoolPref(PREF_SUGGEST_SLEEP, true);
  },

  set suggestSleep(value) {
    Services.prefs.setBoolPref(PREF_SUGGEST_SLEEP, !!value);
  },

  get sleepMinutes() {
    const minutes = Services.prefs.getIntPref(PREF_SLEEP_MINUTES, 60);
    return SLEEP_MINUTE_CHOICES.includes(minutes) ? minutes : 60;
  },

  set sleepMinutes(value) {
    if (SLEEP_MINUTE_CHOICES.includes(Number(value))) {
      Services.prefs.setIntPref(PREF_SLEEP_MINUTES, Number(value));
    }
  },

  /** @returns {{id: string, host: string, workspace: string, enabled: boolean}[]} */
  get rules() {
    let stored = [];
    try {
      stored = JSON.parse(Services.prefs.getStringPref(PREF_RULES, "[]"));
    } catch (_error) {}
    return (Array.isArray(stored) ? stored : [])
      .filter(
        rule =>
          rule &&
          typeof rule.id == "string" &&
          cleanHost(rule.host) == rule.host &&
          typeof rule.workspace == "string"
      )
      .map(rule => ({
        id: rule.id,
        host: rule.host,
        workspace: rule.workspace,
        enabled: rule.enabled !== false,
      }));
  },

  _save(rules) {
    Services.prefs.setStringPref(PREF_RULES, JSON.stringify(rules));
  },

  /**
   * Adds a rule, or points the site's existing rule at another workspace.
   *
   * @param {string} site
   * @param {string} workspace a workspace id
   * @returns {object|null} the rule, or null when the site or workspace is not valid
   */
  addRule(site, workspace) {
    const host = cleanHost(site);
    if (!host || !lazy.NirvaWorkspaces.list.some(w => w.id == workspace)) {
      return null;
    }
    const rules = this.rules.filter(rule => rule.host != host);
    const rule = {
      id: `rule-${Date.now().toString(36)}-${this._nextId++}`,
      host,
      workspace,
      enabled: true,
    };
    this._save([...rules, rule]);
    return rule;
  },

  _change(id, change) {
    const rules = this.rules;
    const rule = rules.find(r => r.id == id);
    if (!rule) {
      return false;
    }
    change(rule, rules);
    this._save(rules.filter(r => !r.removed));
    return true;
  },

  removeRule(id) {
    return this._change(id, rule => {
      rule.removed = true;
    });
  },

  setRuleEnabled(id, enabled) {
    return this._change(id, rule => {
      rule.enabled = !!enabled;
    });
  },

  setRuleWorkspace(id, workspace) {
    return (
      lazy.NirvaWorkspaces.list.some(w => w.id == workspace) &&
      this._change(id, rule => {
        rule.workspace = workspace;
      })
    );
  },

  ruleFor(uri) {
    const host = webHost(uri);
    if (!host) {
      return null;
    }
    const workspaces = new Set(lazy.NirvaWorkspaces.list.map(w => w.id));
    return (
      this.rules
        .filter(
          rule =>
            rule.enabled &&
            workspaces.has(rule.workspace) &&
            hostMatches(host, rule.host)
        )
        // The most specific site name wins.
        .sort((a, b) => b.host.length - a.host.length)[0] ?? null
    );
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    for (const pref of [
      PREF_ENABLED,
      PREF_PAUSED,
      PREF_RULES,
      PREF_SUGGEST_SLEEP,
      PREF_SLEEP_MINUTES,
    ]) {
      Services.prefs.addObserver(pref, this);
    }
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    this._timer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
    this._timer.initWithCallback(
      () => {
        for (const win of lazy.BrowserWindowTracker.orderedWindows) {
          this.suggestSleepIn(win);
        }
      },
      CHECK_MS,
      Ci.nsITimer.TYPE_REPEATING_SLACK
    );
    this._registerCommands();
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this._setupWindow(subject);
    } else if (topic == "nsPref:changed") {
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
    }
  },

  _usable(win) {
    return (
      !!win?.gBrowser &&
      !win.closed &&
      !lazy.PrivateBrowsingUtils.isWindowPrivate(win)
    );
  },

  _setupWindow(win) {
    if (!this._usable(win)) {
      return;
    }
    win.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress, _request, uri, flags) => {
        if (
          webProgress.isTopLevel &&
          !(flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT)
        ) {
          this.applyTo(win, win.gBrowser.getTabForBrowser(browser), uri);
        }
      },
    });
  },

  /**
   * Moves a tab to the workspace its site's rule names, if there is one.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab} tab
   * @param {nsIURI} uri the address the tab now shows
   * @returns {object|null} the entry written to the list of moves
   */
  applyTo(win, tab, uri) {
    const { NirvaWorkspaces } = lazy;
    if (
      !this.active ||
      !NirvaWorkspaces.enabled ||
      !this._usable(win) ||
      !tab ||
      tab.pinned ||
      tab.closing ||
      this._released.has(tab) ||
      lazy.NirvaPrivacyRules.isBurnerTab(tab)
    ) {
      return null;
    }
    const rule = this.ruleFor(uri);
    const from = NirvaWorkspaces.workspaceOf(tab);
    if (!rule || rule.workspace == from) {
      return null;
    }
    this._move(win, tab, rule.workspace);
    const name = id => NirvaWorkspaces.list.find(w => w.id == id)?.name ?? "";
    const entry = {
      id: this._nextId++,
      time: Date.now(),
      host: rule.host,
      from,
      fromName: name(from),
      toName: name(rule.workspace),
      undone: false,
      tab: Cu.getWeakReference(tab),
    };
    this._log.unshift(entry);
    this._log.length = Math.min(this._log.length, MAX_LOG);
    this._announceMove(win, entry);
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
    return entry;
  },

  _move(win, tab, workspace) {
    lazy.NirvaWorkspaces.assign(tab, workspace);
    if (tab.selected) {
      // The person is looking at this tab, so the window follows it.
      lazy.NirvaWorkspaces.switchTo(win, workspace);
    } else {
      lazy.NirvaWorkspaces.updateWindow(win);
    }
  },

  _announceMove(win, entry) {
    const box = win.gNotificationBox;
    if (!box) {
      return;
    }
    box.getNotificationWithValue(MOVED_NOTICE)?.close();
    box.appendNotification(
      MOVED_NOTICE,
      {
        label: lazy.l10n.formatValueSync("nirva-tabrules-moved", {
          site: entry.host,
          workspace: entry.toName,
        }),
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      [
        {
          label: lazy.l10n.formatValueSync("nirva-tabrules-undo"),
          callback: () => {
            this.undo(entry.id);
          },
        },
        {
          label: lazy.l10n.formatValueSync("nirva-tabrules-pause"),
          callback: () => {
            this.paused = true;
          },
        },
      ]
    );
  },

  /** @returns {object[]} automatic moves, newest first, for display */
  get log() {
    return this._log.map(entry => ({
      id: entry.id,
      time: entry.time,
      host: entry.host,
      fromName: entry.fromName,
      toName: entry.toName,
      undone: entry.undone,
      canUndo: !entry.undone && !!this._tabOf(entry),
    }));
  },

  _tabOf(entry) {
    const tab = entry.tab.get();
    return tab?.isConnected && !tab.closing ? tab : null;
  },

  // Puts a moved tab back where it was and leaves it alone from then on.
  undo(id) {
    const entry = this._log.find(e => e.id == id);
    const tab = entry && !entry.undone ? this._tabOf(entry) : null;
    if (!tab) {
      return false;
    }
    const { NirvaWorkspaces } = lazy;
    const back = NirvaWorkspaces.list.some(w => w.id == entry.from)
      ? entry.from
      : NirvaWorkspaces.list[0].id;
    this._released.add(tab);
    this._move(tab.documentGlobal, tab, back);
    entry.undone = true;
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
    return true;
  },

  /**
   * The tabs of a window that have not been looked at for the waiting time.
   *
   * @param {Window} win
   * @param {number} [now]
   * @returns {MozTabbrowserTab[]}
   */
  idleTabs(win, now = Date.now()) {
    const waitMs = this.sleepMinutes * 60 * 1000;
    return win.gBrowser.tabs.filter(
      tab =>
        lazy.NirvaMotion.maySleep(tab) &&
        !!webHost(tab.linkedBrowser?.currentURI) &&
        now - tab.lastAccessed >= waitMs
    );
  },

  // Offers to put unused tabs to sleep. Nothing sleeps unless the person agrees.
  suggestSleepIn(win, now = Date.now()) {
    if (!this.active || !this.suggestSleep || !this._usable(win)) {
      return false;
    }
    const box = win.gNotificationBox;
    const tabs = this.idleTabs(win, now);
    const fresh = tabs.filter(tab => !this._offered.has(tab));
    if (!box || !fresh.length || box.getNotificationWithValue(SLEEP_NOTICE)) {
      return false;
    }
    for (const tab of tabs) {
      this._offered.add(tab);
    }
    box.appendNotification(
      SLEEP_NOTICE,
      {
        label: lazy.l10n.formatValueSync("nirva-tabrules-sleep-offer", {
          count: tabs.length,
          minutes: this.sleepMinutes,
        }),
        priority: box.PRIORITY_INFO_LOW,
      },
      [
        {
          label: lazy.l10n.formatValueSync("nirva-tabrules-sleep-accept"),
          callback: () => {
            this.sleepTabs(win, tabs);
          },
        },
        {
          label: lazy.l10n.formatValueSync("nirva-tabrules-pause"),
          callback: () => {
            this.paused = true;
          },
        },
      ]
    );
    return true;
  },

  async sleepTabs(win, tabs) {
    let slept = 0;
    for (const tab of tabs) {
      if (tab.isConnected && (await lazy.NirvaMotion.sleepTab(win, tab))) {
        slept++;
      }
    }
    return slept;
  },

  openManager(win) {
    for (const tab of win.gBrowser.tabs) {
      if (tab.linkedBrowser.currentURI?.spec == MANAGER_URL) {
        win.gBrowser.selectedTab = tab;
        return tab;
      }
    }
    const tab = win.gBrowser.addTrustedTab(MANAGER_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  _registerCommands() {
    const command = (id, keywords, isAvailable, run) =>
      NirvaCommands.register({
        id: `tabrules-${id}`,
        feature: "tabrules",
        l10nId: `nirva-command-tabrules-${id}`,
        keywords,
        isAvailable,
        run,
      });
    const here = win => {
      const uri = win.gBrowser?.selectedBrowser.currentURI;
      return this._usable(win) && lazy.NirvaWorkspaces.enabled
        ? webHost(uri)
        : "";
    };
    command(
      "open",
      "tab rules manage automatic workspace sleep",
      win => this.enabled && !!win.gBrowser,
      win => this.openManager(win)
    );
    command(
      "pause",
      "tab rules pause stop automatic",
      () => this.active,
      () => {
        this.paused = true;
      }
    );
    command(
      "resume",
      "tab rules resume start automatic",
      () => this.enabled && this.paused,
      () => {
        this.paused = false;
      }
    );
    command(
      "add-here",
      "tab rule always open this site in this workspace",
      win => this.enabled && !!here(win),
      win => this.addRule(here(win), lazy.NirvaWorkspaces.getActive(win))
    );
  },
};
