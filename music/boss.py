#!/usr/bin/env python3
"""WIRED ボス戦 BGM「SEVERED」(仮)  — メタル × テクノの融合

172 BPM / D マイナー (E♭=短2度, A♭=増4度 で不穏に) / 44 小節 ≈ 61.4 秒
  0- 3  イントロ: 衝撃音 + ギターのロングトーン + クワイアの不協和音 + ティンパニのロール
  4-11  ボスリフ: 低音 D の刻み + ツーバス + ブラスのスタブ
 12-19  融合パート: 4 つ打ちキック + アシッド + ギターの 8 分刻み + アルペジオ
 20-27  ボステーマ: 和声的短音階の叫ぶリードギター + クワイア + ハーフタイム
 28-35  ブレイクダウン (シンコペーションのスタブ) → 半音ずつ上がるビルド
 36-43  テーマ再現 (ツインリード + ドライブ) → 半音下降でリフ頭へ
ループ: 小節 4 〜 44
1 面の合成エンジン (stage1.py の楽器/レンダラ) を、テンポと尺を差し替えて再利用する。
"""
import sys, os, time
import numpy as np
import soundfile as sf
from scipy import signal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa
import stage1 as S

BPM = 172
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 44
LOOP_BAR = 4
TAIL = 3.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)

# stage1 のレンダラが参照するモジュール変数を差し替える
S.BPM, S.BEAT, S.STEP, S.BAR, S.NBARS, S.N = BPM, BEAT, STEP, BAR, NBARS, N
for lst in (S.rhythm, S.bass_extra, S.lead, S.synlead, S.arp, S.strings, S.choir, S.brass, S.drums, S.timp, S.fx):
    lst.clear()
S.SCALE_E_MIN[:] = [2, 4, 5, 7, 9, 10, 0]   # ツインリードのハモりを D ナチュラルマイナーで
T, riff, gallop, trem, beat_drums, tom_fill, snare_roll, L = S.T, S.riff, S.gallop, S.trem, S.beat_drums, S.tom_fill, S.snare_roll, S.L
rhythm, lead, arp, strings, choir, brass, drums, timp, fx = S.rhythm, S.lead, S.arp, S.strings, S.choir, S.brass, S.drums, S.timp, S.fx

D2, Eb2, E2, F2, G2, Ab2, A2, Bb2, B2, C3, Cs3, D3 = 38, 39, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50
acid = []      # (時刻, 長さ, midi, accent, slide)
bass8 = []     # (時刻, 長さ, midi)

# ------------------------------------------------ ボスリフ (2 小節)
BR1 = [(0, 1, D2, 'pm'), (1, 1, D2, 'pm'), (2, 2, Eb2, 'acc'), (4, 1, D2, 'pm'), (5, 1, D2, 'pm'), (6, 1, D2, 'pm'),
       (7, 3, Ab2, 'acc'), (10, 1, D2, 'pm'), (11, 1, D2, 'pm'), (12, 2, G2, 'acc'), (14, 2, F2, 'acc')]
BR2 = [(0, 1, D2, 'pm'), (1, 1, D2, 'pm'), (2, 2, Eb2, 'acc'), (4, 1, D2, 'pm'), (5, 1, D2, 'pm'), (6, 1, D2, 'pm'),
       (7, 1, A2, 'acc'), (8, 1, Bb2, 'acc'), (9, 1, C3, 'acc'), (10, 2, Cs3, 'acc'),
       (12, 1, C3, 'acc'), (13, 1, Bb2, 'acc'), (14, 1, A2, 'acc'), (15, 1, Ab2, 'acc')]
BR2_END = BR2[:10] + [(12, 4, D3, 'acc')]

# ------------------------------------------------ 0-3 イントロ
fx.append((0.0, 'impact')); drums.append((0.0, 'crash', 1.0)); drums.append((0.0, 'china', 1.0))
rhythm.append((0.0, 2 * BAR, D2, 'open', 1.0))
timp.append((0.0, D2, 1.0))
choir.append((0.0, 4 * BAR, [62, 63, 69], 0.8))          # D-E♭-A の不協和
strings.append((0.0, 4 * BAR, [50, 57, 62, 63], 0.7))
brass.append((0.0, 2 * BAR, 50, 0.8, False)); brass.append((0.0, 2 * BAR, 38, 0.7, False))
for s in range(16):
    timp.append((T(1, s), D2, 0.3 + 0.5 * s / 15))
    timp.append((T(3, s), D2, 0.5 + 0.5 * s / 15))
