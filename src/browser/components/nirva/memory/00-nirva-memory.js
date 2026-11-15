#filter dumbComments emptyLines substitution
// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// NIRVA: Memory saver puts tabs to sleep after they have not been looked at for a while.
pref("nirva.memory.enabled", true);
pref("nirva.memory.sleepMinutes", 30);

// NIRVA: When the computer runs short of memory, the least used tabs sleep first
// (Firefox does this on Windows and macOS already).
pref("browser.tabs.unloadOnLowMemory", true);
pref("browser.low_commit_space_threshold_percent", 10);

// NIRVA: Keep up to four recent pages ready for instant Back, not eight.
pref("browser.sessionhistory.max_total_viewers", 4);

// NIRVA: A page process that goes to the background gives back memory it no longer uses.
pref("dom.memory.memory_pressure_on_background", 1);
