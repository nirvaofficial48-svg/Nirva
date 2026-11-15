/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { NirvaHome } from "moz-src:///browser/components/nirva/home/NirvaHome.sys.mjs";

/**
 *
 */
export class NirvaReadingParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name == "NirvaReading:Progress") {
      NirvaHome.recordReading(
        this.browsingContext.top.embedderElement,
        message.data
      );
    }
  }
}
