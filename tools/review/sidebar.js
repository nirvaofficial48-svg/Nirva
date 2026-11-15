// Review scene for the sidebar: three workspaces, one pinned site, a few tabs, one asleep.
const page = title => "data:text/html," + encodeURIComponent(`<title>${title}</title><body style="font:17px system-ui;padding:96px 112px">${title}`);
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
NirvaWorkspaces.rename("home", "Study");
NirvaWorkspaces.create("Build");
NirvaWorkspaces.create("Play");
gBrowser.pinTab(gBrowser.addTrustedTab(page("Mail")));
const tabs = ["Maxwell's equations: lecture notes", "Waveguide solver documentation", "Optics lecture playlist"].map(t => gBrowser.addTrustedTab(page(t)));
await new Promise(r => setTimeout(r, 1500));
gBrowser.discardBrowser(tabs[2], { forceDiscard: true });
if (Services.prefs.getBoolPref("nirva.review.rail", false)) {
  document.getElementById("sidebar-button").click();
}
await new Promise(r => setTimeout(r, 800));
gBrowser.selectedBrowser.focus();
await new Promise(r => setTimeout(r, 300));
