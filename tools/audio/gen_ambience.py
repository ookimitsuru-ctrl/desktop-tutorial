#!/usr/bin/env python3
"""ステージの環境音ループ（20 秒、継ぎ目なし）を合成して assets/audio/ambience/*.ogg に書き出す。
amb_crowd / amb_wind / amb_rain / amb_storm / amb_river / amb_city"""
import pathlib

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
DUR = 20.0
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/audio/ambience"
rng = np.random.default_rng(2026)
N = int(SR * DUR)
t = np.arange(N) / SR


def bp(x, lo, hi, order=2):
    return signal.sosfilt(signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], btype="band", output="sos"), x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f / (SR / 2), output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f / (SR / 2), btype="high", output="sos"), x)


def slow_noise(rate_hz, n=N):
    """ゆっくり変化する 0..1 の揺らぎ（ループ境界で連続になるよう周期的に作る）"""
    k = max(2, int(DUR * rate_hz))
    pts = rng.random(k)
    xs = np.linspace(0, k, n, endpoint=False)
    i0 = xs.astype(int) % k
    i1 = (i0 + 1) % k
    f = xs - np.floor(xs)
    f = f * f * (3 - 2 * f)
    return pts[i0] * (1 - f) + pts[i1] * f


def loopify(x, fade=1.5):
    """末尾を先頭にクロスフェードして継ぎ目をなくす"""
    nf = int(SR * fade)
    head = x[:nf].copy()
    tail = x[-nf:].copy()
    w = np.linspace(0, 1, nf)
    out = x[:-nf].copy()
    out[:nf] = head * w + tail * (1 - w)
    return out


def stereo(l, r):
    return np.stack([l, r], axis=1)


def norm(x, db):
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (db / 20)


def wind():
    out = []
    for ch in range(2):
        n = rng.standard_normal(N + SR * 2)
        x = lp(n, 500)[SR * 2:]
        g = 0.35 + 0.65 * slow_noise(0.25)
        whistle = bp(rng.standard_normal(N), 700, 1100) * (slow_noise(0.4) ** 3) * 0.25
        out.append(x * g + whistle)
    return stereo(*out)


def rain(heavy=False):
    out = []
    for ch in range(2):
        n = rng.standard_normal(N)
        x = hp(n, 1500) * 0.5 + bp(n, 400, 1500) * 0.3
        drops = np.zeros(N)
        cnt = int(DUR * (900 if heavy else 500))
        idx = rng.integers(0, N - 200, cnt)
        for i in idx:
            drops[i:i + 60] += np.exp(-np.arange(60) / 8.0) * rng.uniform(0.2, 1.0) * (1 if rng.random() > 0.5 else -1)
        x = x + hp(drops, 2000) * 0.6
        x *= 0.8 + 0.2 * slow_noise(0.3)
        out.append(x)
    return stereo(*out)


def storm():
    r = rain(True)
    thunder = np.zeros(N)
    for start in (3.0, 12.5):
        i = int(start * SR)
        ln = int(4.0 * SR)
        env = np.exp(-np.arange(ln) / (SR * 1.1)) * (1 - np.exp(-np.arange(ln) / (SR * 0.05)))
        rum = lp(rng.standard_normal(ln), 120, 4) * env
        crack = hp(rng.standard_normal(ln), 800) * np.exp(-np.arange(ln) / (SR * 0.15)) * 0.4
        thunder[i:i + ln] += rum * 3.0 + crack
    w = wind() * 0.6
    return r + w + stereo(thunder, thunder * 0.9)


def river():
    out = []
    for ch in range(2):
        n = rng.standard_normal(N)
        x = bp(n, 150, 900) * (0.7 + 0.3 * slow_noise(0.8))
        bub = np.zeros(N)
        for i in rng.integers(0, N - 4000, int(DUR * 25)):
            f0 = rng.uniform(300, 900)
            ln = rng.integers(800, 2500)
            tt = np.arange(ln) / SR
            bub[i:i + ln] += np.sin(2 * np.pi * f0 * tt * (1 + tt * 6)) * np.exp(-tt * 40) * rng.uniform(0.1, 0.4)
        out.append(x + bub)
    return stereo(*out)


def crowd():
    out = []
    for ch in range(2):
        # 多数の話し声: 帯域ノイズを音節のような速さで揺らす
        x = np.zeros(N)
        for v in range(24):
            f = rng.uniform(250, 900)
            voice = bp(rng.standard_normal(N), f, f * 2.2)
            syl = slow_noise(rng.uniform(3, 6)) ** 2
            x += voice * syl
        x = lp(x, 2500) * (0.75 + 0.25 * slow_noise(0.15))
        out.append(x)
    return stereo(*out)


def city():
    out = []
    for ch in range(2):
        hum = lp(rng.standard_normal(N), 180, 4) * 2.0
        traffic = bp(rng.standard_normal(N), 200, 1200) * (0.4 + 0.6 * slow_noise(0.2))
        x = hum + traffic * 0.6
        # 遠くのクラクション
        for start in (5.0, 14.0):
            i = int(start * SR) + ch * 300
            ln = int(0.5 * SR)
            tt = np.arange(ln) / SR
            horn = (np.sign(np.sin(2 * np.pi * 410 * tt)) + np.sign(np.sin(2 * np.pi * 520 * tt))) * 0.5
            x[i:i + ln] += lp(horn, 1500) * np.minimum(1, tt * 20) * np.exp(-tt * 3) * 0.12
        out.append(x)
    return stereo(*out)


def write(name, x, db):
    x = np.stack([loopify(x[:, 0]), loopify(x[:, 1])], axis=1)
    x = norm(x, db).astype(np.float32)
    path = OUT / f"{name}.ogg"
    with sf.SoundFile(path, "w", SR, 2, format="OGG", subtype="VORBIS") as f:
        for k in range(0, len(x), 8192):
            f.write(x[k:k + 8192])
    imp = path.with_suffix(".ogg.import")
    imp.write_text('[remap]\n\nimporter="oggvorbisstr"\ntype="AudioStreamOggVorbis"\n\n[deps]\n\nsource_file="res://assets/audio/ambience/%s.ogg"\n\n[params]\n\nloop=true\nloop_offset=0\nbpm=0\nbeat_count=0\nbar_beats=4\n' % name)
    print(name, "%.1fs" % (len(x) / SR))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    write("amb_wind", wind(), -14)
    write("amb_rain", rain(), -14)
    write("amb_storm", storm(), -11)
    write("amb_river", river(), -15)
    write("amb_crowd", crowd(), -13)
    write("amb_city", city(), -15)


if __name__ == "__main__":
    main()
