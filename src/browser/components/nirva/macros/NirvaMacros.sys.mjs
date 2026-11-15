/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NirvaMotion: "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs",
  NirvaWorkspaces:
    "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["browser/nirva/macros.ftl"], true)
);

const PREF_ENABLED = "nirva.macros.enabled";
const PREF_LIST = "nirva.macros.list";
const MANAGER_URL = "chrome://browser/content/nirva/macros.html";
export const MACROS_CHANGED_TOPIC = "nirva-macros-changed";
const RUNNING_NOTICE = "nirva-macro-running";
const RESULT_NOTICE = "nirva-macro-result";
export const MAX_MACROS = 30;
export const MAX_STEPS = 12;
const MAX_NAME = 60;
const LOAD_WAIT_MS = 15000;

// Nirva commands a macro may use: browser actions that change how the browser
// looks or what it shows. Anything that asks for input, edits saved data or
// acts on a website is left out.
const ALLOWED_COMMAND =
  /^(look-|mode-|motion-|workspace-switch-|lite-(on|off)$|home-open$|history$|bookmarks$|settings$|read-everything-search$|time-travel$|receipt-open$|live-clips-open$|theme-studio$|tabrules-(open|pause|resume)$|linkcleaner-(on|off)$|burner-(new|close-all)$|sidebar-toggle$)/;
// Commands whose effect cannot be taken back; the macro asks before it starts.
const CONSEQUENTIAL_COMMANDS = new Set(["burner-close-all"]);

/**
 * Steps a macro can hold besides Nirva commands.
 * Each has a title, whether it is consequential, and what it does.
 */
const ACTIONS = {
  open: {
    l10nId: "nirva-macros-step-open",
    async run(win, step) {
      const uri = NirvaMacros.siteURI(step.url);
      if (!uri) {
        throw new Error("nirva-macros-error-address");
      }
      const tab = win.gBrowser.addTrustedTab(uri.spec);
      win.gBrowser.selectedTab = tab;
      await NirvaMacros._loaded(win, tab.linkedBrowser);
    },
  },
  "sleep-others": {
    l10nId: "nirva-macros-step-sleep-others",
    async run(win) {
      for (const tab of win.gBrowser.visibleTabs) {
        await lazy.NirvaMotion.sleepTab(win, tab);
      }
    },
  },
  "close-others": {
    l10nId: "nirva-macros-step-close-others",
    consequential: true,
    async run(win) {
      const tabs = win.gBrowser.visibleTabs.filter(
        tab => !tab.selected && !tab.pinned
      );
      win.gBrowser.removeTabs(tabs, { skipPermitUnload: false });
    },
  },
};

function newId() {
  return Services.uuid.generateUUID().toString().slice(1, 9);
}

/**
 * Macros: a saved list of browser actions run in order from the command bar or
 * the Macros page. Each run can be stopped, and a step that fails is named.
 */
