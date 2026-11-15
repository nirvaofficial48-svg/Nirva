/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserCommands, BrowserTestUtils, content, getRootDirectory, gBrowser, gNotificationBox, gTestPath, gURLBar, registerCleanupFunction, Services, SpecialPowers, TestUtils, window */

"use strict";

const { NirvaHome, HOME_URL } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/home/NirvaHome.sys.mjs"
);
const { NirvaLooks } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const ARTICLE = `${getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
)}article.html`;

function reset() {
  NirvaHome.resetFocus();
  for (const pref of [
    "nirva.home.data",
    "nirva.home.reading",
    "nirva.look",
    "nirva.mode",
  ]) {
    Services.prefs.clearUserPref(pref);
  }
  gNotificationBox.removeAllNotifications(true);
}
registerCleanupFunction(reset);

async function openHome() {
  const loaded = BrowserTestUtils.waitForNewTab(gBrowser, HOME_URL, true);
  BrowserCommands.openTab();
  const tab = await loaded;
  const doc = tab.linkedBrowser.contentDocument;
  await TestUtils.waitForCondition(
    () => doc.querySelector("#clock").textContent,
    "the home screen has drawn"
  );
  return { tab, doc };
}

add_task(async function test_new_tabs_open_the_home_screen() {
  Assert.equal(window.BROWSER_NEW_TAB_URL, HOME_URL, "it is the new-tab page");
  Assert.equal(
    Services.prefs
      .getDefaultBranch("")
      .getStringPref("browser.startup.homepage"),
    HOME_URL,
    "and the start page"
  );
  const { tab, doc } = await openHome();
  Assert.equal(gURLBar.value, "", "the address bar is empty and ready");
  Assert.ok(
    /^\d\d:\d\d$/.test(doc.querySelector("#clock").textContent),
    "clock"
  );
  Assert.ok(doc.querySelector("#date").textContent.length > 5, "date");
  Assert.ok(
    !doc.documentElement.textContent.includes("[YOUR"),
    "no placeholder text from the drawings is shown"
  );
  Assert.ok(
    NirvaCommands.get("home-edit", window),
    "the command bar can open Edit home"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_widgets_keep_what_the_person_enters() {
  const { tab, doc } = await openHome();
  const $ = selector => doc.querySelector(selector);

  // To-do list
  Assert.ok(!$("#todo-add").hidden, "an empty list shows where to type");
  $("#todo-text").value = "Approve the toolbar design";
  $("#todo-add").requestSubmit();
  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("#todo .row").length == 1,
    "a typed task is listed"
  );
  $("#todo input[type=checkbox]").click();
  await TestUtils.waitForCondition(
    () => $("#todo .check")?.hasAttribute("data-done"),
    "ticking it marks it done"
  );
  Assert.ok(NirvaHome.data.todo[0].done, "and that is saved");
  $("#todo .remove").click();
  await TestUtils.waitForCondition(
    () => !doc.querySelectorAll("#todo .row").length,
    "a task can be removed"
  );

  // Countdown, set from Edit home
  Assert.ok(!$("#countdown-set").hidden, "with no date it offers to set one");
  $("#countdown-set").click();
  Assert.ok(!$("#editor").hidden, "which opens Edit home");
  const day = new Date(Date.now() + 18 * 24 * 60 * 60 * 1000);
  const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  NirvaHome.setCountdown("Launch day", iso);
  await TestUtils.waitForCondition(
    () => $("#countdown-days").textContent == "18",
    "the countdown shows the days left"
  );
  Assert.equal($("#countdown-title").textContent, "Launch day", "and its name");

  // Quick links
  Assert.ok(!NirvaHome.addLink("not a site"), "a bad address is refused");
  Assert.ok(NirvaHome.addLink("example.org", "Notes"), "a site is added");
  await TestUtils.waitForCondition(
    () => doc.querySelectorAll("#links .link").length == 1,
    "and appears as a quick link"
  );
  Assert.equal(NirvaHome.data.links[0].url, "https://example.org/", "as https");

  // Showing and hiding widgets, per look
  Assert.ok($('[data-widget="note"]').hidden, "Glass has no note by default");
  NirvaLooks.look = "paper";
  await TestUtils.waitForCondition(
    () =>
      !$('[data-widget="note"]').hidden && $('[data-widget="clips"]').hidden,
    "Paper shows its own set of widgets"
  );
  NirvaLooks.look = "cockpit";
  await TestUtils.waitForCondition(
    () =>
      $("#top-slot").contains($('[data-widget="focus"]')) &&
      !$('[data-widget="ribbon"]').hidden &&
      doc.querySelectorAll("#sessions .stop").length,
    "Cockpit puts focus beside the clock and shows the time travel line"
  );
  NirvaHome.setWidget("ribbon", false);
  await TestUtils.waitForCondition(
    () => $('[data-widget="ribbon"]').hidden,
    "Edit home can hide a widget"
  );
  BrowserTestUtils.removeTab(tab);
  reset();
});

add_task(async function test_focus_session_counts_down_and_locks_sites() {
  const { tab, doc } = await openHome();
  const $ = selector => doc.querySelector(selector);
  Assert.equal(
    $("#focus-time").textContent,
    "25:00",
    "a session is 25 minutes"
  );
  NirvaHome.setFocusSites("example.com\nnot a site");
  Assert.deepEqual(NirvaHome.data.focusSites, ["example.com"], "sites saved");
  $("#focus-toggle").click();
  Assert.ok(NirvaHome.focus.running, "Start begins the session");
  await TestUtils.waitForCondition(
    () => $("#focus-time").textContent != "25:00",
    "the time counts down"
  );
  Assert.ok(!$("#focus-locking").hidden, "it says sites are locked");

  const other = BrowserTestUtils.addTab(gBrowser, ARTICLE);
  await BrowserTestUtils.browserLoaded(other.linkedBrowser, false, HOME_URL);
  Assert.ok(
    gNotificationBox.getNotificationWithValue("nirva-home-focus-locked") ||
      (await TestUtils.waitForCondition(() =>
        gNotificationBox.getNotificationWithValue("nirva-home-focus-locked")
      )),
    "a locked site sends the tab home and says why"
  );
  BrowserTestUtils.removeTab(other);

  $("#focus-toggle").click();
  Assert.ok(!NirvaHome.focus.running, "Pause stops the clock");
  await TestUtils.waitForCondition(
    () => !$("#focus-reset").hidden,
    "a paused session can be reset"
  );
  $("#focus-reset").click();
  Assert.equal(NirvaHome.focus.remainingMs, NirvaHome.focus.totalMs, "reset");
  BrowserTestUtils.removeTab(tab);
  reset();
});

add_task(async function test_continue_reading_follows_real_reading() {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, ARTICLE);
  await SpecialPowers.spawn(tab.linkedBrowser, [], () => {
    content.scrollTo(0, content.document.documentElement.scrollHeight * 0.5);
  });
  // Leaving the page is what reports how far the person got.
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, "about:blank");
  await TestUtils.waitForCondition(
    () => NirvaHome.reading.length,
    "a long article left part-way is remembered"
  );
  const [item] = NirvaHome.reading;
  Assert.equal(item.url, ARTICLE, "by its address");
  Assert.ok(
    item.percent > 40 && item.percent < 80,
    `at about half (${item.percent}%)`
  );

  const browser = tab.linkedBrowser;
  Assert.ok(
    !NirvaHome.recordReading(browser, {
      url: "https://example.com/login?next=/",
      title: "Sign in",
      percent: 50,
    }),
    "sign-in pages are never kept"
  );
  Assert.ok(
    NirvaHome.recordReading(browser, { url: ARTICLE, title: "x", percent: 99 }),
    "finishing an article"
  );
  Assert.equal(NirvaHome.reading.length, 0, "takes it off the list");
  BrowserTestUtils.removeTab(tab);
  reset();
});

