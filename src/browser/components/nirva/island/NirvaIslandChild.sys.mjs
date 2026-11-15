/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Scrolling less than this is ignored, so a trembling trackpad does not flip the island.
const MIN_DELTA = 4;
// Within this distance of the top of the page the island always shows.
const TOP_ZONE = 48;

/**
 * Runs next to each web page and tells the browser window which way the page is being
 * scrolled: "top", "down" or "up". Nothing about the page itself is sent.
 */
export class NirvaIslandChild extends JSWindowActorChild {
  #lastY = 0;
  #lastState = "";

  handleEvent(event) {
    if (event.type != "scroll" || event.target != this.document) {
      return;
    }
    const y = this.contentWindow.scrollY;
    const delta = y - this.#lastY;
    if (Math.abs(delta) < MIN_DELTA && y > TOP_ZONE) {
      return;
    }
    this.#lastY = y;
    let state = delta > 0 ? "down" : "up";
    if (y <= TOP_ZONE) {
      state = "top";
    }
    if (state != this.#lastState) {
      this.#lastState = state;
      this.sendAsyncMessage("NirvaIsland:Scroll", { state });
    }
  }
}
