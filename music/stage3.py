#!/usr/bin/env python3
"""WIRED ステージ3 BGM「VICTORY RIOT」(仮) — 勝利！勝利！勝利！

パンク / 190 BPM / D メジャー / 95 小節 = 120 秒 (ボス出現まで)
  0- 3  イントロ: ストンプ&クラップ + 群衆の「VIC-TO-RY!」 → バンドが突入
  4-11  リフ: リードギターのオクターブのフック
 12-27  バース: 2 ビートとスカンクビートで疾走 (D-G-A)
 28-35  プレ: A を 8 分で溜めて「HEY! HEY!」
 36-51  サビ: I-V-vi-IV + 群衆の「VIC-TO-RY! ×3」+ アンセムのメロディ
 52-59  ブレイク: ドラムと群衆のコール&レスポンス
 60-67  ギターソロ (メジャーペンタの速弾き)
 68-83  ラストサビ (+2, E メジャー) 群衆さらに大きく
 84-94  アウトロ: キメ (ストップ) と掛け声 → リフ頭へループ
ループ: 小節 4 (5.053 秒) 〜 120.0 秒
旧 3 面のオーケストラ版は stage3_orchestra.py。
"""
import sys, os, time
import numpy as np
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from synth import *  # noqa
import stage1 as S
import chant

BPM = 190
BEAT = 60 / BPM
STEP = BEAT / 4
BAR = BEAT * 4
NBARS = 95
LOOP_BAR = 4
TAIL = 3.0
SONG = NBARS * BAR
N = int((SONG + TAIL) * FS)

S.BPM, S.BEAT, S.STEP, S.BAR, S.NBARS, S.N = BPM, BEAT, STEP, BAR, NBARS, N
for lst in (S.rhythm, S.bass_extra, S.lead, S.synlead, S.arp, S.strings, S.choir, S.brass, S.drums, S.timp, S.fx):
    lst.clear()
S.SCALE_E_MIN[:] = [11, 1, 2, 4, 6, 7, 9]   # ハモりは B ナチュラルマイナー = D メジャー
T, L, snare_roll, tom_fill = S.T, S.L, S.snare_roll, S.tom_fill
rhythm, lead, drums, brass, fx = S.rhythm, S.lead, S.drums, S.brass, S.fx

D3, E3, Fs2, G2, A2, B2, Cs3 = 50, 52, 42, 43, 45, 47, 49
D2, E2 = 38, 40
shouts = []    # (時刻, 種類, 長さ秒, 強さ)
claps = []     # (時刻, 強さ)
bass8 = []     # (時刻, 長さ, midi)


def chords8(bar, root, vel=1.0, accent_first=True, stop=None):
    """パンクの 8 分ダウンピッキング"""
    for st in range(0, 16, 2):
        if stop is not None and st >= stop: break
        k = 'acc' if (st == 0 and accent_first) else 'trem'
        rhythm.append((T(bar, st), STEP * 1.8, root, k, vel * (1.0 if st % 4 == 0 else 0.9)))
        bass8.append((T(bar, st), STEP * 1.8, root - 12))


def beat(bar, kind, crash=False):
    if crash: drums.append((T(bar, 0), 'crash', 1.0))
    if kind == 'punk':      # 2 ビート
        for st in (0, 8): drums.append((T(bar, st), 'kick', 1.0))
        drums.append((T(bar, 6), 'kick', 0.7))
        for st in (4, 12): drums.append((T(bar, st), 'snare', 1.0))
        for st in range(0, 16, 2): drums.append((T(bar, st), 'hat', 0.8 if st % 4 == 0 else 0.6))
    elif kind == 'skank':   # スカンクビート: キックが拍、スネアが裏
        for st in (0, 4, 8, 12): drums.append((T(bar, st), 'kick', 1.0))
        for st in (2, 6, 10, 14): drums.append((T(bar, st), 'snare', 0.9))
        for st in range(0, 16, 2): drums.append((T(bar, st), 'ride', 0.6))
    elif kind == 'stomp':   # ドン・ドン・パン
        for st in (0, 2, 8, 10): drums.append((T(bar, st), 'kick', 0.95))
        for st in (4, 12): claps.append((T(bar, st), 1.0))
    elif kind == 'half':
        for st in (0, 10): drums.append((T(bar, st), 'kick', 1.0))
        drums.append((T(bar, 8), 'snare', 1.0))
        for st in range(0, 16, 2): drums.append((T(bar, st), 'ride', 0.55))


def victory(bar, loud=1.0, hey=True):
    """VIC-TO-RY! ×3 (1.5 小節) + HEY!"""
    t = T(bar)
    for rep in range(3):
        for kind, ln in (('VIC', 2), ('TO', 2), ('RY', 4)):
            shouts.append((t, kind, ln * STEP * 0.95, loud))
            t += ln * STEP
    if hey:
        shouts.append((T(bar + 1, 12), 'HEY', 3 * STEP, loud))


