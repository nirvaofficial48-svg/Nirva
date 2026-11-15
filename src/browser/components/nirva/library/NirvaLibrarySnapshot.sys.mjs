/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NetUtil: "resource://gre/modules/NetUtil.sys.mjs",
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const MAX_DOM_LENGTH = 12 * 1024 * 1024;
const MAX_CSS_LENGTH = 4 * 1024 * 1024;
const MAX_RESOURCE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_BYTES = 18 * 1024 * 1024;
const MAX_RESOURCES = 600;
const MAX_TEXT_LENGTH = 250_000;
const FETCH_TIMEOUT_MS = 8000;
const PARALLEL_FETCHES = 6;
const IMPORT_DEPTH = 4;

// The saved file may only use what is embedded in it: no scripts, no network, no form posts.
const COPY_POLICY =
  "default-src 'none'; img-src data:; media-src data:; font-src data:; " +
  "style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'";
const CSS_URL = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s"']*))\s*\)/g;
const REMOVED_ELEMENTS = new Set([
  "script",
  "noscript",
  "base",
  "object",
  "embed",
  "applet",
  "template",
  "source",
  "track",
]);
const KEPT_INPUT_TYPES = new Set(["button", "submit", "reset"]);
const TYPE_BY_EXTENSION = {
  avif: "image/avif",
  gif: "image/gif",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  otf: "font/otf",
  png: "image/png",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(index, index + 0x8000)
    );
  }
  return btoa(binary);
}

function mediaType(reported, url) {
  if (
    /^[\w.+-]+\/[\w.+-]+$/.test(reported) &&
    !/^(?:application\/octet-stream|text\/plain|application\/x-unknown-content-type)$/.test(
      reported
    )
  ) {
    return reported;
  }
  let extension = "";
  try {
    extension = new URL(url).pathname.split(".").pop().toLowerCase();
  } catch (_error) {}
  return TYPE_BY_EXTENSION[extension] || "application/octet-stream";
}

/** Embeds a page's own images, styles and fonts so the copy needs nothing else. */
class ResourceInliner {
  constructor(doc) {
    this.doc = doc;
    this.cache = new Map();
    this.totalBytes = 0;
    this.embedded = 0;
    this.skipped = 0;
    this.active = 0;
    this.waiting = [];
  }

  absolute(value, base) {
    try {
      const url = new URL(value, base);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch (_error) {
      return null;
    }
  }

  // Returns: A data: address, or null when the resource is left out.
  dataURL(url, policy) {
    if (!this.cache.has(url)) {
      this.cache.set(
        url,
        this.#limit(() => this.#fetch(url, policy)).then(result => {
          if (result) {
            this.embedded++;
          } else {
            this.skipped++;
          }
          return result;
        })
      );
    }
    return this.cache.get(url);
  }

  async #limit(task) {
    if (this.active >= PARALLEL_FETCHES) {
      await new Promise(resolve => this.waiting.push(resolve));
    }
    this.active++;
    try {
      return await task();
    } finally {
      this.active--;
      this.waiting.shift()?.();
    }
  }

  #fetch(url, policy) {
    if (this.cache.size > MAX_RESOURCES || this.totalBytes >= MAX_TOTAL_BYTES) {
      return Promise.resolve(null);
    }
    return new Promise(resolve => {
      let channel;
      try {
        channel = lazy.NetUtil.newChannel({
          uri: url,
          loadingNode: this.doc,
          securityFlags:
            Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
          contentPolicyType: policy,
        });
        // The page already loaded these, so they normally come from the cache.
        channel.loadFlags |= Ci.nsIRequest.LOAD_FROM_CACHE;
      } catch (_error) {
        resolve(null);
        return;
      }
      const timer = lazy.setTimeout(
        () => channel.cancel(Cr.NS_BINDING_ABORTED),
        FETCH_TIMEOUT_MS
      );
      try {
        lazy.NetUtil.asyncFetch(channel, (stream, status, request) => {
          lazy.clearTimeout(timer);
          try {
            if (
              !Components.isSuccessCode(status) ||
              (request instanceof Ci.nsIHttpChannel &&
                !request.requestSucceeded)
            ) {
              resolve(null);
              return;
            }
            const size = stream.available();
            if (
              !size ||
              size > MAX_RESOURCE_BYTES ||
              this.totalBytes + size > MAX_TOTAL_BYTES
            ) {
              resolve(null);
              return;
            }
            const buffer = lazy.NetUtil.readInputStream(stream, size);
            this.totalBytes += size;
            const type = mediaType(request.contentType, url);
            resolve(`data:${type};base64,${toBase64(buffer)}`);
          } catch (_error) {
            resolve(null);
          } finally {
            try {
              stream?.close();
            } catch (_error) {}
          }
        });
      } catch (_error) {
        lazy.clearTimeout(timer);
        resolve(null);
      }
    });
  }

  // Replaces every url() in a piece of CSS with embedded data, relative to `base`.
  async css(text, base, policy = Ci.nsIContentPolicy.TYPE_IMAGE) {
    const found = new Map();
    for (const match of text.matchAll(CSS_URL)) {
      const raw = match[1] ?? match[2] ?? match[3] ?? "";
      if (!raw || raw.startsWith("#") || /^data:/i.test(raw)) {
        continue;
      }
      const url = this.absolute(raw, base);
      found.set(raw, url ? this.dataURL(url, policy) : Promise.resolve(null));
    }
    if (!found.size) {
      return text;
    }
    const resolved = new Map();
    await Promise.all(
      [...found].map(async ([raw, pending]) => resolved.set(raw, await pending))
    );
    return text.replace(CSS_URL, (whole, double, single, bare) => {
      const raw = double ?? single ?? bare ?? "";
      if (!resolved.has(raw)) {
        return whole;
      }
      // A resource that could not be embedded must not be requested from the copy.
      return `url("${resolved.get(raw) || "data:,"}")`;
    });
  }

  async sheet(sheet, depth = 0) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (_error) {
      return "";
    }
    const base = sheet.href || this.doc.baseURI;
    const parts = [];
    for (const rule of rules) {
      const kind = ChromeUtils.getClassName(rule);
      if (kind == "CSSImportRule") {
        if (rule.styleSheet && depth < IMPORT_DEPTH) {
          const imported = await this.sheet(rule.styleSheet, depth + 1);
          const media = rule.media?.mediaText;
          parts.push(media ? `@media ${media} {\n${imported}\n}` : imported);
        }
        continue;
      }
      parts.push(
        await this.css(
          rule.cssText,
          base,
          kind == "CSSFontFaceRule"
            ? Ci.nsIContentPolicy.TYPE_FONT
            : Ci.nsIContentPolicy.TYPE_IMAGE
        )
      );
    }
    return parts.join("\n");
  }
}

