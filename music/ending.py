#!/usr/bin/env python3
"""WIRED エンディング BGM「HOMECOMING」(仮) — 勇者の帰還

オーケストラ / 87.27 BPM (1 小節 = 2.75 秒) / E♭ メジャー / 13 小節 + 余韻 ≈ 40 秒 (ループなし)
エンディング映像と同期:
  0- 1  ワープアウト直後: 弦のピアニッシモ + ハープのアルペジオ + 遠い合唱 (戦闘機が戦艦の横を通過)
  2- 5  ソロホルンが帰還の主題、4 小節目からヴァイオリンの対旋律とフルート
  6- 7  旋回 → こちらへ: 行進のスネア、ティンパニのロール、上昇する金管、シンバルのスウェル
  8     22.0 秒 = 戦闘機が画面いっぱいに迫る瞬間: 全奏で主題 (トランペット + 合唱)
  9-11  THE END: 主題を大きく歌い、IV → iv → I (変終止) で締める
 12     主和音を伸ばしてグロッケンのきらめき → 余韻
"""
import sys, os, time
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa
from stage3_orchestra import spiccato, flute, glock, taiko, mil_snare, bass_drum  # 楽器を流用

BPM = 60 * 4 * 8 / 22.0   # 8 小節目の頭がちょうど 22.0 秒
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 13
TAIL = 4.5
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)
rng = np.random.default_rng(2024)


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
# 和声と主題 (E♭ メジャー)
# =====================================================================
Eb, F_, G_, Ab, Bb, C_ = 39, 41, 43, 44, 46, 48   # 低音 (E♭2 ...)
CHORD = {   # 中音域の和音
    'Eb': [63, 67, 70], 'Cm': [60, 63, 67], 'Ab': [60, 63, 68], 'Bb': [62, 65, 70], 'Bbsus': [63, 65, 70],
    'Abm': [59, 63, 68], 'Gm': [62, 67, 70], 'Fm': [60, 65, 68],
}
# (小節, 前半コード, 後半コード, 低音前半, 低音後半)
HARM = [
    (0, 'Eb', 'Eb', Eb, Eb), (1, 'Cm', 'Cm', C_ - 12, C_ - 12),
    (2, 'Eb', 'Eb', Eb, Eb), (3, 'Bb', 'Bb', Bb - 12, Bb - 12),
    (4, 'Ab', 'Ab', Ab - 12, Ab - 12), (5, 'Bb', 'Bb', Bb - 12, Bb - 12),
    (6, 'Cm', 'Ab', C_ - 12, Ab - 12), (7, 'Bbsus', 'Bb', Bb - 12, Bb - 12),
    (8, 'Eb', 'Eb', Eb, Eb), (9, 'Ab', 'Bb', Ab - 12, Bb - 12),
    (10, 'Ab', 'Ab', Ab - 12, Ab - 12), (11, 'Abm', 'Eb', Ab - 12, Eb),
    (12, 'Eb', 'Eb', Eb, Eb),
]
# 帰還の主題 (step, 長さ, midi)
THEME = {
    2: [(0, 6, 70), (6, 2, 75), (8, 6, 75), (14, 2, 77)],
    3: [(0, 8, 79), (8, 4, 77), (12, 4, 74)],
    4: [(0, 6, 72), (6, 2, 77), (8, 6, 77), (14, 2, 79)],
    5: [(0, 8, 80), (8, 4, 79), (12, 4, 77)],
}
RISE = {   # 6-7: 上昇する金管 (旋回してこちらへ)
    6: [(0, 4, 79), (4, 4, 80), (8, 4, 82), (12, 4, 84)],
    7: [(0, 8, 82), (8, 4, 84), (12, 4, 86)],
}
CLIMAX = {
    8: [(0, 6, 82), (6, 2, 87), (8, 6, 87), (14, 2, 89)],
    9: [(0, 8, 91), (8, 4, 89), (12, 4, 87)],
    10: [(0, 12, 84), (12, 4, 86)],
    11: [(0, 16, 87)],
}

strings, violins, horns, trumpets, lowbrass, flutes, choir = [], [], [], [], [], [], []
harp, glocks, timp, perc, fxs, spic = [], [], [], [], [], []


def half_chords(b):
    _, c1, c2, r1, r2 = HARM[b]
    return [(T(b), BAR / 2, c1, r1), (T(b, 8), BAR / 2, c2, r2)]


