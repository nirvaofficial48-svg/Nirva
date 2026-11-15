/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () =>
    new Localization(["branding/brand.ftl", "browser/nirva/commands.ftl"], true)
);

/**
 * @typedef {object} NirvaCommand
 * @property {string} id Unique, for example "look-glass".
 * @property {string} feature The feature it belongs to, for example "looks".
 * @property {string} [l10nId] Fluent id of the title, in browser/nirva/commands.ftl.
 * @property {object} [l10nArgs] Arguments for the title.
 * @property {string} [title] A ready-made title, used when there is no l10nId.
 * @property {string} [keywords] Extra words to find it by, not shown.
 * @property {(win: Window) => void} run What it does, in the given browser window.
 * @property {(win: Window) => boolean} [isAvailable] Leave it out of the list when false.
 */

/**
 * The list of everything Nirva can do by name. Every feature registers its commands here,
 * and the command bar (and later shortcuts, gestures and macros) reads them from here.
 */
export const NirvaCommands = {
  /** @type {Map<string, NirvaCommand>} */
  _commands: new Map(),
  /** @type {Map<string, (win: Window) => NirvaCommand[]>} */
  _providers: new Map(),

  /**
   * @param {NirvaCommand} command
   */
  register(command) {
    for (const field of ["id", "feature", "run"]) {
      if (!command?.[field]) {
        throw new Error(`A command needs "${field}"`);
      }
    }
    if (!command.l10nId && !command.title) {
      throw new Error(`Command ${command.id} needs a title`);
    }
    if (this._commands.has(command.id)) {
      throw new Error(`Command ${command.id} is already registered`);
    }
    this._commands.set(command.id, command);
  },

  /**
   * @param {NirvaCommand[]} commands
   */
  registerAll(commands) {
    for (const command of commands) {
      this.register(command);
    }
  },

  unregister(id) {
    this._commands.delete(id);
  },

  /**
   * For commands that depend on the moment, such as one per workspace.
   *
   * @param {string} feature
   * @param {(win: Window) => NirvaCommand[]} provider
   */
  registerProvider(feature, provider) {
    this._providers.set(feature, provider);
  },

  titleOf(command) {
    if (command.l10nId) {
      return (
        lazy.l10n.formatValueSync(command.l10nId, command.l10nArgs) ??
        command.l10nId
      );
    }
    return command.title;
  },

  /**
   * Every command that can run in a window right now.
   *
   * @param {Window} win
   * @returns {NirvaCommand[]}
   */
  all(win) {
    const commands = [...this._commands.values()];
    for (const [feature, provider] of this._providers) {
      try {
        commands.push(...provider(win).map(c => ({ feature, ...c })));
      } catch (e) {
        console.error(`Nirva: commands of ${feature} failed`, e);
      }
    }
    return commands.filter(c => {
      try {
        return !c.isAvailable || c.isAvailable(win);
      } catch (e) {
        return false;
      }
    });
  },

  get(id, win) {
    return this.all(win).find(c => c.id == id) ?? null;
  },

  /**
   * Runs a command by id.
   *
   * @param {string} id
   * @param {Window} win
   * @returns {boolean} false when there is no such command right now
   */
  run(id, win) {
    const command = this.get(id, win);
    if (!command) {
      return false;
    }
    command.run(win);
    return true;
  },

  /**
   * How well a text matches what was typed. 0 means not at all.
   *
   * @param {string} query lower case, trimmed
   * @param {string} text
   * @returns {number}
   */
  score(query, text) {
    const haystack = text.toLowerCase();
    if (!query) {
      return 1;
    }
    if (haystack.startsWith(query)) {
      return 4;
    }
    if (haystack.split(/[\s:/.\-_]+/).some(word => word.startsWith(query))) {
      return 3;
    }
    if (haystack.includes(query)) {
      return 2;
    }
    // Every typed word appears somewhere: "dark look" finds "Appearance: Dark".
    const words = query.split(/\s+/);
    if (words.length > 1 && words.every(word => haystack.includes(word))) {
      return 1;
    }
    return 0;
  },

  /**
   * @param {string} query
   * @param {Window} win
   * @returns {{command: NirvaCommand, title: string, score: number}[]} best first
   */
  search(query, win) {
    const needle = query.trim().toLowerCase();
    const found = [];
    for (const command of this.all(win)) {
      const title = this.titleOf(command);
      const score = Math.max(
        this.score(needle, title),
        command.keywords ? this.score(needle, command.keywords) - 0.5 : 0
      );
      if (score > 0) {
        found.push({ command, title, score });
      }
    }
    // A stable sort keeps registration order among equals.
    return found.sort((a, b) => b.score - a.score);
  },
};
