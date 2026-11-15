/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const STORE_VERSION = 1;
const STORE_NAME = "nirva-time-travel.jsonlz4";
const SAFE_ABOUT_PAGES = new Set(["about:blank", "about:home", "about:newtab"]);
const SENSITIVE_QUERY_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;
const STORE_HASH = /^[0-9a-f]{64}$/;
const SAFE_TAB_GROUP_COLORS = new Set([
  "blue",
  "purple",
  "cyan",
  "orange",
  "yellow",
  "pink",
  "green",
  "gray",
  "red",
]);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeWorkspaceList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter(
      workspace =>
        typeof workspace?.id == "string" &&
        /^[\w-]{1,64}$/.test(workspace.id) &&
        typeof workspace.name == "string"
    )
    .slice(0, 32)
    .map(workspace => ({
      id: workspace.id,
      name: workspace.name.trim().slice(0, 40) || "Workspace",
    }));
}

function safeURL(value) {
  if (typeof value != "string" || value.length > 8192) {
    return null;
  }
  if (SAFE_ABOUT_PAGES.has(value)) {
    return value;
  }
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if (
    !(
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    )
  ) {
    return null;
  }
  for (const parameter of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_PARAMETER.test(parameter)) {
      url.searchParams.delete(parameter);
    }
  }
  const fragmentHasSensitiveData = [
    ...url.hash.matchAll(/(?:^|[#?&/])([^=&#/?]+)=/g),
  ].some(match => SENSITIVE_QUERY_PARAMETER.test(match[1]));
  if (fragmentHasSensitiveData) {
    url.hash = "";
  }
  return url.href;
}

function safeEntry(entry) {
  if (
    !entry ||
    typeof entry != "object" ||
    entry.subframe ||
    entry.isSrcdocEntry
  ) {
    return null;
  }
  const url = safeURL(entry?.url);
  if (!url) {
    return null;
  }
  const clean = {
    url,
    title: SAFE_ABOUT_PAGES.has(url) ? url.slice(6) : new URL(url).hostname,
    hasUserInteraction: Boolean(entry.hasUserInteraction),
  };
  for (const field of [
    "persist",
    "scrollRestorationIsManual",
    "loadReplace",
    "loadReplace2",
  ]) {
    if (typeof entry[field] == "boolean") {
      clean[field] = entry[field];
    }
  }
  for (const field of [
    "triggeringPrincipal_base64",
    "principalToInherit_base64",
  ]) {
    if (typeof entry[field] == "string" && entry[field].length <= 4096) {
      clean[field] = entry[field];
    }
  }
  if (typeof entry.resultPrincipalURI == "string") {
    const resultPrincipalURI = safeURL(entry.resultPrincipalURI);
    if (resultPrincipalURI) {
      clean.resultPrincipalURI = resultPrincipalURI;
    }
  } else if (entry.resultPrincipalURI === null) {
    clean.resultPrincipalURI = null;
  }
  if (
    typeof entry.scroll == "string" &&
    /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(entry.scroll)
  ) {
    clean.scroll = entry.scroll;
  }
  return clean;
}

function safeExtData(extData) {
  const workspace = extData?.["nirva-workspace"];
  return typeof workspace == "string" && /^[\w-]{1,64}$/.test(workspace)
    ? { "nirva-workspace": workspace }
    : {};
}

function sanitizeTab(sourceTab) {
  if (!sourceTab || typeof sourceTab != "object") {
    return null;
  }
  // NIRVA: Burner tabs are temporary and never belong in a saved timeline.
  if (sourceTab.extData?.["nirva-burner"]) {
    return null;
  }
  const sourceEntries = Array.isArray(sourceTab.entries)
    ? sourceTab.entries
    : [];
  const entries = [];
  const oldToNewIndex = new Map();
  for (let index = 0; index < sourceEntries.length; index++) {
    const entry = safeEntry(sourceEntries[index]);
    if (entry) {
      entries.push(entry);
      oldToNewIndex.set(index + 1, entries.length);
    }
  }
  if (!entries.length) {
    return null;
  }

  const selectedIndex =
    oldToNewIndex.get(sourceTab.index || 1) || entries.length;
  const tabState = {
    entries,
    index: selectedIndex,
    lastAccessed: Number.isSafeInteger(sourceTab.lastAccessed)
      ? sourceTab.lastAccessed
      : 0,
    hidden: Boolean(sourceTab.hidden),
    title: entries[selectedIndex - 1].title,
  };
  for (const field of ["pinned", "muted"]) {
    if (typeof sourceTab[field] == "boolean") {
      tabState[field] = sourceTab[field];
    }
  }
  if (typeof sourceTab.groupId == "string" && sourceTab.groupId.length <= 128) {
    tabState.groupId = sourceTab.groupId;
  }
  if (
    Number.isSafeInteger(sourceTab.splitViewId) &&
    sourceTab.splitViewId > 0
  ) {
    tabState.splitViewId = sourceTab.splitViewId;
  }
  if (
    Number.isSafeInteger(sourceTab.userContextId) &&
    sourceTab.userContextId >= 0
  ) {
    tabState.userContextId = sourceTab.userContextId;
  }
  if (typeof sourceTab.canonicalUrl == "string") {
    tabState.canonicalUrl =
      safeURL(sourceTab.canonicalUrl) || entries.at(-1).url;
  }
  if (sourceTab.attributes?.usercontextid) {
    tabState.attributes = {
      usercontextid: String(sourceTab.attributes.usercontextid).slice(0, 16),
    };
  }
  if (
    typeof sourceTab.scroll == "string" &&
    /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/.test(sourceTab.scroll)
  ) {
    tabState.scroll = sourceTab.scroll;
  }
  tabState.extData = safeExtData(sourceTab.extData);
  return { state: tabState, selectedIndex };
}

/**
 * Keep only restorable browsing context, excluding private or sensitive data.
 * This deliberately stores URLs and navigation history, but no page contents,
 * cookies, form values, session storage, or identifying page titles.
 *
 * @param {object|string} rawState - SessionStore browser state.
 * @returns {object|null} Sanitized session state, or null if nothing is safe.
 */
export function sanitizeSessionState(rawState) {
  let state;
  try {
    state = typeof rawState == "string" ? JSON.parse(rawState) : copy(rawState);
  } catch (_error) {
    return null;
  }
  if (!Array.isArray(state?.windows)) {
    return null;
  }

  const windows = [];
  const oldToNewWindowIndex = new Map();
  for (let windowIndex = 0; windowIndex < state.windows.length; windowIndex++) {
    const sourceWindow = state.windows[windowIndex];
    if (
      !sourceWindow ||
      typeof sourceWindow != "object" ||
      sourceWindow.isPrivate ||
      sourceWindow.isAIWindow ||
      sourceWindow.isPopup ||
      sourceWindow.isTaskbarTab ||
      sourceWindow.isMiniWindow
    ) {
      continue;
    }
    const windowState = {};
    const tabs = [];
    const oldToNewTabIndex = new Map();
    const sourceTabs = Array.isArray(sourceWindow.tabs)
      ? sourceWindow.tabs
      : [];
    for (let tabIndex = 0; tabIndex < sourceTabs.length; tabIndex++) {
      const sanitizedTab = sanitizeTab(sourceTabs[tabIndex]);
      if (!sanitizedTab) {
        continue;
      }
      tabs.push(sanitizedTab.state);
      oldToNewTabIndex.set(tabIndex + 1, tabs.length);
    }

    windowState.tabs = tabs;
    const selectedTab = oldToNewTabIndex.get(sourceWindow.selected || 1);
    windowState.selected = selectedTab || (tabs.length ? 1 : 0);
    for (const field of ["width", "height"]) {
      const size = Number(sourceWindow[field]);
      if (Number.isSafeInteger(size) && size >= 300 && size <= 10000) {
        windowState[field] = size;
      }
    }
    for (const field of ["screenX", "screenY"]) {
      const position = Number(sourceWindow[field]);
      if (Number.isSafeInteger(position) && Math.abs(position) <= 100000) {
        windowState[field] = position;
      }
    }
    if (["normal", "maximized", "fullscreen"].includes(sourceWindow.sizemode)) {
      windowState.sizemode = sourceWindow.sizemode;
    }
    if (
      ["normal", "maximized"].includes(sourceWindow.sizemodeBeforeMinimized)
    ) {
      windowState.sizemodeBeforeMinimized =
        sourceWindow.sizemodeBeforeMinimized;
    }

    const groupIds = new Set(tabs.map(tab => tab.groupId).filter(Boolean));
    if (Array.isArray(sourceWindow.groups)) {
      windowState.groups = sourceWindow.groups
        .filter(
          group =>
            group &&
            typeof group.id == "string" &&
            groupIds.has(group.id) &&
            typeof group.name == "string" &&
            SAFE_TAB_GROUP_COLORS.has(group.color)
        )
        .map(group => ({
          id: group.id,
          name: group.name.slice(0, 80),
          color: group.color,
          collapsed: Boolean(group.collapsed),
          ...(typeof group.saveOnWindowClose == "boolean"
            ? { saveOnWindowClose: group.saveOnWindowClose }
            : {}),
        }));
    }
    const splitViewIds = new Set(
      tabs.map(tab => tab.splitViewId).filter(id => Number.isSafeInteger(id))
    );
    if (Array.isArray(sourceWindow.splitViews)) {
      windowState.splitViews = sourceWindow.splitViews
        .filter(
          splitView =>
            splitView &&
            Number.isSafeInteger(splitView.id) &&
            splitViewIds.has(splitView.id) &&
            Number.isSafeInteger(splitView.numberOfTabs)
        )
        .map(splitView => ({
          id: splitView.id,
          numberOfTabs: splitView.numberOfTabs,
        }));
    }
    windowState.extData = safeExtData(sourceWindow.extData);
    windowState.title = "Nirva window";
    windows.push(windowState);
    oldToNewWindowIndex.set(windowIndex + 1, windows.length);
  }

  if (!windows.length) {
    return null;
  }
  return {
    version:
      Array.isArray(state.version) &&
      state.version.length == 2 &&
      typeof state.version[0] == "string" &&
      Number.isSafeInteger(state.version[1])
        ? [state.version[0], state.version[1]]
        : ["sessionrestore", 0],
    selectedWindow:
      oldToNewWindowIndex.get(Number(state.selectedWindow) || 1) || 1,
    maxSplitViewId:
      Number.isSafeInteger(state.maxSplitViewId) && state.maxSplitViewId >= 0
        ? state.maxSplitViewId
        : 0,
    windows,
  };
}

function normalizeStore(data) {
  const normalized = { version: STORE_VERSION, snapshots: [], blobs: {} };
  if (data?.version != STORE_VERSION) {
    return normalized;
  }
  if (Array.isArray(data.snapshots)) {
    normalized.snapshots = data.snapshots
      .filter(
        snapshot =>
          typeof snapshot?.id == "string" &&
          Number.isSafeInteger(snapshot.createdAt) &&
          STORE_HASH.test(snapshot.rootHash) &&
          [
            "startup",
            "periodic",
            "window-close",
            "manual",
            "before-restore",
          ].includes(snapshot.reason)
      )
      .slice(-5000)
      .map(snapshot => ({
        id: snapshot.id,
        createdAt: snapshot.createdAt,
        reason: snapshot.reason,
        rootHash: snapshot.rootHash,
        windowCount: Math.max(0, Number(snapshot.windowCount) || 0),
        tabCount: Math.max(0, Number(snapshot.tabCount) || 0),
      }));
  }
  if (data.blobs && typeof data.blobs == "object") {
    for (const [hash, blob] of Object.entries(data.blobs)) {
      if (
        STORE_HASH.test(hash) &&
        typeof blob == "string" &&
        blob.length <= 32 * 1024 * 1024
      ) {
        normalized.blobs[hash] = blob;
      }
    }
  }
  return normalized;
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value == "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function hashText(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function trimBlobReferences(data) {
  const referenced = new Set();
  for (const snapshot of data.snapshots) {
    referenced.add(snapshot.rootHash);
    try {
      const root = JSON.parse(data.blobs[snapshot.rootHash]);
      for (const windowHash of root.windows || []) {
        referenced.add(windowHash);
        const window = JSON.parse(data.blobs[windowHash]);
        for (const tabHash of window.tabs || []) {
          referenced.add(tabHash);
        }
      }
    } catch (_error) {
      // Keep no unreachable or corrupt blobs when a damaged snapshot is found.
    }
  }
  for (const hash of Object.keys(data.blobs)) {
    if (!referenced.has(hash)) {
      delete data.blobs[hash];
    }
  }
}

async function expandSnapshot(data, snapshot) {
  async function readBlob(hash) {
    if (!STORE_HASH.test(hash) || typeof data.blobs[hash] != "string") {
      throw new Error("A saved snapshot is incomplete or damaged");
    }
    if ((await hashText(data.blobs[hash])) != hash) {
      throw new Error("A saved snapshot failed its integrity check");
    }
    return JSON.parse(data.blobs[hash]);
  }

  const root = await readBlob(snapshot.rootHash);
  const windows = await Promise.all(
    root.windows.map(async windowHash => {
      const storedWindow = await readBlob(windowHash);
      return {
        ...storedWindow.window,
        tabs: await Promise.all(
          storedWindow.tabs.map(tabHash => readBlob(tabHash))
        ),
      };
    })
  );
  return {
    state: {
      version: root.sessionVersion,
      selectedWindow: root.selectedWindow,
      maxSplitViewId: root.maxSplitViewId,
      windows,
    },
    workspaceList: safeWorkspaceList(root.workspaceList),
  };
}

/**
 * LZ4-backed content-addressed session snapshots. A snapshot stores references
 * to unique window and tab records, so unchanged tabs are shared by later
 * snapshots instead of being written again.
 */
export class NirvaTimeTravelStoreClass {
  constructor(path = PathUtils.join(PathUtils.profileDir, STORE_NAME)) {
    this.path = path;
    this._file = null;
    this._ready = null;
    this._writes = Promise.resolve();
    this._queue = Promise.resolve();
  }

  _serialize(task) {
    const result = this._queue.then(task);
    this._queue = result.catch(error => {
      console.error("Nirva Time Travel store operation failed", error);
    });
    return result;
  }

  async init() {
    if (!this._ready) {
      this._ready = (async () => {
        this._file = new JSONFile({
          path: this.path,
          compression: "lz4",
          sanitizedBasename: "nirva-time-travel",
          dataPostProcessor: normalizeStore,
        });
        await IOUtils.makeDirectory(PathUtils.parent(this.path));
        await this._file.load();
        IOUtils.profileBeforeChange.addBlocker(
          "Nirva time travel snapshots",
          () => this._queue
        );
      })();
    }
    return this._ready;
  }

  async _persist() {
    const data = copy(this._file.data);
    this._writes = this._writes
      .catch(() => {})
      .then(() =>
        IOUtils.writeJSON(this.path, data, {
          compress: true,
          tmpPath: `${this.path}.tmp`,
        })
      );
    return this._writes;
  }

  async _intern(value) {
    const text = stableStringify(value);
    const hash = await hashText(text);
    if (!this._file.data.blobs[hash]) {
      this._file.data.blobs[hash] = text;
    }
    return hash;
  }

  async _makeRoot(state, workspaceList) {
    const windowHashes = [];
    let tabCount = 0;
    for (const sourceWindow of state.windows) {
      const windowState = copy(sourceWindow);
      const tabs = windowState.tabs;
      delete windowState.tabs;
      const tabHashes = await Promise.all(tabs.map(tab => this._intern(tab)));
      tabCount += tabHashes.length;
      windowHashes.push(
        await this._intern({ window: windowState, tabs: tabHashes })
      );
    }
    const rootHash = await this._intern({
      sessionVersion: state.version || ["sessionrestore", 0],
      selectedWindow: state.selectedWindow,
      maxSplitViewId: state.maxSplitViewId,
      workspaceList: safeWorkspaceList(workspaceList),
      windows: windowHashes,
    });
    return { rootHash, tabCount };
  }

  async capture(
    rawState,
    workspaceList = [],
    reason = "manual",
    createdAt = Date.now()
  ) {
    await this.init();
    return this._serialize(() =>
      this._capture(rawState, workspaceList, reason, createdAt)
    );
  }

  async _capture(rawState, workspaceList, reason, createdAt) {
    const state = sanitizeSessionState(rawState);
    if (!state) {
      return null;
    }
    if (
      ![
        "startup",
        "periodic",
        "window-close",
        "manual",
        "before-restore",
      ].includes(reason)
    ) {
      reason = "manual";
    }

    const previous = copy(this._file.data);
    const { rootHash, tabCount } = await this._makeRoot(state, workspaceList);
    const snapshot = {
      id: Services.uuid.generateUUID().toString(),
      createdAt,
      reason,
      rootHash,
      windowCount: state.windows.length,
      tabCount,
    };
    this._file.data.snapshots.push(snapshot);
    const retentionDays = Services.prefs.getIntPref(
      "nirva.timetravel.retentionDays",
      30
    );
    const cutoff =
      Date.now() - Math.min(30, Math.max(1, retentionDays)) * 86400000;
    this._file.data.snapshots = this._file.data.snapshots.filter(
      item => item.createdAt >= cutoff
    );
    trimBlobReferences(this._file.data);
    await this._persist();

    const limitMB = Services.prefs.getIntPref(
      "nirva.timetravel.storageLimitMB",
      128
    );
    const limitBytes = Math.min(256, Math.max(64, limitMB)) * 1024 * 1024;
    let size = await this._storageBytesNow();
    while (size > limitBytes && this._file.data.snapshots.length > 1) {
      this._file.data.snapshots.shift();
      trimBlobReferences(this._file.data);
      await this._persist();
      size = await this._storageBytesNow();
    }
    if (size > limitBytes) {
      this._file.data = previous;
      await this._persist();
      return null;
    }
    return { ...snapshot, storageBytes: size };
  }

  async list() {
    await this.init();
    return this._serialize(() => copy(this._file.data.snapshots));
  }

  async read(id) {
    await this.init();
    return this._serialize(async () => {
      const snapshot = this._file.data.snapshots.find(item => item.id == id);
      if (!snapshot) {
        throw new Error("That snapshot is no longer available");
      }
      return {
        snapshot: copy(snapshot),
        ...(await expandSnapshot(this._file.data, snapshot)),
      };
    });
  }

  async delete(id) {
    await this.init();
    return this._serialize(async () => {
      const before = this._file.data.snapshots.length;
      this._file.data.snapshots = this._file.data.snapshots.filter(
        snapshot => snapshot.id != id
      );
      if (this._file.data.snapshots.length == before) {
        return false;
      }
      trimBlobReferences(this._file.data);
      await this._persist();
      return true;
    });
  }

  async clear() {
    await this.init();
    return this._serialize(async () => {
      this._file.data = { version: STORE_VERSION, snapshots: [], blobs: {} };
      await this._persist();
    });
  }

  async trimToLimits() {
    await this.init();
    return this._serialize(async () => {
      const retentionDays = Services.prefs.getIntPref(
        "nirva.timetravel.retentionDays",
        30
      );
      const cutoff =
        Date.now() - Math.min(30, Math.max(1, retentionDays)) * 86400000;
      this._file.data.snapshots = this._file.data.snapshots.filter(
        snapshot => snapshot.createdAt >= cutoff
      );
      const limitMB = Services.prefs.getIntPref(
        "nirva.timetravel.storageLimitMB",
        128
      );
      const limitBytes = Math.min(256, Math.max(64, limitMB)) * 1024 * 1024;
      trimBlobReferences(this._file.data);
      await this._persist();
      let size = await this._storageBytesNow();
      while (size > limitBytes && this._file.data.snapshots.length) {
        this._file.data.snapshots.shift();
        trimBlobReferences(this._file.data);
        await this._persist();
        size = await this._storageBytesNow();
      }
      return size;
    });
  }

  async storageBytes() {
    await this.init();
    return this._serialize(() => this._storageBytesNow());
  }

  async _storageBytesNow() {
    try {
      return (await IOUtils.stat(this.path)).size;
    } catch (_error) {
      return 0;
    }
  }
}

export const NirvaTimeTravelStore = new NirvaTimeTravelStoreClass();
