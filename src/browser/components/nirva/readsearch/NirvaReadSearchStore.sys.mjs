/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Sqlite } from "resource://gre/modules/Sqlite.sys.mjs";

const DATABASE_NAME = "nirva-read-everything.sqlite";
const MAX_TITLE_LENGTH = 512;
const MAX_BODY_LENGTH = 250_000;
const FTS_SCHEMA_VERSION = 3;
const MAX_QUERY_TERMS = 12;
const SENSITIVE_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;

function normalizeURL(value) {
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
    url.password
  ) {
    return null;
  }
  for (const name of [...url.searchParams.keys()]) {
    if (SENSITIVE_PARAMETER.test(name)) {
      url.searchParams.delete(name);
    }
  }
  // Fragments may contain OAuth state or other secrets, and are not needed to
  // identify the readable page being indexed.
  url.hash = "";
  return url.href;
}

function normalizeLocalURI(value) {
  if (typeof value != "string" || value.length > 8192) {
    return null;
  }
  try {
    const uri = new URL(value);
    if (uri.protocol == "file:") {
      return uri.href;
    }
    if (
      uri.protocol == "chrome:" &&
      uri.host == "browser" &&
      uri.pathname.startsWith("/content/nirva/")
    ) {
      return uri.href;
    }
  } catch (_error) {}
  return null;
}

