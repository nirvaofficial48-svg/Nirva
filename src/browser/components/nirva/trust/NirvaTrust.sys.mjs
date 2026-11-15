/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  ContentBlockingAllowList:
    "resource://gre/modules/ContentBlockingAllowList.sys.mjs",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.sys.mjs",
  SitePermissions: "resource:///modules/SitePermissions.sys.mjs",
});

const PREF_ENABLED = "nirva.trust.enabled";
const CHANGE_TOPIC = "nirva-trust-changed";
const HTML_NS = "http://www.w3.org/1999/xhtml";

export const TRUST_LEVELS = ["strict", "balanced", "trusted"];

// The site permissions the Strict step sets. Each is an ordinary browser
// permission that can also be changed on its own.
function strictPreset() {
  const { SitePermissions } = lazy;
  return new Map([
    ["cookie", SitePermissions.ALLOW_COOKIES_FOR_SESSION],
    ["autoplay-media", SitePermissions.AUTOPLAY_BLOCKED_ALL],
    ["geo", SitePermissions.BLOCK],
    ["camera", SitePermissions.BLOCK],
    ["microphone", SitePermissions.BLOCK],
    ["desktop-notification", SitePermissions.BLOCK],
  ]);
}

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
 * Per-site protection in three steps. Every step is made only of controls the
 * browser already has: the tracking protection exception list and site
 * permissions. Nothing here is a score.
 */
