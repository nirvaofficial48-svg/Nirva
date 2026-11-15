const page = gBrowser.selectedBrowser.contentDocument;
const waitForReady = async () => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (page.getElementById("status")?.textContent.includes("Previewing changes")) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error("Theme Studio did not finish initializing");
};
await waitForReady();
const look = Services.prefs.getStringPref("nirva.review.theme.look", "glass");
const mode = Services.prefs.getStringPref("nirva.review.theme.mode", "bright");
const preset = {
  glass: "glass-mist",
  cockpit: "cockpit-amber",
  paper: "paper-linen",
}[look];
page.querySelector(`[data-preset="${preset}"]`).click();
const modePicker = page.getElementById("mode");
modePicker.value = mode;
modePicker.dispatchEvent(
  new page.defaultView.Event("change", { bubbles: true })
);
await new Promise(resolve => setTimeout(resolve, 300));