# ---- 0-1: 静かな始まり
for b in (0, 1):
    for t, d, c, r in half_chords(b):
        strings.append((t, d * 1.02, CHORD[c] + [r + 12], 0.35 + 0.15 * b))
    choir.append((T(b), BAR, CHORD[HARM[b][1]], 0.3))
# ハープ: 8 分音符のアルペジオ (0-7 小節)
for b in range(0, 8):
    for k in range(8):
        c = HARM[b][1] if k < 4 else HARM[b][2]
        notes = sorted(CHORD[c])
        pat = [notes[0] - 12, notes[1] - 12, notes[2] - 12, notes[0], notes[1], notes[2], notes[0] + 12, notes[2]]
        harp.append((T(b, k * 2), pat[k], 0.55 if b < 2 else 0.45))
fxs.append((0.0, 'swell'))
for s in range(16):   # ホルン登場前のティンパニ・ロール
    timp.append((T(1, s), Bb - 12 + 12, 0.15 + 0.35 * s / 15))

# ---- 2-5: ソロホルンの主題
for b in range(2, 6):
    for t, d, c, r in half_chords(b):
        strings.append((t, d * 1.02, CHORD[c] + [r + 12], 0.45 + 0.04 * (b - 2)))
        lowbrass.append((t, d * 0.98, r, 0.25 + 0.05 * (b - 2)))
    for st, ln, m in THEME[b]:
        horns.append((T(b, st), ln * STEP * 0.97, m - 12 if b < 4 else m - 12, 1.0))
    if b >= 4:   # 対旋律 (ヴァイオリン) + フルート
        violins.append((T(b), BAR * 0.5, CHORD[HARM[b][1]][2] + 12, 0.45))
        violins.append((T(b, 8), BAR * 0.5, CHORD[HARM[b][2]][1] + 12, 0.45))
        for st, ln, m in THEME[b]:
            flutes.append((T(b, st), ln * STEP * 0.95, m + 12, 0.5))
    timp.append((T(b), HARM[b][3] if HARM[b][3] >= 36 else HARM[b][3] + 12, 0.45))
    choir.append((T(b), BAR, CHORD[HARM[b][1]], 0.35))
glocks.append((T(2), 82, 0.4)); glocks.append((T(4), 84, 0.4))

# ---- 6-7: 旋回 → こちらへ (クレッシェンド)
for b in (6, 7):
    for t, d, c, r in half_chords(b):
        strings.append((t, d * 1.02, CHORD[c] + [r + 12, CHORD[c][2] + 12], 0.6 + 0.15 * (b - 6)))
        lowbrass.append((t, d * 0.98, r, 0.55 + 0.15 * (b - 6)))
        for st in range(8):
            spic.append((t + st * STEP, STEP * 0.9, r + 24, 0.45 + 0.25 * (b - 6) + 0.02 * st))
    for st, ln, m in RISE[b]:
        trumpets.append((T(b, st), ln * STEP * 0.95, m - 12, 0.75 + 0.15 * (b - 6)))
        horns.append((T(b, st), ln * STEP * 0.95, m - 15 if b == 6 else m - 17, 0.8))
        violins.append((T(b, st), ln * STEP * 0.97, m, 0.6 + 0.2 * (b - 6)))
    for st in range(0, 16, 2 if b == 6 else 1):   # 行進のスネア → ロール
        perc.append((T(b, st), 'snare', 0.35 + 0.5 * ((b - 6) * 16 + st) / 31))
    choir.append((T(b), BAR, CHORD[HARM[b][1]] + [CHORD[HARM[b][1]][0] + 12], 0.5 + 0.2 * (b - 6)))
for s in range(16):
    timp.append((T(7, s), Bb - 12 + 12, 0.4 + 0.6 * s / 15))
perc.append((T(6), 'taiko', 0.7)); perc.append((T(7), 'taiko', 0.8)); perc.append((T(7, 8), 'taiko', 0.9))
fxs.append((T(6), 'riser'))
fxs.append((T(8), 'revcym'))

