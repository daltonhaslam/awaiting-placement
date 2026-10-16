"""Download the public source files listed in sources.json into data/raw/.

Each source is verified against a pinned SHA-256 so a rebuild uses byte-identical inputs.
Zip archives are extracted with a path-traversal guard.

Usage:  python3 -I pipeline/fetch.py [--only NAME] [--refresh-hashes]
"""
import argparse
import hashlib
import json
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent
ROOT = PIPELINE.parent
RAW_DIR = ROOT / "data" / "raw"
SOURCES = PIPELINE / "sources.json"
USER_AGENT = "Mozilla/5.0 (awaiting-placement data fetch)"


class ChecksumError(Exception):
    pass


class UnsafeArchiveError(Exception):
    pass


class UnsafeRedirectError(Exception):
    pass


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_sha256(path, expected):
    actual = sha256_of(path)
    if actual != expected:
        raise ChecksumError(f"{path}: expected sha256 {expected}, got {actual}")
    return True


def safe_unzip(zip_path, target):
    """Extract into a fresh `target` (previous contents removed) after rejecting path-traversal members."""
    target = Path(target).resolve()
    with zipfile.ZipFile(zip_path) as zf:
        for member in zf.infolist():
            dest = (target / member.filename).resolve()
            if not dest.is_relative_to(target):
                raise UnsafeArchiveError(f"{zip_path}: member {member.filename!r} escapes {target}")
        if target.exists():
            shutil.rmtree(target)
        target.mkdir(parents=True)
        zf.extractall(target)


def download(url, dest, expected=None):
    """Download to a .part file and move it into place only after its hash matches `expected` (when given)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_suffix(dest.suffix + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp, open(part, "wb") as out:
            if url.startswith("https://") and not resp.geturl().startswith("https://"):
                raise UnsafeRedirectError(f"{url}: redirected to a non-https address ({resp.geturl()}); refusing to use it")
            shutil.copyfileobj(resp, out)
        if expected:
            verify_sha256(part, expected)
    except (ChecksumError, UnsafeRedirectError):
        part.unlink(missing_ok=True)
        raise
    part.replace(dest)


def fetch_source(src, refresh_hashes=False, raw_dir=RAW_DIR):
    """Ensure data/raw/<name>/<file> exists with the pinned hash (re-downloading if missing or different).

    With refresh_hashes, always re-download and record the new hash instead of verifying.
    """
    if not refresh_hashes and not src.get("sha256"):
        raise ChecksumError(f"{src['name']}: no sha256 pinned in sources.json; refusing to download unverified (use --refresh-hashes to pin deliberately)")
    folder = raw_dir / src["name"]
    dest = folder / src["file"]
    if refresh_hashes or not dest.exists() or sha256_of(dest) != src["sha256"]:
        print(f"  downloading {src['url']}", flush=True)
        download(src["url"], dest, None if refresh_hashes else src["sha256"])
        if refresh_hashes:
            src["sha256"] = sha256_of(dest)
    else:
        print(f"  ok: {dest.name} is present and matches its pinned sha256", flush=True)
    if src.get("unzip"):
        safe_unzip(dest, folder / "extracted")


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--only", help="fetch a single source by name")
    ap.add_argument("--refresh-hashes", action="store_true", help="record current file hashes instead of verifying")
    args = ap.parse_args(argv)
    sources = json.loads(SOURCES.read_text(encoding="utf-8"))
    if args.only and args.only not in {s["name"] for s in sources}:
        print(f"no source named {args.only!r} in sources.json; names are: {', '.join(s['name'] for s in sources)}", file=sys.stderr)
        return 2
    for src in sources:
        if args.only and src["name"] != args.only:
            continue
        print(f"[{src['name']}]", flush=True)
        try:
            fetch_source(src, args.refresh_hashes)
        except ChecksumError as e:
            fallback = (" Until then the committed pipeline/derived/hcris_extract.csv already holds this file's extracted rows."
                        if src['name'].startswith('hcris_') else '')
            print(f"\n{e}\n\nThe file CMS now serves is not the one the published numbers were built from (CMS refreshes these"
                  f" files). That is deliberate: different bytes mean different numbers. To move to the new file on purpose,"
                  f" re-pin it with `python3 -I pipeline/fetch.py --only {src['name']} --refresh-hashes`, rebuild, and expect"
                  f" the outputs to change.{fallback}", file=sys.stderr)
            return 1
        except UnsafeRedirectError as e:
            print(f"\n{e}\nNothing was saved. Check the url in pipeline/sources.json before trying again.", file=sys.stderr)
            return 1
    if args.refresh_hashes:
        SOURCES.write_text(json.dumps(sources, indent=2) + "\n", encoding="utf-8")
        print("sources.json hashes refreshed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