add_task(async function test_the_numbers_are_real() {
  const stats = await NirvaHome.stats();
  Assert.greater(stats.tabs, 0, "tabs are counted");
  Assert.greater(stats.memory, 50 * 1024 * 1024, "browser memory is measured");
  Assert.greater(stats.totalMemory, stats.memory, "against the computer's");
  const today = await NirvaHome.privacyToday();
  for (const key of [
    "trackers",
    "fingerprinters",
    "burnersWiped",
    "strictSites",
  ]) {
    Assert.ok(
      Number.isInteger(today[key]) && today[key] >= 0,
      `${key} is a count`
    );
  }
});

add_task(async function test_wallpapers_cover_the_page_and_paper_has_its_own() {
  const settings = wallpaper =>
    JSON.stringify({
      accents: { bright: null, dark: null },
      blur: null,
      roundness: null,
      density: "comfortable",
      uiFont: null,
      displayFont: null,
      wallpaper,
    });
  Services.prefs.setStringPref("nirva.look", "glass");
  Services.prefs.setBoolPref("nirva.theme.enabled", true);
  Services.prefs.setStringPref("nirva.theme.settings", settings("mist"));
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("nirva.theme.enabled");
    Services.prefs.clearUserPref("nirva.theme.settings");
  });
  const { tab, doc } = await openHome();
  const win = doc.defaultView;
  const backdrop = () => win.getComputedStyle(doc.body).backgroundImage;
  await TestUtils.waitForCondition(
    () => backdrop().includes("gradient"),
    "the chosen wallpaper fills the home page"
  );
  Assert.equal(
    win.getComputedStyle(doc.querySelector(".light-2")).backgroundColor,
    "rgb(244, 247, 249)",
    "Glass keeps its light shapes, in the wallpaper's colours"
  );
  const scene = () =>
    win.getComputedStyle(doc.querySelector(".nirva-wall-scene"))
      .backgroundImage;
  Assert.ok(scene().includes("wall-hills.svg"), "Mist draws misty hills");
  const mist = backdrop();
  Services.prefs.setStringPref("nirva.theme.settings", settings("dawn"));
  await TestUtils.waitForCondition(
    () => backdrop() != mist,
    "each wallpaper looks different"
  );

  Services.prefs.setStringPref("nirva.mode", "bright");
  Services.prefs.setStringPref("nirva.theme.settings", settings("forest"));
  Services.prefs.setStringPref("nirva.look", "cockpit");
  await TestUtils.waitForCondition(
    () => scene().includes("wall-contours.svg"),
    "Cockpit draws Forest as contour lines"
  );
  Services.prefs.setStringPref("nirva.look", "paper");
  await TestUtils.waitForCondition(
    () => backdrop().includes("paper-grain") && backdrop().includes("gradient"),
    "Paper keeps its grain over the wallpaper's tinted stock"
  );
  Assert.ok(scene().includes("wall-pines.svg"), "and prints the treeline");
  Services.prefs.setStringPref("nirva.theme.settings", settings("none"));
  await TestUtils.waitForCondition(
    () => !backdrop().includes("wall") && backdrop().includes("paper-grain"),
    "with no wallpaper Paper shows its own paper surface"
  );
  Services.prefs.clearUserPref("nirva.mode");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_firefox_new_tab_pages_become_the_home_screen() {
  for (const url of ["about:newtab", "about:home"]) {
    const tab = BrowserTestUtils.addTab(gBrowser, url);
    await TestUtils.waitForCondition(
      () => tab.linkedBrowser.currentURI.spec == HOME_URL,
      `${url} is replaced`
    );
    Assert.equal(
      tab.linkedBrowser.currentURI.spec,
      HOME_URL,
      `${url} shows the Nirva home screen`
    );
    BrowserTestUtils.removeTab(tab);
  }
});

add_task(async function test_an_idle_home_page_does_not_redraw_every_second() {
  NirvaHome.resetFocus();
  const { tab, doc } = await openHome();
  const focus = doc.querySelector('[data-widget="focus"]');
  let changes = 0;
  const watcher = new doc.defaultView.MutationObserver(records => {
    changes += records.length;
    for (const record of records) {
      info(
        `changed: ${record.type} ${record.attributeName} on ${record.target.id || record.target.nodeName}`
      );
    }
  });
  // Let the first drawing settle before watching.
  await TestUtils.waitForTick();
  watcher.observe(focus, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  // Three ticks of the page's one-second timer.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 3200));
  watcher.disconnect();
  Assert.equal(changes, 0, "the idle focus card is left alone");
  BrowserTestUtils.removeTab(tab);
});
