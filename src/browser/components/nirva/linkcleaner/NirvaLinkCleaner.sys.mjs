/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.linkcleaner.enabled";
const PREF_STRIP = "privacy.query_stripping.enabled";
const PREF_STRIP_PBM = "privacy.query_stripping.enabled.pbmode";
const PREF_STRIP_LIST = "privacy.query_stripping.strip_list";
const PREF_ALLOW_LIST = "privacy.query_stripping.allow_list";
const LIST_URL = "chrome://global/content/antitracking/StripOnShare.json";
const HTML_NS = "http://www.w3.org/1999/xhtml";
const SHOWN_NAMES = 3;

// Names in the shared list that sites also use for promotions, referrals or
// their own content. Cleaning must never remove them.
const KEEP = new Set(["adid", "gPromoCode", "gQT", "im_ref", "var"]);

function html(doc, tag, className, l10nId) {
  const node = doc.createElementNS(HTML_NS, tag);
  if (className) {
    node.className = className;
  }
  if (l10nId) {
    doc.l10n.setAttributes(node, l10nId);
  }
  return node;
}

/**
 * Turns on the browser's own query stripping, which removes listed tracking
 * parameters when a link leads from one site to another, and lets the user
 * exempt a site or load one link exactly as written.
 */
export const NirvaLinkCleaner = {
  _initialized: false,
  list: [],

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    Services.prefs.addObserver(PREF_ENABLED, this);
    this.ready = this._loadList().then(() => this.apply());
    this.apply();
    this._registerCommands();
  },

  observe() {
    this.apply();
  },

  async _loadList() {
    try {
      const response = await fetch(LIST_URL);
      const { global } = await response.json();
      this.list = [...new Set(global.queryParams)].filter(
        name => /^[\w.-]+$/.test(name) && !KEEP.has(name)
      );
    } catch (e) {
      console.error("Nirva link cleaner could not read its list", e);
    }
  },

  // Sets the browser's defaults, so an explicit choice in Firefox's own
  // privacy settings still wins and "Standard" protection stays standard.
  apply() {
    const defaults = Services.prefs.getDefaultBranch("");
    const on = this.enabled;
    defaults.setBoolPref(PREF_STRIP, on);
    defaults.setBoolPref(PREF_STRIP_PBM, on);
    defaults.setStringPref(PREF_STRIP_LIST, on ? this.list.join(" ") : "");
  },

  siteFor(uri) {
    if (!uri?.schemeIs("http") && !uri?.schemeIs("https")) {
      return null;
    }
    try {
      return Services.eTLD.getBaseDomain(uri);
    } catch {
      return null;
    }
  },

  _allowList() {
    return Services.prefs
      .getStringPref(PREF_ALLOW_LIST, "")
      .split(",")
      .map(site => site.trim())
      .filter(Boolean);
  },

  cleansSite(uri) {
    const site = this.siteFor(uri);
    return !!site && !this._allowList().includes(site);
  },

  setSiteCleaning(uri, clean) {
    const site = this.siteFor(uri);
    if (!site) {
      return;
    }
    const sites = this._allowList().filter(entry => entry != site);
    if (!clean) {
      sites.push(site);
    }
    if (sites.length) {
      Services.prefs.setStringPref(PREF_ALLOW_LIST, sites.join(","));
    } else {
      Services.prefs.clearUserPref(PREF_ALLOW_LIST);
    }
  },

  /**
   * What cleaning removed from the link that opened the page in a tab.
   *
   * @param {MozBrowser} browser
   * @returns {?{original: nsIURI, removed: string[]}}
   */
  cleanedFor(browser) {
    const history = browser?.browsingContext?.sessionHistory;
    if (!history || history.index < 0 || history.index >= history.count) {
      return null;
    }
    const entry = history.getEntryAtIndex(history.index);
    const original = entry.unstrippedURI;
    if (!original || !entry.URI?.equalsExceptRef(browser.currentURI)) {
      return null;
    }
    let before, after;
    try {
      before = new URL(original.spec).searchParams;
      after = new URL(browser.currentURI.spec).searchParams;
    } catch {
      return null;
    }
    const removed = [...new Set(before.keys())].filter(
      name => !after.has(name)
    );
    return removed.length ? { original, removed } : null;
  },

  // Loads the link as it was before cleaning. The load is made on behalf of
  // the destination site itself, which the browser never cleans.
  loadOriginal(browser) {
    const cleaned = this.cleanedFor(browser);
    if (!cleaned) {
      return;
    }
    browser.loadURI(cleaned.original, {
      triggeringPrincipal:
        Services.scriptSecurityManager.createContentPrincipal(
          cleaned.original,
          browser.contentPrincipal.originAttributes
        ),
      loadFlags: Ci.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY,
    });
  },

  buildSection(doc, win) {
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/linkcleaner.ftl");
    const section = html(doc, "div", "nirva-linkclean");
    section.hidden = true;
    const site = html(
      doc,
      "button",
      "nirva-linkclean-row nirva-linkclean-site"
    );
    site.type = "button";
    site.setAttribute("role", "switch");
    site.append(
      html(doc, "span", "", "nirva-linkclean-site"),
      html(doc, "span", "nirva-linkclean-state")
    );
    site.addEventListener("click", () => {
      // The switch stays in view until the panel closes, so the change can
      // be seen and undone.
      section.dataset.keep = "true";
      section
        .closest("panel")
        ?.addEventListener("popuphidden", () => delete section.dataset.keep, {
          once: true,
        });
      const browser = win.gBrowser.selectedBrowser;
      this.setSiteCleaning(
        browser.currentURI,
        !this.cleansSite(browser.currentURI)
      );
      this.updateSection(win, section);
    });
    const original = html(
      doc,
      "button",
      "nirva-linkclean-row nirva-linkclean-original",
      "nirva-linkclean-original"
    );
    original.type = "button";
    original.addEventListener("click", () => {
      section.closest("panel")?.hidePopup();
      this.loadOriginal(win.gBrowser.selectedBrowser);
    });
    section.append(
      html(doc, "div", "nirva-linkclean-label", "nirva-linkclean-label"),
      html(doc, "p", "nirva-linkclean-note"),
      site,
      original
    );
    return section;
  },

  updateSection(win, section) {
    if (!section) {
      return;
    }
    const doc = win.document;
    const browser = win.gBrowser.selectedBrowser;
    const uri = browser.currentURI;
    if (!this.enabled || !this.siteFor(uri)) {
      section.hidden = true;
      return;
    }
    const cleans = this.cleansSite(uri);
    const cleaned = this.cleanedFor(browser);
    // Shown only when there is something to say: this page's link was
    // cleaned, or the site is exempt. The command bar always offers both.
    section.hidden = cleans && !cleaned && !section.dataset.keep;
    if (section.hidden) {
      return;
    }
    const note = section.querySelector(".nirva-linkclean-note");
    if (cleaned) {
      const shown = cleaned.removed.slice(0, SHOWN_NAMES);
      const more = cleaned.removed.length - shown.length;
      doc.l10n.setAttributes(
        note,
        more ? "nirva-linkclean-removed-more" : "nirva-linkclean-removed",
        { names: shown.join(", "), more }
      );
    } else {
      doc.l10n.setAttributes(
        note,
        cleans ? "nirva-linkclean-clean" : "nirva-linkclean-exempt"
      );
    }
    const site = section.querySelector(".nirva-linkclean-site");
    site.setAttribute("aria-checked", String(cleans));
    doc.l10n.setAttributes(
      site.querySelector(".nirva-linkclean-state"),
      cleans ? "nirva-linkclean-on" : "nirva-linkclean-off"
    );
    section.querySelector(".nirva-linkclean-original").hidden = !cleaned;
  },

  _registerCommands() {
    const current = win => win.gBrowser?.selectedBrowser;
    NirvaCommands.register({
      id: "linkcleaner-original",
      feature: "linkcleaner",
      l10nId: "nirva-command-linkcleaner-original",
      keywords: "link cleaner original tracking parameters utm",
      isAvailable: win => !!this.cleanedFor(current(win)),
      run: win => this.loadOriginal(current(win)),
    });
    for (const clean of [false, true]) {
      NirvaCommands.register({
        id: `linkcleaner-site-${clean ? "on" : "off"}`,
        feature: "linkcleaner",
        l10nId: `nirva-command-linkcleaner-site-${clean ? "on" : "off"}`,
        keywords: "link cleaner site exception tracking parameters",
        isAvailable: win => {
          const uri = current(win)?.currentURI;
          return (
            this.enabled && !!this.siteFor(uri) && this.cleansSite(uri) != clean
          );
        },
        run: win => this.setSiteCleaning(current(win).currentURI, clean),
      });
    }
    for (const on of [false, true]) {
      NirvaCommands.register({
        id: `linkcleaner-${on ? "on" : "off"}`,
        feature: "linkcleaner",
        l10nId: `nirva-command-linkcleaner-${on ? "on" : "off"}`,
        keywords: "link cleaner tracking parameters utm clean links",
        isAvailable: () => this.enabled != on,
        run: () => Services.prefs.setBoolPref(PREF_ENABLED, on),
      });
    }
  },
};
