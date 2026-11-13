#!/usr/bin/env python3
"""assets/ 以下の全ファイルが docs/ASSET_LEDGER.md に記載されているか検査する（仕様 18 §18.3）。"""
import fnmatch
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]


def main() -> int:
    ledger = (ROOT / "docs/ASSET_LEDGER.md").read_text(encoding="utf-8")
    patterns = re.findall(r"^\|\s*`([^`]+)`", ledger, flags=re.M)
    missing = []
    for p in sorted((ROOT / "assets").rglob("*")):
        if not p.is_file() or p.suffix == ".import" or p.name.startswith("."):
            continue
        rel = p.relative_to(ROOT).as_posix()
        if not any(fnmatch.fnmatchcase(rel, pat) for pat in patterns):
            missing.append(rel)
    for m in missing:
        print("台帳に記載がありません:", m)
    print("check_ledger: %d pattern(s), %d missing" % (len(patterns), len(missing)))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main())
