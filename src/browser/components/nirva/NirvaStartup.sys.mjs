/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// NIRVA: Erase leftover burner data and add burner tab commands.
import { NirvaBurner } from "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs";
import { NirvaCommandBar } from "moz-src:///browser/components/nirva/commandbar/NirvaCommandBar.sys.mjs";
// NIRVA: Keep see-through frames transparent on dark pages.
import { NirvaFrames } from "moz-src:///browser/components/nirva/frames/NirvaFrames.sys.mjs";
// NIRVA: Make the home screen the new-tab and start page.
import { NirvaHome } from "moz-src:///browser/components/nirva/home/NirvaHome.sys.mjs";
import { NirvaIsland } from "moz-src:///browser/components/nirva/island/NirvaIsland.sys.mjs";
// NIRVA: Register the Personal Web Library's page actor, commands and menu items.
import { NirvaLibrary } from "moz-src:///browser/components/nirva/library/NirvaLibrary.sys.mjs";
// NIRVA: Register the page picker and local Live Clips manager.
import { NirvaClips } from "moz-src:///browser/components/nirva/liveclips/NirvaClips.sys.mjs";
import { NirvaLooks } from "moz-src:///browser/components/nirva/looks/NirvaLooks.sys.mjs";
// NIRVA: Memory saver puts unused tabs to sleep.
import { NirvaMemory } from "moz-src:///browser/components/nirva/memory/NirvaMemory.sys.mjs";
import { NirvaMotion } from "moz-src:///browser/components/nirva/motion/NirvaMotion.sys.mjs";
// NIRVA: Index eligible page text locally before command-bar searches begin.
import { NirvaReadSearch } from "moz-src:///browser/components/nirva/readsearch/NirvaReadSearch.sys.mjs";
// NIRVA: Add the privacy receipt button and panel to each window.
import { NirvaReceipt } from "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs";
// NIRVA: Intelligent Tab Rules match tabs and run actions on them.
import { NirvaTabRules } from "moz-src:///browser/components/nirva/tabrules/NirvaTabRules.sys.mjs";
// NIRVA: Apply the user's saved page remixes and register their commands.
import { NirvaRemix } from "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs";
import { NirvaSidebar } from "moz-src:///browser/components/nirva/sidebar/NirvaSidebar.sys.mjs";
// NIRVA: Split view of two to four tabs.
import { NirvaSplit } from "moz-src:///browser/components/nirva/split/NirvaSplit.sys.mjs";
// NIRVA: Apply saved Theme Studio settings before the first browser window.
import { NirvaTheme } from "moz-src:///browser/components/nirva/theme/NirvaTheme.sys.mjs";
// NIRVA: Begin local session snapshots after Firefox restores its windows.
import { NirvaTimeTravel } from "moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs";
// NIRVA: Turn on link cleaning and register its commands.
import { NirvaLinkCleaner } from "moz-src:///browser/components/nirva/linkcleaner/NirvaLinkCleaner.sys.mjs";
// NIRVA: Register macros and their commands.
import { NirvaMacros } from "moz-src:///browser/components/nirva/macros/NirvaMacros.sys.mjs";
// NIRVA: Profile commands and the chooser at start.
import { NirvaProfiles } from "moz-src:///browser/components/nirva/profiles/NirvaProfiles.sys.mjs";
// NIRVA: Register the trust dial's commands.
import { NirvaTrust } from "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs";
import { NirvaWelcome } from "moz-src:///browser/components/nirva/welcome/NirvaWelcome.sys.mjs";

/**
 * The one place Firefox's start-up code calls into Nirva. Every feature that needs to run
 * before the first window opens is started from here, in order.
 */
export const NirvaStartup = {
  beforeFirstWindow() {
    for (const feature of [
      NirvaLooks,
      NirvaMotion,
      NirvaMemory,
      NirvaSidebar,
      NirvaIsland,
      NirvaHome,
      NirvaFrames,
      NirvaBurner,
      NirvaClips,
      NirvaReadSearch,
      NirvaReceipt,
      NirvaLinkCleaner,
      NirvaTabRules,
      NirvaMacros,
      NirvaProfiles,
      NirvaRemix,
      NirvaSplit,
      NirvaLibrary,
      NirvaCommandBar,
      NirvaTheme,
      NirvaTimeTravel,
      NirvaTrust,
      NirvaWelcome,
    ]) {
      try {
        feature.init();
      } catch (e) {
        // One broken feature must not stop the browser from starting.
        console.error("Nirva: a feature failed to start", e);
      }
    }
    try {
      // Last, so the looks are ready. Returns when the owner has chosen.
      NirvaWelcome.showIfFirstRun();
    } catch (e) {
      console.error("Nirva: the first-launch chooser failed", e);
    }
  },
};
