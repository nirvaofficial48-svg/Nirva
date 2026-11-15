const { NirvaRemix } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs"
);
const { NirvaRemixStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs"
);
await NirvaRemixStore.clear();
const forum = await NirvaRemixStore.ensure("https://townforum.example/", "site");
await NirvaRemixStore.update(forum.id, { enabled: false, textScale: 110 });
const recipe = await NirvaRemixStore.ensure(
  "https://kitchennotes.example/recipes/winter-soup",
  "page"
);
await NirvaRemixStore.update(recipe.id, { textScale: 150, lineHeight: 1.8 });
const news = await NirvaRemixStore.ensure("https://harbourweekly.example/", "site");
await NirvaRemixStore.update(news.id, {
  fontFamily: "serif",
  textScale: 125,
  lineHeight: 1.6,
});
await NirvaRemixStore.addHidden(news.id, {
  selector: "#promo",
  label: "div: Subscribe today: forty percent off the weekend edition.",
});
await NirvaRemixStore.addHidden(news.id, {
  selector: "#trending",
  label: "aside: Trending now",
});
NirvaRemix._pendingURL = "https://harbourweekly.example/";
Services.obs.notifyObservers(null, "nirva-remix-focus");

const page = gBrowser.selectedBrowser.contentDocument;
const deadline = Date.now() + 10000;
while (page.querySelectorAll(".page-card").length < 3 && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (page.querySelectorAll(".page-card").length < 3) {
  throw new Error("Page Remix did not show its seeded remixes");
}
await new Promise(resolve => setTimeout(resolve, 400));
