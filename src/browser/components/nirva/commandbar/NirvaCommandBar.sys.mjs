/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaBaseCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaBaseCommands.sys.mjs";
import {
  NirvaReadSearch,
  removePassageMarkers,
} from "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/commands.ftl"], true)
);

const PREF_ENABLED = "nirva.commandbar.enabled";
const PREF_MAX = "nirva.commandbar.maxResults";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const PLACES_LIMIT = 6;

const BOOKMARKS_SQL = `
  SELECT h.url AS url, COALESCE(NULLIF(b.title, ''), h.title, h.url) AS title
  FROM moz_bookmarks b JOIN moz_places h ON h.id = b.fk
  WHERE b.type = 1 AND substr(h.url, 1, 6) <> 'place:'
    AND (b.title LIKE :q ESCAPE '\\' OR h.title LIKE :q ESCAPE '\\' OR h.url LIKE :q ESCAPE '\\')
  GROUP BY h.id ORDER BY h.frecency DESC LIMIT ${PLACES_LIMIT}`;
const HISTORY_SQL = `
  SELECT h.url AS url, COALESCE(h.title, h.url) AS title
  FROM moz_places h
  WHERE h.hidden = 0 AND h.last_visit_date NOT NULL
    AND (h.title LIKE :q ESCAPE '\\' OR h.url LIKE :q ESCAPE '\\')
  ORDER BY h.frecency DESC LIMIT ${PLACES_LIMIT}`;

/**
 * @typedef {object} NirvaResult
 * @property {"command"|"tab"|"bookmark"|"history"|"web"} kind where the result came from
 * @property {string} title the main text of the row
 * @property {string} [detail] a second, quieter text: usually the address
 * @property {number} score how well it matches; higher is better
 * @property {(win: Window) => void} run what choosing the row does
 */

/**
 * The command bar (T1): Ctrl+K opens one input that searches commands, open tabs, bookmarks,
 * history and the web. Enter runs the first result.
 *
 * Local sources never touch the network. The web is only contacted when the owner picks the
 * "Search the web" row.
 */
