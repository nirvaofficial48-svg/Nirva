/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaWorkspaces } from "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs";
import { NirvaTimeTravelStore } from "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravelStore.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  SessionStore:
    "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs",
  TabStateFlusher:
    "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs",
  setInterval: "resource://gre/modules/Timer.sys.mjs",
  clearInterval: "resource://gre/modules/Timer.sys.mjs",
});

const PREF_ENABLED = "nirva.timetravel.enabled";
const PREF_RETENTION = "nirva.timetravel.retentionDays";
const PREF_STORAGE = "nirva.timetravel.storageLimitMB";
const TIMELINE_URL = "chrome://browser/content/nirva/timeline.html";
const CAPTURE_INTERVAL = 10 * 60 * 1000;
const CHANGE_TOPIC = "nirva-timetravel-changed";

function waitForWindowRestore(win) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    const timer = win.setTimeout(() => {
      win.removeEventListener("SSWindowRestored", restored);
      reject(new Error("Firefox did not finish restoring this window"));
    }, 30000);
    function restored() {
      win.clearTimeout(timer);
      resolve();
    }
    cancel = () => {
      win.clearTimeout(timer);
      win.removeEventListener("SSWindowRestored", restored);
    };
    win.addEventListener("SSWindowRestored", restored, { once: true });
  });
  return { promise, cancel: () => cancel?.() };
}

function waitForTabRestore(tab) {
  let cancel;
  const promise = new Promise((resolve, reject) => {
    const win = tab.documentGlobal;
    const timer = win.setTimeout(() => {
      tab.removeEventListener("SSTabRestored", restored);
      reject(new Error("Firefox did not finish restoring this tab"));
    }, 30000);
    function restored() {
      win.clearTimeout(timer);
      resolve();
    }
    cancel = () => {
      win.clearTimeout(timer);
      tab.removeEventListener("SSTabRestored", restored);
    };
    tab.addEventListener("SSTabRestored", restored, { once: true });
  });
  return { promise, cancel: () => cancel?.() };
}

function safeWindowState(win) {
  try {
    const state = lazy.SessionStore.getWindowState(win).windows?.[0];
    return state &&
      !state.isPrivate &&
      !state.isAIWindow &&
      !state.isPopup &&
      !state.isMiniWindow &&
      !state.isTaskbarTab
      ? state
      : null;
  } catch (_error) {
    return null;
  }
}

function restorableWindows() {
  return lazy.BrowserWindowTracker.orderedWindows.filter(
    win => !win.closed && win.gBrowser && safeWindowState(win)
  );
}

