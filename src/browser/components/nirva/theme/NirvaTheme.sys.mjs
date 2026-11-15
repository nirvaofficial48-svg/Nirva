/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { NirvaLooks } from "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs";
import { NirvaMotion } from "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs";

const PREF_ENABLED = "nirva.theme.enabled";
const PREF_SETTINGS = "nirva.theme.settings";
const PREF_PREVIEW = "nirva.theme.preview";
const PREF_LOOK = "nirva.look";
const PREF_MODE = "nirva.mode";
const PREF_MOTION_STYLE = "nirva.motion.style";
const PREF_MOTION_SPEED = "nirva.motion.speed";
const PREF_LITE = "nirva.lite.enabled";
const STUDIO_URL = "chrome://browser/content/nirva/studio.html";
const MODES = ["bright", "dark", "system"];
const DENSITIES = ["compact", "comfortable", "spacious"];
const WALLPAPERS = ["none", "mist", "dawn", "forest", "linen"];
const FONTS = [
  "Hanken Grotesk",
  "Manrope",
  "JetBrains Mono",
  "Newsreader",
  "Figtree",
];
const GROUNDS = {
  glass: { bright: "#E8ECEF", dark: "#0E1318" },
  cockpit: { dark: "#0B0E11" },
  paper: { bright: "#F5F0E6", dark: "#1F1D1A" },
};
const DEFAULT_ACCENTS = {
  glass: { bright: "#23408E", dark: "#8FB0FF" },
  cockpit: { bright: null, dark: "#F5B25C" },
  paper: { bright: "#2F4B7C", dark: "#A9BEE6" },
};
const LOOKS = ["glass", "cockpit", "paper"];
const NO_ACCENTS = {
  glass: { bright: null, dark: null },
  cockpit: { bright: null, dark: null },
  paper: { bright: null, dark: null },
};
const DEFAULT_APPEARANCE = {
  accents: NO_ACCENTS,
  blur: null,
  roundness: null,
  density: "comfortable",
  uiFont: null,
  displayFont: null,
  wallpaper: "none",
};
const FACTORY_SETTINGS = {
  look: "glass",
  mode: "system",
  appearance: DEFAULT_APPEARANCE,
  motion: { style: "smooth", speed: 100, lite: false },
};
const PRESETS = [
  {
    id: "glass-mist",
    name: "Glass / Mist",
    settings: {
      look: "glass",
      mode: "system",
      appearance: {
        accents: { ...copy(NO_ACCENTS), glass: { ...DEFAULT_ACCENTS.glass } },
        blur: 28,
        roundness: 20,
        density: "comfortable",
        uiFont: null,
        displayFont: null,
        wallpaper: "mist",
      },
    },
  },
  {
    id: "cockpit-amber",
    name: "Cockpit / Amber",
    settings: {
      look: "cockpit",
      mode: "dark",
      appearance: {
        accents: {
          ...copy(NO_ACCENTS),
          cockpit: { ...DEFAULT_ACCENTS.cockpit },
        },
        blur: 0,
        roundness: 0,
        density: "compact",
        uiFont: null,
        displayFont: null,
        wallpaper: "none",
      },
    },
  },
  {
    id: "paper-linen",
    name: "Paper / Linen",
    settings: {
      look: "paper",
      mode: "system",
      appearance: {
        accents: { ...copy(NO_ACCENTS), paper: { ...DEFAULT_ACCENTS.paper } },
        blur: 0,
        roundness: 6,
        density: "comfortable",
        uiFont: null,
        displayFont: null,
        wallpaper: "linen",
      },
    },
  },
];

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function isHexColor(value) {
  return typeof value == "string" && /^#[0-9a-f]{6}$/i.test(value);
}

