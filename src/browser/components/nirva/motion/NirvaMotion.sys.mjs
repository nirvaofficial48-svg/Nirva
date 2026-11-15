/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";
import { nirvaInterfaceWindows } from "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs";
import { NirvaBurnAway } from "moz-src:///browser/components/nirva/motion/burn-away/NirvaBurnAway.sys.mjs";
import { NirvaMorph } from "moz-src:///browser/components/nirva/motion/morph/NirvaMorph.sys.mjs";
import { NirvaPageTransitions } from "moz-src:///browser/components/nirva/motion/page-transitions/NirvaPageTransitions.sys.mjs";
import { NirvaSplitSnap } from "moz-src:///browser/components/nirva/motion/split-snap/NirvaSplitSnap.sys.mjs";
import { NirvaSpring } from "moz-src:///browser/components/nirva/motion/spring/NirvaSpring.sys.mjs";
import { NirvaTabStacks } from "moz-src:///browser/components/nirva/motion/tab-stacks/NirvaTabStacks.sys.mjs";
import { NirvaWorkspaceSlide } from "moz-src:///browser/components/nirva/motion/workspace-slide/NirvaWorkspaceSlide.sys.mjs";

const PREF_ENABLED = "nirva.motion.enabled";
const PREF_STYLE = "nirva.motion.style";
const PREF_SPEED = "nirva.motion.speed";
const PREF_LITE = "nirva.lite.enabled";
const PREF_SLEEP_MINUTES = "nirva.lite.sleepMinutes";

const STYLES = ["springy", "smooth", "minimal"];
const SPEED_MIN = 100;
const SPEED_MAX = 300;
const SLEEP_CHECK_MS = 60 * 1000;

// Lite mode is offered on machines at or below these (SPEC S14).
const LITE_MEMORY_GB = 4;
const LITE_CORES = 2;

/**
 * Motion control (S8) and Lite mode (S14).
 *
 * Every chrome window root carries data-nirva-motion (springy, smooth or minimal), the
 * --nirva-speed multiplier and, in Lite mode, data-nirva-lite="true". The stylesheet
 * browser/themes/shared/nirva/motion.css turns these into the timing every animation uses.
 */
