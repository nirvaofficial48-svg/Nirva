#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

// Nirva's privacy defaults. Firefox update and Safe Browsing preferences are
// intentionally left at their Firefox defaults.
pref("nirva.privacy.enabled", true);
pref("nirva.ai.enabled", false);

// Telemetry, health reporting and opt-out studies.
pref("toolkit.telemetry.enabled", false);
pref("datareporting.policy.dataSubmissionEnabled", false);
pref("datareporting.healthreport.uploadEnabled", false);
pref("datareporting.usage.uploadEnabled", false);
pref("app.normandy.enabled", false);
pref("app.shield.optoutstudies.enabled", false);

// Recommendations fetched from Mozilla, and new-tab telemetry.
pref("browser.discovery.enabled", false);
pref("browser.preferences.moreFromMozilla", false);
pref("extensions.htmlaboutaddons.recommendations.enabled", false);
pref("browser.newtabpage.activity-stream.telemetry", false);
pref("browser.newtabpage.activity-stream.feeds.section.topstories", false);

// Nothing is sent to a search engine until the owner asks for a search: no suggestions
// while typing and no connections opened in advance.
pref("browser.search.suggest.enabled", false);
pref("browser.urlbar.suggest.searches", false);
pref("browser.urlbar.speculativeConnect.enabled", false);
pref("browser.places.speculativeConnect.enabled", false);

// Sponsored placements.
pref("browser.newtabpage.activity-stream.showSponsored", false);
pref("browser.newtabpage.activity-stream.showSponsoredTopSites", false);
pref("browser.newtabpage.activity-stream.showSponsoredCheckboxes", false);
pref("browser.newtabpage.activity-stream.unifiedAds.tiles.enabled", false);
pref("browser.newtabpage.activity-stream.unifiedAds.spocs.enabled", false);
pref("browser.urlbar.sponsoredTopSites", false);
pref("browser.urlbar.suggest.quicksuggest.sponsored", false);
pref("browser.topsites.contile.enabled", false);

// Crash uploads and HTTPS-only mode.
pref("browser.crashReports.unsubmittedCheck.autoSubmit2", false);
pref("dom.security.https_only_mode", true);
pref("dom.security.https_only_mode_pbm", true);

// Hide Firefox's AI settings pane and block all AI controls.
pref("browser.preferences.aiControls", false);
pref("browser.ai.control.default", "blocked");
pref("browser.ai.control.translations", "blocked");
pref("browser.ai.control.pdfjsAltText", "blocked");
pref("browser.ai.control.smartTabGroups", "blocked");
pref("browser.ai.control.linkPreviewKeyPoints", "blocked");
pref("browser.ai.control.sidebarChatbot", "blocked");
pref("browser.ai.control.smartWindow", "blocked");
pref("browser.ai.control.speechRecognition", "blocked");

pref("browser.ml.enable", false);
pref("browser.ml.chat.enabled", false);
pref("browser.ml.chat.menu", false);
pref("browser.ml.chat.page", false);
pref("browser.ml.chat.sidebar", false);
pref("browser.ml.chat.shortcuts", false);
pref("browser.ml.linkPreview.enabled", false);
pref("browser.tabs.groups.smart.enabled", false);
pref("browser.tabs.groups.smart.optin", false);
pref("browser.tabs.groups.smart.userEnabled", false);
pref("browser.smartwindow.enabled", false);
pref("browser.smartwindow.autoTabGrouping.enabled", false);
pref("browser.smartwindow.smartformfill.enabled", false);
pref("browser.smartwindow.aitab.menus", false);
pref("browser.smartwindow.agent.enabled", false);
pref("browser.smartwindow.agent.toolbar.enabled", false);
pref("browser.translations.enable", false);
pref("browser.translations.select.enable", false);
pref("pdfjs.enableAltText", false);
pref("pdfjs.enableAltTextModelDownload", false);
pref("pdfjs.enableGuessAltText", false);
pref("pdfjs.enableNewAltTextWhenAddingImage", false);

// NIRVA: Sync through a Mozilla account stays available; the Relay email service does not.
pref("signon.firefoxRelay.feature", "");
// NIRVA: No add-on recommendations fetched from Mozilla in the add-ons manager.
pref("extensions.getAddons.showPane", false);
