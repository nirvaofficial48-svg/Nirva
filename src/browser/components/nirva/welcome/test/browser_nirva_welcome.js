/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, EventUtils, Assert, BrowserTestUtils, registerCleanupFunction, Services, TestUtils */

"use strict";

const { NirvaWelcome } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/welcome/NirvaWelcome.sys.mjs"
);

const PREFS = [
  "nirva.look",
  "nirva.mode",
  "nirva.welcome.done",
  "nirva.welcome.version",
];

registerCleanupFunction(() => {
  for (const pref of PREFS) {
    Services.prefs.clearUserPref(pref);
  }
});

async function openChooser() {
  const win = NirvaWelcome.open();
  await TestUtils.waitForCondition(
    () => win.document?.documentElement?.getAttribute("ready") == "true",
    "the guide is ready"
  );
  await TestUtils.waitForCondition(
    () => win.document.documentElement.clientWidth > 0,
    "the guide's viewport is laid out"
  );
  return win;
}

// Waits until the importer has looked for browsers, so closing does not cut it short.
async function importerReady(win) {
  const wizard = win.document.getElementById("importer");
  await TestUtils.waitForCondition(() => {
    const view =
      wizard.openOrClosedShadowRoot?.querySelector(
        "#wizard-deck"
      )?.selectedViewName;
    return view && view != "page-loading";
  }, "the importer has looked for browsers");
  return wizard;
}

function step(win) {
  return win.document.querySelector(".step:not([hidden])").dataset.step;
}

async function goTo(win, name) {
  const doc = win.document;
  while (step(win) != name) {
    doc.getElementById("continue").click();
  }
  if (name == "look") {
    // NIRVA: The chrome dialog can announce ready before its headless viewport is laid out.
    await TestUtils.waitForCondition(
      () =>
        win.getComputedStyle(doc.getElementById("looks")).columnGap == "24px",
      "the look grid is laid out"
    );
  }
  await doc.l10n.translateRoots();
}

function choose(win, name, value) {
  const input = win.document.querySelector(
    `input[name="${name}"][value="${value}"]`
  );
  input.click();
  return input;
}

