/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, registerCleanupFunction, Services, TestUtils */

"use strict";

const { MigrationUtils } = ChromeUtils.importESModule(
  "moz-src:///browser/components/migration/MigrationUtils.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { Sqlite } = ChromeUtils.importESModule(
  "resource://gre/modules/Sqlite.sys.mjs"
);

const BOOKMARK = "https://example.com/fx-bookmark";
const IN_FOLDER = "https://example.org/fx-folder";
const VISITED = "https://example.net/fx-history";

// A Firefox profile folder as Firefox lays it out under the XDG config folder.
async function makeFirefox() {
  const home = PathUtils.join(PathUtils.tempDir, "nirva-firefox-import");
  await IOUtils.remove(home, { recursive: true, ignoreAbsent: true });
  const root = PathUtils.join(home, "mozilla", "firefox");
  const profile = PathUtils.join(root, "abcd1234.default-release");
  await IOUtils.makeDirectory(profile, { createAncestors: true });
  await IOUtils.writeUTF8(
    PathUtils.join(root, "profiles.ini"),
    "[Profile0]\nName=default-release\nIsRelative=1\nPath=abcd1234.default-release\n"
  );
  const db = await Sqlite.openConnection({
    path: PathUtils.join(profile, "places.sqlite"),
  });
  const now = Date.now() * 1000;
  await db.executeTransaction(async () => {
    await db.execute(
      "CREATE TABLE moz_places (id INTEGER PRIMARY KEY, url TEXT, title TEXT, hidden INTEGER DEFAULT 0)"
    );
    await db.execute(
      "CREATE TABLE moz_bookmarks (id INTEGER PRIMARY KEY, type INTEGER, fk INTEGER, parent INTEGER, position INTEGER, title TEXT, guid TEXT, dateAdded INTEGER)"
    );
    await db.execute(
      "CREATE TABLE moz_historyvisits (id INTEGER PRIMARY KEY, place_id INTEGER, visit_date INTEGER)"
    );
    for (const [id, url, title] of [
      [1, BOOKMARK, "Fx bookmark"],
      [2, IN_FOLDER, "Fx in folder"],
      [3, VISITED, "Fx visited"],
    ]) {
      await db.execute("INSERT INTO moz_places VALUES (?, ?, ?, 0)", [
        id,
        url,
        title,
      ]);
    }
    for (const row of [
      [1, 2, null, 0, 0, "", "root________"],
      [2, 2, null, 1, 0, "toolbar", "toolbar_____"],
      [3, 2, null, 1, 1, "menu", "menu________"],
      [4, 2, null, 1, 2, "unfiled", "unfiled_____"],
      [5, 1, 1, 2, 0, "Fx bookmark", "aaaaaaaaaaaa"],
      [6, 2, null, 3, 0, "Reading", "bbbbbbbbbbbb"],
      [7, 1, 2, 6, 0, "Fx in folder", "cccccccccccc"],
    ]) {
      await db.execute(
        "INSERT INTO moz_bookmarks VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [...row, now]
      );
    }
    await db.execute("INSERT INTO moz_historyvisits VALUES (1, 3, ?)", [
      now - 86400 * 1e6,
    ]);
  });
  await db.close();
  return home;
}

add_task(async function test_bookmarks_and_history_come_over_from_firefox() {
  const home = await makeFirefox();
  const previous = Services.env.get("XDG_CONFIG_HOME");
  Services.env.set("XDG_CONFIG_HOME", home);
  registerCleanupFunction(async () => {
    Services.env.set("XDG_CONFIG_HOME", previous);
    await PlacesUtils.bookmarks.eraseEverything();
    await PlacesUtils.history.clear();
    await IOUtils.remove(home, { recursive: true, ignoreAbsent: true });
  });

  const migrator = await MigrationUtils.getMigrator("nirva-firefox");
  Assert.ok(migrator, "Firefox is offered as a browser to import from");
  const profiles = await migrator.getSourceProfiles();
  const profile = profiles.find(p => p.name == "default-release");
  Assert.ok(profile, "its profile is found in the XDG config folder");

  const ended = TestUtils.topicObserved("Migration:Ended");
  await migrator.migrate(
    MigrationUtils.resourceTypes.BOOKMARKS |
      MigrationUtils.resourceTypes.HISTORY,
    false,
    profile
  );
  await ended;

  const bookmark = await PlacesUtils.bookmarks.fetch({ url: BOOKMARK });
  Assert.ok(bookmark, "the toolbar bookmark arrived");
  Assert.equal(
    bookmark.parentGuid,
    PlacesUtils.bookmarks.toolbarGuid,
    "on the toolbar"
  );
  const nested = await PlacesUtils.bookmarks.fetch({ url: IN_FOLDER });
  const folder = await PlacesUtils.bookmarks.fetch(nested.parentGuid);
  Assert.equal(folder.title, "Reading", "folders keep their contents");
  Assert.equal(
    folder.parentGuid,
    PlacesUtils.bookmarks.menuGuid,
    "in the bookmarks menu"
  );
  Assert.ok(
    await PlacesUtils.history.hasVisits(VISITED),
    "visited pages are in history"
  );
});
