#!/usr/bin/env python3
"""WIRED ステージ1 BGM「WIRED FRONT」(仮)

メロディック・メタル / 160 BPM / E マイナー / 72 小節 = 108 秒 (ボス出現まで)
  0- 3  イントロ: オーケストラ衝撃音 + ブラスのファンファーレ → ギター単独で看板リフ
  4-11  看板リフ A (ダブルトラックのギター)
 12-19  リフ A' + ツインリードのフック (ハモり)
 20-27  バース: ギャロップ + シンセリード + アルペジオ
 28-31  ビルドアップ: トレモロ・ピッキングで上昇 → ブレイク
 32-39  サビ: 開放パワーコード + 叫ぶリードギター + クワイア/ブラス (ハーフタイム)
 40-43  ブレイクダウン: シンコペーションのスタブ (Phrygian の F)
 44-51  ギターソロ: 和声的短音階の速弾き → アーミングで急降下
 52-55  リフ A 再提示
 56-63  サビ転調 (+2, F# マイナー) ツインリード
 64-71  リフ A → ドミナント(B)でビルドアップ → 半音下降でリフ頭へループ可能
ループ: 6.0 秒 (小節4) 〜 108.0 秒
"""
import sys, os, time
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

BPM = 160
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 72
TAIL = 3.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)

rng = np.random.default_rng(20261003)


def T(bar, step=0.0):
    return bar * BAR + step * STEP


def put(dst, x, t, g=1.0):
    """dst (1D or 2D) の時刻 t に x を加算"""
    i = int(round(t * FS))
    if i < 0:
        x = x[-i:]; i = 0
    if i >= len(dst):
        return
    ln = min(len(x), len(dst) - i)
    if dst.ndim == 2 and x.ndim == 1:
        dst[i:i + ln] += (x[:ln] * g)[:, None]
    else:
        dst[i:i + ln] += x[:ln] * g


# =====================================================================
# 楽譜データ
# =====================================================================
E2, F2, Fs2, G2, A2, Bb2, B2, C3, Cs3, D3, E3 = 40, 41, 42, 43, 45, 46, 47, 48, 49, 50, 52

# 看板リフ (2小節)。(step, 長さ, ルート, 奏法)  pm=ブリッジミュート / acc=アクセント(開放)
RIFF_1 = [(0, 1, E2, 'pm'), (1, 1, E2, 'pm'), (2, 1, E2, 'pm'), (3, 3, G2, 'acc'), (6, 1, E2, 'pm'), (7, 1, E2, 'pm'),
          (8, 2, A2, 'acc'), (10, 1, E2, 'pm'), (11, 1, Bb2, 'acc'), (12, 1, A2, 'acc'), (13, 3, G2, 'acc')]
RIFF_2 = [(0, 1, E2, 'pm'), (1, 1, E2, 'pm'), (2, 1, E2, 'pm'), (3, 3, D3, 'acc'), (6, 1, E2, 'pm'), (7, 1, E2, 'pm'),
          (8, 2, C3, 'acc'), (10, 1, E2, 'pm'), (11, 1, C3, 'acc'), (12, 4, B2, 'acc')]
RIFF_2F = [(0, 1, E2, 'pm'), (1, 1, E2, 'pm'), (2, 1, E2, 'pm'), (3, 3, D3, 'acc'), (6, 1, E2, 'pm'), (7, 1, E2, 'pm'),
           (8, 1, C3, 'acc'), (9, 1, D3, 'acc'), (10, 2, E2, 'acc'), (12, 1, Bb2, 'acc'), (13, 1, A2, 'acc'), (14, 1, G2, 'acc'), (15, 1, Fs2, 'acc')]

rhythm = []   # (時刻, 長さ秒, ルート, 奏法, 強さ)
bass_extra = []
lead = []     # (時刻, 長さ秒, midi, opts, パート)
synlead = []  # (時刻, 長さ秒, midi)
arp = []      # (時刻, midi)
strings = []  # (時刻, 長さ, [midi...], 強さ)
choir = []
brass = []    # (時刻, 長さ, midi, 強さ, stab?)
drums = []    # (時刻, 名前, 強さ)
timp = []     # (時刻, midi, 強さ)
fx = []       # (時刻, 種類)


def riff(bar, part, vel=1.0, brass_stabs=False, kick=True):
    for st, ln, r, k in part:
        rhythm.append((T(bar, st), ln * STEP, r, k, vel))
        if kick:
            drums.append((T(bar, st), 'kick' if k == 'acc' else 'kick2', 0.95 if k == 'acc' else 0.8))
        if brass_stabs and k == 'acc':
            brass.append((T(bar, st), min(ln, 2) * STEP, r + 24, 0.8, True))
            brass.append((T(bar, st), min(ln, 2) * STEP, r + 31, 0.6, True))


def gallop(bar, root, accent=True, vel=1.0):
    for b in range(4):
        s = b * 4
        k = 'acc' if (accent and b == 0) else 'pm'
        rhythm.append((T(bar, s), 2 * STEP, root, k, vel))
        rhythm.append((T(bar, s + 2), STEP, root, 'pm', vel))
        rhythm.append((T(bar, s + 3), STEP, root, 'pm', vel))


