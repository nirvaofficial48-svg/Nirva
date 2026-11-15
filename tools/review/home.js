// Review scene for the home screen: the page a new window starts on, with sample entries.
const { NirvaHome, HOME_URL } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/home/NirvaHome.sys.mjs");
const { NirvaClipsStore } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs");
const { NirvaTimeTravel } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/timetravel/NirvaTimeTravel.sys.mjs");
const { NirvaWorkspaces } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/sidebar/NirvaWorkspaces.sys.mjs");
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (gBrowser.selectedBrowser.currentURI.spec != HOME_URL) {
  throw new Error(`The window did not start on the home screen: ${gBrowser.selectedBrowser.currentURI.spec}`);
}
NirvaWorkspaces.rename("home", "Study");
NirvaWorkspaces.create("Build");
NirvaWorkspaces.create("Play");
for (const task of ["Build plain Firefox on the laptop", "Choose the browser's name", "Approve the toolbar design"]) {
  NirvaHome.addTodo(task);
}
NirvaHome.toggleTodo(NirvaHome.data.todo[0].id);
const day = new Date(Date.now() + 18 * 86400000);
NirvaHome.setCountdown("Launch day", `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`);
NirvaHome.setNote("Ask about the ring resonator figures before Friday.");
for (const [url, title] of [["mail.example", "Mail"], ["calendar.example", "Calendar"], ["notes.example", "Notes"], ["code.example", "Code"], ["video.example", "Video"]]) {
  NirvaHome.addLink(url, title);
}
// Review data only: a fresh profile has read nothing and clipped nothing yet.
Services.prefs.setStringPref("nirva.home.reading", JSON.stringify([
  { url: "https://lumenjournal.example/ring", title: "How a ring resonator traps light", percent: 62, time: Date.now() },
  { url: "https://lectures.example/maxwell", title: "Maxwell's equations: lecture notes", percent: 35, time: Date.now() },
  { url: "https://docs.example/waveguide", title: "Waveguide solver documentation", percent: 80, time: Date.now() },
]));
try {
  await NirvaClipsStore.create({ url: "https://build.example/status", selector: "#status", title: "Build status", sourceTitle: "Build status", text: "Linux build passed" });
  await NirvaClipsStore.create({ url: "https://shop.example/item", selector: "#price", title: "Price watch", sourceTitle: "Price watch", text: "No change yet" });
  Services.obs.notifyObservers(null, "nirva-live-clips-changed");
} catch (error) {
  dump(`home scene: clips not added: ${error}\n`);
}
try {
  await NirvaTimeTravel.captureNow("manual", null, true);
} catch (error) {
  dump(`home scene: no snapshot: ${error}\n`);
}
NirvaHome.startFocus();
NirvaHome._focus.endsAt = Date.now() + 1000 * (16 * 60 + 40);
if (Services.prefs.getBoolPref("nirva.review.home-edit", false)) {
  gBrowser.selectedBrowser.contentDocument.querySelector("#edit").click();
}
if (Services.prefs.getBoolPref("nirva.review.rail", false)) {
  document.getElementById("sidebar-button").click();
}
await new Promise(resolve => setTimeout(resolve, 1500));
