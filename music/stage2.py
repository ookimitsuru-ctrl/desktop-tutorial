#!/usr/bin/env python3
"""WIRED ステージ2 BGM「TRENCH PROTOCOL」(仮)

ダーク/ハードテクノ / 140 BPM / F マイナー / 70 小節 = 120 秒 (ボス出現まで)
  0- 7  イントロ: キック + フィルターが開いていくハット/アトモス
  8-15  グルーヴ: 4つ打ち + ローリングベース + クラップ
 16-23  アシッド (TB-303 風) 登場、カットオフが徐々に開く
 24-31  ピーク: ダブテクノのコードスタブ + オープンハット
 32-39  ブレイク: キック抜き、パッド + フックのメロディ → スネアロールのビルド
 40-55  ドロップ: 全部乗せ + フック + アシッド全開 (48 からパターン変化)
 56-63  2 回目のビルド: スタッター、ライザー、上昇するアシッド
 64-69  ラストドライブ → フィルでグルーヴ頭へ (ループ可能)
ループ: 小節 8 (13.714 秒) 〜 120.0 秒
"""
import sys, os, time
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa

BPM = 140
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 70
TAIL = 3.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)
LOOP_BAR = 8

rng = np.random.default_rng(140)


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


def sec(bar):
    """小節 → セクション名"""
    if bar < 8: return 'intro'
    if bar < 16: return 'groove'
    if bar < 24: return 'acid'
    if bar < 32: return 'peak'
    if bar < 40: return 'break'
    if bar < 56: return 'drop'
    if bar < 64: return 'build2'
    return 'final'


# =====================================================================
# 音色
# =====================================================================
def kick909():
    n = int(0.5 * FS); t = np.arange(n) / FS
    f = 47 + 120 * np.exp(-t / 0.032) + 40 * np.exp(-t / 0.006)
    body = np.sin(2 * np.pi * np.cumsum(f) / FS) * np.exp(-t / 0.26)
    click = filt(rng.uniform(-1, 1, n), 'hp', 3000) * np.exp(-t / 0.0015) * 0.6
    k = np.tanh((body + click) * 1.8) / np.tanh(1.8)
    return filt(k, 'hp', 32)


def clap():
    n = int(0.45 * FS); t = np.arange(n) / FS
    nz = filt(filt(rng.uniform(-1, 1, n), 'bp', 1300, 0.9), 'hp', 700)
    env = np.zeros(n)
    for k, d in enumerate((0.0, 0.009, 0.018, 0.028)):
        tt = t - d
        env += np.where(tt >= 0, np.exp(-np.maximum(tt, 0) / (0.007 if k < 3 else 0.12)), 0)
    c = nz * env
    return c / np.max(np.abs(c))


def rim():
    n = int(0.1 * FS); t = np.arange(n) / FS
    r = np.sin(2 * np.pi * 1750 * t) * np.exp(-t / 0.012) + filt(rng.uniform(-1, 1, n), 'hp', 4000) * np.exp(-t / 0.004)
    return r / np.max(np.abs(r))


def snare_t():
    n = int(0.3 * FS); t = np.arange(n) / FS
    s = np.sin(2 * np.pi * 200 * t) * np.exp(-t / 0.05) * 0.6 + filt(rng.uniform(-1, 1, n), 'hp', 1800) * np.exp(-t / 0.09)
    return s / np.max(np.abs(s))


# =====================================================================
# 楽譜データ
# =====================================================================
F1, Db1, Ab1, Eb1 = 29, 25, 32, 27
drums = []      # (時刻, 名前, 強さ)
bass = []       # (時刻, 長さ, midi, 強さ)
acid = []       # (時刻, 長さ, midi, accent, slide)
stabs = []      # (時刻, [midi])
pads = []       # (時刻, 長さ, [midi], 強さ)
leads = []      # (時刻, 長さ, midi)
arps = []       # (時刻, midi, 強さ)
fx = []         # (時刻, 種類, 強さ)
kicks = []      # サイドチェイン用のキック時刻

# アシッドのパターン (16 ステップ): (半音, アクセント, スライド) / None=休符
P1 = [(0, 1, 0), (0, 0, 0), (12, 0, 1), (0, 0, 0), (3, 0, 0), None, (15, 1, 0), (0, 0, 0),
      (0, 0, 0), (10, 0, 1), (12, 1, 0), (0, 0, 0), (7, 0, 0), None, (5, 0, 1), (3, 1, 0)]
