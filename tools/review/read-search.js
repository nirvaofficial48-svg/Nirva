const { NirvaReadSearchStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/readsearch/NirvaReadSearchStore.sys.mjs"
);
const store = NirvaReadSearchStore;
const now = Date.now();

await store.init();
await store.indexDocument({
  url: "https://lumenjournal.example/photonics/ring-resonators",
  title: "How a ring resonator traps light",
  body:
    "Light travelling along a waveguide can leak into a nearby ring resonator. " +
    "When its circumference fits a whole number of wavelengths, each lap adds " +
    "in step and the resonator stores light. This is how a ring resonator makes a filter.",
  visitedAt: now - 2 * 60 * 60 * 1000,
});
await store.indexDocument({
  url: "https://fieldnotes.example/optics/resonator-calibration",
  title: "Resonator calibration field notes",
  body:
    "Saved lab notes on ring resonator calibration, quartz substrates, and " +
    "measuring optical loss with a tunable laser.",
  sourceKind: "saved",
  localURI: "chrome://browser/content/nirva/read-search.html",
  visitedAt: now - 5 * 24 * 60 * 60 * 1000,
});
await store.indexDocument({
  url: "https://lumenjournal.example/engineering/optical-filters",
  title: "Optical filters in integrated photonics",
  body:
    "Integrated photonics combines waveguides and resonators to select a " +
    "wavelength. A ring resonator can reject or pass a narrow band of light.",
  visitedAt: now - 9 * 24 * 60 * 60 * 1000,
});
await store.excludeDomain("research.example.org");
await store.excludePage(
  "https://lumenjournal.example/drafts/unpublished-notes"
);

const page = gBrowser.selectedBrowser.contentDocument;
const deadline = Date.now() + 10000;
while (!page.getElementById("query") && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (!page.getElementById("query")) {
  throw new Error("Read Search did not finish loading");
}
Services.obs.notifyObservers(null, "nirva-read-search-changed");
const pauseButton = page.getElementById("pause-toggle");
await page.l10n.translateFragment(pauseButton);
if (!pauseButton.textContent.trim()) {
  throw new Error("The pause indexing button did not get its label");
}
const query = page.getElementById("query");
query.value = "ring resonator";
query.dispatchEvent(new page.defaultView.Event("input", { bubbles: true }));
while (
  !page.querySelector(".result-card") &&
  Date.now() < deadline
) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (!page.querySelector(".result-card")) {
  throw new Error("Read Search did not show its seeded results");
}
await new Promise(resolve => setTimeout(resolve, 300));
