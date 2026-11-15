#!/bin/sh
# Copy design/tokens.css (the approved source) into the browser, with the licence header
# Firefox's checks require. Run after any change to design/tokens.css, from anywhere.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
out="$root/firefox/browser/themes/shared/nirva/tokens.css"
{
  cat <<'HEADER'
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Generated from design/tokens.css by tools/sync-tokens.sh. Do not edit here. */

HEADER
  cat "$root/design/tokens.css"
} > "$out"
cd "$root/firefox" && ./mach lint -l stylelint --fix browser/themes/shared/nirva/tokens.css >/dev/null 2>&1 || true
echo "wrote $out"