add_task(async function test_what_a_new_profile_sees() {
  for (const pref of PREFS) {
    Services.prefs.clearUserPref(pref);
  }
  Assert.ok(!NirvaWelcome.done, "a new profile has not seen the chooser");
  const win = await openChooser();
  const doc = win.document;

  Assert.equal(step(win), "intro", "the guide starts with the tour");
  Assert.equal(
    doc.querySelector('.step[data-step="intro"] h1').textContent,
    "Welcome to Nirva",
    "heading"
  );
  Assert.equal(doc.querySelectorAll(".features > li").length, 8, "the tour");
  Assert.ok(doc.getElementById("back").hidden, "no Back on the first step");
  await goTo(win, "look");
  Assert.equal(
    doc.querySelector('.step[data-step="look"] h1').textContent,
    "Choose your look",
    "the look step"
  );
  Assert.equal(
    doc.getElementById("brand").textContent,
    "Nirva",
    "the Nirva name"
  );
  Assert.deepEqual(
    [...doc.querySelectorAll('input[name="look"]')].map(i => i.value),
    ["glass", "cockpit", "paper"],
    "the three looks"
  );
  Assert.ok(
    doc.querySelector('input[name="look"][value="glass"]').checked,
    "Glass first"
  );
  Assert.ok(
    doc.querySelector('input[name="mode"][value="system"]').checked,
    "Match my computer first"
  );
  Assert.equal(
    doc.getElementById("continue").textContent,
    "Continue with Glass",
    "Continue names the look"
  );

  const cards = [...doc.querySelectorAll(".look")].map(c =>
    c.getBoundingClientRect()
  );
  Assert.less(
    Math.abs(cards[0].width - cards[1].width),
    1,
    "cards are equal width"
  );
  Assert.less(Math.abs(cards[1].width - cards[2].width), 1, "all three");
  Assert.equal(Math.round(cards[1].x - cards[0].right), 24, "24 px apart");
  Assert.equal(cards[0].top, cards[2].top, "on one row");
  Assert.lessOrEqual(
    doc.documentElement.scrollWidth,
    doc.documentElement.clientWidth,
    "nothing sticks out sideways"
  );
  Assert.greaterOrEqual(
    doc.getElementById("continue").getBoundingClientRect().height,
    44,
    "Continue is a full-size target"
  );
  Assert.ok(
    win.getComputedStyle(doc.body).fontFamily.includes("Hanken Grotesk"),
    "set in the bundled font"
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_cockpit_is_dark_only() {
  const win = await openChooser();
  const doc = win.document;
  await goTo(win, "look");
  choose(win, "look", "cockpit");
  await TestUtils.waitForCondition(
    () => doc.getElementById("continue").textContent == "Continue with Cockpit",
    "Continue follows the look"
  );
  Assert.ok(
    doc.getElementById("modes").disabled,
    "the mode choice is disabled"
  );
  Assert.ok(
    doc.getElementById("mode-choices").hidden,
    "its options step aside"
  );
  const fixed = doc.getElementById("mode-fixed");
  Assert.ok(!fixed.hidden, "a fixed label shows instead");
  Assert.equal(fixed.textContent, "Dark only", "reading Dark only");

  choose(win, "look", "paper");
  Assert.ok(
    !doc.getElementById("modes").disabled,
    "Paper offers the modes again"
  );
  Assert.ok(fixed.hidden, "and the fixed label goes");
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_continue_applies_the_choice_once() {
  const win = await openChooser();
  await goTo(win, "look");
  choose(win, "look", "paper");
  choose(win, "mode", "dark");
  await goTo(win, "import");
  Assert.equal(
    win.document.getElementById("continue").textContent,
    "Start browsing",
    "the last step finishes"
  );
  win.document.getElementById("back").click();
  Assert.equal(step(win), "privacy", "Back goes one step back");
  await goTo(win, "import");
  await importerReady(win);
  const closed = BrowserTestUtils.domWindowClosed(win);
  win.document.getElementById("continue").click();
  await closed;

  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "paper",
    "look saved"
  );
  Assert.equal(
    Services.prefs.getStringPref("nirva.mode"),
    "dark",
    "mode saved"
  );
  const root = document.documentElement;
  Assert.equal(
    root.getAttribute("data-nirva-look"),
    "paper",
    "applied to the browser"
  );
  Assert.equal(root.getAttribute("data-nirva-mode"), "dark", "with its mode");
  Assert.ok(NirvaWelcome.done, "the chooser is marked as seen");
  Assert.ok(!NirvaWelcome.shouldShow(), "so it does not show again");

  const before = [...Services.wm.getEnumerator(null)].length;
  NirvaWelcome.showIfFirstRun();
  Assert.equal(
    [...Services.wm.getEnumerator(null)].length,
    before,
    "asking again opens nothing"
  );

  Services.prefs.setIntPref("nirva.welcome.version", 1);
  Assert.ok(
    !NirvaWelcome.done,
    "a profile that saw an older guide sees the new one"
  );
  NirvaWelcome.markDone();

  NirvaWelcome.reset();
  Assert.ok(!NirvaWelcome.done, "until it is reset");
});

add_task(async function test_the_chooser_remembers_the_current_choice() {
  Services.prefs.setStringPref("nirva.look", "cockpit");
  Services.prefs.setStringPref("nirva.mode", "bright");
  const win = await openChooser();
  const doc = win.document;
  await goTo(win, "look");
  Assert.ok(
    doc.querySelector('input[name="look"][value="cockpit"]').checked,
    "look"
  );
  Assert.ok(
    doc.getElementById("modes").disabled,
    "Cockpit starts with modes disabled"
  );
  await BrowserTestUtils.closeWindow(win);
  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "cockpit",
    "closing without Continue changes nothing"
  );
});

add_task(async function test_privacy_choices_show_and_apply() {
  const win = await openChooser();
  const doc = win.document;
  await goTo(win, "privacy");
  const links = doc.querySelector(
    'input[data-pref="nirva.linkcleaner.enabled"]'
  );
  Assert.ok(links.checked, "link cleaning shows as on");
  const category = Services.prefs.getStringPref(
    "browser.contentblocking.category",
    "standard"
  );
  for (const radio of doc.querySelectorAll('input[name="protection"]')) {
    Assert.equal(
      radio.checked,
      radio.value == category,
      `${radio.value} shows the current protection level`
    );
  }

  links.click();
  Assert.ok(!Services.prefs.getBoolPref("nirva.linkcleaner.enabled"));
  links.click();
  Assert.ok(Services.prefs.getBoolPref("nirva.linkcleaner.enabled"));

  const gpc = doc.querySelector(
    'input[data-pref="privacy.globalprivacycontrol.enabled"]'
  );
  gpc.click();
  Assert.equal(
    Services.prefs.getBoolPref("privacy.globalprivacycontrol.enabled"),
    gpc.checked,
    "the privacy signal follows its switch"
  );
  Services.prefs.clearUserPref("privacy.globalprivacycontrol.enabled");

  doc.querySelector('input[name="protection"][value="strict"]').click();
  await TestUtils.waitForCondition(
    () => Services.prefs.getBoolPref("privacy.trackingprotection.enabled"),
    "Strict turns on tracking protection in every window"
  );
  doc.querySelector('input[name="protection"][value="standard"]').click();
  await TestUtils.waitForCondition(
    () =>
      !Services.prefs.prefHasUserValue("privacy.trackingprotection.enabled"),
    "Standard puts it back"
  );
  Services.prefs.clearUserPref("browser.contentblocking.category");
  Services.prefs.clearUserPref("nirva.linkcleaner.enabled");
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_import_really_imports() {
  const { InternalTestingProfileMigrator } = ChromeUtils.importESModule(
    "moz-src:///browser/components/migration/InternalTestingProfileMigrator.sys.mjs"
  );
  const { MigrationUtils } = ChromeUtils.importESModule(
    "moz-src:///browser/components/migration/MigrationUtils.sys.mjs"
  );
  Services.prefs.setBoolPref("browser.migrate.internal-testing.enabled", true);
  const proto = InternalTestingProfileMigrator.prototype;
  const original = proto.getResources;
  let migrated = false;
  proto.getResources = async () => [
    {
      type: MigrationUtils.resourceTypes.BOOKMARKS,
      migrate: callback => {
        migrated = true;
        callback(true);
      },
    },
  ];
  registerCleanupFunction(() => {
    proto.getResources = original;
    Services.prefs.clearUserPref("browser.migrate.internal-testing.enabled");
  });

  const win = await openChooser();
  await goTo(win, "import");
  const wizard = win.document.getElementById("importer");
  Assert.ok(wizard, "the browser's importer is on the last step");
  const shadow = () => wizard.openOrClosedShadowRoot;
  await importerReady(win);
  Assert.equal(
    shadow().querySelector("#wizard-deck").selectedViewName,
    "page-selection",
    "the importer lists the browsers found"
  );
  const list = shadow().querySelector("panel-list");
  const shown = BrowserTestUtils.waitForEvent(list, "shown");
  EventUtils.synthesizeMouseAtCenter(
    shadow().querySelector("#browser-profile-selector"),
    {},
    win
  );
  await shown;
  const hidden = BrowserTestUtils.waitForEvent(list, "hidden");
  EventUtils.synthesizeMouseAtCenter(
    shadow().querySelector(
      `panel-item[key="${InternalTestingProfileMigrator.key}"]`
    ),
    {},
    win
  );
  await hidden;
  shadow().querySelector("#import").click();
  await TestUtils.waitForCondition(() => migrated, "the import ran");
  await TestUtils.waitForCondition(
    () =>
      shadow().querySelector("#wizard-deck").selectedViewName ==
      "page-progress",
    "and reports its progress"
  );
  await BrowserTestUtils.closeWindow(win);
});
