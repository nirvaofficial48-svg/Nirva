/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const MAX_TEXT_LENGTH = 30000;

function textOf(element) {
  return String(element.innerText || element.textContent || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

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

/** The page side only returns the text of a region the user explicitly clicked. */
export class NirvaClipsChild extends JSWindowActorChild {
  receiveMessage(message) {
    if (message.name == "NirvaClips:Extract") {
      return this.#extract(message.data.selector);
    }
    if (message.name == "NirvaClips:PickRegion") {
      return this.#pickRegion(message.data);
    }
    return null;
  }

  #extract(selector) {
    const doc = this.contentWindow?.document;
    if (!doc || typeof selector != "string" || selector.length > 2048) {
      return { error: "unsupported" };
    }
    try {
      const element = doc.querySelector(selector);
      const text = element && textOf(element);
      if (!element || !text) {
        return { error: "missing-region" };
      }
      return { text, title: doc.title || "" };
    } catch (_error) {
      return { error: "missing-region" };
    }
  }

  #pickRegion(labels = {}) {
    const win = this.contentWindow;
    const doc = win?.document;
    if (!win || !doc?.documentElement) {
      return Promise.resolve({ error: "unsupported" });
    }

    return new Promise(resolve => {
      let settled = false;
      let highlighted = null;
      let oldOutline = null;
      const banner = doc.createElement("div");
      banner.setAttribute("data-nirva-clip-picker", "");
      const shadow = banner.attachShadow({ mode: "closed" });
      const style = doc.createElement("style");
      style.textContent = `
        :host { all: initial; position: fixed; z-index: 2147483647; inset: auto auto 24px 50%;
          transform: translateX(-50%); pointer-events: none; }
        div { padding: 10px 14px; border: 1px solid #8394aa; border-radius: 10px;
          background: #18212b; color: #f5f7fa; box-shadow: 0 8px 32px #0008;
          font: 500 13px/1.4 system-ui, sans-serif; }
        span { color: #b8c8dc; margin-left: 8px; }
      `;
      const label = doc.createElement("div");
      label.append(
        doc.createTextNode(labels.prompt || "Choose a region to clip")
      );
      const cancel = doc.createElement("span");
      cancel.textContent = labels.cancel || "Esc to cancel";
      label.append(cancel);
      shadow.append(style, label);
      doc.documentElement.append(banner);

      const restoreHighlight = () => {
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
      const cleanup = () => {
        doc.removeEventListener("pointerover", onPointerOver, true);
        doc.removeEventListener("click", onClick, true);
        win.removeEventListener("keydown", onKeyDown, true);
        win.removeEventListener("pagehide", onPageHide, true);
        restoreHighlight();
        banner.remove();
      };
      const finish = result => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(result);
      };
      const selectableElement = event => {
        for (const node of event.composedPath?.() || [event.target]) {
          if (
            node?.nodeType == 1 &&
            node.getRootNode() == doc &&
            node != doc.documentElement &&
            node != doc.body
          ) {
            return node;
          }
        }
        return null;
      };
      const onPointerOver = event => {
        if (!event.isTrusted) {
          return;
        }
        const element = selectableElement(event);
        if (!element || element == highlighted) {
          return;
        }
        restoreHighlight();
        highlighted = element;
        oldOutline = {
          value: element.style.getPropertyValue("outline"),
          priority: element.style.getPropertyPriority("outline"),
        };
        element.style.setProperty("outline", "2px solid #91b3ff", "important");
      };
      const onClick = event => {
        if (!event.isTrusted) {
          return;
        }
        const element = selectableElement(event);
        if (!element) {
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        const selector = selectorFor(element, doc);
        const text = textOf(element);
        if (!selector || !text) {
          finish({ error: "missing-region" });
          return;
        }
        finish({
          url: win.location.href,
          title: doc.title || "",
          selector,
          text,
        });
      };
      const onKeyDown = event => {
        if (event.key == "Escape") {
          event.preventDefault();
          event.stopImmediatePropagation();
          finish(null);
        }
      };
      const onPageHide = () => finish({ error: "unsupported" });
      doc.addEventListener("pointerover", onPointerOver, true);
      doc.addEventListener("click", onClick, true);
      win.addEventListener("keydown", onKeyDown, true);
      win.addEventListener("pagehide", onPageHide, true);
    });
  }
}