export const NirvaTrust = {
  _initialized: false,

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    for (const level of TRUST_LEVELS) {
      NirvaCommands.register({
        id: `trust-${level}`,
        feature: "trust",
        l10nId: `nirva-command-trust-${level}`,
        keywords: `trust dial site protection permissions ${level}`,
        isAvailable: win => {
          const browser = win.gBrowser?.selectedBrowser;
          return this.canUse(browser) && this.levelFor(browser) != level;
        },
        run: win => this.setLevel(win.gBrowser.selectedBrowser, level),
      });
    }
  },

  canUse(browser) {
    const principal = browser?.contentPrincipal;
    return (
      this.enabled &&
      !!principal &&
      ["http", "https"].includes(browser.currentURI?.scheme) &&
      !lazy.PrivateBrowsingUtils.isBrowserPrivate(browser) &&
      lazy.SitePermissions.isSupportedPrincipal(principal) &&
      lazy.ContentBlockingAllowList.canHandle(browser)
    );
  },

  _state(browser, id) {
    return lazy.SitePermissions.getForPrincipal(
      browser.contentPrincipal,
      id,
      browser
    ).state;
  },

  /**
   * Reads the step from the browser's real state for this site.
   *
   * @param {MozBrowser} browser
   * @returns {"strict"|"balanced"|"trusted"}
   */
  levelFor(browser) {
    if (lazy.ContentBlockingAllowList.includes(browser)) {
      return "trusted";
    }
    for (const [id, state] of strictPreset()) {
      if (this._state(browser, id) != state) {
        return "balanced";
      }
    }
    return "strict";
  },

  // How many sites currently have the whole Strict preset.
  strictSiteCount() {
    const preset = strictPreset();
    let count = 0;
    for (const permission of Services.perms.getAllByTypes(["cookie"])) {
      if (
        permission.capability == preset.get("cookie") &&
        [...preset].every(
          ([id, state]) =>
            Services.perms.testExactPermissionFromPrincipal(
              permission.principal,
              id
            ) == state
        )
      ) {
        count++;
      }
    }
    return count;
  },

  setLevel(browser, level) {
    if (!this.canUse(browser) || !TRUST_LEVELS.includes(level)) {
      return false;
    }
    const { ContentBlockingAllowList, SitePermissions } = lazy;
    const principal = browser.contentPrincipal;
    const before = this.levelFor(browser);
    if (before == level) {
      return false;
    }
    for (const [id, state] of strictPreset()) {
      if (level == "strict") {
        SitePermissions.setForPrincipal(principal, id, state);
      } else if (before == "strict") {
        SitePermissions.removeFromPrincipal(principal, id, browser);
      }
    }
    const wasTrusted = before == "trusted";
    if (level == "trusted") {
      ContentBlockingAllowList.add(browser);
    } else if (wasTrusted) {
      ContentBlockingAllowList.remove(browser);
    }
    this._changed(browser);
    if (wasTrusted != (level == "trusted")) {
      // Tracking protection is decided as a page loads.
      browser.reload();
    }
    return true;
  },

  /**
   * The permissions shown under the dial, with the browser's own names.
   *
   * @param {MozBrowser} browser
   * @returns {{id: string, label: string, state: number, stateLabel: string}[]}
   */
  permissions(browser) {
    const { SitePermissions } = lazy;
    return [...strictPreset().keys()].map(id => {
      const state = this._state(browser, id);
      return {
        id,
        label: SitePermissions.getPermissionLabel(id),
        state,
        stateLabel: SitePermissions.getMultichoiceStateLabel(id, state),
      };
    });
  },

  // Moves one permission to its next choice.
  cyclePermission(browser, id) {
    if (!this.canUse(browser) || !strictPreset().has(id)) {
      return;
    }
    const { SitePermissions } = lazy;
    const principal = browser.contentPrincipal;
    const states = SitePermissions.getAvailableStates(id);
    const next =
      states[(states.indexOf(this._state(browser, id)) + 1) % states.length];
    if (next == SitePermissions.getDefault(id)) {
      SitePermissions.removeFromPrincipal(principal, id, browser);
    } else {
      SitePermissions.setForPrincipal(principal, id, next);
    }
    this._changed(browser);
  },

  _changed(browser) {
    const win = browser.documentGlobal;
    this.updateSection(win, win?.document.querySelector(".nirva-trust"));
    Services.obs.notifyObservers(null, CHANGE_TOPIC);
  },

  /**
   * Builds the dial and its permission list for the Privacy Receipt panel.
   *
   * @param {Document} doc
   * @param {Window} win
   * @returns {HTMLElement}
   */
  buildSection(doc, win) {
    win.MozXULElement.insertFTLIfNeeded("browser/nirva/trust.ftl");
    const section = html(doc, "div", "nirva-trust");
    section.hidden = true;
    const dial = html(doc, "input", "nirva-trust-dial", "nirva-trust-dial");
    dial.type = "range";
    dial.min = 0;
    dial.max = TRUST_LEVELS.length - 1;
    dial.step = 1;
    dial.addEventListener("change", () =>
      this.setLevel(win.gBrowser.selectedBrowser, TRUST_LEVELS[dial.value])
    );
    const steps = html(doc, "div", "nirva-trust-steps");
    steps.setAttribute("aria-hidden", "true");
    for (const level of TRUST_LEVELS) {
      const step = html(doc, "span", "", `nirva-trust-step-${level}`);
      step.dataset.level = level;
      steps.append(step);
    }
    const toggle = html(
      doc,
      "button",
      "nirva-trust-toggle",
      "nirva-trust-toggle"
    );
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    const list = html(doc, "div", "nirva-trust-permissions");
    list.hidden = true;
    toggle.addEventListener("click", () => {
      list.hidden = !list.hidden;
      toggle.setAttribute("aria-expanded", String(!list.hidden));
    });
    list.addEventListener("click", event => {
      const row = event.target.closest(".nirva-trust-permission");
      if (row) {
        this.cyclePermission(win.gBrowser.selectedBrowser, row.dataset.id);
        list.querySelector(`[data-id="${row.dataset.id}"]`)?.focus();
      }
    });
    section.append(
      html(doc, "div", "nirva-trust-label", "nirva-trust-label"),
      dial,
      steps,
      html(doc, "p", "nirva-trust-note"),
      toggle,
      list
    );
    return section;
  },

  updateSection(win, section) {
    if (!section || !win || win.closed) {
      return;
    }
    const doc = win.document;
    const browser = win.gBrowser.selectedBrowser;
    section.hidden = !this.canUse(browser);
    if (section.hidden) {
      return;
    }
    const level = this.levelFor(browser);
    const dial = section.querySelector(".nirva-trust-dial");
    dial.value = TRUST_LEVELS.indexOf(level);
    for (const step of section.querySelectorAll(".nirva-trust-steps > span")) {
      step.toggleAttribute("data-current", step.dataset.level == level);
      if (step.dataset.level == level && step.textContent) {
        dial.setAttribute("aria-valuetext", step.textContent);
      }
    }
    doc.l10n.setAttributes(
      section.querySelector(".nirva-trust-note"),
      `nirva-trust-note-${level}`
    );
    const rows = this.permissions(browser).map(permission => {
      const row = html(doc, "button", "nirva-trust-permission");
      row.type = "button";
      row.dataset.id = permission.id;
      row.dataset.state = permission.state;
      const name = html(doc, "span", "nirva-trust-permission-name");
      name.textContent = permission.label;
      const state = html(doc, "span", "nirva-trust-permission-state");
      state.textContent = permission.stateLabel;
      row.append(name, state);
      return row;
    });
    section.querySelector(".nirva-trust-permissions").replaceChildren(...rows);
  },
};
