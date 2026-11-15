/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */
/* global add_task, Assert, BrowserTestUtils, ContentTask, EventUtils, gBrowser, gURLBar, registerCleanupFunction, Services, SpecialPowers, TestUtils */

"use strict";

const { NirvaIsland } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/island/NirvaIsland.sys.mjs"
);

const TALL_PAGE =
  "https://example.com/document-builder.sjs?html=" +
  encodeURIComponent(
    "<title>Tall</title><body style='margin:0'><div style='height:6000px'>tall page</div>"
  );

const root = document.documentElement;
const toolbox = document.getElementById("navigator-toolbox");
const line = document.getElementById("nirva-island-line");

function collapsed() {
  return root.hasAttribute("nirva-island-collapsed");
}

async function scrollPageTo(browser, y) {
  await SpecialPowers.spawn(browser, [y], async top => {
    content.scrollTo({ top, behavior: "instant" });
  });
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("nirva.island.enabled");
  Services.prefs.clearUserPref("nirva.island.lingerMs");
  NirvaIsland.expand(window);
});

add_task(async function test_the_toolbar_is_a_centred_pill_over_the_page() {
  Assert.ok(root.hasAttribute("nirva-island"), "the island is on");
  await NirvaIsland._windows.get(window).arrival;
  const island = toolbox.getBoundingClientRect();
  const page = document
    .getElementById("tabbrowser-tabbox")
    .getBoundingClientRect();
  Assert.equal(Math.round(island.height), 48, "48 px high");
  Assert.equal(
    Math.round(island.width),
    Math.min(620, Math.round(page.width) - 48),
    "620 px wide, or less in a narrow window"
  );
  Assert.less(island.width, page.width, "never full width");
  Assert.equal(Math.round(island.top), 32, "32 px from the top");
  Assert.less(
    Math.abs(island.x + island.width / 2 - (page.x + page.width / 2)),
    1,
    "centred over the page area"
  );
  Assert.equal(
    getComputedStyle(toolbox).borderTopLeftRadius,
    "24px",
    "fully rounded"
  );
  Assert.less(page.top, island.top, "the page runs under the island");
  Assert.equal(getComputedStyle(toolbox).position, "fixed", "it floats");
});

add_task(async function test_text_stays_readable_in_glass_dark() {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["nirva.look", "glass"],
      ["nirva.mode", "dark"],
    ],
  });
  const alpha = () => {
    const parts = getComputedStyle(toolbox).backgroundColor.match(/[\d.]+/g);
    return parts.length > 3 ? Number(parts[3]) : 1;
  };
  await TestUtils.waitForCondition(
    () => alpha() >= 0.75,
    "the island has a mostly solid ground under its light text"
  );
  Assert.greaterOrEqual(alpha(), 0.75, "ground opacity");
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_what_the_island_holds() {
  const visible = id => {
    const el = document.getElementById(id);
    return !!el && el.getBoundingClientRect().width > 0;
  };
  for (const id of [
    "back-button",
    "forward-button",
    "urlbar",
    "PanelUI-menu-button",
  ]) {
    Assert.ok(visible(id), `${id} is on the island`);
  }
  for (const id of ["sidebar-button", "stop-reload-button", "alltabs-button"]) {
    Assert.ok(!visible(id), `${id} is not`);
  }
  const back = document.getElementById("back-button").getBoundingClientRect();
  Assert.greaterOrEqual(back.width, 44, "back is a full-size target: width");
  Assert.greaterOrEqual(back.height, 44, "back is a full-size target: height");
});