# ------------------------------------------------ 0-3 イントロ
for b in (0, 1):
    beat(b, 'stomp')
victory(0, 0.9, hey=False)
shouts.append((T(1, 12), 'HEY', 3 * STEP, 1.0))
for s in range(8, 16): drums.append((T(1, s), 'snare', 0.5 + 0.06 * (s - 8)))
INTRO_RIFF = [D3, D3, G2, A2]
for k, b in enumerate((2, 3)):
    chords8(b, D3 if k == 0 else A2)
    beat(b, 'punk', crash=True)
fx.append((T(2), 'impact'))

# ------------------------------------------------ 4-11 リフ (リードのフック)
HOOK = [
    [(0, 2, 74), (2, 2, 76), (4, 2, 78), (6, 2, 81), (8, 4, 83), (12, 4, 81)],
    [(0, 2, 78), (2, 2, 76), (4, 4, 74), (8, 8, 69, {'vib': 0.3})],
    [(0, 2, 74), (2, 2, 76), (4, 2, 78), (6, 2, 81), (8, 4, 86, {'bend': 2}), (12, 4, 83)],
    [(0, 4, 81), (4, 4, 78), (8, 8, 81, {'vib': 0.35})],
]
RIFF_CH = [D3, G2, D3, A2]
for k in range(8):
    b = 4 + k
    chords8(b, RIFF_CH[k % 4])
    beat(b, 'punk', crash=(k % 2 == 0))
    L(b, HOOK[k % 4], 'lead'); L(b, HOOK[k % 4], 'harm')
tom_fill(11, 12)

# ------------------------------------------------ 12-27 バース
VERSE_CH = [D3, D3, G2, A2]
for k in range(16):
    b = 12 + k
    r = VERSE_CH[k % 4]
    chords8(b, r, vel=0.9)
    beat(b, 'punk' if k < 8 else 'skank', crash=(k % 4 == 0))
    if k % 4 == 3:  # 合いの手
        shouts.append((T(b, 12), 'HEY', 3 * STEP, 0.7))
    if k >= 8 and k % 2 == 1:   # 後半はリードの短いフィル
        L(b, [(8, 2, 81), (10, 2, 83), (12, 4, 86, {'vib': 0.3})], 'lead')

# ------------------------------------------------ 28-35 プレ (A で溜める)
for k in range(8):
    b = 28 + k
    r = [G2, G2, A2, A2, G2, G2, A2, A2][k]
    for st in range(16):
        rhythm.append((T(b, st), STEP * 0.95, r, 'trem', 0.75 + 0.03 * k))
        if st % 2 == 0: bass8.append((T(b, st), STEP * 1.8, r - 12))
    for st in (0, 4, 8, 12): drums.append((T(b, st), 'kick', 0.9))
    snare_roll(b, 0, 16, 0.4 + 0.07 * k, 0.5 + 0.07 * k, 2 if k < 6 else 1)
    if k % 2 == 1: shouts.append((T(b, 8), 'HEY', 3 * STEP, 0.8)); shouts.append((T(b, 12), 'HEY', 3 * STEP, 0.9))
fx.append((T(34), 'riser2')); fx.append((T(35), 'revcym'))

# ------------------------------------------------ 36-51 サビ (I-V-vi-IV)
CHORUS_CH = [D3, A2, B2, G2]
CHORUS = [
    [(0, 6, 81), (6, 2, 78), (8, 4, 81), (12, 4, 83)],
    [(0, 6, 85), (6, 2, 83), (8, 8, 81, {'vib': 0.35})],
    [(0, 6, 83), (6, 2, 81), (8, 4, 78), (12, 4, 74)],
    [(0, 8, 79, {'vib': 0.3}), (8, 4, 78), (12, 4, 76)],
]


def chorus(bar0, tr=0, loud=1.0):
    for k in range(16):
        b = bar0 + k
        r = CHORUS_CH[k % 4] + tr
        chords8(b, r)
        beat(b, 'skank' if k % 8 >= 4 else 'punk', crash=True)
        if k % 4 == 0:
            victory(b, loud)
        else:
            L(b, CHORUS[k % 4], 'lead', tr)
            if tr: L(b, CHORUS[k % 4], 'harm', tr)
        if k % 4 == 3: tom_fill(b, 12)


chorus(36)
fx.append((T(36), 'impact'))

