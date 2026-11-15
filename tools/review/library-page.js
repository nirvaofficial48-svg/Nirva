const { NirvaLibrary } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibrary.sys.mjs"
);
const { NirvaLibraryStore } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/library/NirvaLibraryStore.sys.mjs"
);
await NirvaLibraryStore.clear();
const browser = gBrowser.selectedBrowser;
const pick = async id => {
  await browser.messageManager.loadFrameScript(
    `data:,(${encodeURIComponent(
      String(target => {
        const node = content.document.getElementById(target);
        const range = content.document.createRange();
        range.selectNodeContents(node);
        const selection = content.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      })
    )})(${JSON.stringify(id)})`,
    false
  );
  await new Promise(resolve => setTimeout(resolve, 300));
};
await pick("first");
const one = await NirvaLibrary.highlightSelection(window);
await pick("second");
const two = await NirvaLibrary.highlightSelection(window);
if (!one || !two) {
  throw new Error("The demo page could not be highlighted");
}
await NirvaLibrary.setAnnotationNote(
  two.page.id,
  two.annotation.id,
  "Check the timetable"
);
await browser.messageManager.loadFrameScript(
  "data:,content.getSelection().removeAllRanges()",
  false
);
if (!(await NirvaLibrary.savePage(window))) {
  throw new Error("The demo page could not be saved");
}
if (window.NIRVA_REVIEW_OPEN_COPY) {
  await NirvaLibrary.openCopy(window, one.page.id);
}
await new Promise(resolve => setTimeout(resolve, 1200));
