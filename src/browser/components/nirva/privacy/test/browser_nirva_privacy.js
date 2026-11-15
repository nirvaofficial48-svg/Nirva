/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, Services, SpecialPowers, TestUtils */

"use strict";

const DISABLED_BOOL_PREFS = [
  "datareporting.policy.dataSubmissionEnabled",
  "datareporting.healthreport.uploadEnabled",
  "datareporting.usage.uploadEnabled",
  "app.normandy.enabled",
  "app.shield.optoutstudies.enabled",
  "browser.discovery.enabled",
  "browser.search.suggest.enabled",
  "browser.urlbar.suggest.searches",
  "browser.urlbar.speculativeConnect.enabled",
  "browser.places.speculativeConnect.enabled",
  "browser.preferences.moreFromMozilla",
  "extensions.htmlaboutaddons.recommendations.enabled",
  "browser.newtabpage.activity-stream.telemetry",
  "browser.newtabpage.activity-stream.feeds.section.topstories",
  "browser.newtabpage.activity-stream.showSponsored",
  "browser.newtabpage.activity-stream.showSponsoredTopSites",
  "browser.newtabpage.activity-stream.showSponsoredCheckboxes",
  "browser.newtabpage.activity-stream.unifiedAds.tiles.enabled",
  "browser.newtabpage.activity-stream.unifiedAds.spocs.enabled",
  "browser.urlbar.sponsoredTopSites",
  "browser.topsites.contile.enabled",
  "browser.crashReports.unsubmittedCheck.autoSubmit2",
  "browser.preferences.aiControls",
  "browser.ml.enable",
  "browser.ml.chat.enabled",
  "browser.ml.chat.menu",
  "browser.ml.chat.page",
  "browser.ml.chat.sidebar",
  "browser.ml.chat.shortcuts",
  "browser.ml.linkPreview.enabled",
  "browser.tabs.groups.smart.enabled",
  "browser.tabs.groups.smart.optin",
  "browser.tabs.groups.smart.userEnabled",
  "browser.smartwindow.enabled",
  "browser.smartwindow.autoTabGrouping.enabled",
  "browser.smartwindow.smartformfill.enabled",
  "browser.smartwindow.aitab.menus",
  "browser.smartwindow.agent.enabled",
  "browser.smartwindow.agent.toolbar.enabled",
  "browser.translations.enable",
  "browser.translations.select.enable",
  "pdfjs.enableAltText",
  "pdfjs.enableAltTextModelDownload",
  "pdfjs.enableGuessAltText",
  "pdfjs.enableNewAltTextWhenAddingImage",
];

const BLOCKED_AI_CONTROL_PREFS = [
  "browser.ai.control.default",
  "browser.ai.control.translations",
  "browser.ai.control.pdfjsAltText",
  "browser.ai.control.smartTabGroups",
  "browser.ai.control.linkPreviewKeyPoints",
  "browser.ai.control.sidebarChatbot",
  "browser.ai.control.smartWindow",
  "browser.ai.control.speechRecognition",
];

add_task(async function test_privacy_and_ai_defaults() {
  const defaultPrefs = Services.prefs.getDefaultBranch("");
  Assert.ok(
    defaultPrefs.getBoolPref("nirva.privacy.enabled"),
    "Nirva privacy defaults are enabled"
  );
  Assert.ok(
    !defaultPrefs.getBoolPref("nirva.ai.enabled"),
    "built-in AI is disabled"
  );

  for (const pref of DISABLED_BOOL_PREFS) {
    Assert.ok(!defaultPrefs.getBoolPref(pref), pref + " defaults to disabled");
  }

  Assert.ok(
    !Services.prefs.getBoolPref(
      "browser.urlbar.suggest.quicksuggest.sponsored"
    ),
    "sponsored address bar suggestions are disabled"
  );

  const { TelemetryReportingPolicy } = ChromeUtils.importESModule(
    "resource://gre/modules/TelemetryReportingPolicy.sys.mjs"
  );
  Assert.ok(
    !TelemetryReportingPolicy.canUpload(),
    "Firefox telemetry uploads are disabled"
  );

  Assert.equal(
    Services.prefs.getStringPref("browser.contentblocking.category"),
    "strict",
    "new profiles use Strict tracking protection"
  );
  Assert.ok(
    Services.prefs.getBoolPref("privacy.trackingprotection.enabled"),
    "tracking protection is active in regular windows"
  );
  Assert.ok(
    Services.prefs.getBoolPref("privacy.trackingprotection.pbmode.enabled"),
    "tracking protection is active in private windows"
  );
  Assert.ok(
    defaultPrefs.getBoolPref("dom.security.https_only_mode"),
    "HTTPS-only mode is enabled by default in regular windows"
  );
  Assert.ok(
    defaultPrefs.getBoolPref("dom.security.https_only_mode_pbm"),
    "HTTPS-only mode is enabled by default in private windows"
  );

  for (const pref of BLOCKED_AI_CONTROL_PREFS) {
    Assert.equal(
      defaultPrefs.getStringPref(pref),
      "blocked",
      pref + " blocks the AI feature"
    );
  }

  Assert.ok(
    defaultPrefs.getBoolPref("browser.safebrowsing.downloads.enabled"),
    "Firefox Safe Browsing remains enabled"
  );
  Assert.ok(
    defaultPrefs.getBoolPref("app.update.auto"),
    "Firefox automatic updates remain enabled"
  );

  const { AppConstants } = ChromeUtils.importESModule(
    "resource://gre/modules/AppConstants.sys.mjs"
  );
  if (AppConstants.MOZ_CRASHREPORTER) {
    Assert.ok(!Services.appinfo.submitReports, "crash report uploads are off");
  }

  await SpecialPowers.pushPrefEnv({
    set: [["browser.preferences.aiControls", false]],
  });
  await BrowserTestUtils.withNewTab("about:preferences", async browser => {
    const win = browser.contentDocument.documentGlobal;
    win.SettingPaneManager.importPane("ai");
    await TestUtils.waitForCondition(
      () => !browser.contentDocument.getElementById("category-ai-features"),
      "the AI settings category is removed when AI controls are disabled"
    );
    Assert.ok(
      !browser.contentDocument.getElementById("category-ai-features"),
      "Firefox AI preferences category is hidden"
    );
  });
});
