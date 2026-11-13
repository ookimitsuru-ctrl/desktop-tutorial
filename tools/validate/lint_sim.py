#!/usr/bin/env python3
"""シミュレーション層（src/sim）の禁止トークン検査。仕様: 11_technical_architecture.md §11.4
浮動小数点・エンジン API・Node への依存を検出したら終了コード 1。"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
RULES = [
    (r"\bfloat\b", "float 型"),
    (r"\bVector[234]\(", "浮動小数点ベクトル"),
    (r"(?<![\w.])\d+\.\d+(?![\w.])", "小数リテラル"),
    (r"(?<![\w.])(sin|cos|tan|sqrt|pow|atan2|exp|log)\(", "組み込み数学関数（FP. を使う）"),
    (r"\b(randf|randi|randf_range|randi_range)\b", "グローバル乱数"),
    (r"\b(Time|OS|Engine|Input|ResourceLoader|FileAccess|DirAccess)\.", "エンジン API"),
    (r"\bget_tree\(|\bNode\b|\bload\(|\bpreload\(", "Node / リソース読み込み"),
]


def strip(line: str) -> str:
    out, q = [], None
    i = 0
    while i < len(line):
        c = line[i]
        if q:
            if c == "\\":
                i += 2
                continue
            if c == q:
                q = None
            i += 1
            continue
        if c in "\"'":
            q = c
            i += 1
            continue
        if c == "#":
            break
        out.append(c)
        i += 1
    return "".join(out)


def main() -> int:
    bad = 0
    for p in sorted((ROOT / "src/sim").rglob("*.gd")):
        if p.name == "trig_table.gd":
            continue
        for n, raw in enumerate(p.read_text(encoding="utf-8").splitlines(), 1):
            s = strip(raw)
            if s.lstrip().startswith("static func ") or s.lstrip().startswith("func "):
                s = s.split("(", 1)[1] if "(" in s else s
            for pat, why in RULES:
                if re.search(pat, s):
                    print(f"{p.relative_to(ROOT)}:{n}: {why}: {raw.strip()}")
                    bad += 1
    print(f"lint_sim: {bad} problem(s)")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
