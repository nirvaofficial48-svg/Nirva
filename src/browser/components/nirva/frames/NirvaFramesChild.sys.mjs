/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const PREF_ENABLED = "nirva.frames.enabled";

// The root takes the embedder's dark scheme, so the engine keeps the frame's
// canvas transparent; everything inside keeps the light defaults it was made for.
const SHEET =
  "data:text/css," +
  encodeURIComponent(
    ":root{color-scheme:dark!important;color:black}body{color-scheme:light}"
  );

function isTransparent(style) {
  return (
    style.backgroundImage === "none" &&
    /^rgba\(.*,\s*0\)$|^transparent$/.test(style.backgroundColor)
  );
}

function schemeOf(value, prefersDark) {
  const words = value.split(/\s+/);
  const dark = words.includes("dark");
  const light = words.includes("light");
  if (dark && light) {
    return prefersDark ? "dark" : "light";
  }
  return dark ? "dark" : "light";
}

/**
 * A light frame is painted with an opaque white
 * background when the page around it is dark. For frames that are meant to be
 * see-through, such as sign-in prompts, this gives them the page's scheme at
 * the root only, so the white box disappears and the frame looks as designed.
 */
export class NirvaFramesChild extends JSWindowActorChild {
  handleEvent(event) {
    if (
      !this.browsingContext.parent ||
      this._done ||
      !Services.prefs.getBoolPref(PREF_ENABLED, true)
    ) {
      return;
    }
    if (event.type === "load" || this.document.readyState !== "loading") {
      this._check();
    }
  }

  async _check() {
    const doc = this.document;
    const win = this.contentWindow;
    const root = doc?.documentElement;
    if (!win || !root || !doc.body) {
      return;
    }
    const rootStyle = win.getComputedStyle(root);
    let own = rootStyle.colorScheme;
    if (own === "normal") {
      own = doc.querySelector("meta[name=color-scheme]")?.content ?? "";
    }
    if (
      /\bdark\b/.test(own) ||
      !isTransparent(rootStyle) ||
      !isTransparent(win.getComputedStyle(doc.body))
    ) {
      return;
    }
    let scheme = null;
    try {
      scheme = await this.sendQuery("EmbedderScheme");
    } catch {
      return;
    }
    if (scheme !== "dark" || this._done || !this.contentWindow) {
      return;
    }
    this._done = true;
    this.contentWindow.windowUtils.loadSheetUsingURIString(
      SHEET,
      this.contentWindow.windowUtils.USER_SHEET
    );
  }

  receiveMessage({ name, data }) {
    if (name !== "SchemeFor") {
      return null;
    }
    const frame = BrowsingContext.get(data.id);
    const element = frame?.embedderElement;
    const win = this.contentWindow;
    if (!element || !win || frame.parent !== this.browsingContext) {
      return null;
    }
    let value = win.getComputedStyle(element).colorScheme;
    if (value === "normal") {
      value =
        this.document.querySelector("meta[name=color-scheme]")?.content ?? "";
    }
    return schemeOf(
      value,
      win.matchMedia("(prefers-color-scheme: dark)").matches
    );
  }
}
