// Review scene for the island on a website. Pref nirva.review.island chooses the state:
//   tucked (default)  the island tucked away, the page filling the window, the handle above it
//   shown             the island shown, the page card moved down to make room
// With nirva.review.island-split set, the site shares a split view with the home page, which is
// in front (the case where a floating island would cover the site).
// Run with --pref nirva.island.lingerMs=300 so the island tucks away quickly.
const { NirvaIsland } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/island/NirvaIsland.sys.mjs"
);
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const page =
  "http://127.0.0.1:8765/site.html";
const tab = gBrowser.addTrustedTab(page);
gBrowser.selectedTab = tab;
for (let i = 0; i < 100 && tab.linkedBrowser.currentURI?.spec != page; i++) {
  await wait(50);
}
await wait(1500);
if (Services.prefs.getBoolPref("nirva.review.island-split", false)) {
  const { NirvaSplit } = ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/split/NirvaSplit.sys.mjs"
  );
  const home = gBrowser.tabs[0];
  NirvaSplit.openSplit(window, [tab, home]);
  gBrowser.selectedTab = home;
  await wait(800);
}
const root = document.documentElement;
if (Services.prefs.getStringPref("nirva.review.island", "tucked") == "shown") {
  NirvaIsland.expand(window);
} else {
  for (let i = 0; i < 100 && !root.hasAttribute("nirva-island-collapsed"); i++) {
    await wait(50);
  }
}
await wait(900);