/** 30-day session timeline built on Firefox SessionStore. */
export const NirvaTimeTravel = {
  _initialized: false,
  _sessionReady: null,
  _startPromise: null,
  _started: false,
  _timer: null,
  _windowListeners: new WeakSet(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registerCommands();
    Services.prefs.addObserver(PREF_ENABLED, this);
    Services.prefs.addObserver(PREF_RETENTION, this);
    Services.prefs.addObserver(PREF_STORAGE, this);
    Services.obs.addObserver(this, "browser-window-before-show");
    Services.obs.addObserver(this, "browser:purge-session-history");
    Services.obs.addObserver(this, "browser:purge-session-history-for-domain");
    this._sessionReady = lazy.SessionStore.promiseAllWindowsRestored;
    if (this.enabled) {
      this._startRecording("startup").catch(error =>
        console.error("Nirva Time Travel could not start recording", error)
      );
    }
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "time-travel",
      feature: "time-travel",
      l10nId: "nirva-command-time-travel",
      keywords: "history session timeline restore rewind",
      run: win => this.openTimeline(win),
    });
  },

  async _startRecording(reason) {
    if (!this.enabled) {
      this._stopRecording();
      return;
    }
    if (this._timer) {
      return;
    }
    if (this._startPromise) {
      await this._startPromise;
      return;
    }
    this._startPromise = (async () => {
      await this._sessionReady;
      if (!this.enabled) {
        return;
      }
      await NirvaTimeTravelStore.init();
      for (const win of Services.wm.getEnumerator("navigator:browser")) {
        this._watchWindow(win);
      }
      const initialReason = this._started ? "manual" : reason;
      this._started = true;
      await this.captureNow(initialReason);
      if (this.enabled && !this._timer) {
        this._timer = lazy.setInterval(
          () =>
            this.captureNow("periodic").catch(error =>
              console.error("Nirva Time Travel checkpoint failed", error)
            ),
          CAPTURE_INTERVAL
        );
      }
    })();
    try {
      await this._startPromise;
    } finally {
      this._startPromise = null;
    }
  },

  _stopRecording() {
    if (this._timer) {
      lazy.clearInterval(this._timer);
      this._timer = null;
    }
  },

  _watchWindow(win) {
    if (!win?.gBrowser || this._windowListeners.has(win)) {
      return;
    }
    this._windowListeners.add(win);
    win.addEventListener(
      "SSWindowClosing",
      () => {
        if (this.enabled) {
          this.captureNow("window-close", win).catch(error =>
            console.error("Nirva Time Travel close checkpoint failed", error)
          );
        }
      },
      { once: true }
    );
  },

  async captureNow(reason = "manual", closingWindow = null, force = false) {
    if (!force && !this.enabled) {
      return null;
    }
    if (!closingWindow) {
      // NIRVA: Wait for buffered content-process history before a durable checkpoint.
      await Promise.all(
        restorableWindows().map(win => lazy.TabStateFlusher.flushWindow(win))
      );
    }
    // NIRVA: Read the state synchronously for SSWindowClosing, before SessionStore drops the window.
    let state = JSON.parse(lazy.SessionStore.getBrowserState());
    if (closingWindow) {
      try {
        const closingState =
          lazy.SessionStore.getWindowState(closingWindow).windows?.[0];
        const closingId = closingState?.__lastSessionWindowID;
        const index = state.windows.findIndex(
          win => win.__lastSessionWindowID == closingId
        );
        if (index >= 0) {
          state.windows[index] = closingState;
        }
      } catch (_error) {
        // SessionStore can finish removing a window before this callback runs.
      }
    }
    const snapshot = await NirvaTimeTravelStore.capture(
      state,
      NirvaWorkspaces.list,
      reason
    );
    if (snapshot) {
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
    }
    return snapshot;
  },

  async getTimeline() {
    const [snapshots, storageBytes] = await Promise.all([
      NirvaTimeTravelStore.list(),
      NirvaTimeTravelStore.storageBytes(),
    ]);
    return {
      snapshots,
      storageBytes,
      enabled: this.enabled,
      retentionDays: Services.prefs.getIntPref(PREF_RETENTION, 30),
      storageLimitMB: Services.prefs.getIntPref(PREF_STORAGE, 128),
    };
  },

  async preview(id) {
    return NirvaTimeTravelStore.read(id);
  },

  // Addresses in each saved state, by its content hash; identical states share one entry.
  _sitesByRoot: new Map(),

  /**
   * The saved states that had a page open whose address contains the given text, newest
   * first. Reads states as needed and remembers their addresses while the browser runs;
   * nothing on disk changes.
   *
   * @param {string} query part of a site name or address, such as "github" or "mail.example"
   * @param {object} [options]
   * @param {number} [options.limit] at most this many results
   * @returns {Promise<Array<{id: string, createdAt: number, site: string}>>}
   */
  async findSnapshots(query, { limit = 60 } = {}) {
    const text = String(query || "")
      .trim()
      .toLowerCase();
    if (!text) {
      return [];
    }
    const snapshots = (await NirvaTimeTravelStore.list()).sort(
      (a, b) => b.createdAt - a.createdAt
    );
    const found = [];
    for (const snapshot of snapshots) {
      let sites = this._sitesByRoot.get(snapshot.rootHash);
      if (!sites) {
        sites = [];
        try {
          const { state } = await NirvaTimeTravelStore.read(snapshot.id);
          for (const win of state?.windows ?? []) {
            for (const tab of win.tabs ?? []) {
              const entries = tab.entries ?? [];
              const entry =
                entries[
                  Math.min(
                    Math.max((tab.index || entries.length) - 1, 0),
                    entries.length - 1
                  )
                ];
              if (entry?.url) {
                sites.push(entry.url);
              }
            }
          }
        } catch (_error) {}
        this._sitesByRoot.set(snapshot.rootHash, sites);
      }
      const hit = sites.find(url => url.toLowerCase().includes(text));
      if (hit) {
        let site = hit;
        try {
          site = new URL(hit).hostname || hit;
        } catch (_error) {}
        found.push({ id: snapshot.id, createdAt: snapshot.createdAt, site });
        if (found.length >= limit) {
          break;
        }
      }
    }
    return found;
  },

  async deleteSnapshot(id) {
    const deleted = await NirvaTimeTravelStore.delete(id);
    if (deleted) {
      Services.obs.notifyObservers(null, CHANGE_TOPIC);
    }
    return deleted;
  },

  async clearSnapshots() {
    await NirvaTimeTravelStore.clear();
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  async setEnabled(enabled) {
    Services.prefs.setBoolPref(PREF_ENABLED, Boolean(enabled));
    if (enabled) {
      await this._startRecording("manual");
    } else {
      this._stopRecording();
    }
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  async setRetentionDays(days) {
    if (![7, 14, 30].includes(Number(days))) {
      throw new Error("Choose a retention period of 7, 14, or 30 days");
    }
    Services.prefs.setIntPref(PREF_RETENTION, Number(days));
    await NirvaTimeTravelStore.trimToLimits();
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  async setStorageLimitMB(megabytes) {
    if (![64, 128, 256].includes(Number(megabytes))) {
      throw new Error("Choose a storage limit of 64, 128, or 256 MB");
    }
    Services.prefs.setIntPref(PREF_STORAGE, Number(megabytes));
    await NirvaTimeTravelStore.trimToLimits();
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  async restoreSnapshot(id) {
    const target = await NirvaTimeTravelStore.read(id);
    if (!lazy.SessionStore.isFormatVersionCompatible(target.state.version)) {
      throw new Error(
        "This session snapshot is from an unsupported Firefox version"
      );
    }
    const safety = await this.captureNow("before-restore", null, true);
    if (!safety) {
      throw new Error(
        "The current session could not be saved before restoring"
      );
    }
    try {
      await this._applySnapshot(target);
    } catch (error) {
      try {
        await this._applySnapshot(await NirvaTimeTravelStore.read(safety.id));
      } catch (recoveryError) {
        console.error(
          "Nirva Time Travel recovery restore failed",
          recoveryError
        );
      }
      throw new Error(
        `Restore did not finish; a safety snapshot was saved: ${error.message}`
      );
    }
    return safety;
  },

  async restoreTab(id, windowIndex, tabIndex) {
    const target = await NirvaTimeTravelStore.read(id);
    if (!lazy.SessionStore.isFormatVersionCompatible(target.state.version)) {
      throw new Error(
        "This session snapshot is from an unsupported Firefox version"
      );
    }
    const sourceWindow = target.state.windows[windowIndex];
    const sourceTab = sourceWindow?.tabs?.[tabIndex];
    if (!sourceTab) {
      throw new Error("This snapshot no longer contains that tab");
    }
    const win = restorableWindows()[0];
    if (!win) {
      throw new Error("Open a regular browser window before restoring a tab");
    }

    const safety = await this.captureNow("before-restore", null, true);
    if (!safety) {
      throw new Error(
        "The current session could not be saved before restoring"
      );
    }

    const tabState = JSON.parse(JSON.stringify(sourceTab));
    const savedGroup = sourceWindow.groups?.find(
      group => group.id == tabState.groupId
    );
    delete tabState.groupId;
    // NIRVA: An isolated tab cannot rejoin a split view without its companion tab.
    delete tabState.splitViewId;
    delete tabState.hidden;

    const previousWorkspaceList = NirvaWorkspaces.list;
    const previousActiveWorkspace = NirvaWorkspaces.getActive(win);
    const mergedWorkspaceList = previousWorkspaceList.map(workspace => ({
      ...workspace,
    }));
    for (const workspace of target.workspaceList) {
      const index = mergedWorkspaceList.findIndex(
        item => item.id == workspace.id
      );
      if (index >= 0) {
        mergedWorkspaceList[index] = { ...workspace };
      } else if (mergedWorkspaceList.length < 32) {
        mergedWorkspaceList.push({ ...workspace });
      }
    }
    let workspaceId = tabState.extData?.["nirva-workspace"];
    if (!mergedWorkspaceList.some(workspace => workspace.id == workspaceId)) {
      workspaceId = mergedWorkspaceList.some(
        workspace => workspace.id == previousActiveWorkspace
      )
        ? previousActiveWorkspace
        : mergedWorkspaceList[0].id;
    }
    tabState.extData = {
      ...(tabState.extData || {}),
      "nirva-workspace": workspaceId,
    };

    let tab = null;
    let cancelRestoreWait = () => {};
    try {
      NirvaWorkspaces._save(mergedWorkspaceList);
      tab = win.gBrowser.addTrustedTab(null, {
        inBackground: false,
        pinned: Boolean(tabState.pinned),
        skipLoad: true,
        userContextId: tabState.userContextId || 0,
      });
      const wait = waitForTabRestore(tab);
      cancelRestoreWait = wait.cancel;
      try {
        lazy.SessionStore.setTabState(tab, tabState);
      } catch (error) {
        wait.cancel();
        throw error;
      }
      await wait.promise;
      if (savedGroup && !tab.pinned) {
        const group = win.gBrowser.addTabGroup([tab], {
          label: savedGroup.name,
          color: savedGroup.color,
        });
        if (group) {
          group.collapsed = Boolean(savedGroup.collapsed);
        }
      }
      NirvaWorkspaces._setActive(win, workspaceId);
      NirvaWorkspaces.updateWindow(win);
      win.gBrowser.selectedTab = tab;
      win.focus();
    } catch (error) {
      cancelRestoreWait();
      NirvaWorkspaces._save(previousWorkspaceList);
      NirvaWorkspaces._setActive(
        win,
        previousWorkspaceList.some(
          workspace => workspace.id == previousActiveWorkspace
        )
          ? previousActiveWorkspace
          : previousWorkspaceList[0].id
      );
      NirvaWorkspaces.updateWindow(win);
      if (tab && !tab.closing) {
        win.gBrowser.removeTab(tab);
      }
      throw new Error(
        `Tab restore did not finish; a safety snapshot was saved: ${error.message}`
      );
    }
    return safety;
  },

  async _applySnapshot(snapshot) {
    const targetWindows = snapshot.state.windows;
    if (!Array.isArray(targetWindows) || !targetWindows.length) {
      throw new Error("This snapshot has no restorable browser windows");
    }
    const windows = restorableWindows();
    if (!windows.length) {
      throw new Error(
        "Open a regular browser window before restoring a timeline"
      );
    }

    // NIRVA: SessionStore restores windows individually, so allocate fresh IDs for split views.
    const splitViewIds = new Map();
    for (const windowState of targetWindows) {
      for (const tab of windowState.tabs) {
        if (!Number.isSafeInteger(tab.splitViewId) || tab.splitViewId <= 0) {
          continue;
        }
        if (!splitViewIds.has(tab.splitViewId)) {
          splitViewIds.set(
            tab.splitViewId,
            lazy.SessionStore.getNextSplitViewId()
          );
        }
        tab.splitViewId = splitViewIds.get(tab.splitViewId);
      }
      for (const splitView of windowState.splitViews || []) {
        if (!splitViewIds.has(splitView.id)) {
          splitViewIds.set(
            splitView.id,
            lazy.SessionStore.getNextSplitViewId()
          );
        }
        splitView.id = splitViewIds.get(splitView.id);
      }
    }
    NirvaWorkspaces._save(snapshot.workspaceList);

    while (windows.length < targetWindows.length) {
      const win = await lazy.BrowserWindowTracker.promiseOpenWindow({
        openerWindow: windows[0],
        private: false,
      });
      windows.push(win);
    }

    for (let index = 0; index < targetWindows.length; index++) {
      const win = windows[index];
      const restored = waitForWindowRestore(win);
      try {
        lazy.SessionStore.setWindowState(
          win,
          { windows: [targetWindows[index]] },
          true
        );
      } catch (error) {
        restored.cancel();
        throw error;
      }
      await restored.promise;
    }

    for (const win of windows.slice(targetWindows.length)) {
      const closed = new Promise(resolve =>
        win.addEventListener("unload", resolve, { once: true })
      );
      win.close();
      await Promise.race([
        closed,
        new Promise(resolve => win.setTimeout(resolve, 5000)),
      ]);
    }
    const selected = windows[Math.max(0, snapshot.state.selectedWindow - 1)];
    selected?.focus();
  },

  openTimeline(win) {
    if (!win?.gBrowser) {
      return null;
    }
    for (const browserWindow of Services.wm.getEnumerator(
      "navigator:browser"
    )) {
      const existing = Array.from(browserWindow.gBrowser.tabs).find(
        tab => tab.linkedBrowser?.currentURI?.spec == TIMELINE_URL
      );
      if (existing) {
        browserWindow.gBrowser.selectedTab = existing;
        browserWindow.focus();
        return existing;
      }
    }
    const tab = win.gBrowser.addTrustedTab(TIMELINE_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      if (data == PREF_ENABLED) {
        if (this.enabled) {
          this._startRecording("manual").catch(error =>
            console.error("Nirva Time Travel could not resume recording", error)
          );
        } else {
          this._stopRecording();
        }
      } else {
        NirvaTimeTravelStore.trimToLimits()
          .then(() => Services.obs.notifyObservers(null, CHANGE_TOPIC))
          .catch(error =>
            console.error(
              "Nirva Time Travel could not apply storage settings",
              error
            )
          );
      }
    } else if (topic == "browser-window-before-show") {
      this._watchWindow(subject);
    } else if (
      topic == "browser:purge-session-history" ||
      topic == "browser:purge-session-history-for-domain"
    ) {
      // Clearing any browser history also clears the timeline, including domain-only wipes.
      this.clearSnapshots().catch(error =>
        console.error("Nirva Time Travel history cleanup failed", error)
      );
    }
  },
};
