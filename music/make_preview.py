#!/usr/bin/env python3
"""out/stage1.wav から試聴用 MP3 を作る (末尾でループ先頭へつないでフェードアウト)"""
import os, numpy as np, soundfile as sf, lameenc

here = os.path.dirname(os.path.abspath(__file__))
x, fs = sf.read(os.path.join(here, 'out', 'stage1.wav'))
song = int(108.0 * fs); loop0 = int(6.0 * fs); n = int(4.0 * fs)
tail = x[song:]
head = x[loop0:loop0 + n].copy()
head[:len(tail)] += tail[:n]                     # 終端の残響をループ頭に重ねる
head *= np.linspace(1, 0, n)[:, None] ** 1.5      # フェードアウト
pv = np.concatenate([x[:song], head])
pcm = (np.clip(pv, -1, 1) * 32767).astype(np.int16)
enc = lameenc.Encoder()
enc.set_bit_rate(192); enc.set_in_sample_rate(fs); enc.set_channels(2); enc.set_quality(2)
mp3 = enc.encode(pcm.tobytes()) + enc.flush()
out = os.path.join(here, 'out', 'WIRED_stage1_preview.mp3')
open(out, 'wb').write(mp3)
print(out, len(mp3) // 1024, 'KB', '%.1f s' % (len(pv) / fs))
