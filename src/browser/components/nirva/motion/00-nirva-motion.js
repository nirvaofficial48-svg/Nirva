#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Motion control (S8) and Lite mode (S14).
pref("nirva.motion.enabled", true);
// springy, smooth or minimal.
pref("nirva.motion.style", "smooth");
// Speed in percent. 100 is the speed of the design; higher is faster. Slower than 100 is
// not offered because no animation may run longer than 200 ms.
pref("nirva.motion.speed", 100);
// Lite mode: no blur, no moving wallpaper, fades instead of movement, idle tabs sleep.
pref("nirva.lite.enabled", false);
pref("nirva.lite.sleepMinutes", 5);
