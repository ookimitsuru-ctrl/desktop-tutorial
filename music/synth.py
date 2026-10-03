"""WIRED 用 オフライン音楽合成エンジン (numpy/scipy)

- 撥弦 (拡張 Karplus-Strong) によるギター/ベースの DI 音
- 4 倍オーバーサンプリングのアンプ + キャビネット シミュレーション
- ピッチベンド/ビブラート/アーミングに対応したリードギター
- 合成ドラム、ストリングス、クワイア、ブラス、ティンパニ、FX
- リバーブ (畳み込み) とマスタリング (コンプ + リミッター)
"""
import numpy as np
from scipy import signal

FS = 44100


def mtof(m):
    return 440.0 * 2.0 ** ((np.asarray(m, dtype=float) - 69.0) / 12.0)


# ---------------------------------------------------------------- フィルタ
def biquad(kind, f0, q=0.7071, gain_db=0.0, fs=FS):
    a_ = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * min(f0, fs * 0.49) / fs
    cw, sw = np.cos(w0), np.sin(w0)
    al = sw / (2 * q)
    if kind == 'lp':
        b = [(1 - cw) / 2, 1 - cw, (1 - cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'hp':
        b = [(1 + cw) / 2, -(1 + cw), (1 + cw) / 2]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * cw, 1 - al]
    elif kind == 'peak':
        b = [1 + al * a_, -2 * cw, 1 - al * a_]; a = [1 + al / a_, -2 * cw, 1 - al / a_]
    elif kind == 'ls':
        sa = 2 * np.sqrt(a_) * al
        b = [a_ * ((a_ + 1) - (a_ - 1) * cw + sa), 2 * a_ * ((a_ - 1) - (a_ + 1) * cw), a_ * ((a_ + 1) - (a_ - 1) * cw - sa)]
        a = [(a_ + 1) + (a_ - 1) * cw + sa, -2 * ((a_ - 1) + (a_ + 1) * cw), (a_ + 1) + (a_ - 1) * cw - sa]
    elif kind == 'hs':
        sa = 2 * np.sqrt(a_) * al
        b = [a_ * ((a_ + 1) + (a_ - 1) * cw + sa), -2 * a_ * ((a_ - 1) + (a_ + 1) * cw), a_ * ((a_ + 1) + (a_ - 1) * cw - sa)]
        a = [(a_ + 1) - (a_ - 1) * cw + sa, 2 * ((a_ - 1) - (a_ + 1) * cw), (a_ + 1) - (a_ - 1) * cw - sa]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    return b, a


def filt(x, kind, f0, q=0.7071, g=0.0, fs=FS):
    b, a = biquad(kind, f0, q, g, fs)
    return signal.lfilter(b, a, x, axis=0)


def onepole_lp(x, fc, fs=FS):
    k = np.exp(-2 * np.pi * fc / fs)
    return signal.lfilter([1 - k], [1, -k], x, axis=0)


# ---------------------------------------------------------------- 発振器
def polyblep_saw(freq, phase0=0.0, fs=FS):
    """周波数配列 (Hz, サンプル毎) から帯域制限ノコギリ波を作る"""
    dt = np.asarray(freq, dtype=float) / fs
    ph = (phase0 + np.cumsum(dt)) % 1.0
    out = 2 * ph - 1
    m = (ph < dt) & (dt > 0)
    t = ph[m] / dt[m]
    out[m] -= t + t - t * t - 1
    m = (ph > 1 - dt) & (dt > 0)
    t = (ph[m] - 1) / dt[m]
    out[m] -= t * t + t + t + 1
    return out


def adsr(n, a, d, s, r, gate_len, fs=FS):
    """サンプル数 n のエンベロープ (gate_len 秒でリリース開始)"""
    t = np.arange(n) / fs
    env = np.where(t < a, t / max(a, 1e-6), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-6)))
    rel = t > gate_len
    if np.any(rel):
        lvl = env[min(int(gate_len * fs), n - 1)]
        env[rel] = lvl * np.exp(-(t[rel] - gate_len) / max(r, 1e-6))
    return env


