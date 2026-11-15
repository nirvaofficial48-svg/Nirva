/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

/* global add_task, Assert, BrowserTestUtils, gBrowser, IOUtils, PathUtils, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaTheme } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/theme/NirvaTheme.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const THEME_URL = "chrome://browser/content/nirva/studio.html";
const MockFilePicker = SpecialPowers.MockFilePicker;
const root = document.documentElement;

registerCleanupFunction(() => {
  NirvaTheme.cancelPreview();
  for (const pref of [
    "nirva.theme.enabled",
    "nirva.theme.settings",
    "nirva.look",
    "nirva.mode",
    "nirva.motion.style",
    "nirva.motion.speed",
    "nirva.lite.enabled",
  ]) {
    Services.prefs.clearUserPref(pref);
  }
});

add_task(async function test_presets_are_curated_and_contrast_safe() {
  Assert.equal(
    NirvaTheme.PRESETS.length,
    3,
    "three curated themes are available"
  );
  for (const preset of NirvaTheme.PRESETS) {
    const settings = NirvaTheme.preset(preset.id);
    for (const mode of ["bright", "dark"]) {
      const accent = settings.appearance.accents[settings.look][mode];
      Assert.ok(
        accent || (settings.look == "cockpit" && mode == "bright"),
        `${preset.name} has a ${mode} accent`
      );
      if (accent) {
        const ground = {
          glass: { bright: "#E8ECEF", dark: "#0E1318" },
          cockpit: { dark: "#0B0E11" },
          paper: { bright: "#F5F0E6", dark: "#1F1D1A" },
        }[settings.look][mode];
        Assert.greaterOrEqual(
          NirvaTheme.contrastRatio(accent, ground),
          4.5,
          `${preset.name} ${mode} accent meets contrast`
        );
      }
    }
  }
});

add_task(async function test_theme_file_round_trip_and_rejection() {
  const settings = NirvaTheme.preset("paper-linen");
  const text = NirvaTheme.serializeTheme(settings, "Paper / Linen");
  const parsed = NirvaTheme.parseTheme(text);
  Assert.equal(parsed.name, "Paper / Linen", "the theme name is preserved");
  Assert.deepEqual(
    parsed.settings,
    settings,
    "settings round-trip without loss"
  );
  Assert.throws(
    () => NirvaTheme.parseTheme('{"format":"nirva-theme","version":2}'),
    /not supported/,
    "unsupported file versions are rejected"
  );
  Assert.throws(
    () => NirvaTheme.parseTheme(" ".repeat(65537)),
    /smaller than 64 KB/,
    "oversized files are rejected"
  );
  Assert.throws(
    () =>
      NirvaTheme.normalizeSettings({
        ...NirvaTheme.factorySettings,
        appearance: {
          ...NirvaTheme.defaultAppearance,
          accents: { bright: "#777777", dark: "#777777" },
        },
      }),
    /4.5:1/,
    "an accent with insufficient contrast is rejected"
  );
});

add_task(async function test_preview_and_apply_cover_all_browser_windows() {
  const settings = NirvaTheme.preset("paper-linen");
  NirvaTheme.preview(settings);
  const loadedFonts = await document.fonts.load('16px "Figtree"');
  Assert.ok(loadedFonts.length, "Paper's bundled interface font loads");
  const newWindow = await BrowserTestUtils.openNewBrowserWindow();
  await TestUtils.waitForCondition(
    () =>
      newWindow.document.documentElement.getAttribute("data-nirva-look") ==
      "paper",
    "new windows receive the active Theme Studio preview"
  );
  Assert.equal(
    root.getAttribute("data-nirva-look"),
    "paper",
    "current window previews Paper"
  );
  Assert.ok(
    ["bright", "dark"].includes(root.getAttribute("data-nirva-mode")),
    "system mode resolves to a concrete mode"
  );
  Assert.equal(
    newWindow.document.documentElement.getAttribute("data-nirva-look"),
    "paper",
    "new windows inherit preview"
  );
  Assert.equal(
    root.style.getPropertyValue("--nirva-font-ui"),
    "",
    "look-default font remains token-driven"
  );
  Assert.equal(
    root.getAttribute("data-nirva-wallpaper"),
    "linen",
    "wallpaper preview is applied"
  );

  NirvaTheme.apply(settings);
  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "paper",
    "the look is saved"
  );
  Assert.equal(
    Services.prefs.getStringPref("nirva.mode"),
    "system",
    "the mode is saved"
  );
  Assert.equal(
    root.style.getPropertyValue("--nirva-accent"),
    NirvaTheme.DEFAULT_ACCENTS.paper[root.getAttribute("data-nirva-mode")],
    "the accessible custom accent is applied"
  );
  Assert.equal(
    JSON.parse(Services.prefs.getStringPref("nirva.theme.settings")).wallpaper,
    "linen",
    "custom appearance settings persist in the profile"
  );
  await BrowserTestUtils.closeWindow(newWindow);
  NirvaTheme.reset();
});

add_task(async function test_theme_studio_command_opens_a_working_page() {
  const command = NirvaCommands.get("theme-studio", window);
  Assert.ok(command, "Theme Studio is registered in the command bar");
  Assert.equal(
    command.feature,
    "theme",
    "the command belongs to the theme feature"
  );
  NirvaCommands.run("theme-studio", window);
  await TestUtils.waitForCondition(
    () => gBrowser.selectedBrowser.currentURI.spec == THEME_URL,
    "the command opens Theme Studio"
  );
  const browser = gBrowser.selectedBrowser;
  await TestUtils.waitForCondition(
    () => browser.contentDocument?.readyState == "complete",
    "Theme Studio finishes loading"
  );
  const page = browser.contentDocument;
  await TestUtils.waitForCondition(
    () =>
      page.getElementById("status")?.textContent.includes("Previewing changes"),
    "Theme Studio controls finish initializing"
  );
  Assert.ok(page.getElementById("apply"), "the Theme Studio controls load");
  Assert.ok(page.getElementById("import"), "theme import is available");
  Assert.ok(page.getElementById("export"), "theme export is available");

  const look = page.getElementById("look");
  look.value = "paper";
  look.dispatchEvent(new page.defaultView.Event("change", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => NirvaTheme.previewSettings?.look == "paper",
    "the live controls update the browser preview"
  );

  const tempDir = await IOUtils.createUniqueDirectory(
    PathUtils.tempDir,
    "nirva-theme-test"
  );
  const themeFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  themeFile.initWithPath(PathUtils.join(tempDir, "custom.nirvatheme"));
  registerCleanupFunction(async () => {
    MockFilePicker.cleanup();
    await IOUtils.remove(tempDir, { recursive: true });
  });
  MockFilePicker.init(window);
  MockFilePicker.returnValue = MockFilePicker.returnOK;
  MockFilePicker.showCallback = () => MockFilePicker.setFiles([themeFile]);
  page.getElementById("export").click();
  await TestUtils.waitForCondition(
    () =>
      page.getElementById("status").getAttribute("data-l10n-id") ==
      "nirva-theme-status-exported",
    "export finishes after writing the selected file"
  );
  const exported = await IOUtils.readUTF8(themeFile.path);
  Assert.equal(
    NirvaTheme.parseTheme(exported).settings.look,
    "paper",
    "Export writes a portable theme with the current settings"
  );

  look.value = "glass";
  look.dispatchEvent(new page.defaultView.Event("change", { bubbles: true }));
  await TestUtils.waitForCondition(
    () => NirvaTheme.previewSettings?.look == "glass",
    "the preview changes before importing the saved theme"
  );
  MockFilePicker.showCallback = () => MockFilePicker.setFiles([themeFile]);
  page.getElementById("import").click();
  await TestUtils.waitForCondition(
    () => NirvaTheme.previewSettings?.look == "paper",
    "import reads the selected file into the live preview"
  );
  Assert.equal(
    page.getElementById("status").getAttribute("data-l10n-id"),
    "nirva-theme-status-imported",
    "the import reports completion"
  );
  page.getElementById("apply").click();
  Assert.equal(
    Services.prefs.getStringPref("nirva.look"),
    "paper",
    "Apply persists the preview"
  );
  Assert.equal(
    root.getAttribute("data-nirva-look"),
    "paper",
    "the browser keeps the applied look"
  );
  NirvaTheme.reset();
  BrowserTestUtils.removeTab(gBrowser.selectedTab);
});

add_task(async function test_accents_are_kept_per_look_and_fitted() {
  const fitted = NirvaTheme.fitAccent("glass", "bright", "#FFD0E0");
  Assert.notEqual(fitted, "#FFD0E0", "a faint colour is adjusted");
  Assert.greaterOrEqual(
    NirvaTheme.contrastRatio(fitted, "#E8ECEF"),
    4.5,
    "the adjusted accent is readable on Glass bright"
  );
  const [r, g, b] = fitted
    .slice(1)
    .match(/.{2}/g)
    .map(channel => parseInt(channel, 16));
  Assert.ok(r > g && r > b, "the adjusted accent keeps its pink hue");

  const legacy = NirvaTheme.normalizeSettings({
    ...NirvaTheme.factorySettings,
    look: "paper",
    appearance: {
      ...NirvaTheme.defaultAppearance,
      accents: { bright: "#2F4B7C", dark: null },
    },
  });
  Assert.equal(
    legacy.appearance.accents.paper.bright,
    "#2F4B7C",
    "an older theme's accents are kept for its look"
  );
  Assert.equal(
    legacy.appearance.accents.glass.bright,
    null,
    "other looks keep their defaults"
  );

  const settings = NirvaTheme.factorySettings;
  settings.look = "glass";
  settings.mode = "dark";
  settings.appearance.accents.glass.dark = "#FFB0C0";
  settings.appearance.accents.paper.dark = "#9CC3A4";
  NirvaTheme.apply(settings);
  Assert.equal(
    root.style.getPropertyValue("--nirva-accent"),
    "#FFB0C0",
    "Glass dark uses its own accent"
  );
  NirvaTheme.apply({ ...NirvaTheme.settings, look: "paper" });
  Assert.equal(
    root.style.getPropertyValue("--nirva-accent"),
    "#9CC3A4",
    "Paper dark uses its own accent"
  );
  NirvaTheme.apply({ ...NirvaTheme.settings, look: "glass" });
  Assert.equal(
    root.style.getPropertyValue("--nirva-accent"),
    "#FFB0C0",
    "Glass's accent comes back when Glass is chosen again"
  );
  NirvaTheme.reset();
});

add_task(async function test_studio_controls_change_what_is_shown() {
  Services.prefs.setStringPref("nirva.look", "glass");
  Services.prefs.setStringPref("nirva.mode", "dark");
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, THEME_URL);
  const page = tab.linkedBrowser.contentDocument;
  const studio = page.defaultView;
  await TestUtils.waitForCondition(
    () =>
      page.getElementById("status")?.textContent.includes("Previewing changes"),
    "Theme Studio controls finish initializing"
  );
  const pageRoot = page.documentElement;
  const set = (id, value) => {
    const control = page.getElementById(id);
    if (control.type == "checkbox") {
      control.checked = value;
    } else {
      control.value = value;
    }
    control.dispatchEvent(new studio.Event("change", { bubbles: true }));
  };

  set("accent-bright", "#ffd0e0");
  Assert.equal(
    pageRoot.getAttribute("data-nirva-mode"),
    "bright",
    "editing the bright accent shows the page in bright"
  );
  const shown = pageRoot.style.getPropertyValue("--nirva-accent");
  Assert.equal(
    page.getElementById("accent-bright").value.toUpperCase(),
    shown,
    "the picker shows the adjusted colour that is applied"
  );
  Assert.equal(
    page.getElementById("status").getAttribute("data-l10n-id"),
    "nirva-theme-status-adjusted",
    "the adjustment is explained"
  );
  Assert.equal(
    root.getAttribute("data-nirva-mode"),
    "dark",
    "the browser itself stays in its real mode"
  );
  page.querySelector('[data-preview-mode="dark"]').click();
  Assert.equal(
    pageRoot.getAttribute("data-nirva-mode"),
    "dark",
    "the preview switch shows dark"
  );

  set("ui-font", "Newsreader");
  Assert.equal(
    studio
      .getComputedStyle(page.body)
      .fontFamily.split(",")[0]
      .replaceAll('"', "")
      .trim(),
    "Newsreader",
    "the interface font changes the page"
  );

  set("speed", "300");
  Assert.ok(
    page.querySelector(".preview-content").classList.contains("replay"),
    "changing the speed replays the motion in the preview"
  );
  Assert.equal(
    studio.getComputedStyle(pageRoot).getPropertyValue("--nirva-speed").trim(),
    "3",
    "the speed reaches the motion timing"
  );
  set("lite", true);
  Assert.equal(
    pageRoot.getAttribute("data-nirva-lite"),
    "true",
    "Lite mode reaches the page"
  );

  set("wallpaper", "forest");
  const scene = page.querySelector(".preview-content .nirva-wall-scene");
  Assert.ok(
    studio.getComputedStyle(scene).backgroundImage.includes("wall-pines.svg"),
    "Forest draws its treeline in Glass"
  );
  set("look", "cockpit");
  Assert.ok(
    studio.getComputedStyle(scene).backgroundImage.includes("wall-contours"),
    "Forest becomes contour lines in Cockpit"
  );
  set("look", "paper");
  Assert.ok(
    !page.getElementById("wallpaper").disabled,
    "Paper can choose a wallpaper too"
  );
  Assert.ok(
    studio.getComputedStyle(scene).backgroundImage.includes("wall-pines.svg"),
    "Forest is printed on Paper"
  );

  page.getElementById("apply").click();
  const stored = JSON.parse(
    Services.prefs.getStringPref("nirva.theme.settings")
  );
  Assert.equal(
    stored.accents.glass.bright,
    shown,
    "Apply saves the Glass bright accent"
  );
  Assert.equal(stored.uiFont, "Newsreader", "Apply saves the font");
  Assert.equal(
    Services.prefs.getIntPref("nirva.motion.speed"),
    300,
    "Apply saves the speed"
  );
  Assert.ok(Services.prefs.getBoolPref("nirva.lite.enabled"), "and Lite mode");
  Assert.equal(
    root.getAttribute("data-nirva-wallpaper"),
    "forest",
    "the browser shows the saved wallpaper"
  );
  NirvaTheme.reset();
  BrowserTestUtils.removeTab(tab);
});