P2 = [(0, 1, 0), (12, 0, 0), (0, 0, 1), (13, 0, 0), (0, 0, 0), (10, 1, 0), None, (8, 0, 1),
      (7, 0, 0), (0, 1, 0), (12, 0, 0), None, (3, 0, 1), (5, 1, 0), (7, 0, 0), (15, 1, 0)]

# 4 小節のコード進行 (ブレイク/ドロップ): Fm - Db - Ab - Eb
PROG = [(F1, [53, 56, 60, 63]), (Db1, [49, 53, 56, 60]), (Ab1, [56, 60, 63, 67]), (Eb1, [51, 55, 58, 62])]
# フック (4 小節, F マイナー)
HOOK = [
    [(0, 3, 84), (3, 3, 80), (6, 2, 77), (8, 2, 79), (10, 2, 80), (12, 4, 82)],
    [(0, 3, 84), (3, 3, 87), (6, 2, 85), (8, 4, 84), (12, 2, 82), (14, 2, 80)],
    [(0, 3, 84), (3, 3, 80), (6, 2, 77), (8, 2, 79), (10, 2, 80), (12, 4, 82)],
    [(0, 6, 79), (6, 2, 80), (8, 8, 77)],
]
# 催眠的なアルペジオ (ドロップ)
ARP = [65, 68, 72, 75, 72, 68, 77, 72]

for bar in range(NBARS):
    s = sec(bar)
    k4 = s not in ('break',) and not (bar == 63)
    # --- キック
    if k4:
        for st in (0, 4, 8, 12):
            if bar == 69 and st == 12: continue
            drums.append((T(bar, st), 'kick', 1.0)); kicks.append(T(bar, st))
    if s == 'break' and bar >= 36:  # ビルド後半はキックが戻ってくる (4分 → 8分)
        stp = 4 if bar < 38 else 2
        for st in range(0, 16, stp):
            drums.append((T(bar, st), 'kick', 0.5 + 0.5 * (bar - 36) / 4)); kicks.append(T(bar, st))
    # --- ハット
    if s == 'intro':
        for st in range(2, 16, 4): drums.append((T(bar, st), 'hat', 0.3 + 0.5 * bar / 8))
        if bar >= 4:
            for st in range(0, 16, 2): drums.append((T(bar, st), 'hat', 0.25))
    elif s != 'break' or bar >= 38:
        for st in range(16):
            v = 0.85 if st % 4 == 2 else (0.35 if st % 2 else 0.5)
            drums.append((T(bar, st), 'hat', v))
        if s in ('peak', 'drop', 'final', 'build2'):
            for st in (2, 6, 10, 14): drums.append((T(bar, st), 'ohat', 0.6))
        if s in ('drop', 'final') and bar >= 48:
            for st in range(0, 16, 2): drums.append((T(bar, st), 'ride', 0.45))
    # --- クラップ / リム
    if s in ('groove', 'acid', 'peak', 'drop', 'final', 'build2'):
        for st in (4, 12): drums.append((T(bar, st), 'clap', 1.0))
        for st in (3, 7, 14): drums.append((T(bar, st), 'rim', 0.55))
    if s == 'intro' and bar >= 6:
        drums.append((T(bar, 12), 'clap', 0.5))
    # --- ローリングベース (キックの間の 16 分)
    if s in ('groove', 'acid', 'peak', 'drop', 'final', 'build2') or (s == 'intro' and bar >= 6):
        root = PROG[bar % 4][0] if s in ('drop', 'final') else F1
        for b in range(4):
            for st in (1, 2, 3):
                v = 0.7 if st == 2 else 0.9
                if s == 'intro': v *= 0.5
                bass.append((T(bar, b * 4 + st), STEP * 0.85, root + (12 if (st == 3 and b == 3) else 0), v))
    # --- アシッド
    if s in ('acid', 'peak', 'drop', 'final', 'build2') or (s == 'intro' and bar >= 4):
        pat = P2 if (s in ('drop', 'final') and bar >= 48) or s == 'final' else P1
        tr = 0
        if s == 'build2': tr = (bar - 56) // 2  # ビルドで半音ずつ上昇
        if s in ('drop', 'final'): tr = PROG[bar % 4][0] - F1 if bar % 8 >= 4 else 0
        for st, p in enumerate(pat):
            if p is None: continue
            semi, acc, sl = p
            acid.append((T(bar, st), STEP, 41 + semi + tr, acc, sl))
    # --- スタブ
    if s in ('peak', 'drop', 'final'):
        ch = [53, 56, 60, 63] if s == 'peak' else PROG[bar % 4][1]
        for st in (2, 6, 10, 14):
            if s == 'peak' and st == 14 and bar % 2: continue
            stabs.append((T(bar, st), ch))
    # --- パッド
    if s in ('break', 'drop'):
        r, ch = PROG[bar % 4]
        pads.append((T(bar), BAR, [ch[0] - 12, ch[0], ch[1], ch[2], ch[3]], 0.9 if s == 'break' else 0.55))
    if s == 'intro':
        pads.append((T(bar), BAR, [41, 48, 53], 0.25 + 0.04 * bar))
    # --- フック
    if (s == 'break' and bar < 38) or s in ('drop',) or (s == 'final' and bar < 68):
        for st, ln, m in HOOK[bar % 4]:
            leads.append((T(bar, st), ln * STEP, m))
    # --- アルペジオ
    if s in ('drop', 'build2', 'final'):
        for st in range(16):
            arps.append((T(bar, st), ARP[st % 8] + (12 if st >= 8 and bar % 2 else 0), 0.55 + 0.45 * (st % 4 == 0)))

