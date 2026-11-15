/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaTheme } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/theme/NirvaTheme.sys.mjs"
);

const $ = id => document.getElementById(id);
const LOOK_DEFAULTS = {
  glass: { blur: 28, roundness: 20 },
  cockpit: { blur: 0, roundness: 0 },
  paper: { blur: 0, roundness: 6 },
};
let draft = NirvaTheme.settings;
let applied = false;
// The mode this page is shown in while an accent is edited; null follows the real mode.
let previewMode = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setStatus(id, args, error = false) {
  const statusNode = $("status");
  document.l10n.setAttributes(statusNode, id, args);
  statusNode.toggleAttribute("data-error", error);
}

async function fillFonts() {
  const defaultLabel = await document.l10n.formatValue(
    "nirva-theme-font-default"
  );
  for (const select of [$("ui-font"), $("display-font")]) {
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = defaultLabel;
    select.append(defaultOption);
    for (const font of NirvaTheme.FONTS) {
      const option = document.createElement("option");
      option.value = font;
      option.textContent = font;
      select.append(option);
    }
  }
}

function pickedAccent(look, mode) {
  const color = $(`accent-${mode}`).value.toUpperCase();
  const fitted = NirvaTheme.fitAccent(look, mode, color);
  if (fitted != color) {
    $(`accent-${mode}`).value = fitted;
    setStatus("nirva-theme-status-adjusted", { color, fitted });
  }
  return fitted == NirvaTheme.DEFAULT_ACCENTS[look][mode] ? null : fitted;
}

function readForm(changed) {
  const look = $("look").value;
  const accents = clone(draft.appearance.accents);
  if (look == draft.look) {
    for (const mode of ["bright", "dark"]) {
      if (changed == `accent-${mode}`) {
        accents[look][mode] = pickedAccent(look, mode);
      }
    }
  }
  return {
    look,
    mode: look == "cockpit" ? "dark" : $("mode").value,
    appearance: {
      accents,
      blur: Number($("blur").value),
      roundness: Number($("roundness").value),
      density: $("density").value,
      uiFont: $("ui-font").value || null,
      displayFont: $("display-font").value || null,
      wallpaper: $("wallpaper").value,
    },
    motion: {
      style: $("motion").value,
      speed: Number($("speed").value),
      lite: $("lite").checked,
    },
  };
}

function syncForm(settings) {
  $("look").value = settings.look;
  $("mode").value = settings.look == "cockpit" ? "dark" : settings.mode;
  $("mode").disabled = settings.look == "cockpit";
  $("accent-bright").disabled = settings.look == "cockpit";
  document.querySelector('.default-accent[data-mode="bright"]').disabled =
    settings.look == "cockpit";
  const accents = settings.appearance.accents[settings.look];
  $("accent-bright").value =
    accents.bright || NirvaTheme.DEFAULT_ACCENTS[settings.look].bright;
  $("accent-dark").value =
    accents.dark || NirvaTheme.DEFAULT_ACCENTS[settings.look].dark;
  $("blur").value =
    settings.appearance.blur ?? LOOK_DEFAULTS[settings.look].blur;
  $("blur").disabled = settings.look != "glass" || settings.motion.lite;
  $("roundness").max = { glass: 28, cockpit: 4, paper: 12 }[settings.look];
  $("roundness").value =
    settings.appearance.roundness ?? LOOK_DEFAULTS[settings.look].roundness;
  $("density").value = settings.appearance.density;
  $("wallpaper").value = settings.appearance.wallpaper;
  $("ui-font").value = settings.appearance.uiFont || "";
  $("display-font").value = settings.appearance.displayFont || "";
  $("motion").value = settings.motion.style;
  $("speed").value = settings.motion.speed;
  $("lite").checked = settings.motion.lite;
  $("blur-help").hidden = settings.look == "glass" && !settings.motion.lite;
  $("preview-mode").hidden = settings.look == "cockpit";
  $("accent-bright").closest(".color-field").hidden =
    settings.look == "cockpit";
  $("blur-value").value = `${$("blur").value} px`;
  $("roundness-value").value = `${$("roundness").value} px`;
  $("speed-value").value = `${$("speed").value}%`;
}

function shownMode() {
  if (draft.look == "cockpit") {
    return "dark";
  }
  if (previewMode) {
    return previewMode;
  }
  if (draft.mode != "system") {
    return draft.mode;
  }
  return window.matchMedia("(-moz-system-dark-theme)").matches
    ? "dark"
    : "bright";
}

function showPage() {
  NirvaTheme.applyToElement(
    document.documentElement,
    draft,
    window,
    previewMode
  );
  const mode = shownMode();
  for (const button of document.querySelectorAll("[data-preview-mode]")) {
    button.setAttribute("aria-pressed", button.dataset.previewMode == mode);
  }
}

function replayMotion() {
  const content = document.querySelector(".preview-content");
  content.classList.remove("replay");
  // Reading the layout restarts the animation when the class is added again.
  content.getBoundingClientRect();
  content.classList.add("replay");
}

function updatePreview(keepStatus = false) {
  applied = false;
  NirvaTheme.preview(draft);
  showPage();
  if (!keepStatus) {
    setStatus("nirva-theme-status-preview");
  }
}

