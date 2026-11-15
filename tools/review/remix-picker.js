const { NirvaRemix } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs"
);
const { NirvaRemixStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs"
);
await NirvaRemixStore.clear();
const browser = gBrowser.selectedBrowser;
NirvaRemix.pickToHide(window);
await new Promise(resolve => setTimeout(resolve, 1200));
const rect = browser.getBoundingClientRect();
for (const [dx, dy] of [[300, 300], [200, 150]]) {
  await new Promise(resolve =>
    window.windowUtils.sendNativeMouseEvent(
      (window.mozInnerScreenX + rect.left + 64 + dx) * window.devicePixelRatio,
      (window.mozInnerScreenY + rect.top + dy) * window.devicePixelRatio,
      window.windowUtils.NATIVE_MOUSE_MESSAGE_MOVE,
      0,
      0,
      null,
      resolve
    )
  );
  await new Promise(resolve => setTimeout(resolve, 250));
}
await new Promise(resolve => setTimeout(resolve, 300));