function stripActiveAttributes(element) {
  for (const name of element.getAttributeNames()) {
    if (/^on/i.test(name) || name == "nonce" || name == "integrity") {
      element.removeAttribute(name);
    }
  }
}

function scrubFormControl(copy) {
  const name = copy.localName;
  if (name == "input") {
    const type = (copy.getAttribute("type") || "text").toLowerCase();
    if (type == "hidden") {
      return false;
    }
    if (!KEPT_INPUT_TYPES.has(type)) {
      copy.removeAttribute("value");
      copy.removeAttribute("checked");
    }
  } else if (name == "textarea") {
    copy.textContent = "";
  } else if (name == "option") {
    copy.removeAttribute("selected");
  } else if (name == "form") {
    copy.removeAttribute("action");
  }
  return true;
}

function rewriteLink(live, copy, pageURL) {
  const raw = copy.getAttribute("href");
  if (raw === null) {
    return;
  }
  let target;
  try {
    target = new URL(live.href);
  } catch (_error) {
    copy.removeAttribute("href");
    return;
  }
  const sameDocument =
    target.hash &&
    target.href.slice(0, -target.hash.length) == pageURL &&
    raw.trim().startsWith("#");
  if (sameDocument) {
    copy.setAttribute("href", target.hash);
  } else if (["http:", "https:", "mailto:"].includes(target.protocol)) {
    copy.setAttribute("href", target.href);
    copy.setAttribute("rel", "noreferrer noopener");
  } else {
    copy.removeAttribute("href");
  }
  copy.removeAttribute("ping");
}

/**
 * Builds one self-contained, script-free HTML document from the page as it is shown now.
 *
 * @param {Window} win The content window to save.
 * @returns {Promise<object>} `{html, text, title, url, resources, skipped}` or `{error}`.
 */