# クラッシュ / FX
for b in (8, 16, 24, 40, 48, 64):
    drums.append((T(b), 'crash', 1.0)); fx.append((T(b), 'impact', 0.8 if b in (40, 64) else 0.4))
for b in (31, 39, 63):
    fx.append((T(b), 'revcym', 1.0))
fx.append((T(36), 'riser', 4))      # 4 小節のライザー
fx.append((T(60), 'riser', 4))
fx.append((T(14), 'riser', 2))
fx.append((T(22), 'riser', 2))
# スネアロール (ブレイク後半 / ビルド2)
for b in range(36, 40):
    stp = {36: 4, 37: 2, 38: 1, 39: 1}[b]
    for st in range(0, 16, stp):
        if b == 39 and st >= 12: continue
        drums.append((T(b, st), 'snare', 0.4 + 0.6 * ((b - 36) * 16 + st) / 64))
for b in range(60, 64):
    stp = {60: 4, 61: 2, 62: 1, 63: 1}[b]
    for st in range(0, 16, stp):
        drums.append((T(b, st), 'snare', 0.4 + 0.6 * ((b - 60) * 16 + st) / 64))
# ラストのフィル (ループ頭へ)
for st in range(12, 16):
    drums.append((T(69, st), 'snare', 0.8 + 0.05 * (st - 12)))


# =====================================================================
# レンダリング
# =====================================================================
def render_acid():
    """TB-303 風: ノコギリ波 → 共振ローパス (カットオフをブロック毎に更新) → 歪み"""
    freq = np.zeros(N); amp = np.zeros(N); envc = np.zeros(N); accn = np.zeros(N)
    prev = None
    for t, dur, m, acc, sl in acid:
        s = int(t * FS); e = min(N, int((t + dur) * FS))
        f0 = float(mtof(m))
        glide = prev is not None and prev[4] and abs(prev[0] + prev[1] - t) < 1e-3
        n = e - s
        tt = np.arange(n) / FS
        if glide:
            pf = float(mtof(prev[2]))
            freq[s:e] = f0 * (pf / f0) ** np.exp(-tt / 0.045)
            # エンベロープは継続 (再トリガーしない)
            a0 = amp[s - 1] if s > 0 else 0.8; c0 = envc[s - 1] if s > 0 else 0.5
            amp[s:e] = a0; envc[s:e] = c0 * np.exp(-tt / 0.3)
        else:
            freq[s:e] = f0
            amp[s:e] = (0.75 + 0.35 * acc) * np.minimum(1, tt / 0.002) * np.exp(-tt / (0.5 if acc else 0.9))
            envc[s:e] = (1.0 + 0.7 * acc) * np.exp(-tt / (0.12 if acc else 0.2))
        gl = int((dur * (1.0 if sl else 0.62)) * FS)
        amp[s + gl:e] *= np.exp(-np.arange(e - s - gl) / (0.004 * FS)) if e - s - gl > 0 else 1
        accn[s:e] = acc
        prev = (t, dur, m, acc, sl)
    freq = np.where(freq > 0, freq, 40.0)
    osc = polyblep_saw(freq) * amp
    # カットオフのオートメーション (セクション毎に開いていく)
    tsec = np.arange(N) / FS
    bars = tsec / BAR
    base = np.interp(bars, [0, 4, 8, 16, 24, 32, 40, 48, 56, 64, 70], [150, 150, 180, 220, 700, 900, 900, 1300, 700, 2200, 1800])
    fc = base * (1 + 5.5 * envc)
    q = np.interp(bars, [0, 16, 24, 40, 56, 64, 70], [6, 8, 11, 12, 10, 14, 13])
    out = np.zeros(N)
    blk = 64
    zi1 = np.zeros(2); zi2 = np.zeros(2)
    for i in range(0, N, blk):
        seg = osc[i:i + blk]
        if not seg.any() and not zi1.any():
            continue
        b1, a1 = biquad('lp', min(float(fc[i]), 14000), float(q[i]))
        y, zi1 = signal.lfilter(b1, a1, seg, zi=zi1)
        b2, a2 = biquad('lp', min(float(fc[i]) * 1.3, 16000), 0.6)
        y, zi2 = signal.lfilter(b2, a2, y, zi=zi2)
        out[i:i + blk] = y
        if np.max(np.abs(zi1)) < 1e-7 and not seg.any():
            zi1[:] = 0; zi2[:] = 0
    out = np.tanh(out * 2.2) / np.tanh(2.2)
    return filt(out, 'hp', 60)


