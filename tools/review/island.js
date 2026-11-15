// Review scene for the island toolbar. nirva.review.island chooses the state:
// rest (default), collapsed, loading or focused.
const { NirvaIsland } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/island/NirvaIsland.sys.mjs");
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
const page = title => "data:text/html," + encodeURIComponent(`<title>${title}</title>${title}`);
NirvaWorkspaces.rename("home", "Study");
NirvaWorkspaces.create("Build");
NirvaWorkspaces.create("Play");
gBrowser.pinTab(gBrowser.addTrustedTab(page("Mail")));
["Maxwell's equations: lecture notes", "Waveguide solver documentation"].forEach(t => gBrowser.addTrustedTab(page(t)));
gBrowser.selectedBrowser.focus();
await new Promise(r => setTimeout(r, 1200));
const state = Services.prefs.getStringPref("nirva.review.island", "rest");
if (state == "collapsed") {
  NirvaIsland.onPageScroll(window, "down");
} else if (state == "loading") {
  document.documentElement.setAttribute("nirva-island-loading", "true");
} else if (state == "focused") {
  gURLBar.focus();
  gURLBar.select();
}
await new Promise(r => setTimeout(r, 600));
