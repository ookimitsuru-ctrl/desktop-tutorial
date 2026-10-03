#!/usr/bin/env python3
"""WIRED ステージ3 BGM「UNITED FRONT」(仮) — みんなの力を合わせて勝利を掴む

オーケストラ / 132 BPM の行進曲調 / 66 小節 = 120 秒 (ボス出現まで)
孤独なホルンの主題に仲間 (弦・木管・合唱・金管・打楽器) が一人ずつ加わり、
最後は短調の主題が長調の凱歌に生まれ変わる。
  0- 3  イントロ: 遠くの軍隊スネア + 低弦 + ティンパニ + ホルンの呼びかけ
  4-11  主題 (D マイナー): ソロホルン、弦の刻みが静かに始まる
 12-19  仲間が集う: ヴァイオリンが主題、ホルンの対旋律、フルート、太鼓、合唱
 20-27  戦い: 16 分の刻み + 低音金管の打撃 + 上昇する和声
 28-35  希望: 主題を F メジャーで (グロッケンのきらめき)
 36-39  結集: 属音 (A) の上に全員が集まり、溜めてブレイク
 40-55  勝利: D メジャーの凱歌 (トランペット) → E メジャーへ転調
 56-65  ボスへ: 短調に戻り決戦の行進 → ループ先頭へ
ループ: 小節 12 (21.818 秒) 〜 120.0 秒
"""
import sys, os, time
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

BPM = 132
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 66
LOOP_BAR = 12
TAIL = 4.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)
rng = np.random.default_rng(1332)


def T(bar, step=0.0):
    return bar * BAR + step * STEP


def put(dst, x, t, g=1.0):
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
# 楽器
# =====================================================================
def spiccato(m, dur, r2, vel=1.0):
    """弦の短い刻み: デチューンしたノコギリ波 + 弓のノイズ"""
    n = int((dur + 0.12) * FS); t = np.arange(n) / FS
    f = float(mtof(m))
    s = np.zeros(n)
    for c in (-8, 0, 7):
        s += polyblep_saw(np.full(n, f * 2 ** ((c + r2.normal(0, 2)) / 1200)), r2.uniform(0, 1))
    s /= 3
    s = onepole_lp(s, 2600) * 0.9 + filt(r2.uniform(-1, 1, n), 'bp', 2500, 1.2) * 0.12 * np.exp(-t / 0.02)
    env = np.minimum(1, t / 0.006) * np.exp(-t / max(0.05, dur * 0.55))
    return s * env * vel


def flute(m, dur, r2, vel=1.0):
    n = int((dur + 0.3) * FS); t = np.arange(n) / FS
    f0 = float(mtof(m))
    vib = 1 + 0.004 * np.clip((t - 0.2) / 0.3, 0, 1) * np.sin(2 * np.pi * 5.2 * t)
    ph = 2 * np.pi * np.cumsum(f0 * vib) / FS
    s = np.sin(ph) + 0.25 * np.sin(2 * ph) + 0.08 * np.sin(3 * ph)
    s += filt(r2.uniform(-1, 1, n), 'bp', f0 * 2, 2.0) * 0.12
    env = adsr(n, 0.06, 0.4, 0.85, 0.12, dur)
    return s * env * vel


def glock(m, r2, vel=1.0):
    n = int(1.6 * FS); t = np.arange(n) / FS
    f = float(mtof(m))
    s = np.sin(2 * np.pi * f * t) * np.exp(-t / 0.9) + 0.4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t / 0.3) + 0.2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.1)
    s *= np.minimum(1, t / 0.001)
    return s * vel


def taiko(r2, pitch=62):
    n = int(1.2 * FS); t = np.arange(n) / FS
    f = pitch * (1 + 0.6 * np.exp(-t / 0.04))
    s = np.sin(2 * np.pi * np.cumsum(f) / FS) * np.exp(-t / 0.45)
    s += filt(r2.uniform(-1, 1, n), 'lp', 1200) * np.exp(-t / 0.05) * 0.7
    return s / np.max(np.abs(s))


def mil_snare(r2):
    n = int(0.35 * FS); t = np.arange(n) / FS
    s = filt(r2.uniform(-1, 1, n), 'bp', 3500, 0.7) * np.exp(-t / 0.08) + np.sin(2 * np.pi * 240 * t) * np.exp(-t / 0.03) * 0.5
    return s / np.max(np.abs(s))


