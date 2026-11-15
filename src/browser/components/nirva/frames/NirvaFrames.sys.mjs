/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaCommands } from "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs";

const PREF_ENABLED = "nirva.frames.enabled";

/**
 * Keeps see-through frames (sign-in prompts, chat bubbles, embeds) from
 * showing a white box on dark pages.
 */
export const NirvaFrames = {
  _initialized: false,

  init() {
    if (this._initialized) {
      return;
    }
    this._initialized = true;
    ChromeUtils.registerWindowActor("NirvaFrames", {
      parent: {
        esModuleURI:
          "moz-src:///browser/components/nirva/frames/NirvaFramesParent.sys.mjs",
      },
      child: {
        esModuleURI:
          "moz-src:///browser/components/nirva/frames/NirvaFramesChild.sys.mjs",
        events: { DOMContentLoaded: {}, load: {} },
      },
      allFrames: true,
      messageManagerGroups: ["browsers"],
      // A page can only answer "dark" or "light", and only about its own frames.
      safeForUntrustedWebProcess: true,
    });
    for (const on of [false, true]) {
      NirvaCommands.register({
        id: `frames-${on ? "on" : "off"}`,
        feature: "frames",
        l10nId: `nirva-command-frames-${on ? "on" : "off"}`,
        keywords: "frames white box background sign in dark pages",
        isAvailable: () =>
          Services.prefs.getBoolPref(PREF_ENABLED, true) !== on,
        run: () => Services.prefs.setBoolPref(PREF_ENABLED, on),
      });
    }
  },
};
