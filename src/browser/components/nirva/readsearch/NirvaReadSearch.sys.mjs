/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaReadSearchStore } from "moz-src:///browser/components/nirva/readsearch/NirvaReadSearchStore.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  ReaderMode: "moz-src:///toolkit/components/reader/ReaderMode.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const PREF_ENABLED = "nirva.readsearch.enabled";
const PREF_PAUSED = "nirva.readsearch.paused";
const PREF_RETENTION = "nirva.readsearch.retentionDays";
const SEARCH_URL = "chrome://browser/content/nirva/read-search.html";
// Long enough for a heavy page to finish loading and settle before its text is read.
const INDEX_DELAY_MS = 3000;
const RETENTION_CHOICES = new Set([7, 30, 90]);
const SENSITIVE_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;
const SENSITIVE_PAGE =
  /(?:^|[\s/_.-])(?:account[-_/ ]verification|authenticate|authentication|auth|banking|checkout|log[-_ ]?in|medical[-_/ ]?record|oauth|payment|password|patient[-_/ ]?portal|recovery|reset[-_/ ]?password|sign[-_ ]?in|two[-_ ]?factor|2fa)(?:$|[\s/_.?#-])/i;

function urlForBrowser(browser) {
  let spec = browser?.currentURI?.spec;
  if (typeof spec != "string") {
    return null;
  }
  if (spec.startsWith("about:reader?")) {
    spec = lazy.ReaderMode.getOriginalUrl(spec);
  }
  return spec || null;
}

function hasSensitiveQuery(value) {
  try {
    const url = new URL(value);
    return [...url.searchParams.keys()].some(key =>
      SENSITIVE_PARAMETER.test(key)
    );
  } catch (_error) {
    return true;
  }
}

function isSensitivePage(url, title) {
  let path = "";
  try {
    path = `${new URL(url).hostname}${new URL(url).pathname}`;
  } catch (_error) {
    return true;
  }
  return SENSITIVE_PAGE.test(`${path} ${title}`);
}

export function removePassageMarkers(passage = "") {
  return passage.replaceAll("⟦", "").replaceAll("⟧", "");
}

/** Locally indexes readable text from eligible pages visited in regular windows. */
export const NirvaReadSearch = {
  _initialized: false,
  _windows: new Set(),
  _inFlight: new WeakSet(),
  _lastIndexedWindow: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get paused() {
    return Services.prefs.getBoolPref(PREF_PAUSED, false);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    NirvaCommands.register({
      id: "read-everything-search",
      feature: "read-search",
      l10nId: "nirva-command-read-search",
      keywords: "read everything pages remembered text article index",
      isAvailable: win =>
        this.enabled && !lazy.PrivateBrowsingUtils.isWindowPrivate(win),
      run: win => this.openSearch(win),
    });
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, "browser:purge-session-history");
    Services.obs.addObserver(this, "browser:purge-session-history-for-domain");
    Services.obs.addObserver(this, "quit-application-granted");
    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_PAUSED, this);
    Services.prefs.addObserver(PREF_RETENTION, this);
    this._ready = NirvaReadSearchStore.init()
      .then(() => this._trimToRetention())
      .catch(error =>
        console.error("Nirva Read Search could not start", error)
      );
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      this.initWindow(win);
    }
  },

  initWindow(win) {
    if (!win?.gBrowser || [...this._windows].some(item => item.win == win)) {
      return;
    }
    const record = { win, timers: new Map(), listener: null };
    record.listener = {
      onLocationChange: (browser, webProgress) => {
        if (webProgress?.isTopLevel) {
          this._scheduleIndex(record, browser);
        }
      },
    };
    this._windows.add(record);
    win.gBrowser.addTabsProgressListener(record.listener);
    win.addEventListener(
      "unload",
      () => {
        win.gBrowser.removeTabsProgressListener(record.listener);
        for (const timer of record.timers.values()) {
          lazy.clearTimeout(timer);
        }
        record.timers.clear();
        this._windows.delete(record);
      },
      { once: true }
    );
    for (const tab of win.gBrowser.tabs) {
      this._scheduleIndex(record, tab.linkedBrowser);
    }
  },

  _scheduleIndex(record, browser) {
    if (!this.enabled || this.paused || this._shouldSkip(record.win, browser)) {
      return;
    }
    const previous = record.timers.get(browser);
    if (previous) {
      lazy.clearTimeout(previous);
    }
    record.timers.set(
      browser,
      lazy.setTimeout(() => {
        record.timers.delete(browser);
        if (browser.webProgress?.isLoadingDocument) {
          this._scheduleIndex(record, browser);
          return;
        }
        this._indexBrowser(record.win, browser).catch(error =>
          console.error("Nirva Read Search could not index a page", error)
        );
      }, INDEX_DELAY_MS)
    );
  },

  _shouldSkip(win, browser) {
    if (
      !this.enabled ||
      this.paused ||
      !win?.gBrowser ||
      !browser?.browsingContext ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(win)
    ) {
      return true;
    }
    const tab = win.gBrowser.getTabForBrowser(browser);
    if (
      !tab ||
      tab.closing ||
      tab.hasAttribute("nirva-burner") ||
      tab.getAttribute("data-nirva-burner") == "true"
    ) {
      return true;
    }
    const url = urlForBrowser(browser);
    return (
      !url ||
      hasSensitiveQuery(url) ||
      SENSITIVE_PAGE.test(url) ||
      NirvaReadSearchStore.isExcluded(url)
    );
  },

  async _indexBrowser(win, browser) {
    if (this._shouldSkip(win, browser) || this._inFlight.has(browser)) {
      return false;
    }
    const windowGlobal = browser.browsingContext.currentWindowGlobal;
    if (!windowGlobal) {
      return false;
    }
    if (this._lastIndexedWindow.get(browser) == windowGlobal.innerWindowId) {
      return false;
    }
    const sourceURL = urlForBrowser(browser);
    if (!sourceURL) {
      return false;
    }
    this._inFlight.add(browser);
    try {
      await this._ready;
      if (this._shouldSkip(win, browser)) {
        return false;
      }
      const pageExtractor = windowGlobal.getActor("PageExtractor");
      const extraction = await pageExtractor.getText({
        sourceUrl: sourceURL,
        removeBoilerplate: true,
        useSimpleText: true,
        sufficientLength: 250_000,
        maxCanvasCount: 0,
        includeCanvasSnapshots: false,
      });
      if (
        !extraction?.text ||
        browser.browsingContext.currentWindowGlobal != windowGlobal ||
        this._shouldSkip(win, browser)
      ) {
        return false;
      }
      const title = (browser.contentTitle || "").trim();
      if (isSensitivePage(sourceURL, title)) {
        return false;
      }
      const indexed = await NirvaReadSearchStore.indexDocument({
        url: sourceURL,
        title,
        body: extraction.text,
        visitedAt: Date.now(),
      });
      if (indexed) {
        this._lastIndexedWindow.set(browser, windowGlobal.innerWindowId);
        this._notifyChanged();
      }
      return indexed;
    } catch (error) {
      if (error?.name != "AbortError") {
        console.error("Nirva Read Search extraction failed", error);
      }
      return false;
    } finally {
      this._inFlight.delete(browser);
    }
  },

  async search(query, win = null, limit = 8) {
    if (
      !this.enabled ||
      (win && lazy.PrivateBrowsingUtils.isWindowPrivate(win))
    ) {
      return [];
    }
    if (!this._initialized) {
      this.init();
    }
    await this._ready;
    return NirvaReadSearchStore.search(query, limit);
  },

  async getSettings() {
    if (!this._initialized) {
      this.init();
    }
    await this._ready;
    const data = await NirvaReadSearchStore.getSettings();
    return {
      ...data,
      enabled: this.enabled,
      paused: this.paused,
      retentionDays: Services.prefs.getIntPref(PREF_RETENTION, 30),
    };
  },

  async setPaused(value) {
    Services.prefs.setBoolPref(PREF_PAUSED, Boolean(value));
    if (!this.paused && this.enabled) {
      this._scanOpenTabs();
    } else {
      this._cancelScheduledIndexes();
    }
  },

  async setRetentionDays(value) {
    const days = Number(value);
    if (!RETENTION_CHOICES.has(days)) {
      throw new Error("Choose a retention period of 7, 30, or 90 days");
    }
    Services.prefs.setIntPref(PREF_RETENTION, days);
    await this._trimToRetention();
  },

  async excludeDomain(domain) {
    const result = await NirvaReadSearchStore.excludeDomain(domain);
    this._notifyChanged();
    return result;
  },

  async allowDomain(domain) {
    const result = await NirvaReadSearchStore.allowDomain(domain);
    this._scheduleAllowedPages();
    this._notifyChanged();
    return result;
  },

  async excludePage(url) {
    const result = await NirvaReadSearchStore.excludePage(url);
    this._notifyChanged();
    return result;
  },

  async allowPage(url) {
    const result = await NirvaReadSearchStore.allowPage(url);
    this._scheduleAllowedPages();
    this._notifyChanged();
    return result;
  },

  async deletePage(url) {
    const result = await NirvaReadSearchStore.deletePage(url);
    this._notifyChanged();
    return result;
  },

  // NIRVA: Entry points for the Personal Web Library's saved copies.
  async indexSavedCopy({ url, title, body, localURI, savedAt = Date.now() }) {
    if (!this.enabled || this.paused) {
      return false;
    }
    const indexed = await NirvaReadSearchStore.indexDocument({
      url,
      title,
      body,
      visitedAt: savedAt,
      sourceKind: "saved",
      localURI,
    });
    if (indexed) {
      this._notifyChanged();
    }
    return indexed;
  },

  async removeSavedCopy(url) {
    const result = await NirvaReadSearchStore.deleteSaved(url);
    this._notifyChanged();
    return result;
  },

  async searchSavedCopies(query, limit = 100) {
    if (!this.enabled) {
      return [];
    }
    return NirvaReadSearchStore.search(query, limit, "saved");
  },

  async deleteDomain(domain) {
    const result = await NirvaReadSearchStore.deleteDomain(domain);
    this._notifyChanged();
    return result;
  },

  async deleteBefore(timestamp) {
    const result = await NirvaReadSearchStore.deleteBefore(timestamp);
    this._notifyChanged();
    return result;
  },

  async clear() {
    await NirvaReadSearchStore.clear();
    this._notifyChanged();
  },

  openSearch(win) {
    if (!win?.gBrowser || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return null;
    }
    const existing = [...win.gBrowser.tabs].find(
      tab => tab.linkedBrowser.currentURI.spec == SEARCH_URL
    );
    if (existing) {
      win.gBrowser.selectedTab = existing;
      return existing;
    }
    const tab = win.gBrowser.addTrustedTab(SEARCH_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  openResult(win, result) {
    if (!win?.gBrowser || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return;
    }
    const target =
      typeof result == "string" ? result : result?.localURI || result?.url;
    if (!target || !/^(?:https?:|file:|chrome:)/i.test(target)) {
      return;
    }
    win.openTrustedLinkIn(
      target,
      win.gBrowser.selectedTab.isEmpty ? "current" : "tab"
    );
  },

  async _trimToRetention() {
    const days = Services.prefs.getIntPref(PREF_RETENTION, 30);
    await NirvaReadSearchStore.deleteBefore(
      Date.now() - days * 24 * 60 * 60 * 1000
    );
  },

  _scanOpenTabs() {
    for (const record of this._windows) {
      for (const tab of record.win.gBrowser.tabs) {
        this._scheduleIndex(record, tab.linkedBrowser);
      }
    }
  },

  _scheduleAllowedPages() {
    for (const record of this._windows) {
      for (const tab of record.win.gBrowser.tabs) {
        const browser = tab.linkedBrowser;
        const url = urlForBrowser(browser);
        if (url && !NirvaReadSearchStore.isExcluded(url)) {
          this._lastIndexedWindow.delete(browser);
          this._scheduleIndex(record, browser);
        }
      }
    }
  },

  _cancelScheduledIndexes() {
    for (const record of this._windows) {
      for (const timer of record.timers.values()) {
        lazy.clearTimeout(timer);
      }
      record.timers.clear();
    }
  },

  _notifyChanged() {
    Services.obs.notifyObservers(null, "nirva-read-search-changed");
  },

  observe(subject, topic, data) {
    if (topic == "quit-application-granted") {
      this._cancelScheduledIndexes();
      NirvaReadSearchStore.close().catch(error =>
        console.error("Nirva Read Search could not close its index", error)
      );
      return;
    }
    if (topic == "browser-delayed-startup-finished") {
      this.initWindow(subject);
      return;
    }
    if (topic == "browser:purge-session-history") {
      this.clear().catch(error =>
        console.error("Nirva Read Search could not clear its index", error)
      );
      return;
    }
    if (topic == "browser:purge-session-history-for-domain") {
      this.deleteDomain(data).catch(error =>
        console.error("Nirva Read Search could not clear a domain", error)
      );
      return;
    }
    if (topic == "nsPref:changed") {
      if (data == PREF_ENABLED || data == PREF_PAUSED) {
        if (this.enabled && !this.paused) {
          this._scanOpenTabs();
        } else {
          this._cancelScheduledIndexes();
        }
        this._notifyChanged();
      } else if (data == PREF_RETENTION) {
        this._trimToRetention().catch(error =>
          console.error("Nirva Read Search could not apply retention", error)
        );
      }
    }
  },
};
