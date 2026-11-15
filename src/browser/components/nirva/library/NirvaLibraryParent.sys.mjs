/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NirvaLibrary:
    "moz-src:///browser/components/nirva/library/NirvaLibrary.sys.mjs",
});

/** Parent side of the library page actor; the page asks it which highlights to paint. */
export class NirvaLibraryParent extends JSWindowActorParent {
  receiveMessage(message) {
    const browser = this.browsingContext.top.embedderElement;
    if (!browser) {
      return null;
    }
    if (message.name == "NirvaLibrary:PageReady") {
      return lazy.NirvaLibrary.pageReady(browser, message.data?.url);
    }
    if (message.name == "NirvaLibrary:ContextTarget") {
      lazy.NirvaLibrary.setContextTarget(browser, message.data?.id);
    }
    return null;
  }
}