def bass_drum(r2):
    n = int(1.5 * FS); t = np.arange(n) / FS
    s = np.sin(2 * np.pi * np.cumsum(45 + 30 * np.exp(-t / 0.05)) / FS) * np.exp(-t / 0.6)
    s += filt(r2.uniform(-1, 1, n), 'lp', 400) * np.exp(-t / 0.08) * 0.5
    return s / np.max(np.abs(s))


# =====================================================================
# 楽譜
# =====================================================================
# 主題 (D マイナー) と 凱歌 (D メジャー)。(step, len, midi)
TH_MIN = [
    [(0, 4, 69), (4, 6, 74), (10, 2, 76), (12, 4, 77)],
    [(0, 6, 76), (6, 2, 74), (8, 8, 72)],
    [(0, 4, 74), (4, 4, 70), (8, 4, 74), (12, 4, 77)],
    [(0, 12, 76), (12, 2, 73), (14, 2, 76)],
    [(0, 4, 69), (4, 6, 74), (10, 2, 76), (12, 4, 77)],
    [(0, 6, 81), (6, 2, 79), (8, 8, 77)],
    [(0, 4, 79), (4, 4, 77), (8, 4, 76), (12, 4, 73)],
    [(0, 16, 74)],
]
CH_MIN = [[50, 53, 57], [48, 52, 55], [46, 50, 53], [45, 49, 52], [50, 53, 57], [53, 57, 60], [55, 58, 62], [50, 53, 57]]
RT_MIN = [38, 36, 34, 33, 38, 41, 43, 38]   # 低音 (bar7 は G → A)
TH_MAJ = [
    [(0, 4, 69), (4, 6, 74), (10, 2, 76), (12, 4, 78)],
    [(0, 6, 76), (6, 2, 74), (8, 8, 73)],
    [(0, 4, 74), (4, 4, 71), (8, 4, 74), (12, 4, 79)],
    [(0, 12, 76), (12, 2, 78), (14, 2, 79)],
    [(0, 4, 81), (4, 6, 86), (10, 2, 85), (12, 4, 83)],
    [(0, 6, 86), (6, 2, 85), (8, 8, 83)],
    [(0, 4, 83), (4, 4, 81), (8, 4, 79), (12, 4, 76)],
    [(0, 16, 86)],
]
CH_MAJ = [[50, 54, 57], [45, 49, 52], [43, 47, 50], [45, 49, 52], [50, 54, 57], [47, 50, 54], [43, 47, 50], [50, 54, 57]]
RT_MAJ = [38, 33, 31, 33, 38, 35, 31, 38]

strings = []    # (時刻, 長さ, [midi], 強さ)  サステイン
violins = []    # (時刻, 長さ, midi, 強さ)    旋律
spic = []       # (時刻, 長さ, midi, 強さ)
horns = []      # (時刻, 長さ, midi, 強さ)
trumpets = []
lowbrass = []
flutes = []
glocks = []     # (時刻, midi, 強さ)
choir = []      # (時刻, 長さ, [midi], 強さ)
perc = []       # (時刻, 名前, 強さ)
timp = []       # (時刻, midi, 強さ)
fxs = []


def melody(lst, bar0, th, tr=0, vel=1.0, oct_=0, legato=1.0):
    for k, notes in enumerate(th):
        for st, ln, m in notes:
            lst.append((T(bar0 + k, st), ln * STEP * legato, m + tr + 12 * oct_, vel))


def harmony_block(bar0, ch, rt, tr=0, s_vel=0.6, c_vel=0.0, spic_vel=0.0, spic_pat='8', low_vel=0.0, horn_vel=0.0):
    for k in range(8):
        bar = bar0 + k
        c = [x + tr for x in ch[k]]; r = rt[k] + tr
        strings.append((T(bar), BAR, [r + 12, c[0] + 12, c[1] + 12, c[2] + 12], s_vel))
        if c_vel: choir.append((T(bar), BAR * 0.98, [c[0] + 12, c[1] + 12, c[2] + 12], c_vel))
        if horn_vel: horns.append((T(bar), BAR * 0.95, c[1] + 12, horn_vel)); horns.append((T(bar), BAR * 0.95, c[2], horn_vel * 0.8))
        if spic_vel:
            fig = [r, r, r + 12, r, r + 7, r, r + 12, r + 7] if spic_pat == '8' else [r, r + 12, r, r + 12, r + 7, r + 12, r + 7, r + 12] * 2
            step = 2 if spic_pat == '8' else 1
            for i, m in enumerate(fig):
                spic.append((T(bar, i * step), STEP * step * 0.9, m + 12, spic_vel * (1.0 if i % 4 == 0 else 0.8)))
        if low_vel:
            for st in (0, 6, 10):
                lowbrass.append((T(bar, st), STEP * (3 if st == 0 else 2), r, low_vel * (1.0 if st == 0 else 0.8)))


