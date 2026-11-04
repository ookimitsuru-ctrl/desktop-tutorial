#!/usr/bin/env python3
"""三角関数テーブル（Q16.16）を生成し src/sim/core/trig_table.gd に書き出す。
決定論のため、生成結果はコミットする（実行時に浮動小数点を使わない）。"""
import math, pathlib
N_SIN = 4096          # 1周 = 4096 区間（2進角 65536 の 1/16 刻み）
N_ATAN = 1024         # tan 0..1 を 1024 分割
ONE = 65536
sin_tab = [round(math.sin(2 * math.pi * i / N_SIN) * ONE) for i in range(N_SIN + 1)]
# atan(i/N_ATAN) を 2進角（65536=360°）で
atan_tab = [round(math.atan(i / N_ATAN) / (2 * math.pi) * 65536) for i in range(N_ATAN + 1)]
def fmt(arr):
    lines, row = [], []
    for v in arr:
        row.append(str(v))
        if len(row) == 16:
            lines.append("\t" + ", ".join(row) + ",")
            row = []
    if row:
        lines.append("\t" + ", ".join(row) + ",")
    return "\n".join(lines)
out = f"""# 自動生成ファイル: tools/gen/gen_trig_table.py で生成。手で編集しないこと。
class_name TrigTable
extends RefCounted

const SIN_N := {N_SIN}
const ATAN_N := {N_ATAN}

## sin(2πi/{N_SIN}) * 65536（i = 0..{N_SIN}）
const SIN := [
{fmt(sin_tab)}
]

## atan(i/{N_ATAN}) を 2進角（65536 = 360°）で（i = 0..{N_ATAN}）
const ATAN := [
{fmt(atan_tab)}
]
"""
p = pathlib.Path(__file__).resolve().parents[2] / "src/sim/core/trig_table.gd"
p.write_text(out)
print("wrote", p, len(sin_tab), len(atan_tab))
