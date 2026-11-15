// Review scene: the home screen of a new profile, with the sidebar collapsed as the owner uses it.
const { NirvaCommands } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs");
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
NirvaCommands.run("home-open", window);
await new Promise(resolve => setTimeout(resolve, 1000));
if (Services.prefs.getBoolPref("nirva.review.collapse", true)) {
  NirvaCommands.run("sidebar-toggle", window);
}
await new Promise(resolve => setTimeout(resolve, 1500));