rhythm.append((T(2), BAR, Eb2, 'open', 1.0)); timp.append((T(2), Eb2, 1.0))
fx.append((T(2), 'impact')); drums.append((T(2), 'crash', 1.0))
trem(3, D2, 0.6, 1.0)
snare_roll(3, 0, 16, 0.4, 1.0)
fx.append((T(3), 'revcym'))

# ------------------------------------------------ 4-11 ボスリフ
for i, b in enumerate(range(4, 12, 2)):
    riff(b, BR1, brass_stabs=True); riff(b + 1, BR2 if i < 3 else BR2_END, brass_stabs=True)
    beat_drums(b, 'double', crash=True); beat_drums(b + 1, 'double')
    drums.append((T(b + 1, 12), 'china', 0.9))
choir.append((T(4), 8 * BAR, [62, 65, 69], 0.55))
strings.append((T(4), 8 * BAR, [50, 57, 62], 0.45))
lead.append((T(7, 12), 4 * STEP, 93, {'vib': 0.9, 'pinch': 1, 'vol': 0.5}, 'lead'))
lead.append((T(11, 12), 4 * STEP, 93, {'vib': 0.9, 'pinch': 1, 'vol': 0.5}, 'lead'))

# ------------------------------------------------ 12-19 融合パート (テクノ)
ACID = [(0, 1, 0), (0, 0, 0), (12, 0, 1), (0, 0, 0), (1, 1, 0), (0, 0, 0), (13, 0, 1), (12, 0, 0),
        (0, 1, 0), (7, 0, 0), (6, 1, 1), (5, 0, 0), (0, 0, 0), (12, 1, 0), (10, 0, 1), (8, 0, 0)]
for bar in range(12, 20):
    for st in (0, 4, 8, 12): drums.append((T(bar, st), 'kick', 1.0))
    for st in (4, 12): drums.append((T(bar, st), 'snare', 0.9))
    for st in range(16): drums.append((T(bar, st), 'hat', 0.85 if st % 4 == 2 else 0.45))
    for st in (2, 6, 10, 14): drums.append((T(bar, st), 'ohat', 0.55))
    root = D2 if bar % 4 < 2 else (Bb2 if bar % 4 == 2 else C3)
    for st in range(0, 16, 2):
        rhythm.append((T(bar, st), STEP * 1.6, root, 'acc' if st == 0 else 'pm', 1.0))
        bass8.append((T(bar, st), STEP * 1.6, root - 12))
    for st, p in enumerate(ACID):
        semi, acc, sl = p
        acid.append((T(bar, st), STEP, 50 + semi + (root - D2 if bar % 4 >= 2 else 0), acc, sl))
    tones = {D2: [62, 65, 69, 74], Bb2: [58, 62, 65, 70], C3: [60, 64, 67, 72]}[root]
    for st in range(16):
        arp.append((T(bar, st), tones[[0, 1, 2, 3, 2, 1, 3, 2][st % 8]] + 12))
    if bar % 2 == 0: drums.append((T(bar), 'crash', 0.8))
strings.append((T(12), 8 * BAR, [62, 65, 69, 74], 0.4))
fx.append((T(18), 'riser2'))
snare_roll(19, 8, 16, 0.5, 1.0)

# ------------------------------------------------ 20-27 ボステーマ
TH_ROOTS = [Bb2, C3, D2, A2, Bb2, C3, D2, A2]
TH_TRI = [[58, 62, 65], [60, 64, 67], [62, 65, 69], [61, 64, 69], [58, 62, 65], [60, 64, 67], [62, 65, 69], [61, 64, 69]]
THEME = [
    [(0, 6, 74, {'vib': 0.3}), (6, 2, 77), (8, 8, 81, {'bend': 2, 'vib': 0.45})],
    [(0, 4, 79), (4, 2, 81), (6, 2, 79), (8, 8, 76, {'vib': 0.4})],
    [(0, 6, 77, {'vib': 0.3}), (6, 2, 76), (8, 4, 74), (12, 4, 81)],
    [(0, 12, 85, {'bend': 2, 'vib': 0.55}), (12, 2, 83), (14, 2, 81)],
    [(0, 6, 86, {'vib': 0.4}), (6, 2, 84), (8, 8, 82, {'vib': 0.45})],
    [(0, 6, 84, {'vib': 0.35}), (6, 2, 82), (8, 8, 79, {'vib': 0.45})],
    [(0, 4, 81), (4, 4, 77), (8, 4, 74), (12, 4, 77)],
    [(0, 16, 81, {'bend': 1, 'vib': 0.6})],
]


