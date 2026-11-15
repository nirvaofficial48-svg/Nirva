const { NirvaRemix } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs"
);
const { NirvaRemixStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/remix/NirvaRemixStore.sys.mjs"
);
const browser = gBrowser.selectedBrowser;
const url = browser.currentURI.spec;
await NirvaRemixStore.clear();
const remix = await NirvaRemixStore.ensure(url, "site");
await NirvaRemixStore.addHidden(remix.id, { selector: "#promo", label: "div: Subscribe today" });
await NirvaRemixStore.addHidden(remix.id, { selector: "#trending", label: "aside: Trending now" });
await NirvaRemixStore.update(remix.id, { fontFamily: "serif", lineHeight: 1.6 });
const loaded = new Promise(resolve => {
  const listener = {
    onStateChange(_b, progress, _r, flags) {
      if (progress.isTopLevel && flags & Ci.nsIWebProgressListener.STATE_STOP) {
        gBrowser.removeTabsProgressListener(listener);
        resolve();
      }
    },
  };
  gBrowser.addTabsProgressListener(listener);
});
browser.reload();
await loaded;
await new Promise(resolve => setTimeout(resolve, 900));
if (!gBrowser.selectedTab.hasAttribute("nirva-remixed")) {
  throw new Error("The tab was not marked as remixed");
}