add_task(async function test_the_address_shows_site_and_path() {
  await BrowserTestUtils.withNewTab(
    "https://example.com/browser/browser/base/content/test/general/dummy_page.html",
    async () => {
      const [site, rest] = document.getElementById(
        "nirva-island-address"
      ).children;
      await TestUtils.waitForCondition(() => site.textContent == "example.com");
      Assert.equal(site.textContent, "example.com", "the site");
      Assert.equal(
        rest.textContent,
        "/browser/browser/base/content/test/general/dummy_page.html",
        "the rest of the address"
      );
      Assert.equal(
        getComputedStyle(site).fontWeight,
        "500",
        "site in medium weight"
      );
      Assert.notEqual(
        getComputedStyle(rest).color,
        getComputedStyle(site).color,
        "the rest is quieter"
      );
      Assert.equal(
        getComputedStyle(gURLBar.inputField).opacity,
        "0",
        "the raw address is hidden at rest"
      );

      // Ctrl+L shows the full, editable address.
      EventUtils.synthesizeKey("l", { accelKey: true });
      await TestUtils.waitForCondition(() => gURLBar.focused);
      Assert.equal(
        getComputedStyle(gURLBar.inputField).opacity,
        "1",
        "editable when focused"
      );
      Assert.equal(
        getComputedStyle(document.getElementById("nirva-island-address"))
          .display,
        "none",
        "and the resting display steps aside"
      );
      gURLBar.blur();
      gBrowser.selectedBrowser.focus();
    }
  );
  Assert.deepEqual(
    NirvaIsland.splitAddress(Services.io.newURI("https://example.org/")),
    { site: "example.org", rest: "" },
    "a bare site has no rest"
  );
  Assert.deepEqual(
    NirvaIsland.splitAddress(Services.io.newURI("about:blank")),
    { site: "", rest: "" },
    "a blank page shows nothing"
  );
});

add_task(async function test_on_websites_the_page_gets_the_whole_window() {
  Services.prefs.setIntPref("nirva.island.lingerMs", 300);
  const tabbox = document.getElementById("tabbrowser-tabbox");
  const settled = () =>
    TestUtils.waitForCondition(
      () => getComputedStyle(tabbox).translate == "none",
      "the page card has finished sliding"
    );
  await BrowserTestUtils.withNewTab(TALL_PAGE, async browser => {
    await TestUtils.waitForCondition(
      () => root.hasAttribute("nirva-island-docked"),
      "a website docks the island"
    );
    await TestUtils.waitForCondition(() => !collapsed(), "shown on arrival");
    await settled();
    let island = toolbox.getBoundingClientRect();
    let page = browser.getBoundingClientRect();
    Assert.greaterOrEqual(
      Math.round(page.top),
      Math.round(island.bottom),
      "the page starts below the island, so nothing on it is covered"
    );
    Assert.equal(Math.round(island.height), 32, "a compact pill");
    Assert.less(island.width, 482, "and narrow");
    Assert.less(
      Math.abs(island.x + island.width / 2 - (page.x + page.width / 2)),
      1,
      "centred over the page"
    );

    // After a moment it tucks away and the page takes the whole window.
    await TestUtils.waitForCondition(collapsed, "it tucks away");
    await settled();
    page = browser.getBoundingClientRect();
    const tabboxTop = tabbox.getBoundingClientRect().top;
    Assert.lessOrEqual(
      Math.round(tabboxTop),
      12,
      "the page card rises to the top"
    );
    await TestUtils.waitForCondition(
      () => getComputedStyle(toolbox).opacity == "0",
      "the island is out of sight"
    );
    const handle = line.getBoundingClientRect();
    Assert.equal(Math.round(handle.width), 48, "a short handle stays");
    Assert.lessOrEqual(handle.bottom, tabboxTop, "above the page, not on it");

    // The pointer at the top edge brings it back, and the page makes room.
    EventUtils.synthesizeMouseAtPoint(
      handle.x + handle.width / 2,
      2,
      { type: "mousemove" },
      window
    );
    await TestUtils.waitForCondition(
      () => !collapsed(),
      "the top edge reveals it"
    );
    await settled();
    island = toolbox.getBoundingClientRect();
    page = browser.getBoundingClientRect();
    Assert.greaterOrEqual(
      Math.round(page.top),
      Math.round(island.bottom),
      "shown again, it still covers nothing"
    );

    // Scrolling down tucks it away; scrolling back to the top brings it back to stay.
    await scrollPageTo(browser, 800);
    await TestUtils.waitForCondition(collapsed, "scrolling down tucks it away");
    await scrollPageTo(browser, 0);
    await TestUtils.waitForCondition(
      () => !collapsed(),
      "the top brings it back"
    );
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 800));
    Assert.ok(!collapsed(), "and it stays while the page is at its top");

    // Ctrl+L shows it; leaving the address lets it tuck away again.
    NirvaIsland.collapse(window);
    EventUtils.synthesizeKey("l", { accelKey: true });
    await TestUtils.waitForCondition(
      () => !collapsed(),
      "Ctrl+L brings it back"
    );
    // Going back to the page, as a click into it does.
    await TestUtils.waitForCondition(
      () => gURLBar.focused,
      "the address has focus"
    );
    browser.focus();
    await TestUtils.waitForCondition(
      collapsed,
      "it tucks away after the address"
    );
  });
  Services.prefs.clearUserPref("nirva.island.lingerMs");
  await TestUtils.waitForCondition(
    () => !root.hasAttribute("nirva-island-docked"),
    "on a start page it floats again"
  );
  Assert.ok(!collapsed(), "and is shown");
});