function normalizeDomain(value) {
  if (typeof value != "string" || value.length > 260 || /[\s?#@]/.test(value)) {
    return null;
  }
  const candidate = value.trim();
  const hasScheme = /^https?:\/\//i.test(candidate);
  if (!hasScheme && candidate.includes("/")) {
    return null;
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(candidate) && !hasScheme) {
    return null;
  }
  let host;
  let parsed;
  try {
    parsed = new URL(hasScheme ? candidate : `https://${candidate}`);
    host = parsed.hostname.toLowerCase();
  } catch (_error) {
    return null;
  }
  if (
    !host ||
    parsed.pathname != "/" ||
    parsed.search ||
    parsed.hash ||
    parsed.username ||
    parsed.password ||
    parsed.port
  ) {
    return null;
  }
  return host;
}

function buildMatchQuery(value) {
  const terms = (value.match(/[\p{L}\p{N}]+/gu) || [])
    .slice(0, MAX_QUERY_TERMS)
    .filter(term => term.length <= 80);
  if (!terms.length) {
    return "";
  }
  return terms.map(term => `"${term.replaceAll('"', '""')}"`).join(" AND ");
}

/** Local SQLite FTS5 storage for Nirva's readable-page index. */
export class NirvaReadSearchStoreClass {
  #db = null;
  #initPromise = null;
  #excludedDomains = new Set();
  #excludedPages = new Set();

  async init() {
    if (this.#db) {
      return;
    }
    if (this.#initPromise) {
      await this.#initPromise;
      return;
    }
    this.#initPromise = (async () => {
      const path = PathUtils.join(PathUtils.profileDir, DATABASE_NAME);
      this.#db = await Sqlite.openConnection({ path, extensions: ["fts5"] });
      await this.#db.executeTransaction(async () => {
        const version = await this.#db.execute("PRAGMA user_version");
        const currentVersion = version[0].getResultByIndex(0);
        const documentTable = await this.#db.execute(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'documents'"
        );
        if (currentVersion < FTS_SCHEMA_VERSION && documentTable.length) {
          await this.#db.execute("DROP TRIGGER IF EXISTS documents_ai");
          await this.#db.execute("DROP TRIGGER IF EXISTS documents_ad");
          await this.#db.execute("DROP TRIGGER IF EXISTS documents_au");
          await this.#db.execute("DROP TABLE IF EXISTS read_pages_fts");
          const oldColumns = await this.#db.execute(
            "PRAGMA table_info(documents)"
          );
          const columnNames = new Set(
            oldColumns.map(row => row.getResultByName("name"))
          );
          const localURIColumn = columnNames.has("local_uri")
            ? "local_uri"
            : "NULL";
          const sourceKindColumn = columnNames.has("source_kind")
            ? "source_kind"
            : "'live'";
          await this.#db.execute(`
            CREATE TABLE documents_v3 (
              id INTEGER PRIMARY KEY,
              url TEXT NOT NULL,
              domain TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              first_seen INTEGER NOT NULL,
              last_visited INTEGER NOT NULL,
              visit_count INTEGER NOT NULL DEFAULT 1,
              source_kind TEXT NOT NULL DEFAULT 'live',
              local_uri TEXT
            )
          `);
          await this.#db.execute(`
            INSERT INTO documents_v3
              (id, url, domain, title, body, first_seen, last_visited,
               visit_count, source_kind, local_uri)
            SELECT id, url, domain, title, body, first_seen, last_visited,
                   visit_count, ${sourceKindColumn}, ${localURIColumn}
            FROM documents
          `);
          await this.#db.execute("DROP TABLE documents");
          await this.#db.execute(
            "ALTER TABLE documents_v3 RENAME TO documents"
          );
        }
        await this.#db.execute(`
          CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            first_seen INTEGER NOT NULL,
            last_visited INTEGER NOT NULL,
            visit_count INTEGER NOT NULL DEFAULT 1,
            source_kind TEXT NOT NULL DEFAULT 'live',
            local_uri TEXT
          )
        `);
        await this.#db.execute(`
          CREATE TABLE IF NOT EXISTS excluded_domains (
            domain TEXT PRIMARY KEY
          )
        `);
        await this.#db.execute(`
          CREATE TABLE IF NOT EXISTS excluded_pages (
            url TEXT PRIMARY KEY
          )
        `);
        await this.#db.execute(`
          CREATE INDEX IF NOT EXISTS documents_last_visited
          ON documents(last_visited)
        `);
        await this.#db.execute(`
          CREATE INDEX IF NOT EXISTS documents_domain
          ON documents(domain)
        `);
        await this.#db.execute(`
          CREATE UNIQUE INDEX IF NOT EXISTS documents_source_url
          ON documents(url, source_kind)
        `);
        await this.#db.execute(`
          CREATE VIRTUAL TABLE IF NOT EXISTS read_pages_fts USING fts5(
            title,
            url,
            body,
            content='documents',
            content_rowid='id',
            tokenize='unicode61 remove_diacritics 2'
          )
        `);
        await this.#db.execute(`
          CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
            INSERT INTO read_pages_fts(rowid, title, url, body)
            VALUES (new.id, new.title, new.url, new.body);
          END
        `);
        await this.#db.execute(`
          CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
            INSERT INTO read_pages_fts(read_pages_fts, rowid, title, url, body)
            VALUES ('delete', old.id, old.title, old.url, old.body);
          END
        `);
        await this.#db.execute(`
          CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
            INSERT INTO read_pages_fts(read_pages_fts, rowid, title, url, body)
            VALUES ('delete', old.id, old.title, old.url, old.body);
            INSERT INTO read_pages_fts(rowid, title, url, body)
            VALUES (new.id, new.title, new.url, new.body);
          END
        `);
        if (currentVersion < FTS_SCHEMA_VERSION) {
          await this.#db.execute(
            "INSERT INTO read_pages_fts(read_pages_fts) VALUES ('rebuild')"
          );
          await this.#db.execute(`PRAGMA user_version = ${FTS_SCHEMA_VERSION}`);
        }
      });
      const [domains, pages] = await Promise.all([
        this.#db.execute("SELECT domain FROM excluded_domains"),
        this.#db.execute("SELECT url FROM excluded_pages"),
      ]);
      this.#excludedDomains = new Set(
        domains.map(row => row.getResultByName("domain"))
      );
      this.#excludedPages = new Set(
        pages.map(row => row.getResultByName("url"))
      );
    })().catch(async error => {
      const db = this.#db;
      this.#db = null;
      if (db) {
        await db.close().catch(() => {});
      }
      throw error;
    });
    try {
      await this.#initPromise;
    } finally {
      this.#initPromise = null;
    }
  }

  async close() {
    if (this.#initPromise) {
      await this.#initPromise.catch(() => {});
    }
    if (this.#db) {
      const db = this.#db;
      this.#db = null;
      await db.close();
    }
  }

  async indexDocument({
    url: sourceURL,
    title,
    body,
    visitedAt = Date.now(),
    sourceKind = "live",
    localURI = null,
  }) {
    await this.init();
    const url = normalizeURL(sourceURL);
    if (!url || typeof body != "string" || this.isExcluded(url)) {
      return false;
    }
    const domain = new URL(url).hostname.toLowerCase();
    const cleanTitle =
      (typeof title == "string" ? title : "")
        .trim()
        .slice(0, MAX_TITLE_LENGTH) || domain;
    const cleanBody = body.trim().slice(0, MAX_BODY_LENGTH);
    if (!cleanBody) {
      return false;
    }
    const cleanLocalURI =
      sourceKind == "saved" ? normalizeLocalURI(localURI) : null;
    if (sourceKind == "saved" && !cleanLocalURI) {
      return false;
    }
    const cleanSourceKind = sourceKind == "saved" ? "saved" : "live";
    const existing = await this.#db.executeCached(
      "SELECT id FROM documents WHERE url = :url AND source_kind = :sourceKind",
      { url, sourceKind: cleanSourceKind }
    );
    if (existing.length) {
      await this.#db.executeCached(
        `UPDATE documents
         SET domain = :domain, title = :title, body = :body,
             source_kind = :sourceKind, local_uri = :localURI,
             last_visited = MAX(last_visited, :visitedAt),
             visit_count = visit_count + 1
         WHERE id = :id`,
        {
          id: existing[0].getResultByName("id"),
          url,
          domain,
          title: cleanTitle,
          body: cleanBody,
          sourceKind: cleanSourceKind,
          localURI: cleanLocalURI,
          visitedAt: Math.trunc(visitedAt),
        }
      );
    } else {
      await this.#db.executeCached(
        `INSERT INTO documents
         (url, domain, title, body, first_seen, last_visited, visit_count, source_kind, local_uri)
         VALUES (:url, :domain, :title, :body, :visitedAt, :visitedAt, 1, :sourceKind, :localURI)`,
        {
          url,
          domain,
          title: cleanTitle,
          body: cleanBody,
          sourceKind: cleanSourceKind,
          localURI: cleanLocalURI,
          visitedAt: Math.trunc(visitedAt),
        }
      );
    }
    return true;
  }

  isExcluded(value) {
    const url = normalizeURL(value);
    if (!url) {
      return true;
    }
    if (this.#excludedPages.has(url)) {
      return true;
    }
    const host = new URL(url).hostname.toLowerCase();
    return [...this.#excludedDomains].some(
      domain => host == domain || host.endsWith(`.${domain}`)
    );
  }

  async search(query, limit = 8, sourceKind = null) {
    await this.init();
    const match = buildMatchQuery(query);
    if (!match) {
      return [];
    }
    const rows = await this.#db.executeCached(
      `SELECT documents.url AS url,
              documents.domain AS domain,
              documents.title AS title,
              documents.last_visited AS lastVisited,
              documents.visit_count AS visitCount,
              documents.source_kind AS sourceKind,
              documents.local_uri AS localURI,
              snippet(read_pages_fts, 2, '⟦', '⟧', ' … ', 24) AS passage
       FROM read_pages_fts
       JOIN documents ON documents.id = read_pages_fts.rowid
       WHERE read_pages_fts MATCH :match
         AND (:sourceKind IS NULL OR documents.source_kind = :sourceKind)
       ORDER BY bm25(read_pages_fts, 12.0, 3.0, 1.0)
       LIMIT :limit`,
      {
        match,
        sourceKind,
        limit: Math.max(1, Math.min(sourceKind ? 200 : 20, Math.trunc(limit))),
      }
    );
    return rows.map(row => ({
      url: row.getResultByName("url"),
      domain: row.getResultByName("domain"),
      title: row.getResultByName("title"),
      lastVisited: row.getResultByName("lastVisited"),
      visitCount: row.getResultByName("visitCount"),
      sourceKind: row.getResultByName("sourceKind"),
      localURI: row.getResultByName("localURI"),
      passage: row.getResultByName("passage"),
    }));
  }

  async getSettings() {
    await this.init();
    const [count, domains, pages, excludedDomains, excludedPages] =
      await Promise.all([
        this.#db.execute("SELECT COUNT(*) AS count FROM documents"),
        this.#db.execute(`
          SELECT domain, COUNT(*) AS count, MAX(last_visited) AS lastVisited
          FROM documents GROUP BY domain ORDER BY domain
        `),
        this.#db.execute(`
          SELECT url, domain, title, last_visited AS lastVisited,
                 source_kind AS sourceKind, local_uri AS localURI
          FROM documents ORDER BY last_visited DESC LIMIT 100
        `),
        this.#db.execute("SELECT domain FROM excluded_domains ORDER BY domain"),
        this.#db.execute("SELECT url FROM excluded_pages ORDER BY url"),
      ]);
    return {
      pageCount: count[0].getResultByName("count"),
      domains: domains.map(row => ({
        domain: row.getResultByName("domain"),
        count: row.getResultByName("count"),
        lastVisited: row.getResultByName("lastVisited"),
      })),
      pages: pages.map(row => ({
        url: row.getResultByName("url"),
        domain: row.getResultByName("domain"),
        title: row.getResultByName("title"),
        lastVisited: row.getResultByName("lastVisited"),
        sourceKind: row.getResultByName("sourceKind"),
        localURI: row.getResultByName("localURI"),
      })),
      excludedDomains: excludedDomains.map(row =>
        row.getResultByName("domain")
      ),
      excludedPages: excludedPages.map(row => row.getResultByName("url")),
    };
  }

  async excludeDomain(value) {
    await this.init();
    const domain = normalizeDomain(value);
    if (!domain) {
      throw new Error("Enter a valid domain name");
    }
    await this.#db.executeTransaction(async () => {
      await this.#db.executeCached(
        "INSERT OR IGNORE INTO excluded_domains(domain) VALUES (:domain)",
        { domain }
      );
      await this.#db.executeCached(
        `DELETE FROM documents
         WHERE domain = :domain OR substr(domain, -length(:suffix)) = :suffix`,
        { domain, suffix: `.${domain}` }
      );
    });
    this.#excludedDomains.add(domain);
    return domain;
  }

  async allowDomain(value) {
    await this.init();
    const domain = normalizeDomain(value);
    if (!domain) {
      return false;
    }
    await this.#db.executeCached(
      "DELETE FROM excluded_domains WHERE domain = :domain",
      { domain }
    );
    this.#excludedDomains.delete(domain);
    return true;
  }

  async excludePage(value) {
    await this.init();
    const url = normalizeURL(value);
    if (!url) {
      throw new Error("That page cannot be added to the exclusion list");
    }
    await this.#db.executeTransaction(async () => {
      await this.#db.executeCached(
        "INSERT OR IGNORE INTO excluded_pages(url) VALUES (:url)",
        { url }
      );
      await this.#db.executeCached("DELETE FROM documents WHERE url = :url", {
        url,
      });
    });
    this.#excludedPages.add(url);
    return true;
  }

  async allowPage(value) {
    await this.init();
    const url = normalizeURL(value);
    if (!url) {
      return false;
    }
    await this.#db.executeCached(
      "DELETE FROM excluded_pages WHERE url = :url",
      {
        url,
      }
    );
    this.#excludedPages.delete(url);
    return true;
  }

  async deletePage(value) {
    await this.init();
    const url = normalizeURL(value);
    if (!url) {
      return false;
    }
    await this.#db.executeCached("DELETE FROM documents WHERE url = :url", {
      url,
    });
    return true;
  }

  // NIRVA: The Personal Web Library removes only its own record for a page.
  async deleteSaved(value) {
    await this.init();
    const url = normalizeURL(value);
    if (!url) {
      return false;
    }
    await this.#db.executeCached(
      "DELETE FROM documents WHERE url = :url AND source_kind = 'saved'",
      { url }
    );
    return true;
  }

  async deleteDomain(value) {
    await this.init();
    const domain = normalizeDomain(value);
    if (!domain) {
      return 0;
    }
    return this.#db.executeCached(
      `DELETE FROM documents
       WHERE domain = :domain OR substr(domain, -length(:suffix)) = :suffix`,
      { domain, suffix: `.${domain}` }
    );
  }

  async deleteBefore(timestamp) {
    await this.init();
    return this.#db.executeCached(
      // Copies the owner chose to keep are not history and do not expire.
      "DELETE FROM documents WHERE last_visited < :timestamp AND source_kind != 'saved'",
      { timestamp: Math.trunc(timestamp) }
    );
  }

  async clear() {
    await this.init();
    await this.#db.execute("DELETE FROM documents");
  }
}

export const NirvaReadSearchStore = new NirvaReadSearchStoreClass();
export { buildMatchQuery, normalizeDomain, normalizeURL };
