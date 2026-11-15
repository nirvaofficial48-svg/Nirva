/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const SENSITIVE_PARAMETER =
  /^(?:access[_-]?token|api[_-]?key|auth(?:orization)?|auth[_-]?token|code|client[_-]?secret|id[_-]?token|jwt|nonce|password|passwd|refresh[_-]?token|secret|session(?:id)?|sid|signature|sig|state|token|x[_-]?amz[_-]?(?:credential|security[_-]?token|signature))$/i;
const SENSITIVE_PAGE =
  /(?:^|[\s/_.-])(?:account[-_/ ]verification|authenticate|authentication|auth|banking|checkout|log[-_ ]?in|medical[-_/ ]?record|oauth|payment|password|patient[-_/ ]?portal|recovery|reset[-_ ]?password|sign[-_ ]?in|two[-_ ]?factor|2fa)(?:$|[\s/_.?#-])/i;

/**
 * Shared rules for what Nirva features may keep on disk.
 */
export const NirvaPrivacyRules = {
  /**
   * @param {string} value
   * @returns {string|null} The address without its fragment, or null when it is not a plain
   *   web address or carries credentials or secret parameters.
   */
  storableURL(value) {
    if (typeof value != "string" || value.length > 8192) {
      return null;
    }
    let url;
    try {
      url = new URL(value);
    } catch (_error) {
      return null;
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      [...url.searchParams.keys()].some(key => SENSITIVE_PARAMETER.test(key))
    ) {
      return null;
    }
    url.hash = "";
    return url.href;
  },

  // Sign-in, payment and similar pages, judged by address and title.
  isSensitivePage(value, title = "") {
    try {
      const url = new URL(value);
      return SENSITIVE_PAGE.test(`${url.hostname}${url.pathname} ${title}`);
    } catch (_error) {
      return true;
    }
  },

  isBurnerTab(tab) {
    return (
      !tab ||
      tab.hasAttribute("nirva-burner") ||
      tab.getAttribute("data-nirva-burner") == "true"
    );
  },
};
