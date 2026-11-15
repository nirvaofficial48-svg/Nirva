/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  isProbablyReaderable: "resource://gre/modules/Readerable.sys.mjs",
});

// A page counts as a long read when it is this many screens tall.
const MIN_SCREENS = 2.5;

/** Reports how far down an article the person was when they left it. */
export class NirvaReadingChild extends JSWindowActorChild {
  handleEvent(event) {
    const win = this.contentWindow;
    const doc = this.document;
    if (!win || win.top != win || !doc || event.target != doc) {
      return;
    }
    if (event.type == "visibilitychange" && doc.visibilityState != "hidden") {
      return;
    }
    if (!["http:", "https:"].includes(doc.location?.protocol)) {
      return;
    }
    const height = doc.documentElement?.scrollHeight ?? 0;
    const view = win.innerHeight;
    if (!view || height < view * MIN_SCREENS) {
      return;
    }
    try {
      if (!lazy.isProbablyReaderable(doc)) {
        return;
      }
    } catch (_error) {
      return;
    }
    this.sendAsyncMessage("NirvaReading:Progress", {
      url: doc.documentURI,
      title: doc.title,
      percent: Math.round(Math.min(1, (win.scrollY + view) / height) * 100),
    });
  }
}
