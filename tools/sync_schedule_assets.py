#!/usr/bin/env python3
"""
Sync schedule year scripts into index.html and sw.js.

Scans js/schedules/gillette/YYYY.js and:
  1. Ensures <script src="js/schedules/gillette/YYYY.js"> in index.html
  2. Ensures './js/schedules/gillette/YYYY.js' in sw.js ASSETS

Usage (from repo root or PlanZmian/):
  python3 tools/sync_schedule_assets.py

After Admin Export: put YYYY.js into js/schedules/gillette/, run this, then git commit + push.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GILLETTE = ROOT / "js" / "schedules" / "gillette"
INDEX = ROOT / "index.html"
SW = ROOT / "sw.js"

YEAR_FILE_RE = re.compile(r"^(\d{4})\.js$")


def discover_years() -> list[int]:
    if not GILLETTE.is_dir():
        print(f"ERROR: missing directory {GILLETTE}", file=sys.stderr)
        sys.exit(1)
    years: list[int] = []
    for p in GILLETTE.iterdir():
        m = YEAR_FILE_RE.match(p.name)
        if m and p.is_file():
            years.append(int(m.group(1)))
    years.sort()
    if not years:
        print(f"ERROR: no YYYY.js files in {GILLETTE}", file=sys.stderr)
        sys.exit(1)
    return years


def sync_index(years: list[int]) -> bool:
    text = INDEX.read_text(encoding="utf-8")
    # Block: metadata.js then zero or more year scripts (possibly with CRLF)
    pattern = re.compile(
        r'(<script src="js/schedules/gillette/metadata\.js"></script>)'
        r'(?:\s*<script src="js/schedules/gillette/\d{4}\.js"></script>)*',
        re.MULTILINE,
    )
    year_tags = "".join(
        f'\n  <script src="js/schedules/gillette/{y}.js"></script>' for y in years
    )
    replacement = r"\1" + year_tags
    new_text, n = pattern.subn(replacement, text, count=1)
    if n != 1:
        print("ERROR: could not find gillette metadata/year script block in index.html", file=sys.stderr)
        sys.exit(1)
    if new_text != text:
        INDEX.write_text(new_text, encoding="utf-8", newline="\n")
        return True
    return False


def sync_sw(years: list[int]) -> bool:
    text = SW.read_text(encoding="utf-8")
    # Replace contiguous gillette year entries after metadata in ASSETS
    # Keep metadata line; replace following year lines
    pattern = re.compile(
        r"(  '\./js/schedules/gillette/metadata\.js',\n)"
        r"(?:  '\./js/schedules/gillette/\d{4}\.js',\n)*",
        re.MULTILINE,
    )
    year_lines = "".join(f"  './js/schedules/gillette/{y}.js',\n" for y in years)
    replacement = r"\1" + year_lines
    new_text, n = pattern.subn(replacement, text, count=1)
    if n != 1:
        print("ERROR: could not find gillette entries in sw.js ASSETS", file=sys.stderr)
        sys.exit(1)
    if new_text != text:
        SW.write_text(new_text, encoding="utf-8", newline="\n")
        return True
    return False


def main() -> None:
    years = discover_years()
    print(f"Found year files: {', '.join(str(y) for y in years)}")
    changed_index = sync_index(years)
    changed_sw = sync_sw(years)
    if changed_index:
        print(f"Updated {INDEX.relative_to(ROOT)}")
    else:
        print(f"OK {INDEX.relative_to(ROOT)} (already in sync)")
    if changed_sw:
        print(f"Updated {SW.relative_to(ROOT)}")
    else:
        print(f"OK {SW.relative_to(ROOT)} (already in sync)")
    print("Done. Commit year file(s) + index.html + sw.js, then push.")


if __name__ == "__main__":
    main()
