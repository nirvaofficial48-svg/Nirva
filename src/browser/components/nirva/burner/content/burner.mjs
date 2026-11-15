/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { NirvaBurner } = ChromeUtils.importESModule(
  "moz-src:///browser/components/nirva/burner/NirvaBurner.sys.mjs"
);

const browserWindow = window.browsingContext.topChromeWindow;
const inside = NirvaBurner.isBurnerContext(
  window.browsingContext.originAttributes.userContextId
);
const openButton = document.querySelector("#open-burner");

document.querySelector("#intro-inside").hidden = !inside;
document.querySelector("#intro-outside").hidden = inside;
openButton.hidden = inside || !NirvaBurner.canOpen(browserWindow);
openButton.addEventListener("click", () => NirvaBurner.open(browserWindow));
