/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, IOUtils, PathUtils, registerCleanupFunction, Services, SessionStore, TestUtils */

"use strict";

const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { NirvaWorkspaces } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
);
const { NirvaTimeTravel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs"
);
const {
  NirvaTimeTravelStore,
  NirvaTimeTravelStoreClass,
  sanitizeSessionState,
} = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravelStore.sys.mjs"
);

const WORKSPACE_PREF = "nirva.workspaces.list";
const RETENTION_PREF = "nirva.timetravel.retentionDays";
const STORAGE_PREF = "nirva.timetravel.storageLimitMB";
const TIMETRAVEL_URL = "chrome://browser/content/nirva/timeline.html";
const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "http://mochi.test:8888"
)}page.html`;
const hadWorkspacePref = Services.prefs.prefHasUserValue(WORKSPACE_PREF);
const originalWorkspacePref = Services.prefs.getStringPref(WORKSPACE_PREF, "");
const initialWindowState = SessionStore.getWindowState(window);

registerCleanupFunction(async () => {
  Services.prefs.setBoolPref("nirva.timetravel.enabled", false);
  await NirvaTimeTravel.clearSnapshots();
  if (hadWorkspacePref) {
    Services.prefs.setStringPref(WORKSPACE_PREF, originalWorkspacePref);
  } else {
    Services.prefs.clearUserPref(WORKSPACE_PREF);
  }
  for (const win of [...Services.wm.getEnumerator("navigator:browser")]) {
    if (win != window) {
      await BrowserTestUtils.closeWindow(win);
    }
  }
  const restored = BrowserTestUtils.waitForEvent(window, "SSWindowRestored");
  SessionStore.setWindowState(window, initialWindowState, true);
  await restored;
  Services.prefs.clearUserPref(RETENTION_PREF);
  Services.prefs.clearUserPref(STORAGE_PREF);
});

function stateURLs(state) {
  return state.windows.flatMap(win =>
    win.tabs.flatMap(tab => tab.entries.map(entry => entry.url))
  );
}

add_task(async function test_sanitizer_keeps_restorable_context_only() {
  const clean = sanitizeSessionState({
    version: ["sessionrestore", 1],
    selectedWindow: 4,
    cookies: [{ name: "sid", value: "private-cookie" }],
    global: { private: "state" },
    windows: [
      {
        isPrivate: true,
        tabs: [{ entries: [{ url: "https://private.test" }] }],
      },
      { isAIWindow: true, tabs: [{ entries: [{ url: "https://ai.test" }] }] },
      { isPopup: true, tabs: [{ entries: [{ url: "https://popup.test" }] }] },
      {
        title: "Sensitive selected page title",
        cookies: [{ name: "auth", value: "private-window-cookie" }],
        args: { "web-extension-popup-window": true },
        extData: {
          "nirva-workspace": "work",
          extensionPrivateValue: "private-extension-data",
        },
        selected: 2,
        tabs: [
          {
            index: 1,
            entries: [
              { url: "file:///private/document.pdf", title: "Private file" },
            ],
          },
          {
            index: 2,
            lastAccessed: 100,
            entries: [
              {
                url: "https://safe.example/research?keep=1&access_token=private&api_key=secret#token=hidden",
                title: "Sensitive page title",
                hasUserInteraction: true,
                triggeringPrincipal_base64: "principal",
                formdata: { id: "private-value", value: "private-form-value" },
                storage: {
                  "https://safe.example": { token: "private-storage" },
                },
                structuredCloneState: "private-page-state",
              },
            ],
            pinned: true,
            groupId: "group-a",
            splitViewId: 3,
            userContextId: 2,
            attributes: { usercontextid: "2", privateExtension: "data" },
            extData: {
              "nirva-workspace": "work",
              privateExtension: "private-tab-data",
            },
            userTypedValue: "private-address-bar-value",
          },
          {
            entries: [
              {
                url: "https://fragment.example/#/callback?refresh_token=fragment-secret",
                title: "Fragment secret",
              },
            ],
            index: 1,
          },
        ],
        groups: [
          {
            id: "group-a",
            name: "Reading",
            color: "blue",
            collapsed: false,
            saveOnWindowClose: true,
          },
        ],
        splitViews: [{ id: 3, numberOfTabs: 1 }],
      },
    ],
  });

  Assert.equal(
    clean.windows.length,
    1,
    "private, AI, and popup windows are excluded"
  );
  Assert.equal(
    clean.selectedWindow,
    1,
    "the selected window index is remapped"
  );
  Assert.equal(
    clean.windows[0].selected,
    1,
    "the selected tab index is remapped"
  );
  Assert.equal(
    clean.windows[0].tabs[0].entries[0].url,
    "https://safe.example/research?keep=1",
    "sensitive URL parameters and fragments are removed"
  );
  Assert.equal(
    clean.windows[0].tabs[1].entries[0].url,
    "https://fragment.example/",
    "sensitive values in query-style URL fragments are removed"
  );
  Assert.equal(
    clean.windows[0].tabs[0].entries[0].title,
    "safe.example",
    "page titles are replaced with the host"
  );
  Assert.equal(
    clean.windows[0].tabs[0].groupId,
    "group-a",
    "tab groups are retained"
  );
  Assert.equal(
    clean.windows[0].tabs[0].splitViewId,
    3,
    "split view context is retained"
  );
  Assert.deepEqual(
    clean.windows[0].tabs[0].extData,
    { "nirva-workspace": "work" },
    "only the Nirva workspace custom value is retained"
  );
  const serialized = JSON.stringify(clean);
  for (const privateValue of [
    "private-cookie",
    "private-window-cookie",
    "private-extension-data",
    "private-form-value",
    "private-storage",
    "private-page-state",
    "private-address-bar-value",
    "Sensitive page title",
  ]) {
    Assert.ok(
      !serialized.includes(privateValue),
      `${privateValue} is excluded`
    );
  }
  Assert.ok(!("cookies" in clean), "session cookies are excluded");
  Assert.ok(
    !("args" in clean.windows[0]),
    "window creation arguments are excluded"
  );
});

add_task(
  async function test_store_compresses_deduplicates_and_applies_retention() {
    const directory = await IOUtils.createUniqueDirectory(
      PathUtils.tempDir,
      "nirva-time-travel-test"
    );
    const path = PathUtils.join(directory, "timeline.jsonlz4");
    const store = new NirvaTimeTravelStoreClass(path);
    registerCleanupFunction(() =>
      IOUtils.remove(directory, { recursive: true })
    );

    const sourceState = JSON.parse(SessionStore.getBrowserState());
    const first = await store.capture(sourceState, [], "manual", Date.now());
    Assert.ok(first, "a safe session is saved");
    const blobCount = Object.keys(store._file.data.blobs).length;
    const second = await store.capture(
      sourceState,
      [],
      "manual",
      Date.now() + 1000
    );
    Assert.ok(second, "the same session can be checkpointed again");
    Assert.equal(
      Object.keys(store._file.data.blobs).length,
      blobCount,
      "identical tab and window data is deduplicated"
    );

    const reloaded = new NirvaTimeTravelStoreClass(path);
    const saved = await reloaded.read(first.id);
    Assert.ok(
      saved.state.windows.length,
      "the compressed store reloads and expands its snapshot"
    );
    Assert.ok(
      (await IOUtils.stat(path)).size > 0,
      "the snapshot file is written to disk"
    );

    Services.prefs.setIntPref(RETENTION_PREF, 7);
    await store.capture(sourceState, [], "manual", Date.now() - 8 * 86400000);
    Assert.equal(
      (await store.list()).length,
      2,
      "snapshots older than retention are pruned"
    );
    Assert.ok(await store.delete(first.id), "one snapshot can be deleted");
    Assert.equal(
      (await store.list()).length,
      1,
      "deletion leaves the remaining snapshot"
    );
    await store.clear();
    Assert.equal((await store.list()).length, 0, "the store can be cleared");
  }
);

add_task(async function test_command_opens_the_interactive_timeline() {
  const command = NirvaCommands.get("time-travel", window);
  Assert.ok(command, "the Time Travel command is registered");
  Assert.equal(
    command.feature,
    "time-travel",
    "the command belongs to this feature"
  );
  NirvaCommands.run("time-travel", window);

  await TestUtils.waitForCondition(
    () => gBrowser.selectedBrowser.currentURI.spec == TIMETRAVEL_URL,
    "the command opens the timeline"
  );
  const browser = gBrowser.selectedBrowser;
  await TestUtils.waitForCondition(
    () =>
      browser.contentDocument?.querySelector("h1")?.textContent ==
      "Time Travel",
    "the timeline loads its localized controls"
  );
  Assert.ok(
    browser.contentDocument.getElementById("snapshot-list"),
    "the timeline is interactive"
  );
  Assert.ok(
    browser.contentDocument.getElementById("storage-progress"),
    "storage use is shown"
  );
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_restore_one_tab_preserves_context_and_safety() {
  await NirvaTimeTravel.clearSnapshots();
  const archivedTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${TEST_PAGE}?scene=single-tab-target&access_token=filtered`
  );
  const workspaceId = NirvaWorkspaces.create("Single tab restore");
  NirvaWorkspaces.assign(archivedTab, workspaceId);
  gBrowser.addTabGroup([archivedTab], {
    label: "Saved reading",
    color: "blue",
  });
  const target = await NirvaTimeTravel.captureNow("manual", null, true);
  const snapshot = await NirvaTimeTravelStore.read(target.id);
  const targetWindowIndex = snapshot.state.windows.findIndex(win =>
    win.tabs.some(tab =>
      tab.entries.some(entry => entry.url.includes("scene=single-tab-target"))
    )
  );
  const targetWindow = snapshot.state.windows[targetWindowIndex];
  const targetTabIndex = targetWindow.tabs.findIndex(tab =>
    tab.entries.some(entry => entry.url.includes("scene=single-tab-target"))
  );
  Assert.ok(
    targetWindowIndex >= 0,
    "the saved tab has a window in the snapshot"
  );
  Assert.ok(targetTabIndex >= 0, "the saved tab is available to restore");

  await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    `${TEST_PAGE}?scene=current-before-single-restore`
  );
  const timelineTab = NirvaTimeTravel.openTimeline(window);
  const timelineBrowser = timelineTab.linkedBrowser;
  await TestUtils.waitForCondition(
    () => timelineBrowser.currentURI.spec == TIMETRAVEL_URL,
    "the timeline opens for the saved session"
  );
  await TestUtils.waitForCondition(
    () =>
      timelineBrowser.contentDocument.querySelector("h1")?.textContent ==
      "Time Travel",
    "the timeline interface is ready"
  );
  Assert.ok(
    timelineBrowser.contentDocument
      .getElementById("storage-value")
      .textContent.includes("<0.1 MB"),
    "small but nonempty snapshots are visible in the storage total"
  );
  await TestUtils.waitForCondition(
    () =>
      [
        ...timelineBrowser.contentDocument.querySelectorAll(
          ".restore-tab-button"
        ),
      ].some(
        button =>
          button.dataset.windowIndex == targetWindowIndex &&
          button.dataset.tabIndex == targetTabIndex
      ),
    "the preview offers a restore action for the saved tab"
  );
  const restoreTabButton = [
    ...timelineBrowser.contentDocument.querySelectorAll(".restore-tab-button"),
  ].find(
    button =>
      button.dataset.windowIndex == targetWindowIndex &&
      button.dataset.tabIndex == targetTabIndex
  );
  restoreTabButton.click();
  await TestUtils.waitForCondition(
    () => timelineBrowser.contentDocument.getElementById("confirm-dialog").open,
    "restoring a tab asks before changing the session"
  );
  timelineBrowser.contentDocument.getElementById("confirm-action").click();
  await TestUtils.waitForCondition(
    () =>
      gBrowser.selectedBrowser.currentURI.spec.includes(
        "scene=single-tab-target"
      ),
    "the tab restore action opens the saved page"
  );
  const safetySnapshot = (await NirvaTimeTravelStore.list()).find(
    item => item.reason == "before-restore"
  );
  const safetyState = await NirvaTimeTravelStore.read(safetySnapshot.id);
  Assert.ok(
    stateURLs(safetyState.state).some(url =>
      url.includes("scene=current-before-single-restore")
    ),
    "restoring one tab first saves the current session"
  );
  const restoredTab = gBrowser.selectedTab;
  await TestUtils.waitForCondition(
    () => restoredTab.group?.label == "Saved reading",
    "the restored tab is returned to its saved group"
  );
  Assert.ok(
    !restoredTab.linkedBrowser.currentURI.spec.includes("access_token"),
    "sensitive URL parameters are not restored"
  );
  Assert.equal(
    NirvaWorkspaces.workspaceOf(restoredTab),
    workspaceId,
    "the tab returns to its saved workspace"
  );
  Assert.equal(
    restoredTab.group?.label,
    "Saved reading",
    "the tab returns to its saved group"
  );
  BrowserTestUtils.removeTab(timelineTab);
});