def march(bar, vel=1.0, full=False):
    """軍隊スネア: 行進のリズム"""
    pat = [0, 3, 4, 6, 8, 11, 12, 13, 14, 15] if full else [0, 6, 8, 12, 14]
    for st in pat:
        perc.append((T(bar, st), 'snare', vel * (1.0 if st % 4 == 0 else 0.7)))


def big_drums(bar, vel=1.0, pattern='a'):
    pats = {'a': [(0, 1.0), (6, 0.7), (8, 0.9), (11, 0.6), (12, 0.8)], 'b': [(0, 1.0), (3, 0.6), (6, 0.8), (8, 1.0), (10, 0.6), (12, 0.9), (14, 0.7), (15, 0.6)]}
    for st, v in pats[pattern]:
        perc.append((T(bar, st), 'taiko', v * vel))
    perc.append((T(bar, 0), 'bd', vel))


# ------------------------------------------------ 0-3 イントロ
for b in range(4):
    march(b, 0.25 + 0.1 * b)
    strings.append((T(b), BAR, [38, 45, 50], 0.35 + 0.05 * b))
    timp.append((T(b), 38, 0.5 + 0.1 * b))
horns.append((T(2), 4 * STEP, 69, 0.7)); horns.append((T(2, 4), 6 * STEP, 74, 0.7)); horns.append((T(2, 10), 2 * STEP, 76, 0.7))
horns.append((T(2, 12), 4 * STEP, 77, 0.75)); horns.append((T(3), 12 * STEP, 76, 0.7))
for s in range(12, 16): timp.append((T(3, s), 38, 0.5 + 0.12 * (s - 12)))

# ------------------------------------------------ 4-11 主題 (ソロホルン)
melody(horns, 4, TH_MIN, vel=0.85, legato=0.98)
harmony_block(4, CH_MIN, RT_MIN, s_vel=0.4, spic_vel=0.35)
for b in range(4, 12):
    march(b, 0.4)
    if b % 2 == 0: timp.append((T(b), RT_MIN[(b - 4) % 8] if RT_MIN[(b - 4) % 8] >= 36 else 38, 0.6))

# ------------------------------------------------ 12-19 仲間が集う
melody(violins, 12, TH_MIN, vel=0.9, oct_=0)
melody(flutes, 12, TH_MIN, vel=0.5, oct_=1)
harmony_block(12, CH_MIN, RT_MIN, s_vel=0.5, c_vel=0.45, spic_vel=0.55, horn_vel=0.45)
for b in range(12, 20):
    march(b, 0.55, full=(b >= 16))
    big_drums(b, 0.6)
    if b % 2 == 0: timp.append((T(b), 38, 0.7))
perc.append((T(12), 'crash', 0.7))

# ------------------------------------------------ 20-27 戦い
BAT_CH = [[50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55], [50, 53, 57], [51, 55, 58], [53, 57, 60], [45, 49, 52]]
BAT_RT = [38, 38, 34, 36, 38, 39, 41, 33]
harmony_block(20, BAT_CH, BAT_RT, s_vel=0.55, c_vel=0.35, spic_vel=0.75, spic_pat='16', low_vel=0.8)
BAT_MEL = [  # 金管の勇ましいフレーズ
    [(0, 2, 62), (2, 2, 62), (4, 4, 65), (8, 2, 64), (10, 2, 62), (12, 4, 69)],
    [(0, 12, 67), (12, 4, 69)],
    [(0, 2, 65), (2, 2, 65), (4, 4, 70), (8, 2, 69), (10, 2, 67), (12, 4, 65)],
    [(0, 12, 64), (12, 4, 67)],
    [(0, 2, 62), (2, 2, 62), (4, 4, 65), (8, 2, 64), (10, 2, 62), (12, 4, 74)],
    [(0, 12, 70), (12, 4, 72)],
    [(0, 4, 72), (4, 4, 74), (8, 4, 77), (12, 4, 76)],
    [(0, 16, 73)],
]
melody(horns, 20, BAT_MEL, vel=0.9)
melody(trumpets, 20, BAT_MEL, vel=0.5, oct_=1)
for b in range(20, 28):
    march(b, 0.75, full=True)
    big_drums(b, 0.85, 'b')
    timp.append((T(b), BAT_RT[b - 20] if BAT_RT[b - 20] >= 36 else BAT_RT[b - 20] + 12, 0.85))
    if b % 4 == 0: perc.append((T(b), 'crash', 0.8))
