#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Island toolbar (S3) and light-sweep loading (A3).
pref("nirva.island.enabled", true);
// How long the island stays after it reappears on scrolling up, in milliseconds.
pref("nirva.island.lingerMs", 2000);
// The system draws the window's title bar; the island floats below it.
pref("browser.tabs.inTitlebar", 0);
// No account button on the island.
pref("identity.fxaccounts.toolbar.enabled", false);
