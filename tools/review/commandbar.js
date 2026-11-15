// Review scene for the command bar. nirva.review.query is typed into it ("" shows the
// list it opens with).
const { NirvaCommandBar } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/commandbar/NirvaCommandBar.sys.mjs");
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
const page = title => "data:text/html," + encodeURIComponent(`<title>${title}</title>${title}`);
NirvaWorkspaces.rename("home", "Study");
NirvaWorkspaces.create("Build");
["Maxwell's equations: lecture notes", "Waveguide solver documentation"].forEach(t => gBrowser.addTrustedTab(page(t)));
await PlacesUtils.bookmarks.insert({ parentGuid: PlacesUtils.bookmarks.unfiledGuid, url: "https://lumenjournal.example/photonics/waveguides", title: "Waveguides explained" });
await new Promise(r => setTimeout(r, 1200));
const query = Services.prefs.getStringPref("nirva.review.query", "");
NirvaCommandBar.open(window, query);
await NirvaCommandBar.search(window, query);
await new Promise(r => setTimeout(r, 600));
