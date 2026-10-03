#!/usr/bin/env python3
"""out/<name>.wav → game/assets/bgm_<name>.ogg (シームレスループ用レイアウト)

使い方: python3 export_game.py <name> <曲長(秒)> <ループ先頭(秒)>
  stage1: python3 export_game.py stage1 108.0 6.0
  stage2: python3 export_game.py stage2 120.0 13.714285714

ファイル構成: [0, 曲長) 本編 + [曲長, 曲長+3) = 本編のループ先頭 3 秒 + 終端の残響
ゲーム側は loopStart = ループ先頭+3, loopEnd = 曲長+3 でループする。
ループ長が 16 分音符の整数倍なので、ビート位置は再生開始からの経過時間でそのまま求まる。
"""
import os, sys, numpy as np, soundfile as sf

name = sys.argv[1] if len(sys.argv) > 1 else 'stage1'
song_len = float(sys.argv[2]) if len(sys.argv) > 2 else 108.0
loop0 = float(sys.argv[3]) if len(sys.argv) > 3 else 6.0
here = os.path.dirname(os.path.abspath(__file__))
x, fs = sf.read(os.path.join(here, 'out', name + '.wav'))
song, l0, n = int(round(song_len * fs)), int(round(loop0 * fs)), int(3.0 * fs)
tail = np.zeros((n, 2)); tl = x[song:song + n]; tail[:len(tl)] = tl
out = np.concatenate([x[:song], x[l0:l0 + n] + tail])
out = np.clip(out * 0.92, -0.99, 0.99)  # Vorbis のオーバーシュート対策
dst = os.path.join(here, '..', 'game', 'assets', 'bgm_%s.ogg' % name)
with sf.SoundFile(dst, 'w', fs, 2, format='OGG', subtype='VORBIS') as f:  # 一括書き込みは libsndfile が落ちるので分割
    for i in range(0, len(out), 16384):
        f.write(out[i:i + 16384].astype(np.float32))
print(dst, os.path.getsize(dst) // 1024, 'KB', '%.3f s' % (len(out) / fs), 'loop %.6f - %.6f' % (loop0 + 3, song_len + 3))
