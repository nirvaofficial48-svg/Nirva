/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { MigrationUtils } from "moz-src:///browser/components/migration/MigrationUtils.sys.mjs";
import { MigratorBase } from "moz-src:///browser/components/migration/MigratorBase.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  PlacesUtils: "resource://gre/modules/PlacesUtils.sys.mjs",
});

// Where Firefox keeps its profiles.ini, by system and by how it was installed.
const PROFILE_ROOTS = {
  linux: [
    ["XDG_CONFIG_HOME", "mozilla", "firefox"],
    ["Home", ".config", "mozilla", "firefox"],
    ["Home", ".mozilla", "firefox"],
    ["Home", "snap", "firefox", "common", ".mozilla", "firefox"],
    ["Home", ".var", "app", "org.mozilla.firefox", ".mozilla", "firefox"],
    [
      "Home",
      ".var",
      "app",
      "org.mozilla.firefox",
      "config",
      "mozilla",
      "firefox",
    ],
  ],
  win: [["AppData", "Mozilla", "Firefox"]],
  macosx: [["ULibDir", "Application Support", "Firefox"]],
};
const ROOT_GUIDS = {
  toolbar_____: "toolbarGuid",
  menu________: "menuGuid",
  unfiled_____: "unfiledGuid",
};
const HISTORY_LIMIT = 20000;

function toDate(prTime) {
  return prTime ? new Date(Math.floor(prTime / 1000)) : new Date();
}

/**
 * Imports bookmarks and history from Mozilla Firefox while Nirva is running. Firefox's own
 * migrator for its profiles only copies whole files at the first start, so it cannot be
 * used once a profile is open, and it only sees this browser's own profiles.
 */
export class NirvaFirefoxMigrator extends MigratorBase {
  static get key() {
    return "nirva-firefox";
  }

  static get displayNameL10nID() {
    return "migration-wizard-migrator-display-name-firefox";
  }

  static get brandImage() {
    return "chrome://global/skin/icons/defaultFavicon.svg";
  }

  /** @returns {Promise<Array<{id: string, name: string}>>} Firefox profiles with history */
  async getSourceProfiles() {
    const found = new Map();
    const current = PathUtils.normalize(PathUtils.profileDir);
    for (const [base, ...parts] of PROFILE_ROOTS[AppConstants.platform] ?? []) {
      let root;
      if (base == "XDG_CONFIG_HOME") {
        const xdg = Services.env.get("XDG_CONFIG_HOME");
        if (xdg) {
          root = PathUtils.join(xdg, ...parts);
        } else {
          continue;
        }
      }
      try {
        root ??= PathUtils.join(
          Services.dirsvc.get(base, Ci.nsIFile).path,
          ...parts
        );
      } catch {
        continue;
      }
      const ini = PathUtils.join(root, "profiles.ini");
      if (!(await IOUtils.exists(ini))) {
        continue;
      }
      const parser = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
        .getService(Ci.nsIINIParserFactory)
        .createINIParser(await IOUtils.getFile(ini));
      for (const section of parser.getSections()) {
        if (!section.startsWith("Profile")) {
          continue;
        }
        let path;
        let name;
        try {
          path = parser.getString(section, "Path");
          name = parser.getString(section, "Name");
        } catch {
          continue;
        }
        let relative = "1";
        try {
          relative = parser.getString(section, "IsRelative");
        } catch {}
        const dir = PathUtils.normalize(
          relative == "1" ? PathUtils.join(root, ...path.split("/")) : path
        );
        if (
          dir != current &&
          !found.has(dir) &&
          (await IOUtils.exists(PathUtils.join(dir, "places.sqlite")))
        ) {
          found.set(dir, { id: dir, name });
        }
      }
    }
    return [...found.values()];
  }

  async getLastUsedDate() {
    let latest = new Date(0);
    for (const { id } of await this.getSourceProfiles()) {
      try {
        const { lastModified } = await IOUtils.stat(
          PathUtils.join(id, "places.sqlite")
        );
        latest = new Date(Math.max(latest, lastModified));
      } catch {}
    }
    return latest;
  }

