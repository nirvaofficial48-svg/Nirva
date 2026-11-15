/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_setup, add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, TestUtils, window */

"use strict";

const { NirvaMacros } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/macros/NirvaMacros.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);
const { NirvaWorkspaces } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs"
);

const BASE = getRootDirectory(gTestPath).replace(
  "chrome://mochitests/content",
  "https://example.com"
);
const PAGE = `${BASE}page.html`;
const SLOW = `${BASE}slow.sjs`;
const MANAGER_URL = "chrome://browser/content/nirva/macros.html";
const PREFS = ["nirva.macros.list", "nirva.look", "nirva.mode"];

function resetPrefs() {
  for (const pref of PREFS) {
    Services.prefs.clearUserPref(pref);
  }
}

function notice(value) {
  return window.gNotificationBox.getNotificationWithValue(value);
}

function closeExtraTabs() {
  for (const tab of [...gBrowser.tabs].slice(1)) {
    BrowserTestUtils.removeTab(tab);
  }
  notice("nirva-macro-result")?.close();
}

add_setup(async function () {
  resetPrefs();
  Services.prefs.setStringPref("nirva.look", "glass");
  Services.prefs.setStringPref("nirva.mode", "bright");
  registerCleanupFunction(() => {
    closeExtraTabs();
    resetPrefs();
  });
});

add_task(async function test_saving_checks_its_input() {
  Assert.throws(
    () => NirvaMacros.save({ name: " ", steps: [{ type: "sleep-others" }] }),
    /nirva-macros-error-name/
  );
  Assert.throws(
    () =>
      NirvaMacros.save({
        name: "Unsafe",
        steps: [
          { type: "command", command: "clear-data" },
          { type: "open", url: "javascript:alert(1)" },
          { type: "script", code: "x" },
        ],
      }),
    /nirva-macros-error-steps/,
    "commands outside the list, non-web addresses and unknown steps are refused"
  );
  const id = NirvaMacros.save({
    name: "Read",
    steps: [{ type: "open", url: "example.com" }],
  });
  Assert.ok(
    NirvaMacros.get(id).steps[0].url.endsWith("://example.com/"),
    "a typed address is completed"
  );
  NirvaMacros.remove(id);
  Assert.equal(NirvaMacros.macros.length, 0);
});

add_task(async function test_runs_steps_in_order() {
  const id = NirvaMacros.save({
    name: "Evening",
    steps: [
      { type: "command", command: "mode-dark" },
      { type: "open", url: PAGE },
      { type: "command", command: "look-paper" },
    ],
  });
  Assert.ok(
    NirvaCommands.all(window).some(c => c.id == `macro-${id}`),
    "the macro is a command"
  );
  Assert.equal(await NirvaMacros.run(window, id), "done");
  Assert.equal(Services.prefs.getStringPref("nirva.mode"), "dark");
  Assert.equal(Services.prefs.getStringPref("nirva.look"), "paper");
  Assert.equal(gBrowser.currentURI.spec, PAGE, "the site opened in a tab");
  Assert.ok(!notice("nirva-macro-running"), "the running bar is gone");
  Assert.ok(!notice("nirva-macro-result"), "nothing to report");

  // A step that is already true counts as done.
  const active = NirvaWorkspaces.getActive(window);
  const again = NirvaMacros.save({
    name: "Again",
    steps: [
      { type: "command", command: "look-paper" },
      { type: "command", command: `workspace-switch-${active}` },
    ],
  });
  Assert.equal(await NirvaMacros.run(window, again), "done");
  closeExtraTabs();
  Services.prefs.clearUserPref("nirva.macros.list");
  Services.prefs.setStringPref("nirva.look", "glass");
  Services.prefs.setStringPref("nirva.mode", "bright");
});

add_task(async function test_failure_is_shown_and_stops() {
  const id = NirvaMacros.save({
    name: "Broken",
    steps: [
      {
        type: "command",
        command: "workspace-switch-gone",
        label: "Switch to Gone",
      },
      { type: "command", command: "look-paper" },
    ],
  });
  Assert.equal(await NirvaMacros.run(window, id), "failed");
  const bar = notice("nirva-macro-result");
  Assert.ok(bar, "the failure is shown");
  Assert.stringContains(bar.message, "step 1");
  Assert.stringContains(bar.message, "Switch to Gone");
  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "glass",
    "later steps did not run"
  );
  closeExtraTabs();
  NirvaMacros.remove(id);
});

