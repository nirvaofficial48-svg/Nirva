const { NirvaClipsStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClipsStore.sys.mjs"
);
await NirvaClipsStore.clear();
const fare = await NirvaClipsStore.create({
  url: "https://railtimes.example/routes/coast-line",
  selector: "#next-departures",
  sourceTitle: "Coast line departures · Rail Times",
  title: "Coast line departures",
  text: "09:14 Harbour Street, platform 2, on time. 09:44 Harbour Street, platform 2, on time. 10:14 Harbour Street, platform 3, delayed 6 minutes.",
});
await NirvaClipsStore.update(fare.id, { refreshHours: 6 });
const price = await NirvaClipsStore.create({
  url: "https://greenmarket.example/produce/today",
  selector: "main > section:nth-of-type(2)",
  sourceTitle: "Today's produce prices · Green Market",
  title: "Produce prices",
  text: "Quartz pears 41 per basket. Amber plums 28 per basket. Winter greens 12 per bunch. Prices updated each morning at seven.",
});
await NirvaClipsStore.update(price.id, { refreshHours: 24, paused: true });
const notice = await NirvaClipsStore.create({
  url: "https://townhall.example/notices",
  selector: "#latest-notice",
  sourceTitle: "Public notices · Town Hall",
  title: "Latest public notice",
  text: "Road works on Mill Lane begin Monday. Expect a diversion by the river bridge for two weeks.",
});
await NirvaClipsStore.recordError(notice.id, "missing-region");
Services.obs.notifyObservers(null, "nirva-live-clips-changed");

const page = gBrowser.selectedBrowser.contentDocument;
const deadline = Date.now() + 10000;
while (page.querySelectorAll(".clip-card").length < 3 && Date.now() < deadline) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (page.querySelectorAll(".clip-card").length < 3) {
  throw new Error("Live Clips did not show its seeded clips");
}
await new Promise(resolve => setTimeout(resolve, 400));
