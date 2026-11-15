// Review scene for split view. Pref nirva.review.split chooses what is shown:
//   grid (default)  four tabs in a 2 by 2 grid, the middle divider being dragged
//   main-left       three tabs, one large on the left, arranging tray open, pane 2 chosen
//   cols            two tabs side by side, sizes 2:1
//   panel-new       the split panel opened from the "Harbour weekly" tab, two tabs ticked
//   panel-split     three tabs split, the panel opened from the island button
//   hover           one page; the split button showing on the hovered "Trail map" row
// Headless capture cannot paint pop-ups, so the panel scenes copy the open panel into a
// stand-in at the same place, drawn with the pop-up's own colours.
const page = (title, line) =>
  "data:text/html," +
  encodeURIComponent(
    `<title>${title}</title><body style="margin:0;font:16px/1.6 system-ui;color:#222;background:#fff">` +
      `<div style="padding:40px 48px"><h1 style="font-weight:500;font-size:28px;margin:0 0 12px">${title}</h1>` +
      `<p style="max-width:56ch;color:#555">${line}</p>` +
      `<p style="max-width:56ch;color:#555">${line}</p></div>`
  );
const { NirvaSplit } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/split/NirvaSplit.sys.mjs"
);
for (let i = 0; i < 100 && !document.getElementById("nirva-split-button"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const titles = [
  ["Harbour weekly", "Tides, ferries and the new pier opening on the east side."],
  ["Kitchen notes", "Slow-roasted tomatoes, a quick bread and three soups."],
  ["Trail map", "Ridge loop, 14 km, mostly shaded; water at the halfway hut."],
  ["Reading list", "Essays on design, a novel about lighthouses, two field guides."],
  ["Bus timetable", "Route 7 every twelve minutes until eight in the evening."],
];
const tabs = titles.map(([title, line]) =>
  gBrowser.addTrustedTab(page(title, line))
);
await wait(800);
const mode = Services.prefs.getStringPref("nirva.review.split", "grid");
const tick = () =>
  new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  );

if (mode == "hover") {
  // Headless capture cannot hover; a review-only sheet shows what a hover shows.
  gBrowser.selectedTab = tabs[0];
  tabs[2].setAttribute("nirva-review-hover", "true");
  const sheet =
    "data:text/css," +
    encodeURIComponent(
      ".tabbrowser-tab[nirva-review-hover] .nirva-split-tab-button { display: grid !important; }" +
        ".tabbrowser-tab[nirva-review-hover] .tab-close-button { display: flex !important; }" +
        ".tabbrowser-tab[nirva-review-hover] .tab-background { background-color: var(--tab-hover-background-color) !important; }"
    );
  window.windowUtils.loadSheetUsingURIString(sheet, window.windowUtils.AGENT_SHEET);
} else if (mode == "panel-new" || mode == "panel-split") {
  if (mode == "panel-new") {
    gBrowser.selectedTab = tabs[0];
    await tick();
    NirvaSplit.openPanel(window, { tab: tabs[0], anchor: tabs[0] });
    document.querySelectorAll("#nirva-split-panel .nirva-split-row-main")[3]?.click();
  } else {
    NirvaSplit.openSplit(window, [tabs[0], tabs[1], tabs[3]], "main-left");
    await tick();
    NirvaSplit.openPanel(window, {
      anchor: document.getElementById("nirva-split-button"),
    });
  }
  const popup = document.getElementById("nirva-split-popup");
  for (let i = 0; i < 100 && popup.state != "open"; i++) {
    await wait(30);
  }
  await tick();
  const source = document.getElementById("nirva-split-panel");
  const rect = source.getBoundingClientRect();
  const style = getComputedStyle(popup);
  const standin = document.createElement("div");
  standin.style.cssText =
    `position:fixed;z-index:10;left:${rect.left}px;top:${rect.top}px;` +
    `background:${style.getPropertyValue("--panel-background")};` +
    `border:1px solid ${style.getPropertyValue("--panel-border-color")};` +
    "border-radius:var(--nirva-radius-panel);" +
    "box-shadow:var(--nirva-panel-shadow)";
  const copy = source.cloneNode(true);
  copy.removeAttribute("id");
  copy.id = "nirva-split-panel";
  standin.append(copy);
  popup.hidePopup = () => {};
  document.getElementById("browser").after(standin);
} else if (mode == "cols") {
  NirvaSplit.openSplit(window, [tabs[0], tabs[1]]);
  await tick();
  const wrapper = tabs[0].splitview;
  const model = NirvaSplit.modelFor(wrapper);
  model.layout.tree.sizes = [2 / 3, 1 / 3];
  NirvaSplit.apply(window);
} else if (mode == "main-left") {
  NirvaSplit.openSplit(window, [tabs[0], tabs[1], tabs[3]], "main-left");
  await tick();
  NirvaSplit.openArrange(window);
  NirvaSplit._onSlotClick(window, 1);
} else {
  NirvaSplit.openSplit(window, tabs.slice(0, 4), "grid");
  await tick();
  const divider = document.querySelector('.nirva-split-divider[data-axis="x"]');
  divider?.setAttribute("dragging", "true");
}
await tick();
await wait(1200);