export const NirvaMotion = {
  STYLES,
  SPEED_MIN,
  SPEED_MAX,
  _initialized: false,
  _sleepTimer: null,
  // Tests replace this to pretend to be another computer.
  _machineOverride: null,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    for (const pref of [PREF_ENABLED, PREF_STYLE, PREF_SPEED, PREF_LITE]) {
      Services.prefs.addObserver(pref, this);
    }
    Services.obs.addObserver(this, "document-element-inserted");
    this.applyToAllWindows();
    this._updateSleepTimer();
    this._registerCommands();
    for (const sub of [
      NirvaMorph,
      NirvaSpring,
      NirvaWorkspaceSlide,
      NirvaPageTransitions,
      NirvaBurnAway,
      NirvaTabStacks,
      NirvaSplitSnap,
    ]) {
      try {
        sub.init();
      } catch (e) {
        console.error("Nirva motion sub-module failed to start", e);
      }
    }
  },

  get enabled() {
    return Services.prefs.getBoolPref(PREF_ENABLED, true);
  },

  get style() {
    const style = Services.prefs.getStringPref(PREF_STYLE, "smooth");
    return STYLES.includes(style) ? style : "smooth";
  },

  set style(value) {
    if (!STYLES.includes(value)) {
      throw new Error(`Unknown motion style: ${value}`);
    }
    Services.prefs.setStringPref(PREF_STYLE, value);
  },

  /** Speed in percent, always between SPEED_MIN and SPEED_MAX. */
  get speed() {
    const speed = Services.prefs.getIntPref(PREF_SPEED, SPEED_MIN);
    return Math.min(SPEED_MAX, Math.max(SPEED_MIN, speed));
  },

  set speed(value) {
    const speed = Math.round(Number(value));
    if (!(speed >= SPEED_MIN && speed <= SPEED_MAX)) {
      throw new Error(`Speed must be between ${SPEED_MIN} and ${SPEED_MAX}`);
    }
    Services.prefs.setIntPref(PREF_SPEED, speed);
  },

  get lite() {
    return Services.prefs.getBoolPref(PREF_LITE, false);
  },

  set lite(value) {
    Services.prefs.setBoolPref(PREF_LITE, !!value);
  },

  /**
   * What this computer has: memory in GB and real processor cores (not threads).
   *
   * @returns {Promise<{memoryGB: number, cores: number}>}
   */
  async machine() {
    if (this._machineOverride) {
      return this._machineOverride;
    }
    let memoryGB = Infinity;
    let cores = Infinity;
    try {
      memoryGB = Services.sysinfo.getProperty("memsize") / 1024 ** 3;
    } catch (e) {
      // Unknown memory counts as plenty: Lite mode is then simply not offered for it.
    }
    try {
      const info = await Services.sysinfo.processInfo;
      cores = info.cores || info.count || Infinity;
    } catch (e) {
      // Unknown processor: the same.
    }
    return { memoryGB, cores };
  },

  /**
   * Whether Lite mode should be offered on first run: 4 GB of memory or less, or two cores
   * or fewer. The memory test allows for machines that report a little under their nominal
   * size.
   *
   * @param {{memoryGB: number, cores: number}} machine from machine()
   * @returns {boolean}
   */
  shouldOfferLite(machine) {
    return (
      machine.memoryGB <= LITE_MEMORY_GB + 0.25 || machine.cores <= LITE_CORES
    );
  },

  observe(subject, topic, data) {
    if (topic == "nsPref:changed") {
      this.applyToAllWindows();
      if (data == PREF_LITE) {
        this._updateSleepTimer();
      }
      if (data == PREF_ENABLED) {
        for (const sub of [
          NirvaMorph,
          NirvaSpring,
          NirvaWorkspaceSlide,
          NirvaPageTransitions,
          NirvaBurnAway,
          NirvaTabStacks,
          NirvaSplitSnap,
        ]) {
          try {
            sub.applyToAllWindows();
          } catch (_e) {}
        }
      }
    } else if (topic == "document-element-inserted") {
      const win = subject.defaultView;
      if (
        win &&
        win.top === win &&
        subject.nodePrincipal.isSystemPrincipal &&
        subject.documentURI.startsWith("chrome://")
      ) {
        this.applyToWindow(win);
      }
    }
  },

  applyToAllWindows() {
    for (const win of nirvaInterfaceWindows()) {
      if (win.document.documentURI.startsWith("chrome://")) {
        this.applyToWindow(win);
      }
    }
  },

  applyToWindow(win) {
    const root = win.document.documentElement;
    // Some internal windows are plain XML documents whose root cannot be styled.
    if (!root?.style) {
      return;
    }
    if (!this.enabled) {
      root.removeAttribute("data-nirva-motion");
      root.removeAttribute("data-nirva-lite");
      root.style.removeProperty("--nirva-speed");
      return;
    }
    root.setAttribute("data-nirva-motion", this.style);
    root.toggleAttribute("data-nirva-lite", this.lite);
    if (this.lite) {
      // tokens.css matches the value "true".
      root.setAttribute("data-nirva-lite", "true");
    }
    root.style.setProperty("--nirva-speed", String(this.speed / 100));
  },

  // ---------- Lite mode: idle tabs go to sleep ----------

  _updateSleepTimer() {
    if (this._sleepTimer) {
      this._sleepTimer.cancel();
      this._sleepTimer = null;
    }
    if (this.enabled && this.lite) {
      this._sleepTimer = Cc["@mozilla.org/timer;1"].createInstance(Ci.nsITimer);
      this._sleepTimer.initWithCallback(
        () => {
          for (const win of Services.wm.getEnumerator("navigator:browser")) {
            if (!win.closed && win.gBrowser) {
              this.sleepIdleTabs(win).catch(console.error);
            }
          }
        },
        SLEEP_CHECK_MS,
        Ci.nsITimer.TYPE_REPEATING_SLACK
      );
    }
  },

  /**
   * Whether a tab may be put to sleep after being idle. Tabs in use are never touched.
   *
   * @param {MozTabbrowserTab} tab
   * @returns {boolean}
   */
  maySleep(tab) {
    return !(
      tab.selected ||
      tab.pinned ||
      tab.closing ||
      tab.hasAttribute("pending") ||
      tab.soundPlaying ||
      tab.hasAttribute("pictureinpicture") ||
      tab.hasAttribute("sharing") ||
      tab.linkedBrowser?._sharingState?.webRTC?.sharing ||
      !!tab.splitview?.tabs?.some(t => t.selected)
    );
  },

  /**
   * Puts to sleep the tabs of a window that have not been looked at for the Lite mode
   * waiting time. Firefox keeps what was typed into a sleeping page and gives it back when
   * the tab wakes; pages that ask before closing are left alone.
   *
   * @param {Window} win a browser window
   * @param {number} [now] the time to measure from, in milliseconds
   * @param {number} [minutes] how long a tab must be idle; Lite mode's time by default
   * @returns {MozTabbrowserTab[]} the tabs put to sleep
   */
  async sleepIdleTabs(
    win,
    now = Date.now(),
    minutes = Services.prefs.getIntPref(PREF_SLEEP_MINUTES, 5)
  ) {
    const waitMs = minutes * 60 * 1000;
    const idle = win.gBrowser.tabs.filter(
      tab => this.maySleep(tab) && now - tab.lastAccessed >= waitMs
    );
    const slept = [];
    for (const tab of idle) {
      if (await this.sleepTab(win, tab)) {
        slept.push(tab);
      }
    }
    return slept;
  },

  /**
   * Puts one tab to sleep after saving its state, so it wakes exactly as it was.
   * Not forced: a page with unsaved work that asks before closing stays awake.
   *
   * @param {Window} win
   * @param {MozTabbrowserTab} tab
   * @returns {Promise<boolean>} whether it went to sleep
   */
  async sleepTab(win, tab) {
    if (!tab.linkedPanel || !this.maySleep(tab)) {
      return false;
    }
    await win.gBrowser.prepareDiscardBrowser(tab);
    // The person may have switched to it while its state was being saved.
    if (!tab.isConnected || !tab.linkedPanel || !this.maySleep(tab)) {
      return false;
    }
    return !!win.gBrowser.discardBrowser(tab, { renderDiscarded: true });
  },

  _registerCommands() {
    const on = () => this.enabled;
    NirvaCommands.registerAll([
      ...STYLES.map(style => ({
        id: `motion-${style}`,
        feature: "motion",
        l10nId: `nirva-command-motion-${style}`,
        keywords: "animation movement effects",
        run: () => (this.style = style),
        isAvailable: on,
      })),
      ...[100, 150, 200, 300].map(speed => ({
        id: `motion-speed-${speed}`,
        feature: "motion",
        l10nId: "nirva-command-motion-speed",
        l10nArgs: { percent: speed },
        keywords: "animation faster quick",
        run: () => (this.speed = speed),
        isAvailable: on,
      })),
      {
        id: "lite-on",
        feature: "motion",
        l10nId: "nirva-command-lite-on",
        keywords: "performance slow old computer battery effects blur",
        run: () => (this.lite = true),
        isAvailable: () => on() && !this.lite,
      },
      {
        id: "lite-off",
        feature: "motion",
        l10nId: "nirva-command-lite-off",
        keywords: "performance effects blur",
        run: () => (this.lite = false),
        isAvailable: () => on() && this.lite,
      },
    ]);
  },
};