add_task(async function test_a_split_view_never_has_the_island_over_a_pane() {
  const home = gBrowser.selectedTab;
  const site = await BrowserTestUtils.openNewForegroundTab(gBrowser, TALL_PAGE);
  gBrowser.selectedTab = home;
  await TestUtils.waitForCondition(
    () => !root.hasAttribute("nirva-island-docked"),
    "a start page alone: the island floats"
  );
  gBrowser.addTabSplitView([home, site], { insertBefore: home });
  gBrowser.selectedTab = home;
  await TestUtils.waitForCondition(
    () => root.hasAttribute("nirva-island-docked"),
    "with a website beside it, the island docks even though a start page is in front"
  );
  NirvaIsland.expand(window);
  await TestUtils.waitForCondition(
    () =>
      getComputedStyle(document.getElementById("tabbrowser-tabbox"))
        .translate == "none"
  );
  const island = toolbox.getBoundingClientRect();
  for (const tab of [home, site]) {
    const pane = document
      .getElementById(tab.linkedPanel)
      .getBoundingClientRect();
    Assert.greaterOrEqual(
      Math.round(pane.top),
      Math.round(island.bottom),
      "no pane is covered"
    );
  }
  home.splitview.unsplitTabs();
  gBrowser.selectedTab = home;
  await TestUtils.waitForCondition(
    () => !root.hasAttribute("nirva-island-docked"),
    "the split ended: the start page has the floating island again"
  );
  BrowserTestUtils.removeTab(site);
});

add_task(async function test_a_tab_coming_forward_plays_the_float_in() {
  const tab = await BrowserTestUtils.openNewForegroundTab(gBrowser, TALL_PAGE);
  const ran = await NirvaIsland._windows.get(window).arrival;
  Assert.deepEqual(ran, ["nirva-island-arrive"], "the island floats in");
  Assert.ok(!root.hasAttribute("nirva-island-arrive"), "and settles");
  Assert.equal(getComputedStyle(toolbox).opacity, "1", "fully shown");
  BrowserTestUtils.removeTab(tab);
});

add_task(async function test_over_a_start_page_it_shrinks_to_a_line() {
  Assert.ok(!root.hasAttribute("nirva-island-docked"), "a start page");
  Assert.ok(NirvaIsland.collapse(window), "the floating island can shrink");
  await TestUtils.waitForCondition(
    () => getComputedStyle(toolbox).opacity == "0",
    "the pill fades out"
  );
  const mark = line.getBoundingClientRect();
  Assert.equal(Math.round(mark.height), 3, "leaving a 3 px line");
  await TestUtils.waitForCondition(
    () => getComputedStyle(line).opacity == "1",
    "that is visible"
  );
  EventUtils.synthesizeKey("l", { accelKey: true });
  await TestUtils.waitForCondition(() => !collapsed(), "Ctrl+L brings it back");
  gURLBar.blur();
});