for s in range(16): perc.append((T(27, s), 'snare', 0.5 + 0.5 * s / 15))

# ------------------------------------------------ 28-35 希望 (F メジャー)
melody(violins, 28, TH_MAJ, tr=3, vel=0.95)
melody(horns, 28, TH_MAJ, tr=3 - 12, vel=0.55)
harmony_block(28, CH_MAJ, RT_MAJ, tr=3, s_vel=0.6, c_vel=0.6, spic_vel=0.55, horn_vel=0.0)
for b in range(28, 36):
    big_drums(b, 0.6)
    tones = [x + 3 + 24 for x in CH_MAJ[(b - 28) % 8]]
    for st in range(0, 16, 2):
        glocks.append((T(b, st), tones[(st // 2) % 3] + (12 if st >= 8 else 0), 0.5))
    if b % 2 == 0: timp.append((T(b), RT_MAJ[(b - 28) % 8] + 3 if RT_MAJ[(b - 28) % 8] + 3 >= 36 else RT_MAJ[(b - 28) % 8] + 15, 0.7))
perc.append((T(28), 'crash', 0.9))

# ------------------------------------------------ 36-39 結集 (A のペダル)
for k in range(4):
    b = 36 + k
    strings.append((T(b), BAR, [45, 57, 61, 64, 69], 0.6 + 0.1 * k))
    choir.append((T(b), BAR * 0.98, [57, 61, 64] if k < 2 else [61, 64, 69], 0.5 + 0.12 * k))
    for st in range(16):
        spic.append((T(b, st), STEP * 0.9, 45 + 12 + (12 if st % 2 else 0), 0.6 + 0.1 * k))
    horns.append((T(b), BAR * 0.95, [64, 66, 67, 68][k], 0.6 + 0.1 * k))
    trumpets.append((T(b), BAR * 0.95, [69, 71, 72, 73][k], 0.4 + 0.15 * k))
    lowbrass.append((T(b), BAR * 0.95, 33, 0.6 + 0.1 * k))
    for st in range(0, 16, 1 if k >= 2 else 2):
        perc.append((T(b, st), 'snare', 0.35 + 0.2 * k + 0.1 * st / 15))
for s in range(16): timp.append((T(39, s), 33 + 12, 0.4 + 0.6 * s / 15))
fxs.append((T(38), 'riser'))

# ------------------------------------------------ 40-55 勝利 (D メジャー → E メジャー)
for half, tr in ((0, 0), (1, 2)):
    b0 = 40 + half * 8
    melody(trumpets, b0, TH_MAJ, tr=tr, vel=1.0)
    melody(violins, b0, TH_MAJ, tr=tr, vel=0.9)
    melody(flutes, b0, TH_MAJ, tr=tr, vel=0.55, oct_=1)
    harmony_block(b0, CH_MAJ, RT_MAJ, tr=tr, s_vel=0.75, c_vel=0.85, spic_vel=0.8, spic_pat='16', low_vel=0.75, horn_vel=0.75)
    for k in range(8):
        b = b0 + k
        march(b, 0.8, full=True)
        big_drums(b, 1.0, 'b' if k % 2 else 'a')
        timp.append((T(b), RT_MAJ[k] + tr if RT_MAJ[k] + tr >= 36 else RT_MAJ[k] + tr + 12, 0.95))
        perc.append((T(b), 'crash', 0.9 if k % 2 == 0 else 0.5))
        tones = [x + tr + 24 for x in CH_MAJ[k]]
        for st in range(0, 16, 4):
            glocks.append((T(b, st), tones[(st // 4) % 3] + 12, 0.45))
fxs.append((T(40), 'impact')); fxs.append((T(48), 'impact'))
for s in range(12, 16): timp.append((T(47, s), 45, 0.8 + 0.05 * (s - 12)))

# ------------------------------------------------ 56-65 ボスへ (決戦の行進)
END_CH = [[46, 50, 53], [48, 52, 55], [50, 53, 57], [50, 53, 57], [46, 50, 53], [48, 52, 55], [45, 49, 52], [45, 49, 52]]
END_RT = [34, 36, 38, 38, 34, 36, 33, 33]
harmony_block(56, END_CH, END_RT, s_vel=0.65, c_vel=0.6, spic_vel=0.85, spic_pat='16', low_vel=0.9, horn_vel=0.6)
END_MEL = [
    [(0, 4, 69), (4, 6, 74), (10, 2, 76), (12, 4, 77)],
    [(0, 6, 79), (6, 2, 77), (8, 8, 76)],
    [(0, 4, 74), (4, 4, 77), (8, 4, 81), (12, 4, 86)],
    [(0, 16, 81)],
    [(0, 4, 77), (4, 6, 82), (10, 2, 81), (12, 4, 79)],
    [(0, 6, 79), (6, 2, 77), (8, 8, 76)],
    [(0, 8, 73), (8, 8, 76)],
    [(0, 16, 81)],
]
melody(trumpets, 56, END_MEL, vel=0.9)
melody(horns, 56, END_MEL, vel=0.7, oct_=-1)
for b in range(56, 64):
    march(b, 0.85, full=True)
    big_drums(b, 1.0, 'b')
    timp.append((T(b), END_RT[b - 56] if END_RT[b - 56] >= 36 else END_RT[b - 56] + 12, 1.0))
    if b % 2 == 0: perc.append((T(b), 'crash', 0.8))
for b in (64, 65):   # 最後の 2 小節: 属音で溜めて主題 (仲間が集う) の頭へ戻る
    strings.append((T(b), BAR, [33, 45, 57, 61, 64], 0.8))
    choir.append((T(b), BAR * 0.98, [57, 61, 64], 0.75))
    lowbrass.append((T(b), BAR * 0.95, 33, 0.9)); horns.append((T(b), BAR * 0.95, 64, 0.8)); trumpets.append((T(b), BAR * 0.95, 69, 0.7))
    for st in range(16):
        spic.append((T(b, st), STEP * 0.9, 57 + (12 if st % 2 else 0), 0.85))
        perc.append((T(b, st), 'snare', 0.55 + 0.45 * ((b - 64) * 16 + st) / 31))
    big_drums(b, 1.0, 'b')
for s in range(16): timp.append((T(65, s), 45, 0.5 + 0.5 * s / 15))
fxs.append((T(64), 'riser'))


# =====================================================================
# レンダリング
# =====================================================================
def render_sustain(events, voices=6, spread=16, attack=0.18, release=0.5, lp=3400, hp=120, vib=0.07):
    out = np.zeros((N, 2)); r2 = np.random.default_rng(len(events) + 3)
    for t, dur, notes, v in events:
        for m in notes:
            put(out, supersaw(m, dur, r2, voices=voices, spread=spread, vib=vib, attack=attack, release=release) * v, t)
    return filt(filt(out, 'lp', lp, 0.7), 'hp', hp, 0.7)


def render_violins():
    out = np.zeros((N, 2)); r2 = np.random.default_rng(51)
    for t, dur, m, v in violins:
        put(out, supersaw(m, dur, r2, voices=7, spread=14, vib=0.12, attack=0.07, release=0.25) * v, t)
    return filt(filt(out, 'lp', 5200, 0.7), 'hp', 250, 0.7)


def render_mono(events, fn, seed):
    out = np.zeros(N); r2 = np.random.default_rng(seed)
    for ev in events:
        if len(ev) == 4:
            t, dur, m, v = ev
            put(out, fn(m, dur, r2) * v, t)
        else:
            t, m, v = ev
            put(out, fn(m, r2) * v, t)
    return out


def render_perc():
    st = {k: np.zeros((N, 2)) for k in ('snare', 'taiko', 'cym', 'bd')}
    r2 = np.random.default_rng(61)
    kit = drum_kit(np.random.default_rng(62))
    smp = {'snare': mil_snare(r2), 'taiko': taiko(r2), 'bd': bass_drum(r2)}
    for t, name, v in perc:
        v *= r2.uniform(0.92, 1.0)
        if name == 'snare': put(st['snare'], pan_mono(smp['snare'], 0.15), t + r2.normal(0, 0.003), v)
        elif name == 'taiko': put(st['taiko'], pan_mono(smp['taiko'], r2.uniform(-0.4, 0.4)), t, v)
        elif name == 'bd': put(st['bd'], pan_mono(smp['bd'], 0), t, v)
        elif name == 'crash': put(st['cym'], kit['crash'], t, v)
    return st


def main():
    t0 = time.time()
    print('rendering strings...', flush=True)
    stg = render_sustain(strings)
    vln = render_violins()
    sp = render_mono(spic, spiccato, 71)
    print('  %.1fs' % (time.time() - t0), flush=True)
    hn = render_mono(horns, lambda m, d, r: brass_note(m, d, r, attack=0.05, release=0.25, bright=0.35), 72)
    hn = onepole_lp(hn, 2200)
    tp = render_mono(trumpets, lambda m, d, r: brass_note(m, d, r, attack=0.03, release=0.18, bright=1.0), 73)
    lb = render_mono(lowbrass, lambda m, d, r: brass_note(m, d, r, attack=0.02, release=0.15, bright=0.8), 74)
    lb = onepole_lp(lb, 1500)
    fl = render_mono(flutes, flute, 75)
    gl = render_mono(glocks, glock, 76)
    ch = np.zeros(N); r2 = np.random.default_rng(77)
    for t, dur, notes, v in choir:
        for m in notes:
            put(ch, choir_note(m, dur, r2) * v, t)
    ch = filt(formant_ah(ch), 'hp', 180)
    ch = np.stack([ch, np.concatenate([np.zeros(int(0.015 * FS)), ch[:-int(0.015 * FS)]])], 1)
    tm = np.zeros(N); r3 = np.random.default_rng(78); cache = {}
    for t, m, v in timp:
        if m not in cache: cache[m] = timpani(float(mtof(m)), r3)
        put(tm, cache[m], t, v)
    pc = render_perc()
    fx = np.zeros((N, 2)); r4 = np.random.default_rng(79)
    for t, kind in fxs:
        if kind == 'impact': put(fx, pan_mono(impact(r4), 0), t, 0.8)
        elif kind == 'riser': put(fx, pan_mono(riser(2 * BAR, r4), 0), t, 0.5)
    print('  %.1fs' % (time.time() - t0), flush=True)

    # 絶対レベルで混ぜる (曲の盛り上がりをそのまま残すため、セクション毎の正規化はしない)
    def lvl(x, ref, db):
        return x / (ref + 1e-9) * 10 ** (db / 20)

    stems = {
        'strings': lvl(stg, active_rms(stg), -21),
        'violins': lvl(vln, active_rms(vln), -18),
        'spic': pan_mono(lvl(sp, active_rms(sp), -22), -0.25),
        'horns': pan_mono(lvl(hn, active_rms(hn), -19), -0.3),
        'trumpets': pan_mono(lvl(tp, active_rms(tp), -18), 0.25),
        'lowbrass': pan_mono(lvl(lb, active_rms(lb), -21), 0.1),
        'flutes': pan_mono(lvl(fl, active_rms(fl), -25), 0.35),
        'glock': pan_mono(lvl(gl, active_rms(gl), -29), 0.3),
        'choir': lvl(ch, active_rms(ch), -21),
        'timp': pan_mono(lvl(tm, active_rms(tm), -19), 0),
        'snare': lvl(pc['snare'], active_rms(pc['snare']), -24),
        'taiko': lvl(pc['taiko'], active_rms(pc['taiko']), -21),
        'bd': lvl(pc['bd'], active_rms(pc['bd']), -23.5),
        'cym': lvl(pc['cym'], active_rms(pc['cym']), -26),
        'fx': lvl(fx, active_rms(fx), -24),
    }
    # 大ホール
    sends = {'strings': 0.55, 'violins': 0.5, 'spic': 0.35, 'horns': 0.6, 'trumpets': 0.45, 'lowbrass': 0.45, 'flutes': 0.5,
             'glock': 0.5, 'choir': 0.7, 'timp': 0.5, 'snare': 0.35, 'taiko': 0.4, 'bd': 0.3, 'cym': 0.3, 'fx': 0.3}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 200), make_ir(3.4, np.random.default_rng(80), predelay=0.03)) * 0.6
    mix = sum(stems.values()) + rev
    mix = filt(mix, 'hp', 30, 0.7)
    mix = filt(mix, 'hs', 8000, 0.7, 1.5)
    mix = filt(mix, 'peak', 3000, 0.8, 1.5)
    mix = compress(mix, -16, 2.0, 0.02, 0.25)
    mix = mix / (active_rms(mix, pct=97) + 1e-9) * 10 ** (-11.0 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'stage3.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f  song=%.6f loop=%.6f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), SONG, LOOP_BAR * BAR))


if __name__ == '__main__':
    main()
