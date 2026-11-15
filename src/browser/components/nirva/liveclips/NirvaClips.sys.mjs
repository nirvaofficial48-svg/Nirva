/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import {
  NirvaClipsStore,
  clipSelector,
  clipURL,
} from "moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PageExtractorParent: "resource://gre/actors/PageExtractorParent.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(
      ["branding/brand.ftl", "browser/nirva/live-clips.ftl"],
      true
    )
);

const PREF_ENABLED = "nirva.liveclips.enabled";
const MANAGER_URL = "chrome://browser/content/nirva/live-clips.html";
const CHANGE_TOPIC = "nirva-live-clips-changed";
const REFRESH_ERRORS = { BlockedError: "blocked", TimeoutError: "timeout" };
const SENSITIVE_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;
const SENSITIVE_PAGE =
  /(?:^|[\s/_.-])(?:account[-_/ ]verification|authenticate|authentication|auth|banking|checkout|log[-_ ]?in|medical[-_/ ]?record|oauth|payment|password|patient[-_/ ]?portal|recovery|reset[-_ ]?password|sign[-_ ]?in|two[-_ ]?factor|2fa)(?:$|[\s/_.?#-])/i;

function hasSensitiveQuery(value) {
  try {
    return [...new URL(value).searchParams.keys()].some(key =>
      SENSITIVE_PARAMETER.test(key)
    );
  } catch (_error) {
    return true;
  }
}

function isSensitivePage(url, title) {
  try {
    const parsed = new URL(url);
    return SENSITIVE_PAGE.test(`${parsed.hostname}${parsed.pathname} ${title}`);
  } catch (_error) {
    return true;
  }
}

function selectedURL(browser) {
  return browser?.currentURI?.spec || "";
}

/** User-selected, locally stored page regions with opt-in anonymous refresh. */
export const NirvaClips = {
  _initialized: false,
  _scheduleTimer: null,
  _refreshing: false,

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaClips", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/liveclips/NirvaClipsParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/liveclips/NirvaClipsChild.sys.mjs",
      },
      messageManagerGroups: ["browsers", "headless-browsers"],
      safeForUntrustedWebProcess: true,
    });
    NirvaCommands.register({
      id: "live-clips-open",
      feature: "live-clips",
      l10nId: "nirva-command-live-clips",
      keywords: "clips watch regions page updates manage",
      isAvailable: win =>
        this.enabled && !lazy.PrivateBrowsingUtils.isWindowPrivate(win),
      run: win => this.openManager(win),
    });
    NirvaCommands.register({
      id: "live-clips-capture",
      feature: "live-clips",
      l10nId: "nirva-command-live-clips-capture",
      keywords: "clip select region page element monitor",
      isAvailable: win => this.canCapture(win, win.gBrowser?.selectedBrowser),
      run: win => this.captureSelected(win),
    });
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.obs.addObserver(this, CHANGE_TOPIC);
    Services.obs.addObserver(this, "quit-application-granted");
    Services.prefs.addObserver(PREF_ENABLED, this);
    this._ready = NirvaClipsStore.init().catch(error =>
      console.error("Nirva Live Clips could not start", error)
    );
    this._ready.then(() => this._scheduleNext());
  },

  observe(subject, topic) {
    if (topic == "nsPref:changed") {
      if (this.enabled) {
        this._scheduleNext();
      } else {
        this._clearSchedule();
      }
      return;
    }
    if (topic == "browser-delayed-startup-finished") {
      return;
    }
    if (topic == CHANGE_TOPIC) {
      this._scheduleNext();
      return;
    }
    if (topic == "quit-application-granted") {
      this._clearSchedule();
    }
  },

  canCapture(win, browser) {
    if (
      !this.enabled ||
      !win?.gBrowser ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(win) ||
      !browser?.browsingContext
    ) {
      return false;
    }
    const tab = win.gBrowser.getTabForBrowser(browser);
    if (
      !tab ||
      tab.closing ||
      tab.hasAttribute("nirva-burner") ||
      tab.getAttribute("data-nirva-burner") == "true"
    ) {
      return false;
    }
    const url = selectedURL(browser);
    return (
      Boolean(clipURL(url)) &&
      !hasSensitiveQuery(url) &&
      !isSensitivePage(url, browser.contentTitle || "")
    );
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

  openSource(win, url) {
    const safeURL = clipURL(url);
    if (!safeURL) {
      return false;
    }
    win.openTrustedLinkIn(safeURL, "tab");
    return true;
  },

  async captureSelected(win) {
    const browser = win.gBrowser?.selectedBrowser;
    if (!this.canCapture(win, browser)) {
      this._showNotice(win, "nirva-live-clips-not-supported");
      return null;
    }
    await this._ready;
    try {
      const startURL = clipURL(selectedURL(browser));
      const actor =
        browser.browsingContext.currentWindowGlobal.getActor("NirvaClips");
      const result = await actor.sendQuery("NirvaClips:PickRegion", {
        prompt: lazy.l10n.formatValueSync("nirva-live-clips-picker-prompt"),
        cancel: lazy.l10n.formatValueSync("nirva-live-clips-picker-cancel"),
      });
      if (!result) {
        return null;
      }
      if (result.error) {
        this._showNotice(win, "nirva-live-clips-region-unsupported");
        return null;
      }
      if (
        clipURL(result.url) != startURL ||
        hasSensitiveQuery(result.url) ||
        !clipSelector(result.selector)
      ) {
        this._showNotice(win, "nirva-live-clips-region-unsupported");
        return null;
      }
      const text = String(result.text || "").trim();
      if (!text) {
        this._showNotice(win, "nirva-live-clips-region-unsupported");
        return null;
      }
      await NirvaClipsStore.create({
        url: result.url,
        selector: result.selector,
        sourceTitle: result.title || new URL(startURL).hostname,
        title: text.slice(0, 72),
        text,
      });
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
      this._showNotice(win, "nirva-live-clips-created");
      this.openManager(win);
      return true;
    } catch (error) {
      console.error("Nirva could not create a Live Clip", error);
      this._showNotice(win, "nirva-live-clips-region-unsupported");
      return null;
    }
  },

  _showNotice(win, messageId) {
    if (!win?.gNotificationBox) {
      return;
    }
    const value = `nirva-live-clips-${messageId}`;
    win.gNotificationBox.appendNotification(
      value,
      {
        label: lazy.l10n.formatValueSync(messageId),
        priority: win.gNotificationBox.PRIORITY_INFO_MEDIUM,
      },
      []
    );
  },

  // Clips whose text changed at a refresh, with what they said before. Kept while the
  // browser runs, until the owner marks the change as seen; nothing extra is stored.
  _changes: new Map(),

  /**
   * @param {string} id
   * @returns {{previous: string, at: number}|null}
   */
  changeFor(id) {
    return this._changes.get(id) ?? null;
  },

  markSeen(id) {
    this._changes.delete(id);
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  /**
   * Refreshes every clip now, one after another.
   *
   * @returns {Promise<number>} how many clips changed
   */
  async refreshAll() {
    let changed = 0;
    for (const clip of await NirvaClipsStore.list()) {
      const hadChange = this._changes.get(clip.id)?.at;
      await this.refreshClip(clip.id, true);
      if (this._changes.get(clip.id)?.at != hadChange) {
        changed++;
      }
    }
    return changed;
  },

  /**
   * Open tabs a clip can be taken from.
   *
   * @param {Window} win
   */
  capturableTabs(win) {
    return (win?.gBrowser?.visibleTabs ?? []).filter(tab =>
      this.canCapture(win, tab.linkedBrowser)
    );
  },

  /**
   * Brings a tab forward and starts choosing a region on it.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab} tab
   */
  captureFromTab(win, tab) {
    win.gBrowser.selectedTab = tab;
    return this.captureSelected(win);
  },

  async refreshClip(id, allowPaused = false) {
    await this._ready;
    if (!this.enabled || this._refreshing) {
      return null;
    }
    const clip = await NirvaClipsStore.get(id);
    if (
      !clip ||
      (!allowPaused && (clip.paused || (await NirvaClipsStore.getPaused())))
    ) {
      return null;
    }
    this._refreshing = true;
    try {
      const result = await lazy.PageExtractorParent.getHeadlessExtractor({
        urlString: clip.url,
        anonymousFetch: true,
        settleDelayMs: 300,
        callback: async pageActor => {
          const actor =
            pageActor.browsingContext.currentWindowGlobal.getActor(
              "NirvaClips"
            );
          return actor.sendQuery("NirvaClips:Extract", {
            selector: clip.selector,
          });
        },
      });
      if (result?.error || !result?.text) {
        const reason = result?.error || "missing-region";
        await NirvaClipsStore.recordError(
          id,
          reason == "missing-region" ? reason : "unsupported"
        );
        Services.obs.notifyObservers(null, CHANGE_TOPIC);
        return null;
      }
      const before = (clip.text || "").trim();
      if (before && result.text.trim() != before) {
        this._changes.set(id, { previous: clip.text, at: Date.now() });
      }
      const refreshed = await NirvaClipsStore.recordRefresh(id, {
        text: result.text,
        sourceTitle: result.title,
      });
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
      return refreshed;
    } catch (error) {
      console.warn("Nirva Live Clip refresh failed", clip.url, error?.message);
      const reason = REFRESH_ERRORS[error?.name] || "unsupported";
      await NirvaClipsStore.recordError(id, reason);
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
      return null;
    } finally {
      this._refreshing = false;
      this._scheduleNext();
    }
  },

  async refreshDue() {
    await this._ready;
    if (
      !this.enabled ||
      (await NirvaClipsStore.getPaused()) ||
      this._refreshing
    ) {
      return;
    }
    const now = Date.now();
    const due = (await NirvaClipsStore.list())
      .filter(
        clip =>
          !clip.paused &&
          clip.refreshHours &&
          (clip.nextRefreshAt ||
            clip.updatedAt + clip.refreshHours * 3600000) <= now
      )
      .sort((a, b) => a.nextRefreshAt - b.nextRefreshAt)
      .slice(0, 4);
    for (const clip of due) {
      await this.refreshClip(clip.id);
    }
    this._scheduleNext();
  },

  async _scheduleNext() {
    this._clearSchedule();
    if (!this.enabled || !this._ready) {
      return;
    }
    try {
      await this._ready;
      if (await NirvaClipsStore.getPaused()) {
        return;
      }
      const clips = await NirvaClipsStore.list();
      const dueAt = clips
        .filter(clip => !clip.paused && clip.refreshHours)
        .map(
          clip =>
            clip.nextRefreshAt || clip.updatedAt + clip.refreshHours * 3600000
        )
        .sort((a, b) => a - b)[0];
      if (dueAt) {
        this._scheduleTimer = lazy.setTimeout(
          () => this.refreshDue(),
          Math.max(
            dueAt <= Date.now() ? 5 * 60 * 1000 : 1000,
            dueAt - Date.now()
          )
        );
      }
    } catch (error) {
      console.error("Nirva Live Clips could not schedule refreshes", error);
    }
  },

  _clearSchedule() {
    if (this._scheduleTimer) {
      lazy.clearTimeout(this._scheduleTimer);
      this._scheduleTimer = null;
    }
  },
};
