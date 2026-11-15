// Review scene for Tab rules: three workspaces, three rules and sample moves on the page.
// With nirva.review.tabrules-notice set, the message shown after a move is captured instead.
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
const { NirvaTabRules } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/tabrules/NirvaTabRules.sys.mjs");
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
NirvaWorkspaces.rename("home", "Study");
const build = NirvaWorkspaces.create("Build");
const play = NirvaWorkspaces.create("Play");
NirvaTabRules.addRule("lecturenotes.example", "home");
NirvaTabRules.addRule("codeforge.example", build);
NirvaTabRules.addRule("harbourvideo.example", play);
// Review data only: a fresh profile has moved nothing yet.
const sample = (minutesAgo, host, fromName, toName, undone) => ({
  id: NirvaTabRules._nextId++, time: Date.now() - minutesAgo * 60000, host, from: "home", fromName, toName, undone,
  tab: Cu.getWeakReference(gBrowser.selectedTab),
});
NirvaTabRules._log = [
  sample(4, "harbourvideo.example", "Study", "Play", false),
  sample(31, "codeforge.example", "Study", "Build", true),
];
if (Services.prefs.getBoolPref("nirva.review.tabrules-notice", false)) {
  NirvaTabRules._announceMove(window, NirvaTabRules._log[0]);
} else {
  const tab = NirvaTabRules.openManager(window);
  const deadline = Date.now() + 10000;
  while (tab.linkedBrowser.contentDocument?.querySelectorAll("#rules .row").length < 3 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}
await new Promise(resolve => setTimeout(resolve, 1200));
