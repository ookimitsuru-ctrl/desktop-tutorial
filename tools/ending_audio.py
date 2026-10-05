#!/usr/bin/env python3
"""エンディング動画の音声: ending_capture.js の timeline.json に合わせて
ボス戦の曲 → 撃破の爆発 → ワープアウト → エンディング曲 (music/out/ending.wav) を並べる
使い方: python3 tools/ending_audio.py <フォルダ>"""
import sys, os, json
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'music'))
from synth import FS, filt, impact, riser, limiter, active_rms  # noqa

d = sys.argv[1]
tl = json.load(open(os.path.join(d, 'timeline.json')))
total = tl['frames'] / tl['fps']
N = int(total * FS)
out = np.zeros((N, 2))
rng = np.random.default_rng(8)
music = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'music', 'out')


def place(x, t0, g=1.0):
    if x.ndim == 1: x = np.stack([x, x], 1)
    i = int(t0 * FS)
    if i >= N: return
    ln = min(len(x), N - i)
    out[i:i + ln] += x[:ln] * g


def pan(x, p):
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], 1) * 1.41


def whoosh(dur, f0, f1, rng):
    n = int(dur * FS); t = np.arange(n) / FS
    nz = rng.uniform(-1, 1, n)
    y = np.zeros(n); blk = 512
    for i in range(0, n, blk):
        f = f0 * (f1 / f0) ** (i / n)
        y[i:i + blk] = filt(nz[i:i + blk], 'bp', f, 1.4)
    env = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5
    return y * env


# ボス戦の曲 (撃破で 0.4 秒の時定数でフェードアウト)
boss, _ = sf.read(os.path.join(music, 'boss.wav'))
b0 = int(20 * 60 / 172 * 4 * FS)
seg = boss[b0:b0 + int((tl['defeat'] + 2.0) * FS)]
g = np.ones(len(seg)); i0 = int(tl['defeat'] * FS)
g[i0:] = np.exp(-np.arange(len(seg) - i0) / (0.4 * FS))
place(seg * g[:, None] / (active_rms(seg) + 1e-9) * 10 ** (-15 / 20), 0)
# とどめ → 爆散 (スロー中の連鎖爆発) → 最後の大爆発
place(impact(rng, 2.5), tl['kill'], 0.55)
t = tl['kill'] + 0.2
while t < tl['defeat'] - 0.1:
    n = int(0.5 * FS); tt = np.arange(n) / FS
    b = filt(rng.uniform(-1, 1, n), 'lp', rng.uniform(1500, 4000)) * np.exp(-tt / 0.12)
    place(pan(b, rng.uniform(-0.7, 0.7)), t, 0.18)
    t += rng.uniform(0.2, 0.32)
place(impact(rng, 3.5), tl['defeat'], 0.9)
n = int(2.5 * FS); tt = np.arange(n) / FS
place(filt(rng.uniform(-1, 1, n), 'lp', 5000) * np.exp(-tt / 0.6), tl['defeat'], 0.4)
# ワープアウト (撃破 1.8 秒後から加速) → エンディングの白
rs = riser(1.6, rng)
place(rs, tl['defeat'] + 1.8, 0.5)
place(whoosh(1.4, 600, 5000, rng), tl['defeat'] + 2.1, 0.35)
# エンディング曲 (再生開始は 0.05 秒後に予約される)
end, _ = sf.read(os.path.join(music, 'ending.wav'))
place(end / (active_rms(end, pct=97) + 1e-9) * 10 ** (-12 / 20), tl['ending'] + 0.05)
# 映像の効果音: C2 カメラの脇を抜ける / 目の前に迫る
E = tl['ending']
place(pan(whoosh(1.2, 2500, 300, rng), 0.5), E + 7.4, 0.12)
place(whoosh(1.0, 3000, 250, rng), E + 21.6, 0.2)

fo = int(0.8 * FS); out[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 2
out = out / (active_rms(out, pct=97) + 1e-9) * 10 ** (-12.0 / 20)
out = limiter(out, 0.89)
sf.write(os.path.join(d, 'audio.wav'), out.astype(np.float32), FS, subtype='PCM_16')
print('audio %.2f s' % total, tl)
