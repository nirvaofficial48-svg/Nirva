/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";

const STORE_VERSION = 1;
const STORE_NAME = "nirva-live-clips.jsonlz4";
const MAX_CLIPS = 24;
const MAX_TEXT_LENGTH = 30000;
const ALLOWED_REFRESH_HOURS = new Set([0, 6, 24]);
const SENSITIVE_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;
const CLIP_ERRORS = new Set([
  "blocked",
  "missing-region",
  "timeout",
  "unsupported",
]);

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function clipURL(value) {
  if (typeof value != "string" || value.length > 8192) {
    return null;
  }
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    return null;
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    [...url.searchParams.keys()].some(key => SENSITIVE_PARAMETER.test(key))
  ) {
    return null;
  }
  url.hash = "";
  return url.href;
}

export function clipSelector(value) {
  if (
    typeof value != "string" ||
    !value.trim() ||
    value.length > 2048 ||
    /:has\s*\(|:visited\b/i.test(value)
  ) {
    return null;
  }
  return value.trim();
}

function safeLabel(value, fallback, limit) {
  if (typeof value != "string") {
    return fallback;
  }
  return (
    value
      .replace(/\p{Cc}/gu, " ")
      .trim()
      .slice(0, limit) || fallback
  );
}

function normalizeClip(clip) {
  const url = clipURL(clip?.url);
  const selector = clipSelector(clip?.selector);
  if (!url || !selector || typeof clip?.id != "string") {
    return null;
  }
  const refreshHours = ALLOWED_REFRESH_HOURS.has(clip.refreshHours)
    ? clip.refreshHours
    : 0;
  const now = Date.now();
  return {
    id: clip.id.slice(0, 64),
    url,
    selector,
    title: safeLabel(clip.title, "Live clip", 100),
    sourceTitle: safeLabel(clip.sourceTitle, new URL(url).hostname, 240),
    text:
      typeof clip.text == "string" ? clip.text.slice(0, MAX_TEXT_LENGTH) : "",
    createdAt: Number.isSafeInteger(clip.createdAt) ? clip.createdAt : now,
    updatedAt: Number.isSafeInteger(clip.updatedAt) ? clip.updatedAt : now,
    nextRefreshAt:
      Number.isSafeInteger(clip.nextRefreshAt) && refreshHours
        ? clip.nextRefreshAt
        : 0,
    refreshHours,
    paused: Boolean(clip.paused),
    error: CLIP_ERRORS.has(clip.error) ? clip.error : null,
  };
}

function normalizeStore(data) {
  const clips = Array.isArray(data?.clips)
    ? data.clips.map(normalizeClip).filter(Boolean).slice(0, MAX_CLIPS)
    : [];
  return {
    version: STORE_VERSION,
    paused: Boolean(data?.paused),
    clips,
  };
}

/** Local persistent text clips. Page HTML and active credentials are never stored. */
export class NirvaClipsStoreClass {
  constructor(path = PathUtils.join(PathUtils.profileDir, STORE_NAME)) {
    this.path = path;
    this._file = null;
    this._ready = null;
    this._queue = Promise.resolve();
    this._writes = Promise.resolve();
  }

  _serialize(task) {
    const result = this._queue.then(task);
    this._queue = result.catch(error => {
      console.error("Nirva Live Clips store operation failed", error);
    });
    return result;
  }

  async init() {
    if (!this._ready) {
      this._ready = (async () => {
        this._file = new JSONFile({
          path: this.path,
          compression: "lz4",
          sanitizedBasename: "nirva-live-clips",
          dataPostProcessor: normalizeStore,
        });
        await IOUtils.makeDirectory(PathUtils.parent(this.path));
        await this._file.load();
        this._file.data = normalizeStore(this._file.data);
        IOUtils.profileBeforeChange.addBlocker("Nirva live clips", () =>
          this._queue.then(() => this._writes)
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

  async list() {
    await this.init();
    return this._serialize(() => copy(this._file.data.clips));
  }

  async get(id) {
    await this.init();
    return this._serialize(() => {
      const clip = this._file.data.clips.find(item => item.id == id);
      return clip ? copy(clip) : null;
    });
  }

  async getPaused() {
    await this.init();
    return this._serialize(() => this._file.data.paused);
  }

  async create({ url, selector, title, sourceTitle, text }) {
    await this.init();
    return this._serialize(async () => {
      const now = Date.now();
      const clip = normalizeClip({
        id: Services.uuid.generateUUID().toString(),
        url,
        selector,
        title,
        sourceTitle,
        text,
        createdAt: now,
        updatedAt: now,
      });
      if (!clip) {
        throw new Error("This page region cannot be saved as a clip");
      }
      if (this._file.data.clips.length >= MAX_CLIPS) {
        throw new Error(`You can keep up to ${MAX_CLIPS} clips`);
      }
      this._file.data.clips.unshift(clip);
      await this._persist();
      return copy(clip);
    });
  }

  async update(id, changes = {}) {
    await this.init();
    return this._serialize(async () => {
      const clip = this._file.data.clips.find(item => item.id == id);
      if (!clip) {
        return null;
      }
      if ("title" in changes) {
        clip.title = safeLabel(changes.title, clip.title, 100);
      }
      if ("selector" in changes) {
        const selector = clipSelector(changes.selector);
        if (!selector) {
          throw new Error("Enter a valid CSS selector under 2,048 characters");
        }
        clip.selector = selector;
      }
      if ("refreshHours" in changes) {
        if (!ALLOWED_REFRESH_HOURS.has(changes.refreshHours)) {
          throw new Error("Choose manual, 6-hour, or 24-hour refresh");
        }
        clip.refreshHours = changes.refreshHours;
        clip.nextRefreshAt = changes.refreshHours
          ? Date.now() + changes.refreshHours * 3600000
          : 0;
      }
      if ("paused" in changes) {
        clip.paused = Boolean(changes.paused);
      }
      await this._persist();
      return copy(clip);
    });
  }

  async recordRefresh(id, { text, sourceTitle, updatedAt = Date.now() }) {
    await this.init();
    return this._serialize(async () => {
      const clip = this._file.data.clips.find(item => item.id == id);
      if (!clip) {
        return null;
      }
      clip.text = String(text || "").slice(0, MAX_TEXT_LENGTH);
      clip.sourceTitle = safeLabel(sourceTitle, clip.sourceTitle, 240);
      clip.updatedAt = updatedAt;
      clip.error = null;
      clip.nextRefreshAt = clip.refreshHours
        ? updatedAt + clip.refreshHours * 3600000
        : 0;
      await this._persist();
      return copy(clip);
    });
  }

  async recordError(id, error) {
    await this.init();
    return this._serialize(async () => {
      const clip = this._file.data.clips.find(item => item.id == id);
      if (!clip) {
        return null;
      }
      clip.error = CLIP_ERRORS.has(error) ? error : "unsupported";
      clip.nextRefreshAt = clip.refreshHours
        ? Date.now() + clip.refreshHours * 3600000
        : 0;
      await this._persist();
      return copy(clip);
    });
  }

  async setPaused(paused) {
    await this.init();
    return this._serialize(async () => {
      this._file.data.paused = Boolean(paused);
      await this._persist();
      return this._file.data.paused;
    });
  }

  async remove(id) {
    await this.init();
    return this._serialize(async () => {
      const before = this._file.data.clips.length;
      this._file.data.clips = this._file.data.clips.filter(
        clip => clip.id != id
      );
      if (this._file.data.clips.length == before) {
        return false;
      }
      await this._persist();
      return true;
    });
  }

  async clear() {
    await this.init();
    return this._serialize(async () => {
      this._file.data = { version: STORE_VERSION, paused: false, clips: [] };
      await this._persist();
    });
  }
}

export const NirvaClipsStore = new NirvaClipsStoreClass();
