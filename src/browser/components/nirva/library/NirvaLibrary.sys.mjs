/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaLibraryStore } from "moz-src:///browser/components/nirva/library/NirvaLibraryStore.sys.mjs";
import { NirvaPrivacyRules } from "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NirvaReadSearch:
    "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(["branding/brand.ftl", "browser/nirva/library.ftl"], true)
);

const PREF_ENABLED = "nirva.library.enabled";
const MANAGER_URL = "chrome://browser/content/nirva/library.html";
const CHANGE_TOPIC = "nirva-library-changed";
const FOCUS_TOPIC = "nirva-library-focus";
const NOTICE_VALUE = "nirva-library-notice";
const COPY_NOTICE_VALUE = "nirva-library-saved-copy";
const CONTEXT_ITEMS = [
  ["nirva-context-highlight", "nirva-library-context-highlight", "highlight"],
  ["nirva-context-note", "nirva-library-context-note", "note"],
  ["nirva-context-remove-highlight", "nirva-library-context-remove", "remove"],
];
const SNAPSHOT_ERRORS = {
  "too-large": "nirva-library-notice-too-large",
  unsupported: "nirva-library-notice-unsupported",
};
const SELECTION_ERRORS = {
  empty: "nirva-library-notice-select-first",
  "too-long": "nirva-library-notice-selection-too-long",
  unsupported: "nirva-library-notice-selection-unsupported",
};

function fileName(title, id) {
  const base =
    title
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "page";
  return `${base}-${id.slice(0, 8)}.html`;
}

