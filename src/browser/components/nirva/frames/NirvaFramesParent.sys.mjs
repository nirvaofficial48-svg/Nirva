/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Asks the page that holds a frame which colour scheme it shows the frame on.
 */
export class NirvaFramesParent extends JSWindowActorParent {
  async receiveMessage({ name }) {
    if (name !== "EmbedderScheme") {
      return null;
    }
    const embedder = this.browsingContext.parent?.currentWindowGlobal;
    if (!embedder) {
      return null;
    }
    try {
      const scheme = await embedder
        .getActor("NirvaFrames")
        .sendQuery("SchemeFor", { id: this.browsingContext.id });
      return scheme === "dark" || scheme === "light" ? scheme : null;
    } catch {
      return null;
    }
  }
}
