/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  clearTimeout: "resource://gre/modules/Timer.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

const CHIP_MS = 4000;
const FONT_STACKS = {
  serif: "Georgia, 'Times New Roman', serif",
  "sans-serif": "system-ui, 'Helvetica Neue', Arial, sans-serif",
  monospace: "ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace",
};
// Icon fonts draw their pictures with letters; changing their font would turn icons into text.
const NOT_ICONS =
  ":not(i, svg, svg *, [class*='icon' i], [class*='fa-'], [class*='material' i], [class*='glyph' i], [aria-hidden='true'])";
const OVERLAY_STYLE =
  "all: initial; position: fixed; z-index: 2147483647; inset: auto auto 24px 50%; transform: translateX(-50%); padding: 10px 14px; border: 1px solid #8394aa; border-radius: 10px; background: #18212b; color: #f5f7fa; box-shadow: 0 8px 32px #0008; font: 500 13px/1.4 system-ui, sans-serif; white-space: nowrap; pointer-events: none;";
const OUTLINE = "2px solid #91b3ff";
const PROTECTED_SELF =
  "main, [role='main'], form, dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true']";
const PROTECTED_INSIDE =
  "input[type='password'], [autocomplete^='cc-'], iframe[src*='captcha' i], iframe[src*='challenge' i], [id*='consent' i], [class*='consent' i], [id*='cookie' i], [class*='cookie' i], [id*='gdpr' i], [class*='gdpr' i]";
const CONSENT_NAME = /consent|cookie|gdpr|captcha/i;

function selectorFor(element, doc) {
  if (element.id) {
    const idSelector = `#${element.documentGlobal.CSS.escape(element.id)}`;
    try {
      if (doc.querySelectorAll(idSelector).length == 1) {
        return idSelector;
      }
    } catch (_error) {}
  }
  const parts = [];
  for (
    let current = element;
    current && current != doc.documentElement;
    current = current.parentElement
  ) {
    let part = current.localName;
    const siblings = [...current.parentElement.children].filter(
      sibling => sibling.localName == current.localName
    );
    if (siblings.length > 1) {
      part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
    }
    parts.unshift(part);
    const selector = parts.join(" > ");
    try {
      if (doc.querySelectorAll(selector).length == 1) {
        return selector;
      }
    } catch (_error) {}
  }
  return null;
}

// Sign-in and payment forms, consent prompts, challenges and the page's main content stay.
function isProtected(element, doc) {
  if (
    element == doc.documentElement ||
    element == doc.body ||
    element.matches(PROTECTED_SELF) ||
    element.querySelector(PROTECTED_INSIDE) ||
    element
      .closest("form")
      ?.querySelector("input[type='password'], [autocomplete^='cc-']")
  ) {
    return true;
  }
  for (
    let node = element;
    node && node != doc.body;
    node = node.parentElement
  ) {
    if (
      CONSENT_NAME.test(`${node.id} ${node.getAttribute("class") || ""}`) ||
      node.matches(
        "dialog, [role='dialog'], [role='alertdialog'], [aria-modal='true']"
      )
    ) {
      return true;
    }
  }
  return false;
}

