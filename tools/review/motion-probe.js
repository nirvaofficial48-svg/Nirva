// Records the browser window frame by frame while the address bar opens, takes typing and
// closes. Frames go to review/motion/<scene>-NN.png via the profile's IOUtils; timings are
// printed as MOTION lines (milliseconds between painted frames).
const wait = ms => new Promise(r => setTimeout(r, ms));
const out = Services.prefs.getStringPref("nirva.review.motion-out");
const scene = Services.prefs.getStringPref("nirva.review.motion-scene", "focus");
const H = 140;
async function grab(name) {
  const w = window.innerWidth;
  const bmp = await window.browsingContext.currentWindowGlobal.drawSnapshot(
    new DOMRect(0, 0, w, H), 1, "white", { resetScrollPosition: false });
  const c = document.createElement("canvas");
  c.width = w; c.height = H;
  c.getContext("2d").drawImage(bmp, 0, 0);
  const blob = await new Promise(r => c.toBlob(r));
  await IOUtils.write(`${out}/${name}.png`, new Uint8Array(await blob.arrayBuffer()));
}
async function record(label, action, frames = 14) {
  const times = [];
  let last = performance.now();
  const p = action();
  for (let i = 0; i < frames; i++) {
    await new Promise(r => requestAnimationFrame(r));
    const now = performance.now();
    times.push(Math.round(now - last));
    last = now;
    await grab(`${label}-${String(i).padStart(2, "0")}`);
  }
  await p;
  dump(`MOTION ${label} ${times.join(" ")}\n`);
}
await wait(2500);
if (scene === "focus") {
  await record("focus", async () => { gURLBar.focus(); gURLBar.select(); });
  await record("type", async () => {
    for (const ch of "nirva") {
      EventUtils_type(ch);
      await wait(60);
    }
  });
  await record("blur", async () => { gURLBar.handleRevert(); gBrowser.selectedBrowser.focus(); });
}
function EventUtils_type(ch) {
  gURLBar.inputField.value += ch;
  gURLBar.inputField.dispatchEvent(new InputEvent("input", { bubbles: true, data: ch, inputType: "insertText" }));
}
