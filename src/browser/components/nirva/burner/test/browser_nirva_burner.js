/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, content, getRootDirectory, gBrowser, gTestPath, gURLBar, IOUtils, registerCleanupFunction, Services, SpecialPowers, TestUtils, window */

"use strict";

const { NirvaBurner } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs"
);
const { sanitizeSessionState } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravelStore.sys.mjs"
);
const { ContextualIdentityService } = ChromeUtils.importESModule(
  "moz-src:///toolkit/components/contextualidentity/ContextualIdentityService.sys.mjs"
);
const { PlacesUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PlacesUtils.sys.mjs"
);
const { SessionStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionStore.sys.mjs"
);

const { SessionSaver } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionSaver.sys.mjs"
);
const { SessionFile } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/SessionFile.sys.mjs"
);

const { TabStateFlusher } = ChromeUtils.importESModule(
  "moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs"
);

const TEST_PAGE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}page.html`;
const ABOUT_URL = "chrome://browser/content/nirva/burner.html";

registerCleanupFunction(() => {
  NirvaBurner.closeAll();
  Services.prefs.clearUserPref("nirva.burner.enabled");
});

function burnerCookies(userContextId) {
  return Services.cookies
    .getCookiesWithOriginAttributes(JSON.stringify({ userContextId }))
    .filter(cookie => cookie.name == "burn");
}

async function visit(tab, url) {
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, url);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, url);
}

function storeSomething(browser) {
  return SpecialPowers.spawn(browser, [], () => {
    content.document.cookie = "burn=1; max-age=3600; Secure";
    content.localStorage.setItem("burn", "1");
  });
}

add_task(async function test_burner_is_isolated_and_erased_on_close() {
  const tab = NirvaBurner.open(window);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, ABOUT_URL);
  const id = tab.userContextId;
  Assert.greater(id, 0, "a burner tab has its own container");
  Assert.ok(tab.hasAttribute("nirva-burner"), "the tab is marked as a burner");
  const explainer = tab.linkedBrowser.contentDocument;
  Assert.ok(
    explainer.querySelector(".privacy-note"),
    "a new burner opens on the page that explains its limits"
  );
  Assert.ok(
    !explainer.querySelector("#intro-inside").hidden &&
      explainer.querySelector("#open-burner").hidden,
    "the page knows it is inside a burner"
  );
  const chip = document.getElementById("nirva-burner-chip");
  Assert.ok(!chip.hidden, "the address bar says this is a burner tab");
  Assert.ok(
    !BrowserTestUtils.isVisible(document.getElementById("userContext-icons")),
    "the browser's own container badge does not repeat the marker"
  );
  Assert.equal(gURLBar.value, "", "the address bar is ready for an address");
  Assert.ok(
    ContextualIdentityService.getPublicIdentityFromId(id),
    "the container exists while the burner is open"
  );

  const recorded = `${TEST_PAGE}?ordinary-visit`;
  const unrecorded = `${TEST_PAGE}?burner-visit`;
  await BrowserTestUtils.withNewTab(recorded, async browser => {
    await TestUtils.waitForCondition(
      () => PlacesUtils.history.hasVisits(recorded),
      "an ordinary tab's visit is added to history"
    );
    await storeSomething(browser);
  });
  Assert.equal(burnerCookies(0).length, 1, "the ordinary tab has its cookie");
  // Let the switch back to the burner tab finish before it changes process.
  await TestUtils.waitForCondition(
    () => !gBrowser._switcher,
    "the tab switch has settled"
  );

  await visit(tab, unrecorded);
  Assert.equal(
    burnerCookies(id).length,
    0,
    "the burner cannot see cookies from ordinary tabs"
  );
  await storeSomething(tab.linkedBrowser);
  Assert.equal(burnerCookies(id).length, 1, "the burner keeps its own cookie");

  // A link opened from the burner stays in the same burner.
  const sibling = gBrowser.addTab(`${TEST_PAGE}?burner-sibling`, {
    userContextId: id,
    triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
  });
  await BrowserTestUtils.browserLoaded(sibling.linkedBrowser);
  Assert.ok(
    sibling.hasAttribute("nirva-burner"),
    "its sibling is a burner too"
  );
  Assert.ok(
    !(await PlacesUtils.history.hasVisits(`${TEST_PAGE}?burner-sibling`)),
    "pages in the sibling tab are not added to history either"
  );

  BrowserTestUtils.removeTab(tab);
  await TestUtils.waitForTick();
  Assert.equal(
    burnerCookies(id).length,
    1,
    "data stays while another tab of the burner is open"
  );
  gBrowser.selectedTab = gBrowser.tabs[0];
  Assert.ok(chip.hidden, "ordinary tabs do not carry the burner marker");

  const wiped = TestUtils.topicObserved("nirva-burner-wiped");
  BrowserTestUtils.removeTab(sibling);
  await wiped;
  Assert.equal(
    burnerCookies(id).length,
    0,
    "closing the last tab erases cookies"
  );
  Assert.ok(
    !ContextualIdentityService.getPublicIdentityFromId(id),
    "the container is removed"
  );
  Assert.equal(burnerCookies(0).length, 1, "ordinary cookies are untouched");

  // Wait for a later ordinary close to be recorded, then check no burner tab is listed.
  const marker = `${TEST_PAGE}?closed-marker`;
  const ordinary = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    marker
  );
  BrowserTestUtils.removeTab(ordinary);
  await TestUtils.waitForCondition(
    () =>
      SessionStore.getClosedTabDataForWindow(window).some(closed =>
        closed.state.entries?.some(entry => entry.url == marker)
      ),
    "the later ordinary tab is listed as recently closed"
  );
  Assert.ok(
    !SessionStore.getClosedTabDataForWindow(window).some(
      closed => closed.state.userContextId == id
    ),
    "burner tabs cannot be reopened from recently closed tabs"
  );
  Assert.ok(
    !(await PlacesUtils.history.hasVisits(unrecorded)),
    "pages visited in a burner are not added to history"
  );
  Services.cookies.removeAll();
});

add_task(async function test_reopen_and_boundaries() {
  const original = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    TEST_PAGE
  );
  Assert.ok(NirvaBurner.canReopen(window), "a web page can move to a burner");
  const closed = BrowserTestUtils.waitForTabClosing(original);
  const burner = NirvaBurner.reopen(window);
  await closed;
  await BrowserTestUtils.browserLoaded(burner.linkedBrowser, false, TEST_PAGE);
  Assert.equal(gBrowser.selectedTab, burner, "the burner tab is in front");
  Assert.ok(burner.hasAttribute("nirva-burner"), "it is a burner");
  Assert.ok(!NirvaBurner.canReopen(window), "a burner is not offered again");
  const wiped = TestUtils.topicObserved("nirva-burner-wiped");
  BrowserTestUtils.removeTab(burner);
  await wiped;

  const cleaned = JSON.stringify(
    sanitizeSessionState({
      windows: [
        {
          tabs: [
            {
              entries: [
                { url: "https://example.org/keep-this", title: "Keep" },
              ],
              index: 1,
            },
            {
              entries: [
                { url: "https://example.org/burn-this", title: "Burn" },
              ],
              index: 1,
              extData: { "nirva-burner": "1" },
            },
          ],
          selected: 1,
        },
      ],
      selectedWindow: 1,
    })
  );
  Assert.ok(cleaned.includes("keep-this"), "ordinary tabs stay in a timeline");
  Assert.ok(
    !cleaned.includes("burn-this"),
    "burner tabs never enter a timeline"
  );

  Services.prefs.setBoolPref("nirva.burner.enabled", false);
  Assert.equal(NirvaBurner.open(window), null, "the switch turns burners off");
  Services.prefs.setBoolPref("nirva.burner.enabled", true);

  const privateWindow = await BrowserTestUtils.openNewBrowserWindow({
    private: true,
  });
  try {
    Assert.ok(
      !NirvaBurner.canOpen(privateWindow),
      "private windows already discard their data and have no burners"
    );
  } finally {
    await BrowserTestUtils.closeWindow(privateWindow);
  }
});

add_task(async function test_closing_a_window_erases_its_burners() {
  const other = await BrowserTestUtils.openNewBrowserWindow();
  const kept = `${TEST_PAGE}?kept-in-window`;
  const burned = `${TEST_PAGE}?burned-with-window`;
  await BrowserTestUtils.openNewForegroundTab(other.gBrowser, kept);
  const tab = NirvaBurner.open(other, burned);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, burned);
  const id = tab.userContextId;
  await storeSomething(tab.linkedBrowser);
  Assert.equal(burnerCookies(id).length, 1, "the burner has a cookie");

  await TabStateFlusher.flushWindow(other);
  await SessionSaver.run();
  const saved = JSON.stringify(
    await IOUtils.readJSON(SessionFile.Paths.recovery, { decompress: true })
  );
  Assert.ok(
    saved.includes("kept-in-window"),
    "ordinary tabs are in the session file"
  );
  Assert.ok(
    !saved.includes("burned-with-window"),
    "an open burner tab is never written to the session file"
  );

  const wiped = TestUtils.topicObserved("nirva-burner-wiped");
  await BrowserTestUtils.closeWindow(other);
  await wiped;
  Assert.equal(burnerCookies(id).length, 0, "closing the window erases it");
  await SessionSaver.run();
  const record = JSON.stringify(SessionStore.getClosedWindowData());
  Assert.ok(record.includes("kept-in-window"), "the window can be reopened");
  Assert.ok(
    !record.includes("burned-with-window"),
    "the reopened window will not contain the burner tab"
  );
  while (SessionStore.getClosedWindowCount()) {
    SessionStore.forgetClosedWindow(0);
  }
});

add_task(async function test_leftovers_and_command_bar() {
  const tab = NirvaBurner.open(window);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, ABOUT_URL);
  Assert.deepEqual(
    JSON.parse(Services.prefs.getStringPref("nirva.burner.containers")),
    [tab.userContextId],
    "open burners are written down so a crash cannot leave their data behind"
  );
  const { NirvaCommands } = ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
  );
  const closeAll = NirvaCommands.all(window).find(
    command => command.id == "burner-close-all"
  );
  NirvaCommands.all(window)
    .find(command => command.id == "burner-about")
    .run(window);
  const about = gBrowser.selectedTab;
  await BrowserTestUtils.browserLoaded(about.linkedBrowser, false, ABOUT_URL);
  const page = about.linkedBrowser.contentDocument;
  Assert.ok(
    !page.querySelector("#intro-outside").hidden &&
      !page.querySelector("#open-burner").hidden,
    "opened from an ordinary tab, the page offers to open a burner"
  );
  Assert.equal(gURLBar.value, "", "the page's own address is not shown");
  Assert.equal(
    document.getElementById("nirva-island-address").textContent,
    "",
    "nor is it shown in the island at rest"
  );
  BrowserTestUtils.removeTab(about);
  Assert.ok(closeAll, "the command bar offers to close every burner");
  const wiped = TestUtils.topicObserved("nirva-burner-wiped");
  closeAll.run(window);
  await wiped;
  Assert.ok(!tab.isConnected, "the command closes the burner tab");
  Assert.ok(
    !Services.prefs.prefHasUserValue("nirva.burner.containers"),
    "nothing is left to erase at the next start"
  );
});
