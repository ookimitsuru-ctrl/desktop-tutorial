#!/usr/bin/env python3
"""ステージの小道具に重ねる質感のテクスチャ（継ぎ目なし）を作る。全て乱数からの生成（外部素材なし）。

出力:
  assets/textures/grunge.png   明るさのむら・染み・縦の筋（色に掛ける。0.72〜1.0）
  assets/textures/bump_n.png   細かな凹凸の法線マップ
周波数領域で作るので上下左右がつながる。StandardMaterial3D の三面投影（triplanar）で使う。
"""
import pathlib

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/textures"
N = 512


def spectral(seed, beta, aniso=(1.0, 1.0), lo=1.0, hi=None):
    """1/f^beta の雑音（周期的）。aniso で縦横の伸び、lo/hi で帯域を制限"""
    rng = np.random.default_rng(seed)
    fy = np.fft.fftfreq(N)[:, None] * N * aniso[1]
    fx = np.fft.fftfreq(N)[None, :] * N * aniso[0]
    f = np.sqrt(fx * fx + fy * fy)
    amp = np.where(f >= lo, 1.0 / np.maximum(f, 1e-6) ** beta, 0.0)
    if hi is not None:
        amp = amp * np.exp(-(f / hi) ** 2)
    spec = amp * np.exp(1j * rng.uniform(0, 2 * np.pi, (N, N)))
    x = np.real(np.fft.ifft2(spec))
    x = (x - x.mean()) / (x.std() + 1e-12)
    return x


def unit(x, lo=1.0, hi=99.0):
    a, b = np.percentile(x, [lo, hi])
    return np.clip((x - a) / (b - a), 0.0, 1.0)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    # --- 明るさのむら
    blot = unit(spectral(1, 2.4, lo=1.5))                 # 大きな染み
    mid = unit(spectral(2, 1.5, lo=6.0))                  # 中くらいのむら
    fine = unit(spectral(3, 0.6, lo=40.0, hi=180.0))      # 細かな粒
    streak = unit(spectral(4, 1.6, aniso=(1.0, 0.07), lo=4.0, hi=90.0))   # 縦の筋（雨だれ）
    stain = np.clip((unit(spectral(5, 2.0, lo=2.0)) - 0.62) * 3.0, 0.0, 1.0)   # ところどころの濃い汚れ
    g = 0.86 + 0.10 * (blot - 0.5) * 2.0 + 0.05 * (mid - 0.5) * 2.0 + 0.035 * (fine - 0.5) * 2.0
    g -= 0.07 * np.clip((streak - 0.55) * 2.5, 0.0, 1.0) + 0.10 * stain
    g = np.clip(g, 0.70, 1.0)
    # わずかに色を付ける（汚れは暖色寄り）
    warm = 0.5 + 0.5 * (unit(spectral(6, 2.2, lo=1.5)) - 0.5)
    rgb = np.stack([g * (1.0 + 0.012 * (warm - 0.5)), g, g * (1.0 - 0.02 * (warm - 0.5))], axis=-1)
    Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB").save(OUT / "grunge.png", optimize=True)
    # --- 凹凸: なだらかなうねり + 粒 + 小さなへこみ
    h = 0.7 * spectral(11, 1.9, lo=4.0, hi=48.0) + 0.12 * spectral(12, 1.2, lo=20.0, hi=64.0)
    pits = np.clip((unit(spectral(13, 1.0, lo=20.0, hi=70.0)) - 0.9) * 10.0, 0.0, 1.0)
    h = h - 0.35 * pits
    k = 2.2   # 凹凸の強さ
    dx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) * k
    dy = (np.roll(h, -1, axis=0) - np.roll(h, 1, axis=0)) * k
    nz = np.ones_like(h)
    ln = np.sqrt(dx * dx + dy * dy + nz * nz)
    nrm = np.stack([-dx / ln, -dy / ln, nz / ln], axis=-1)
    Image.fromarray(((nrm * 0.5 + 0.5) * 255 + 0.5).astype(np.uint8), "RGB").save(OUT / "bump_n.png", optimize=True)
    for f in ("grunge.png", "bump_n.png"):
        print(f, (OUT / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