def theme(bar0, twin=False, drive=False):
    for k in range(8):
        bar = bar0 + k
        r = TH_ROOTS[k]; nr = TH_ROOTS[(k + 1) % 8]
        rhythm.append((T(bar, 0), 14 * STEP, r, 'open', 1.0))
        rhythm.append((T(bar, 14), 2 * STEP, nr, 'acc', 1.0))
        for s in range(0, 16, 2):
            bass8.append((T(bar, s), 2 * STEP * 0.9, r - 12))
        beat_drums(bar, 'drive' if drive else 'half', crash=True)
        drums.append((T(bar, 14), 'kick', 1.0))
        if k in (3, 7): tom_fill(bar, 12)
        L(bar, THEME[k], 'lead')
        if twin: L(bar, THEME[k], 'harm')
        for st, ln, m, *o in THEME[k]:
            brass.append((T(bar, st), ln * STEP * 0.95, m - 12, 0.7, False))
        tri = TH_TRI[k]
        strings.append((T(bar), BAR, [tri[0] + 12, tri[1] + 12, tri[2] + 12, tri[0] + 24], 0.75))
        choir.append((T(bar), BAR * 0.98, tri, 0.9))
        if k % 2 == 0: timp.append((T(bar), r if r >= 41 else r + 12, 0.9))


theme(20)
fx.append((T(20), 'impact'))

# ------------------------------------------------ 28-35 ブレイクダウン → ビルド
STAB = [(0, 3, D2, 'acc'), (3, 3, D2, 'acc'), (6, 2, Eb2, 'acc'), (8, 1, D2, 'pm'), (9, 1, D2, 'pm'), (10, 2, D2, 'acc'),
        (12, 1, D2, 'pm'), (13, 1, D2, 'pm'), (14, 2, Ab2, 'acc')]
for k in range(4):
    bar = 28 + k
    riff(bar, STAB)
    drums.append((T(bar, 8), 'snare', 1.0))
    drums.append((T(bar, 14), 'china', 0.9))
    for s in range(0, 16, 4): drums.append((T(bar, s), 'ride', 0.55))
    for s in range(16):
        arp.append((T(bar, s), [62, 65, 69, 74, 69, 65, 63, 62][s % 8] + 12))
    if k in (0, 2):
        fx.append((T(bar), 'impact')); drums.append((T(bar), 'crash', 1.0)); timp.append((T(bar), D2, 1.0))
        brass.append((T(bar), 3 * STEP, 62, 1.0, True)); brass.append((T(bar), 3 * STEP, 69, 0.9, True)); brass.append((T(bar), 3 * STEP, 50, 0.9, True))
choir.append((T(28), 4 * BAR, [50, 57, 62], 0.6))
for k, root in enumerate([Bb2, B2, C3, Cs3]):
    bar = 32 + k
    trem(bar, root, 0.6 + 0.1 * k, 0.75 + 0.08 * k)
    brass.append((T(bar), BAR * 0.95, root + 12, 0.7 + 0.08 * k, False))
    brass.append((T(bar), BAR * 0.95, root + 19, 0.6 + 0.08 * k, False))
    strings.append((T(bar), BAR, [root + 12, root + 19, root + 24, root + 28], 0.55 + 0.1 * k))
    for s in range(0, 16, 4): drums.append((T(bar, s), 'kick', 0.9))
    snare_roll(bar, 0, 16, 0.45 + 0.13 * k, 0.6 + 0.13 * k, 2 if k < 2 else 1)
choir.append((T(32), 4 * BAR * 0.97, [61, 64, 69], 0.75))
fx.append((T(33), 'riser2')); fx.append((T(35), 'revcym'))
drums.append((T(32), 'crash', 0.8))

