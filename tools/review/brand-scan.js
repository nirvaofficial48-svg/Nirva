// Diagnostic: lists visible text and images that mention Firefox or Mozilla on built-in pages.
const pages = [
  "about:preferences", "about:preferences#home", "about:preferences#search", "about:preferences#privacy",
  "about:preferences#sync", "about:preferences#moreFromMozilla", "about:preferences#experimental",
  "about:addons", "about:protections", "about:logins", "about:downloads", "about:privatebrowsing",
];
const pattern = /firefox|mozilla|fxa|pocket/i;
function collect(root, out) {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let node = walker.currentNode; node; node = walker.nextNode()) {
    if (node.nodeType == Node.TEXT_NODE) {
      const el = node.parentElement;
      if (pattern.test(node.data) && el && el.checkVisibility?.({ visibilityProperty: true })) {
        out.add(`text: ${node.data.trim().slice(0, 400)}`);
      }
    } else {
      if (node.shadowRoot) collect(node.shadowRoot, out);
      const src = node.getAttribute?.("src") || "";
      const bg = node.checkVisibility?.() ? getComputedStyle(node).backgroundImage : "";
      for (const value of [src, bg]) {
        if (pattern.test(value) && node.checkVisibility?.()) out.add(`image: ${node.localName}.${node.className} ${value.slice(0, 120)}`);
      }
      if (node.localName == "label" || node.localName == "description") {
        const v = node.getAttribute("value");
        if (v && pattern.test(v) && node.checkVisibility?.()) out.add(`text: ${v}`);
      }
    }
  }
}
for (const url of pages) {
  const tab = gBrowser.addTrustedTab(url);
  gBrowser.selectedTab = tab;
  await new Promise(r => setTimeout(r, 2500));
  const doc = tab.linkedBrowser.contentDocument;
  const out = new Set();
  try { if (doc?.body) collect(doc.body, out); } catch (e) { out.add(`error ${e}`); }
  dump(`BRAND ${url}\n${[...out].map(l => `BRAND   ${l}`).join("\n")}\n`);
}
const out = new Set();
collect(document.documentElement, out);
dump(`BRAND browser-window\n${[...out].map(l => `BRAND   ${l}`).join("\n")}\n`);
