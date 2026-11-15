/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaLooks } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs"
);
const { NirvaMotion } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs"
);
const { NirvaWelcome } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/welcome/NirvaWelcome.sys.mjs"
);

// The guide opens at its full size, centred; on a screen too small for that it fills the
// screen instead, so nobody has to resize it. Window managers may ignore a size set before
// the window is shown, so it is applied again once it has loaded.
function placeWindow() {
  if (screen.availWidth >= 1248 && screen.availHeight >= 868) {
    window.resizeTo(1200, 820);
    window.moveTo(
      screen.availLeft + (screen.availWidth - 1200) / 2,
      screen.availTop + (screen.availHeight - 820) / 2
    );
  } else {
    window.maximize();
  }
}
placeWindow();
window.addEventListener("load", () => requestAnimationFrame(placeWindow), {
  once: true,
});

const STEPS = ["intro", "look", "privacy", "import"];
const DARK_ONLY = ["cockpit"];
const CATEGORY_PREF = "browser.contentblocking.category";
const $ = id => document.getElementById(id);
const checked = group =>
  document.querySelector(`input[name="${group}"]:checked`)?.value;

let current = 0;

function lookName() {
  return document
    .querySelector(`input[name="look"][value="${checked("look")}"]`)
    .closest(".look")
    .querySelector(".look-name").textContent;
}

function update() {
  const fixed = DARK_ONLY.includes(checked("look"));
  $("modes").disabled = fixed;
  $("mode-choices").hidden = fixed;
  $("mode-fixed").hidden = !fixed;
  // The stylesheet marks the chosen card, mode and protection through this class.
  for (const input of document.querySelectorAll("input[type=radio]")) {
    input.closest("label").classList.toggle("selected", input.checked);
  }
  const step = STEPS[current];
  let label = "nirva-welcome-next";
  if (step == "intro") {
    label = "nirva-welcome-get-started";
  } else if (step == "look") {
    label = "nirva-welcome-continue";
  } else if (step == "import") {
    label = "nirva-welcome-finish";
  }
  document.l10n.setAttributes($("continue"), label, { look: lookName() });
}

// The import step uses the browser's own importer. Its window actor is registered
// when MigrationUtils first loads, so that happens before the element is made.
function showImporter() {
  if ($("importer")) {
    return;
  }
  ChromeUtils.importESModule(
    "moz-src:///browser/components/migration/MigrationUtils.sys.mjs"
  );
  const wizard = document.createElement("migration-wizard");
  wizard.id = "importer";
  wizard.setAttribute("auto-request-state", "");
  wizard.setAttribute("force-show-import-all", "");
  wizard.addEventListener("MigrationWizard:Close", () => finish());
  $("importer-box").append(wizard);
}

function show(index) {
  current = Math.max(0, Math.min(index, STEPS.length - 1));
  const step = STEPS[current];
  for (const section of document.querySelectorAll(".step")) {
    section.hidden = section.dataset.step != step;
  }
  for (const item of $("progress").children) {
    const position = STEPS.indexOf(item.dataset.step);
    item.classList.toggle("done", position < current);
    if (position == current) {
      item.setAttribute("aria-current", "step");
    } else {
      item.removeAttribute("aria-current");
    }
  }
  $("back").hidden = current == 0;
  document.l10n.setAttributes($("step-count"), "nirva-welcome-step-count", {
    step: current + 1,
    count: STEPS.length,
  });
  if (step == "import") {
    showImporter();
  }
  update();
  document.querySelector(`.step[data-step="${step}"] h1`).focus();
}

function readPrivacy() {
  const category = Services.prefs.getStringPref(CATEGORY_PREF, "standard");
  for (const input of document.querySelectorAll('input[name="protection"]')) {
    input.checked = input.value == category;
  }
  for (const input of document.querySelectorAll("input[data-pref]")) {
    input.checked = Services.prefs.getBoolPref(input.dataset.pref, false);
  }
}

// Privacy choices take effect at once, so closing the window keeps them.
function onPrivacyChange(event) {
  const input = event.target;
  if (input.name == "protection" && input.checked) {
    Services.prefs.setStringPref(CATEGORY_PREF, input.value);
  } else if (input.dataset.pref) {
    Services.prefs.setBoolPref(input.dataset.pref, input.checked);
  }
}

function applyLook() {
  NirvaLooks.look = checked("look");
  // Cockpit ignores the mode; the last choice is kept for the other looks.
  NirvaLooks.mode = checked("mode");
  if (!$("lite").hidden) {
    NirvaMotion.lite = $("lite-choice").checked;
  }
}

function finish() {
  applyLook();
  NirvaWelcome.markDone();
  window.close();
}

function next() {
  if (current == STEPS.length - 1) {
    finish();
    return;
  }
  if (STEPS[current] == "look") {
    applyLook();
  }
  show(current + 1);
}

async function start() {
  document.querySelector(
    `input[name="look"][value="${NirvaLooks.look}"]`
  ).checked = true;
  document.querySelector(
    `input[name="mode"][value="${NirvaLooks.mode}"]`
  ).checked = true;
  readPrivacy();
  // Lite mode is offered only where the computer is likely to need it (SPEC S14).
  $("lite").hidden = !NirvaMotion.shouldOfferLite(await NirvaMotion.machine());
  $("lite-choice").checked = NirvaMotion.lite;
  $("brand").textContent = Services.strings
    .createBundle("chrome://branding/locale/brand.properties")
    .GetStringFromName("brandShortName");
  for (const heading of document.querySelectorAll(".step h1")) {
    heading.tabIndex = -1;
  }
  // The Continue button names the look, so the look names must be translated first.
  await document.l10n.ready;
  await document.l10n.translateRoots();
  show(0);
  document.addEventListener("change", event => {
    if (event.target.closest('[data-step="privacy"]')) {
      onPrivacyChange(event);
    }
    update();
  });
  $("continue").addEventListener("click", next);
  $("back").addEventListener("click", () => show(current - 1));
  document.addEventListener("keydown", event => {
    if (
      event.key == "Enter" &&
      event.target.localName != "button" &&
      !event.target.closest?.("migration-wizard") &&
      STEPS[current] != "import"
    ) {
      next();
    }
  });
  try {
    window.maximize();
  } catch (e) {
    // Not every window can be maximised; the page lays out at any size.
  }
  document.documentElement.setAttribute("ready", "true");

  // For the first-run check tool only: NIRVA_WELCOME_AUTOCONTINUE="paper,dark" makes the
  // choice and finishes, so a real first start can be checked without a person.
  const auto = Services.env.get("NIRVA_WELCOME_AUTOCONTINUE");
  if (auto) {
    const [look, mode] = auto.split(",");
    document.querySelector(`input[name="look"][value="${look}"]`)?.click();
    document.querySelector(`input[name="mode"][value="${mode}"]`)?.click();
    finish();
  }
}

start();
