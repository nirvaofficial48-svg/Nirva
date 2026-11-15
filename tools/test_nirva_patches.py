#!/usr/bin/env python3
"""Round-trip test for tools/nirva-patches, run against a small throwaway git repository.

Run: python3 tools/test_nirva_patches.py
"""
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

TOOL = Path(__file__).resolve().parent / "nirva-patches"


def sh(cwd, *args):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True)


def git(cwd, *args):
    r = sh(cwd, "git", "-c", "user.name=t", "-c", "user.email=t@example.invalid", *args)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


class RoundTrip(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        t = Path(self.tmp.name)
        self.ff, self.store = t / "firefox", t / "store"
        self.ff.mkdir()
        self.store.mkdir()
        git(self.ff, "init", "-q", "-b", "main")
        (self.ff / "browser").mkdir()
        (self.ff / "browser" / "moz.build").write_text("".join(f"line {i}\n" for i in range(40)))
        (self.ff / "old.txt").write_text("to be removed\n")
        (self.ff / ".gitignore").write_text("/mozconfig\n")
        git(self.ff, "add", "-A")
        git(self.ff, "commit", "-q", "-m", "base")
        self.base = git(self.ff, "rev-parse", "HEAD")
        (self.store / "firefox-base.txt").write_text(self.base + "\n")

    def tearDown(self):
        self.tmp.cleanup()

    def tool(self, *args):
        return sh(self.store, sys.executable, str(TOOL), *args, "--firefox", str(self.ff), "--store", str(self.store))

    def make_changes(self):
        mb = self.ff / "browser" / "moz.build"
        mb.write_text(mb.read_text().replace("line 30\n", "line 30\n# NIRVA: added\n"))
        new = self.ff / "browser" / "components" / "nirva" / "x"
        new.mkdir(parents=True)
        (new / "a.mjs").write_text("export const a = 1;\n")
        (new / "icon.png").write_bytes(bytes(range(256)))
        (self.ff / "old.txt").unlink()
        (self.ff / "mozconfig").write_text("ac_add_options --enable-artifact-builds\n")

    def snapshot(self):
        files = {}
        for f in sorted(self.ff.rglob("*")):
            if f.is_file() and ".git/" not in f.as_posix():
                files[f.relative_to(self.ff).as_posix()] = f.read_bytes()
        return files

    def reset_to(self, rev):
        git(self.ff, "reset", "-q", "--hard", rev)
        git(self.ff, "clean", "-qfdx")

    def test_export_then_import_restores_identical_tree(self):
        self.make_changes()
        want = self.snapshot()
        r = self.tool("export")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertTrue((self.store / "src/browser/components/nirva/x/a.mjs").exists())
        self.assertTrue((self.store / "patches/browser--moz.build.patch").exists())
        self.assertEqual((self.store / "patches/deleted.txt").read_text(), "old.txt\n")
        self.reset_to(self.base)
        self.assertNotEqual(self.snapshot(), want)
        r = self.tool("import")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        self.assertEqual(self.snapshot(), want)

    def test_committed_and_uncommitted_changes_are_both_exported(self):
        self.make_changes()
        git(self.ff, "add", "-A")
        git(self.ff, "commit", "-q", "-m", "nirva work")
        (self.ff / "later.txt").write_text("uncommitted\n")
        want = self.snapshot()
        self.assertEqual(self.tool("export").returncode, 0)
        self.reset_to(self.base)
        self.assertEqual(self.tool("import").returncode, 0)
        self.assertEqual(self.snapshot(), want)

    def test_import_onto_newer_firefox_merges(self):
        self.make_changes()
        self.assertEqual(self.tool("export").returncode, 0)
        self.reset_to(self.base)
        mb = self.ff / "browser" / "moz.build"
        mb.write_text(mb.read_text().replace("line 2\n", "line 2\nupstream change\n"))
        git(self.ff, "commit", "-qam", "upstream moved")
        r = self.tool("import")
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        text = mb.read_text()
        self.assertIn("upstream change\n", text)
        self.assertIn("# NIRVA: added\n", text)

    def test_conflict_is_reported_not_hidden(self):
        self.make_changes()
        self.assertEqual(self.tool("export").returncode, 0)
        self.reset_to(self.base)
        mb = self.ff / "browser" / "moz.build"
        mb.write_text(mb.read_text().replace("line 30\n", "line thirty\n"))
        git(self.ff, "commit", "-qam", "upstream rewrote our spot")
        r = self.tool("import")
        self.assertEqual(r.returncode, 1)
        self.assertIn("browser--moz.build.patch", r.stdout)

    def test_import_refuses_dirty_tree(self):
        self.make_changes()
        self.assertEqual(self.tool("export").returncode, 0)
        r = self.tool("import")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("uncommitted changes", r.stderr)


if __name__ == "__main__":
    unittest.main()