# ------------------------------------------------ 52-59 ブレイク (コール&レスポンス)
for k in range(8):
    b = 52 + k
    beat(b, 'half')
    rhythm.append((T(b, 0), STEP * 3, D3 if k % 2 == 0 else A2, 'acc', 1.0))
    bass8.append((T(b, 0), STEP * 3, (D3 if k % 2 == 0 else A2) - 12))
    if k % 2 == 0:
        victory(b, 0.85, hey=False)
    else:
        shouts.append((T(b, 8), 'HEY', 3 * STEP, 0.9)); shouts.append((T(b, 12), 'HEY', 3 * STEP, 1.0))
for s in range(8, 16): drums.append((T(59, s), 'snare', 0.5 + 0.06 * (s - 8)))

# ------------------------------------------------ 60-67 ギターソロ
LG = {'leg': 1}
SOLO = [
    [(0, 6, 86, {'bend': 2, 'vib': 0.4}), (6, 1, 83), (7, 1, 81, LG), (8, 1, 78, LG), (9, 1, 76, LG), (10, 2, 78), (12, 4, 81, {'vib': 0.35})],
    [(i, 1, n, LG if i else {}) for i, n in enumerate([74, 76, 78, 81, 83, 86, 88, 90])] + [(8, 8, 91, {'bend': 2, 'vib': 0.5})],
    [(0, 2, 90), (2, 2, 88), (4, 2, 86), (6, 2, 83), (8, 8, 86, {'vib': 0.45})],
    [(i, 1, n, LG if i % 4 else {}) for i, n in enumerate([86, 83, 81, 83, 86, 83, 81, 78, 81, 78, 76, 78, 81, 78, 76, 74])],
    [(0, 6, 81, {'bend': 2, 'vib': 0.4}), (6, 2, 83), (8, 8, 85, {'vib': 0.45})],
    [(i, 1, n, LG if i else {}) for i, n in enumerate([85, 83, 81, 78, 76, 78, 81, 83])] + [(8, 8, 86, {'vib': 0.5})],
    [(0, 4, 88, {'bend': 2}), (4, 4, 86), (8, 4, 83), (12, 4, 81)],
    [(0, 16, 86, {'vib': 0.55, 'dive': 5})],
]
SOLO_CH = [D3, G2, D3, A2, B2, G2, A2, A2]
for k in range(8):
    b = 60 + k
    chords8(b, SOLO_CH[k])
    beat(b, 'skank', crash=(k % 2 == 0))
    L(b, SOLO[k], 'lead')

# ------------------------------------------------ 68-83 ラストサビ (+2 = E メジャー)
chorus(68, tr=2, loud=1.25)
fx.append((T(68), 'impact'))

# ------------------------------------------------ 84-94 アウトロ (キメ → ループ)
for k in range(8):
    b = 84 + k
    r = [D3, D3, G2, A2][k % 4]
    if k % 2 == 0:   # キメ: 1 拍目だけ鳴らして掛け声
        rhythm.append((T(b, 0), STEP * 3, r, 'acc', 1.0)); bass8.append((T(b, 0), STEP * 3, r - 12))
        drums.append((T(b, 0), 'kick', 1.0)); drums.append((T(b, 0), 'crash', 1.0)); drums.append((T(b, 0), 'snare', 1.0))
        victory(b, 1.2, hey=False)
    else:
        chords8(b, r)
        beat(b, 'skank')
        shouts.append((T(b, 12), 'HEY', 3 * STEP, 1.2))
for k in range(3):   # 92-94: ドミナントで溜めてリフ頭 (D) へ
    b = 92 + k
    for st in range(16):
        rhythm.append((T(b, st), STEP * 0.95, A2, 'trem', 0.8 + 0.07 * k))
        if st % 2 == 0: bass8.append((T(b, st), STEP * 1.8, A2 - 12))
    for st in (0, 4, 8, 12): drums.append((T(b, st), 'kick', 0.95))
    snare_roll(b, 0, 16, 0.5 + 0.15 * k, 0.65 + 0.15 * k, 1 if k else 2)
shouts.append((T(94, 8), 'HEY', 3 * STEP, 1.2)); shouts.append((T(94, 12), 'HEY', 3 * STEP, 1.3))
fx.append((T(92), 'riser2'))


# =====================================================================
def render_bass():
    di = np.zeros(N); r2 = np.random.default_rng(91)
    for t, dur, m in bass8:
        m = m if m >= 28 else m + 12
        y = ks(float(mtof(m)), dur, r2, bright=0.6, decay=1.0, amp=0.9, rel=0.015)
        tt = np.arange(len(y)) / FS
        y += np.sin(2 * np.pi * float(mtof(m)) * tt) * 0.3 * np.where(tt < dur, 1, 0)
        S.put(di, y, t)
    di /= np.max(np.abs(di)) + 1e-9
    x = np.tanh(di * 2.6) / np.tanh(2.6)
    return filt(filt(filt(x, 'lp', 3000, 0.7), 'hp', 35, 0.7), 'peak', 900, 1.0, 4.0)


