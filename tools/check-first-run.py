#!/usr/bin/env python3
"""Start the built browser on a brand-new profile, as a person would, and check the
first-launch chooser (S2):

  1. with nobody to answer, the browser waits at the chooser and opens no page;
  2. after Continue the choice is saved and the browser carries on to open a page;
  3. a second start of the same profile goes straight to the browser.

Run:  python3 tools/check-first-run.py
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

FIREFOX = Path(__file__).resolve().parent.parent / "firefox"


def binary():
    for obj in sorted(FIREFOX.glob("obj-*")):
        for name in ("nirva", "firefox"):
            b = obj / "dist" / "bin" / name
            if b.exists():
                return str(b)
    sys.exit("No built browser found. Run ./mach build first.")


def run(profile, shot, seconds, auto=None):
    """Returns True if the browser got as far as drawing a page before the time ran out."""
    env = dict(os.environ, MOZ_HEADLESS="1")
    env.pop("NIRVA_WELCOME_AUTOCONTINUE", None)
    if auto:
        env["NIRVA_WELCOME_AUTOCONTINUE"] = auto
    shot.unlink(missing_ok=True)
    cmd = [binary(), "--no-remote", "--profile", str(profile), "--screenshot", str(shot), "--window-size=1440,900", "about:license"]
    proc = subprocess.Popen(
        cmd, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True
    )
    try:
        proc.wait(timeout=seconds)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, 9)
        proc.wait()
    return shot.exists()


def pref(profile, name):
    text = (profile / "prefs.js").read_text() if (profile / "prefs.js").exists() else ""
    m = re.search(r'user_pref\("%s", (.+?)\);' % re.escape(name), text)
    return m.group(1).strip('"') if m else None


def main():
    failures = []

    def check(ok, text):
        print(("ok      " if ok else "FAILED  ") + text, flush=True)
        if not ok:
            failures.append(text)

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        shot = tmp / "page.png"

        waiting = tmp / "waiting"
        waiting.mkdir()
        check(not run(waiting, shot, 25), "with nobody to answer, the browser waits at the chooser")

        profile = tmp / "profile"
        profile.mkdir()
        check(run(profile, shot, 90, auto="paper,dark"), "after Continue the browser carries on and opens a page")
        check(pref(profile, "nirva.look") == "paper", "the chosen look is saved (paper)")
        check(pref(profile, "nirva.mode") == "dark", "the chosen mode is saved (dark)")
        check(pref(profile, "nirva.welcome.done") == "true", "the chooser is marked as seen")

        check(run(profile, shot, 90), "a second start goes straight to the browser")
        check(pref(profile, "nirva.look") == "paper", "and keeps the choice")

    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
