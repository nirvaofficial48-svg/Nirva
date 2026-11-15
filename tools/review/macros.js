// Review scene for Macros: three saved macros, one open in the editor.
// With nirva.review.macros-notice set to "running" or "failed", that message bar is captured.
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
const { NirvaMacros } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/macros/NirvaMacros.sys.mjs");
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
NirvaWorkspaces.rename("home", "Study");
const build = NirvaWorkspaces.create("Build");
const evening = NirvaMacros.save({
  name: "Evening reading",
  steps: [
    { type: "command", command: "look-paper" },
    { type: "command", command: "mode-dark" },
    { type: "sleep-others" },
    { type: "open", url: "https://lecturenotes.example/maxwell" },
  ],
});
NirvaMacros.save({
  name: "Start work",
  steps: [
    { type: "command", command: `workspace-switch-${build}` },
    { type: "open", url: "https://codeforge.example/" },
  ],
});
NirvaMacros.save({ name: "Wind down", steps: [{ type: "close-others" }, { type: "command", command: "lite-on" }] });
const notice = Services.prefs.getStringPref("nirva.review.macros-notice", "");
if (notice) {
  const macro = NirvaMacros.get(evening);
  if (notice == "running") {
    await NirvaMacros._showRunning(window, macro, 3, NirvaMacros.titleOf(macro.steps[3], window));
  } else {
    NirvaMacros._notify(window, "nirva-macros-failed", {
      name: macro.name, step: 2, title: "Switch to workspace “Build”",
      reason: new Localization(["browser/nirva/macros.ftl"], true).formatValueSync("nirva-macros-error-gone"),
    });
  }
} else {
  const tab = NirvaMacros.openManager(window);
  const deadline = Date.now() + 10000;
  while (tab.linkedBrowser.contentDocument?.querySelectorAll("#macros .row").length < 3 && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  tab.linkedBrowser.contentDocument.querySelectorAll("#macros .row button")[4].click();
}
await new Promise(resolve => setTimeout(resolve, 1200));
