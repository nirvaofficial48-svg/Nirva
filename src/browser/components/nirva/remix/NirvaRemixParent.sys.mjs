/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NirvaRemix: "moz-src:///browser/components/nirva/remix/NirvaRemix.sys.mjs",
});

/** Answers a loading page that asks which remix applies to it. */
export class NirvaRemixParent extends JSWindowActorParent {
  receiveMessage(message) {
    if (message.name == "NirvaRemix:PageReady") {
      return lazy.NirvaRemix.pageInfo(
        this.browsingContext,
        String(message.data?.url || "")
      );
    }
    return null;
  }
}
