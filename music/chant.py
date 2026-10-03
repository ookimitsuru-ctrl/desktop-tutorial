"""群衆の掛け声 (フォルマント合成): 「VIC-TO-RY!」「HEY!」

声帯音 (ノコギリ波 + 息のノイズ) を母音ごとのフォルマント (共鳴) に通し、
子音 (V の摩擦音, K/T の破裂音, R の F3 低下, H の息) を足す。
人数分のピッチ・タイミング・声道の長さ・定位をばらして重ねると群衆の叫びになる。
"""
import numpy as np
from synth import FS, filt, polyblep_saw

# 母音のフォルマント (Hz, 帯域幅比 Q, 相対ゲイン) — 叫び声なので F1 を高め
VOWELS = {
    'I': [(480, 6, 1.0), (1850, 9, 0.6), (2550, 11, 0.35)],    # VIC の「イ」
    'O': [(560, 6, 1.0), (950, 7, 0.75), (2450, 11, 0.25)],    # TO の「オ」
    'II': [(330, 6, 1.0), (2250, 10, 0.55), (3000, 12, 0.35)], # RY の「イー」
    'R': [(400, 5, 1.0), (1150, 7, 0.6), (1650, 9, 0.5)],      # R の色 (F3 が低い)
    'E': [(620, 6, 1.0), (1750, 9, 0.6), (2550, 11, 0.3)],     # HEY の「エ」
    'Y': [(400, 6, 1.0), (2100, 10, 0.55), (2800, 12, 0.3)],   # HEY の「イ」(わたり)
}


def _formant(src, vowel, scale):
    out = np.zeros_like(src)
    for f, q, g in VOWELS[vowel]:
        out += filt(src, 'bp', f * scale, q) * g
    return out


def _voice_src(n, f0, rng, inflect=-0.12, breath=0.25):
    t = np.arange(n) / 44100
    pitch = f0 * 2 ** ((inflect * t / max(t[-1], 1e-3)) + 0.01 * np.sin(2 * np.pi * 6 * t + rng.uniform(0, 6)))
    pitch *= 1 + 0.004 * rng.standard_normal(n).cumsum() / np.sqrt(np.arange(1, n + 1))  # 微小なゆらぎ
    s = polyblep_saw(pitch) * 0.8 + rng.uniform(-1, 1, n) * breath
    return s


def _env(n, a, r):
    e = np.ones(n)
    na, nr = int(a * FS), int(r * FS)
    if na: e[:na] = np.linspace(0, 1, na)
    if nr: e[-nr:] *= np.linspace(1, 0, nr) ** 1.5
    return e


def syllable(kind, dur, f0, rng, scale=1.0):
    """1 人分の 1 音節"""
    n = int(dur * FS)
    out = np.zeros(n + int(0.08 * FS))
    if kind == 'VIC':
        # V: 有声摩擦 → 「イ」 → K の破裂
        nv = int(0.045 * FS)
        src = _voice_src(n, f0, rng)
        vow = _formant(src, 'I', scale) * _env(n, 0.03, 0.03)
        fr = filt(rng.uniform(-1, 1, nv), 'lp', 2500) * np.linspace(0.6, 0.2, nv) + _formant(src[:nv], 'I', scale) * 0.25
        out[:nv] += fr
        out[nv:n] += vow[: n - nv]
        nk = int(0.025 * FS); k0 = n - int(0.01 * FS)
        out[k0:k0 + nk] += filt(rng.uniform(-1, 1, nk), 'bp', 2600 * scale, 2) * np.exp(-np.arange(nk) / (0.006 * FS)) * 1.4
    elif kind == 'TO':
        nt = int(0.02 * FS)
        out[:nt] += filt(rng.uniform(-1, 1, nt), 'hp', 3500) * np.exp(-np.arange(nt) / (0.004 * FS)) * 1.6
        src = _voice_src(n - nt, f0 * 1.03, rng)
        out[nt:n] += _formant(src, 'O', scale) * _env(n - nt, 0.02, 0.03)
    elif kind == 'RY':
        # R の色 → 「イー」へ (2 つのフォルマントをクロスフェード)
        src = _voice_src(n, f0 * 1.06, rng, inflect=-0.3)
        r = _formant(src, 'R', scale); i = _formant(src, 'II', scale)
        w = np.clip(np.arange(n) / (0.07 * FS), 0, 1)
        out[:n] += (r * (1 - w) + i * w) * _env(n, 0.015, 0.12)
    elif kind == 'HEY':
        nh = int(0.05 * FS)
        src = _voice_src(n, f0 * 1.08, rng, inflect=-0.35, breath=0.35)
        out[:nh] += _formant(rng.uniform(-1, 1, nh), 'E', scale) * np.linspace(0.3, 0.8, nh)
        e = _formant(src, 'E', scale); y = _formant(src, 'Y', scale)
        w = np.clip((np.arange(n) - 0.6 * n) / (0.4 * n), 0, 1)
        out[:n] += (e * (1 - w) + y * w) * _env(n, 0.02, 0.1)
    return out


def crowd(kind, dur, rng, voices=9, base=None):
    """群衆: 人数分ばらして重ねたステレオ信号"""
    n = int((dur + 0.15) * FS)
    st = np.zeros((n, 2))
    for v in range(voices):
        male = v % 3 != 0
        f0 = (base or (175 if male else 290)) * 2 ** (rng.uniform(-2.5, 2.5) / 12)
        scale = rng.uniform(0.92, 1.0) if male else rng.uniform(1.08, 1.18)
        off = int(abs(rng.normal(0, 0.012)) * FS)
        y = syllable(kind, dur * rng.uniform(0.92, 1.05), f0, rng, scale)
        p = rng.uniform(-0.8, 0.8)
        L = min(len(y), n - off)
        st[off:off + L, 0] += y[:L] * np.cos((p + 1) * np.pi / 4)
        st[off:off + L, 1] += y[:L] * np.sin((p + 1) * np.pi / 4)
    st = np.tanh(st * 2.0) / 2.0   # 叫びの歪み
    return filt(filt(st, 'hp', 150), 'peak', 2800, 1.0, 3.0)