export const NirvaCommandBar = {
  _initialized: false,
  _windows: new WeakMap(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    NirvaBaseCommands.init();
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this.initWindow(subject);
    }
  },

  /**
   * @param {Window} win a browser window that has finished starting
   */
  initWindow(win) {
    const doc = win.document;
    if (this._windows.has(win) || !win.gBrowser) {
      return;
    }
    const el = (tag, props = {}) =>
      Object.assign(doc.createElementNS(HTML_NS, tag), props);

    const bar = el("div", { id: "nirva-commandbar", hidden: true });
    bar.setAttribute("role", "dialog");
    const results = el("ul", { id: "nirva-commandbar-results" });
    results.setAttribute("role", "listbox");
    const pill = el("div", { id: "nirva-commandbar-pill" });
    const prompt = el("span", {
      id: "nirva-commandbar-prompt",
      textContent: ">",
    });
    prompt.setAttribute("aria-hidden", "true");
    const input = el("input", { id: "nirva-commandbar-input", type: "text" });
    const label = lazy.l10n.formatValueSync("nirva-commandbar-label");
    input.setAttribute("aria-label", label);
    bar.setAttribute("aria-label", label);
    input.placeholder = lazy.l10n.formatValueSync(
      "nirva-commandbar-placeholder"
    );
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-controls", results.id);
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("spellcheck", "false");
    const hint = el("span", {
      id: "nirva-commandbar-hint",
      textContent: lazy.l10n.formatValueSync(
        Services.appinfo.OS == "Darwin"
          ? "nirva-commandbar-shortcut-mac"
          : "nirva-commandbar-shortcut"
      ),
    });
    hint.setAttribute("aria-hidden", "true");
    pill.append(prompt, input, hint);
    bar.append(results, pill);
    doc.getElementById("browser").after(bar);

    const state = { bar, results, input, items: [], selected: 0, token: 0 };
    this._windows.set(win, state);

    // Ctrl+K (Cmd+K on macOS) from anywhere in the window. Capturing, so it wins over
    // Firefox's own use of the same keys.
    win.addEventListener(
      "keydown",
      event => {
        if (
          this.enabled &&
          event.key.toLowerCase() == "k" &&
          event.getModifierState("Accel") &&
          !event.altKey &&
          !event.shiftKey
        ) {
          event.preventDefault();
          event.stopPropagation();
          this.toggle(win);
        }
      },
      true
    );
    input.addEventListener("input", () => this._refresh(win));
    input.addEventListener("keydown", event => this._onKey(win, event));
    results.addEventListener("click", event => {
      const row = event.target.closest("li[data-index]");
      if (row) {
        this.runResult(win, Number(row.dataset.index));
      }
    });
    results.addEventListener("mousemove", event => {
      const row = event.target.closest("li[data-index]");
      if (row && Number(row.dataset.index) != state.selected) {
        this._select(win, Number(row.dataset.index));
      }
    });
    // Clicking anywhere else closes it.
    win.addEventListener(
      "mousedown",
      event => {
        if (this.isOpen(win) && !bar.contains(event.target)) {
          this.close(win);
        }
      },
      true
    );
    win.addEventListener("deactivate", () => this.close(win));
  },

  isOpen(win) {
    const state = this._windows.get(win);
    return !!state && !state.bar.hidden;
  },

  toggle(win) {
    if (this.isOpen(win)) {
      this.close(win);
    } else {
      this.open(win);
    }
  },

  /**
   * @param {Window} win
   * @param {string} [query] text to start with
   */
  open(win, query = "") {
    const state = this._windows.get(win);
    if (!state || !this.enabled) {
      return;
    }
    state.returnFocus = win.document.activeElement;
    state.bar.hidden = false;
    state.input.value = query;
    state.input.focus();
    this._refresh(win);
  },

  close(win, { restoreFocus = true } = {}) {
    const state = this._windows.get(win);
    if (!state || state.bar.hidden) {
      return;
    }
    state.token++;
    state.bar.hidden = true;
    state.input.value = "";
    state.results.replaceChildren();
    state.items = [];
    if (restoreFocus) {
      (state.returnFocus?.isConnected
        ? state.returnFocus
        : win.gBrowser.selectedBrowser
      ).focus();
    }
  },

  _onKey(win, event) {
    const state = this._windows.get(win);
    switch (event.key) {
      case "Escape":
        this.close(win);
        break;
      case "Enter":
        this.runResult(win, state.selected);
        break;
      case "ArrowDown":
        this._select(
          win,
          (state.selected + 1) % Math.max(state.items.length, 1)
        );
        break;
      case "ArrowUp":
        this._select(
          win,
          (state.selected - 1 + state.items.length) %
            Math.max(state.items.length, 1)
        );
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  },

  /**
   * Runs one of the shown results and closes the bar.
   *
   * @param {Window} win
   * @param {number} index
   */
  runResult(win, index) {
    const state = this._windows.get(win);
    const result = state?.items[index];
    if (!result) {
      return;
    }
    // Close first: the action may move focus or open something of its own.
    this.close(win, { restoreFocus: result.kind == "command" });
    try {
      result.run(win);
    } catch (e) {
      console.error(`Nirva: running "${result.title}" failed`, e);
    }
  },

  // ---------- Sources ----------

  _commandResults(win, query) {
    return NirvaCommands.search(query, win).map(
      ({ command, title, score }) => ({
        kind: "command",
        title,
        score,
        run: w => command.run(w),
      })
    );
  },

  _tabResults(win, query) {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return [];
    }
    const isPrivate = lazy.PrivateBrowsingUtils.isWindowPrivate(win);
    const found = [];
    for (const other of Services.wm.getEnumerator("navigator:browser")) {
      if (
        other.closed ||
        !other.gBrowser ||
        lazy.PrivateBrowsingUtils.isWindowPrivate(other) != isPrivate
      ) {
        continue;
      }
      for (const tab of other.gBrowser.tabs) {
        if (tab.closing || (other == win && tab.selected)) {
          continue;
        }
        const url = tab.linkedBrowser.currentURI.displaySpec;
        const score = Math.max(
          NirvaCommands.score(needle, tab.label),
          NirvaCommands.score(needle, url.replace(/^https?:\/\/(www\.)?/, "")) -
            0.5
        );
        if (score > 0) {
          found.push({
            kind: "tab",
            title: tab.label,
            detail: url,
            score,
            run: () => {
              other.gBrowser.selectedTab = tab;
              other.focus();
            },
          });
        }
      }
    }
    return found.sort((a, b) => b.score - a.score);
  },

  async _placesResults(win, query) {
    const needle = query.trim();
    if (!needle || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return [];
    }
    const q = "%" + needle.replace(/[\\%_]/g, "\\$&") + "%";
    const db = await lazy.PlacesUtils.promiseDBConnection();
    const [bookmarks, history] = await Promise.all([
      db.executeCached(BOOKMARKS_SQL, { q }),
      db.executeCached(HISTORY_SQL, { q }),
    ]);
    const seen = new Set();
    const toResults = (rows, kind) =>
      rows
        .map(row => ({
          url: row.getResultByName("url"),
          title: row.getResultByName("title"),
        }))
        .filter(({ url }) => !seen.has(url) && seen.add(url))
        .map(({ url, title }) => ({
          kind,
          title,
          detail: url,
          score: Math.max(
            NirvaCommands.score(needle.toLowerCase(), title),
            NirvaCommands.score(
              needle.toLowerCase(),
              url.replace(/^https?:\/\/(www\.)?/, "")
            ) - 0.5,
            0.5
          ),
          run: w =>
            w.openTrustedLinkIn(
              url,
              w.gBrowser.selectedTab.isEmpty ? "current" : "tab"
            ),
        }));
    return [
      ...toResults(bookmarks, "bookmark"),
      ...toResults(history, "history"),
    ];
  },

  _webResult(win, query) {
    const text = query.trim();
    if (!text) {
      return [];
    }
    const looksLikeAddress =
      /^([a-z][a-z0-9+.-]*:\/\/\S+|[^\s/]+\.[a-z]{2,}(\/\S*)?|localhost(:\d+)?(\/\S*)?)$/i.test(
        text
      );
    const open = (w, url) =>
      w.openTrustedLinkIn(
        url,
        w.gBrowser.selectedTab.isEmpty ? "current" : "tab"
      );
    if (looksLikeAddress) {
      const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
        ? text
        : `https://${text}`;
      return [
        {
          kind: "web",
          title: lazy.l10n.formatValueSync("nirva-commandbar-open-address", {
            url: text,
          }),
          score: 0,
          run: w => open(w, url),
        },
      ];
    }
    return [
      {
        kind: "web",
        title: lazy.l10n.formatValueSync("nirva-commandbar-search-web", {
          query: text,
        }),
        score: 0,
        run: async w => {
          const isPrivate = lazy.PrivateBrowsingUtils.isWindowPrivate(w);
          const engine = await (isPrivate
            ? lazy.SearchService.getDefaultPrivate()
            : lazy.SearchService.getDefault());
          open(w, engine.getSubmission(text).uri.spec);
        },
      },
    ];
  },

  async _readPageResults(win, query) {
    const pages = await NirvaReadSearch.search(query, win, 5);
    return pages.map(page => {
      const date = new Date(page.lastVisited).toLocaleDateString();
      const source = lazy.l10n.formatValueSync(
        page.sourceKind == "saved"
          ? "nirva-commandbar-page-source-saved"
          : "nirva-commandbar-page-source-live",
        { date }
      );
      return {
        kind: "page",
        title: page.title,
        detail: `${page.domain} · ${source} · ${removePassageMarkers(page.passage)}`,
        score: Math.max(
          1.25,
          NirvaCommands.score(query.trim().toLowerCase(), page.title)
        ),
        run: w => NirvaReadSearch.openResult(w, page),
      };
    });
  },

  /**
   * Orders results: best match first; among equals commands, then tabs, bookmarks, history.
   * The web row is always last.
   *
   * @param {NirvaResult[]} results
   * @returns {NirvaResult[]}
   */
  _rank(results) {
    const order = ["command", "tab", "bookmark", "history", "page", "web"];
    const max = Services.prefs.getIntPref(PREF_MAX, 8);
    const web = results.filter(r => r.kind == "web");
    const rest = results
      .filter(r => r.kind != "web")
      .sort(
        (a, b) =>
          b.score - a.score || order.indexOf(a.kind) - order.indexOf(b.kind)
      );
    return [...rest.slice(0, max - web.length), ...web];
  },

  /**
   * Finds results for a query. Results from this computer's own lists come back first,
   * through onLocal, without waiting for the bookmarks and history database.
   *
   * @param {Window} win
   * @param {string} query
   * @param {(results: NirvaResult[]) => void} [onLocal]
   * @returns {Promise<{results: NirvaResult[], localMs: number, totalMs: number}>}
   */
  async search(win, query, onLocal) {
    const start = ChromeUtils.now();
    const immediate = [
      ...this._commandResults(win, query),
      ...this._tabResults(win, query),
      ...this._webResult(win, query),
    ];
    const localMs = ChromeUtils.now() - start;
    onLocal?.(this._rank(immediate));
    const [places, pages] = await Promise.all([
      this._placesResults(win, query).catch(error => {
        console.error(
          "Nirva: bookmarks and history could not be searched",
          error
        );
        return [];
      }),
      this._readPageResults(win, query).catch(error => {
        console.error("Nirva: pages read could not be searched", error);
        return [];
      }),
    ]);
    return {
      results: this._rank([...immediate, ...places, ...pages]),
      localMs,
      totalMs: ChromeUtils.now() - start,
    };
  },

  async _refresh(win) {
    const state = this._windows.get(win);
    const token = ++state.token;
    const { results } = await this.search(win, state.input.value, local => {
      if (token == state.token) {
        this._render(win, local);
      }
    });
    if (token == state.token && !state.bar.hidden) {
      this._render(win, results);
    }
  },

  _render(win, items) {
    const state = this._windows.get(win);
    const doc = win.document;
    state.items = items;
    state.selected = 0;
    const rows = items.map((item, index) => {
      const row = doc.createElementNS(HTML_NS, "li");
      row.id = `nirva-commandbar-row-${index}`;
      row.dataset.index = index;
      row.dataset.kind = item.kind;
      row.setAttribute("role", "option");
      const text = doc.createElementNS(HTML_NS, "span");
      text.className = "nirva-result-text";
      const title = doc.createElementNS(HTML_NS, "span");
      title.className = "nirva-result-title";
      title.textContent = item.title;
      text.append(title);
      if (item.detail) {
        const detail = doc.createElementNS(HTML_NS, "span");
        detail.className = "nirva-result-detail";
        detail.textContent = item.detail;
        text.append(detail);
      }
      const kind = doc.createElementNS(HTML_NS, "span");
      kind.className = "nirva-result-kind";
      kind.textContent = lazy.l10n.formatValueSync(
        `nirva-commandbar-kind-${item.kind}`
      );
      row.append(text, kind);
      return row;
    });
    if (!rows.length) {
      const empty = doc.createElementNS(HTML_NS, "li");
      empty.className = "nirva-result-empty";
      empty.textContent = lazy.l10n.formatValueSync("nirva-commandbar-empty");
      rows.push(empty);
    }
    state.results.replaceChildren(...rows);
    this._select(win, 0);
  },

  _select(win, index) {
    const state = this._windows.get(win);
    state.selected = index;
    for (const row of state.results.children) {
      const isSelected = Number(row.dataset.index) == index;
      row.setAttribute("aria-selected", String(isSelected));
      if (isSelected) {
        state.input.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      }
    }
  },
};