function luminance(color) {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    .map(channel => parseInt(channel, 16) / 255)
    .map(value =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    );
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrastRatio(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function accentIsSafe(look, mode, color) {
  return (
    color === null ||
    (isHexColor(color) && contrastRatio(color, GROUNDS[look][mode]) >= 4.5)
  );
}

function hexToHsl(color) {
  const [r, g, b] = color
    .slice(1)
    .match(/.{2}/g)
    .map(channel => parseInt(channel, 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max == min) {
    return [0, 0, l];
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max == r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max == g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  return [h / 6, s, l];
}

function hslToHex([h, s, l]) {
  const hue = t => {
    t = (t + 1) % 1;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    if (t < 1 / 6) {
      return p + (q - p) * 6 * t;
    }
    if (t < 1 / 2) {
      return q;
    }
    if (t < 2 / 3) {
      return p + (q - p) * (2 / 3 - t) * 6;
    }
    return p;
  };
  return (
    "#" +
    [h + 1 / 3, h, h - 1 / 3]
      .map(t =>
        Math.round(hue(t) * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
      .toUpperCase()
  );
}

/**
 * Keeps the hue and saturation of a chosen accent and moves its lightness away from the
 * look's background until it reaches 4.5:1 contrast.
 *
 * @param {string} look glass, cockpit or paper.
 * @param {string} mode bright or dark.
 * @param {?string} color "#RRGGBB", or null for the look's default.
 * @returns {?string} A readable colour, or null.
 */
function fitAccent(look, mode, color) {
  if (color === null || !isHexColor(color) || !GROUNDS[look][mode]) {
    return color;
  }
  color = color.toUpperCase();
  if (accentIsSafe(look, mode, color)) {
    return color;
  }
  const [h, s, l] = hexToHsl(color);
  const step = mode == "bright" ? -0.01 : 0.01;
  for (let next = l + step; next >= 0 && next <= 1; next += step) {
    const candidate = hslToHex([h, s, next]);
    if (accentIsSafe(look, mode, candidate)) {
      return candidate;
    }
  }
  return mode == "bright" ? "#000000" : "#FFFFFF";
}

function normalizeAccents(look, accents) {
  const result = copy(NO_ACCENTS);
  if (accents && ("bright" in accents || "dark" in accents)) {
    result[look] = {
      bright: accents.bright ?? null,
      dark: accents.dark ?? null,
    };
  } else {
    for (const name of LOOKS) {
      result[name] = {
        bright: accents?.[name]?.bright ?? null,
        dark: accents?.[name]?.dark ?? null,
      };
    }
  }
  result.cockpit.bright = null;
  return result;
}

function defaultRadius(look) {
  return { glass: 20, cockpit: 0, paper: 6 }[look];
}

function defaultBlur(look) {
  return look == "glass" ? 28 : 0;
}

function resolvedMode(win, settings) {
  if (settings.look == "cockpit") {
    return "dark";
  }
  if (settings.mode != "system") {
    return settings.mode;
  }
  return win.matchMedia("(-moz-system-dark-theme)").matches ? "dark" : "bright";
}

/** Theme Studio (S6): controlled theme editing, contrast checks, and portable JSON themes. */
export const NirvaTheme = {
  PRESETS,
  DEFAULT_ACCENTS,
  fitAccent,
  FONTS,
  _initialized: false,
  _watched: new WeakSet(),

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    this._clearPreview();
    for (const pref of [
      PREF_ENABLED,
      PREF_SETTINGS,
      PREF_LOOK,
      PREF_MODE,
      PREF_MOTION_STYLE,
      PREF_MOTION_SPEED,
      PREF_LITE,
    ]) {
      Services.prefs.addObserver(pref, this);
    }
    Services.wm.addListener(this);
    Services.obs.addObserver(this, "document-element-inserted");
    this.applyToAllWindows();
    this._registerCommands();
  },

  _registerCommands() {
    NirvaCommands.registerAll([
      {
        id: "theme-studio",
        feature: "theme",
        l10nId: "nirva-command-theme-studio",
        keywords: "theme appearance customize look",
        run: win => {
          Services.prefs.setBoolPref(PREF_ENABLED, true);
          this.openStudio(win);
        },
      },
      {
        id: "theme-reset",
        feature: "theme",
        l10nId: "nirva-command-theme-reset",
        keywords: "theme appearance default restore",
        run: () => this.reset(),
      },
    ]);
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get settings() {
    const appearance = this._readAppearance();
    return this.normalizeSettings({
      look: NirvaLooks.look,
      mode: NirvaLooks.mode,
      appearance,
      motion: {
        style: NirvaMotion.style,
        speed: NirvaMotion.speed,
        lite: NirvaMotion.lite,
      },
    });
  },

  get previewSettings() {
    try {
      const stored = Services.prefs.getStringPref(PREF_PREVIEW, "");
      return stored ? this.normalizeSettings(JSON.parse(stored)) : null;
    } catch (error) {
      this._clearPreview();
      return null;
    }
  },

  get contrastRatio() {
    return contrastRatio;
  },

  get defaultAppearance() {
    return copy(DEFAULT_APPEARANCE);
  },

  get factorySettings() {
    return copy(FACTORY_SETTINGS);
  },

  openStudio(win) {
    if (!win?.gBrowser) {
      return null;
    }
    for (const browserWindow of Services.wm.getEnumerator(
      "navigator:browser"
    )) {
      const existing = Array.from(browserWindow.gBrowser.tabs).find(
        tab => tab.linkedBrowser?.currentURI?.spec == STUDIO_URL
      );
      if (existing) {
        browserWindow.gBrowser.selectedTab = existing;
        browserWindow.focus();
        return existing;
      }
    }
    const tab = win.gBrowser.addTrustedTab(STUDIO_URL);
    win.gBrowser.selectedTab = tab;
    return tab;
  },

  normalizeSettings(input) {
    if (!input || typeof input != "object") {
      throw new Error("Theme settings must be an object");
    }
    const look = input.look;
    const mode = input.mode;
    if (!NirvaLooks.LOOKS.includes(look)) {
      throw new Error("Choose Glass, Cockpit, or Paper");
    }
    if (!MODES.includes(mode)) {
      throw new Error("Choose Bright, Dark, or Match my computer");
    }
    const appearance = { ...DEFAULT_APPEARANCE, ...(input.appearance || {}) };
    appearance.accents = normalizeAccents(look, input.appearance?.accents);
    for (const accentLook of LOOKS) {
      for (const accentMode of ["bright", "dark"]) {
        const color = appearance.accents[accentLook][accentMode];
        if (accentLook == "cockpit" && accentMode == "bright") {
          continue;
        }
        if (!accentIsSafe(accentLook, accentMode, color)) {
          throw new Error(`The ${accentMode} accent needs 4.5:1 contrast`);
        }
      }
    }
    if (
      appearance.blur !== null &&
      (!Number.isFinite(appearance.blur) ||
        appearance.blur < 0 ||
        appearance.blur > 40)
    ) {
      throw new Error("Blur must be between 0 and 40");
    }
    if (
      appearance.roundness !== null &&
      (!Number.isFinite(appearance.roundness) ||
        appearance.roundness < 0 ||
        appearance.roundness > { glass: 28, cockpit: 4, paper: 12 }[look])
    ) {
      throw new Error("Corner roundness is outside this look's range");
    }
    if (!DENSITIES.includes(appearance.density)) {
      throw new Error("Choose Compact, Comfortable, or Spacious density");
    }
    for (const key of ["uiFont", "displayFont"]) {
      if (appearance[key] !== null && !FONTS.includes(appearance[key])) {
        throw new Error("Choose one of Nirva's bundled fonts");
      }
    }
    if (!WALLPAPERS.includes(appearance.wallpaper)) {
      throw new Error("Choose a bundled wallpaper");
    }
    const motion = { ...FACTORY_SETTINGS.motion, ...(input.motion || {}) };
    if (!NirvaMotion.STYLES.includes(motion.style)) {
      throw new Error("Choose Springy, Smooth, or Minimal motion");
    }
    if (
      !Number.isInteger(motion.speed) ||
      motion.speed < 100 ||
      motion.speed > 300
    ) {
      throw new Error("Animation speed must be between 100% and 300%");
    }
    if (typeof motion.lite != "boolean") {
      throw new Error("Lite mode must be on or off");
    }
    return {
      look,
      mode: look == "cockpit" ? "dark" : mode,
      appearance: {
        accents: appearance.accents,
        blur: appearance.blur,
        roundness: appearance.roundness,
        density: appearance.density,
        uiFont: appearance.uiFont,
        displayFont: appearance.displayFont,
        wallpaper: appearance.wallpaper,
      },
      motion,
    };
  },

  sanitizeSettings(input) {
    const settings = copy(input);
    settings.appearance.accents = normalizeAccents(
      settings.look,
      settings.appearance.accents
    );
    if (settings?.look == "cockpit") {
      settings.mode = "dark";
    }
    const radiusMax = { glass: 28, cockpit: 4, paper: 12 }[settings.look];
    if (Number.isFinite(settings?.appearance?.roundness)) {
      settings.appearance.roundness = Math.min(
        radiusMax,
        Math.max(0, settings.appearance.roundness)
      );
    }
    for (const look of LOOKS) {
      for (const mode of ["bright", "dark"]) {
        const accents = settings.appearance.accents[look];
        accents[mode] = fitAccent(look, mode, accents[mode]);
      }
    }
    return this.normalizeSettings(settings);
  },

  _readAppearance() {
    try {
      const stored = JSON.parse(
        Services.prefs.getStringPref(PREF_SETTINGS, "{}")
      );
      const appearance = { ...DEFAULT_APPEARANCE, ...stored };
      appearance.accents = normalizeAccents(NirvaLooks.look, stored.accents);
      for (const look of LOOKS) {
        for (const mode of ["bright", "dark"]) {
          if (!accentIsSafe(look, mode, appearance.accents[look][mode])) {
            appearance.accents[look][mode] = null;
          }
        }
      }
      return this.normalizeSettings({
        ...FACTORY_SETTINGS,
        look: NirvaLooks.look,
        mode: NirvaLooks.mode,
        appearance,
      }).appearance;
    } catch (error) {
      console.error("Nirva: stored theme settings could not be read", error);
      return copy(DEFAULT_APPEARANCE);
    }
  },

  preview(input) {
    const settings = this.normalizeSettings(input);
    Services.prefs.setStringPref(PREF_PREVIEW, JSON.stringify(settings));
    this.applyToAllWindows();
    return settings;
  },

  cancelPreview() {
    this._clearPreview();
    this.applyToAllWindows();
  },

  apply(input) {
    const settings = this.normalizeSettings(input);
    this._clearPreview();
    Services.prefs.setStringPref(PREF_LOOK, settings.look);
    Services.prefs.setStringPref(PREF_MODE, settings.mode);
    Services.prefs.setStringPref(PREF_MOTION_STYLE, settings.motion.style);
    Services.prefs.setIntPref(PREF_MOTION_SPEED, settings.motion.speed);
    Services.prefs.setBoolPref(PREF_LITE, settings.motion.lite);
    Services.prefs.setStringPref(
      PREF_SETTINGS,
      JSON.stringify(settings.appearance)
    );
    this.applyToAllWindows();
    return settings;
  },

  reset() {
    this._clearPreview();
    Services.prefs.setStringPref(PREF_LOOK, FACTORY_SETTINGS.look);
    Services.prefs.setStringPref(PREF_MODE, FACTORY_SETTINGS.mode);
    Services.prefs.setStringPref(
      PREF_MOTION_STYLE,
      FACTORY_SETTINGS.motion.style
    );
    Services.prefs.setIntPref(PREF_MOTION_SPEED, FACTORY_SETTINGS.motion.speed);
    Services.prefs.setBoolPref(PREF_LITE, FACTORY_SETTINGS.motion.lite);
    Services.prefs.clearUserPref(PREF_SETTINGS);
    this.applyToAllWindows();
    return this.settings;
  },

  serializeTheme(input, name = "My Nirva theme") {
    const settings = this.normalizeSettings(input);
    const cleanName = String(name).trim().slice(0, 48) || "My Nirva theme";
    return JSON.stringify(
      { format: "nirva-theme", version: 1, name: cleanName, settings },
      null,
      2
    );
  },

  parseTheme(text) {
    if (typeof text != "string" || text.length > 65536) {
      throw new Error("Theme files must be smaller than 64 KB");
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error("This file is not valid theme JSON");
    }
    if (data?.format != "nirva-theme" || data.version != 1) {
      throw new Error("This Nirva theme file version is not supported");
    }
    return {
      name: String(data.name || "Imported theme")
        .trim()
        .slice(0, 48),
      settings: this.normalizeSettings(data.settings),
    };
  },

  preset(id) {
    const preset = PRESETS.find(item => item.id == id);
    if (!preset) {
      throw new Error(`Unknown theme preset: ${id}`);
    }
    return this.normalizeSettings({
      ...copy(FACTORY_SETTINGS),
      ...copy(preset.settings),
      appearance: {
        ...copy(FACTORY_SETTINGS.appearance),
        ...copy(preset.settings.appearance),
      },
    });
  },

  observe(subject, topic) {
    if (topic == "nsPref:changed") {
      this.applyToAllWindows();
    } else if (topic == "document-element-inserted") {
      const win = subject.defaultView;
      if (win && this._isBrowserWindow(win)) {
        this.applyToWindow(win);
      }
    }
  },

  onOpenWindow(appWin) {
    const win = appWin.docShell.domWindow;
    win.addEventListener(
      "load",
      () => {
        if (
          win.document.documentElement.getAttribute("windowtype") ==
          "navigator:browser"
        ) {
          this.applyToWindow(win);
        }
      },
      { once: true }
    );
  },

  onCloseWindow() {},

  onWindowTitleChange() {},

  _isBrowserWindow(win) {
    return (
      win.top === win &&
      win.document.nodePrincipal.isSystemPrincipal &&
      win.document.documentURI.startsWith("chrome://")
    );
  },

  applyToAllWindows() {
    for (const win of Services.wm.getEnumerator("navigator:browser")) {
      if (!win.closed) {
        this.applyToWindow(win);
      }
    }
  },

  applyToWindow(win) {
    const root = win.document.documentElement;
    if (!root?.style) {
      return;
    }
    if (!this._watched.has(win)) {
      this._watched.add(win);
      win
        .matchMedia("(-moz-system-dark-theme)")
        .addEventListener("change", () => this.applyToWindow(win));
    }
    if (!this.enabled) {
      this._clearThemeFromElement(root);
      return;
    }
    this.applyToElement(root, this.previewSettings || this.settings, win);
  },

  _clearPreview() {
    if (Services.prefs.prefHasUserValue(PREF_PREVIEW)) {
      Services.prefs.clearUserPref(PREF_PREVIEW);
    }
  },

  /**
   * Styles one document root.
   *
   * @param {Element} root The document element to style.
   * @param {object} input Theme settings.
   * @param {Window} win The window whose system mode is followed.
   * @param {?string} forcedMode "bright" or "dark" to override the mode; Theme Studio
   *   uses it to show its own page in the mode whose accent is being edited.
   */
  applyToElement(root, input, win, forcedMode = null) {
    if (!root?.style) {
      return;
    }
    const settings = this.normalizeSettings(input);
    const mode =
      settings.look != "cockpit" && forcedMode
        ? forcedMode
        : resolvedMode(win, settings);
    const appearance = settings.appearance;
    root.setAttribute("data-nirva-look", settings.look);
    root.setAttribute("data-nirva-mode", mode);
    root.setAttribute("data-nirva-theme", "true");
    root.setAttribute("data-nirva-motion", settings.motion.style);
    root.toggleAttribute("data-nirva-lite", settings.motion.lite);
    if (settings.motion.lite) {
      root.setAttribute("data-nirva-lite", "true");
    }
    root.style.setProperty(
      "--nirva-speed",
      String(settings.motion.speed / 100)
    );
    const setOrRemove = (name, value) => {
      if (value === null || value === undefined || value === "") {
        root.style.removeProperty(name);
      } else {
        root.style.setProperty(name, value);
      }
    };
    const accent = appearance.accents[settings.look][mode];
    setOrRemove("--nirva-accent", accent);
    setOrRemove(
      "--nirva-accent-glow",
      accent ? `color-mix(in srgb, ${accent} 16%, transparent)` : null
    );
    setOrRemove(
      "--nirva-panel-blur",
      settings.look == "glass" && !settings.motion.lite
        ? `blur(${appearance.blur ?? defaultBlur(settings.look)}px) saturate(1.4)`
        : "none"
    );
    const radius = appearance.roundness ?? defaultRadius(settings.look);
    setOrRemove("--nirva-radius-panel", `${radius}px`);
    setOrRemove(
      "--nirva-radius-control",
      `${Math.min(radius, settings.look == "glass" ? 12 : radius)}px`
    );
    setOrRemove(
      "--nirva-radius-page",
      `${Math.min(radius, settings.look == "glass" ? 14 : radius)}px`
    );
    const density = {
      compact: { gap: 16, padding: 12 },
      comfortable: { gap: 20, padding: 16 },
      spacious: { gap: 24, padding: 20 },
    }[appearance.density];
    setOrRemove("--nirva-grid-gap", `${density.gap}px`);
    setOrRemove("--nirva-density-padding", `${density.padding}px`);
    setOrRemove(
      "--nirva-font-ui",
      appearance.uiFont ? `"${appearance.uiFont}"` : null
    );
    setOrRemove(
      "--nirva-font-display",
      appearance.displayFont ? `"${appearance.displayFont}"` : null
    );
    root.setAttribute("data-nirva-wallpaper", appearance.wallpaper);
  },

  _clearThemeFromElement(root) {
    root.removeAttribute("data-nirva-theme");
    root.removeAttribute("data-nirva-wallpaper");
    for (const property of [
      "--nirva-accent",
      "--nirva-accent-glow",
      "--nirva-panel-blur",
      "--nirva-radius-panel",
      "--nirva-radius-control",
      "--nirva-radius-page",
      "--nirva-grid-gap",
      "--nirva-density-padding",
      "--nirva-font-ui",
      "--nirva-font-display",
    ]) {
      root.style.removeProperty(property);
    }
  },

  _getDefaultAccent(look, mode) {
    return DEFAULT_ACCENTS[look][mode];
  },
};
