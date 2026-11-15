/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaPrivacyRules } from "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs";

const STORE_VERSION = 1;
const STORE_NAME = "nirva-remix.jsonlz4";
const MAX_REMIXES = 300;
const MAX_HIDDEN = 60;

export const REMIX_OPTIONS = {
  fontFamily: ["", "serif", "sans-serif", "monospace"],
  textScale: [100, 110, 125, 150, 175, 200],
  lineHeight: [0, 1.4, 1.6, 1.8, 2],
};

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId() {
  return Services.uuid.generateUUID().toString().slice(1, -1);
}

function label(value, fallback, limit) {
  if (typeof value != "string") {
    return fallback;
  }
  return (
    value
      .replace(/\p{Cc}/gu, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, limit) || fallback
  );
}

function option(name, value) {
  return REMIX_OPTIONS[name].includes(value) ? value : REMIX_OPTIONS[name][0];
}

/**
 * @param {string} value
 * @returns {string|null} A selector safe to store and apply, or null.
 */
export function remixSelector(value) {
  if (
    typeof value != "string" ||
    !value.trim() ||
    value.length > 1024 ||
    /[{}<>;@\\]|:has\s*\(|:visited\b|\/\*/i.test(value)
  ) {
    return null;
  }
  return value.trim();
}

/**
 * Where a remix for this address is filed.
 *
 * @param {string} url
 * @param {"site"|"page"} scope
 * @returns {string|null}
 */
export function remixKey(url, scope) {
  const clean = NirvaPrivacyRules.storableURL(url);
  if (!clean) {
    return null;
  }
  return scope == "page" ? clean : new URL(clean).hostname.toLowerCase();
}

export function remixHasEffect(remix) {
  return Boolean(
    remix?.enabled &&
    (remix.hidden.length ||
      remix.fontFamily ||
      remix.textScale != 100 ||
      remix.lineHeight)
  );
}

function normalizeHidden(entry) {
  const selector = remixSelector(entry?.selector);
  if (!selector || typeof entry?.id != "string") {
    return null;
  }
  return {
    id: entry.id.slice(0, 40),
    selector,
    label: label(entry.label, selector, 80),
  };
}

function normalizeRemix(remix) {
  const scope = remix?.scope == "page" ? "page" : "site";
  const key = typeof remix?.key == "string" ? remix.key.slice(0, 8192) : "";
  const valid =
    scope == "page"
      ? NirvaPrivacyRules.storableURL(key) == key
      : /^[a-z0-9.-]+$/.test(key) && key.length <= 253;
  if (!valid || !key || typeof remix?.id != "string") {
    return null;
  }
  return {
    id: remix.id.slice(0, 40),
    scope,
    key,
    enabled: remix.enabled !== false,
    fontFamily: option("fontFamily", remix.fontFamily),
    textScale: option("textScale", remix.textScale),
    lineHeight: option("lineHeight", remix.lineHeight),
    hidden: Array.isArray(remix.hidden)
      ? remix.hidden.map(normalizeHidden).filter(Boolean).slice(0, MAX_HIDDEN)
      : [],
    updatedAt: Number.isSafeInteger(remix.updatedAt)
      ? remix.updatedAt
      : Date.now(),
  };
}

function normalizeStore(data) {
  return {
    version: STORE_VERSION,
    remixes: Array.isArray(data?.remixes)
      ? data.remixes.map(normalizeRemix).filter(Boolean).slice(0, MAX_REMIXES)
      : [],
  };
}

/** The user's page adjustments, one per site or per page, kept in the profile. */
export class NirvaRemixStoreClass {
  constructor(path = PathUtils.join(PathUtils.profileDir, STORE_NAME)) {
    this.path = path;
    this._data = null;
    this._ready = null;
    this._queue = Promise.resolve();
  }

  _serialize(task) {
    const result = this._queue.then(task);
    this._queue = result.catch(error => {
      console.error("Nirva Remix store operation failed", error);
    });
    return result;
  }

  async init() {
    if (!this._ready) {
      this._ready = (async () => {
        let data = null;
        try {
          data = await IOUtils.readJSON(this.path, { decompress: true });
        } catch (error) {
          if (error.name != "NotFoundError") {
            console.error("Nirva Remix store could not be read", error);
          }
        }
        this._data = normalizeStore(data);
        IOUtils.profileBeforeChange.addBlocker(
          "Nirva page remix",
          () => this._queue
        );
      })();
    }
    return this._ready;
  }

  _persist() {
    return IOUtils.writeJSON(this.path, this._data, {
      compress: true,
      tmpPath: `${this.path}.tmp`,
    });
  }

  _find(id) {
    return this._data.remixes.find(remix => remix.id == id);
  }

  _match(url) {
    const page = remixKey(url, "page");
    if (!page) {
      return null;
    }
    const site = remixKey(url, "site");
    return (
      this._data.remixes.find(r => r.scope == "page" && r.key == page) ||
      this._data.remixes.find(r => r.scope == "site" && r.key == site) ||
      null
    );
  }

  async list() {
    await this.init();
    return this._serialize(() => copy(this._data.remixes));
  }

  async get(id) {
    await this.init();
    return this._serialize(() => copy(this._find(id) || null));
  }

  // The remix that applies to an address: one for the exact page wins over one for its site.
  async lookup(url) {
    await this.init();
    return this._serialize(() => copy(this._match(url)));
  }

  /**
   * The remix filed for this address at this scope, created if missing.
   *
   * @param {string} url
   * @param {"site"|"page"} [scope]
   */
  async ensure(url, scope = "site") {
    await this.init();
    return this._serialize(async () => {
      const key = remixKey(url, scope);
      if (!key) {
        throw new Error("This page cannot be remixed");
      }
      let remix = this._data.remixes.find(
        r => r.scope == scope && r.key == key
      );
      if (!remix) {
        if (this._data.remixes.length >= MAX_REMIXES) {
          throw new Error(`You can keep up to ${MAX_REMIXES} remixes`);
        }
        remix = normalizeRemix({ id: newId(), scope, key });
        this._data.remixes.unshift(remix);
        await this._persist();
      }
      return copy(remix);
    });
  }

  async update(id, changes = {}) {
    await this.init();
    return this._serialize(async () => {
      const remix = this._find(id);
      if (!remix) {
        return null;
      }
      for (const name of Object.keys(REMIX_OPTIONS)) {
        if (name in changes) {
          if (!REMIX_OPTIONS[name].includes(changes[name])) {
            throw new Error(`Unsupported ${name}`);
          }
          remix[name] = changes[name];
        }
      }
      if ("enabled" in changes) {
        remix.enabled = Boolean(changes.enabled);
      }
      remix.updatedAt = Date.now();
      await this._persist();
      return copy(remix);
    });
  }

  async addHidden(id, { selector, label: text }) {
    await this.init();
    return this._serialize(async () => {
      const remix = this._find(id);
      const entry = normalizeHidden({ id: newId(), selector, label: text });
      if (!remix || !entry) {
        throw new Error("That element cannot be hidden");
      }
      const existing = remix.hidden.find(h => h.selector == entry.selector);
      if (existing) {
        return { remix: copy(remix), entry: copy(existing) };
      }
      if (remix.hidden.length >= MAX_HIDDEN) {
        throw new Error(`A remix can hide up to ${MAX_HIDDEN} elements`);
      }
      remix.hidden.push(entry);
      remix.updatedAt = Date.now();
      await this._persist();
      return { remix: copy(remix), entry: copy(entry) };
    });
  }

  async removeHidden(id, hiddenId) {
    await this.init();
    return this._serialize(async () => {
      const remix = this._find(id);
      if (!remix) {
        return null;
      }
      remix.hidden = remix.hidden.filter(entry => entry.id != hiddenId);
      remix.updatedAt = Date.now();
      await this._persist();
      return copy(remix);
    });
  }

  async remove(id) {
    await this.init();
    return this._serialize(async () => {
      const remix = this._find(id);
      if (!remix) {
        return null;
      }
      this._data.remixes = this._data.remixes.filter(r => r.id != id);
      await this._persist();
      return copy(remix);
    });
  }

  async clear() {
    await this.init();
    return this._serialize(async () => {
      this._data = normalizeStore(null);
      await this._persist();
    });
  }
}

export const NirvaRemixStore = new NirvaRemixStoreClass();
