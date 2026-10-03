#!/usr/bin/env python3
"""out/<name>.wav から試聴用 MP3 を作る (末尾でループ先頭へつないでフェードアウト)
使い方: python3 make_preview.py <name> <曲長(秒)> <ループ先頭(秒)>"""
import os, sys, numpy as np, soundfile as sf, lameenc

name = sys.argv[1] if len(sys.argv) > 1 else 'stage1'
song_len = float(sys.argv[2]) if len(sys.argv) > 2 else 108.0
loop0 = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
here = os.path.dirname(os.path.abspath(__file__))
x, fs = sf.read(os.path.join(here, 'out', name + '.wav'))
song = int(round(song_len * fs)); l0 = int(round(loop0 * fs)); n = int(4.0 * fs)
tail = x[song:]
head = x[l0:l0 + n].copy()
head[:len(tail)] += tail[:n]
head *= np.linspace(1, 0, n)[:, None] ** 1.5
pv = np.concatenate([x[:song], head])
pcm = (np.clip(pv, -1, 1) * 32767).astype(np.int16)
enc = lameenc.Encoder()
enc.set_bit_rate(192); enc.set_in_sample_rate(fs); enc.set_channels(2); enc.set_quality(2)
mp3 = enc.encode(pcm.tobytes()) + enc.flush()
out = os.path.join(here, 'out', 'WIRED_%s_preview.mp3' % name)
open(out, 'wb').write(mp3)
print(out, len(mp3) // 1024, 'KB', '%.1f s' % (len(pv) / fs))