def render_bass():
    out = np.zeros(N)
    for t, dur, m, v in bass:
        n = int((dur + 0.02) * FS); tt = np.arange(n) / FS
        f = float(mtof(m))
        s = polyblep_saw(np.full(n, f)) * 0.7 + np.sin(2 * np.pi * f * tt) * 0.45
        env = np.minimum(1, tt / 0.002) * np.exp(-tt / 0.09)
        env[int(dur * FS):] *= np.exp(-np.arange(n - int(dur * FS)) / (0.004 * FS))
        put(out, s * env * v, t)
    x = filt(out, 'lp', 520, 1.2)
    return np.tanh(x * 1.5) / np.tanh(1.5)


def render_stabs():
    out = np.zeros(N)
    r2 = np.random.default_rng(21)
    for t, ch in stabs:
        n = int(0.4 * FS); tt = np.arange(n) / FS
        s = np.zeros(n)
        for m in ch:
            f = float(mtof(m))
            s += polyblep_saw(np.full(n, f * 2 ** (r2.normal(0, 4) / 1200))) * 0.6 + np.sign(np.sin(2 * np.pi * f * 1.002 * tt)) * 0.3
        s = onepole_lp(onepole_lp(s, 1700), 2600) * np.exp(-tt / 0.07)
        put(out, s / len(ch), t)
    return filt(out, 'hp', 180)


def render_pads():
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(22)
    for t, dur, ch, v in pads:
        for m in ch:
            put(out, supersaw(m, dur, r2, voices=5, spread=18, attack=0.5, release=0.8) * v, t)
    x = filt(out, 'lp', 1900, 0.7)
    return filt(x, 'hp', 120)


def render_lead():
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(23)
    for t, dur, m in leads:
        y = supersaw(m, dur, r2, voices=7, spread=24, vib=0.04, attack=0.008, release=0.18)
        y += supersaw(m - 12, dur, r2, voices=3, spread=10, vib=0.03, attack=0.008, release=0.18) * 0.5
        put(out, y, t)
    x = filt(out, 'lp', 6500, 0.7)
    return filt(x, 'hp', 250)


def render_arp():
    out = np.zeros(N)
    for t, m, v in arps:
        n = int(0.2 * FS); tt = np.arange(n) / FS
        f = float(mtof(m))
        s = np.sign(np.sin(2 * np.pi * f * tt)) * 0.5 + polyblep_saw(np.full(n, f * 1.004)) * 0.5
        s = onepole_lp(s, 3200) * np.exp(-tt / 0.06)
        put(out, s * v, t)
    return filt(out, 'hp', 300)


def render_drums(kit):
    st = {k: np.zeros((N, 2)) for k in ('kick', 'clap', 'hats', 'perc', 'cym')}
    smp = {'kick': kick909(), 'clap': clap(), 'rim': rim(), 'snare': snare_t()}
    r2 = np.random.default_rng(31)
    for t, name, vel in drums:
        v = vel * r2.uniform(0.94, 1.0)
        if name == 'kick': put(st['kick'], pan_mono(smp['kick'], 0), t, v)
        elif name in ('clap', 'snare'): put(st['clap'], pan_mono(smp[name], 0 if name == 'clap' else 0.1), t, v)
        elif name == 'rim': put(st['perc'], pan_mono(smp['rim'], -0.35), t, v)
        elif name in ('hat', 'ohat'): put(st['hats'], pan_mono(kit[name], 0.45 if name == 'hat' else -0.45), t, v)
        else: put(st['cym'], kit[name], t, v * (0.75 if name == 'ride' else 1.0))
    return st


