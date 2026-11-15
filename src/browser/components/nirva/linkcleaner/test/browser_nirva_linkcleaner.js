/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_setup, add_task, Assert, BrowserTestUtils, getRootDirectory, gBrowser, gTestPath, registerCleanupFunction, Services, SpecialPowers, window */

"use strict";

const { NirvaLinkCleaner } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/linkcleaner/NirvaLinkCleaner.sys.mjs"
);
const { NirvaReceipt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs"
);
const { NirvaCommands } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs"
);

const DIR = getRootDirectory(gTestPath);
const PAGE_COM = `${DIR.replace("chrome://mochitests/content", "https://example.com")}page.html`;
const PAGE_ORG = `${DIR.replace("chrome://mochitests/content", "https://example.org")}page.html`;
const TRACKED = "?utm_source=news&fbclid=abc&keep=1&ref=friend";

function query(browser) {
  return browser.currentURI.query;
}

// Follows a real link in the page, as a click by the user would.
async function follow(browser, url) {
  const target = url.split("?")[0];
  const loaded = BrowserTestUtils.browserLoaded(browser, false, loadedUrl =>
    loadedUrl.startsWith(target)
  );
  await SpecialPowers.spawn(browser, [url], href => {
    const link = content.document.createElement("a");
    link.href = href;
    content.document.body.append(link);
    link.click();
  });
  await loaded;
}

function section() {
  NirvaReceipt.update(window);
  return document.querySelector("#nirva-receipt-panel .nirva-linkclean");
}

add_setup(async function () {
  await NirvaLinkCleaner.ready;
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("nirva.linkcleaner.enabled");
    Services.prefs.clearUserPref("privacy.query_stripping.allow_list");
  });
});

add_task(async function test_list_and_prefs() {
  const list = NirvaLinkCleaner.list;
  for (const name of [
    "utm_source",
    "utm_campaign",
    "fbclid",
    "gclid",
    "msclkid",
    "mc_eid",
  ]) {
    Assert.ok(list.includes(name), `${name} is cleaned`);
  }
  for (const name of [
    "code",
    "state",
    "ref",
    "tag",
    "id",
    "q",
    "token",
    "redirect",
    "gPromoCode",
    "im_ref",
    "var",
  ]) {
    Assert.ok(!list.includes(name), `${name} is never cleaned`);
  }
  Assert.ok(Services.prefs.getBoolPref("privacy.query_stripping.enabled"));
  Assert.ok(
    Services.prefs.getBoolPref("privacy.query_stripping.enabled.pbmode")
  );
  Assert.ok(
    Services.prefs
      .getStringPref("privacy.query_stripping.strip_list")
      .split(" ")
      .includes("fbclid"),
    "the browser's cleaner uses the list"
  );
});

add_task(async function test_cleans_link_from_another_site() {
  await BrowserTestUtils.withNewTab(PAGE_ORG, async browser => {
    await follow(browser, PAGE_COM + TRACKED);
    Assert.equal(
      query(browser),
      "keep=1&ref=friend",
      "tracking parts removed, others kept"
    );

    const cleaned = NirvaLinkCleaner.cleanedFor(browser);
    Assert.deepEqual(cleaned.removed, ["utm_source", "fbclid"]);

    const box = section();
    Assert.ok(!box.hidden, "the panel shows link cleaning");
    const note = document.l10n.getAttributes(
      box.querySelector(".nirva-linkclean-note")
    );
    Assert.equal(note.id, "nirva-linkclean-removed");
    Assert.equal(note.args.names, "utm_source, fbclid");
    Assert.ok(!box.querySelector(".nirva-linkclean-original").hidden);
    Assert.ok(
      NirvaCommands.all(window).some(c => c.id == "linkcleaner-original"),
      "the command bar offers the original link"
    );

    const loaded = BrowserTestUtils.browserLoaded(browser);
    box.querySelector(".nirva-linkclean-original").click();
    await loaded;
    Assert.equal(
      query(browser),
      TRACKED.slice(1),
      "the original link loaded unchanged"
    );
    Assert.equal(NirvaLinkCleaner.cleanedFor(browser), null);
    Assert.ok(
      section().hidden,
      "the section goes away once the original is loaded"
    );
  });
});

add_task(async function test_same_site_links_untouched() {
  await BrowserTestUtils.withNewTab(PAGE_COM, async browser => {
    await follow(browser, PAGE_COM + TRACKED);
    Assert.equal(
      query(browser),
      TRACKED.slice(1),
      "a site's own links are left alone"
    );
    Assert.equal(NirvaLinkCleaner.cleanedFor(browser), null);
    Assert.ok(section().hidden, "nothing to report, so the panel stays short");
  });
});

add_task(async function test_site_exemption_from_panel() {
  await BrowserTestUtils.withNewTab(PAGE_ORG, async browser => {
    await follow(browser, PAGE_COM + "?gclid=1");
    Assert.equal(query(browser), "", "cleaned before the exemption");

    const row = section().querySelector(".nirva-linkclean-site");
    Assert.equal(row.getAttribute("aria-checked"), "true");
    row.click();
    Assert.equal(row.getAttribute("aria-checked"), "false");
    Assert.equal(
      Services.prefs.getStringPref("privacy.query_stripping.allow_list"),
      "example.com"
    );
    Assert.ok(!NirvaLinkCleaner.cleansSite(browser.currentURI));

    BrowserTestUtils.startLoadingURIString(browser, PAGE_ORG);
    await BrowserTestUtils.browserLoaded(browser);
    await follow(browser, PAGE_COM + "?gclid=2");
    Assert.equal(
      query(browser),
      "gclid=2",
      "an exempt site gets links as written"
    );

    const box = section();
    box.querySelector(".nirva-linkclean-site").click();
    Assert.ok(
      !box.hidden,
      "the switch stays in view after turning cleaning back on"
    );
    Assert.equal(
      box.querySelector(".nirva-linkclean-site").getAttribute("aria-checked"),
      "true"
    );
    delete box.dataset.keep;
    Assert.ok(
      !Services.prefs.prefHasUserValue("privacy.query_stripping.allow_list"),
      "turning cleaning back on removes the exemption"
    );
  });
});

add_task(async function test_switching_off() {
  Services.prefs.setBoolPref("nirva.linkcleaner.enabled", false);
  Assert.ok(!Services.prefs.getBoolPref("privacy.query_stripping.enabled"));
  await BrowserTestUtils.withNewTab(PAGE_ORG, async browser => {
    await follow(browser, PAGE_COM + "?fbclid=3");
    Assert.equal(
      query(browser),
      "fbclid=3",
      "nothing is cleaned when switched off"
    );
    Assert.ok(
      section().hidden,
      "the panel section is hidden when switched off"
    );
  });
  Services.prefs.setBoolPref("nirva.linkcleaner.enabled", true);
  Assert.ok(Services.prefs.getBoolPref("privacy.query_stripping.enabled"));
});
