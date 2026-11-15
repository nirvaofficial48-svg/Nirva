/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaIsland } from "moz-src:///browser/components/nirva/island/NirvaIsland.sys.mjs";

/**
 * Receives the scroll direction of a page and passes it to the island of that page's window.
 */
export class NirvaIslandParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name != "NirvaIsland:Scroll") {
      return;
    }
    const browser = this.browsingContext.top.embedderElement;
    const win = browser?.documentGlobal;
    if (win?.gBrowser?.selectedBrowser === browser) {
      NirvaIsland.onPageScroll(win, message.data.state);
    }
  }
}