# ---- 8-11: 全奏で主題 → 変終止
for b in range(8, 12):
    for t, d, c, r in half_chords(b):
        strings.append((t, d * 1.02, CHORD[c] + [r + 12, CHORD[c][0] + 12, CHORD[c][2] + 12], 0.95))
        lowbrass.append((t, d * 0.98, r, 0.95)); lowbrass.append((t, d * 0.98, r + 12, 0.6))
        choir.append((t, d * 1.02, CHORD[c] + [CHORD[c][1] + 12], 0.9))
        horns.append((t, d * 0.98, CHORD[c][1], 0.7)); horns.append((t, d * 0.98, CHORD[c][2], 0.7))
    for st, ln, m in CLIMAX[b]:
        trumpets.append((T(b, st), ln * STEP * 0.96, m - 12, 1.0))
        violins.append((T(b, st), ln * STEP * 0.98, m, 0.95))
        flutes.append((T(b, st), ln * STEP * 0.95, m + 12, 0.45))
    timp.append((T(b), HARM[b][3] if HARM[b][3] >= 36 else HARM[b][3] + 12, 1.0))
    timp.append((T(b, 8), HARM[b][4] if HARM[b][4] >= 36 else HARM[b][4] + 12, 0.8))
    perc.append((T(b), 'bd', 1.0)); perc.append((T(b, 8), 'bd', 0.7))
    if b in (8, 10): perc.append((T(b), 'crash', 1.0))
    for st in (4, 12): perc.append((T(b, st), 'snare', 0.55))
fxs.append((T(8), 'impact'))
for k, m in enumerate([87, 91, 94, 99]):
    glocks.append((T(8, k * 2), m, 0.5))

# ---- 12: 主和音を伸ばして終わり
strings.append((T(12), BAR + TAIL * 0.6, CHORD['Eb'] + [51, 75, 79, 82], 0.9))
choir.append((T(12), BAR + TAIL * 0.4, CHORD['Eb'] + [75], 0.85))
lowbrass.append((T(12), BAR * 1.2, Eb, 0.9)); lowbrass.append((T(12), BAR * 1.2, Eb + 12, 0.7))
horns.append((T(12), BAR * 1.2, 67, 0.8)); horns.append((T(12), BAR * 1.2, 70, 0.8))
trumpets.append((T(12), BAR * 1.15, 75, 0.95))
violins.append((T(12), BAR * 1.3, 87, 0.9))
for s in range(12): timp.append((T(11, 4 + s), Eb + 12, 0.3 + 0.5 * s / 11))
timp.append((T(12), Eb + 12, 1.0))
perc.append((T(12), 'crash', 1.0)); perc.append((T(12), 'bd', 1.0)); perc.append((T(12), 'taiko', 1.0))
for k, m in enumerate([82, 87, 91, 94, 99, 103]):
    glocks.append((T(12, 2 + k * 2), m, 0.45 - 0.04 * k))


# =====================================================================
# レンダリング
# =====================================================================
def harp_note(m, r2, vel=1.0):
    y = ks(float(mtof(m)), 2.2, r2, bright=0.45, decay=2.2, pick=0.3, amp=1.0)
    return onepole_lp(y, 3500) * vel


def render_sustain(events, voices=6, spread=16, attack=0.35, release=0.9, lp=3400, hp=110, vib=0.07):
    out = np.zeros((N, 2)); r2 = np.random.default_rng(len(events) + 3)
    for t, dur, notes, v in events:
        for m in notes:
            put(out, supersaw(m, dur, r2, voices=voices, spread=spread, vib=vib, attack=attack, release=release) * v, t)
    return filt(filt(out, 'lp', lp, 0.7), 'hp', hp, 0.7)


def render_violins():
    out = np.zeros((N, 2)); r2 = np.random.default_rng(51)
    for t, dur, m, v in violins:
        put(out, supersaw(m, dur, r2, voices=7, spread=14, vib=0.13, attack=0.09, release=0.4) * v, t)
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


