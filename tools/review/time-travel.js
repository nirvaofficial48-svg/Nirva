const { NirvaTimeTravel } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs"
);
const { NirvaTimeTravelStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravelStore.sys.mjs"
);
const { SessionStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
);

await NirvaTimeTravel._sessionReady;
if (NirvaTimeTravel._startPromise) {
  await NirvaTimeTravel._startPromise;
}
await NirvaTimeTravelStore.clear();

const workspaces = [
  { id: "home", name: "Home" },
  { id: "research", name: "Research" },
  { id: "planning", name: "Planning" },
];
const tab = (url, workspaceId, groupId = null) => ({
  entries: [{ url }],
  index: 1,
  lastAccessed: Date.now(),
  extData: { "nirva-workspace": workspaceId },
  ...(groupId ? { groupId } : {}),
});
const windowState = (workspaceId, tabs, groups = []) => ({
  selected: 1,
  tabs,
  groups,
  extData: { "nirva-workspace": workspaceId },
  width: 1440,
  height: 900,
  sizemode: "normal",
});
const state = (windows, selectedWindow = 1) => ({
  version: JSON.parse(SessionStore.getBrowserState()).version,
  selectedWindow,
  maxSplitViewId: 0,
  windows,
});
const now = Date.now();

await NirvaTimeTravelStore.capture(
  state([
    windowState("home", [
      tab("https://developer.mozilla.org/en-US/docs/Web/JavaScript", "home"),
      tab("https://web.dev/learn/accessibility/", "home"),
      tab("https://support.mozilla.org/en-US/kb/firefox-workspaces", "home"),
    ]),
  ]),
  workspaces,
  "manual",
  now - 72 * 60 * 1000
);

await NirvaTimeTravelStore.capture(
  state([
    windowState(
      "research",
      [
        tab(
          "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
          "research",
          "reading"
        ),
        tab(
          "https://web.dev/articles/storage-for-the-web",
          "research",
          "reading"
        ),
        tab("https://www.w3.org/WAI/standards-guidelines/", "research"),
      ],
      [{ id: "reading", name: "Reading list", color: "blue" }]
    ),
    windowState("planning", [
      tab("https://developer.mozilla.org/en-US/docs/Mozilla/Firefox", "planning"),
      tab("https://support.mozilla.org/en-US/products/firefox", "planning"),
    ]),
  ]),
  workspaces,
  "periodic",
  now - 31 * 60 * 1000
);

await NirvaTimeTravelStore.capture(
  state([
    windowState(
      "research",
      [
        tab(
          "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API",
          "research",
          "reading"
        ),
        tab(
          "https://web.dev/articles/storage-for-the-web",
          "research",
          "reading"
        ),
        tab("https://www.w3.org/WAI/standards-guidelines/", "research"),
      ],
      [{ id: "reading", name: "Reading list", color: "blue" }]
    ),
    windowState("planning", [
      tab("https://developer.mozilla.org/en-US/docs/Mozilla/Firefox", "planning"),
      tab("https://support.mozilla.org/en-US/products/firefox", "planning"),
      tab("https://web.dev/learn/privacy/", "planning"),
    ]),
  ]),
  workspaces,
  "window-close",
  now - 4 * 60 * 1000
);

const timelineTab = gBrowser.addTrustedTab(
  "chrome://browser/content/nirva/timeline.html"
);
gBrowser.selectedTab = timelineTab;
const deadline = Date.now() + 15000;
while (Date.now() < deadline) {
  const page = timelineTab.linkedBrowser.contentDocument;
  if (
    page?.querySelector(".snapshot-row") &&
    page.querySelector(".restore-tab-button")
  ) {
    return;
  }
  await new Promise(resolve => setTimeout(resolve, 100));
}
throw new Error("Time Travel preview did not finish loading");
