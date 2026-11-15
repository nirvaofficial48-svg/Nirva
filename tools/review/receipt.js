// Review data only: a fresh screenshot profile has blocked nothing, so the scenes show sample numbers.
const { NirvaReceipt } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/receipt/NirvaReceipt.sys.mjs"
);
NirvaReceipt.summaryFor = browser =>
  ["http", "https"].includes(browser?.currentURI?.scheme)
    ? { trackers: 6, fingerprinters: 3, cookies: 11, loaded: 0, blocked: 9, protectionOff: false }
    : null;
NirvaReceipt.totals = async () => ({
  week: { trackers: 412, fingerprinters: 37, cookies: 268 },
  month: { trackers: 1986, fingerprinters: 143, cookies: 1204 },
  since: Date.now() - 41 * 24 * 60 * 60 * 1000,
});
NirvaReceipt._sites.clear();
for (const [host, trackers, fingerprinters, cookies, loaded] of [
  ["townforum.example", 2, 0, 5, 1],
  ["kitchennotes.example", 0, 0, 3, 0],
  ["harbourweekly.example", 6, 3, 11, 0],
  ["lumenjournal.example", 4, 1, 8, 0],
]) {
  NirvaReceipt._sites.set(host, { host, time: Date.now(), trackers, fingerprinters, cookies, loaded, blocked: trackers + fingerprinters });
}
const browser = gBrowser.selectedBrowser;
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
const deadline = Date.now() + 10000;
while (
  browser.contentDocument?.querySelectorAll("#sites tbody tr").length < 4 &&
  Date.now() < deadline
) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
if (browser.contentDocument?.querySelectorAll("#sites tbody tr").length < 4) {
  throw new Error("The receipt page did not list its sample sites");
}
await new Promise(resolve => setTimeout(resolve, 400));