# ---------------------------------------------------------------- 撥弦 (Karplus-Strong)
def ks(f0, dur, rng, bright=0.7, decay=3.0, mute=False, pick=0.13, amp=1.0, rel=0.02, fs=FS):
    """拡張 Karplus-Strong。分数遅延 + ループ内ローパス + ピック位置コム"""
    p = fs / f0
    kern = np.array([0.25, 0.5, 0.25]) if mute else np.array([0.5, 0.5])
    dk = (len(kern) - 1) / 2
    d = int(np.floor(p - dk)); fr = p - dk - d
    taps = np.convolve(kern, [1 - fr, fr])
    g = 10 ** (-3 * (p / fs) / decay)
    n = int((dur + rel) * fs) + 1
    ex = rng.uniform(-1, 1, d)
    a1 = 1 - bright
    if a1 > 0:
        ex = signal.lfilter([1 - a1], [1, -a1], ex)
    k = max(1, int(round(pick * d)))
    ex = ex - np.concatenate([np.zeros(k), ex[:-k]])
    ex -= ex.mean()
    x = np.zeros(n)
    m = min(d, n); x[:m] = ex[:m]
    h = d + len(taps)
    y = np.zeros(n + h)
    gt = g * taps
    for s in range(0, n, d):
        e = min(s + d, n); ln = e - s
        acc = x[s:e].copy()
        base = h + s - d
        for j in range(len(gt)):
            acc += gt[j] * y[base - j: base - j + ln]
        y[h + s: h + e] = acc
    out = y[h:]
    ne = int(dur * fs); r = max(1, int(rel * fs))
    if ne < n:
        seg = out[ne:ne + r]
        seg *= np.linspace(1, 0, len(seg))
        out[ne + r:] = 0
    return out * amp


# ---------------------------------------------------------------- アンプ・キャビネット
def amp_sim(x, gain=22.0, tight=140.0, mid=(900, 6.0), scoop=(450, -5.0), presence=(2300, 4.0),
            low=(110, 3.0), cab_lp=5200.0, post_eq=(), os=4, fs=FS):
    """ハイゲインアンプ + 4x12 キャビネットの近似 (歪み段はオーバーサンプリング)"""
    y = filt(x, 'hp', tight, 0.7)
    y = filt(y, 'peak', mid[0], 0.7, mid[1])
    y = signal.resample_poly(y, os, 1)
    fso = fs * os
    y = np.tanh(y * gain)
    y = onepole_lp(y, 9000, fso)
    y = filt(y, 'hp', 30, 0.7, 0, fso)
    y = np.tanh(y * 3.0 + 0.15) - np.tanh(0.15)
    y = filt(y, 'lp', 11000, 0.7, 0, fso)
    y = signal.resample_poly(y, 1, os)
    y = filt(y, 'peak', low[0], 0.8, low[1])
    y = filt(y, 'peak', scoop[0], 1.0, scoop[1])
    y = filt(y, 'peak', presence[0], 1.0, presence[1])
    y = filt(y, 'peak', 3300, 2.5, 2.5)
    y = filt(y, 'hp', 75, 0.7)
    y = filt(y, 'lp', cab_lp, 0.8)
    y = filt(y, 'lp', cab_lp * 1.15, 0.55)
    for kind, f, q, g in post_eq:
        y = filt(y, kind, f, q, g)
    return y


# ---------------------------------------------------------------- ドラム
def _metal(n, rng, scale=1.0, fs=FS):
    t = np.arange(n) / fs
    fr = np.array([205.3, 304.4, 369.6, 522.7, 540.0, 800.0]) * scale
    s = np.zeros(n)
    for f in fr:
        s += np.sign(np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)))
    return s / len(fr)