def trem(bar, root, v0, v1, steps=16):
    for s in range(steps):
        v = v0 + (v1 - v0) * s / 15
        rhythm.append((T(bar, s), STEP, root, 'trem', v))


def beat_drums(bar, kind, crash=False):
    """基本ビート"""
    if crash:
        drums.append((T(bar, 0), 'crash', 1.0))
    if kind == 'riff':      # キックはリフに追従 (riff() 側で配置)
        for s in (4, 12): drums.append((T(bar, s), 'snare', 1.0))
        for s in range(0, 16, 2): drums.append((T(bar, s), 'hat', 0.8 if s % 4 == 0 else 0.6))
    elif kind == 'riff_ride':
        for s in (4, 12): drums.append((T(bar, s), 'snare', 1.0))
        for s in range(0, 16, 2): drums.append((T(bar, s), 'ride', 0.7 if s % 4 == 0 else 0.5))
    elif kind == 'double':  # ツーバス 16 分
        for s in range(16): drums.append((T(bar, s), 'kick' if s % 4 == 0 else 'kick2', 0.85 if s % 4 == 0 else 0.75))
        for s in (4, 12): drums.append((T(bar, s), 'snare', 1.0))
        for s in range(0, 16, 2): drums.append((T(bar, s), 'ride', 0.6))
    elif kind == 'half':    # ハーフタイム
        for s in (0, 3, 10): drums.append((T(bar, s), 'kick', 1.0))
        drums.append((T(bar, 8), 'snare', 1.0))
        for s in range(0, 16, 2): drums.append((T(bar, s), 'ride', 0.55))
    elif kind == 'drive':
        for s in range(0, 16, 2): drums.append((T(bar, s), 'kick', 0.95))
        for s in (4, 12): drums.append((T(bar, s), 'snare', 1.0))
        for s in (0, 8): drums.append((T(bar, s), 'crash', 0.7))
        for s in range(2, 16, 4): drums.append((T(bar, s), 'ride', 0.5))