add_task(async function test_async_command_failure_is_caught() {
  NirvaCommands.register({
    id: "look-test-broken",
    feature: "test",
    title: "Broken look",
    run: async () => {
      await Promise.resolve();
      throw undefined; // eslint-disable-line no-throw-literal
    },
  });
  const id = NirvaMacros.save({
    name: "Async",
    steps: [
      { type: "command", command: "look-test-broken" },
      { type: "command", command: "look-paper" },
    ],
  });
  Assert.equal(await NirvaMacros.run(window, id), "failed");
  Assert.stringContains(notice("nirva-macro-result").message, "Broken look");
  Assert.equal(Services.prefs.getStringPref("nirva.look"), "glass");
  NirvaCommands.unregister("look-test-broken");
  closeExtraTabs();
  NirvaMacros.remove(id);
});

add_task(async function test_consequential_steps_ask_first() {
  const id = NirvaMacros.save({
    name: "Tidy",
    steps: [{ type: "close-others" }],
  });
  const keep = gBrowser.selectedTab;
  const others = [];
  for (let i = 0; i < 2; i++) {
    others.push(await BrowserTestUtils.openNewForegroundTab(gBrowser, PAGE));
  }
  gBrowser.selectedTab = keep;

  let dialog = BrowserTestUtils.promiseAlertDialog("cancel");
  Assert.equal(await NirvaMacros.run(window, id), "cancelled");
  await dialog;
  Assert.ok(
    others.every(tab => tab.isConnected),
    "nothing closed after Cancel"
  );

  dialog = BrowserTestUtils.promiseAlertDialog("accept");
  Assert.equal(await NirvaMacros.run(window, id), "done");
  await dialog;
  await TestUtils.waitForCondition(() => others.every(tab => !tab.isConnected));
  Assert.ok(keep.isConnected, "the current tab stays");
  NirvaMacros.remove(id);
});

add_task(async function test_stop_from_running_bar() {
  const id = NirvaMacros.save({
    name: "Slow",
    steps: [
      { type: "open", url: SLOW },
      { type: "command", command: "look-paper" },
    ],
  });
  const running = NirvaMacros.run(window, id);
  await TestUtils.waitForCondition(() => notice("nirva-macro-running"));
  const bar = notice("nirva-macro-running");
  Assert.stringContains(bar.message, "step 1 of 2");
  Assert.ok(NirvaCommands.all(window).some(c => c.id == "macros-stop"));
  bar.buttonContainer.querySelector("button").click();
  Assert.equal(await running, "stopped");
  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "glass",
    "the step after Stop did not run"
  );
  Assert.stringContains(notice("nirva-macro-result").message, "stopped");
  closeExtraTabs();
  NirvaMacros.remove(id);
});

add_task(async function test_page_builds_and_deletes_a_macro() {
  const tab = NirvaMacros.openManager(window);
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser, false, MANAGER_URL);
  const doc = tab.linkedBrowser.contentDocument;
  const $ = selector => doc.querySelector(selector);
  await TestUtils.waitForCondition(() => $("#choice").options.length > 3);
  Assert.ok(!$("#macros-empty").hidden);

  $("#name").value = "Morning";
  $("#choice").value = "open";
  $("#choice").dispatchEvent(new doc.defaultView.Event("change"));
  Assert.ok(!$("#url").hidden, "an address field appears for Open");
  $("#url").value = "example.org";
  $("#add button").click();
  $("#choice").value = "close-others";
  $("#add button").click();
  Assert.equal($("#steps").children.length, 2);
  Assert.ok($("#steps .asks-first"), "consequential steps are marked");
  $("#steps .step:nth-child(2) button:nth-of-type(1)").click();
  Assert.equal(
    $("#steps .step-title").textContent,
    "Close the other tabs in this workspace",
    "steps can be reordered"
  );
  $("#save").click();

  const [macro] = NirvaMacros.macros;
  Assert.equal(macro.name, "Morning");
  Assert.deepEqual(
    macro.steps.map(step => step.type),
    ["close-others", "open"]
  );
  await TestUtils.waitForCondition(() => $("#macros").children.length == 1);
  Assert.equal($("#steps").children.length, 0, "the form is cleared");

  doc.defaultView.confirm = () => true;
  $("#macros .row button:nth-of-type(3)").click();
  await TestUtils.waitForCondition(() => !NirvaMacros.macros.length);
  Assert.ok(!$("#macros-empty").hidden);
  BrowserTestUtils.removeTab(tab);
});