def drum_kit(rng, fs=FS):
    k = {}
    # キック: ピッチ下降する胴 + ビーターのクリック
    n = int(0.45 * fs); t = np.arange(n) / fs
    f = 52 + 135 * np.exp(-t / 0.025)
    body = np.sin(2 * np.pi * np.cumsum(f) / fs) * np.exp(-t / 0.12)
    click = filt(rng.uniform(-1, 1, n), 'hp', 2500) * np.exp(-t / 0.0018) * 0.9
    click += np.sin(2 * np.pi * 3200 * t) * np.exp(-t / 0.0025) * 0.35
    kick = body + click * 1.2
    kick = filt(kick, 'hp', 40, 0.7)
    k['kick'] = np.tanh(kick * 1.6) / np.tanh(1.6)
    # ツーバス用: 胴を短く、ビーター音を強く
    body2 = np.sin(2 * np.pi * np.cumsum(58 + 140 * np.exp(-t / 0.018)) / fs) * np.exp(-t / 0.055)
    k2 = filt(body2 + click * 1.6, 'hp', 55, 0.7)
    k['kick2'] = np.tanh(k2 * 1.6) / np.tanh(1.6)
    # スネア
    n = int(0.7 * fs); t = np.arange(n) / fs
    body = (np.sin(2 * np.pi * (180 + 40 * np.exp(-t / 0.01)) * t) * 0.7 + np.sin(2 * np.pi * 330 * t) * 0.3) * np.exp(-t / 0.085)
    wire = filt(filt(rng.uniform(-1, 1, n), 'hp', 1500), 'lp', 9000) * np.exp(-t / 0.17)
    crack = filt(rng.uniform(-1, 1, n), 'hp', 3000) * np.exp(-t / 0.004)
    sn = body * 0.9 + wire * 0.75 + crack * 0.6
    k['snare'] = sn / np.max(np.abs(sn))
    # タム
    for name, f0 in (('tom1', 190), ('tom2', 140), ('tom3', 98)):
        n = int(0.8 * fs); t = np.arange(n) / fs
        f = f0 * (1 + 0.45 * np.exp(-t / 0.05))
        tm = np.sin(2 * np.pi * np.cumsum(f) / fs) * np.exp(-t / 0.38)
        tm += filt(rng.uniform(-1, 1, n), 'bp', f0 * 4, 1.0) * np.exp(-t / 0.02) * 0.5
        k[name] = tm / np.max(np.abs(tm))
    # ハイハット
    n = int(0.5 * fs); t = np.arange(n) / fs
    m = _metal(n, rng, 1.0) * 0.6 + rng.uniform(-1, 1, n) * 0.5
    m = filt(filt(m, 'hp', 7000), 'hp', 6000)
    k['hat'] = m * np.exp(-t / 0.035) / 0.6
    k['ohat'] = m * np.exp(-t / 0.26) / 0.6
    # シンバル (ステレオ)
    def cymbal(dur, tau, lo, hi, sc, seed_off, bell=False):
        n = int(dur * fs); t = np.arange(n) / fs
        ch = []
        for c in range(2):
            r2 = np.random.default_rng(int(rng.integers(1 << 30)) + c + seed_off)
            m = _metal(n, r2, sc) * 0.55 + r2.uniform(-1, 1, n) * 0.8
            m = filt(filt(m, 'hp', lo), 'lp', hi)
            env = np.exp(-t / tau) * (0.65 + 0.35 * np.exp(-t / 0.05))
            s = m * env
            if bell:
                s += (np.sin(2 * np.pi * 1180 * t) + 0.6 * np.sin(2 * np.pi * 1760 * t) + 0.4 * np.sin(2 * np.pi * 2650 * t)) * np.exp(-t / 0.7) * 0.25
            ch.append(s)
        st = np.stack(ch, 1)
        return st / np.max(np.abs(st))
    k['crash'] = cymbal(3.0, 1.0, 3500, 15000, 1.7, 11)
    k['china'] = cymbal(1.6, 0.42, 1500, 9000, 1.25, 23)
    k['ride'] = cymbal(1.8, 0.65, 5000, 14000, 2.3, 37, bell=True)
    k['revcym'] = k['crash'][::-1].copy() * np.linspace(0, 1, len(k['crash']))[:, None] ** 2
    return k


def timpani(f0, rng, dur=2.0, fs=FS):
    n = int(dur * fs); t = np.arange(n) / fs
    f = f0 * (1 + 0.04 * np.exp(-t / 0.08))
    ph = 2 * np.pi * np.cumsum(f) / fs
    s = np.sin(ph) * np.exp(-t / 0.9) + 0.5 * np.sin(1.504 * ph) * np.exp(-t / 0.6) + 0.3 * np.sin(1.742 * ph) * np.exp(-t / 0.45)
    s += filt(rng.uniform(-1, 1, n), 'lp', 900) * np.exp(-t / 0.03) * 0.8
    return s / np.max(np.abs(s))