function describe(element) {
  const words = String(
    element.getAttribute("aria-label") ||
      element.innerText ||
      element.textContent ||
      ""
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return words ? `${element.localName}: ${words}` : element.localName;
}

function elementFrom(event, doc) {
  for (const node of event.composedPath?.() || [event.target]) {
    if (
      node?.nodeType == 1 &&
      node.getRootNode() == doc &&
      !node.hasAttribute("data-nirva-remix-overlay")
    ) {
      return node;
    }
  }
  return null;
}

function cssFor({ fontFamily, lineHeight, selectors }) {
  const rules = [];
  for (const selector of selectors || []) {
    rules.push(`${selector} { display: none !important; }`);
  }
  if (FONT_STACKS[fontFamily]) {
    rules.push(
      `body, body *${NOT_ICONS} { font-family: ${FONT_STACKS[fontFamily]} !important; }`
    );
  }
  if (lineHeight) {
    rules.push(
      `body :is(p, li, dd, dt, blockquote, td, th, figcaption) { line-height: ${Number(lineHeight)} !important; }`
    );
  }
  return rules.join("\n");
}

/** Applies the user's remix to a page and lets them point at an element to hide. */
export class NirvaRemixChild extends JSWindowActorChild {
  #sheetURI = null;
  #scale = 0;
  #chipTimer = null;
  #contextTarget = null;
  #stopPicking = null;

  handleEvent(event) {
    if (event.type == "DOMContentLoaded") {
      if (event.target == this.document) {
        this.#pageReady();
      }
    } else if (event.type == "contextmenu") {
      const element = elementFrom(event, this.document);
      this.#contextTarget = element ? Cu.getWeakReference(element) : null;
    } else if (event.type == "TextZoomChange") {
      this.#keepTextScale();
    }
  }

  receiveMessage(message) {
    switch (message.name) {
      case "NirvaRemix:Apply":
        this.#apply(message.data?.remix || null);
        break;
      case "NirvaRemix:Pick":
        return this.#pick(message.data || {});
      case "NirvaRemix:ContextTarget":
        return this.#describeTarget(this.#contextTarget?.get());
    }
    return null;
  }

  didDestroy() {
    this.#stopPicking?.(null);
    lazy.clearTimeout(this.#chipTimer);
  }

  async #pageReady() {
    let info = null;
    try {
      info = await this.sendQuery("NirvaRemix:PageReady", {
        url: this.document.documentURI,
      });
    } catch (_error) {
      return;
    }
    if (!info?.remix || !this.document?.documentElement) {
      return;
    }
    this.#apply(info.remix);
    if (info.chip) {
      this.#showChip(String(info.chip));
    }
  }

  #apply(remix) {
    const utils = this.contentWindow?.windowUtils;
    if (!utils) {
      return;
    }
    const css = remix ? cssFor(remix) : "";
    const uri = css
      ? `data:text/css;charset=utf-8,${encodeURIComponent(css)}`
      : null;
    try {
      if (this.#sheetURI) {
        utils.removeSheetUsingURIString(this.#sheetURI, utils.USER_SHEET);
      }
      if (uri) {
        utils.loadSheetUsingURIString(uri, utils.USER_SHEET);
      }
      this.#sheetURI = uri;
    } catch (error) {
      this.#sheetURI = null;
      console.error("Nirva could not apply this remix", error);
    }
    const hadScale = this.#scale;
    this.#scale =
      remix && remix.textScale > 100 && remix.textScale <= 200
        ? remix.textScale / 100
        : 0;
    if (this.#scale) {
      this.#keepTextScale();
    } else if (hadScale) {
      this.browsingContext.textZoom = 1;
    }
  }

  // Firefox resets text zoom whenever it applies the site's own zoom level.
  #keepTextScale() {
    if (
      this.#scale &&
      Services.prefs.getBoolPref("browser.zoom.full", true) &&
      Math.abs(this.browsingContext.textZoom - this.#scale) > 0.001
    ) {
      this.browsingContext.textZoom = this.#scale;
    }
  }

  #overlay(text) {
    const doc = this.document;
    const box = doc.createElement("div");
    box.setAttribute("data-nirva-remix-overlay", "");
    box.style.cssText = OVERLAY_STYLE;
    box.textContent = text;
    doc.documentElement.append(box);
    return box;
  }

  #showChip(text) {
    lazy.clearTimeout(this.#chipTimer);
    this.document.querySelector("[data-nirva-remix-overlay='chip']")?.remove();
    const chip = this.#overlay(text);
    chip.setAttribute("data-nirva-remix-overlay", "chip");
    this.#chipTimer = lazy.setTimeout(() => chip.remove(), CHIP_MS);
  }

  #describeTarget(element) {
    const doc = this.document;
    if (!element?.isConnected || !doc) {
      return null;
    }
    if (isProtected(element, doc)) {
      return { error: "protected" };
    }
    const selector = selectorFor(element, doc);
    return selector
      ? { selector, label: describe(element) }
      : { error: "unsupported" };
  }

  #pick(labels) {
    const win = this.contentWindow;
    const doc = this.document;
    if (!win || !doc?.documentElement) {
      return Promise.resolve({ error: "unsupported" });
    }
    this.#stopPicking?.(null);
    return new Promise(resolve => {
      let highlighted = null;
      let oldOutline = null;
      const prompt = this.#overlay(String(labels.prompt || ""));
      prompt.setAttribute("data-nirva-remix-overlay", "picker");
      const restore = () => {
        if (highlighted && oldOutline) {
          if (oldOutline.value) {
            highlighted.style.setProperty(
              "outline",
              oldOutline.value,
              oldOutline.priority
            );
          } else {
            highlighted.style.removeProperty("outline");
          }
        }
        highlighted = null;
        oldOutline = null;
      };
      const finish = result => {
        if (!this.#stopPicking) {
          return;
        }
        this.#stopPicking = null;
        doc.removeEventListener("pointerover", onPointerOver, true);
        doc.removeEventListener("click", onClick, true);
        win.removeEventListener("keydown", onKeyDown, true);
        win.removeEventListener("pagehide", onPageHide, true);
        restore();
        prompt.remove();
        resolve(result);
      };
      const onPointerOver = event => {
        const element = event.isTrusted && elementFrom(event, doc);
        if (!element || element == highlighted) {
          return;
        }
        restore();
        if (element == doc.documentElement || element == doc.body) {
          return;
        }
        highlighted = element;
        oldOutline = {
          value: element.style.getPropertyValue("outline"),
          priority: element.style.getPropertyPriority("outline"),
        };
        element.style.setProperty("outline", OUTLINE, "important");
      };
      const onClick = event => {
        const element = event.isTrusted && elementFrom(event, doc);
        if (!element) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        restore();
        finish(this.#describeTarget(element));
      };
      const onKeyDown = event => {
        if (event.key == "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
        }
      };
      const onPageHide = () => finish(null);
      this.#stopPicking = finish;
      doc.addEventListener("pointerover", onPointerOver, true);
      doc.addEventListener("click", onClick, true);
      win.addEventListener("keydown", onKeyDown, true);
      win.addEventListener("pagehide", onPageHide, true);
    });
  }
}
