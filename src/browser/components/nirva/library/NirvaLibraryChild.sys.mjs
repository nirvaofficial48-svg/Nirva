/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  buildSnapshot:
    "moz-src:///browser/components/nirva/library/NirvaLibrarySnapshot.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const HIGHLIGHT_NAME = "nirva-library-highlight";
const NOTE_NAME = "nirva-library-note";
const MAX_QUOTE_LENGTH = 2000;
const CONTEXT_LENGTH = 32;
const MAX_STREAM_LENGTH = 4_000_000;
const RETRY_DELAYS_MS = [1500, 5000];
const SKIPPED_PARENTS = new Set([
  "script",
  "style",
  "noscript",
  "textarea",
  "template",
  "title",
]);
const COLOR = /^(?:#[0-9a-f]{3,8}|rgba?\([\d\s.,%/]+\))$/i;

function squeeze(text) {
  return String(text || "").replace(/\s+/g, "");
}

/**
 * The page's visible text with all white space removed, remembering where each character
 * came from, so a quote can be found again however the page breaks its lines.
 */
class TextStream {
  constructor(doc) {
    this.text = "";
    this.segments = [];
    const walker = doc.createTreeWalker(
      doc.body,
      doc.defaultView.NodeFilter.SHOW_TEXT
    );
    const visible = new Map();
    const parts = [];
    let length = 0;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || SKIPPED_PARENTS.has(parent.localName)) {
        continue;
      }
      if (!visible.has(parent)) {
        visible.set(parent, parent.checkVisibility());
      }
      if (!visible.get(parent)) {
        continue;
      }
      const data = node.data;
      const offsets = [];
      let kept = "";
      for (let index = 0; index < data.length; index++) {
        if (!/\s/.test(data[index])) {
          offsets.push(index);
          kept += data[index];
        }
      }
      if (!kept) {
        continue;
      }
      this.segments.push({ node, start: length, offsets });
      parts.push(kept);
      length += kept.length;
      if (length > MAX_STREAM_LENGTH) {
        break;
      }
    }
    this.text = parts.join("");
  }

  #segmentAt(position) {
    let low = 0;
    let high = this.segments.length - 1;
    while (low < high) {
      const middle = (low + high + 1) >> 1;
      if (this.segments[middle].start <= position) {
        low = middle;
      } else {
        high = middle - 1;
      }
    }
    return this.segments[low];
  }

  // Returns: The page range for stream characters `start` up to `end`.
  range(doc, start, end) {
    const first = this.#segmentAt(start);
    const last = this.#segmentAt(end - 1);
    const range = doc.createRange();
    range.setStart(first.node, first.offsets[start - first.start]);
    range.setEnd(last.node, last.offsets[end - 1 - last.start] + 1);
    return range;
  }

  // Returns: Every stream position where `needle` starts.
  positions(needle) {
    const found = [];
    for (
      let index = this.text.indexOf(needle);
      index != -1 && found.length < 200;
      index = this.text.indexOf(needle, index + 1)
    ) {
      found.push(index);
    }
    return found;
  }
}

/** Page side of the library: saves a copy, reads the selection, and paints highlights. */
export class NirvaLibraryChild extends JSWindowActorChild {
  #ranges = new Map();
  #annotations = [];
  #sheetURI = null;
  #timers = [];

  handleEvent(event) {
    if (event.type == "pageshow") {
      if (event.target == this.document) {
        this.#pageReady();
      }
    } else if (event.type == "contextmenu") {
      if (this.#ranges.size) {
        this.sendAsyncMessage("NirvaLibrary:ContextTarget", {
          id: this.#annotationAt(event),
        });
      }
    }
  }

  receiveMessage(message) {
    switch (message.name) {
      case "NirvaLibrary:Snapshot":
        return lazy.buildSnapshot(this.contentWindow).catch(error => {
          console.error("Nirva could not save this page", error);
          return { error: "unsupported" };
        });
      case "NirvaLibrary:Selection":
        return this.#selection();
      case "NirvaLibrary:Apply":
        this.#apply(message.data);
        return null;
      case "NirvaLibrary:Painted":
        return [...this.#ranges.keys()];
    }
    return null;
  }

  didDestroy() {
    this.#clearTimers();
  }

  #clearTimers() {
    for (const timer of this.#timers.splice(0)) {
      lazy.clearTimeout(timer);
    }
  }