def impact(rng, dur=2.2, fs=FS):
    n = int(dur * fs); t = np.arange(n) / fs
    f = 30 + 40 * np.exp(-t / 0.15)
    s = np.sin(2 * np.pi * np.cumsum(f) / fs) * np.exp(-t / 0.8)
    s += filt(rng.uniform(-1, 1, n), 'lp', 2500) * np.exp(-t / 0.35) * 0.6
    return s / np.max(np.abs(s))


def riser(dur, rng, fs=FS):
    n = int(dur * fs); t = np.arange(n) / fs
    u = t / dur
    f = 180 * (12 ** u)
    s = polyblep_saw(f) * 0.25 + filt(rng.uniform(-1, 1, n), 'bp', 3500, 0.6) * 0.8
    s = filt(s, 'hp', 300)
    return s * u ** 2.2


# ---------------------------------------------------------------- 持続系 (ストリングス/クワイア/ブラス)
def supersaw(midi, dur, rng, voices=5, spread=14.0, vib=0.08, attack=0.3, release=0.5, fs=FS):
    """デチューンしたノコギリ波の束。戻り値はステレオ"""
    n = int((dur + release * 3) * fs); t = np.arange(n) / fs
    out = np.zeros((n, 2))
    f0 = float(mtof(midi))
    for v in range(voices):
        c = (v - (voices - 1) / 2) / max(1, (voices - 1) / 2) * spread
        vr = rng.uniform(4.0, 5.5); vp = rng.uniform(0, 6.28)
        f = f0 * 2 ** ((c + vib * 100 * np.sin(2 * np.pi * vr * t + vp)) / 1200)
        s = polyblep_saw(f, rng.uniform(0, 1))
        p = (v / max(1, voices - 1)) * 2 - 1
        out[:, 0] += s * np.cos((p * 0.8 + 1) * np.pi / 4)
        out[:, 1] += s * np.sin((p * 0.8 + 1) * np.pi / 4)
    env = adsr(n, attack, 1.0, 1.0, release, dur)
    return out * env[:, None] / voices


def brass_note(midi, dur, rng, attack=0.03, release=0.18, bright=1.0, fs=FS):
    """ブラス: 明るい音から暗い音へのクロスフェードでフィルタエンベロープを近似"""
    n = int((dur + release * 4) * fs); t = np.arange(n) / fs
    f0 = float(mtof(midi))
    s = np.zeros(n)
    for c in (-7, 0, 6):
        f = f0 * 2 ** ((c + 12 * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.4, 0, 1)) / 1200)
        s += polyblep_saw(f, rng.uniform(0, 1))
    s /= 3
    dark = onepole_lp(onepole_lp(s, 700), 900)
    brite = onepole_lp(s, 4500)
    w = 0.35 + 0.65 * np.exp(-t / 0.12) * bright
    sig = brite * w + dark * (1 - w) * 1.6
    env = adsr(n, attack, 0.25, 0.8, release, dur)
    return sig * env


def choir_note(midi, dur, rng, attack=0.45, release=0.7, fs=FS):
    n = int((dur + release * 3) * fs); t = np.arange(n) / fs
    f0 = float(mtof(midi))
    s = np.zeros(n)
    for c in (-9, 0, 8):
        vr = rng.uniform(4.6, 5.6)
        f = f0 * 2 ** ((c + 18 * np.sin(2 * np.pi * vr * t + rng.uniform(0, 6.28))) / 1200)
        s += polyblep_saw(f, rng.uniform(0, 1))
    env = adsr(n, attack, 1.0, 1.0, release, dur)
    return s * env / 3


def formant_ah(x):
    """母音「アー」のフォルマント"""
    y = filt(x, 'bp', 730, 6) * 1.0 + filt(x, 'bp', 1090, 8) * 0.55 + filt(x, 'bp', 2440, 10) * 0.25 + filt(x, 'bp', 320, 3) * 0.3
    return y


