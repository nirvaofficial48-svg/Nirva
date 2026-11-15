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
