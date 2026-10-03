#!/usr/bin/env python3
"""PV 用の音声メドレーを作る (pv_capture.js の segments.json に合わせて BGM を切り貼り)
使い方: python3 tools/pv_audio.py <PVフォルダ>"""
import sys, os, json
import numpy as np, soundfile as sf
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'music'))
from synth import FS, mtof, polyblep_saw, filt, impact, riser, limiter, active_rms  # noqa

pv = sys.argv[1]
segs = json.load(open(os.path.join(pv, 'segments.json')))
fps = segs['fps']
dur = {s['label']: s['frames'] / fps for s in segs['segs']}
order = [s['label'] for s in segs['segs']]
start = {}
t = 0.0
for k in order:
    start[k] = t; t += dur[k]
total = t
N = int((total + 0.5) * FS)
out = np.zeros((N, 2))
rng = np.random.default_rng(5)
music = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'music', 'out')


def load(name):
    x, fs = sf.read(os.path.join(music, name + '.wav'))
    return x


def place(x, t0, g=1.0, fade_in=0.04, fade_out=0.08):
    x = x.copy()
    fi, fo = int(fade_in * FS), int(fade_out * FS)
    if fi: x[:fi] *= np.linspace(0, 1, fi)[:, None]
    if fo: x[-fo:] *= np.linspace(1, 0, fo)[:, None]
    i = int(t0 * FS)
    ln = min(len(x), N - i)
    out[i:i + ln] += x[:ln] * g


def excerpt(name, at, length, target_db=-14.0):
    x = load(name)[int(at * FS): int((at + length) * FS)]
    return x / (active_rms(x) + 1e-9) * 10 ** (target_db / 20)


def slam(t0, g=1.0):
    n = int(2.4 * FS); tt = np.arange(n) / FS
    s = np.sin(2 * np.pi * np.cumsum(30 + 90 * np.exp(-tt / 0.12)) / FS) * np.exp(-tt / 0.9) * 0.9
    s += filt(rng.uniform(-1, 1, n), 'lp', 6000) * np.exp(-tt / 0.4) * 0.45
    for m in (40, 52, 55, 59, 64):
        s += filt(polyblep_saw(np.full(n, float(mtof(m)))), 'lp', 3000) * np.exp(-tt / 1.0) * 0.12
    place(np.stack([s, s], 1), t0, g, 0.0, 0.3)


# OP: 起動音 → ライザー → ロゴ着地 (映像の着地は op 開始 + 2.7 秒)
for k, f in enumerate((880, 1320, 1760)):
    n = int(0.12 * FS); tt = np.arange(n) / FS
    b = np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.04) * 0.25
    place(np.stack([b, b], 1), start['op'] + 0.05 + k * 0.3, 1.0, 0.0, 0.02)
rs = riser(2.4, rng) * 0.9
place(np.stack([rs, rs], 1), start['op'] + 0.3, 1.0, 0.2, 0.01)
slam(start['op'] + 2.7)
# 各面: BGM の聴かせどころ
place(excerpt('stage1', 6.0, dur['s1_intro'] + dur['s1']), start['s1_intro'])
place(excerpt('stage2', 40 * 60 / 140 * 4, dur['s2_intro'] + dur['s2']), start['s2_intro'])
S3BAR = 60 / 190 * 4   # 3 面 (パンク 190BPM) の 1 小節
place(excerpt('stage3', 68 * S3BAR, dur['s3_intro'] + dur['s3']), start['s3_intro'])   # ラストサビ頭の VIC-TO-RY!
place(excerpt('boss', 20 * 60 / 172 * 4, dur['boss'] + 0.6), start['boss'], 1.0, 0.04, 0.6)
# ボス撃破: 爆発 + 3 面アウトロのキメ (VIC-TO-RY!)
im = impact(rng, 2.0)
place(np.stack([im, im], 1), start['boss_die'], 0.5, 0.0, 0.3)
place(excerpt('stage3', 84 * S3BAR, dur['boss_die'] + 0.3, -15), start['boss_die'] + 0.25, 1.0, 0.02, 0.4)
# エンド: ロゴ着地 (end 開始 + 0.25 秒で着地)
slam(start['end'] + 0.25, 0.9)

out = out[:int(total * FS)]
fo = int(0.5 * FS); out[-fo:] *= np.linspace(1, 0, fo)[:, None]
out = out / (active_rms(out, pct=95) + 1e-9) * 10 ** (-12.0 / 20)
out = limiter(out, 0.89)
sf.write(os.path.join(pv, 'pv_audio.wav'), out.astype(np.float32), FS, subtype='PCM_16')
print('audio', round(total, 2), 's', {k: round(v, 2) for k, v in start.items()})
