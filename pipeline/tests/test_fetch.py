import ast
import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

import fetch


class VerifySha256Test(unittest.TestCase):
    def test_returns_true_when_digest_matches(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "f.txt")
            p.write_bytes(b"hello")
            self.assertTrue(fetch.verify_sha256(p, hashlib.sha256(b"hello").hexdigest()))

    def test_raises_on_mismatch(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d, "f.txt")
            p.write_bytes(b"hello")
            with self.assertRaises(fetch.ChecksumError):
                fetch.verify_sha256(p, "0" * 64)


class SafeUnzipTest(unittest.TestCase):
    def test_extracts_normal_members(self):
        with tempfile.TemporaryDirectory() as d:
            z = Path(d, "a.zip")
            with zipfile.ZipFile(z, "w") as zf:
                zf.writestr("inner/data.txt", "x")
            out = Path(d, "out")
            fetch.safe_unzip(z, out)
            self.assertEqual(Path(out, "inner/data.txt").read_text(), "x")

    def test_rejects_member_escaping_target(self):
        with tempfile.TemporaryDirectory() as d:
            z = Path(d, "a.zip")
            with zipfile.ZipFile(z, "w") as zf:
                zf.writestr("../evil.txt", "x")
            with self.assertRaises(fetch.UnsafeArchiveError):
                fetch.safe_unzip(z, Path(d, "out"))
            self.assertFalse(Path(d, "evil.txt").exists())


class StaleExtractTest(unittest.TestCase):
    def test_reextract_removes_files_from_previous_archive(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d, "out")
            for name, members in (("a.zip", {"old.txt": "1", "keep.txt": "1"}), ("b.zip", {"keep.txt": "2"})):
                z = Path(d, name)
                with zipfile.ZipFile(z, "w") as zf:
                    for m, body in members.items():
                        zf.writestr(m, body)
                fetch.safe_unzip(z, out)
            self.assertFalse(Path(out, "old.txt").exists())
            self.assertEqual(Path(out, "keep.txt").read_text(), "2")


class DownloadVerifyTest(unittest.TestCase):
    def _src(self, d, body, digest):
        remote = Path(d, "remote.txt")
        remote.write_bytes(body)
        return {"name": "t", "file": "t.txt", "url": remote.as_uri(), "sha256": digest, "unzip": False}

    def test_bad_download_is_not_left_in_place(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._src(d, b"tampered", hashlib.sha256(b"original").hexdigest())
            with self.assertRaises(fetch.ChecksumError):
                fetch.fetch_source(src, raw_dir=Path(d, "raw"))
            self.assertFalse(Path(d, "raw", "t", "t.txt").exists())

    def test_existing_file_with_wrong_hash_is_refetched(self):
        with tempfile.TemporaryDirectory() as d:
            src = self._src(d, b"good", hashlib.sha256(b"good").hexdigest())
            dest = Path(d, "raw", "t", "t.txt")
            dest.parent.mkdir(parents=True)
            dest.write_bytes(b"stale")
            fetch.fetch_source(src, raw_dir=Path(d, "raw"))
            self.assertEqual(dest.read_bytes(), b"good")


class MissingHashTest(unittest.TestCase):
    def test_empty_sha_hard_fails_without_downloading(self):
        with tempfile.TemporaryDirectory() as d:
            remote = Path(d, "remote.txt")
            remote.write_bytes(b"x")
            for digest in ("", None):
                src = {"name": "t", "file": "t.txt", "url": remote.as_uri(), "sha256": digest, "unzip": False}
                with self.assertRaisesRegex(fetch.ChecksumError, "no sha256"):
                    fetch.fetch_source(src, raw_dir=Path(d, "raw"))
            self.assertFalse(Path(d, "raw", "t", "t.txt").exists())

    def test_refresh_hashes_may_pin_an_empty_source(self):
        with tempfile.TemporaryDirectory() as d:
            remote = Path(d, "remote.txt")
            remote.write_bytes(b"x")
            src = {"name": "t", "file": "t.txt", "url": remote.as_uri(), "sha256": "", "unzip": False}
            fetch.fetch_source(src, refresh_hashes=True, raw_dir=Path(d, "raw"))
            self.assertEqual(src["sha256"], hashlib.sha256(b"x").hexdigest())


class EncodingLintTest(unittest.TestCase):
    """Text I/O in shipped code must name its encoding (the platform default differs across machines)."""

    @staticmethod
    def _is_text_io(call):
        f = call.func
        if isinstance(f, ast.Name):
            name = f.id
        elif isinstance(f, ast.Attribute):
            name = f.attr
        else:
            return False
        if name in ("read_text", "write_text"):
            return True
        if name == "TextIOWrapper":
            return isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "io"
        return name == "open" and isinstance(f, ast.Name)

    @staticmethod
    def _binary_mode(call):
        args = [call.args[1]] if len(call.args) > 1 else []
        args += [k.value for k in call.keywords if k.arg == "mode"]
        return any(isinstance(a, ast.Constant) and isinstance(a.value, str) and "b" in a.value for a in args)

    def test_text_io_always_names_an_encoding(self):
        pipeline = Path(fetch.__file__).resolve().parent
        root = pipeline.parent
        offenders = []
        for py in sorted(pipeline.rglob("*.py")):
            rel = py.relative_to(root)
            if "tests" in rel.parts or "__pycache__" in rel.parts:
                continue
            for node in ast.walk(ast.parse(py.read_text(encoding="utf-8"))):
                if isinstance(node, ast.Call) and self._is_text_io(node):
                    if not any(k.arg == "encoding" for k in node.keywords) and not self._binary_mode(node):
                        offenders.append(f"{rel}:{node.lineno}")
        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
