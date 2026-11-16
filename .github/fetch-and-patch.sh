#!/bin/bash
# Fetches Firefox at the commit Nirva is based on and applies Nirva's changes.
set -euo pipefail
base=$(cut -d' ' -f1 firefox-base.txt)
git init -q firefox
git -C firefox remote add origin https://github.com/mozilla-firefox/firefox
git -C firefox fetch -q --depth 1 origin "$base"
git -C firefox checkout -q FETCH_HEAD
cp configs/mozconfig.release firefox/mozconfig
# No debugging data: it fills the build machine's disk and nobody downloads it.
echo 'ac_add_options --disable-debug-symbols' >> firefox/mozconfig
if [ "$(uname)" = Darwin ]; then
  echo 'ac_add_options --enable-macos-target=12.0' >> firefox/mozconfig
fi
python3 tools/nirva-patches import