  async getResources(profile) {
    const places = profile && PathUtils.join(profile.id, "places.sqlite");
    if (!places || !(await IOUtils.exists(places))) {
      return [];
    }
    return [this._bookmarks(places), this._history(places)];
  }

  _bookmarks(places) {
    return {
      type: MigrationUtils.resourceTypes.BOOKMARKS,
      async migrate(callback) {
        try {
          const rows = await MigrationUtils.getRowsFromDBWithoutLocks(
            places,
            "Firefox bookmarks",
            `SELECT b.id, b.type, b.parent, b.title, b.guid, b.dateAdded, p.url
             FROM moz_bookmarks b LEFT JOIN moz_places p ON b.fk = p.id
             ORDER BY b.parent, b.position`
          );
          const children = new Map();
          const byGuid = new Map();
          for (const row of rows) {
            const item = {
              id: row.getResultByName("id"),
              type: row.getResultByName("type"),
              parent: row.getResultByName("parent"),
              title: row.getResultByName("title") ?? "",
              guid: row.getResultByName("guid"),
              dateAdded: row.getResultByName("dateAdded"),
              url: row.getResultByName("url"),
            };
            byGuid.set(item.guid, item);
            if (!children.has(item.parent)) {
              children.set(item.parent, []);
            }
            children.get(item.parent).push(item);
          }
          const { bookmarks } = lazy.PlacesUtils;
          const tree = parentId =>
            (children.get(parentId) ?? []).flatMap(item => {
              if (item.type == bookmarks.TYPE_SEPARATOR) {
                return [{ type: bookmarks.TYPE_SEPARATOR }];
              }
              if (item.type == bookmarks.TYPE_FOLDER) {
                return [
                  {
                    type: bookmarks.TYPE_FOLDER,
                    title: item.title,
                    dateAdded: toDate(item.dateAdded),
                    children: tree(item.id),
                  },
                ];
              }
              if (!item.url || item.url.startsWith("place:")) {
                return [];
              }
              return [
                {
                  url: item.url,
                  title: item.title,
                  dateAdded: toDate(item.dateAdded),
                },
              ];
            });
          for (const [guid, target] of Object.entries(ROOT_GUIDS)) {
            const root = byGuid.get(guid);
            const items = root ? tree(root.id) : [];
            if (items.length) {
              await MigrationUtils.insertManyBookmarksWrapper(
                items,
                bookmarks[target]
              );
            }
          }
          callback(true);
        } catch (error) {
          console.error(error);
          callback(false);
        }
      },
    };
  }

  _history(places) {
    return {
      type: MigrationUtils.resourceTypes.HISTORY,
      async migrate(callback) {
        try {
          const since =
            (Date.now() - MigrationUtils.HISTORY_MAX_AGE_IN_MILLISECONDS) *
            1000;
          const rows = await MigrationUtils.getRowsFromDBWithoutLocks(
            places,
            "Firefox history",
            `SELECT p.url, p.title, v.visit_date
             FROM moz_historyvisits v JOIN moz_places p ON v.place_id = p.id
             WHERE p.hidden = 0 AND v.visit_date > ${since}
               AND substr(p.url, 1, 4) = 'http'
             ORDER BY v.visit_date DESC LIMIT ${HISTORY_LIMIT}`
          );
          const pages = new Map();
          for (const row of rows) {
            const url = row.getResultByName("url");
            if (!pages.has(url)) {
              pages.set(url, {
                url,
                title: row.getResultByName("title") ?? undefined,
                visits: [],
              });
            }
            pages.get(url).visits.push({
              date: toDate(row.getResultByName("visit_date")),
              transition: lazy.PlacesUtils.history.TRANSITIONS.LINK,
            });
          }
          if (pages.size) {
            await MigrationUtils.insertVisitsWrapper([...pages.values()]);
          }
          callback(true);
        } catch (error) {
          console.error(error);
          callback(false);
        }
      },
    };
  }
}
