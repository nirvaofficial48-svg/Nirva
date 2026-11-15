#!/usr/bin/env python3
"""Generate firefox/browser/branding/nirva from branding/nirva-icon.svg.

Starts from a copy of Firefox's "unofficial" branding folder, then replaces every image and
name in it. Safe to run again: it only rewrites files it generates.

Needs: ImageMagick (`magick`, with SVG support) and Pillow. Both are free.
Run: python3 tools/make-branding.py
"""
import io
import re
import shutil
import subprocess
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
FF = ROOT / "firefox"
SRC = FF / "browser/branding/unofficial"
OUT = FF / "browser/branding/nirva"
ICON_SVG = (ROOT / "branding/nirva-icon.svg").read_text()
WORDMARK_SVG = (ROOT / "branding/nirva-wordmark.svg").read_text()
INK, PAPER = "#14181D", "#F2F1EE"  # the two colours of the approved icon
MASTER = 1024

MPL = """<!-- This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->
"""


def stroke_for(size):
    """designs/Logo.html: stroke 9 normally, 10 at 32 px, 12 at 16 px."""
    return 12 if size <= 16 else 10 if size <= 32 else 9


_masters = {}


def master(stroke):
    if stroke not in _masters:
        svg = ICON_SVG.replace('stroke-width="9"', f'stroke-width="{stroke}"')
        assert f'stroke-width="{stroke}"' in svg
        png = subprocess.run(
            ["magick", "-background", "none", "-density", "384", "svg:-", "-resize", f"{MASTER}x{MASTER}", "png:-"],
            input=svg.encode(), capture_output=True, check=True,
        ).stdout
        _masters[stroke] = Image.open(io.BytesIO(png)).convert("RGBA")
    return _masters[stroke]


def icon(size):
    return master(stroke_for(size)).resize((size, size), Image.LANCZOS)


def on_canvas(w, h, background=None, scale=0.6):
    """The icon centred on a w x h canvas (transparent unless a background is given)."""
    side = int(min(w, h) * scale)
    canvas = Image.new("RGBA", (w, h), background or (0, 0, 0, 0))
    ic = icon(side)
    canvas.alpha_composite(ic, ((w - side) // 2, (h - side) // 2))
    return canvas


def write_png(rel):
    path = OUT / rel
    w, h = Image.open(SRC / rel).size
    img = icon(w) if w == h else on_canvas(w, h)
    if Image.open(SRC / rel).mode == "RGB":
        img = on_canvas(w, h, PAPER).convert("RGB")
    img.save(path, optimize=True)


def write_ico(rel, sizes):
    big = max(sizes)
    icon(big).save(OUT / rel, format="ICO", append_images=[icon(s) for s in sizes if s != big],
                   sizes=[(s, s) for s in sizes])


def write_icns(rel):
    icon(1024).save(OUT / rel, format="ICNS",
                    append_images=[icon(s) for s in (16, 32, 64, 128, 256, 512)])


def sub(rel, pairs, already_done_ok=False):
    path = OUT / rel
    text = path.read_text()
    for pattern, repl in pairs:
        text, n = re.subn(pattern, repl, text, flags=re.M)
        # On a second run a pattern that was removed outright is no longer there to match.
        assert n or already_done_ok, f"{rel}: nothing matched {pattern!r}"
    path.write_text(text)


def main():
    if not OUT.exists():
        shutil.copytree(SRC, OUT)

    for src in sorted(SRC.rglob("*.png")):
        write_png(src.relative_to(SRC))
    write_ico("firefox.ico", [16, 24, 32, 48, 64, 256])
    write_ico("firefox64.ico", [16, 32, 48, 64])
    write_ico("pbmode.ico", [16, 24, 32, 48, 64, 256])
    write_ico("newtab.ico", [16, 32])
    write_ico("newwindow.ico", [16, 32])
    write_ico("document.ico", [16, 32, 48, 256])
    for name in ("firefox.icns", "document.icns", "disk.icns"):
        write_icns(name)
    for name in ("wizHeader.bmp", "wizHeaderRTL.bmp", "wizWatermark.bmp"):
        w, h = Image.open(SRC / name).size
        on_canvas(w, h, PAPER).convert("RGB").save(OUT / name, format="BMP")
    w, h = Image.open(SRC / "stubinstaller/bgstub.jpg").size
    Image.new("RGB", (w, h), PAPER).save(OUT / "stubinstaller/bgstub.jpg", quality=90)
    w, h = Image.open(SRC / "background.png").size
    Image.new("RGBA", (w, h), PAPER).save(OUT / "background.png", optimize=True)

    # Only the outer size is dropped; the square inside keeps its width and height.
    icon_svg = MPL + re.sub(r' width="\d+" height="\d+"', "", ICON_SVG, count=1)
    (OUT / "content/about-logo.svg").write_text(icon_svg)
    (OUT / "content/about-wordmark.svg").write_text(WORDMARK_SVG)
    (OUT / "content/firefox-wordmark.svg").write_text(WORDMARK_SVG)

    (OUT / "configure.sh").write_text(
        "# This Source Code Form is subject to the terms of the Mozilla Public\n"
        "# License, v. 2.0. If a copy of the MPL was not distributed with this\n"
        "# file, You can obtain one at http://mozilla.org/MPL/2.0/.\n\n"
        "MOZ_APP_DISPLAYNAME=Nirva\n"
        "MOZ_MACBUNDLE_ID=nirva\n"
    )
    sub("locales/en-US/brand.ftl", [
        (r"^(-brand-(?:shorter|short|shortcut|full|product)-name) = .*$", r"\1 = Nirva"),
        (r"^(-vendor-short-name) = .*$", r"\1 = Nirva"),
    ])
    sub("locales/en-US/brand.properties", [(r"^(brand\w+Name)=.*$", r"\1=Nirva")])
    sub("pref/firefox-branding.js", [(r"https://nightly\.mozilla\.org", "")], already_done_ok=True)


if __name__ == "__main__":
    main()
    print(f"wrote {OUT.relative_to(ROOT)}")
