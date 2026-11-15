// Review scene for Burner Tabs: two ordinary tabs and one burner tab on its explainer page.
// With nirva.review.burner-site set, the burner shows a web page instead.
const page = title => "data:text/html," + encodeURIComponent(`<title>${title}</title><body style="font:17px system-ui;padding:96px 112px">${title}`);
const { NirvaBurner } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs");
// A person cannot open a tab before the window has finished starting; do not let the scene.
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
gBrowser.addTrustedTab(page("Harbour weekly"));
gBrowser.addTrustedTab(page("Kitchen notes"));
const site = Services.prefs.getStringPref("nirva.review.burner-site", "");
// With nirva.review.burner-about set, the explainer is opened from an ordinary tab instead.
let tab;
if (Services.prefs.getBoolPref("nirva.review.burner-about", false)) {
  NirvaBurner.openAbout(window);
  tab = gBrowser.selectedTab;
} else {
  tab = NirvaBurner.open(window, site || null);
}
if (!tab) {
  throw new Error("The burner tab did not open");
}
const deadline = Date.now() + 10000;
while (
  (tab.linkedBrowser.currentURI?.spec == "about:blank" || tab.hasAttribute("busy")) &&
  Date.now() < deadline
) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
await new Promise(resolve => setTimeout(resolve, 1200));
