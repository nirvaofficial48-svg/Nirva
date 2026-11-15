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
// The real panel is a separate popup that a headless screenshot cannot capture, so its
// content is placed on a stand-in surface at the popup's position for this picture.
// With nirva.review.trust-level set, the trust dial is shown on that step.
const trustLevel = Services.prefs.getStringPref("nirva.review.trust-level", "");
if (trustLevel) {
  ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/trust/NirvaTrust.sys.mjs"
  ).NirvaTrust.setLevel(gBrowser.selectedBrowser, trustLevel);
}
// With nirva.review.linkclean set to "cleaned" or "exempt", link cleaning shows that state.
const linkState = Services.prefs.getStringPref("nirva.review.linkclean", "");
if (linkState) {
  const { NirvaLinkCleaner } = ChromeUtils.importESModule(
    "moz-src:///browser/components/nirva/linkcleaner/NirvaLinkCleaner.sys.mjs"
  );
  if (linkState == "cleaned") {
    NirvaLinkCleaner.cleanedFor = () => ({
      original: gBrowser.currentURI,
      removed: ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"],
    });
  } else if (linkState == "exempt") {
    NirvaLinkCleaner.setSiteCleaning(gBrowser.currentURI, false);
  }
}
NirvaReceipt.update(window);
const button = document.getElementById("nirva-receipt-button");
const panel = document.getElementById("nirva-receipt-panel");
const box = panel.querySelector(".nirva-receipt");
await document.l10n.translateFragment(panel);
await document.l10n.translateFragment(button);
const stage = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
const rect = button.getBoundingClientRect();
stage.style.cssText = `position: fixed; z-index: 10; top: ${rect.bottom + 12}px; left: ${rect.right - 302}px; padding: 24px; border: 1px solid var(--nirva-hairline); border-radius: var(--nirva-radius-panel); background: var(--nirva-raised, var(--nirva-bg)); box-shadow: var(--nirva-panel-shadow); font-family: var(--nirva-font-ui); --panel-padding: 24px;`;
stage.append(box);
// With nirva.review.panel-height set, the panel is as short as on a small screen, so it scrolls.
const shortBy = Services.prefs.getIntPref("nirva.review.panel-height", 0);
if (shortBy) {
  box.style.maxHeight = `${shortBy}px`;
}
// The panel is now empty, so later refreshes of it are switched off for this picture.
NirvaReceipt.update = () => {};
if (Services.prefs.getBoolPref("nirva.review.trust-open", false)) {
  box.querySelector(".nirva-trust-toggle").click();
}
document.documentElement.append(stage);
button.setAttribute("open", "true");
await new Promise(resolve => setTimeout(resolve, 400));