add_task(async function test_loading_sweep() {
  const sweep = document.getElementById("nirva-island-sweep");
  Assert.equal(
    getComputedStyle(sweep).opacity,
    "0",
    "no line when nothing loads"
  );
  const tab = await BrowserTestUtils.openNewForegroundTab(
    gBrowser,
    "about:blank"
  );
  const slow =
    "https://example.com/browser/browser/base/content/test/general/slow_loading_page.sjs";
  BrowserTestUtils.startLoadingURIString(tab.linkedBrowser, slow);
  await TestUtils.waitForCondition(
    () => root.hasAttribute("nirva-island-loading"),
    "loading marks the island"
  );
  const moving = sweep.firstElementChild;
  Assert.equal(getComputedStyle(moving).height, "1px", "the line is 1 px");
  Assert.equal(
    getComputedStyle(moving).animationName,
    "nirva-island-sweep",
    "and it sweeps"
  );
  const probe = document.createElementNS(
    "http://www.w3.org/1999/xhtml",
    "span"
  );
  probe.style.color = "var(--nirva-accent)";
  document.body.append(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  Assert.notEqual(accent, "", "the look defines an accent colour");
  Assert.equal(
    getComputedStyle(moving).backgroundColor,
    accent,
    "in the accent colour"
  );
  await BrowserTestUtils.browserLoaded(tab.linkedBrowser);
  await TestUtils.waitForCondition(
    () => !root.hasAttribute("nirva-island-loading"),
    "the mark goes when the page has loaded"
  );
  Assert.equal(
    getComputedStyle(moving).animationName,
    "none",
    "the sweep stops"
  );
  BrowserTestUtils.removeTab(tab);
});

add_task(
  async function test_reduced_motion_replaces_the_sweep_with_a_still_line() {
    await SpecialPowers.pushPrefEnv({ set: [["ui.prefersReducedMotion", 1]] });
    root.setAttribute("nirva-island-loading", "true");
    const moving =
      document.getElementById("nirva-island-sweep").firstElementChild;
    await TestUtils.waitForCondition(
      () => getComputedStyle(moving).animationName == "none",
      "no movement with reduce motion"
    );
    root.removeAttribute("nirva-island-loading");
    await SpecialPowers.popPrefEnv();
  }
);

add_task(async function test_the_sidebar_has_its_own_collapse_button() {
  const button = document.getElementById("nirva-sidebar-collapse");
  const rect = button.getBoundingClientRect();
  Assert.greaterOrEqual(rect.width, 44, "full-size target: width");
  Assert.greaterOrEqual(rect.height, 44, "full-size target: height");
  Assert.equal(
    button.getAttribute("aria-label"),
    "Collapse sidebar",
    "labelled"
  );
  const sidebar = document.querySelector("sidebar-main");
  button.click();
  await TestUtils.waitForCondition(
    () => !sidebar.hasAttribute("expanded"),
    "it collapses the sidebar"
  );
  await TestUtils.waitForCondition(
    () => button.getAttribute("aria-label") == "Expand sidebar",
    "and relabels itself"
  );
  button.click();
  await TestUtils.waitForCondition(
    () => sidebar.hasAttribute("expanded"),
    "and back"
  );
});

add_task(async function test_switching_the_island_off_restores_the_toolbar() {
  Services.prefs.setBoolPref("nirva.island.enabled", false);
  Assert.ok(!root.hasAttribute("nirva-island"), "attribute removed");
  Assert.notEqual(
    getComputedStyle(toolbox).position,
    "fixed",
    "a normal toolbar again"
  );
  Assert.greater(
    document.getElementById("sidebar-button").getBoundingClientRect().width,
    0,
    "with Firefox's sidebar button"
  );
  Services.prefs.setBoolPref("nirva.island.enabled", true);
  Assert.equal(getComputedStyle(toolbox).position, "fixed", "and back");
});
