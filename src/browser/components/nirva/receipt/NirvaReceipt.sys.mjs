/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  // NIRVA: The panel offers to move the page into a burner tab when that feature is on.
  NirvaBurner: "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs",
  // NIRVA: The panel holds the trust dial for the site in front.
  NirvaTrust: "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs",
  // NIRVA: The panel says what link cleaning removed and lets it be undone.
  NirvaLinkCleaner:
    "moz-src:///browser/components/nirva/linkcleaner/NirvaLinkCleaner.sys.mjs",
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const PREF_ENABLED = "nirva.receipt.enabled";
const MANAGER_URL = "chrome://browser/content/nirva/receipt.html";
const CHANGE_TOPIC = "nirva-receipt-changed";
const BUTTON_ID = "nirva-receipt-button";
const PANEL_ID = "nirva-receipt-panel";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SVG_NS = "http://www.w3.org/2000/svg";
const SHIELD_PATH = "M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z";
const UPDATE_DELAY_MS = 150;
const MAX_SESSION_SITES = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
export const RECEIPT_ROWS = ["trackers", "fingerprinters", "cookies", "loaded"];

const STATE = Ci.nsIWebProgressListener;
const MASKS = {
  trackers:
    STATE.STATE_BLOCKED_TRACKING_CONTENT |
    STATE.STATE_BLOCKED_SOCIALTRACKING_CONTENT |
    STATE.STATE_BLOCKED_CRYPTOMINING_CONTENT |
    STATE.STATE_BLOCKED_EMAILTRACKING_CONTENT,
  fingerprinters:
    STATE.STATE_BLOCKED_FINGERPRINTING_CONTENT |
    STATE.STATE_BLOCKED_SUSPICIOUS_FINGERPRINTING,
  cookies:
    STATE.STATE_COOKIES_BLOCKED_TRACKER |
    STATE.STATE_COOKIES_BLOCKED_SOCIALTRACKER |
    STATE.STATE_COOKIES_BLOCKED_FOREIGN |
    STATE.STATE_COOKIES_BLOCKED_ALL |
    STATE.STATE_COOKIES_BLOCKED_BY_PERMISSION |
    STATE.STATE_COOKIES_PARTITIONED_FOREIGN |
    STATE.STATE_COOKIES_PARTITIONED_TRACKER,
  loaded:
    STATE.STATE_LOADED_LEVEL_1_TRACKING_CONTENT |
    STATE.STATE_LOADED_LEVEL_2_TRACKING_CONTENT |
    STATE.STATE_LOADED_SOCIALTRACKING_CONTENT |
    STATE.STATE_LOADED_FINGERPRINTING_CONTENT |
    STATE.STATE_LOADED_CRYPTOMINING_CONTENT,
};

/**
 * Turns a tab's content blocking log into the receipt's numbers. Each number
 * counts distinct sites, taken only from what the protection systems logged.
 *
 * @param {object} log - Origin to list of [state, happened, repeats].
 * @returns {{trackers: number, fingerprinters: number, cookies: number,
 *   loaded: number, blocked: number}}
 */
export function summarizeLog(log) {
  const sites = Object.fromEntries(RECEIPT_ROWS.map(row => [row, new Set()]));
  for (const [origin, entries] of Object.entries(log || {})) {
    if (!Array.isArray(entries)) {
      continue;
    }
    for (const [state, happened] of entries) {
      if (!happened) {
        continue;
      }
      for (const row of RECEIPT_ROWS) {
        if (state & MASKS[row]) {
          sites[row].add(origin);
        }
      }
    }
  }
  const summary = Object.fromEntries(
    RECEIPT_ROWS.map(row => [row, sites[row].size])
  );
  summary.blocked = new Set([...sites.trackers, ...sites.fingerprinters]).size;
  return summary;
}

function element(doc, tag, className, l10nId) {
  const node = doc.createElementNS(HTML_NS, tag);
  if (className) {
    node.className = className;
  }
  if (l10nId) {
    doc.l10n.setAttributes(node, l10nId);
  }
  return node;
}