add_task(
  async function test_restore_reopens_windows_tabs_and_workspaces_safely() {
    await NirvaTimeTravel.clearSnapshots();
    const firstUrl = `${TEST_PAGE}?scene=archive&access_token=do-not-restore`;
    const firstTab = await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      firstUrl
    );
    const workspaceId = NirvaWorkspaces.create("Time Travel");
    NirvaWorkspaces.assign(firstTab, workspaceId);

    const secondWindow = await BrowserTestUtils.openNewBrowserWindow();
    await BrowserTestUtils.openNewForegroundTab(
      secondWindow.gBrowser,
      `${TEST_PAGE}?scene=second-window`
    );
    const target = await NirvaTimeTravel.captureNow("manual", null, true);
    Assert.ok(target, "the two-window session is saved");
    const savedTarget = await NirvaTimeTravelStore.read(target.id);
    const targetURLs = stateURLs(savedTarget.state);
    Assert.ok(
      targetURLs.some(
        url => url.includes("scene=archive") && !url.includes("access_token")
      ),
      "the saved page keeps its useful address and strips its session token"
    );
    Assert.ok(
      targetURLs.some(url => url.includes("scene=second-window")),
      "the second window is included"
    );

    await BrowserTestUtils.closeWindow(secondWindow);
    await BrowserTestUtils.openNewForegroundTab(
      gBrowser,
      `${TEST_PAGE}?scene=current-session`
    );
    const safety = await NirvaTimeTravel.restoreSnapshot(target.id);
    Assert.ok(safety?.id, "restore first saves a safety snapshot");
    const safetyState = await NirvaTimeTravelStore.read(safety.id);
    Assert.ok(
      stateURLs(safetyState.state).some(url =>
        url.includes("scene=current-session")
      ),
      "the safety snapshot contains work from immediately before restore"
    );

    await TestUtils.waitForCondition(
      () =>
        [...Services.wm.getEnumerator("navigator:browser")].filter(
          win => !win.closed && win.gBrowser
        ).length == 2,
      "restore recreates the second regular browser window"
    );
    const restoredWindows = [
      ...Services.wm.getEnumerator("navigator:browser"),
    ].filter(win => !win.closed && win.gBrowser);
    const restoredState = JSON.parse(SessionStore.getBrowserState());
    const restoredURLs = stateURLs(restoredState);
    Assert.ok(
      restoredURLs.some(url => url.includes("scene=archive")),
      "the original tab is restored"
    );
    Assert.ok(
      restoredURLs.some(url => url.includes("scene=second-window")),
      "the second window's tab is restored"
    );
    Assert.ok(
      restoredURLs.every(url => !url.includes("access_token")),
      "restored session state contains no filtered access token"
    );
    const restoredWorkspaceTab = restoredWindows
      .flatMap(win => win.gBrowser.tabs)
      .find(
        tab =>
          SessionStore.getCustomTabValue(tab, "nirva-workspace") == workspaceId
      );
    Assert.ok(
      restoredWorkspaceTab,
      "the original tab returns to its Nirva workspace"
    );
    Assert.equal(
      NirvaWorkspaces.workspaceOf(restoredWorkspaceTab),
      workspaceId,
      "the workspace assignment is live after restore"
    );
    Assert.ok(
      (await NirvaTimeTravelStore.list()).some(
        snapshot => snapshot.id == safety.id
      ),
      "the safety snapshot remains available in the timeline"
    );
  }
);

