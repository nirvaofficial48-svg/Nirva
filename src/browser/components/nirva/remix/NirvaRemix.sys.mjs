/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaPrivacyRules } from "moz-src:///browser/components/nirva/privacy/NirvaPrivacyRules.sys.mjs";
import {
  NirvaRemixStore,
  REMIX_OPTIONS,
  remixHasEffect,
} from "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  BrowserWindowTracker: "resource:///modules/BrowserWindowTracker.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(["branding/brand.ftl", "browser/nirva/remix.ftl"], true)
);

const PREF_ENABLED = "nirva.remix.enabled";
const MANAGER_URL = "chrome://browser/content/nirva/remix.html";
const CHANGE_TOPIC = "nirva-remix-changed";
const FOCUS_TOPIC = "nirva-remix-focus";
const CONTEXT_ITEM_ID = "nirva-remix-context-hide";
const TAB_ATTRIBUTE = "nirva-remixed";

function payload(remix) {
  return {
    fontFamily: remix.fontFamily,
    textScale: remix.textScale,
    lineHeight: remix.lineHeight,
    selectors: remix.hidden.map(entry => entry.selector),
  };
}

/** Persistent personal adjustments to web pages: hidden elements and typography. */
export const NirvaRemix = {
  _initialized: false,
  _ready: null,
  _pendingURL: null,
  // What applies to each tab right now, so commands can answer without waiting.
  _tabState: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaRemix", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/remix/NirvaRemixParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/remix/NirvaRemixChild.sys.mjs",
        events: {
          DOMContentLoaded: {},
          contextmenu: { capture: true },
          TextZoomChange: {},
        },
      },
      matches: ["http://*/*", "https://*/*"],
      messageManagerGroups: ["browsers"],
      safeForUntrustedWebProcess: true,
    });
    const selected = win => win.gBrowser?.selectedBrowser;
    const state = win => this._tabState.get(selected(win));
    const command = (id, keywords, isAvailable, run) =>
      NirvaCommands.register({
        id: `remix-${id}`,
        feature: "remix",
        l10nId: `nirva-command-remix-${id}`,
        keywords,
        isAvailable,
        run,
      });
    command(
      "open",
      "remix pages sites adjustments hidden elements fonts manage",
      win => this.enabled && !lazy.PrivateBrowsingUtils.isWindowPrivate(win),
      win => this.openManager(win)
    );
    command(
      "edit",
      "remix this site page font text size spacing adjust customise",
      win => this.canRemix(win, selected(win)),
      win => this.openManager(win, selected(win).currentURI.spec)
    );
    command(
      "hide",
      "remix hide element remove distraction block part of page",
      win => this.canRemix(win, selected(win)),
      win => this.pickToHide(win)
    );
    command(
      "text-larger",
      "remix bigger larger text size font increase",
      win =>
        this.canRemix(win, selected(win)) &&
        (state(win)?.textScale ?? 100) < REMIX_OPTIONS.textScale.at(-1),
      win => this.stepText(win, 1)
    );
    command(
      "text-smaller",
      "remix smaller text size font decrease",
      win =>
        this.canRemix(win, selected(win)) &&
        (state(win)?.textScale ?? 100) > 100,
      win => this.stepText(win, -1)
    );
    command(
      "off",
      "remix turn off disable pause original page",
      win => this.canRemix(win, selected(win)) && state(win)?.enabled === true,
      win => this.setEnabled(state(win).id, false)
    );
    command(
      "on",
      "remix turn on enable resume",
      win => this.canRemix(win, selected(win)) && state(win)?.enabled === false,
      win => this.setEnabled(state(win).id, true)
    );
    command(
      "reset",
      "remix reset remove undo all changes original page",
      win => this.canRemix(win, selected(win)) && Boolean(state(win)),
      win => this.reset(state(win).id)
    );
    Services.obs.addObserver(this, "browser-delayed-startup-finished");
    Services.prefs.addObserver(PREF_ENABLED, this);
    this._ready = NirvaRemixStore.init().catch(error =>
      console.error("Nirva Page Remix could not start", error)
    );
  },

  observe(subject, topic) {
    if (topic == "browser-delayed-startup-finished") {
      this._setupWindow(subject);
    } else if (topic == "nsPref:changed") {
      this._applyEverywhere();
    }
  },

  _setupWindow(win) {
    const doc = win?.document;
    const popup = doc?.getElementById("contentAreaContextMenu");
    if (!popup || !win.gBrowser || doc.getElementById(CONTEXT_ITEM_ID)) {
      return;
    }
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/remix.ftl");
    doc.documentElement.style?.setProperty(
      "--nirva-label-remixed",
      JSON.stringify(lazy.l10n.formatValueSync("nirva-tab-label-remixed"))
    );
    const item = doc.createXULElement("menuitem");
    item.id = CONTEXT_ITEM_ID;
    item.hidden = true;
    doc.l10n.setAttributes(item, "nirva-remix-context-hide");
    item.addEventListener("command", () => this.hideContextTarget(win));
    popup.insertBefore(item, doc.getElementById("context-searchselect"));
    popup.addEventListener("popupshowing", event => {
      if (event.target == popup) {
        const menu = win.gContextMenu;
        item.hidden =
          !this.canRemix(win, win.gBrowser.selectedBrowser) ||
          Boolean(menu?.isTextSelected || menu?.onTextInput);
      }
    });
    win.gBrowser.addTabsProgressListener({
      onLocationChange: (browser, webProgress, _request, _uri, flags) => {
        if (!webProgress.isTopLevel) {
          return;
        }
        const sameDocument =
          flags & Ci.nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT;
        this._refreshBrowser(win, browser, Boolean(sameDocument));
      },
    });
  },

  _allowed(win, browser, url) {
    if (
      !this.enabled ||
      !win?.gBrowser ||
      !browser?.browsingContext ||
      lazy.PrivateBrowsingUtils.isWindowPrivate(win)
    ) {
      return false;
    }
    const tab = win.gBrowser.getTabForBrowser(browser);
    return (
      Boolean(tab) &&
      !tab.closing &&
      !NirvaPrivacyRules.isBurnerTab(tab) &&
      Boolean(NirvaPrivacyRules.storableURL(url)) &&
      !NirvaPrivacyRules.isSensitivePage(url, browser.contentTitle || "")
    );
  },

  canRemix(win, browser) {
    return this._allowed(win, browser, browser?.currentURI?.spec || "");
  },

  _remember(win, browser, remix) {
    const tab = win.gBrowser.getTabForBrowser(browser);
    if (remix) {
      this._tabState.set(browser, {
        id: remix.id,
        enabled: remix.enabled,
        textScale: remix.textScale,
      });
    } else {
      this._tabState.delete(browser);
    }
    tab?.toggleAttribute(TAB_ATTRIBUTE, remixHasEffect(remix));
  },

  // Recomputes what applies to one tab; `send` also pushes it to the page that is already open.
  async _refreshBrowser(win, browser, send) {
    if (!browser || !win?.gBrowser) {
      return;
    }
    try {
      await this._ready;
      const url = browser.currentURI?.spec || "";
      const remix = this._allowed(win, browser, url)
        ? await NirvaRemixStore.lookup(url)
        : null;
      if (browser.currentURI?.spec != url) {
        return;
      }
      this._remember(win, browser, remix);
      if (send && NirvaPrivacyRules.storableURL(url)) {
        browser.browsingContext?.currentWindowGlobal
          ?.getActor("NirvaRemix")
          .sendAsyncMessage("NirvaRemix:Apply", {
            remix: remixHasEffect(remix) ? payload(remix) : null,
          });
      }
    } catch (error) {
      console.error("Nirva could not refresh a remixed tab", error);
    }
  },

  async _applyEverywhere() {
    for (const win of lazy.BrowserWindowTracker.orderedWindows) {
      for (const tab of win.gBrowser?.tabs || []) {
        if (!tab.hasAttribute("pending") && !tab.closing && tab.linkedBrowser) {
          await this._refreshBrowser(win, tab.linkedBrowser, true);
        }
      }
    }
  },

  async _changed() {
    await this._applyEverywhere();
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  /**
   * What a loading page should apply.
   *
   * @param {BrowsingContext} browsingContext
   * @param {string} documentURL
   */
  async pageInfo(browsingContext, documentURL) {
    const browser = browsingContext?.top?.embedderElement;
    const win = browser?.documentGlobal;
    if (browsingContext?.parent || !this._allowed(win, browser, documentURL)) {
      return null;
    }
    await this._ready;
    const remix = await NirvaRemixStore.lookup(documentURL);
    this._remember(win, browser, remix);
    if (!remixHasEffect(remix)) {
      return null;
    }
    return {
      remix: payload(remix),
      chip: lazy.l10n.formatValueSync("nirva-remix-chip"),
    };
  },

  _notify(win, browser, messageId, buttons = []) {
    const box = win?.gBrowser?.getNotificationBox(browser);
    if (!box) {
      return;
    }
    const value = "nirva-remix-notice";
    box.getNotificationWithValue(value)?.close();
    box.appendNotification(
      value,
      {
        label: lazy.l10n.formatValueSync(messageId),
        priority: box.PRIORITY_INFO_MEDIUM,
      },
      buttons
    );
  },

  openManager(win, url = null) {
    this._pendingURL = NirvaPrivacyRules.storableURL(url || "");
    const existing = [...(win.gBrowser?.tabs || [])].find(
      tab => tab.linkedBrowser.currentURI.spec == MANAGER_URL
    );
    if (existing) {
      win.gBrowser.selectedTab = existing;
      Services.obs.notifyObservers(null, FOCUS_TOPIC);
      return existing;
    }
    const tab = win.gBrowser.addTrustedTab(MANAGER_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  // The address the manager page was asked to show first, handed over once.
  takePendingURL() {
    const url = this._pendingURL;
    this._pendingURL = null;
    return url;
  },

  openSite(win, remix) {
    const url = remix.scope == "page" ? remix.key : `https://${remix.key}/`;
    const tab = win.gBrowser.addTrustedTab(url);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  async ensureFor(url, scope = "site") {
    await this._ready;
    return NirvaRemixStore.ensure(url, scope);
  },

  async update(id, changes) {
    await this._ready;
    const remix = await NirvaRemixStore.update(id, changes);
    await this._changed();
    return remix;
  },

  setEnabled(id, enabled) {
    return this.update(id, { enabled });
  },

  async removeHidden(id, hiddenId) {
    await this._ready;
    const remix = await NirvaRemixStore.removeHidden(id, hiddenId);
    await this._changed();
    return remix;
  },

  // One step back to the page as its site made it.
  async reset(id) {
    await this._ready;
    const remix = await NirvaRemixStore.remove(id);
    await this._changed();
    return remix;
  },

  async resetAll() {
    await this._ready;
    await NirvaRemixStore.clear();
    await this._changed();
  },

  async stepText(win, direction) {
    const browser = win.gBrowser?.selectedBrowser;
    if (!this.canRemix(win, browser)) {
      return null;
    }
    await this._ready;
    const url = browser.currentURI.spec;
    const remix =
      (await NirvaRemixStore.lookup(url)) ||
      (await NirvaRemixStore.ensure(url, "site"));
    const scales = REMIX_OPTIONS.textScale;
    const next = scales[scales.indexOf(remix.textScale) + direction];
    return next ? this.update(remix.id, { textScale: next }) : remix;
  },

  async _hide(win, browser, url, result) {
    if (!result) {
      return null;
    }
    if (result.error) {
      this._notify(
        win,
        browser,
        result.error == "protected"
          ? "nirva-remix-protected"
          : "nirva-remix-unsupported"
      );
      return null;
    }
    if (browser.currentURI?.spec != url || !this.canRemix(win, browser)) {
      return null;
    }
    try {
      const target =
        (await NirvaRemixStore.lookup(url)) ||
        (await NirvaRemixStore.ensure(url, "site"));
      const { remix, entry } = await NirvaRemixStore.addHidden(
        target.id,
        result
      );
      await this._changed();
      this._notify(win, browser, "nirva-remix-hidden", [
        {
          label: lazy.l10n.formatValueSync("nirva-remix-undo"),
          callback: () => {
            this.removeHidden(remix.id, entry.id);
          },
        },
      ]);
      return { remix, entry };
    } catch (error) {
      console.error("Nirva could not hide this element", error);
      this._notify(win, browser, "nirva-remix-unsupported");
      return null;
    }
  },

  /**
   * Lets the user click one element on the current page to hide it from now on.
   *
   * @param {Window} win
   * @returns {Promise<object|null>} The remix and its new hidden entry.
   */
  async pickToHide(win) {
    const browser = win.gBrowser?.selectedBrowser;
    if (!this.canRemix(win, browser)) {
      this._notify(win, browser, "nirva-remix-not-supported");
      return null;
    }
    await this._ready;
    const url = browser.currentURI.spec;
    try {
      const result = await browser.browsingContext.currentWindowGlobal
        .getActor("NirvaRemix")
        .sendQuery("NirvaRemix:Pick", {
          prompt: lazy.l10n.formatValueSync("nirva-remix-picker-prompt"),
        });
      return await this._hide(win, browser, url, result);
    } catch (error) {
      console.error("Nirva could not start the remix picker", error);
      return null;
    }
  },

  // Hides the element the user last right-clicked.
  async hideContextTarget(win) {
    const browser = win.gBrowser?.selectedBrowser;
    if (!this.canRemix(win, browser)) {
      return null;
    }
    await this._ready;
    const url = browser.currentURI.spec;
    try {
      const result = await browser.browsingContext.currentWindowGlobal
        .getActor("NirvaRemix")
        .sendQuery("NirvaRemix:ContextTarget");
      return await this._hide(
        win,
        browser,
        url,
        result || { error: "unsupported" }
      );
    } catch (error) {
      console.error("Nirva could not hide the chosen element", error);
      return null;
    }
  },
};
