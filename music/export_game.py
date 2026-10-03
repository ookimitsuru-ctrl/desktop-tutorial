#!/usr/bin/env python3
"""out/stage1.wav → game/assets/bgm_stage.ogg (シームレスループ用レイアウト)

ファイル構成: [0,108) 本編  + [108,111) = 本編 6〜9 秒 + 終端の残響
ゲーム側は loopStart=9.0, loopEnd=111.0 でループ (ループ長 102 秒 = 68 小節)。
ループ長が 16 分音符の整数倍なので、ビート位置は「再生開始からの経過時間」でそのまま求まる。
"""
import os, numpy as np, soundfile as sf

here = os.path.dirname(os.path.abspath(__file__))
x, fs = sf.read(os.path.join(here, 'out', 'stage1.wav'))
song, l0, n = int(108.0 * fs), int(6.0 * fs), int(3.0 * fs)
tail = np.zeros((n, 2)); tl = x[song:song + n]; tail[:len(tl)] = tl
b = x[l0:l0 + n] + tail
out = np.concatenate([x[:song], b])
out = np.clip(out * 0.92, -0.99, 0.99)  # Vorbis のオーバーシュート対策
dst = os.path.join(here, '..', 'game', 'assets', 'bgm_stage.ogg')
with sf.SoundFile(dst, 'w', fs, 2, format='OGG', subtype='VORBIS') as f:  # 一括書き込みは libsndfile が落ちるので分割
    for i in range(0, len(out), 16384):
        f.write(out[i:i + 16384].astype(np.float32))
print(dst, os.path.getsize(dst) // 1024, 'KB', '%.2f s' % (len(out) / fs))