export const NirvaMacros = {
  _initialized: false,
  /** @type {WeakMap<Window, {stopped: boolean}>} */
  _running: new WeakMap(),

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._registerCommands();
  },

  /** @returns {{id: string, name: string, steps: object[]}[]} */
  get macros() {
    try {
      const list = JSON.parse(Services.prefs.getStringPref(PREF_LIST, "[]"));
      return Array.isArray(list) ? list.filter(m => m?.id && m.name) : [];
    } catch {
      return [];
    }
  },

  _save(list) {
    Services.prefs.setStringPref(PREF_LIST, JSON.stringify(list));
    Services.obs.notifyObservers(null, MACROS_CHANGED_TOPIC);
  },

  get(id) {
    return this.macros.find(macro => macro.id == id) ?? null;
  },

  /**
   * Adds or replaces a macro.
   *
   * @param {{id?: string, name: string, steps: object[]}} macro
   * @returns {string} the macro's id
   */
  save({ id, name, steps }) {
    name = String(name ?? "")
      .trim()
      .slice(0, MAX_NAME);
    if (!name) {
      throw new Error("nirva-macros-error-name");
    }
    steps = (steps ?? []).map(step => this._cleanStep(step)).filter(Boolean);
    if (!steps.length) {
      throw new Error("nirva-macros-error-steps");
    }
    if (steps.length > MAX_STEPS) {
      throw new Error("nirva-macros-error-too-many");
    }
    const list = this.macros;
    const index = list.findIndex(macro => macro.id == id);
    if (index < 0 && list.length >= MAX_MACROS) {
      throw new Error("nirva-macros-error-full");
    }
    const macro = { id: index < 0 ? newId() : id, name, steps };
    if (index < 0) {
      list.push(macro);
    } else {
      list[index] = macro;
    }
    this._save(list);
    return macro.id;
  },

  remove(id) {
    this._save(this.macros.filter(macro => macro.id != id));
  },

  _cleanStep(step) {
    if (step?.type == "command" && ALLOWED_COMMAND.test(step.command ?? "")) {
      return {
        type: "command",
        command: step.command,
        label: String(step.label ?? "").slice(0, 120),
      };
    }
    if (step?.type == "open") {
      const uri = this.siteURI(step.url);
      return uri ? { type: "open", url: uri.spec } : null;
    }
    if (ACTIONS[step?.type]) {
      return { type: step.type };
    }
    return null;
  },

  /**
   * @param {string} text what the user typed
   * @returns {?nsIURI} a web address, or null for anything else
   */
  siteURI(text) {
    text = String(text ?? "").trim();
    if (!text) {
      return null;
    }
    try {
      const { preferredURI } = Services.uriFixup.getFixupURIInfo(
        text,
        Services.uriFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS
      );
      return preferredURI?.schemeIs("http") || preferredURI?.schemeIs("https")
        ? preferredURI
        : null;
    } catch {
      return null;
    }
  },

  /**
   * Every step the editor can offer in a window, in display order.
   *
   * @param {Window} win
   * @returns {{key: string, step: object, title: string, consequential: boolean}[]}
   */
  choices(win) {
    const choices = [];
    for (const [type, action] of Object.entries(ACTIONS)) {
      choices.push({
        key: type,
        step: { type },
        title: lazy.l10n.formatValueSync(
          type == "open" ? "nirva-macros-choice-open" : action.l10nId
        ),
        consequential: !!action.consequential,
      });
    }
    const seen = new Set();
    for (const workspace of lazy.NirvaWorkspaces.list) {
      const command = `workspace-switch-${workspace.id}`;
      seen.add(command);
      choices.push({
        key: command,
        step: { type: "command", command },
        title: NirvaCommands.titleOf({
          l10nId: "nirva-command-workspace-switch",
          l10nArgs: { name: workspace.name },
        }),
        consequential: false,
      });
    }
    for (const command of this._catalog(win)) {
      if (!seen.has(command.id) && ALLOWED_COMMAND.test(command.id)) {
        seen.add(command.id);
        choices.push({
          key: command.id,
          step: { type: "command", command: command.id },
          title: NirvaCommands.titleOf(command),
          consequential: CONSEQUENTIAL_COMMANDS.has(command.id),
        });
      }
    }
    return choices;
  },

  // Every command, whether or not it would change anything right now.
  _catalog(win) {
    const commands = [...NirvaCommands._commands.values()];
    for (const provider of NirvaCommands._providers.values()) {
      try {
        commands.push(...provider(win));
      } catch {}
    }
    return commands;
  },

  titleOf(step, win) {
    if (step.type == "open") {
      return lazy.l10n.formatValueSync("nirva-macros-step-open", {
        url: step.url,
      });
    }
    if (step.type == "command") {
      const command = win && this._catalog(win).find(c => c.id == step.command);
      return command
        ? NirvaCommands.titleOf(command)
        : step.label || step.command;
    }
    return lazy.l10n.formatValueSync(ACTIONS[step.type]?.l10nId ?? "");
  },

  isConsequential(step) {
    return step.type == "command"
      ? CONSEQUENTIAL_COMMANDS.has(step.command)
      : !!ACTIONS[step.type]?.consequential;
  },

  isRunning(win) {
    return this._running.has(win);
  },

  stop(win) {
    const run = this._running.get(win);
    if (run) {
      run.stopped = true;
      run.wake?.();
    }
  },

  /**
   * Runs a macro's steps in order in a window.
   *
   * @param {Window} win
   * @param {string} id the macro's id
   * @returns {Promise<"done"|"stopped"|"failed"|"cancelled"|"busy">}
   */
  async run(win, id) {
    const macro = this.get(id);
    if (!macro || !win?.gBrowser) {
      return "failed";
    }
    if (this._running.has(win)) {
      return "busy";
    }
    const box = win.gNotificationBox;
    box.getNotificationWithValue(RESULT_NOTICE)?.close();
    const titles = macro.steps.map(step => this.titleOf(step, win));
    const risky = macro.steps
      .map((step, index) => (this.isConsequential(step) ? titles[index] : null))
      .filter(Boolean);
    if (risky.length && !this._confirm(win, macro, risky)) {
      return "cancelled";
    }

    const run = { stopped: false };
    this._running.set(win, run);
    let result = "done";
    let failure = null;
    try {
      for (const [index, step] of macro.steps.entries()) {
        if (run.stopped) {
          break;
        }
        await this._showRunning(win, macro, index, titles[index]);
        try {
          await this._runStep(win, step, run);
        } catch (e) {
          failure = {
            index,
            title: titles[index],
            reason: String(e?.message ?? ""),
          };
          break;
        }
      }
    } finally {
      this._running.delete(win);
      box.getNotificationWithValue(RUNNING_NOTICE)?.close();
    }
    if (failure) {
      result = "failed";
      this._notify(win, "nirva-macros-failed", {
        name: macro.name,
        step: failure.index + 1,
        title: failure.title,
        reason: lazy.l10n.formatValueSync(
          failure.reason.startsWith("nirva-macros-error")
            ? failure.reason
            : "nirva-macros-error-unknown"
        ),
      });
    } else if (run.stopped) {
      result = "stopped";
      this._notify(win, "nirva-macros-stopped", { name: macro.name });
    }
    return result;
  },

  _confirm(win, macro, risky) {
    const [title, text] = lazy.l10n.formatValuesSync([
      { id: "nirva-macros-confirm-title", args: { name: macro.name } },
      {
        id: "nirva-macros-confirm-text",
        args: { steps: risky.map(step => `• ${step}`).join("\n") },
      },
    ]);
    return Services.prompt.confirm(win, title, text);
  },

  async _runStep(win, step, run) {
    if (step.type == "command") {
      const command = NirvaCommands.get(step.command, win);
      if (command) {
        await command.run(win);
      } else if (!this._catalog(win).some(c => c.id == step.command)) {
        // The active workspace is not offered as a switch target; being in it
        // already means the step is done.
        const active = lazy.NirvaWorkspaces.getActive(win);
        if (step.command != `workspace-switch-${active}`) {
          throw new Error("nirva-macros-error-gone");
        }
      }
      // A command that exists but would change nothing is already done.
      return;
    }
    const action = ACTIONS[step.type];
    if (!action) {
      throw new Error("nirva-macros-error-gone");
    }
    await Promise.race([
      action.run(win, step),
      new Promise(resolve => (run.wake = resolve)),
    ]);
  },

  // Waits until a tab's page has loaded, the wait runs out, or the run stops.
  _loaded(win, browser) {
    return new Promise(resolve => {
      const listener = {
        onStateChange(b, webProgress, request, flags) {
          if (
            b == browser &&
            webProgress.isTopLevel &&
            flags & Ci.nsIWebProgressListener.STATE_STOP &&
            flags & Ci.nsIWebProgressListener.STATE_IS_NETWORK &&
            b.currentURI.spec != "about:blank"
          ) {
            done();
          }
        },
      };
      const timer = lazy.setTimeout(() => done(), LOAD_WAIT_MS);
      function done() {
        lazy.clearTimeout(timer);
        win.gBrowser.removeTabsProgressListener(listener);
        resolve();
      }
      win.gBrowser.addTabsProgressListener(listener);
    });
  },

  async _showRunning(win, macro, index, title) {
    const box = win.gNotificationBox;
    const label = lazy.l10n.formatValueSync("nirva-macros-running", {
      name: macro.name,
      step: index + 1,
      count: macro.steps.length,
      title,
    });
    const notice = box.getNotificationWithValue(RUNNING_NOTICE);
    if (notice) {
      notice.label = label;
      return;
    }
    await box.appendNotification(
      RUNNING_NOTICE,
      { label, priority: box.PRIORITY_INFO_MEDIUM },
      [
        {
          label: lazy.l10n.formatValueSync("nirva-macros-stop"),
          callback: () => {
            this.stop(win);
            return true;
          },
        },
      ]
    );
  },

  _notify(win, l10nId, args) {
    const box = win.gNotificationBox;
    box.appendNotification(RESULT_NOTICE, {
      label: lazy.l10n.formatValueSync(l10nId, args),
      priority:
        l10nId == "nirva-macros-failed"
          ? box.PRIORITY_WARNING_MEDIUM
          : box.PRIORITY_INFO_MEDIUM,
    });
  },

  openManager(win) {
    for (const tab of win.gBrowser.tabs) {
      if (tab.linkedBrowser.currentURI?.spec == MANAGER_URL) {
        win.gBrowser.selectedTab = tab;
        return tab;
      }
    }
    const tab = win.gBrowser.addTrustedTab(MANAGER_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  _registerCommands() {
    NirvaCommands.register({
      id: "macros-open",
      feature: "macros",
      l10nId: "nirva-command-macros-open",
      keywords: "macro macros buttons automate sequence steps",
      isAvailable: () => this.enabled,
      run: win => this.openManager(win),
    });
    NirvaCommands.register({
      id: "macros-stop",
      feature: "macros",
      l10nId: "nirva-command-macros-stop",
      keywords: "macro stop cancel",
      isAvailable: win => this.isRunning(win),
      run: win => this.stop(win),
    });
    NirvaCommands.registerProvider("macros", () =>
      this.enabled
        ? this.macros.map(macro => ({
            id: `macro-${macro.id}`,
            l10nId: "nirva-command-macro-run",
            l10nArgs: { name: macro.name },
            keywords: "macro run",
            run: win => this.run(win, macro.id),
          }))
        : []
    );
  },
};
