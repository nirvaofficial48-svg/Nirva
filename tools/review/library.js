const { NirvaLibraryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibraryStore.sys.mjs"
);
await NirvaLibraryStore.clear();
const body = text =>
  `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Saved</title></head><body><p>${text}</p></body></html>`;

const notesOnly = await NirvaLibraryStore.addAnnotation({
  url: "https://townhall.example/notices/mill-lane",
  title: "Mill Lane road works · Town Hall",
  quote: "Expect a diversion by the river bridge for two weeks.",
  prefix: "",
  suffix: "",
});
await NirvaLibraryStore.update(notesOnly.page.id, { tags: "local" });

const guide = await NirvaLibraryStore.saveCopy({
  url: "https://fieldguide.example/coast/tide-pools",
  title: "A field guide to tide pools",
  html: body("Tide pools. ".repeat(60000)),
  resources: 14,
  skipped: 2,
});
await NirvaLibraryStore.update(guide.id, {
  tags: "nature, reference",
  note: "Bring this on the March trip.",
});

const essay = await NirvaLibraryStore.saveCopy({
  url: "https://longreads.example/essays/the-slow-web",
  title: "The slow web: reading without the rush",
  html: body("Slow web. ".repeat(21000)),
  resources: 6,
});
await NirvaLibraryStore.update(essay.id, { tags: "reading, reference" });
const first = await NirvaLibraryStore.addAnnotation({
  url: essay.url,
  title: essay.title,
  quote:
    "A page you saved yourself is a page that cannot be taken away from you by a redesign, a paywall or a dead link.",
  prefix: "",
  suffix: "",
});
await NirvaLibraryStore.updateAnnotation(essay.id, first.annotation.id, {
  note: "Quote this in the newsletter.",
});
await NirvaLibraryStore.addAnnotation({
  url: essay.url,
  title: essay.title,
  quote: "Reading slowly is not the same as reading less.",
  prefix: "",
  suffix: "",
});
Services.obs.notifyObservers(null, "nirva-library-changed");

const page = gBrowser.selectedBrowser.contentDocument;
const deadline = Date.now() + 10000;
while (page.querySelectorAll(".page-card").length < 3 && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (page.querySelectorAll(".page-card").length < 3) {
  throw new Error("The Library did not show its seeded pages");
}
await new Promise(resolve => setTimeout(resolve, 400));
