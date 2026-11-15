const { NirvaClips } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/liveclips/NirvaClips.sys.mjs"
);
const browser = gBrowser.selectedBrowser;
NirvaClips.captureSelected(window);
await new Promise(resolve => setTimeout(resolve, 1200));
const rect = browser.getBoundingClientRect();
const x = rect.left + 80 + 200;
const y = rect.top + 150 + 140;
const utils = window.windowUtils;
for (const [dx, dy] of [[-40, -30], [0, 0]]) {
  if (utils.sendMouseEvent) {
    utils.sendMouseEvent("mousemove", x + dx, y + dy, 0, 0, 0);
  } else {
    window.synthesizeMouseEvent?.("mousemove", x + dx, y + dy, {});
  }
  await new Promise(resolve => setTimeout(resolve, 250));
}
await new Promise(resolve => setTimeout(resolve, 400));
