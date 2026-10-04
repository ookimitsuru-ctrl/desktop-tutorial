#!/usr/bin/env python3
"""WIRED ワープ面 (3面) BGM「HYPERDRIVE」(仮)

ドラムンベース / 174 BPM / A マイナー / 87 小節 = 120 秒 (ボス出現まで)
  0     ワープ突入: 上昇スイープ (ゲーム側の「星がギュイーンと伸びる」演出と同期)
  1- 8  イントロ: フィルターの掛かったブレイクビーツ + リース・ベース + アルペジオ
  9-24  ドロップ 1: フルのブレイク + ローリングするリース + フック (25 からは対旋律)
 25-32  ブレイクダウン: パッドとフック (キック抜き) → スネアロールのビルド
 33-48  ドロップ 2: フックをオクターブ上で + アーメン風の刻み
 49-56  ニューロ: リースの LFO を 8 分/16 分で揺らす、ハーフテンポ気味のキメ
 57-64  ビルド: 8 分 → 16 分 → 32 分のスネアロール、ライザー
 65-80  ラストドロップ: 全部乗せ
 81-86  ドライブ → フィルでドロップ 1 の頭へ (ループ)
ループ: 小節 9 (12.414 秒) 〜 120.0 秒
"""
import sys, os, time
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

BPM = 174
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 87
TAIL = 3.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)
LOOP_BAR = 9

rng = np.random.default_rng(174)


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
# 楽譜データ
# =====================================================================
drums = []    # (時刻, 名前, 強さ)
reese = []    # (時刻, 長さ, midi)
pads = []     # (時刻, 長さ, [midi], 強さ)
leads = []    # (時刻, 長さ, midi, 強さ)
arps = []     # (時刻, midi, 強さ)
stabs = []    # (時刻, [midi], 強さ)
fx = []       # (時刻, 種類, 長さ/強さ)
kicks = []

A1, F1, C2, G1 = 33, 29, 36, 31
PROG = [(A1, [57, 60, 64, 69]), (F1, [57, 60, 65, 69]), (C2, [55, 60, 64, 67]), (G1, [55, 59, 62, 67])]
# フック (2 小節 × 4 コード)
HOOK = [
    [(0, 3, 81), (3, 3, 84), (6, 2, 83), (8, 3, 81), (11, 3, 79), (14, 2, 76)],
    [(0, 6, 81), (6, 2, 79), (8, 8, 76)],
    [(0, 3, 77), (3, 3, 81), (6, 2, 84), (8, 3, 86), (11, 3, 84), (14, 2, 81)],
    [(0, 6, 84), (6, 2, 81), (8, 8, 77)],
    [(0, 3, 79), (3, 3, 84), (6, 2, 88), (8, 3, 86), (11, 3, 84), (14, 2, 79)],
    [(0, 6, 84), (6, 2, 86), (8, 8, 88)],
    [(0, 3, 86), (3, 3, 83), (6, 2, 79), (8, 3, 83), (11, 3, 86), (14, 2, 91)],
    [(0, 8, 88), (8, 8, 83)],
]
# 対旋律 (2 回目以降): 長い音で上から支える
COUNTER = [[(0, 16, 88)], [(0, 8, 86), (8, 8, 84)], [(0, 16, 84)], [(0, 8, 86), (8, 8, 88)],
           [(0, 16, 91)], [(0, 8, 88), (8, 8, 86)], [(0, 16, 86)], [(0, 8, 83), (8, 8, 86)]]
ARP_SHAPE = [0, 1, 2, 3, 2, 1, 3, 2, 0, 2, 1, 3, 2, 3, 1, 2]