def render_perc(kit):
    st = {k: np.zeros((N, 2)) for k in ('snare', 'taiko', 'cym', 'bd')}
    r2 = np.random.default_rng(61)
    smp = {'snare': mil_snare(r2), 'taiko': taiko(r2, 55), 'bd': bass_drum(r2)}
    for t, name, v in perc:
        v *= r2.uniform(0.92, 1.0)
        if name == 'snare': put(st['snare'], pan_mono(smp['snare'], 0.15), t + r2.normal(0, 0.003), v)
        elif name == 'taiko': put(st['taiko'], pan_mono(smp['taiko'], 0), t, v)
        elif name == 'bd': put(st['bd'], pan_mono(smp['bd'], 0), t, v)
        elif name == 'crash': put(st['cym'], kit['crash'], t, v)
    return st


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(62))
    print('rendering...', flush=True)
    stg = render_sustain(strings)
    vln = render_violins()
    sp = render_mono(spic, spiccato, 71)
    hn = onepole_lp(render_mono(horns, lambda m, d, r: brass_note(m, d, r, attack=0.08, release=0.35, bright=0.3), 72), 2000)
    tp = render_mono(trumpets, lambda m, d, r: brass_note(m, d, r, attack=0.04, release=0.25, bright=0.9), 73)
    lb = onepole_lp(render_mono(lowbrass, lambda m, d, r: brass_note(m, d, r, attack=0.06, release=0.3, bright=0.5), 74), 1400)
    fl = render_mono(flutes, flute, 75)
    gl = render_mono(glocks, glock, 76)
    hp_ = render_mono(harp, harp_note, 77)
    ch = np.zeros(N); r2 = np.random.default_rng(78)
    for t, dur, notes, v in choir:
        for m in notes:
            put(ch, choir_note(m, dur, r2, attack=0.6, release=1.0) * v, t)
    ch = filt(formant_ah(ch), 'hp', 180)
    ch = np.stack([ch, np.concatenate([np.zeros(int(0.015 * FS)), ch[:-int(0.015 * FS)]])], 1)
    tm = np.zeros(N); r3 = np.random.default_rng(79); cache = {}
    for t, m, v in timp:
        if m not in cache: cache[m] = timpani(float(mtof(m)), r3, dur=2.5)
        put(tm, cache[m], t, v)
    pc = render_perc(kit)
    fx = np.zeros((N, 2)); r4 = np.random.default_rng(80)
    for t, kind in fxs:
        if kind == 'impact': put(fx, pan_mono(impact(r4, 3.0), 0), t, 0.7)
        elif kind == 'riser': put(fx, pan_mono(riser(2 * BAR, r4), 0), t, 0.45)
        elif kind == 'revcym': put(fx, kit['revcym'], t - len(kit['revcym']) / FS, 0.8)
        elif kind == 'swell':   # ワープアウト直後の余韻 (下降するノイズ)
            n = int(3.0 * FS); tt = np.arange(n) / FS
            s = filt(r4.uniform(-1, 1, n), 'lp', 3000) * np.exp(-tt / 0.9)
            put(fx, pan_mono(s, 0), t, 0.5)
    print('  %.1fs' % (time.time() - t0), flush=True)

    # 曲の起伏を残すため、楽器ごとの基準レベルで混ぜる (区間ごとの正規化はしない)
    def lvl(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'strings': lvl(stg, -20),
        'violins': lvl(vln, -18),
        'spic': pan_mono(lvl(sp, -23), -0.25),
        'horns': pan_mono(lvl(hn, -17.5), -0.3),
        'trumpets': pan_mono(lvl(tp, -18), 0.25),
        'lowbrass': pan_mono(lvl(lb, -21), 0.1),
        'flutes': pan_mono(lvl(fl, -25), 0.35),
        'glock': pan_mono(lvl(gl, -27), 0.3),
        'harp': pan_mono(lvl(hp_, -22), -0.35),
        'choir': lvl(ch, -21),
        'timp': pan_mono(lvl(tm, -20), 0),
        'snare': lvl(pc['snare'], -25),
        'taiko': lvl(pc['taiko'], -21),
        'bd': lvl(pc['bd'], -22),
        'cym': lvl(pc['cym'], -25),
        'fx': lvl(fx, -24),
    }
    sends = {'strings': 0.6, 'violins': 0.55, 'spic': 0.35, 'horns': 0.7, 'trumpets': 0.5, 'lowbrass': 0.45, 'flutes': 0.55,
             'glock': 0.6, 'harp': 0.55, 'choir': 0.75, 'timp': 0.5, 'snare': 0.35, 'taiko': 0.45, 'bd': 0.3, 'cym': 0.3, 'fx': 0.4}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 200), make_ir(3.8, np.random.default_rng(81), predelay=0.03)) * 0.65
    mix = sum(stems.values()) + rev
    mix = filt(mix, 'hp', 30, 0.7)
    mix = filt(mix, 'hs', 8000, 0.7, 1.5)
    mix = compress(mix, -16, 2.0, 0.02, 0.25)
    mix = mix / (active_rms(mix, pct=97) + 1e-9) * 10 ** (-11.0 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'ending.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f  song=%.6f bar=%.6f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), SONG, BAR))


if __name__ == '__main__':
    main()
