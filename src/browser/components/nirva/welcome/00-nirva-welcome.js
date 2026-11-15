#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// First-launch chooser (S2).
pref("nirva.welcome.enabled", true);
// Set once the chooser has been shown. Clearing it shows the chooser again at the next start.
pref("nirva.welcome.done", false);
// The guide version last shown; a newer guide is shown once more.
pref("nirva.welcome.version", 0);
// Nirva's chooser is the only first-run screen.
pref("browser.aboutwelcome.enabled", false);
// Importing from Mozilla Firefox, offered in the guide and the import wizard.
pref("nirva.importer.enabled", true);
pref("browser.migrate.nirva-firefox.enabled", true);