  async #pageReady() {
    try {
      const data = await this.sendQuery("NirvaLibrary:PageReady", {
        url: this.document.documentURI,
      });
      this.#apply(data);
    } catch (_error) {}
  }

  #selection() {
    const win = this.contentWindow;
    const doc = win?.document;
    const selection = win?.getSelection();
    if (!doc?.body || !selection || selection.isCollapsed) {
      return { error: "empty" };
    }
    const quote = selection.toString().replace(/\s+/g, " ").trim();
    const needle = squeeze(quote);
    if (!needle || quote.length > MAX_QUOTE_LENGTH) {
      return { error: needle ? "too-long" : "empty" };
    }
    const selected = selection.getRangeAt(0);
    const stream = new TextStream(doc);
    for (const position of stream.positions(needle)) {
      const range = stream.range(doc, position, position + needle.length);
      const startsInside =
        selected.comparePoint(range.startContainer, range.startOffset) == 0;
      const endsInside =
        selected.comparePoint(range.endContainer, range.endOffset) == 0;
      if (startsInside && endsInside) {
        return {
          url: doc.documentURI,
          title: doc.title || "",
          quote,
          prefix: stream.text.slice(
            Math.max(0, position - CONTEXT_LENGTH),
            position
          ),
          suffix: stream.text.slice(
            position + needle.length,
            position + needle.length + CONTEXT_LENGTH
          ),
        };
      }
    }
    return { error: "unsupported" };
  }

  #locate(stream, annotation) {
    const needle = squeeze(annotation.quote);
    const prefix = squeeze(annotation.prefix);
    const suffix = squeeze(annotation.suffix);
    let best = null;
    let bestScore = -1;
    for (const position of stream.positions(needle)) {
      const end = position + needle.length;
      let score = 0;
      if (prefix && stream.text.slice(0, position).endsWith(prefix)) {
        score += 2;
      }
      if (suffix && stream.text.startsWith(suffix, end)) {
        score += 2;
      }
      if (score > bestScore) {
        best = position;
        bestScore = score;
      }
    }
    return best === null ? null : [best, best + needle.length];
  }

  #apply(data, attempt = 0) {
    const win = this.contentWindow;
    const doc = win?.document;
    if (!doc?.body || !win.CSS?.highlights) {
      return;
    }
    if (attempt == 0) {
      this.#clearTimers();
      this.#annotations = Array.isArray(data?.annotations)
        ? data.annotations
        : [];
      this.#setSheet(win, data?.accent);
    }
    this.#ranges.clear();
    const plain = new win.Highlight();
    const noted = new win.Highlight();
    let missing = 0;
    if (this.#annotations.length) {
      const stream = new TextStream(doc);
      for (const annotation of this.#annotations) {
        const found = this.#locate(stream, annotation);
        if (!found) {
          missing++;
          continue;
        }
        const range = stream.range(doc, found[0], found[1]);
        this.#ranges.set(annotation.id, range);
        (annotation.hasNote ? noted : plain).add(range);
      }
    }
    for (const [name, highlight] of [
      [HIGHLIGHT_NAME, plain],
      [NOTE_NAME, noted],
    ]) {
      if (highlight.size) {
        win.CSS.highlights.set(name, highlight);
      } else {
        win.CSS.highlights.delete(name);
      }
    }
    // Pages that fill in their text late get two more tries.
    if (missing && attempt < RETRY_DELAYS_MS.length) {
      this.#timers.push(
        lazy.setTimeout(() => {
          try {
            this.#apply(null, attempt + 1);
          } catch (_error) {}
        }, RETRY_DELAYS_MS[attempt])
      );
    }
  }

  #setSheet(win, accent) {
    const uri =
      this.#annotations.length && COLOR.test(accent)
        ? "data:text/css;charset=utf-8," +
          encodeURIComponent(
            `::highlight(${HIGHLIGHT_NAME}), ::highlight(${NOTE_NAME}) {` +
              `background-color: color-mix(in srgb, ${accent} 26%, transparent);` +
              `text-decoration: underline 1px ${accent};` +
              `text-underline-offset: 3px; }` +
              `::highlight(${NOTE_NAME}) { text-decoration-style: double; }`
          )
        : null;
    if (uri == this.#sheetURI) {
      return;
    }
    const utils = win.windowUtils;
    try {
      if (this.#sheetURI) {
        utils.removeSheetUsingURIString(this.#sheetURI, utils.AGENT_SHEET);
      }
      if (uri) {
        utils.loadSheetUsingURIString(uri, utils.AGENT_SHEET);
      }
      this.#sheetURI = uri;
    } catch (error) {
      console.error("Nirva could not style page highlights", error);
    }
  }

  #annotationAt(event) {
    try {
      const position = this.document.caretPositionFromPoint(
        event.clientX,
        event.clientY
      );
      if (!position?.offsetNode) {
        return null;
      }
      for (const [id, range] of this.#ranges) {
        if (range.isPointInRange(position.offsetNode, position.offset)) {
          return id;
        }
      }
    } catch (_error) {}
    return null;
  }
}