def render_fx(kit):
    out = np.zeros((N, 2))
    r2 = np.random.default_rng(41)
    for t, kind, v in fx:
        if kind == 'impact': put(out, pan_mono(impact(r2), 0), t, v)
        elif kind == 'revcym': put(out, kit['revcym'], t - (len(kit['revcym']) / FS - BAR), 0.6)
        elif kind == 'riser': put(out, pan_mono(riser(v * BAR, r2), 0), t, 0.6)
    return out


def sidechain(depth=0.65, rel=0.13):
    g = np.ones(N)
    L = int(0.4 * FS); curve = 1 - depth * np.exp(-np.arange(L) / (rel * FS))
    curve[:int(0.004 * FS)] = np.linspace(1, curve[int(0.004 * FS)], int(0.004 * FS))
    for t in kicks:
        i = int(t * FS)
        if i >= N: continue
        ln = min(L, N - i)
        g[i:i + ln] = np.minimum(g[i:i + ln], curve[:ln])
    return g


def stutter(x, bar):
    """ビルド末尾: 最後の 2 拍を 16 分のスライスで刻む"""
    s0 = int(T(bar, 8) * FS); sl = int(STEP * FS)
    src = x[s0:s0 + sl].copy()
    for k in range(8):
        i = s0 + k * sl
        fade = np.ones(sl); fade[-64:] = np.linspace(1, 0, 64)
        x[i:i + sl] = src * fade[:, None] * (0.6 + 0.4 * k / 7)
    return x


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(2))
    print('rendering acid...', flush=True)
    ac = render_acid()
    print('  %.1fs' % (time.time() - t0), flush=True)
    bs = render_bass(); stb = render_stabs(); pd = render_pads(); ld = render_lead(); ap = render_arp()
    dr = render_drums(kit); fxs = render_fx(kit)
    print('  %.1fs' % (time.time() - t0), flush=True)
    sc = sidechain()[:, None]

    def norm(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'kick': norm(dr['kick'], -17.5),
        'clap': norm(dr['clap'], -18),
        'hats': norm(dr['hats'], -21),
        'perc': norm(dr['perc'], -25),
        'cym': norm(dr['cym'], -24),
        'bass': pan_mono(norm(bs, -21.5), 0) * sc,
        'acid': pan_mono(norm(ac, -17), 0.05) * sc ** 0.7,
        'stabs': pan_mono(norm(stb, -21), -0.1) * sc,
        'pads': norm(pd, -23) * sc,
        'lead': norm(ld, -17.5) * sc ** 0.4,
        'arp': pan_mono(norm(ap, -24), 0.2) * sc ** 0.6,
        'fx': norm(fxs, -24),
    }
    stems['stabs'] = stems['stabs'] + delay_st(stems['stabs'], STEP * 3, STEP * 4, fb=0.55, mix=0.6, lp=2200)
    stems['arp'] = stems['arp'] + delay_st(stems['arp'], STEP * 3, STEP * 2, fb=0.45, mix=0.45)
    stems['lead'] = stems['lead'] + delay_st(stems['lead'], STEP * 3, STEP * 3, fb=0.35, mix=0.25, lp=4000)
    stems['acid'] = stems['acid'] + delay_st(stems['acid'], STEP * 3, STEP * 5, fb=0.3, mix=0.25, lp=2500)

    sends = {'clap': 0.2, 'stabs': 0.45, 'pads': 0.5, 'lead': 0.35, 'arp': 0.35, 'acid': 0.12, 'fx': 0.3, 'perc': 0.25}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 300), make_ir(2.8, np.random.default_rng(9))) * 0.5
    mix = sum(stems.values()) + rev

    # イントロはマスターにローパスをかけて開いていく
    intro_end = int(T(8) * FS)
    lp = filt(mix[:intro_end], 'lp', 700, 0.9)
    w = np.linspace(0, 1, intro_end)[:, None] ** 2
    mix[:intro_end] = (lp * (1 - w) + mix[:intro_end] * w) * (0.55 + 0.45 * w)
    mix = stutter(mix, 63)

    mix = filt(mix, 'hp', 28, 0.7)
    mix = filt(mix, 'hs', 8000, 0.7, 1.0)
    mix = compress(mix, -14, 2.5, 0.01, 0.15)
    mix = mix / (active_rms(mix, pct=95) + 1e-9) * 10 ** (-10.5 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'stage2.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2))))


if __name__ == '__main__':
    main()
