#!/usr/bin/env python3
"""使用文字だけを含むフォントのサブセットを作る（日本語フォントの容量削減）。
リポジトリ内の data/ i18n/ src/ のテキストから文字を集める。"""
import pathlib
import sys
from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "/opt/tools/fonts/x/package")


def collect():
    chars = set(chr(c) for c in range(0x20, 0x7F))
    for a, b in ((0xA0, 0xFF), (0x3000, 0x303F), (0x3040, 0x309F), (0x30A0, 0x30FF), (0xFF00, 0xFFEF), (0x2010, 0x2027), (0x2190, 0x21FF), (0x25A0, 0x25FF), (0x2600, 0x26FF)):
        chars |= set(chr(c) for c in range(a, b + 1))
    chars |= set("・×○●◐★☆→←↑↓…「」『』【】〜ー")
    for pat in ("data/**/*.json", "i18n/*.csv", "src/**/*.gd", "docs/spec/04_characters.md", "docs/CREDITS.md"):
        for p in ROOT.glob(pat):
            chars |= set(p.read_text(encoding="utf-8"))
    return "".join(sorted(c for c in chars if c.isprintable()))


def make(src, dst, text):
    opts = subset.Options()
    opts.layout_features = ["*"]
    opts.name_IDs = ["*"]
    opts.name_languages = ["*"]
    opts.notdef_outline = True
    font = subset.load_font(str(src), opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    subset.save_font(font, str(dst), opts)
    print(f"{dst.name}: {dst.stat().st_size // 1024} KB")


def main():
    text = collect()
    out = ROOT / "assets/fonts"
    out.mkdir(parents=True, exist_ok=True)
    make(SRC / "400Regular/NotoSansJP_400Regular.ttf", out / "NotoSansJP-Regular.ttf", text)
    make(SRC / "700Bold/NotoSansJP_700Bold.ttf", out / "NotoSansJP-Bold.ttf", text)
    make(SRC / "400Regular/DelaGothicOne_400Regular.ttf", out / "DelaGothicOne-Regular.ttf", text)
    make(SRC / "700Bold/Oswald_700Bold.ttf", out / "Oswald-Bold.ttf", text)
    print(f"{len(text)} characters")


if __name__ == "__main__":
    main()