# ------------------------------------------------ 36-43 テーマ再現 (ツインリード) → ループ
theme(36, twin=True, drive=True)
fx.append((T(36), 'impact'))
# 最終小節の後半をリフ頭への半音下降に差し替え
rhythm[:] = [e for e in rhythm if not (T(43, 12) - 1e-6 <= e[0] < T(44))]
for s, r in zip((12, 13, 14, 15), (C3, Bb2, A2, Ab2)):
    rhythm.append((T(43, s), STEP, r, 'acc', 1.0))


# =====================================================================
# レンダリング
# =====================================================================
def render_bass():
    di = np.zeros(N)
    r2 = np.random.default_rng(77)
    evs = [(t, dur, root, kind) for t, dur, root, kind, vel in rhythm if not (20 <= t / BAR < 28 or 36 <= t / BAR < 44 or 12 <= t / BAR < 20)]
    evs += [(t, dur, m + 12, 'b8') for t, dur, m in bass8]
    for t, dur, root, kind in evs:
        if t < T(4) and kind != 'open': continue
        m = root - 12 if root - 12 >= 26 else root
        mute = kind in ('pm', 'trem')
        y = ks(float(mtof(m)), max(dur, STEP), r2, bright=0.45 if mute else 0.6, decay=0.35 if mute else 1.4, mute=mute, amp=0.9, rel=0.02)
        n = len(y); tt = np.arange(n) / FS
        sub = np.sin(2 * np.pi * float(mtof(m)) * tt) * np.minimum(1, tt / 0.004) * 0.3
        sub *= np.where(tt < dur, 1, np.exp(-(tt - dur) / 0.015))
        S.put(di, y + sub, t)
    di /= np.max(np.abs(di)) + 1e-9
    x = np.tanh(di * 2.2) / np.tanh(2.2)
    x = filt(x, 'lp', 2600, 0.7); x = filt(x, 'hp', 32, 0.7)
    return filt(x, 'peak', 800, 1.0, 3.0)