def tom_fill(bar, s0=8):
    names = ['tom1', 'tom1', 'tom2', 'tom2', 'tom3', 'tom3', 'tom3', 'tom3']
    for i, s in enumerate(range(s0, 16)):
        drums.append((T(bar, s), names[min(i * 8 // (16 - s0), 7)], 0.85 + 0.15 * (i % 2)))
        if i % 2 == 0: drums.append((T(bar, s), 'kick', 0.8))


def snare_roll(bar, s0, s1, v0, v1, step=1):
    n = len(range(s0, s1, step))
    for i, s in enumerate(range(s0, s1, step)):
        drums.append((T(bar, s), 'snare', v0 + (v1 - v0) * i / max(1, n - 1)))


def L(bar, notes, part='lead', transpose=0):
    """リードの小節データ: [(step, len, midi, opts)]"""
    for st, ln, m, *o in notes:
        lead.append((T(bar, st), ln * STEP, m + transpose, dict(o[0]) if o else {}, part))


# ------------------------------------------------ 0-3 イントロ
fx.append((0.0, 'impact'))
drums.append((0.0, 'crash', 1.0))
timp.append((0.0, E2 - 12 + 12, 1.0))
strings.append((0.0, 2 * BAR, [52, 59, 64, 67, 71], 0.9))
choir.append((0.0, 2 * BAR, [64, 67, 71], 0.9))
FANFARE = [(0, 4, 59), (4, 4, 64), (8, 2, 62), (10, 2, 64), (12, 4, 67)]
for st, ln, m in FANFARE:
    brass.append((T(0, st), ln * STEP, m, 0.95, False))
    brass.append((T(0, st), ln * STEP, m - 12, 0.7, False))
brass.append((T(1, 0), 8 * STEP, 66, 0.95, False)); brass.append((T(1, 0), 8 * STEP, 54, 0.7, False))
brass.append((T(1, 8), 8 * STEP, 71, 1.0, False)); brass.append((T(1, 8), 8 * STEP, 59, 0.75, False))
for s in range(16):  # ティンパニのロール
    timp.append((T(1, s), E2 if s % 2 == 0 else B2 - 12, 0.35 + 0.65 * s / 15))
# 2-3: ギター単独でリフ提示 (ハイハットのカウントのみ)
riff(2, RIFF_1, kick=False); riff(3, RIFF_2, kick=False)
for b in (2, 3):
    for s in range(0, 16, 2): drums.append((T(b, s), 'hat', 0.7))
snare_roll(3, 8, 16, 0.4, 1.0)
fx.append((T(3, 0), 'revcym'))

# ------------------------------------------------ 4-11 リフ A
for i, b in enumerate(range(4, 12, 2)):
    riff(b, RIFF_1); riff(b + 1, RIFF_2F if i == 3 else RIFF_2)
    beat_drums(b, 'riff', crash=True); beat_drums(b + 1, 'riff')
    if i in (1, 3):   # ピンチハーモニクスの「キュイーン」
        lead.append((T(b + 1, 12), 4 * STEP, 90, {'vib': 0.8, 'pinch': 1, 'vol': 0.55}, 'lead'))
strings.append((T(4), 8 * BAR, [52, 59, 64], 0.45))

# ------------------------------------------------ 12-19 リフ A' + ツインリード
HOOK = [
    [(0, 4, 71), (4, 4, 76), (8, 2, 74), (10, 2, 76), (12, 4, 79, {'vib': 0.35})],
    [(0, 6, 78, {'bend': 2, 'vib': 0.3}), (6, 2, 76), (8, 2, 74), (10, 2, 72), (12, 4, 71, {'vib': 0.4})],
    [(0, 4, 71), (4, 4, 76), (8, 2, 74), (10, 2, 76), (12, 4, 83, {'bend': 2, 'vib': 0.35})],
    [(0, 4, 81), (4, 4, 79), (8, 4, 78), (12, 4, 76, {'vib': 0.4})],
]
HOOK_END = [(0, 4, 79), (4, 2, 78), (6, 2, 79), (8, 4, 81), (12, 4, 83, {'vib': 0.45})]
for i, b in enumerate(range(12, 20, 2)):
    riff(b, RIFF_1, brass_stabs=True); riff(b + 1, RIFF_2F if i == 3 else RIFF_2, brass_stabs=True)
    beat_drums(b, 'riff_ride', crash=True); beat_drums(b + 1, 'riff_ride')
for k in range(8):
    bar = 12 + k
    notes = HOOK[k % 4] if k < 7 else HOOK_END
    L(bar, notes, 'lead')
    L(bar, notes, 'harm')
strings.append((T(12), 8 * BAR, [52, 59, 64, 71], 0.5))

# ------------------------------------------------ 20-27 バース
VERSE = [
    [(0, 6, 76), (6, 2, 74), (8, 4, 76), (12, 4, 79)],
    [(0, 8, 78), (8, 4, 76), (12, 4, 74)],
    [(0, 6, 76), (6, 2, 74), (8, 4, 72), (12, 4, 74)],
    [(0, 8, 76), (8, 8, 79)],
    [(0, 6, 81), (6, 2, 79), (8, 4, 76), (12, 4, 72)],
    [(0, 8, 74), (8, 4, 76), (12, 4, 72)],
    [(0, 6, 75), (6, 2, 76), (8, 4, 78), (12, 4, 81)],
    [(0, 16, 83)],
]
VCH = [(E2, [64, 67, 71]), (E2, [64, 67, 71]), (C3, [60, 64, 67]), (C3, [60, 64, 67]),
       (A2, [57, 60, 64]), (A2, [57, 60, 64]), (B2, [59, 63, 66]), (B2, [59, 63, 66])]
for k in range(8):
    bar = 20 + k
    root, ch = VCH[k]
    gallop(bar, root)
    beat_drums(bar, 'double', crash=(k % 2 == 0))
    for st, ln, m in VERSE[k]:
        synlead.append((T(bar, st), ln * STEP, m))
    tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24]
    pat = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 3, 1, 2]
    for s in range(16):
        arp.append((T(bar, s), tones[pat[s]]))
    if k % 2 == 0:
        strings.append((T(bar), 2 * BAR, [root + 12, ch[0], ch[1], ch[2]], 0.5))
drums.append((T(27, 14), 'china', 0.9))

# ------------------------------------------------ 28-31 ビルドアップ
for k, root in enumerate([C3, D3, E3, B2]):
    bar = 28 + k
    if k < 3:
        trem(bar, root, 0.55 + 0.12 * k, 0.65 + 0.12 * k)
    else:
        trem(bar, root, 0.95, 1.0, steps=8)
        rhythm.append((T(bar, 8), 2 * STEP, B2, 'acc', 1.0)); rhythm.append((T(bar, 10), 2 * STEP, B2, 'acc', 1.0))
    brass.append((T(bar), BAR * 0.95, [60, 62, 64, 66][k], 0.75 + 0.08 * k, False))
    brass.append((T(bar), BAR * 0.95, [48, 50, 52, 54][k], 0.6 + 0.08 * k, False))
    strings.append((T(bar), BAR, [[60, 64, 67, 72], [62, 66, 69, 74], [64, 67, 71, 76], [63, 66, 71, 75]][k], 0.55 + 0.1 * k))
for s in range(0, 16, 4): drums.append((T(28, s), 'kick', 0.9)); drums.append((T(29, s), 'kick', 0.9))
snare_roll(28, 0, 16, 0.45, 0.6, 2); snare_roll(29, 0, 16, 0.6, 0.75, 2)
snare_roll(30, 0, 16, 0.7, 1.0, 1)
for s in range(16): drums.append((T(30, s), 'kick2', 0.7))
tom_fill(31, 0)
for s in (8, 10):
    drums.append((T(31, s), 'kick', 1.0)); drums.append((T(31, s), 'snare', 1.0)); drums.append((T(31, s), 'crash', 0.9))
choir.append((T(30), 2 * BAR * 0.87, [64, 67, 71], 0.7))
fx.append((T(31, 12) - 1.5 + 4 * STEP, 'revcym'))
fx.append((T(30), 'riser2'))

# ------------------------------------------------ 32-39 サビ
CH_ROOTS = [C3, D3, E2, E2, C3, D3, B2, B2]
CH_TRI = [[60, 64, 67], [62, 66, 69], [64, 67, 71], [64, 67, 71], [60, 64, 67], [62, 66, 69], [59, 63, 66], [59, 63, 66]]
CHORUS = [
    [(0, 8, 79, {'bend': 2, 'vib': 0.35}), (8, 4, 81), (12, 4, 83)],
    [(0, 8, 81, {'vib': 0.35}), (8, 4, 78), (12, 4, 74)],
    [(0, 8, 76, {'vib': 0.35}), (8, 4, 79), (12, 4, 83)],
    [(0, 12, 88, {'bend': 2, 'vib': 0.5}), (12, 2, 86), (14, 2, 83)],
    [(0, 8, 88, {'vib': 0.45}), (8, 4, 86), (12, 4, 84)],
    [(0, 8, 86, {'vib': 0.45}), (8, 4, 84), (12, 4, 83)],
    [(0, 8, 83, {'vib': 0.35}), (8, 2, 84), (10, 2, 83), (12, 2, 81), (14, 2, 78)],
    [(0, 16, 83, {'bend': 1, 'vib': 0.55})],
]


def chorus(bar0, tr=0, harm=False, drive_from=99):
    for k in range(8):
        bar = bar0 + k
        r = CH_ROOTS[k] + tr
        nr = CH_ROOTS[(k + 1) % 8] + tr
        if k < 7:
            rhythm.append((T(bar, 0), 14 * STEP, r, 'open', 1.0))
            rhythm.append((T(bar, 14), 2 * STEP, nr, 'acc', 1.0))
        else:
            rhythm.append((T(bar, 0), 12 * STEP, r, 'open', 1.0))
            for s in (12, 13, 14, 15): rhythm.append((T(bar, s), STEP, r, 'pm', 1.0))
        for s in range(0, 16, 2):   # ベースは 8 分で推進
            bass_extra.append((T(bar, s), 2 * STEP * 0.9, r))
        beat_drums(bar, 'drive' if k >= drive_from else 'half', crash=True)
        drums.append((T(bar, 14), 'kick', 1.0))
        if k in (3, 7): tom_fill(bar, 12)
        L(bar, CHORUS[k], 'lead', tr)
        if harm: L(bar, CHORUS[k], 'harm_lo', tr)
        for st, ln, m, *o in CHORUS[k]:   # ホルンがオクターブ下でユニゾン
            brass.append((T(bar, st), ln * STEP * 0.95, m - 12 + tr, 0.7, False))
        tri = [x + tr for x in CH_TRI[k]]
        strings.append((T(bar), BAR, [tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[0] + 24], 0.75))
        choir.append((T(bar), BAR * 0.98, tri, 0.85))
        if k % 2 == 0: timp.append((T(bar), r - 12 if r - 12 >= 38 else r, 0.9))


chorus(32)
fx.append((T(32), 'impact'))

# ------------------------------------------------ 40-43 ブレイクダウン
STAB = [(0, 3, E2, 'acc'), (3, 3, E2, 'acc'), (6, 2, E2, 'acc'), (10, 2, E2, 'acc'), (12, 1, E2, 'pm'), (13, 1, E2, 'pm'), (14, 2, F2, 'acc')]
for k in range(4):
    bar = 40 + k
    part = STAB if k < 3 else STAB[:3] + [(s, 1, E2, 'pm') for s in range(8, 16)]
    riff(bar, part)
    drums.append((T(bar, 8), 'snare', 1.0))
    if k in (1,): drums.append((T(bar, 12), 'china', 0.9))
    for s in range(0, 16, 4): drums.append((T(bar, s), 'ride', 0.55))
    for s in range(16):
        arp.append((T(bar, s), [64, 67, 71, 76, 71, 67, 65, 64][s % 8] + 12))
    if k in (0, 2):
        fx.append((T(bar), 'impact')); drums.append((T(bar), 'crash', 1.0)); timp.append((T(bar), E2, 1.0))
        brass.append((T(bar), 3 * STEP, 64, 1.0, True)); brass.append((T(bar), 3 * STEP, 71, 0.9, True)); brass.append((T(bar), 3 * STEP, 52, 0.9, True))
tom_fill(43, 8)
choir.append((T(40), 4 * BAR, [52, 59, 64], 0.6))

# ------------------------------------------------ 44-51 ギターソロ
SOLO_CH = [(A2, [57, 60, 64]), (B2, [59, 63, 66]), (E2, [64, 67, 71]), (C3, [60, 64, 67]),
           (A2, [57, 60, 64]), (B2, [59, 63, 66]), (C3, [60, 64, 67]), (B2, [59, 63, 66])]
LG = {'leg': 1}
run5 = [69, 71, 72, 75, 76, 78, 79, 81, 83, 84, 87]
SOLO = [
    [(0, 8, 81, {'bend': 2, 'vib': 0.4}), (8, 1, 84), (9, 1, 83, LG), (10, 1, 81, LG), (11, 1, 79, LG), (12, 4, 76, {'vib': 0.3})],
    [(0, 1, 71), (1, 1, 75, LG), (2, 1, 78, LG), (3, 1, 83, LG), (4, 4, 87, {'vib': 0.4}), (8, 1, 84), (9, 1, 83, LG), (10, 1, 81, LG), (11, 1, 78, LG), (12, 4, 75, {'vib': 0.3})],
    [(0, 2, 76), (2, 2, 79), (4, 2, 83), (6, 6, 88, {'vib': 0.5}), (12, 2, 86), (14, 2, 83)],
    [(0, 4, 84, {'bend': 1}), (4, 2, 83), (6, 2, 79), (8, 4, 76), (12, 2, 79), (14, 2, 84)],
    [(i, 1, n, LG if i else {}) for i, n in enumerate(run5)] + [(11, 5, 88, {'vib': 0.5})],
    [(i, 1, n, LG if i else {}) for i, n in enumerate([87, 84, 83, 81, 79, 78, 76, 75])] + [(8, 1, 71), (9, 1, 75, LG), (10, 1, 78, LG), (11, 1, 81, LG), (12, 4, 83, {'vib': 0.45})],
    [(0, 4, 79, {'bend': 2}), (4, 1, 88), (5, 1, 84, LG), (6, 1, 79, LG), (7, 1, 76, LG), (8, 1, 88), (9, 1, 84, LG), (10, 1, 79, LG), (11, 1, 76, LG), (12, 4, 84, {'vib': 0.4})],
    [(0, 16, 83, {'vib': 0.5, 'dive': 12})],
]
for k in range(8):
    bar = 44 + k
    root, ch = SOLO_CH[k]
    gallop(bar, root)
    beat_drums(bar, 'double', crash=(k % 4 == 0))
    L(bar, SOLO[k], 'lead')
    strings.append((T(bar), BAR, [ch[0], ch[1], ch[2], ch[0] + 12], 0.45))
drums.append((T(51, 12), 'china', 1.0))

# ------------------------------------------------ 52-55 リフ A 再提示
for i, b in enumerate((52, 54)):
    riff(b, RIFF_1, brass_stabs=True); riff(b + 1, RIFF_2F if i == 1 else RIFF_2, brass_stabs=True)
    beat_drums(b, 'riff_ride', crash=True); beat_drums(b + 1, 'riff_ride')
lead.append((T(53, 12), 4 * STEP, 90, {'vib': 0.8, 'pinch': 1, 'vol': 0.55}, 'lead'))
strings.append((T(52), 4 * BAR, [52, 59, 64, 71], 0.55))

# ------------------------------------------------ 56-63 サビ (+2 転調, ツインリード)
chorus(56, tr=2, harm=True, drive_from=4)
fx.append((T(56), 'impact'))

# ------------------------------------------------ 64-71 リフ A → ビルドアップ (ループ可能)
for i, b in enumerate((64, 66)):
    riff(b, RIFF_1, brass_stabs=True); riff(b + 1, RIFF_2, brass_stabs=True)
    beat_drums(b, 'riff_ride', crash=True); beat_drums(b + 1, 'riff_ride')
L(64, HOOK[0]); L(65, HOOK[1]); L(66, HOOK[2]); L(67, HOOK[3])
L(64, HOOK[0], 'harm'); L(65, HOOK[1], 'harm'); L(66, HOOK[2], 'harm'); L(67, HOOK[3], 'harm')
strings.append((T(64), 4 * BAR, [52, 59, 64, 71], 0.6))
choir.append((T(64), 4 * BAR, [64, 67, 71], 0.5))
gallop(68, B2); gallop(69, B2)
beat_drums(68, 'double', crash=True); beat_drums(69, 'double')
trem(70, C3, 0.75, 0.9)
trem(71, B2, 0.9, 1.0, steps=12)
for s, r in zip((12, 13, 14, 15), (Bb2, A2, G2, Fs2)):
    rhythm.append((T(71, s), STEP, r, 'acc', 1.0))
for s in range(16): drums.append((T(70, s), 'kick2', 0.75))
snare_roll(70, 0, 16, 0.55, 0.8, 2)
snare_roll(71, 0, 12, 0.7, 1.0, 1)
tom_fill(71, 12)
drums.append((T(70), 'crash', 0.8))
brass.append((T(68), 2 * BAR, 59, 0.7, False)); brass.append((T(68), 2 * BAR, 63, 0.65, False)); brass.append((T(68), 2 * BAR, 66, 0.65, False))
brass.append((T(70), BAR, 60, 0.8, False)); brass.append((T(70), BAR, 64, 0.75, False)); brass.append((T(70), BAR, 67, 0.75, False))
brass.append((T(71), BAR, 59, 0.9, False)); brass.append((T(71), BAR, 63, 0.85, False)); brass.append((T(71), BAR, 66, 0.85, False))
strings.append((T(68), 2 * BAR, [59, 63, 66, 71], 0.6))
strings.append((T(70), BAR, [60, 64, 67, 72], 0.75))
strings.append((T(71), BAR, [59, 63, 66, 71, 75], 0.9))
choir.append((T(68), 4 * BAR * 0.97, [59, 63, 66], 0.75))
fx.append((T(70), 'riser2'))
timp.append((T(68), B2 - 12 + 12, 0.8)); timp.append((T(70), C3 - 12 + 12, 0.85))
for s in range(16): timp.append((T(71, s), B2 - 12 + 12, 0.4 + 0.6 * s / 15))


# =====================================================================
# レンダリング
# =====================================================================
def render_rhythm(seed, jitter=0.004, detune=3.0):
    r2 = np.random.default_rng(seed)
    di = np.zeros(N)
    spec = {
        'pm': dict(strings=(0, 7), bright=0.35, decay=0.22, mute=True, amp=0.8, ring=1.15),
        'trem': dict(strings=(0, 7), bright=0.55, decay=0.45, mute=True, amp=0.8, ring=1.0),
        'acc': dict(strings=(0, 7, 12), bright=0.8, decay=2.2, mute=False, amp=1.0, ring=1.0),
        'open': dict(strings=(0, 7, 12), bright=0.75, decay=4.5, mute=False, amp=1.0, ring=1.0),
    }
    for t, dur, root, kind, vel in rhythm:
        s = spec[kind]
        t0 = t + r2.normal(0, jitter)
        for si, iv in enumerate(s['strings']):
            f = float(mtof(root + iv)) * 2 ** (r2.normal(0, detune) / 1200)
            y = ks(f, dur * s['ring'], r2, bright=s['bright'] * (0.9 + 0.1 * vel), decay=s['decay'], mute=s['mute'],
                   pick=r2.uniform(0.1, 0.16), amp=s['amp'] * vel * (1.0, 0.85, 0.55)[si], rel=0.018)
            put(di, y, t0 + si * 0.0045)
    return di / (np.max(np.abs(di)) + 1e-9)


def render_bass():
    di = np.zeros(N)
    r2 = np.random.default_rng(99)
    evs = [(t, dur, root, kind) for t, dur, root, kind, vel in rhythm]
    for t, dur, root in bass_extra:
        evs.append((t, dur, root, 'b8'))
    chorus_bars = set(range(32, 40)) | set(range(56, 64))
    for t, dur, root, kind in evs:
        bar = int(t / BAR + 1e-6)
        if bar in (2, 3): continue                        # イントロのギター単独部
        if bar in chorus_bars and kind != 'b8': continue  # サビはベース 8 分
        m = root - 12 if root - 12 >= 28 else root
        mute = kind in ('pm', 'trem')
        y = ks(float(mtof(m)), max(dur, STEP) * (1.0 if mute else 0.95), r2, bright=0.45 if mute else 0.6,
               decay=0.35 if mute else 1.6, mute=mute, amp=0.9, rel=0.02)
        n = len(y); tt = np.arange(n) / FS
        sub = np.sin(2 * np.pi * float(mtof(m)) * tt) * np.minimum(1, tt / 0.004) * 0.3
        sub *= np.where(tt < dur, 1, np.exp(-(tt - dur) / 0.015))
        put(di, y + sub, t)
    di /= np.max(np.abs(di)) + 1e-9
    x = np.tanh(di * 2.2) / np.tanh(2.2)
    x = filt(x, 'lp', 2600, 0.7); x = filt(x, 'hp', 35, 0.7)
    x = filt(x, 'peak', 800, 1.0, 3.0)
    return x


def lead_note(m, dur, opts, r2):
    """KS をピッチ曲線に沿って可変速再生 → ベンド/ビブラート/アーミング"""
    nn = int(dur * FS) + int(0.04 * FS)
    tt = np.arange(nn) / FS
    semi = np.zeros(nn)
    if opts.get('bend'):
        bt = opts.get('btime', 0.11)
        semi -= opts['bend'] * (1 - np.minimum(1, tt / bt)) ** 2
    if opts.get('vib'):
        on = 0.14 if not opts.get('pinch') else 0.03
        ramp = np.clip((tt - on) / 0.22, 0, 1)
        semi += opts['vib'] * ramp * (1 - np.cos(2 * np.pi * 5.7 * np.maximum(0, tt - on))) / 2
    if opts.get('dive'):
        st = dur * 0.45
        u = np.clip((tt - st) / (dur - st), 0, 1)
        semi -= opts['dive'] * u ** 1.7
    ratio = 2 ** (semi / 12)
    pos = np.cumsum(ratio) - ratio[0]
    need = int(pos[-1]) + 4
    leg = opts.get('leg')
    pinch = opts.get('pinch')
    src = ks(float(mtof(m)), need / FS + 0.05, r2, bright=0.95 if pinch else (0.6 if leg else 0.85), decay=9.0,
             pick=0.06 if pinch else 0.2, amp=0.55 if leg else 1.0, rel=0.0)
    y = np.interp(pos, np.arange(len(src)), src)
    rel = int(0.03 * FS); ne = int(dur * FS)
    env = np.ones(nn); env[ne:ne + rel] = np.linspace(1, 0, len(env[ne:ne + rel])); env[ne + rel:] = 0
    if opts.get('dive'):
        env *= np.clip(1 - np.clip((tt - dur * 0.75) / (dur * 0.25), 0, 1) * 0.6, 0, 1)
    return y * env * opts.get('vol', 1.0)


SCALE_E_MIN = [4, 6, 7, 9, 11, 0, 2]


def harmonize(m, steps, pcs):
    pc = m % 12
    if pc not in pcs:
        return m + (3 if steps > 0 else -4)
    i = pcs.index(pc)
    j = i + steps
    o, jj = divmod(j, len(pcs))
    target = pcs[jj] + 12 * (m // 12 + o)
    # 同じオクターブ内に揃える
    while target <= m and steps > 0: target += 12
    while target >= m and steps < 0: target -= 12
    while target - m > 12: target -= 12
    while m - target > 12: target += 12
    return target


def render_lead(parts, seed):
    r2 = np.random.default_rng(seed)
    di = np.zeros(N)
    for t, dur, m, opts, part in lead:
        if part not in parts:
            continue
        mm = m
        if part == 'harm':
            mm = harmonize(m, 2, SCALE_E_MIN)
        elif part == 'harm_lo':
            mm = harmonize(m - 2, -2, SCALE_E_MIN) + 2  # 転調サビ: 3度下
        y = lead_note(mm, dur, opts, r2)
        put(di, y, t + r2.normal(0, 0.003))
    if np.max(np.abs(di)) == 0:
        return di
    return di / np.max(np.abs(di))


def render_synlead():
    out = np.zeros(N)
    prev = None
    for t, dur, m in synlead:
        n = int((dur + 0.25) * FS); tt = np.arange(n) / FS
        f0 = float(mtof(m))
        semi = np.zeros(n)
        if prev is not None and abs(prev[0] + prev[1] - t) < 0.02:
            d = prev[2] - m
            semi += d * np.exp(-tt / 0.025)
        semi += 0.22 * np.clip((tt - 0.2) / 0.3, 0, 1) * np.sin(2 * np.pi * 5.4 * tt)
        f = f0 * 2 ** (semi / 12)
        s = polyblep_saw(f) * 0.6 + polyblep_saw(f * 1.006) * 0.5 + polyblep_saw(f * 0.5) * 0.25
        env = adsr(n, 0.006, 0.4, 0.75, 0.08, dur)
        put(out, s * env, t)
        prev = (t, dur, m)
    x = filt(out, 'lp', 4200, 0.9)
    x = np.tanh(x * 1.5)
    return x


def render_arp():
    out = np.zeros(N)
    for t, m in arp:
        n = int(0.22 * FS); tt = np.arange(n) / FS
        f = float(mtof(m))
        s = polyblep_saw(np.full(n, f)) * 0.7 + np.sign(np.sin(2 * np.pi * f * 1.003 * tt)) * 0.3
        s = onepole_lp(s, 2600) * np.exp(-tt / 0.07)
        put(out, s, t)
    return filt(out, 'hp', 200)


def render_strings():
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(5)
    for t, dur, notes, vel in strings:
        for m in notes:
            put(out, supersaw(m, dur, r2, attack=min(0.35, dur * 0.3), release=0.45) * vel, t)
    x = filt(out, 'lp', 3600, 0.7); x = filt(x, 'hp', 160, 0.7)
    return x


def render_choir():
    out = np.zeros(N)
    r2 = np.random.default_rng(6)
    for t, dur, notes, vel in choir:
        for m in notes:
            put(out, choir_note(m, dur, r2) * vel, t)
    x = formant_ah(out)
    x = filt(x, 'hp', 180)
    st = np.stack([x, np.concatenate([np.zeros(int(0.012 * FS)), x[:-int(0.012 * FS)]])], 1)
    return st


def render_brass():
    out = np.zeros(N)
    r2 = np.random.default_rng(8)
    for t, dur, m, vel, stab in brass:
        y = brass_note(m, dur, r2, attack=0.008 if stab else 0.035, release=0.09 if stab else 0.2, bright=1.0)
        put(out, y * vel, t)
    return filt(out, 'hp', 90)


def render_drums(kit):
    st = {k: np.zeros((N, 2)) for k in ('kick', 'snare', 'toms', 'hats', 'cym')}
    r2 = np.random.default_rng(3)
    pans = {'tom1': -0.35, 'tom2': 0.1, 'tom3': 0.45, 'hat': 0.3, 'ohat': 0.3}
    for t, name, vel in drums:
        t0 = t + r2.normal(0, 0.0015)
        v = vel * r2.uniform(0.92, 1.0)
        x = kit[name]
        if name in ('kick', 'kick2'): put(st['kick'], pan_mono(x, 0), t0, v)
        elif name == 'snare': put(st['snare'], pan_mono(x, 0), t0, v)
        elif name.startswith('tom'): put(st['toms'], pan_mono(x, pans[name]), t0, v)
        elif name in ('hat', 'ohat'): put(st['hats'], pan_mono(x, pans[name]), t0, v)
        else: put(st['cym'], x, t0, v * (0.8 if name == 'ride' else 1.0))
    return st


def render_timp():
    out = np.zeros(N)
    r2 = np.random.default_rng(4)
    cache = {}
    for t, m, vel in timp:
        if m not in cache:
            cache[m] = timpani(float(mtof(m)), r2)
        put(out, cache[m], t, vel)
    return out


def render_fx(kit):
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(12)
    for t, kind in fx:
        if kind == 'impact': put(out, pan_mono(impact(r2), 0), t, 0.9)
        elif kind == 'revcym': put(out, kit['revcym'], t, 0.6)
        elif kind == 'riser2': put(out, pan_mono(riser(2 * BAR, r2), 0), t, 0.5)
    return out


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(1))
    print('rendering rhythm guitars...', flush=True)
    rhy_amp = dict(gain=24, tight=90, mid=(900, 3.0), scoop=(500, -2.0), low=(120, 8.0), cab_lp=4800,
                   post_eq=(('peak', 1200, 0.6, -3.0), ('ls', 300, 0.7, 5.0)))
    gl = amp_sim(render_rhythm(101), **rhy_amp)
    gr = amp_sim(render_rhythm(202), **rhy_amp)
    print('  %.1fs' % (time.time() - t0), flush=True)
    print('rendering bass / lead...', flush=True)
    bass = render_bass()
    lead_di = render_lead(('lead',), 301)
    harm_di = render_lead(('harm', 'harm_lo'), 302)
    lead_amp = dict(gain=40, tight=220, mid=(1000, 7.0), scoop=(500, -2.0), presence=(2600, 3.0), cab_lp=5800)
    ld = amp_sim(lead_di, **lead_amp)
    hm = amp_sim(harm_di, **lead_amp)
    print('  %.1fs' % (time.time() - t0), flush=True)
    print('rendering orchestra / synth / drums...', flush=True)
    syn = render_synlead(); ap = render_arp()
    strg = render_strings(); cho = render_choir(); brs = render_brass()
    dr = render_drums(kit); tp = render_timp(); fxs = render_fx(kit)
    print('  %.1fs' % (time.time() - t0), flush=True)

    def norm(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'gtrL': pan_mono(norm(gl, -17), -0.9),
        'gtrR': pan_mono(norm(gr, -17), 0.9),
        'bass': pan_mono(norm(bass, -21), 0),
        'lead': pan_mono(norm(ld, -17), 0.0),
        'harm': pan_mono(norm(hm, -20), 0.25),
        'syn': pan_mono(norm(syn, -23), 0.1),
        'arp': pan_mono(norm(ap, -29), -0.2),
        'strings': norm(strg, -25),
        'choir': norm(cho, -26),
        'brass': pan_mono(norm(brs, -23), -0.15),
        'kick': norm(dr['kick'], -20.5),
        'snare': norm(dr['snare'], -16),
        'toms': norm(dr['toms'], -18),
        'hats': norm(dr['hats'], -30),
        'cym': norm(dr['cym'], -27),
        'timp': pan_mono(norm(tp, -22), 0),
        'fx': norm(fxs, -24),
    }
    if os.environ.get('STEMDIAG'):
        def bands(x):
            x = x.mean(1) if x.ndim == 2 else x
            f, pw = signal.welch(x, FS, nperseg=8192)
            ed = [20, 120, 500, 2000, 6000, 16000]
            return [10 * np.log10(pw[(f >= a) & (f < b)].sum() + 1e-20) for a, b in zip(ed[:-1], ed[1:])]
        a, b = int(T(20) * FS), int(T(28) * FS)
        for k, v in stems.items():
            print('%-8s ' % k + ' '.join('%7.1f' % q for q in bands(v[a:b])))
    # ステレオの広がり: アルペジオはピンポンディレイ
    stems['arp'] = stems['arp'] + delay_st(stems['arp'], STEP * 3, STEP * 3, fb=0.45, mix=0.5)
    # リードはディレイ (付点8分)
    stems['lead'] = stems['lead'] + delay_st(stems['lead'], STEP * 3, STEP * 3, fb=0.3, mix=0.18, lp=3000)
    stems['syn'] = stems['syn'] + delay_st(stems['syn'], STEP * 3, STEP * 3, fb=0.35, mix=0.25, lp=3500)
    # ドラムバス: パラレルコンプで太く
    drum_bus = stems['kick'] + stems['snare'] + stems['toms'] + stems['hats'] + stems['cym']
    drum_bus = drum_bus * 0.7 + compress(drum_bus, -24, 6, 0.003, 0.08, 6) * 0.5

    sends = {'lead': 0.22, 'harm': 0.22, 'syn': 0.3, 'arp': 0.25, 'strings': 0.55, 'choir': 0.7, 'brass': 0.35,
             'snare': 0.18, 'toms': 0.2, 'timp': 0.45, 'fx': 0.3, 'gtrL': 0.04, 'gtrR': 0.04}
    send = sum(stems[k] * v for k, v in sends.items())
    ir = make_ir(2.6)
    rev = convolve_reverb(filt(send, 'hp', 250), ir) * 0.55

    mix = drum_bus
    for k in ('gtrL', 'gtrR', 'bass', 'lead', 'harm', 'syn', 'arp', 'strings', 'choir', 'brass', 'timp', 'fx'):
        mix = mix + stems[k]
    mix = mix + rev
    # マスター: 軽いEQ → バスコンプ → リミッター
    mix = filt(mix, 'hp', 28, 0.7)
    mix = filt(mix, 'hs', 9000, 0.7, 1.5)
    mix = filt(mix, 'peak', 300, 0.8, -1.5)
    mix = filt(mix, 'ls', 90, 0.7, -1.5)
    mix = compress(mix, -14, 2.5, 0.01, 0.15)
    mix = mix / (active_rms(mix, pct=95) + 1e-9) * 10 ** (-10.5 / 20)
    mix = limiter(mix, 0.87)
    # 最後はテイル (リバーブの余韻) をフェード
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'stage1.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    np.save(os.path.join(out, 'stems_rms.npy'), {k: active_rms(v) for k, v in stems.items()}, allow_pickle=True)
    print('done %.1fs  peak=%.3f  rms=%.4f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2))))


if __name__ == '__main__':
    main()