# ---------------------------------------------------------------- 空間系
def make_ir(dur=2.4, rng=None, fs=FS, predelay=0.018):
    rng = rng or np.random.default_rng(7)
    n = int(dur * fs); t = np.arange(n) / fs
    ir = np.zeros((n, 2))
    bands = [(None, 400, dur * 1.0), (400, 2000, dur * 0.85), (2000, 6000, dur * 0.6), (6000, None, dur * 0.35)]
    for c in range(2):
        noise = rng.uniform(-1, 1, n)
        acc = np.zeros(n)
        for lo, hi, t60 in bands:
            b = noise
            if lo: b = filt(b, 'hp', lo)
            if hi: b = filt(b, 'lp', hi)
            acc += b * 10 ** (-3 * t / t60)
        ir[:, c] = acc
    # 初期反射
    for d, gdb in ((0.011, -4), (0.019, -6), (0.027, -7), (0.037, -9), (0.051, -10)):
        i = int(d * fs)
        ir[i, 0] += 10 ** (gdb / 20) * 3; ir[i + int(0.003 * fs), 1] += 10 ** (gdb / 20) * 3
    pd = int(predelay * fs)
    ir = np.concatenate([np.zeros((pd, 2)), ir])
    ir *= np.linspace(1, 0, len(ir))[:, None] ** 0.3
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def convolve_reverb(x, ir):
    out = np.zeros((len(x) + len(ir) - 1, 2))
    for c in range(2):
        out[:, c] = signal.fftconvolve(x[:, c], ir[:, c])
    return out[:len(x)]


def delay_st(x, t_l, t_r, fb=0.3, mix=0.3, lp=3500, fs=FS):
    """ステレオのピンポン風ディレイ (フィードバックは反復加算で近似)"""
    out = np.zeros_like(x)
    src = x.copy()
    for k in range(1, 6):
        g = mix * (fb ** (k - 1))
        if g < 0.01:
            break
        src = onepole_lp(src, lp)
        dl, dr = int(t_l * k * fs), int(t_r * k * fs)
        if dl < len(x): out[dl:, 0] += src[:len(x) - dl, 0 if k % 2 else 1] * g
        if dr < len(x): out[dr:, 1] += src[:len(x) - dr, 1 if k % 2 else 0] * g
    return out


# ---------------------------------------------------------------- ダイナミクス
def env_follow(x, tau, fs=FS):
    k = np.exp(-1 / (tau * fs))
    return signal.lfilter([1 - k], [1, -k], x)


def compress(x, thresh_db=-16, ratio=3.5, tau=0.01, rel=0.12, makeup_db=0.0):
    p = np.mean(x ** 2, axis=1) if x.ndim == 2 else x ** 2
    lev = np.sqrt(env_follow(p, tau) + 1e-12)
    ldb = 20 * np.log10(lev + 1e-12)
    over = np.maximum(0, ldb - thresh_db)
    gr_db = -over * (1 - 1 / ratio)
    gr_db = -env_follow(-gr_db, rel)  # リリースを滑らかに
    g = 10 ** ((gr_db + makeup_db) / 20)
    return x * (g[:, None] if x.ndim == 2 else g)


def limiter(x, ceiling=0.94, look=0.004, fs=FS):
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    a = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    g = np.minimum(1.0, ceiling / np.maximum(a, 1e-9))
    w = max(3, int(look * fs))
    g = minimum_filter1d(g, size=2 * w + 1)
    g = uniform_filter1d(g, size=w)
    g = minimum_filter1d(g, size=w)
    y = x * (g[:, None] if x.ndim == 2 else g)
    return np.clip(y, -ceiling, ceiling)


def active_rms(x, win=0.1, pct=90, fs=FS):
    m = np.mean(x ** 2, axis=1) if x.ndim == 2 else x ** 2
    w = int(win * fs)
    nb = len(m) // w
    if nb == 0:
        return np.sqrt(np.mean(m))
    r = np.sqrt(m[:nb * w].reshape(nb, w).mean(1))
    r = r[r > 1e-5]
    return np.percentile(r, pct) if len(r) else 1e-9


def pan_mono(x, p):
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)], 1)