add_task(async function test_find_a_session_by_site_and_pick_a_day() {
  await NirvaTimeTravel.clearSnapshots();
  const siteTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_PAGE
  );
  const timelineTab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TIMETRAVEL_URL
  );
  const doc = () => timelineTab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc()?.querySelector("h1")?.textContent == "Time Travel",
    "the timeline loads"
  );
  Assert.ok(
    !doc().getElementById("memory-settings").open,
    "settings are folded away below the timeline"
  );

  // "Save a snapshot now" saves this moment and shows it under Today.
  doc().getElementById("save-now").click();
  await TestUtils.waitForCondition(
    () => doc().querySelectorAll("#snapshot-list .snapshot-row").length == 1,
    "the saved moment is listed"
  );
  const chip = doc().querySelector("#day-strip .day-chip");
  Assert.equal(chip.getAttribute("aria-pressed"), "true", "today is chosen");
  await TestUtils.waitForCondition(
    () => chip.textContent.startsWith("Today"),
    "the day is named"
  );

  // Searching by a site finds the session that had it open.
  const find = doc().getElementById("find");
  find.value = "mochi.test";
  find.dispatchEvent(
    new timelineTab.linkedBrowser.contentWindow.Event("input")
  );
  await TestUtils.waitForCondition(
    () => doc().querySelector("#snapshot-list .snapshot-match")?.textContent,
    "the match is shown"
  );
  Assert.equal(
    doc().querySelector(".snapshot-match").textContent,
    "Had mochi.test open",
    "the row says which site matched"
  );
  Assert.equal(
    chip.getAttribute("aria-pressed"),
    "false",
    "no day while searching"
  );

  find.value = "nothing-like-this";
  find.dispatchEvent(
    new timelineTab.linkedBrowser.contentWindow.Event("input")
  );
  await TestUtils.waitForCondition(
    () => !doc().getElementById("empty-state").hidden,
    "no match says so"
  );
  Assert.equal(doc().querySelectorAll(".snapshot-row").length, 0, "no rows");

  // Choosing a day ends the search and lists that day again.
  chip.click();
  await TestUtils.waitForCondition(
    () => doc().querySelectorAll(".snapshot-row").length == 1,
    "the day's sessions are back"
  );
  Assert.equal(find.value, "", "the search is cleared");

  const found = await NirvaTimeTravel.findSnapshots("MOCHI.TEST");
  Assert.equal(found.length, 1, "search ignores case");
  Assert.equal(found[0].site, "mochi.test", "and reports the site");

  BrowserTestUtils.removeTab(timelineTab);
  BrowserTestUtils.removeTab(siteTab);
  await NirvaTimeTravel.clearSnapshots();
});