function onControlChange(event) {
  const id = event.target.id;
  if (event.type == "input" && event.target.type == "color") {
    return;
  }
  if (id == "accent-bright" || id == "accent-dark") {
    previewMode = id == "accent-bright" ? "bright" : "dark";
  } else if (id == "mode" || id == "look") {
    previewMode = null;
  }
  setStatus("nirva-theme-status-preview");
  const candidate = readForm(id);
  const adjusted = $("status").dataset.l10nId == "nirva-theme-status-adjusted";
  try {
    draft = ["look", "mode"].includes(event.target.id)
      ? NirvaTheme.sanitizeSettings(candidate)
      : NirvaTheme.normalizeSettings(candidate);
    syncForm(draft);
    updatePreview(adjusted);
    if (["motion", "speed", "lite"].includes(id)) {
      replayMotion();
    }
  } catch (error) {
    syncForm(draft);
    setStatus("nirva-theme-status-contrast", { reason: error.message }, true);
  }
}

function installFilePicker(title, mode) {
  const picker = Cc["@mozilla.org/filepicker;1"].createInstance(
    Ci.nsIFilePicker
  );
  picker.init(window.browsingContext, title, mode);
  picker.defaultExtension = "nirvatheme";
  picker.appendFilter("Nirva theme", "*.nirvatheme");
  picker.defaultString = "nirva-theme.nirvatheme";
  return new Promise(resolve =>
    picker.open(result => resolve({ picker, result }))
  );
}

async function exportTheme() {
  const title = await document.l10n.formatValue("nirva-theme-export-title");
  const { picker, result } = await installFilePicker(
    title,
    Ci.nsIFilePicker.modeSave
  );
  if (result == Ci.nsIFilePicker.returnCancel || !picker.file) {
    return;
  }
  const file = picker.file;
  if (!file.leafName.toLowerCase().endsWith(".nirvatheme")) {
    file.leafName += ".nirvatheme";
  }
  await IOUtils.writeUTF8(file.path, NirvaTheme.serializeTheme(draft));
  setStatus("nirva-theme-status-exported");
}

async function importTheme() {
  const title = await document.l10n.formatValue("nirva-theme-import-title");
  const { picker, result } = await installFilePicker(
    title,
    Ci.nsIFilePicker.modeOpen
  );
  if (result != Ci.nsIFilePicker.returnOK || !picker.file) {
    return;
  }
  const imported = NirvaTheme.parseTheme(
    await IOUtils.readUTF8(picker.file.path)
  );
  draft = imported.settings;
  syncForm(draft);
  updatePreview();
  setStatus("nirva-theme-status-imported", { name: imported.name });
}

async function start() {
  await document.l10n.ready;
  $("preview").setAttribute(
    "aria-label",
    await document.l10n.formatValue("nirva-theme-preview-aria")
  );
  await fillFonts();
  draft = NirvaTheme.settings;
  syncForm(draft);
  updatePreview();

  for (const control of document.querySelectorAll("select, input")) {
    control.addEventListener("input", onControlChange);
    control.addEventListener("change", onControlChange);
  }
  for (const button of document.querySelectorAll("[data-preset]")) {
    button.addEventListener("click", () => {
      draft = NirvaTheme.preset(button.dataset.preset);
      previewMode = null;
      syncForm(draft);
      updatePreview();
    });
  }
  for (const button of document.querySelectorAll("[data-preview-mode]")) {
    button.addEventListener("click", () => {
      previewMode = button.dataset.previewMode;
      showPage();
    });
  }
  $("replay").addEventListener("click", replayMotion);
  for (const button of document.querySelectorAll(".default-accent")) {
    button.addEventListener("click", () => {
      draft = clone(draft);
      draft.appearance.accents[draft.look][button.dataset.mode] = null;
      previewMode = draft.look == "cockpit" ? null : button.dataset.mode;
      syncForm(draft);
      updatePreview();
    });
  }

  $("apply").addEventListener("click", () => {
    try {
      draft = NirvaTheme.apply(draft);
      showPage();
      syncForm(draft);
      applied = true;
      setStatus("nirva-theme-status-applied");
    } catch (error) {
      setStatus("nirva-theme-status-contrast", { reason: error.message }, true);
    }
  });
  $("discard").addEventListener("click", () => {
    NirvaTheme.cancelPreview();
    draft = NirvaTheme.settings;
    syncForm(draft);
    updatePreview();
    setStatus("nirva-theme-status-discarded");
  });
  $("reset").addEventListener("click", () => {
    draft = NirvaTheme.reset();
    previewMode = null;
    showPage();
    syncForm(draft);
    applied = true;
    setStatus("nirva-theme-status-reset");
  });
  $("export").addEventListener("click", () =>
    exportTheme().catch(error =>
      setStatus(
        "nirva-theme-status-file-error",
        { reason: error.message },
        true
      )
    )
  );
  $("import").addEventListener("click", () =>
    importTheme().catch(error =>
      setStatus(
        "nirva-theme-status-file-error",
        { reason: error.message },
        true
      )
    )
  );
  $("blur").addEventListener("input", () => {
    $("blur-value").value = `${$("blur").value} px`;
  });
  $("roundness").addEventListener("input", () => {
    $("roundness-value").value = `${$("roundness").value} px`;
  });
  $("speed").addEventListener("input", () => {
    $("speed-value").value = `${$("speed").value}%`;
  });
}

window.addEventListener("pagehide", () => {
  if (!applied) {
    NirvaTheme.cancelPreview();
  }
});

start();
