#!/usr/bin/env python3
"""ゲーム内に出る文字（data/ と i18n/ と docs/CREDITS.md）が全て本文フォントのサブセットに含まれているか検査する。
足りない場合は tools/gen/subset_fonts.py でサブセットを作り直す。"""
import pathlib
import sys

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[2]


def main() -> int:
    text = set()
    for pat in ("data/**/*.json", "i18n/*.csv", "docs/CREDITS.md"):
        for p in ROOT.glob(pat):
            text |= set(p.read_text(encoding="utf-8"))
    bad = 0
    for fn in ("NotoSansJP-Regular.ttf", "NotoSansJP-Bold.ttf"):
        cmap = TTFont(str(ROOT / "assets/fonts" / fn)).getBestCmap()
        missing = sorted(c for c in text if c.isprintable() and not c.isspace() and ord(c) not in cmap)
        if missing:
            bad += 1
            print("%s に無い文字 (%d): %s" % (fn, len(missing), "".join(missing[:80])))
    print("check_glyphs: %d character(s) checked, %s" % (len(text), "NG" if bad else "OK"))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
