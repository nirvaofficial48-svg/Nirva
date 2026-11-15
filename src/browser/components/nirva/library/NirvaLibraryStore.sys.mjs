/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { JSONFile } from "resource://gre/modules/JSONFile.sys.mjs";
import { NirvaPrivacyRules } from "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs";

const STORE_VERSION = 1;
const STORE_NAME = "nirva-library.jsonlz4";
const COPIES_FOLDER = "nirva-library";
const ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export const LIBRARY_LIMITS = {
  pages: 2000,
  annotationsPerPage: 200,
  quote: 2000,
  context: 48,
  note: 4000,
  title: 240,
  tags: 12,
  tag: 40,
  copyBytes: 48 * 1024 * 1024,
};

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function newId() {
  return Services.uuid.generateUUID().toString().slice(1, -1);
}

function cleanText(value, limit, fallback = "") {
  if (typeof value != "string") {
    return fallback;
  }
  return (
    value
      .replace(/[^\P{Cc}\n]/gu, " ")
      .trim()
      .slice(0, limit) || fallback
  );
}

function cleanLine(value, limit, fallback = "") {
  return cleanText(
    typeof value == "string" ? value.replace(/\s+/g, " ") : value,
    limit,
    fallback
  );
}

function cleanTime(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

export function cleanTags(value) {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(",");
  const tags = [];
  for (const part of parts) {
    const tag = cleanLine(part, LIBRARY_LIMITS.tag);
    if (tag && !tags.some(item => item.toLowerCase() == tag.toLowerCase())) {
      tags.push(tag);
    }
  }
  return tags.slice(0, LIBRARY_LIMITS.tags);
}

function normalizeAnnotation(annotation) {
  const quote = cleanLine(annotation?.quote, LIBRARY_LIMITS.quote);
  if (!quote || !ID_PATTERN.test(annotation?.id)) {
    return null;
  }
  return {
    id: annotation.id,
    quote,
    prefix: cleanLine(annotation.prefix, LIBRARY_LIMITS.context),
    suffix: cleanLine(annotation.suffix, LIBRARY_LIMITS.context),
    note: cleanText(annotation.note, LIBRARY_LIMITS.note),
    createdAt: cleanTime(annotation.createdAt, Date.now()),
  };
}

function normalizeCopy(value) {
  if (!value || !Number.isSafeInteger(value.bytes) || value.bytes <= 0) {
    return null;
  }
  return {
    savedAt: cleanTime(value.savedAt, Date.now()),
    bytes: value.bytes,
    resources: Number.isSafeInteger(value.resources) ? value.resources : 0,
    skipped: Number.isSafeInteger(value.skipped) ? value.skipped : 0,
  };
}

function normalizePage(page) {
  const url = NirvaPrivacyRules.storableURL(page?.url);
  if (!url || !ID_PATTERN.test(page?.id)) {
    return null;
  }
  const now = Date.now();
  const annotations = Array.isArray(page.annotations)
    ? page.annotations
        .map(normalizeAnnotation)
        .filter(Boolean)
        .slice(0, LIBRARY_LIMITS.annotationsPerPage)
    : [];
  return {
    id: page.id,
    url,
    title: cleanLine(page.title, LIBRARY_LIMITS.title, new URL(url).hostname),
    createdAt: cleanTime(page.createdAt, now),
    updatedAt: cleanTime(page.updatedAt, now),
    tags: cleanTags(page.tags),
    note: cleanText(page.note, LIBRARY_LIMITS.note),
    copy: normalizeCopy(page.copy),
    annotations,
  };
}

function isEmpty(page) {
  return !page.copy && !page.annotations.length && !page.note;
}

function normalizeStore(data) {
  const seen = new Set();
  const pages = [];
  for (const raw of Array.isArray(data?.pages) ? data.pages : []) {
    const page = normalizePage(raw);
    if (page && !seen.has(page.url) && pages.length < LIBRARY_LIMITS.pages) {
      seen.add(page.url);
      pages.push(page);
    }
  }
  return { version: STORE_VERSION, pages };
}

/**
 * Saved page copies, highlights and notes, kept only in the profile folder. The index is one
 * compressed JSON file; every saved copy is one self-contained HTML file beside it.
 */
export class NirvaLibraryStoreClass {
  constructor(profileDir = PathUtils.profileDir) {
    this.path = PathUtils.join(profileDir, STORE_NAME);
    this.copiesDir = PathUtils.join(profileDir, COPIES_FOLDER);
    this._file = null;
    this._ready = null;
    this._queue = Promise.resolve();
    this._writes = Promise.resolve();
  }

  _serialize(task) {
    const result = this._queue.then(task);
    this._queue = result.catch(error => {
      console.error("Nirva Library store operation failed", error);
    });
    return result;
  }

  async init() {
    if (!this._ready) {
      this._ready = (async () => {
        this._file = new JSONFile({
          path: this.path,
          compression: "lz4",
          sanitizedBasename: "nirva-library",
          dataPostProcessor: normalizeStore,
        });
        await IOUtils.makeDirectory(this.copiesDir, { ignoreExisting: true });
        await this._file.load();
        this._file.data = normalizeStore(this._file.data);
        IOUtils.profileBeforeChange.addBlocker("Nirva library", () =>
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

  _find(id) {
    return this._file.data.pages.find(page => page.id == id);
  }

  // Returns: The saved copy's path for a valid page id.
  copyPath(id) {
    return ID_PATTERN.test(id)
      ? PathUtils.join(this.copiesDir, `${id}.html`)
      : null;
  }

  // Returns: The page id when the path is a saved copy in this library.
  idFromCopyPath(path) {
    if (typeof path != "string" || PathUtils.parent(path) != this.copiesDir) {
      return null;
    }
    const id = PathUtils.filename(path).replace(/\.html$/, "");
    return this.copyPath(id) == path ? id : null;
  }

  async list() {
    await this.init();
    return this._serialize(() => copy(this._file.data.pages));
  }

  async get(id) {
    await this.init();
    return this._serialize(() => {
      const page = this._find(id);
      return page ? copy(page) : null;
    });
  }

  async getByURL(value) {
    await this.init();
    const url = NirvaPrivacyRules.storableURL(value);
    return this._serialize(() => {
      const page = url && this._file.data.pages.find(item => item.url == url);
      return page ? copy(page) : null;
    });
  }

  _ensure(value, title) {
    const url = NirvaPrivacyRules.storableURL(value);
    if (!url) {
      throw new Error("This address cannot be kept in the library");
    }
    let page = this._file.data.pages.find(item => item.url == url);
    if (!page) {
      if (this._file.data.pages.length >= LIBRARY_LIMITS.pages) {
        throw new Error("The library is full");
      }
      const now = Date.now();
      page = normalizePage({
        id: newId(),
        url,
        title,
        createdAt: now,
        updatedAt: now,
      });
      this._file.data.pages.unshift(page);
    }
    return page;
  }

  async _prune(page) {
    if (isEmpty(page)) {
      this._file.data.pages = this._file.data.pages.filter(
        item => item != page
      );
    }
    await this._persist();
  }

  // Writes one self-contained HTML file and records it against the page.
  async saveCopy({ url, title, html, resources = 0, skipped = 0 }) {
    await this.init();
    return this._serialize(async () => {
      if (typeof html != "string" || !html) {
        throw new Error("There is nothing to save");
      }
      const page = this._ensure(url, title);
      const { bytes } = await this._writeCopy(page.id, html);
      const now = Date.now();
      page.title = cleanLine(title, LIBRARY_LIMITS.title, page.title);
      page.copy = normalizeCopy({ savedAt: now, bytes, resources, skipped });
      page.updatedAt = now;
      await this._persist();
      return copy(page);
    });
  }

  async _writeCopy(id, html) {
    const path = this.copyPath(id);
    const bytes = await IOUtils.writeUTF8(path, html, {
      tmpPath: `${path}.tmp`,
    });
    if (bytes > LIBRARY_LIMITS.copyBytes) {
      await IOUtils.remove(path, { ignoreAbsent: true });
      throw new Error("This page is too large to save");
    }
    return { bytes };
  }

  async removeCopy(id) {
    await this.init();
    return this._serialize(async () => {
      const page = this._find(id);
      if (!page?.copy) {
        return false;
      }
      await IOUtils.remove(this.copyPath(id), { ignoreAbsent: true });
      page.copy = null;
      page.updatedAt = Date.now();
      await this._prune(page);
      return true;
    });
  }

  async addAnnotation({ url, title, quote, prefix, suffix, note = "" }) {
    await this.init();
    return this._serialize(async () => {
      const page = this._ensure(url, title);
      if (page.annotations.length >= LIBRARY_LIMITS.annotationsPerPage) {
        throw new Error("This page has too many highlights");
      }
      const annotation = normalizeAnnotation({
        id: newId(),
        quote,
        prefix,
        suffix,
        note,
        createdAt: Date.now(),
      });
      if (!annotation) {
        await this._prune(page);
        throw new Error("This selection cannot be highlighted");
      }
      page.annotations.push(annotation);
      page.updatedAt = annotation.createdAt;
      await this._persist();
      return { page: copy(page), annotation: copy(annotation) };
    });
  }

  async updateAnnotation(pageId, annotationId, { note }) {
    await this.init();
    return this._serialize(async () => {
      const page = this._find(pageId);
      const annotation = page?.annotations.find(
        item => item.id == annotationId
      );
      if (!annotation) {
        return null;
      }
      annotation.note = cleanText(note, LIBRARY_LIMITS.note);
      page.updatedAt = Date.now();
      await this._persist();
      return copy(page);
    });
  }

  async removeAnnotation(pageId, annotationId) {
    await this.init();
    return this._serialize(async () => {
      const page = this._find(pageId);
      const before = page?.annotations.length;
      if (!page) {
        return false;
      }
      page.annotations = page.annotations.filter(
        item => item.id != annotationId
      );
      if (page.annotations.length == before) {
        return false;
      }
      page.updatedAt = Date.now();
      await this._prune(page);
      return true;
    });
  }

  async update(id, changes = {}) {
    await this.init();
    return this._serialize(async () => {
      const page = this._find(id);
      if (!page) {
        return null;
      }
      if ("title" in changes) {
        page.title = cleanLine(changes.title, LIBRARY_LIMITS.title, page.title);
      }
      if ("tags" in changes) {
        page.tags = cleanTags(changes.tags);
      }
      if ("note" in changes) {
        page.note = cleanText(changes.note, LIBRARY_LIMITS.note);
      }
      page.updatedAt = Date.now();
      const result = copy(page);
      await this._prune(page);
      return result;
    });
  }

  async remove(id) {
    await this.init();
    return this._serialize(async () => {
      const page = this._find(id);
      if (!page) {
        return false;
      }
      await IOUtils.remove(this.copyPath(id), { ignoreAbsent: true });
      this._file.data.pages = this._file.data.pages.filter(
        item => item != page
      );
      await this._persist();
      return true;
    });
  }

  async clear() {
    await this.init();
    return this._serialize(async () => {
      await IOUtils.remove(this.copiesDir, {
        recursive: true,
        ignoreAbsent: true,
      });
      await IOUtils.makeDirectory(this.copiesDir, { ignoreExisting: true });
      this._file.data = { version: STORE_VERSION, pages: [] };
      await this._persist();
    });
  }

  /** @returns {Promise<{pages: number, copies: number, notes: number, bytes: number}>} */
  async usage() {
    await this.init();
    return this._serialize(() => {
      const usage = { pages: 0, copies: 0, notes: 0, bytes: 0 };
      for (const page of this._file.data.pages) {
        usage.pages++;
        usage.notes += page.annotations.length + (page.note ? 1 : 0);
        if (page.copy) {
          usage.copies++;
          usage.bytes += page.copy.bytes;
        }
      }
      return usage;
    });
  }
}

export const NirvaLibraryStore = new NirvaLibraryStoreClass();
