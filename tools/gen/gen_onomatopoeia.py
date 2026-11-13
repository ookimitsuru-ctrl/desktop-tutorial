#!/usr/bin/env python3
"""試合中に出すアメコミ風の擬音（POW! など）の画像を作る。全て本プロジェクト用に描いたもの。

文字は assets/fonts/DelaGothicOne-Regular.ttf（OFL）で、1 文字ずつ大きさと傾きを変え、太い縁取り・立体の影・
とげとげの破裂（網点入り）を付ける。描画は PV の編集（tools/pv/make_pv_comic.py）と同じ関数を使う。

出力: assets/vfx/words/<語>.png
必要: numpy, Pillow, opencv-python-headless（make_pv_comic の読み込みに必要）
"""
import pathlib
import sys

from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools/pv"))
import make_pv_comic as m  # noqa: E402

OUT = ROOT / "assets/vfx/words"
SIZE = 600

# 色: (文字の上, 文字の下, 破裂, 網点)
m.STYLES.update({
    "pow": ((255, 236, 60), (240, 70, 30), (255, 255, 255), (255, 205, 40)),
    "wham": ((255, 255, 255), (120, 225, 255), (30, 80, 200), (16, 40, 130)),
    "bam": ((255, 250, 120), (255, 150, 20), (40, 170, 90), (16, 100, 60)),
    "smash": ((255, 250, 235), (255, 215, 50), (228, 40, 36), (150, 16, 20)),
    "crash": ((228, 40, 36), (150, 20, 60), (255, 222, 50), (255, 150, 30)),
    "thwap": ((255, 255, 255), (255, 190, 230), (150, 50, 190), (90, 20, 130)),
    "slam": ((255, 240, 80), (255, 120, 20), (40, 40, 52), (95, 95, 115)),
    "splat": ((255, 255, 255), (200, 255, 120), (240, 90, 150), (180, 30, 100)),
    "zlonk": ((120, 255, 230), (40, 170, 255), (255, 130, 20), (220, 70, 10)),
    "thud": ((255, 235, 200), (235, 160, 80), (110, 66, 40), (70, 38, 22)),
})


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for k, name in enumerate(["pow", "wham", "bam", "smash", "crash", "thwap", "slam", "splat", "zlonk", "thud"]):
        spr = m.onomatopoeia(name.upper() + "!", name, 900 + k * 17, 250)
        spr = spr.crop(spr.getbbox())
        s = SIZE / max(spr.size)
        spr = spr.resize((int(spr.size[0] * s), int(spr.size[1] * s)), Image.LANCZOS)
        spr.save(OUT / f"{name}.png", optimize=True)
        print(name, spr.size, (OUT / f"{name}.png").stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
