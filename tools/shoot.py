"""Start the built browser on a fresh profile, optionally run a script, save a window screenshot.

Run from firefox/ :
  ./mach python ../tools/shoot.py OUT.png [--url URL] [--pref name=value ...]
        [--script FILE.js] [--dialog CHROME_URL] [--size 1440x900] [--log FILE]

--script runs in the browser window with system privileges before the screenshot. It may use
`await`. --dialog opens that chrome window and captures it instead of the browser window.
--log writes the browser's own output (console errors) to a file for checking.
"""
import argparse
import base64
import sys
import time
from pathlib import Path

from marionette_driver.marionette import Marionette

FIREFOX = Path(__file__).resolve().parent.parent / "firefox"


def find_binary():
    for obj in sorted(FIREFOX.glob("obj-*")):
        for name in ("nirva", "firefox"):
            b = obj / "dist" / "bin" / name
            if b.exists():
                return str(b)
    sys.exit("No built browser found. Run ./mach build first.")


def parse_pref(text):
    name, _, value = text.partition("=")
    if value in ("true", "false"):
        return name, value == "true"
    try:
        return name, int(value)
    except ValueError:
        return name, value


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--url")
    ap.add_argument("--pref", action="append", default=[])
    ap.add_argument("--script")
    ap.add_argument("--dialog")
    ap.add_argument("--dialog-js", help="JavaScript run in the dialog after it opens")
    ap.add_argument("--size", default="1440x900")
    ap.add_argument("--log")
    ap.add_argument("--wait", type=float, default=1.0)
    args = ap.parse_args()
    width, height = (int(v) for v in args.size.split("x"))

    # The first-launch chooser waits for a person; screenshots skip it unless asked not to.
    prefs = {"nirva.welcome.done": True, "nirva.welcome.version": 2}
    prefs.update(dict(parse_pref(p) for p in args.pref))
    m = Marionette(
        bin=find_binary(),
        headless=True,
        prefs=prefs,
        gecko_log=args.log or "-",
        # Marionette sets the requested size below; Firefox does not accept these flags here.
        app_args=[],
    )
    m.start_session()
    m.timeout.page_load = 30
    try:
        m.set_context("chrome")
        m.set_window_rect(x=0, y=0, width=width, height=height)
        if args.url:
            with m.using_context("content"):
                m.navigate(args.url)
        if args.script:
            body = Path(args.script).read_text()
            error = m.execute_async_script(
                "const done = arguments[arguments.length - 1];"
                "(async () => {" + body + "\n})().then(() => done(null), e => done(String(e)));",
                script_timeout=60000,
            )
            if error:
                sys.exit(f"--script failed: {error}")
        if args.dialog:
            before = set(m.chrome_window_handles)
            m.execute_script(
                "window.openDialog(arguments[0], '', 'chrome,centerscreen');", [args.dialog]
            )
            deadline = time.time() + 20
            while time.time() < deadline and not set(m.chrome_window_handles) - before:
                time.sleep(0.2)
            new = set(m.chrome_window_handles) - before
            if not new:
                sys.exit("the dialog did not open")
            m.switch_to_window(new.pop())
            time.sleep(1.0)
            m.set_window_rect(x=0, y=0, width=width, height=height)
            if args.dialog_js:
                m.execute_async_script(
                    "const done = arguments[arguments.length - 1];"
                    "(async () => {" + args.dialog_js + "\n})().then(() => done(null), e => done(String(e)));",
                    script_timeout=60000,
                )
        time.sleep(args.wait)
        png = m.screenshot(format="base64", full=False)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_bytes(base64.b64decode(png))
        print(f"saved {args.out}")
    finally:
        try:
            m.quit()
        except Exception:
            m.cleanup()


if __name__ == "__main__":
    main()