def chord_of(bar):
    """奇数小節の頭からコードが変わる (1-2: Am, 3-4: F, ...)"""
    return PROG[((bar - 1) // 2) % 4]


# ---- ドラムパターン (16 分 16 ステップ) ----
def two_step(bar, var=0, ride=False, hat=True):
    """ドラムンベースの基本 (キック 1 拍目と 3 拍目裏, スネア 2・4 拍)"""
    ks = [0, 10] if var == 0 else [0, 2, 10, 11] if var == 1 else [0, 6, 10]
    for s in ks:
        drums.append((T(bar, s), 'kick', 1.0 if s == 0 else 0.9)); kicks.append(T(bar, s))
    for s in (4, 12): drums.append((T(bar, s), 'snare', 1.0))
    for s, v in ((7, 0.28), (9, 0.22), (15, 0.32)) if var != 2 else ((3, 0.25), (7, 0.3), (14, 0.35), (15, 0.4)):
        drums.append((T(bar, s), 'ghost', v))
    if hat:
        for s in range(0, 16, 2):
            drums.append((T(bar, s), 'hat', 0.75 if s % 4 == 2 else 0.5))
            drums.append((T(bar, s + 1), 'hat', 0.28))
        drums.append((T(bar, 14), 'ohat', 0.5))
    if ride:
        for s in range(0, 16, 4): drums.append((T(bar, s + 2), 'ride', 0.55))


def amen(bar):
    """アーメン・ブレイク風の刻み"""
    pat = [(0, 'kick', 1), (2, 'kick', 0.85), (4, 'snare', 1), (7, 'ghost', 0.4), (9, 'snare', 0.7),
           (10, 'kick', 0.95), (11, 'kick', 0.8), (12, 'snare', 1), (14, 'ghost', 0.5), (15, 'snare', 0.6)]
    for s, n, v in pat:
        drums.append((T(bar, s), n, v))
        if n == 'kick': kicks.append(T(bar, s))
    for s in range(0, 16, 2): drums.append((T(bar, s), 'ride', 0.45 if s % 4 else 0.6))


def fill(bar, start=8):
    for s in range(start, 16):
        drums.append((T(bar, s), 'snare', 0.45 + 0.5 * (s - start) / (16 - start)))
        if s % 2 == 0: drums.append((T(bar, s), 'tom' + str(1 + (s // 2) % 3), 0.6))


def snare_roll(bar0, nbars, div0, div1):
    """div: 1 小節の打数 (8 → 16 → 32)"""
    for k in range(nbars):
        div = int(div0 * (div1 / div0) ** (k / max(1, nbars - 1)))
        for i in range(div):
            u = (k + i / div) / nbars
            drums.append((T(bar0 + k) + i * BAR / div, 'snare', 0.35 + 0.6 * u))


def put_chord_bar(bar, rees=True, pad=0.0, arp=0.0, stab=0.0):
    root, ch = chord_of(bar)
    if rees and bar % 2 == 1:
        # リース: 2 小節伸ばし、2 小節目の後半でオクターブ跳躍
        reese.append((T(bar), BAR * 1.5, root + 12))
        reese.append((T(bar + 1, 8), STEP * 6, root + 24 if (bar - 1) % 4 == 0 else root + 12))
        reese.append((T(bar + 1, 14), STEP * 2, root + 19))
    if pad and bar % 2 == 1:
        pads.append((T(bar), BAR * 2, ch, pad))
    if arp:
        notes = sorted(ch) + [ch[0] + 12]
        for s in range(16):
            m = notes[ARP_SHAPE[s] % len(notes)] + 12
            arps.append((T(bar, s), m, arp * (1.0 if s % 4 == 0 else 0.7)))
    if stab:
        for s in (0, 3, 6, 10):
            stabs.append((T(bar, s), ch, stab))


def hook(bar0, nbars=8, octave=0, vel=1.0, counter=False):
    for k in range(nbars):
        for st, ln, m in HOOK[k % 8]:
            leads.append((T(bar0 + k, st), ln * STEP, m + octave, vel))
        if counter:
            for st, ln, m in COUNTER[k % 8]:
                leads.append((T(bar0 + k, st), ln * STEP, m - 12, vel * 0.45))


# ------------------------------------------------ 0: ワープ突入
fx.append((T(0), 'sweep', BAR))
fx.append((T(1), 'impact', 1.0))
drums.append((T(1), 'crash', 1.0))
# ------------------------------------------------ 1-8: イントロ (フィルター付きブレイク)
for b in range(1, 9):
    two_step(b, var=0, hat=b >= 3)
    put_chord_bar(b, arp=0.5 if b >= 5 else 0.0)
for b in range(1, 9, 2):
    pads.append((T(b), BAR * 2, chord_of(b)[1], 0.6))
fill(8, 8)
fx.append((T(7), 'riser', 2))
# ------------------------------------------------ 9-24: ドロップ 1
for k in range(16):
    b = 9 + k
    two_step(b, var=1 if k % 4 == 3 else 0, ride=k >= 8)
    put_chord_bar(b, rees=False, pad=0.0, arp=0.6 if k >= 8 else 0.0, stab=0.0)
    if k % 2 == 0: put_chord_bar(b)
    if k % 8 == 0: drums.append((T(b), 'crash', 1.0))
hook(9, 8)
hook(17, 8, counter=True)
fill(24, 12)
for k in range(16):
    if k % 2 == 0: pads.append((T(9 + k), BAR * 2, chord_of(9 + k)[1], 0.35))
# ------------------------------------------------ 25-32: ブレイクダウン
fx.append((T(25), 'impact', 0.8))
drums.append((T(25), 'crash', 0.9))
for k in range(8):
    b = 25 + k
    if b % 2 == 1: pads.append((T(b), BAR * 2, chord_of(b)[1], 0.9))
    for s in range(0, 16, 2): drums.append((T(b, s), 'hat', 0.25 + 0.03 * k))
    if k >= 4:
        for s in range(16): arps.append((T(b, s), sorted(chord_of(b)[1])[ARP_SHAPE[s] % 4] + 12, 0.3 + 0.08 * (k - 4)))
for k in range(8):   # フックを半分の速さで (8 分 → 長い音)
    for st, ln, m in HOOK[k % 8][:3]:
        leads.append((T(25 + k, st * 2 if st * 2 < 16 else st), min(ln * 2, 16 - st) * STEP, m, 0.55))
snare_roll(29, 4, 4, 32)
fx.append((T(29), 'riser', 4))
reese.append((T(31), BAR, 45))
# ------------------------------------------------ 33-48: ドロップ 2
for k in range(16):
    b = 33 + k
    if k % 4 == 3: amen(b)
    else: two_step(b, var=2 if k % 2 else 0, ride=True)
    if k % 2 == 0: put_chord_bar(b)
    put_chord_bar(b, rees=False, arp=0.55, stab=0.0)
    if k % 2 == 0: pads.append((T(b), BAR * 2, chord_of(b)[1], 0.4))
    if k % 8 == 0: drums.append((T(b), 'crash', 1.0))
hook(33, 8, octave=0, vel=1.0, counter=True)
hook(41, 8, octave=12, vel=0.9, counter=True)
fx.append((T(33), 'impact', 1.0))
fill(48, 8)
# ------------------------------------------------ 49-56: ニューロ
NEURO = [(0, 3, 33), (3, 3, 45), (6, 2, 43), (8, 2, 33), (10, 3, 41), (13, 3, 40)]
for k in range(8):
    b = 49 + k
    if k % 2 == 0: amen(b)
    else: two_step(b, var=1, ride=False)
    off = [0, 0, -4, -2][(k // 2) % 4]
    for st, ln, m in NEURO:
        reese.append((T(b, st), ln * STEP * 0.95, m + off + 12))
    stabs.append((T(b, 0), chord_of(2 * ((k // 2) % 4) + 1)[1], 0.9))
    stabs.append((T(b, 10), chord_of(2 * ((k // 2) % 4) + 1)[1], 0.6))
    if k % 4 == 0: drums.append((T(b), 'china', 0.9))
fx.append((T(49), 'impact', 0.9))
# ------------------------------------------------ 57-64: ビルド
for k in range(8):
    b = 57 + k
    if k % 2 == 0: pads.append((T(b), BAR * 2, chord_of(b)[1], 0.5 + 0.06 * k))
    put_chord_bar(b, rees=False, arp=0.4 + 0.06 * k)
    for s in (0, 8): drums.append((T(b, s), 'kick', 0.8)); kicks.append(T(b, s))
for k in range(4):
    for st, ln, m in HOOK[k]:
        leads.append((T(57 + k, st), ln * STEP, m, 0.6))
snare_roll(61, 4, 8, 32)
fx.append((T(57), 'riser', 8))
reese.append((T(64), BAR * 0.5, 45))
# ------------------------------------------------ 65-80: ラストドロップ
for k in range(16):
    b = 65 + k
    if k % 4 == 3: amen(b)
    else: two_step(b, var=k % 2, ride=True)
    if k % 2 == 0: put_chord_bar(b, pad=0.45)
    put_chord_bar(b, rees=False, arp=0.6, stab=0.55 if k % 2 else 0.0)
    if k % 4 == 0: drums.append((T(b), 'crash', 1.0))
hook(65, 8, octave=12, vel=1.0, counter=True)
hook(73, 8, octave=12, vel=1.0, counter=True)
fx.append((T(65), 'impact', 1.1))
# ------------------------------------------------ 81-86: ドライブ → ループ (ドロップ 1 頭へ)
for k in range(6):
    b = 81 + k
    amen(b) if k % 2 else two_step(b, var=1, ride=True)
    if k % 2 == 0: put_chord_bar(b, pad=0.4)
    put_chord_bar(b, rees=False, arp=0.6)
hook(81, 6, octave=0, vel=0.85)
snare_roll(85, 2, 16, 32)
fx.append((T(85), 'riser', 2))


# =====================================================================
# 音色・レンダリング
# =====================================================================
def kick_dnb():
    n = int(0.35 * FS); t = np.arange(n) / FS
    f = 50 + 150 * np.exp(-t / 0.022) + 60 * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * np.cumsum(f) / FS) * np.exp(-t / 0.13)
    click = filt(rng.uniform(-1, 1, n), 'hp', 3500) * np.exp(-t / 0.0015) * 0.7
    k = np.tanh((body + click) * 2.0) / np.tanh(2.0)
    return filt(k, 'hp', 35)


def snare_dnb(kit):
    n = int(0.35 * FS); t = np.arange(n) / FS
    body = np.sin(2 * np.pi * np.cumsum(230 + 90 * np.exp(-t / 0.008)) / FS) * np.exp(-t / 0.06)
    nz = filt(filt(rng.uniform(-1, 1, n), 'hp', 1800), 'peak', 5000, 1.0, 4) * np.exp(-t / 0.11)
    s = body * 0.8 + nz * 0.9
    s = s / np.max(np.abs(s))
    s = np.tanh(s * 1.8) / np.tanh(1.8)
    m = np.zeros(max(n, len(kit['snare'])))
    m[:n] += s
    m[:len(kit['snare'])] += kit['snare'] * 0.45
    return m / np.max(np.abs(m))


def render_drums(kit):
    st = {k: np.zeros((N, 2)) for k in ('kick', 'snare', 'hats', 'cym', 'toms')}
    smp = {'kick': kick_dnb(), 'snare': snare_dnb(kit)}
    ghost = filt(smp['snare'], 'hp', 900) * 0.8
    r2 = np.random.default_rng(31)
    for t, name, vel in drums:
        v = vel * r2.uniform(0.93, 1.0)
        tt = t + r2.normal(0, 0.0015)
        if name == 'kick': put(st['kick'], pan_mono(smp['kick'], 0), tt, v)
        elif name == 'snare': put(st['snare'], pan_mono(smp['snare'], 0.03), tt, v)
        elif name == 'ghost': put(st['snare'], pan_mono(ghost, -0.1), tt, v)
        elif name in ('hat', 'ohat'): put(st['hats'], pan_mono(kit[name], 0.35 if name == 'hat' else -0.35), tt, v)
        elif name.startswith('tom'): put(st['toms'], pan_mono(kit[name], {'tom1': -0.4, 'tom2': 0, 'tom3': 0.4}[name]), tt, v)
        else: put(st['cym'], kit[name], tt, v * (0.7 if name == 'ride' else 1.0))
    return st


def render_reese():
    """リース・ベース: デチューンしたノコギリ 3 本 → LFO で動くローパス → 歪み。サブは別系統のサイン"""
    freq = np.zeros(N); gate = np.zeros(N)
    for t, dur, m in reese:
        s = int(t * FS); e = min(N, int((t + dur) * FS))
        freq[s:e] = float(mtof(m))
        n = e - s
        g = np.ones(n); a = min(n, int(0.004 * FS)); r = min(n, int(0.02 * FS))
        g[:a] = np.linspace(0, 1, a); g[-r:] *= np.linspace(1, 0, r)
        gate[s:e] = np.maximum(gate[s:e], g)
    # 音程の途切れを前の値で埋める (グライド用)
    fill_idx = np.maximum.accumulate(np.where(freq > 0, np.arange(N), 0))
    freq = freq[fill_idx]
    freq[freq <= 0] = 55.0
    freq = onepole_lp(freq, 60)   # 軽いポルタメント
    osc = (polyblep_saw(freq * 2 ** (-14 / 1200)) + polyblep_saw(freq * 2 ** (13 / 1200), 0.33)
           + polyblep_saw(freq * 0.5 * 2 ** (3 / 1200), 0.71) * 0.6) * gate
    tsec = np.arange(N) / FS
    bars = tsec / BAR
    # カットオフ: 基本の動き + ニューロ区間は 8 分/16 分の LFO
    lfo_slow = 0.5 + 0.5 * np.sin(2 * np.pi * tsec / (BAR * 2))
    # ニューロ区間: 8 分 (前半) → 16 分 (後半) で開閉
    rate = np.where(bars < 53, STEP * 2, STEP)
    lfo_fast = np.where((bars >= 49) & (bars < 57), np.abs(np.sin(np.pi * tsec / rate)), 0)
    base = np.interp(bars, [0, 1, 9, 25, 33, 49, 57, 65, 87], [200, 260, 520, 420, 600, 500, 450, 650, 650])
    fc = base * (1 + 1.4 * lfo_slow) + lfo_fast * 2200
    out = np.zeros(N)
    blk = 64
    zi1 = np.zeros(2); zi2 = np.zeros(2)
    for i in range(0, N, blk):
        seg = osc[i:i + blk]
        b1, a1 = biquad('lp', min(float(fc[i]), 12000), 2.2)
        y, zi1 = signal.lfilter(b1, a1, seg, zi=zi1)
        b2, a2 = biquad('lp', min(float(fc[i]) * 1.5, 14000), 0.7)
        y, zi2 = signal.lfilter(b2, a2, y, zi=zi2)
        out[i:i + blk] = y
    mid = np.tanh(out * 2.6) / np.tanh(2.6)
    mid = filt(filt(mid, 'hp', 140, 0.7), 'peak', 900, 1.0, 3)
    # サブ (1 オクターブ下のサイン)
    ph = 2 * np.pi * np.cumsum(freq * 0.5) / FS
    sub = np.sin(ph) * gate
    sub = filt(np.tanh(sub * 1.3), 'lp', 110, 0.7)
    return mid, sub


def render_pads():
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(22)
    for t, dur, ch, v in pads:
        for m in ch:
            put(out, supersaw(m, dur, r2, voices=5, spread=20, attack=0.25, release=0.6) * v, t)
    return filt(filt(out, 'lp', 3200, 0.7), 'hp', 200)


def render_lead():
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(23)
    for t, dur, m, v in leads:
        y = supersaw(m, dur, r2, voices=7, spread=22, vib=0.05, attack=0.006, release=0.14)
        y += supersaw(m + 12, dur, r2, voices=3, spread=10, vib=0.03, attack=0.006, release=0.14) * 0.25
        put(out, y * v, t)
    x = filt(out, 'lp', 7000, 0.7)
    return filt(x, 'hp', 300)


def render_arp():
    out = np.zeros(N)
    for t, m, v in arps:
        n = int(0.16 * FS); tt = np.arange(n) / FS
        f = float(mtof(m))
        s = np.sign(np.sin(2 * np.pi * f * tt)) * 0.45 + polyblep_saw(np.full(n, f * 1.005)) * 0.55
        s = onepole_lp(s, 3800) * np.exp(-tt / 0.05)
        put(out, s * v, t)
    return filt(out, 'hp', 400)


def render_stabs():
    out = np.zeros(N)
    r2 = np.random.default_rng(24)
    for t, ch, v in stabs:
        n = int(0.3 * FS); tt = np.arange(n) / FS
        s = np.zeros(n)
        for m in ch:
            f = float(mtof(m + 12))
            s += polyblep_saw(np.full(n, f * 2 ** (r2.normal(0, 5) / 1200)))
        s = onepole_lp(onepole_lp(s, 2600), 3600) * np.exp(-tt / 0.06)
        put(out, s / len(ch) * v, t)
    return filt(out, 'hp', 250)


def sweep(dur):
    """ワープ突入の「ギュイーン」: 上昇するノコギリ + ノイズ、最後に開き切る"""
    n = int(dur * FS); t = np.arange(n) / FS
    u = t / dur
    f = 60 * (40 ** (u ** 1.6))
    s = polyblep_saw(f) * 0.6 + polyblep_saw(f * 1.5 * 1.004) * 0.35
    nz = rng.uniform(-1, 1, n)
    out = np.zeros(n)
    blk = 256
    # 可変ローパスをブロックで (状態を引き継ぐ)
    zi = np.zeros(2); x = s + nz * 0.4
    for i in range(0, n, blk):
        b1, a1 = biquad('lp', 300 + 12000 * u[i] ** 2, 3.0)
        out[i:i + blk], zi = signal.lfilter(b1, a1, x[i:i + blk], zi=zi)
    out *= u ** 1.3
    return np.tanh(out * 1.5)


def render_fx(kit):
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(41)
    for t, kind, v in fx:
        if kind == 'impact': put(out, pan_mono(impact(r2), 0), t, v)
        elif kind == 'riser': put(out, pan_mono(riser(v * BAR, r2), 0), t, 0.7)
        elif kind == 'sweep':
            sw = sweep(v)
            st = np.stack([sw, np.roll(sw, int(0.004 * FS))], 1)
            put(out, st, t, 1.2)
    return out


def sidechain(depth=0.5, rel=0.1):
    g = np.ones(N)
    L = int(0.3 * FS); curve = 1 - depth * np.exp(-np.arange(L) / (rel * FS))
    curve[:int(0.003 * FS)] = np.linspace(1, curve[int(0.003 * FS)], int(0.003 * FS))
    for t in kicks:
        i = int(t * FS)
        if i >= N: continue
        ln = min(L, N - i)
        g[i:i + ln] = np.minimum(g[i:i + ln], curve[:ln])
    return g


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(3))
    print('rendering reese...', flush=True)
    rm, rs = render_reese()
    print('  %.1fs' % (time.time() - t0), flush=True)
    pd = render_pads(); ld = render_lead(); ap = render_arp(); sb = render_stabs()
    dr = render_drums(kit); fxs = render_fx(kit)
    print('  %.1fs' % (time.time() - t0), flush=True)
    sc = sidechain()[:, None]

    def norm(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'kick': norm(dr['kick'], -17.5),
        'snare': norm(dr['snare'], -16),
        'hats': norm(dr['hats'], -23),
        'cym': norm(dr['cym'], -25),
        'toms': norm(dr['toms'], -21),
        'reese': pan_mono(norm(rm, -19), 0) * sc ** 0.6,
        'sub': pan_mono(norm(rs, -18.5), 0) * sc,
        'pads': norm(pd, -23) * sc,
        'lead': norm(ld, -17) * sc ** 0.3,
        'arp': pan_mono(norm(ap, -24), -0.25) * sc ** 0.5,
        'stabs': pan_mono(norm(sb, -22), 0.2) * sc ** 0.5,
        'fx': norm(fxs, -21),
    }
    stems['arp'] = stems['arp'] + delay_st(stems['arp'], STEP * 3, STEP * 2, fb=0.4, mix=0.4)
    stems['lead'] = stems['lead'] + delay_st(stems['lead'], STEP * 3, STEP * 3, fb=0.3, mix=0.22, lp=4500)
    stems['stabs'] = stems['stabs'] + delay_st(stems['stabs'], STEP * 3, STEP * 4, fb=0.45, mix=0.5, lp=2500)
    sends = {'snare': 0.12, 'pads': 0.45, 'lead': 0.3, 'arp': 0.3, 'stabs': 0.35, 'fx': 0.3}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 300), make_ir(2.4, np.random.default_rng(9))) * 0.45
    mix = sum(stems.values()) + rev

    # イントロ (1-8 小節) はドラムに軽くローパス → 開いていく
    s0, s1 = int(T(1) * FS), int(T(9) * FS)
    seg = mix[s0:s1]
    lp = filt(seg, 'lp', 1200, 0.8)
    w = np.linspace(0, 1, s1 - s0)[:, None] ** 2
    mix[s0:s1] = lp * (1 - w) + seg * w

    mix = filt(mix, 'hp', 28, 0.7)
    mix = filt(mix, 'hs', 8000, 0.7, 1.0)
    mix = compress(mix, -14, 2.5, 0.01, 0.15)
    mix = mix / (active_rms(mix, pct=95) + 1e-9) * 10 ** (-10.0 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'warp.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f  song=%.6f loop=%.6f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), SONG, LOOP_BAR * BAR))


if __name__ == '__main__':
    main()