def render_acid():
    freq = np.zeros(N); amp = np.zeros(N); envc = np.zeros(N)
    prev = None
    for t, dur, m, acc, sl in acid:
        s = int(t * FS); e = min(N, int((t + dur) * FS)); n = e - s
        tt = np.arange(n) / FS
        f0 = float(mtof(m))
        if prev is not None and prev[4] and abs(prev[0] + prev[1] - t) < 1e-3:
            pf = float(mtof(prev[2]))
            freq[s:e] = f0 * (pf / f0) ** np.exp(-tt / 0.04)
            amp[s:e] = amp[s - 1]; envc[s:e] = envc[s - 1] * np.exp(-tt / 0.3)
        else:
            freq[s:e] = f0
            amp[s:e] = (0.75 + 0.35 * acc) * np.minimum(1, tt / 0.002) * np.exp(-tt / (0.5 if acc else 0.9))
            envc[s:e] = (1.0 + 0.7 * acc) * np.exp(-tt / (0.11 if acc else 0.18))
        gl = int(dur * (1.0 if sl else 0.62) * FS)
        if n - gl > 0: amp[s + gl:e] *= np.exp(-np.arange(n - gl) / (0.004 * FS))
        prev = (t, dur, m, acc, sl)
    osc = polyblep_saw(np.where(freq > 0, freq, 40.0)) * amp
    bars = np.arange(N) / FS / BAR
    fc = np.interp(bars, [12, 16, 20], [500, 1100, 1800]) * (1 + 5 * envc)
    out = np.zeros(N); zi1 = np.zeros(2); zi2 = np.zeros(2)
    for i in range(0, N, 64):
        seg = osc[i:i + 64]
        if not seg.any() and not zi1.any(): continue
        b1, a1 = biquad('lp', min(float(fc[i]), 14000), 11.0)
        y, zi1 = signal.lfilter(b1, a1, seg, zi=zi1)
        b2, a2 = biquad('lp', min(float(fc[i]) * 1.3, 16000), 0.6)
        y, zi2 = signal.lfilter(b2, a2, y, zi=zi2)
        out[i:i + 64] = y
        if np.max(np.abs(zi1)) < 1e-7 and not seg.any(): zi1[:] = 0; zi2[:] = 0
    return filt(np.tanh(out * 2.4) / np.tanh(2.4), 'hp', 60)


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(4))
    rhy_amp = dict(gain=26, tight=85, mid=(900, 3.0), scoop=(500, -2.5), low=(115, 8.5), cab_lp=4800,
                   post_eq=(('peak', 1200, 0.6, -3.0), ('ls', 300, 0.7, 5.0)))
    print('rendering guitars...', flush=True)
    gl = amp_sim(S.render_rhythm(501), **rhy_amp)
    gr = amp_sim(S.render_rhythm(602), **rhy_amp)
    bass = render_bass()
    lead_amp = dict(gain=42, tight=220, mid=(1000, 7.0), scoop=(500, -2.0), presence=(2600, 3.0), cab_lp=5800)
    ld = amp_sim(S.render_lead(('lead',), 701), **lead_amp)
    hm = amp_sim(S.render_lead(('harm',), 702), **lead_amp)
    print('  %.1fs' % (time.time() - t0), flush=True)
    ac = render_acid(); ap = S.render_arp()
    strg = S.render_strings(); cho = S.render_choir(); brs = S.render_brass()
    dr = S.render_drums(kit); tp = S.render_timp(); fxs = S.render_fx(kit)
    print('  %.1fs' % (time.time() - t0), flush=True)

    def norm(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'gtrL': pan_mono(norm(gl, -17), -0.9), 'gtrR': pan_mono(norm(gr, -17), 0.9),
        'bass': pan_mono(norm(bass, -21), 0),
        'lead': pan_mono(norm(ld, -16.5), 0.0), 'harm': pan_mono(norm(hm, -19.5), 0.3),
        'acid': pan_mono(norm(ac, -19), -0.1), 'arp': pan_mono(norm(ap, -27), 0.25),
        'strings': norm(strg, -24), 'choir': norm(cho, -23), 'brass': pan_mono(norm(brs, -22), -0.15),
        'kick': norm(dr['kick'], -20), 'snare': norm(dr['snare'], -16), 'toms': norm(dr['toms'], -18),
        'hats': norm(dr['hats'], -27), 'cym': norm(dr['cym'], -26),
        'timp': pan_mono(norm(tp, -20), 0), 'fx': norm(fxs, -23),
    }
    stems['arp'] = stems['arp'] + delay_st(stems['arp'], STEP * 3, STEP * 2, fb=0.45, mix=0.5)
    stems['lead'] = stems['lead'] + delay_st(stems['lead'], STEP * 3, STEP * 3, fb=0.3, mix=0.18, lp=3000)
    stems['acid'] = stems['acid'] + delay_st(stems['acid'], STEP * 3, STEP * 5, fb=0.3, mix=0.22, lp=2500)
    drum_bus = stems['kick'] + stems['snare'] + stems['toms'] + stems['hats'] + stems['cym']
    drum_bus = drum_bus * 0.7 + compress(drum_bus, -24, 6, 0.003, 0.08, 6) * 0.5
    sends = {'lead': 0.22, 'harm': 0.22, 'arp': 0.25, 'strings': 0.55, 'choir': 0.75, 'brass': 0.35,
             'snare': 0.18, 'toms': 0.2, 'timp': 0.5, 'fx': 0.3, 'acid': 0.1, 'gtrL': 0.04, 'gtrR': 0.04}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 250), make_ir(2.8, np.random.default_rng(13))) * 0.55
    mix = drum_bus + rev
    for k in stems:
        if k not in ('kick', 'snare', 'toms', 'hats', 'cym'):
            mix = mix + stems[k]
    mix = filt(mix, 'hp', 28, 0.7)
    mix = filt(mix, 'hs', 9000, 0.7, 1.5)
    mix = filt(mix, 'peak', 300, 0.8, -1.5)
    mix = filt(mix, 'ls', 90, 0.7, -1.5)
    mix = compress(mix, -14, 2.5, 0.01, 0.15)
    mix = mix / (active_rms(mix, pct=95) + 1e-9) * 10 ** (-10.0 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'boss.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f  song=%.6f loop=%.6f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), SONG, LOOP_BAR * BAR))


if __name__ == '__main__':
    main()
