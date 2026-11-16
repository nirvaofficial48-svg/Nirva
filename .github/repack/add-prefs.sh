#!/bin/bash
# Adds Nirva's default preferences to an already built browser/omni.ja.
# Usage: add-prefs.sh path/to/browser/omni.ja
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
omni=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
work=$(mktemp -d)
(cd "$work" && unzip -q "$omni")
mkdir -p "$work/defaults/preferences"
cp "$here"/prefs/00-nirva-*.js "$work/defaults/preferences/"
rm -f "$omni"
(cd "$work" && zip -qr -X "$omni" .)
rm -rf "$work"
echo "added $(ls "$here"/prefs | wc -l) preference files to $omni"