function day(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

/** Saved page copies with the owner's highlights and notes, all kept on this device. */
export const NirvaLibrary = {
  _initialized: false,
  _ready: null,
  _contextTargets: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaLibrary", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/library/NirvaLibraryParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/library/NirvaLibraryChild.sys.mjs",
        events: {
          pageshow: {},
          contextmenu: { capture: true },
        },
      },
      matches: ["http://*/*", "https://*/*", "file:///*"],
      messageManagerGroups: ["browsers"],
      safeForUntrustedWebProcess: true,
    });
    const command = (id, l10nId, keywords, isAvailable, run) =>
      NirvaCommands.register({
        id,
        feature: "library",
        l10nId,
        keywords,
        isAvailable,
        run,
      });
    command(
      "library-open",
      "nirva-command-library",
      "library saved pages notes highlights offline archive",
      win => this.enabled && !lazy.PrivateBrowsingUtils.isWindowPrivate(win),
      win => this.openManager(win)
    );
    command(
      "library-save",
      "nirva-command-library-save",
      "save page copy offline keep archive library",
      win => this.canSave(win, win.gBrowser?.selectedBrowser),
      win => this.savePage(win)
    );
    command(
      "library-highlight",
      "nirva-command-library-highlight",
      "highlight selection selected text mark",
      win => this.canAnnotate(win, win.gBrowser?.selectedBrowser),
      win => this.highlightSelection(win)
    );
    command(
      "library-note",
      "nirva-command-library-note",
      "note annotate selection selected text comment",
      win => this.canAnnotate(win, win.gBrowser?.selectedBrowser),
      win => this.highlightSelection(win, { withNote: true })
    );
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.prefs.addObserver(PREF_ENABLED, this);
    this._ready = NirvaLibraryStore.init().catch(error =>
      console.error("Nirva Library could not start", error)
    );
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this._setupWindow(subject);
    } else if (topic == "nsPref:changed") {
      this._repaintAll();
    }
  },

  _eligibleTab(win, browser) {
    if (
      !this.enabled ||
      !win?.gBrowser ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(win) ||
      !browser?.browsingContext?.currentWindowGlobal
    ) {
      return false;
    }
    const tab = win.gBrowser.getTabForBrowser(browser);
    return Boolean(tab) && !tab.closing && !NirvaPrivacyRules.isBurnerTab(tab);
  },

  // A live web page that may be copied into the library.
  canSave(win, browser) {
    const url = browser?.currentURI?.spec || "";
    return (
      this._eligibleTab(win, browser) &&
      Boolean(NirvaPrivacyRules.storableURL(url)) &&
      !NirvaPrivacyRules.isSensitivePage(url, browser.contentTitle || "")
    );
  },

  // A live page or one of the library's own saved copies.
  canAnnotate(win, browser) {
    return (
      this.canSave(win, browser) ||
      (this._eligibleTab(win, browser) &&
        Boolean(this._copyId(browser.currentURI?.spec)))
    );
  },

  _copyId(spec) {
    if (typeof spec != "string" || !spec.startsWith("file:")) {
      return null;
    }
    try {
      const file = Services.io.newURI(spec).QueryInterface(Ci.nsIFileURL).file;
      return NirvaLibraryStore.idFromCopyPath(file.path);
    } catch (_error) {
      return null;
    }
  },

  copyURL(id) {
    const path = NirvaLibraryStore.copyPath(id);
    return path ? PathUtils.toFileURI(path) : null;
  },

  _actor(browser) {
    return browser.browsingContext.currentWindowGlobal.getActor("NirvaLibrary");
  },

  _changed() {
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  async savePage(win, browser = win?.gBrowser?.selectedBrowser) {
    if (!this.canSave(win, browser)) {
      this._notice(win, browser, "nirva-library-notice-not-supported");
      return null;
    }
    await this._ready;
    const startURL = NirvaPrivacyRules.storableURL(browser.currentURI.spec);
    try {
      const result = await this._actor(browser).sendQuery(
        "NirvaLibrary:Snapshot"
      );
      if (!result || result.error) {
        this._notice(
          win,
          browser,
          SNAPSHOT_ERRORS[result?.error] || SNAPSHOT_ERRORS.unsupported
        );
        return null;
      }
      if (
        NirvaPrivacyRules.storableURL(result.url) != startURL ||
        NirvaPrivacyRules.isSensitivePage(result.url, result.title) ||
        !this.canSave(win, browser)
      ) {
        this._notice(win, browser, SNAPSHOT_ERRORS.unsupported);
        return null;
      }
      const page = await NirvaLibraryStore.saveCopy({
        url: result.url,
        title: result.title,
        html: result.html,
        resources: result.resources,
        skipped: result.skipped,
      });
      await lazy.NirvaReadSearch.indexSavedCopy({
        url: page.url,
        title: page.title,
        body: result.text,
        localURI: this.copyURL(page.id),
        savedAt: page.copy.savedAt,
      }).catch(error =>
        console.error("Nirva could not index a saved copy", error)
      );
      this._changed();
      this._notice(win, browser, "nirva-library-notice-saved", [
        {
          "l10n-id": "nirva-library-notice-open-library",
          callback: () => {
            this.openManager(win, page.id);
          },
        },
      ]);
      return page;
    } catch (error) {
      console.error("Nirva could not save this page", error);
      this._notice(win, browser, SNAPSHOT_ERRORS.unsupported);
      return null;
    }
  },

  async highlightSelection(win, { withNote = false } = {}) {
    const browser = win?.gBrowser?.selectedBrowser;
    if (!this.canAnnotate(win, browser)) {
      this._notice(win, browser, "nirva-library-notice-not-supported");
      return null;
    }
    await this._ready;
    try {
      const selection = await this._actor(browser).sendQuery(
        "NirvaLibrary:Selection"
      );
      if (!selection || selection.error) {
        this._notice(
          win,
          browser,
          SELECTION_ERRORS[selection?.error] || SELECTION_ERRORS.unsupported
        );
        return null;
      }
      let { url, title } = selection;
      const copyId = this._copyId(url);
      if (copyId) {
        const source = await NirvaLibraryStore.get(copyId);
        if (!source) {
          this._notice(win, browser, SELECTION_ERRORS.unsupported);
          return null;
        }
        ({ url, title } = source);
      } else if (
        !NirvaPrivacyRules.storableURL(url) ||
        NirvaPrivacyRules.isSensitivePage(url, title)
      ) {
        this._notice(win, browser, "nirva-library-notice-not-supported");
        return null;
      }
      const result = await NirvaLibraryStore.addAnnotation({
        url,
        title,
        quote: selection.quote,
        prefix: selection.prefix,
        suffix: selection.suffix,
      });
      this._repaint(result.page);
      this._changed();
      if (withNote) {
        this.openManager(win, result.page.id, result.annotation.id);
      }
      return result;
    } catch (error) {
      console.error("Nirva could not highlight this selection", error);
      this._notice(win, browser, SELECTION_ERRORS.unsupported);
      return null;
    }
  },

  // Called by the page actor when a page is shown; answers with what to paint on it.
  async pageReady(browser, url) {
    const win = browser.documentGlobal;
    if (!this._eligibleTab(win, browser)) {
      return null;
    }
    await this._ready;
    const copyId = this._copyId(url);
    let page = null;
    if (copyId) {
      page = await NirvaLibraryStore.get(copyId);
      if (page?.copy) {
        this._showCopyNotice(win, browser, page);
      }
    } else if (NirvaPrivacyRules.storableURL(url)) {
      page = await NirvaLibraryStore.getByURL(url);
    }
    return page?.annotations.length ? this._payload(win, page) : null;
  },

  _payload(win, page) {
    return {
      accent: win
        .getComputedStyle(win.document.documentElement)
        .getPropertyValue("--nirva-accent")
        .trim(),
      annotations: (page?.annotations || []).map(annotation => ({
        id: annotation.id,
        quote: annotation.quote,
        prefix: annotation.prefix,
        suffix: annotation.suffix,
        hasNote: Boolean(annotation.note),
      })),
    };
  },

  *_browsers() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (win.closed || !win.gBrowser) {
        continue;
      }
      for (const tab of win.gBrowser.tabs) {
        yield [win, tab.linkedBrowser];
      }
    }
  },

  // Updates every open tab that shows this page or its saved copy.
  _repaint(page, removed = false) {
    for (const [win, browser] of this._browsers()) {
      const spec = browser.currentURI?.spec || "";
      if (
        NirvaPrivacyRules.storableURL(spec) != page.url &&
        this._copyId(spec) != page.id
      ) {
        continue;
      }
      try {
        this._actor(browser).sendAsyncMessage(
          "NirvaLibrary:Apply",
          this._payload(
            win,
            removed || !this._eligibleTab(win, browser) ? null : page
          )
        );
      } catch (_error) {}
    }
  },

  async _repaintAll() {
    await this._ready;
    for (const page of await NirvaLibraryStore.list()) {
      this._repaint(page, !this.enabled);
    }
  },

  setContextTarget(browser, id) {
    if (typeof id == "string") {
      this._contextTargets.set(browser, id);
    } else {
      this._contextTargets.delete(browser);
    }
  },

  async removeAnnotationById(annotationId) {
    await this._ready;
    for (const page of await NirvaLibraryStore.list()) {
      if (page.annotations.some(item => item.id == annotationId)) {
        return this.removeAnnotation(page.id, annotationId);
      }
    }
    return false;
  },

  async removeAnnotation(pageId, annotationId) {
    const page = await NirvaLibraryStore.get(pageId);
    if (
      !page ||
      !(await NirvaLibraryStore.removeAnnotation(pageId, annotationId))
    ) {
      return false;
    }
    page.annotations = page.annotations.filter(item => item.id != annotationId);
    this._repaint(page);
    this._changed();
    return true;
  },

  async setAnnotationNote(pageId, annotationId, note) {
    const page = await NirvaLibraryStore.updateAnnotation(
      pageId,
      annotationId,
      { note }
    );
    if (page) {
      this._repaint(page);
      this._changed();
    }
    return page;
  },

  async updatePage(id, changes) {
    const page = await NirvaLibraryStore.update(id, changes);
    this._changed();
    return page;
  },

  async deleteCopy(id) {
    const page = await NirvaLibraryStore.get(id);
    if (!page || !(await NirvaLibraryStore.removeCopy(id))) {
      return false;
    }
    await lazy.NirvaReadSearch.removeSavedCopy(page.url).catch(console.error);
    this._closeCopyTabs(id);
    this._changed();
    return true;
  },

  async deletePage(id) {
    const page = await NirvaLibraryStore.get(id);
    if (!page || !(await NirvaLibraryStore.remove(id))) {
      return false;
    }
    if (page.copy) {
      await lazy.NirvaReadSearch.removeSavedCopy(page.url).catch(console.error);
    }
    this._repaint(page, true);
    this._closeCopyTabs(id);
    this._changed();
    return true;
  },

  async clear() {
    await this._ready;
    const pages = await NirvaLibraryStore.list();
    await NirvaLibraryStore.clear();
    for (const page of pages) {
      if (page.copy) {
        await lazy.NirvaReadSearch.removeSavedCopy(page.url).catch(
          console.error
        );
      }
      this._repaint(page, true);
      this._closeCopyTabs(page.id);
    }
    this._changed();
  },

  _closeCopyTabs(id) {
    for (const [win, browser] of this._browsers()) {
      if (this._copyId(browser.currentURI?.spec) == id) {
        win.gBrowser.removeTab(win.gBrowser.getTabForBrowser(browser));
      }
    }
  },

  // Pages whose title, address, tags, notes, highlights or saved text match every word.
  async search(query) {
    await this._ready;
    const pages = await NirvaLibraryStore.list();
    const terms = String(query || "")
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!terms.length) {
      return pages;
    }
    const inSavedText = new Set();
    try {
      for (const hit of await lazy.NirvaReadSearch.searchSavedCopies(query)) {
        inSavedText.add(this._copyId(hit.localURI));
      }
    } catch (error) {
      console.error("Nirva Library could not search saved text", error);
    }
    return pages.filter(page => {
      if (inSavedText.has(page.id)) {
        return true;
      }
      const haystack = [
        page.title,
        page.url,
        page.note,
        ...page.tags,
        ...page.annotations.flatMap(item => [item.quote, item.note]),
      ]
        .join("\n")
        .toLowerCase();
      return terms.every(term => haystack.includes(term));
    });
  },

  openManager(win, pageId = null, annotationId = null) {
    if (!win?.gBrowser || lazy.PrivateBrowsingUtils.isWindowPrivate(win)) {
      return null;
    }
    let tab = [...win.gBrowser.tabs].find(
      item => item.linkedBrowser.currentURI.spec.split("#")[0] == MANAGER_URL
    );
    if (!tab) {
      tab = win.gBrowser.addTrustedTab(MANAGER_URL);
    }
    win.gBrowser.selectedTab = tab;
    if (pageId) {
      this._pendingFocus = { pageId, annotationId };
      Services.obs.notifyObservers(null, FOCUS_TOPIC);
    }
    return tab;
  },

  /** The Library page asks once for the entry it was opened to show. */
  takePendingFocus() {
    const focus = this._pendingFocus || null;
    this._pendingFocus = null;
    return focus;
  },

  async openCopy(win, id) {
    const page = await NirvaLibraryStore.get(id);
    if (!page?.copy || !win?.openTrustedLinkIn) {
      return false;
    }
    win.openTrustedLinkIn(this.copyURL(id), "tab");
    return true;
  },

  openSource(win, value) {
    const url = NirvaPrivacyRules.storableURL(value);
    if (!url || !win?.openTrustedLinkIn) {
      return false;
    }
    win.openTrustedLinkIn(url, "tab");
    return true;
  },

  notesMarkdown(pages) {
    const lines = ["# Nirva Library", ""];
    for (const page of pages) {
      lines.push(`## ${page.title}`, "", `Source: <${page.url}>`);
      if (page.copy) {
        lines.push(
          `Saved copy: ${fileName(page.title, page.id)} (${day(page.copy.savedAt)})`
        );
      }
      if (page.tags.length) {
        lines.push(`Tags: ${page.tags.join(", ")}`);
      }
      lines.push("");
      if (page.note) {
        lines.push(page.note, "");
      }
      for (const annotation of page.annotations) {
        lines.push(`> ${annotation.quote}`, "");
        if (annotation.note) {
          lines.push(annotation.note, "");
        }
      }
    }
    return lines.join("\n");
  },

  async exportCopy(id, destination) {
    const page = await NirvaLibraryStore.get(id);
    if (!page?.copy) {
      return false;
    }
    await IOUtils.copy(NirvaLibraryStore.copyPath(id), destination);
    return true;
  },

  // Writes every saved copy, the notes as Markdown and the index as JSON into a folder.
  async exportAll(folder) {
    await this._ready;
    const pages = await NirvaLibraryStore.list();
    await IOUtils.makeDirectory(folder, { ignoreExisting: true });
    let copies = 0;
    for (const page of pages) {
      if (page.copy) {
        await IOUtils.copy(
          NirvaLibraryStore.copyPath(page.id),
          PathUtils.join(folder, fileName(page.title, page.id))
        );
        copies++;
      }
    }
    await IOUtils.writeUTF8(
      PathUtils.join(folder, "notes.md"),
      this.notesMarkdown(pages)
    );
    await IOUtils.writeJSON(PathUtils.join(folder, "library.json"), {
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: pages.map(page => ({
        ...page,
        file: page.copy ? fileName(page.title, page.id) : null,
      })),
    });
    return { pages: pages.length, copies };
  },

  _picker(win, titleId, mode) {
    const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    picker.init(
      win.browsingContext,
      lazy.l10n.formatValueSync(titleId),
      Ci.nsIFilePicker[mode]
    );
    return picker;
  },

  async exportCopyWithPicker(win, id) {
    const page = await NirvaLibraryStore.get(id);
    if (!page?.copy) {
      return false;
    }
    const picker = this._picker(
      win,
      "nirva-library-export-copy-title",
      "modeSave"
    );
    picker.defaultExtension = "html";
    picker.appendFilters(Ci.nsIFilePicker.filterHTML);
    picker.defaultString = fileName(page.title, page.id);
    const result = await new Promise(resolve => picker.open(resolve));
    if (result == Ci.nsIFilePicker.returnCancel || !picker.file) {
      return false;
    }
    return this.exportCopy(id, picker.file.path);
  },

  async exportAllWithPicker(win) {
    const picker = this._picker(
      win,
      "nirva-library-export-all-title",
      "modeGetFolder"
    );
    const result = await new Promise(resolve => picker.open(resolve));
    if (result != Ci.nsIFilePicker.returnOK || !picker.file) {
      return null;
    }
    return this.exportAll(PathUtils.join(picker.file.path, "Nirva Library"));
  },

  _notice(win, browser, messageId, buttons = []) {
    const box = browser && win?.gBrowser?.getNotificationBox(browser);
    if (!box) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/library.ftl");
    box.getNotificationWithValue(NOTICE_VALUE)?.close();
    box.appendNotification(
      NOTICE_VALUE,
      {
        label: lazy.l10n.formatValueSync(messageId),
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      buttons
    );
  },

  _showCopyNotice(win, browser, page) {
    const box = win.gBrowser.getNotificationBox(browser);
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/library.ftl");
    box.getNotificationWithValue(COPY_NOTICE_VALUE)?.close();
    box.appendNotification(
      COPY_NOTICE_VALUE,
      {
        label: lazy.l10n.formatValueSync("nirva-library-copy-notice", {
          host: new URL(page.url).hostname,
          date: new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(page.copy.savedAt)),
        }),
        priority: box.PRIORITY_INFO_HIGH,
      },
      [
        {
          "l10n-id": "nirva-library-copy-notice-open-live",
          callback: () => {
            this.openSource(win, page.url);
            return true;
          },
        },
      ]
    );
  },

  _setupWindow(win) {
    const doc = win?.document;
    const popup = doc?.getElementById("contentAreaContextMenu");
    if (!popup || doc.getElementById(CONTEXT_ITEMS[0][0])) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/library.ftl");
    const before = doc.getElementById("context-searchselect");
    const items = {};
    let target = null;
    const run = action => {
      if (action == "remove") {
        if (target) {
          this.removeAnnotationById(target);
        }
      } else {
        this.highlightSelection(win, { withNote: action == "note" });
      }
    };
    for (const [id, l10nId, action] of CONTEXT_ITEMS) {
      const item = doc.createXULElement("menuitem");
      item.id = id;
      item.hidden = true;
      doc.l10n.setAttributes(item, l10nId);
      item.addEventListener("command", () => run(action));
      popup.insertBefore(item, before);
      items[action] = item;
    }
    popup.addEventListener("popupshowing", event => {
      if (event.target != popup) {
        return;
      }
      const browser = win.gBrowser.selectedBrowser;
      const annotate =
        Boolean(win.gContextMenu?.isTextSelected) &&
        this.canAnnotate(win, browser);
      // The page reported what was under the pointer just before asking for this menu.
      target = this.enabled ? this._contextTargets.get(browser) || null : null;
      this._contextTargets.delete(browser);
      items.highlight.hidden = !annotate;
      items.note.hidden = !annotate;
      items.remove.hidden = !target;
    });
  },
};
