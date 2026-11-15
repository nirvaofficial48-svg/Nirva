// Diagnostic: prints the boxes of the collapsed sidebar's selected tab.
const { NirvaCommands } = ChromeUtils.importESModule("moz-src:///browser/components/nirva/commandbar/NirvaCommands.sys.mjs");
for (let i = 0; i < 100 && !document.getElementById("nirva-burner-chip"); i++) {
  await new Promise(resolve => setTimeout(resolve, 50));
}
NirvaCommands.run("home-open", window);
NirvaCommands.run("sidebar-toggle", window);
await new Promise(resolve => setTimeout(resolve, 1500));
const tab = gBrowser.selectedTab;
const out = [];
for (const [name, el] of [
  ["sidebar-main", document.querySelector("sidebar-main")],
  ["vertical-tabs", document.getElementById("vertical-tabs")],
  ["tabbrowser-tabs", document.getElementById("tabbrowser-tabs")],
  ["tab", tab],
  ["stack", tab.querySelector(".tab-stack")],
  ["background", tab.querySelector(".tab-background")],
  ["content", tab.querySelector(".tab-content")],
  ["icon", tab.querySelector(".tab-icon-stack")],
]) {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  out.push(`${name}: x=${r.x.toFixed(1)} w=${r.width.toFixed(1)} ml=${cs.marginLeft} mr=${cs.marginRight} pl=${cs.paddingLeft} pr=${cs.paddingRight}`);
}
const tabs = document.getElementById("tabbrowser-tabs");
out.push(`vars: inner=${getComputedStyle(tabs).getPropertyValue("--tab-margin-inline-inner")} collapsed=${getComputedStyle(tabs).getPropertyValue("--tab-collapsed-width")} bgw=${getComputedStyle(tab).getPropertyValue("--tab-collapsed-background-width")}`);
dump(out.map(l => `NIRVA-M ${l}\n`).join(""));
