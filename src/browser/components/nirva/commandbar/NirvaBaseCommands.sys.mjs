/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

/**
 * Runs one of Firefox's own commands, the same ones its menus and shortcuts use.
 *
 * @param {string} id the id of a <command> in the browser window
 */
const firefox = id => win => win.document.getElementById(id)?.doCommand();
const has = id => win => !!win.document.getElementById(id);

/** Everyday browser actions and privacy pages, so nothing depends on a toolbar button. */
export const NirvaBaseCommands = {
  _registered: false,

  init() {
    if (this._registered) {
      return;
    }
    this._registered = true;
    const basic = (id, commandId, keywords = "") => ({
      id,
      feature: "browser",
      l10nId: `nirva-command-${id}`,
      keywords,
      run: firefox(commandId),
      isAvailable: has(commandId),
    });
    NirvaCommands.registerAll([
      basic("new-tab", "cmd_newNavigatorTab", "open add"),
      basic("new-window", "cmd_newNavigator", "open"),
      basic("new-private-window", "Tools:PrivateBrowsing", "incognito"),
      basic("close-tab", "cmd_close"),
      basic("reopen-tab", "History:UndoCloseTab", "undo restore"),
      basic("reload", "Browser:Reload", "refresh"),
      basic("find", "cmd_find", "search text"),
      basic("print", "cmd_print", "pdf"),
      basic("bookmark-page", "Browser:AddBookmarkAs", "star save"),
      basic("reader-view", "View:ReaderView", "read article"),
      basic("full-screen", "View:FullScreen", "fullscreen"),
      basic("zoom-in", "cmd_fullZoomEnlarge", "bigger larger"),
      basic("zoom-out", "cmd_fullZoomReduce", "smaller"),
      basic("zoom-reset", "cmd_fullZoomReset", "actual size 100"),
      basic("mute-tab", "cmd_toggleMute", "sound audio silence"),
      basic("downloads", "Tools:Downloads", "files"),
      basic("extensions", "Tools:Addons", "add-ons addons themes plugins"),
      {
        id: "history",
        feature: "browser",
        l10nId: "nirva-command-history",
        keywords: "visited past",
        run: win => win.PlacesCommandHook.showPlacesOrganizer("History"),
      },
      {
        id: "bookmarks",
        feature: "browser",
        l10nId: "nirva-command-bookmarks",
        keywords: "favourites favorites saved",
        run: win => win.PlacesCommandHook.showPlacesOrganizer("AllBookmarks"),
      },
      {
        id: "settings",
        feature: "browser",
        l10nId: "nirva-command-settings",
        keywords: "preferences options",
        run: win => win.openPreferences(),
      },
      {
        id: "menu",
        feature: "browser",
        l10nId: "nirva-command-menu",
        keywords: "application hamburger",
        run: win => win.PanelUI.show(),
      },
      {
        id: "about",
        feature: "browser",
        l10nId: "nirva-command-about",
        keywords: "version",
        run: win => win.openAboutDialog(),
      },
      {
        id: "privacy-settings",
        feature: "privacy",
        l10nId: "nirva-command-privacy-settings",
        keywords: "tracking protection cookies https telemetry",
        run: win => win.openPreferences("privacy"),
      },
      {
        id: "clear-data",
        feature: "privacy",
        l10nId: "nirva-command-clear-data",
        keywords: "delete history cookies cache forget",
        run: firefox("Tools:Sanitize"),
        isAvailable: has("Tools:Sanitize"),
      },
    ]);
  },
};