def render_shouts():
    out = np.zeros((N, 2)); r2 = np.random.default_rng(92)
    cache = {}
    for t, kind, dur, v in shouts:
        key = (kind, round(dur, 3), r2.integers(3))   # 3 種類のテイクを使い回して自然に
        if key not in cache:
            cache[key] = chant.crowd(kind, dur, np.random.default_rng(hash(key) % 1000), voices=10)
        S.put(out, cache[key], t + r2.normal(0, 0.004), v)
    return out


def render_claps():
    import stage2
    out = np.zeros((N, 2)); c = stage2.clap()
    for t, v in claps:
        S.put(out, pan_mono(c, 0), t, v)
    return out


def main():
    t0 = time.time()
    kit = drum_kit(np.random.default_rng(6))
    print('rendering guitars...', flush=True)
    rhy_amp = dict(gain=14, tight=100, mid=(1000, 4.0), scoop=(500, -1.0), presence=(2600, 5.0), low=(120, 6.0), cab_lp=5200,
                   post_eq=(('ls', 300, 0.7, 4.0),))
    gl = amp_sim(S.render_rhythm(801), **rhy_amp)
    gr = amp_sim(S.render_rhythm(902), **rhy_amp)
    bass = render_bass()
    lead_amp = dict(gain=36, tight=220, mid=(1000, 7.0), scoop=(500, -2.0), presence=(2600, 3.0), cab_lp=5800)
    ld = amp_sim(S.render_lead(('lead',), 811), **lead_amp)
    hm = amp_sim(S.render_lead(('harm',), 812), **lead_amp)
    print('  %.1fs' % (time.time() - t0), flush=True)
    sh = render_shouts()
    cl = render_claps()
    dr = S.render_drums(kit); fxs = S.render_fx(kit)
    print('  %.1fs' % (time.time() - t0), flush=True)

    def norm(x, db):
        return x / (active_rms(x) + 1e-9) * 10 ** (db / 20)

    stems = {
        'gtrL': pan_mono(norm(gl, -16.5), -0.9), 'gtrR': pan_mono(norm(gr, -16.5), 0.9),
        'bass': pan_mono(norm(bass, -20), 0),
        'lead': pan_mono(norm(ld, -16.5), 0.0), 'harm': pan_mono(norm(hm, -19.5), 0.3),
        'shout': norm(sh, -14.5), 'clap': norm(cl, -18),
        'kick': norm(dr['kick'], -19), 'snare': norm(dr['snare'], -15.5), 'toms': norm(dr['toms'], -18),
        'hats': norm(dr['hats'], -25), 'cym': norm(dr['cym'], -24), 'fx': norm(fxs, -24),
    }
    stems['lead'] = stems['lead'] + delay_st(stems['lead'], STEP * 3, STEP * 3, fb=0.25, mix=0.15, lp=3000)
    drum_bus = stems['kick'] + stems['snare'] + stems['toms'] + stems['hats'] + stems['cym']
    drum_bus = drum_bus * 0.7 + compress(drum_bus, -24, 6, 0.003, 0.08, 6) * 0.5
    sends = {'lead': 0.18, 'harm': 0.18, 'shout': 0.35, 'clap': 0.3, 'snare': 0.15, 'toms': 0.15, 'fx': 0.3, 'gtrL': 0.03, 'gtrR': 0.03}
    send = sum(stems[k] * v for k, v in sends.items())
    rev = convolve_reverb(filt(send, 'hp', 250), make_ir(1.8, np.random.default_rng(15))) * 0.5
    mix = drum_bus + rev
    for k in stems:
        if k not in ('kick', 'snare', 'toms', 'hats', 'cym'):
            mix = mix + stems[k]
    mix = filt(mix, 'hp', 30, 0.7)
    mix = filt(mix, 'hs', 9000, 0.7, 1.5)
    mix = filt(mix, 'ls', 90, 0.7, -1.5)
    mix = compress(mix, -14, 2.5, 0.01, 0.15)
    mix = mix / (active_rms(mix, pct=95) + 1e-9) * 10 ** (-10.0 / 20)
    mix = limiter(mix, 0.87)
    fade = int(TAIL * FS)
    mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, 'stage3.wav'), mix.astype(np.float32), FS, subtype='PCM_16')
    print('done %.1fs  peak=%.3f  rms=%.4f  song=%.6f loop=%.6f' % (time.time() - t0, np.max(np.abs(mix)), np.sqrt(np.mean(mix ** 2)), SONG, LOOP_BAR * BAR))


if __name__ == '__main__':
    main()