/** Evidence-based privacy numbers for the page in front, and for the session. */
export const NirvaReceipt = {
  _initialized: false,
  _timers: new WeakMap(),
  // Latest receipt per site this session. Kept in memory only.
  _sites: new Map(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    NirvaCommands.register({
      id: "receipt-open",
      feature: "receipt",
      l10nId: "nirva-command-receipt",
      keywords: "privacy receipt trackers blocked cookies summary report",
      isAvailable: () => this.enabled,
      run: win => this.openManager(win),
    });
    NirvaCommands.register({
      id: "receipt-show",
      feature: "receipt",
      l10nId: "nirva-command-receipt-show",
      keywords: "privacy receipt this page trackers blocked shield",
      isAvailable: win =>
        this.enabled && this.isWebPage(win.gBrowser?.selectedBrowser),
      run: win => this.showPanel(win),
    });
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.prefs.addObserver(PREF_ENABLED, this);
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this._setupWindow(subject);
    } else if (topic == "nsPref:changed") {
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        this.update(win);
      }
    }
  },

  isWebPage(browser) {
    return ["http", "https"].includes(browser?.currentURI?.scheme);
  },

  /**
   * The receipt for one tab, or null when the page is not a web page.
   *
   * @param {MozBrowser} browser
   */
  summaryFor(browser) {
    if (!this.isWebPage(browser)) {
      return null;
    }
    let log = {};
    try {
      log = JSON.parse(browser.getContentBlockingLog() || "{}");
    } catch (_error) {}
    const summary = summarizeLog(log);
    try {
      summary.protectionOff = lazy.ContentBlockingAllowList.includes(browser);
    } catch (_error) {
      summary.protectionOff = false;
    }
    return summary;
  },

  _setupWindow(win) {
    const doc = win?.document;
    const container = doc?.querySelector("#urlbar .urlbar-input-container");
    const popups = doc?.getElementById("mainPopupSet");
    if (
      !container ||
      !popups ||
      !win.gBrowser ||
      doc.getElementById(BUTTON_ID)
    ) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/receipt.ftl");

    const button = element(doc, "button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.hidden = true;
    const shield = doc.createElementNS(SVG_NS, "svg");
    for (const [name, value] of Object.entries({
      width: 16,
      height: 16,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 1.5,
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    })) {
      shield.setAttribute(name, value);
    }
    const path = doc.createElementNS(SVG_NS, "path");
    path.setAttribute("d", SHIELD_PATH);
    shield.append(path);
    button.append(shield, element(doc, "span", "nirva-receipt-count"));
    button.addEventListener("click", () => this.togglePanel(win));
    container.append(button);

    const panel = doc.createXULElement("panel");
    panel.id = PANEL_ID;
    panel.setAttribute("type", "arrow");
    panel.setAttribute("orient", "vertical");
    panel.setAttribute("role", "dialog");
    doc.l10n.setAttributes(panel, "nirva-receipt-panel");
    const box = element(doc, "div", "nirva-receipt");
    const rows = element(doc, "div", "nirva-receipt-rows");
    for (const row of RECEIPT_ROWS) {
      const line = element(
        doc,
        "div",
        "nirva-receipt-row",
        `nirva-receipt-row-${row}`
      );
      line.dataset.row = row;
      line.append(
        element(
          doc,
          "span",
          "nirva-receipt-label",
          `nirva-receipt-label-${row}`
        ),
        element(doc, "span", "nirva-receipt-value")
      );
      rows.append(line);
    }
    const details = element(
      doc,
      "button",
      "nirva-receipt-details",
      "nirva-receipt-details"
    );
    details.type = "button";
    details.addEventListener("click", () => {
      panel.hidePopup();
      this.openManager(win);
    });
    const burner = element(
      doc,
      "button",
      "nirva-receipt-burner",
      "nirva-receipt-burner"
    );
    burner.type = "button";
    burner.addEventListener("click", () => {
      panel.hidePopup();
      lazy.NirvaBurner.reopen(win);
    });
    box.append(
      element(doc, "div", "nirva-receipt-eyebrow", "nirva-receipt-eyebrow"),
      element(doc, "div", "nirva-receipt-headline"),
      rows,
      element(doc, "p", "nirva-receipt-note", "nirva-receipt-note"),
      lazy.NirvaTrust.buildSection(doc, win),
      lazy.NirvaLinkCleaner.buildSection(doc, win),
      burner,
      details
    );
    panel.append(box);
    panel.addEventListener("popupshown", () => {
      button.setAttribute("open", "true");
      this.update(win);
    });
    panel.addEventListener("popuphidden", () => button.removeAttribute("open"));
    popups.append(panel);

    const later = browser => {
      this._record(win, browser);
      if (browser == win.gBrowser.selectedBrowser) {
        this._updateSoon(win);
      }
    };
    win.gBrowser.addTabsProgressListener({
      onContentBlockingEvent: later,
      onLocationChange: (browser, webProgress) => {
        if (webProgress.isTopLevel) {
          later(browser);
        }
      },
    });
    win.gBrowser.tabContainer.addEventListener("TabSelect", () =>
      this.update(win)
    );
    this.update(win);
  },

  _updateSoon(win) {
    lazy.clearTimeout(this._timers.get(win));
    this._timers.set(
      win,
      lazy.setTimeout(() => this.update(win), UPDATE_DELAY_MS)
    );
  },

  _record(win, browser) {
    if (!this.enabled || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return;
    }
    const summary = this.summaryFor(browser);
    if (!summary) {
      return;
    }
    const host = browser.currentURI.host;
    this._sites.delete(host);
    this._sites.set(host, { host, time: Date.now(), ...summary });
    while (this._sites.size > MAX_SESSION_SITES) {
      this._sites.delete(this._sites.keys().next().value);
    }
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  // Redraws the island button, and the panel if it is open.
  update(win) {
    const doc = win?.document;
    const button = doc?.getElementById(BUTTON_ID);
    const panel = doc?.getElementById(PANEL_ID);
    if (!button || !panel || win.closed) {
      return;
    }
    const summary = this.enabled
      ? this.summaryFor(win.gBrowser.selectedBrowser)
      : null;
    button.hidden = !summary;
    if (!summary) {
      if (panel.state == "open") {
        panel.hidePopup();
      }
      return;
    }
    button.querySelector(".nirva-receipt-count").textContent =
      summary.blocked || "";
    panel.querySelector(".nirva-receipt-burner").hidden =
      !lazy.NirvaBurner.canReopen(win);
    lazy.NirvaTrust.updateSection(win, panel.querySelector(".nirva-trust"));
    lazy.NirvaLinkCleaner.updateSection(
      win,
      panel.querySelector(".nirva-linkclean")
    );
    doc.l10n.setAttributes(button, "nirva-receipt-button", {
      count: summary.blocked,
    });
    let headline = "nirva-receipt-headline";
    if (summary.protectionOff) {
      headline = "nirva-receipt-headline-off";
    } else if (!summary.blocked) {
      headline = "nirva-receipt-headline-none";
    }
    doc.l10n.setAttributes(
      panel.querySelector(".nirva-receipt-headline"),
      headline,
      { count: summary.blocked }
    );
    for (const line of panel.querySelectorAll(".nirva-receipt-row")) {
      const value = line.querySelector(".nirva-receipt-value");
      const count = summary[line.dataset.row];
      if (count || line.dataset.row != "loaded") {
        value.removeAttribute("data-l10n-id");
        value.textContent = count;
      } else {
        doc.l10n.setAttributes(value, "nirva-receipt-none-seen");
      }
    }
  },

  showPanel(win) {
    const doc = win.document;
    const button = doc.getElementById(BUTTON_ID);
    const panel = doc.getElementById(PANEL_ID);
    if (!button || button.hidden || !panel) {
      return false;
    }
    this.update(win);
    panel.openPopup(button, "bottomright topright", 0, 4);
    return true;
  },

  togglePanel(win) {
    const panel = win.document.getElementById(PANEL_ID);
    if (panel?.state == "open" || panel?.state == "showing") {
      panel.hidePopup();
      return false;
    }
    return this.showPanel(win);
  },

  openManager(win) {
    const existing = [...(win.gBrowser?.tabs || [])].find(
      tab => tab.linkedBrowser.currentURI.spec == MANAGER_URL
    );
    if (existing) {
      win.gBrowser.selectedTab = existing;
      return existing;
    }
    const tab = win.gBrowser.addTrustedTab(MANAGER_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  // Sites seen this session, most recent first.
  sessionSites() {
    return [...this._sites.values()].reverse();
  },

  clearSession() {
    this._sites.clear();
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  /**
   * Totals Firefox's protection database recorded: per day and per kind only,
   * never per site.
   *
   * @returns {Promise<{week: object, month: object, since: number|null}|null>}
   */
  async totals() {
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
        [service.TRACKING_COOKIES_ID]: "cookies",
      };
      const empty = () => ({ trackers: 0, fingerprinters: 0, cookies: 0 });
      const week = empty();
      const month = empty();
      const now = Date.now();
      for (const row of await service.getEventsByDateRange(
        now - 30 * DAY_MS,
        now
      )) {
        const kind = kinds[row.getResultByName("type")];
        const count = row.getResultByName("count");
        const day = new Date(row.getResultByName("timestamp")).getTime();
        if (!kind) {
          continue;
        }
        month[kind] += count;
        if (day >= now - 7 * DAY_MS) {
          week[kind] += count;
        }
      }
      return {
        week,
        month,
        since: (await service.getEarliestRecordedDate()) || null,
      };
    } catch (error) {
      console.error("Nirva could not read the protection totals", error);
      return null;
    }
  },
};