export async function buildSnapshot(win) {
  const doc = win?.document;
  if (!doc?.documentElement || doc.contentType != "text/html" || !doc.body) {
    return { error: "unsupported" };
  }
  const pageURL = doc.documentURI.split("#")[0];
  const inliner = new ResourceInliner(doc);
  // An inert document: the copy must not start image or media loads while it is prepared.
  const inert = doc.implementation.createHTMLDocument("");
  const root = inert.importNode(doc.documentElement, true);
  const liveElements = [...doc.documentElement.querySelectorAll("*")];
  const copies = [...root.querySelectorAll("*")];
  if (liveElements.length != copies.length) {
    return { error: "unsupported" };
  }

  const pending = [];
  const removed = [];
  let cssLength = 0;
  const makeStyle = async (sheet, media) => {
    const style = inert.createElement("style");
    const text = await inliner.sheet(sheet);
    cssLength += text.length;
    if (cssLength > MAX_CSS_LENGTH) {
      return null;
    }
    if (media) {
      style.setAttribute("media", media);
    }
    style.textContent = text;
    return style;
  };

  for (let index = 0; index < copies.length; index++) {
    const live = liveElements[index];
    const copy = copies[index];
    const name = copy.localName;
    stripActiveAttributes(copy);

    if (REMOVED_ELEMENTS.has(name) || !scrubFormControl(copy)) {
      removed.push(copy);
      continue;
    }
    if (name == "meta") {
      if (copy.hasAttribute("http-equiv") || copy.hasAttribute("charset")) {
        removed.push(copy);
      }
      continue;
    }
    if (name == "link" || name == "style") {
      const sheet = live.sheet;
      if (sheet && !sheet.disabled) {
        pending.push(
          makeStyle(sheet, copy.getAttribute("media")).then(style => {
            if (style) {
              copy.replaceWith(style);
            } else {
              copy.remove();
            }
          })
        );
      } else {
        removed.push(copy);
      }
      continue;
    }
    if (name == "img" || (name == "input" && live.type == "image")) {
      for (const attribute of ["srcset", "sizes", "loading", "crossorigin"]) {
        copy.removeAttribute(attribute);
      }
      const url = inliner.absolute(live.currentSrc || live.src, doc.baseURI);
      if (url) {
        pending.push(
          inliner.dataURL(url, Ci.nsIContentPolicy.TYPE_IMAGE).then(data => {
            if (data) {
              copy.setAttribute("src", data);
            } else {
              copy.removeAttribute("src");
            }
          })
        );
      } else if (!/^data:/i.test(copy.getAttribute("src") || "")) {
        copy.removeAttribute("src");
      }
    } else if (name == "canvas") {
      try {
        const image = inert.createElement("img");
        image.setAttribute("src", live.toDataURL("image/png"));
        for (const attribute of ["id", "class", "style", "width", "height"]) {
          if (copy.hasAttribute(attribute)) {
            image.setAttribute(attribute, copy.getAttribute(attribute));
          }
        }
        copy.replaceWith(image);
        copies[index] = image;
      } catch (_error) {}
    } else if (name == "video" || name == "audio") {
      for (const attribute of ["src", "autoplay", "preload"]) {
        copy.removeAttribute(attribute);
      }
      const poster = name == "video" && inliner.absolute(live.poster, pageURL);
      copy.removeAttribute("poster");
      if (poster) {
        pending.push(
          inliner.dataURL(poster, Ci.nsIContentPolicy.TYPE_IMAGE).then(data => {
            if (data) {
              copy.setAttribute("poster", data);
            }
          })
        );
      }
    } else if (name == "iframe" || name == "frame") {
      copy.removeAttribute("src");
      copy.removeAttribute("srcdoc");
    } else if (name == "a" || name == "area") {
      rewriteLink(live, copy, pageURL);
    }

    const target = copies[index];
    const inlineStyle = target.getAttribute("style");
    if (inlineStyle?.includes("url(")) {
      pending.push(
        inliner
          .css(inlineStyle, doc.baseURI)
          .then(text => target.setAttribute("style", text))
      );
    }
  }

  for (const sheet of doc.adoptedStyleSheets || []) {
    pending.push(
      makeStyle(sheet, sheet.media?.mediaText).then(style => {
        if (style) {
          (root.querySelector("head") || root).append(style);
        }
      })
    );
  }

  await Promise.all(pending);
  for (const element of removed) {
    element.remove();
  }

  let head = root.querySelector("head");
  if (!head) {
    head = inert.createElement("head");
    root.prepend(head);
  }
  const meta = attributes => {
    const element = inert.createElement("meta");
    for (const [name, value] of Object.entries(attributes)) {
      element.setAttribute(name, value);
    }
    return element;
  };
  head.prepend(
    meta({ charset: "utf-8" }),
    meta({ "http-equiv": "Content-Security-Policy", content: COPY_POLICY }),
    meta({ name: "nirva-saved-from", content: pageURL }),
    meta({ name: "nirva-saved-at", content: new Date().toISOString() })
  );

  const markup = root.outerHTML;
  if (markup.length > MAX_DOM_LENGTH + inliner.totalBytes * 1.4) {
    return { error: "too-large" };
  }
  return {
    html: `${doc.compatMode == "CSS1Compat" ? "<!DOCTYPE html>\n" : ""}${markup}`,
    text: String(doc.body.innerText || "").slice(0, MAX_TEXT_LENGTH),
    title: doc.title || "",
    url: pageURL,
    resources: inliner.embedded,
    skipped: inliner.skipped,
  };
}
