"""BGM のドラム・打楽器（音の合成と打ち込み）。

太鼓・スネア・シンバルなどを全て波形の合成で作り（外部のサンプルは使わない）、
ステージごとの曲調（ロック・インダストリアル・祭り太鼓・軍楽・ダラブッカ・ドラムンベース・寺の太鼓・ジャンベ・トレーラー風）の
パターンで打ち込み、ルームリバーブ・バスコンプ・サチュレーションで仕上げたステレオのドラム・ステムを返す。

パターンは 1 小節 16 ステップの文字列で書く:
  x 強打, o 普通, g ゴースト（弱）, 1〜9 強さ（0.1〜0.9）, f フラム, r 32 分の 2 打, z バズロール（64 分の 4 打）, . 休み
"""
import zlib

import numpy as np
from scipy import signal

SR = 44100


# ---------------------------------------------------------------- 基本の部品

def tt(d):
    return np.arange(int(SR * d)) / SR


def env(d, decay, attack=0.0008):
    t = tt(d)
    e = np.exp(-t / decay)
    a = max(1, int(SR * attack))
    e[:a] *= np.linspace(0.0, 1.0, a)
    return e


def noise(d, rng):
    return rng.uniform(-1, 1, int(SR * d))


def _sos(kind, f):
    ny = SR / 2
    if kind == "band":
        lo, hi = f
        return signal.butter(2, [max(20, lo) / ny, min(hi, ny * 0.95) / ny], "band", output="sos")
    return signal.butter(2, min(f, ny * 0.95) / ny, kind, output="sos")


def bp(x, lo, hi):
    return signal.sosfilt(_sos("band", (lo, hi)), x)


def lp(x, f):
    return signal.sosfilt(_sos("low", f), x)


def hp(x, f):
    return signal.sosfilt(_sos("high", f), x)


def sweep(f0, f1, d, tau):
    """f0 から f1 へ指数的に下がる正弦（太鼓の皮の張りが戻る音程の動き）"""
    t = tt(d)
    f = f1 + (f0 - f1) * np.exp(-t / tau)
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def sat(x, drive):
    return np.tanh(x * drive) / np.tanh(drive)


def metal(d, freqs, rng):
    """矩形波を非整数倍で重ねた金属の響き（ハイハット・シンバル・鉦）"""
    t = tt(d)
    x = np.zeros_like(t)
    for f in freqs:
        ph = rng.uniform(0, 1)
        x += np.sign(np.sin(2 * np.pi * (f * t + ph)))
    return x / len(freqs)


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[:len(p)] += p
    return out


def norm(x):
    return x / (np.max(np.abs(x)) + 1e-9)


def gated_room(x, rng, size=0.45, gate=0.17, wet=0.6):
    """80 年代風のゲートリバーブ（短く濃い残響を途中で切る）。スネア・クラップを大きく聞かせる"""
    ir = noise(size, rng) * np.exp(-tt(size) / (size * 0.45))
    ir = lp(ir, 7000)
    w = signal.fftconvolve(x, ir)[:len(x) + int(SR * size)]
    w = norm(w)
    g = np.ones(len(w))
    k = int(SR * gate)
    fall = int(SR * 0.03)
    g[k:k + fall] = np.linspace(1, 0, fall)
    g[k + fall:] = 0
    return mix(x, w * g * wet)


# ---------------------------------------------------------------- 音色（d: 揺らぎ ±2% の音程倍率）

def kick_rock(rng, d):
    body = sweep(165 * d, 52 * d, 0.45, 0.035) * env(0.45, 0.2)
    click = hp(noise(0.004, rng), 2500) * env(0.004, 0.0015)
    sub = np.sin(2 * np.pi * 50 * d * tt(0.4)) * env(0.4, 0.2)
    return sat(mix(body, click * 0.8, sub * 0.2), 1.8)


def kick_909(rng, d):
    body = sweep(140 * d, 48 * d, 0.55, 0.05) * env(0.55, 0.3)
    click = hp(noise(0.005, rng), 2000) * env(0.005, 0.002)
    return sat(mix(body, click * 0.7), 2.6)


def sub808(rng, d):
    body = sweep(72 * d, 42 * d, 1.2, 0.08) * env(1.2, 0.75)
    click = hp(noise(0.003, rng), 3000) * env(0.003, 0.001)
    return sat(mix(body, click * 0.3), 1.4)


def kick_break(rng, d):
    body = sweep(185 * d, 58 * d, 0.3, 0.025) * env(0.3, 0.13)
    click = hp(noise(0.004, rng), 2500) * env(0.004, 0.0012)
    return sat(mix(body, click * 1.0), 2.4)


def bassdrum_march(rng, d):
    body = sweep(95 * d, 58 * d, 0.7, 0.06) * env(0.7, 0.4)
    felt = lp(noise(0.1, rng), 600) * env(0.1, 0.03)
    return sat(mix(body, felt * 0.5), 1.5)


def odaiko(rng, d):
    body = sweep(72 * d, 47 * d, 1.6, 0.09) * env(1.6, 0.9)
    over = np.sin(2 * np.pi * 98 * d * tt(0.8)) * env(0.8, 0.35)
    skin = lp(noise(0.25, rng), 900) * env(0.25, 0.06)
    return sat(mix(body, over * 0.3, skin * 0.7), 1.5)


def nagado(f):
    def gen(rng, d):
        body = sweep(f * 1.5 * d, f * d, 0.8, 0.05) * env(0.8, 0.45)
        skin = bp(noise(0.08, rng), 300, 2500) * env(0.08, 0.03)
        return sat(mix(body, skin * 0.55), 1.6)
    return gen


def shime(rng, d):
    tone = np.sin(2 * np.pi * 520 * d * tt(0.12)) * env(0.12, 0.05)
    crack = bp(noise(0.06, rng), 1500, 7000) * env(0.06, 0.02)
    return mix(tone * 0.7, crack)


def ka(rng, d):
    c = bp(noise(0.03, rng), 1800, 6500) * env(0.03, 0.008)
    tone = np.sin(2 * np.pi * 2100 * d * tt(0.03)) * env(0.03, 0.01)
    return mix(c, tone * 0.4)


def chappa(rng, d):
    m = hp(metal(0.7, [520 * d, 801 * d, 1153 * d, 1730 * d, 2210 * d, 3320 * d], rng), 2500)
    return m * env(0.7, 0.25)


def _snare(rng, d, f=185, wires=0.18, body_dec=0.09, wire_amt=0.9, drive=1.6):
    t = tt(0.4)
    body = np.sin(2 * np.pi * f * d * t) * env(0.4, body_dec) + np.sin(2 * np.pi * f * 1.62 * d * t) * env(0.4, body_dec * 0.6) * 0.5
    w = bp(noise(0.4, rng), 1800, 9500) * env(0.4, wires)
    return sat(mix(body * 0.75, w * wire_amt), drive)


def snare_gated(rng, d):
    return gated_room(_snare(rng, d), rng)


def snare_break(rng, d):
    return _snare(rng, d, f=212, wires=0.11, body_dec=0.07, wire_amt=0.85, drive=2.3)


def snare_march(rng, d):
    return _snare(rng, d, f=238, wires=0.2, body_dec=0.05, wire_amt=1.25, drive=1.8)


def clap(rng, d):
    x = np.zeros(int(SR * 0.3))
    for k, o in enumerate((0.0, 0.009, 0.018, 0.029)):
        b = bp(noise(0.008 if k < 3 else 0.2, rng), 900, 7000) * env(0.008 if k < 3 else 0.2, 0.004 if k < 3 else 0.09)
        i = int(SR * o)
        x[i:i + len(b)] += b[:len(x) - i]
    return gated_room(x, rng, size=0.35, gate=0.14, wet=0.5)


def tom(f):
    def gen(rng, d):
        body = sweep(f * 1.7 * d, f * d, 0.8, 0.03) * env(0.8, 0.3 + 12.0 / f)
        stick = bp(noise(0.04, rng), f * 2, f * 12) * env(0.04, 0.012)
        return sat(mix(body, stick * 0.45), 1.7)
    return gen


HAT_F = [205.3, 304.4, 369.6, 522.7, 540.0, 800.0]


def hat_c(rng, d):
    return bp(metal(0.08, [f * 2.1 * d for f in HAT_F], rng), 7000, 16000) * env(0.08, 0.025)


def hat_o(rng, d):
    return bp(metal(0.5, [f * 2.1 * d for f in HAT_F], rng), 6500, 16000) * env(0.5, 0.17)


def ride(rng, d):
    t = tt(1.6)
    bell = sum(np.sin(2 * np.pi * f * d * t) * a for f, a in ((620, 1.0), (1255, 0.5), (2210, 0.3))) * env(1.6, 0.5)
    wash = hp(metal(1.6, [f * 3.0 * d for f in HAT_F], rng), 3500) * env(1.6, 0.7)
    return mix(bell * 0.25, wash * 0.8)


def crash(rng, d):
    n = hp(noise(2.2, rng), 3500) * env(2.2, 0.75, 0.002)
    m = hp(metal(2.2, [f * 2.6 * d for f in HAT_F], rng), 4500) * env(2.2, 0.55)
    return mix(n * 0.8, m * 0.6)


def boom(rng, d):
    sub = sweep(62 * d, 34 * d, 2.6, 0.15) * env(2.6, 1.3)
    thud = lp(noise(0.4, rng), 400) * env(0.4, 0.1)
    return sat(mix(sub, thud * 0.8, crash(rng, d) * 0.25), 1.6)


def anvil(rng, d):
    t = tt(1.0)
    x = sum(np.sin(2 * np.pi * 880 * d * r * t + r) * a * np.exp(-t / dec) for r, a, dec in
            ((1.0, 1.0, 0.5), (2.76, 0.6, 0.35), (5.4, 0.4, 0.2), (8.93, 0.25, 0.12)))
    click = hp(noise(0.004, rng), 3000) * env(0.004, 0.001)
    return mix(x * 0.7, click)


def dock_clang(rng, d):
    t = tt(1.2)
    x = sum(np.sin(2 * np.pi * 410 * d * r * t + r) * a * np.exp(-t / dec) for r, a, dec in
            ((1.0, 1.0, 0.6), (1.59, 0.7, 0.45), (2.14, 0.5, 0.35), (2.65, 0.4, 0.25), (3.41, 0.25, 0.18)))
    hit = bp(noise(0.05, rng), 600, 4000) * env(0.05, 0.012)
    return sat(mix(x * 0.7, hit), 1.3)


def timpani(f):
    def gen(rng, d):
        t = tt(2.0)
        drift = 1.0 + 0.02 * np.exp(-t / 0.08)
        ph = 2 * np.pi * np.cumsum(f * d * drift) / SR
        x = np.sin(ph) * env(2.0, 0.9) + np.sin(1.5 * ph) * env(2.0, 0.5) * 0.3 + np.sin(2.0 * ph) * env(2.0, 0.35) * 0.2
        mallet = lp(noise(0.03, rng), 1500) * env(0.03, 0.008)
        return sat(mix(x, mallet * 0.4), 1.3)
    return gen


def dum(rng, d):
    body = sweep(165 * d, 108 * d, 0.5, 0.02) * env(0.5, 0.26)
    skin = lp(noise(0.05, rng), 500) * env(0.05, 0.015)
    return sat(mix(body, skin * 0.35), 1.4)


def tek(rng, d):
    c = bp(noise(0.06, rng), 2500, 9500) * env(0.06, 0.016)
    tone = np.sin(2 * np.pi * 810 * d * tt(0.06)) * env(0.06, 0.025)
    return mix(c, tone * 0.5)


def ka_dar(rng, d):
    return lp(tek(rng, d * 0.92), 6000) * 0.8


def frame_drum(rng, d):
    body = sweep(96 * d, 70 * d, 0.8, 0.03) * env(0.8, 0.45)
    buzz = bp(noise(0.4, rng), 300, 3000) * env(0.4, 0.18) * (0.6 + 0.4 * np.sin(2 * np.pi * 90 * tt(0.4)))
    return sat(mix(body, buzz * 0.3), 1.4)


def riq(rng, d):
    x = np.zeros(int(SR * 0.2))
    for o in (0.0, 0.006, 0.013):
        m = hp(metal(0.15, [f * 4.0 * d for f in HAT_F], rng), 6000) * env(0.15, 0.05)
        i = int(SR * o)
        x[i:i + len(m)] += m[:len(x) - i]
    return x


def zills(rng, d):
    t = tt(1.2)
    x = sum(np.sin(2 * np.pi * f * d * t) * a for f, a in ((2750, 1.0), (4120, 0.6), (5980, 0.4))) * env(1.2, 0.45)
    return x * 0.6


def djembe_bass(rng, d):
    return sat(sweep(112 * d, 74 * d, 0.45, 0.02) * env(0.45, 0.24), 1.5)


def djembe_tone(rng, d):
    t = tt(0.25)
    x = np.sin(2 * np.pi * 335 * d * t) * env(0.25, 0.11) + np.sin(2 * np.pi * 520 * d * t) * env(0.25, 0.06) * 0.4
    click = bp(noise(0.02, rng), 1000, 5000) * env(0.02, 0.005)
    return mix(x, click * 0.4)


def djembe_slap(rng, d):
    c = bp(noise(0.1, rng), 1200, 7500) * env(0.1, 0.035)
    tone = np.sin(2 * np.pi * 470 * d * tt(0.1)) * env(0.1, 0.04)
    return sat(mix(c, tone * 0.6), 1.5)


def conga(f):
    def gen(rng, d):
        x = sweep(f * 1.08 * d, f * d, 0.35, 0.01) * env(0.35, 0.16)
        click = bp(noise(0.015, rng), 1500, 6000) * env(0.015, 0.004)
        return mix(x, click * 0.35)
    return gen


def shaker(rng, d):
    n = bp(noise(0.12, rng), 4000, 13000)
    t = tt(0.12)
    e = (1 - np.exp(-t / 0.012)) * np.exp(-t / 0.035)
    return n * e


def tamb(rng, d):
    return hp(metal(0.25, [f * 5.0 * d for f in HAT_F], rng), 6500) * env(0.25, 0.08)


def mokugyo(rng, d):
    t = tt(0.2)
    x = np.sin(2 * np.pi * 760 * d * t) * env(0.2, 0.06) + np.sin(2 * np.pi * 1290 * d * t) * env(0.2, 0.04) * 0.5
    click = bp(noise(0.006, rng), 2000, 7000) * env(0.006, 0.002)
    return mix(x, click * 0.4)


def kane(rng, d):
    t = tt(4.0)
    x = sum(np.sin(2 * np.pi * 312 * d * r * t + r) * a * np.exp(-t / dec) for r, a, dec in
            ((1.0, 1.0, 2.6), (1.006, 0.6, 2.4), (2.32, 0.6, 1.7), (2.76, 0.5, 1.4), (4.07, 0.3, 0.9), (5.4, 0.2, 0.6)))
    return x * 0.5


def otsuzumi(rng, d):
    c = bp(noise(0.05, rng), 1500, 8500) * env(0.05, 0.012)
    tone = np.sin(2 * np.pi * 1120 * d * tt(0.08)) * env(0.08, 0.03)
    return sat(mix(c, tone * 0.7), 1.6)


def kotsuzumi(rng, d):
    x = sweep(430 * d, 330 * d, 0.3, 0.012) * env(0.3, 0.12)
    return mix(x, np.sin(2 * np.pi * 660 * d * tt(0.12)) * env(0.12, 0.05) * 0.3)


VOICES = {
    "kick_rock": kick_rock, "kick_909": kick_909, "sub808": sub808, "kick_break": kick_break, "bassdrum_march": bassdrum_march,
    "odaiko": odaiko, "nagado_hi": nagado(108), "nagado_lo": nagado(82), "shime": shime, "ka": ka, "chappa": chappa,
    "snare_gated": snare_gated, "snare_break": snare_break, "snare_march": snare_march, "clap": clap,
    "tom_hi": tom(205), "tom_mid": tom(152), "tom_lo": tom(116), "tom_floor": tom(86),
    "hat_c": hat_c, "hat_o": hat_o, "ride": ride, "crash": crash, "boom": boom, "anvil": anvil, "dock_clang": dock_clang,
    "timp_lo": timpani(65.4), "timp_hi": timpani(98.0), "dum": dum, "tek": tek, "ka_dar": ka_dar, "frame": frame_drum,
    "riq": riq, "zills": zills, "djembe_bass": djembe_bass, "djembe_tone": djembe_tone, "djembe_slap": djembe_slap,
    "conga_hi": conga(330), "conga_lo": conga(248), "shaker": shaker, "tamb": tamb, "mokugyo": mokugyo, "kane": kane,
    "otsuzumi": otsuzumi, "kotsuzumi": kotsuzumi,
}


# ---------------------------------------------------------------- 曲調ごとのパターン
# voices: 文字 → (音色, 音量, 定位 -1〜1, リバーブへの送り)
# intro / BRK: 小節ごとの並び（最後は全小節のフィル）。A / B / A2: 繰り返すパターン
# fills: 区切りの最後の小節の後半（8〜15 ステップ）、small: 4 小節目の最後の拍（12〜15 ステップ）

def P(**kw):
    return kw


STYLES = {
    # 大闘技場: アリーナ・ロック（ゲートリバーブのスネア、タムの回し）
    "rock": dict(rt=1.1, swing=0.0, crash="C", rev=True, riser=False, low_cut=0.6, air=0.9,
        voices={"K": ("kick_rock", 0.85, 0.0, 0.06), "S": ("snare_gated", 1.0, 0.05, 0.2), "H": ("hat_c", 0.45, 0.3, 0.02),
                "O": ("hat_o", 0.4, 0.3, 0.05), "R": ("ride", 0.4, -0.35, 0.05), "C": ("crash", 0.6, -0.4, 0.15),
                "1": ("tom_hi", 0.62, 0.4, 0.18), "2": ("tom_mid", 0.65, 0.15, 0.18), "3": ("tom_lo", 0.7, -0.15, 0.18),
                "4": ("tom_floor", 0.78, -0.4, 0.18), "P": ("clap", 0.55, 0.0, 0.2)},
        intro=[P(**{"4": "x...x...x...x..."}),
               P(**{"4": "x...x...x...x..."}, S="....x.......x..."),
               P(K="x.....x.x.......", S="....x.......x...", H="o.o.o.o.o.o.o.o."),
               P(**{"1": "....xx..........", "2": "......xx........", "3": "........xx......", "4": "..........xxxx.."}, K="x.......x.x.x.xx", S="x.g.x.........rr")],
        A=[P(K="x.....x.x.......", S="....x.......x...", H="x.o.x.o.x.o.x.o."),
           P(K="x.....x...x.x...", S="....x.......x..g", H="x.o.x.o.x.o.x.o.", O="..............x.")],
        B=[P(K="x.......x.x.....", S="........x.......", R="x.x.x.x.x.x.x.x.", P="........x.......", **{"4": "x..x..x...x..x.."}),
           P(K="x.......x...x.x.", S="........x.....g.", R="x.x.x.x.x.x.x.x.", P="........x.......", **{"4": "x..x..x...x.x..."})],
        BRK=[P(K="x...x...x...x...", **{"1": "x.x.............", "2": "....x.x.........", "3": "........x.x.....", "4": "............x.x."}),
             P(K="x.x...x.x.x...x.", S="....x..x....x..x", **{"4": "..x.......x....."}),
             P(K="x...x...x...x...", **{"1": "xxxx............", "2": "....xxxx........", "3": "........xxxx....", "4": "............xxxx"}),
             P(K="x...x...x.x.xxxx", S="x.x.x.x.xxxxrrrr")],
        A2=[P(K="x.....x.x.......", S="....x.......x...", H="xoxoxoxoxoxoxoxo", **{"4": "x..............."}),
            P(K="x.....x...x.x...", S="....x.......x.gx", H="xoxoxoxoxoxoxoxo", O="..............x.")],
        fills=[P(K="........x.....x.", S="........x.x.xxrr"),
               P(K="........x...x...", **{"1": "........xx......", "2": "..........xx....", "3": "............x...", "4": ".............xxx"})],
        small=[P(S="............xgxr"), P(**{"2": "............xx..", "4": "..............xx"})]),
    # 埠頭の夜: インダストリアル（4 つ打ち、金属を叩く音、低いブーム）
    "industrial": dict(rt=1.5, swing=0.0, crash="C", rev=True, riser=True,
        voices={"K": ("kick_909", 1.0, 0.0, 0.03), "B": ("sub808", 0.38, 0.0, 0.0), "P": ("clap", 0.95, 0.0, 0.25),
                "H": ("hat_c", 0.42, 0.35, 0.02), "O": ("hat_o", 0.42, 0.35, 0.06), "M": ("dock_clang", 0.55, -0.45, 0.35),
                "A": ("anvil", 0.45, 0.5, 0.3), "Z": ("shaker", 0.38, -0.25, 0.05), "3": ("tom_lo", 0.6, -0.3, 0.25),
                "4": ("tom_floor", 0.7, 0.3, 0.25), "C": ("crash", 0.45, 0.3, 0.2)},
        intro=[P(K="x...x...x...x..."), P(K="x...x...x...x...", Z="o.o.o.o.o.o.o.o."),
               P(K="x...x...x...x...", Z="ogogogogogogogog", M="..............x.", B="x..............."),
               P(K="x...x...x.x.x.xx", P="x.x.x.x.xxxxxxxx")],
        A=[P(K="x...x...x...x...", P="....x.......x...", O="..o...o...o...o.", Z="ogogogogogogogog", M="..............x.", B="x..............."),
           P(K="x...x...x...x.x.", P="....x.......x...", O="..o...o...o...o.", Z="ogogogogogogogog", A="......x.........", B="x.........x.....")],
        B=[P(K="x..x..x...x..x..", P="....x.......x...", H="x.x.x.x.x.x.x.x.", M="x.......x.......", **{"4": "..x...x.x.....x."}, B="x..............."),
           P(K="x..x..x...x.x...", P="....x.......x..x", H="x.x.x.x.x.x.x.x.", M="....x.......x...", **{"3": "...x......x....."}, B="x.....x.........")],
        BRK=[P(K="x.......x.......", M="x..x..x.x..x..x."), P(K="x.......x.......", M="x..x..x.x..x..x.", A="..x...x...x...x."),
             P(K="x.x.x.x.x.x.x.x.", P="....x.......x...", A="x...x...x...x...", B="x..............."),
             P(K="xxxxxxxxxxxxxxxx", P="x.x.x.x.xxxxxxxx")],
        A2=[P(K="x...x...x...x...", P="....x.......x...", O="..o...o...o...o.", H="xgxgxgxgxgxgxgxg", M="..............x.", B="x..............."),
            P(K="x...x...x...x.x.", P="....x.......x..x", O="..o...o...o...o.", H="xgxgxgxgxgxgxgxg", A="......x.....x...", B="x.........x.....")],
        fills=[P(K="........x...x...", P="........x.x.xxxx"), P(K="........x.x.x.x.", **{"4": "........x.x.xxxx"}, M="..............x.")],
        small=[P(P="............x.xx")]),
    # 竹林: 祭りの太鼓（大太鼓・長胴太鼓・締太鼓・カネ）
    "taiko": dict(rt=2.0, swing=0.0, crash="C", rev=False, riser=False, air=1.4,
        voices={"O": ("odaiko", 0.85, 0.0, 0.35), "N": ("nagado_hi", 0.75, 0.3, 0.3), "L": ("nagado_lo", 0.72, -0.3, 0.3),
                "S": ("shime", 1.0, 0.15, 0.12), "K": ("ka", 0.95, -0.1, 0.08), "C": ("chappa", 0.75, 0.45, 0.15)},
        intro=[P(O="x..............."), P(O="x.......x.......", N="....x.......x..."),
               P(O="x.......x.......", N="....x..x....x.x.", S="x.x.x.x.x.x.x.x."),
               P(O="x...............", N="x.x.x.x.xxxxxxxx", L="x...x...x.x.x.x.", S="xxxxxxxxxxxxxxxx")],
        A=[P(O="x.........x.....", N="....x..x....x...", L="x.....x.....x...", S="x.xxx.xxx.xxx.xx", K="..x...x...x...x."),
           P(O="x.....x...x.....", N="....x..x....x.x.", L="x.....x.....x...", S="x.xxx.xxx.xxx.xx", K="..x...x...x...x.")],
        B=[P(O="x...x...x...x...", N="..x...x...x...x.", L="x..x..x.x..x..x.", S="x.x.x.x.x.x.x.x.", C="....x.......x..."),
           P(O="x...x...x...x...", N="..x..xx...x..xx.", L="x..x..x.x..x....", S="x.x.x.x.x.x.x.x.", C="....x.......x...")],
        BRK=[P(O="x..x..x...x..x..", L="x..x..x...x..x.."), P(N="x.x.xx.xx.x.xx.x", S="xxxxxxxxxxxxxxxx", O="x.......x......."),
             P(O="x...x...x...x...", N="xxxxxxxxxxxxxxxx", L="x.x.x.x.x.x.x.x."),
             P(O="x.......x.x.x.x.", N="x.x.x.x.xxxxxxxx", L="x.x.x.x.xxxxxxxx", S="xxxxxxxxxxxxxxxx", C="x...x...x...x...")],
        A2=[P(O="x.........x.x...", N="....x..x....x...", L="x.x...x.x...x...", S="x.xxx.xxx.xxx.xx", K="..x...x...x...x.", C="x..............."),
            P(O="x.....x...x...x.", N="....x..x....x.xx", L="x.x...x.x...x...", S="x.xxx.xxx.xxx.xx", K="..x...x...x...x.")],
        fills=[P(O="............x...", N="........x.xxx.xx", L="........x.x.x.x.")],
        small=[P(N="............xxxx")]),
    # 砦: 軍楽（スネアのルーディメンツ・バスドラム・ティンパニ）
    "march": dict(rt=1.8, swing=0.0, crash="C", rev=False, riser=False,
        voices={"S": ("snare_march", 0.85, 0.12, 0.15), "B": ("bassdrum_march", 0.9, -0.05, 0.2), "T": ("timp_lo", 0.8, -0.3, 0.35),
                "U": ("timp_hi", 0.7, 0.3, 0.35), "C": ("crash", 0.45, 0.0, 0.3)},
        intro=[P(B="x.......x.......", T="x..............."), P(B="x.......x.......", S="x.gfx.g.x.gfx.g.", T="x.......x......."),
               P(B="x.......x.......", S="x.ggx.g.x.ggf.g.", T="x.......x.......", U="....x.......x..."),
               P(S="zzzzzzzzzzzzzzzx", B="x...x...x.x.x.x.", T="x.x.x.x.x.x.x.x.")],
        A=[P(B="x.......x.......", S="x.ggx.g.x.ggf.g.", T="x.......x......."),
           P(B="x.......x...x...", S="x.ggx.g.f.ggzzzz", U="x.......x.......")],
        B=[P(B="x...x...x...x...", S="f..gx..gf..gx.gg", T="x..x..x.x......."),
           P(B="x...x...x...x...", S="f..gx..gf.gzzzzz", U="x..x..x.x.......")],
        BRK=[P(S="x.gfx.gfx.gfx.gf"), P(S="x.gfx.gfx.gfx.gf", B="x...x...x...x..."),
             P(S="zzzzzzzzzzzzzzzz", T="x.x.x.x.x.x.x.x."),
             P(S="x.x.x.x.zzzzzzzx", B="x...x...x.x.x.x.", T="x.x.x.x.x.x.x.x.", U="........x.x.x.x.")],
        A2=[P(B="x.......x.......", S="x.ggx.g.x.ggf.g.", T="x...x...x...x..."),
            P(B="x.......x...x...", S="x.ggx.g.f.ggzzzz", U="x...x...x...x...", T="x.......x.......")],
        fills=[P(S="........zzzzzzzx", T="............x.x.")],
        small=[P(S="............zzzx")]),
    # 砂漠の遺跡: ダラブッカとフレームドラム（マクスーム・サイーディ）
    "darbuka": dict(rt=1.1, swing=0.04, crash="Y", rev=False, riser=False,
        voices={"D": ("dum", 0.75, 0.0, 0.15), "T": ("tek", 1.0, 0.18, 0.1), "K": ("ka_dar", 0.7, -0.18, 0.08),
                "F": ("frame", 0.6, -0.3, 0.25), "R": ("riq", 0.55, 0.38, 0.08), "Y": ("zills", 0.45, 0.45, 0.2)},
        intro=[P(F="x.......x......."), P(F="x.......x.......", R="o.o.o.o.o.o.o.o."),
               P(D="x.....x.x.......", T="..x.......x.x...", F="x.......x.......", R="o.o.o.o.o.o.o.o."),
               P(D="x.......x...x...", T="x.x.x.x.x.x.xxxx", K=".x.x.x.x.x.x....")],
        A=[P(D="x.....x.x.......", T="..x..x....x.....", K=".g.g...g.g.g.g.g", F="x.......x.......", R="o.o.o.o.o.o.o.o."),
           P(D="x.....x.x...x...", T="..x..x....x...x.", K=".g.g...g.g.g....", F="x.......x.......", R="o.o.o.o.o.o.o.o.")],
        B=[P(D="x.....x.x.....x.", T="..x.......x.x...", K=".g.g.g...g...g.g", F="x...x...x...x...", Y="....x.......x..."),
           P(D="x.....x.x.....x.", T="..x..x....x.x...", K=".g.g.g...g......", F="x...x...x...x...", Y="....x.......x...")],
        BRK=[P(T="x.x.x.x.x.x.x.x.", K=".x.x.x.x.x.x.x.x", D="x.......x......."), P(D="x..x..x.x..x..x.", T="..x..x....x..x.."),
             P(T="xxxxxxxxxxxxxxxx", D="x...x...x...x..."), P(D="x.x.x.x.x.x.x.x.", T=".x.x.x.x.xxxxxxx", F="x...x...x...x...")],
        A2=[P(D="x.....x.x.......", T="..x..x....x...x.", K=".g.g...g.g.g.g.g", F="x...x...x...x...", R="xoxoxoxoxoxoxoxo"),
            P(D="x.....x.x...x...", T="..x..x....x.xx..", K=".g.g...g.g.g....", F="x...x...x...x...", R="xoxoxoxoxoxoxoxo")],
        fills=[P(D="........x.....x.", T="........xxxxxxxx")],
        small=[P(T="............xxxx")]),
    # 摩天楼: ドラムンベース（自作のブレイクビーツ）
    "dnb": dict(rt=0.8, swing=0.0, crash="C", rev=True, riser=True,
        voices={"K": ("kick_break", 1.0, 0.0, 0.03), "S": ("snare_break", 0.85, 0.05, 0.12), "H": ("hat_c", 0.26, 0.3, 0.02),
                "O": ("hat_o", 0.28, 0.3, 0.05), "R": ("ride", 0.24, -0.35, 0.05), "B": ("sub808", 0.7, 0.0, 0.0), "C": ("crash", 0.45, -0.3, 0.15)},
        intro=[P(H="x.x.x.x.x.x.x.x."), P(H="xgxgxgxgxgxgxgxg", K="x..............."),
               P(K="x.........x.....", S="....x.......x...", H="x.x.x.x.x.x.x.x."),
               P(K="x.....x...x.....", S="x.xx.xx.xxxxrrrr")],
        A=[P(K="x.........x.....", S="....x.......x...", H="x.x.x.x.x.x.x.x.", B="x.........x....."),
           P(K="x.x.......xx....", S="....x..x.x..x..x", H="x.x.x.x.x.x.x.x.", B="x.........x.....")],
        B=[P(K="x.........x.....", S="....x.......x...", R="x.x.x.x.x.x.x.x.", B="x..............."),
           P(K="x.x.......x.....", S="....x..g.g..x...", R="x.x.x.x.x.x.x.x.", B="x.........x.....")],
        BRK=[P(K="x.x...x...x.x...", S="....x..xx...x..x"), P(K="x.....x.x.......", S="..x.x...x.x.xx.x"),
             P(K="x.......x.x.x.x.", S="x.x.x.x.rrrrrrrr"), P(K="x...x...x...x...", S="rrrrrrrrrrrrrrrr")],
        A2=[P(K="x.........x.....", S="....x..g....x..g", H="xgxgxgxgxgxgxgxg", O="..............x.", B="x.........x....."),
            P(K="x.x.......xx....", S="....x..x.x..x..x", H="xgxgxgxgxgxgxgxg", B="x.........x.....")],
        fills=[P(K="........x....x..", S="........x.xrx.rr")],
        small=[P(S="............xrxr")]),
    # 古寺: 重い太鼓と鐘・木魚・鼓
    "temple": dict(rt=2.8, swing=0.0, crash="C", rev=False, riser=False, air=1.6,
        voices={"O": ("odaiko", 0.85, 0.0, 0.45), "L": ("nagado_lo", 0.75, -0.25, 0.35), "W": ("mokugyo", 0.75, 0.3, 0.15),
                "Q": ("otsuzumi", 1.0, -0.35, 0.25), "P": ("kotsuzumi", 0.7, 0.35, 0.25), "G": ("kane", 0.85, 0.0, 0.5),
                "C": ("chappa", 0.65, 0.4, 0.2)},
        intro=[P(G="x..............."), P(O="x...............", G="........x......."), P(O="x.......x.......", W="x...x...x...x..."),
               P(O="x.......x.x.x.xx", L="....x.x.x.x.x.x.", Q="x...............")],
        A=[P(O="x.......x.......", L="....x.....x.x...", W="x.x.x.x.x.x.x.x.", Q="x.....x.........", P="..x.......x...x.", G="x..............."),
           P(O="x.....x.x.......", L="....x.....x.x.x.", W="x.x.x.x.x.x.x.x.", Q="......x.....x...", P="..x.......x.....")],
        B=[P(O="x..x..x...x..x..", L="x.x.x.x.x.x.x.x.", W="x...x...x...x...", Q="....x.......x..."),
           P(O="x..x..x...x.x...", L="x.x.x.x.x.x.xxxx", Q="....x.......x...", G="x...............")],
        BRK=[P(O="x...x...x...x..."), P(O="x.x.x.x.x.x.x.x.", L=".x.x.x.x.x.x.x.x"), P(O="x...x...x...x...", L="xxxxxxxxxxxxxxxx"),
             P(O="x.x.x.x.xxxxxxxx", L="xxxxxxxxxxxxxxxx", Q="x...x...x...x...")],
        A2=[P(O="x.......x.x.....", L="..x.x...x.x.x...", W="x.x.x.x.x.x.x.x.", Q="x.....x.........", P="..x.......x...x.", G="x..............."),
            P(O="x.....x.x...x...", L="..x.x...x.x.x.x.", W="x.x.x.x.x.x.x.x.", Q="......x.....x...", P="..x.......x.....")],
        fills=[P(O="............x..x", L="........x.x.xxxx")],
        small=[P(L="............x.xx")]),
    # 川の筏: ジャンベとコンガ
    "djembe": dict(rt=0.9, swing=0.06, crash="Y", rev=False, riser=False,
        voices={"J": ("djembe_bass", 0.85, -0.1, 0.12), "T": ("djembe_tone", 0.65, -0.1, 0.1), "S": ("djembe_slap", 0.75, -0.1, 0.12),
                "H": ("conga_hi", 0.6, 0.38, 0.1), "L": ("conga_lo", 0.55, 0.25, 0.1), "Z": ("shaker", 0.42, 0.45, 0.05),
                "K": ("kick_rock", 0.5, 0.0, 0.05), "Y": ("tamb", 0.42, -0.45, 0.05)},
        intro=[P(Z="x.x.x.x.x.x.x.x."), P(Z="xgxgxgxgxgxgxgxg", J="x.....x...x....."),
               P(Z="xgxgxgxgxgxgxgxg", J="x.....x...x.....", T="..x.x.....x.x..."),
               P(S="x.x.x.x.xxxxxxxx", J="x...x...x...x...")],
        A=[P(J="x.....x...x.....", T="..x.x.....x.x...", S="........x.....x.", H="..x...x...x...x.", L="x.......x.......", Z="xgxgxgxgxgxgxgxg", K="x.......x......."),
           P(J="x.....x...x...x.", T="..x.x.....x.x...", S="....x...x.....x.", H="..x...x...x...x.", L="x.......x.......", Z="xgxgxgxgxgxgxgxg", K="x.......x.......")],
        B=[P(J="x..x..x...x..x..", S="..x...x...x...x.", H="x.x.x.x.x.x.x.x.", L="....x.......x...", Z="xgxgxgxgxgxgxgxg", Y="....x.......x..."),
           P(J="x..x..x...x.x...", S="..x...x...x.x.x.", H="x.x.x.x.x.x.x.x.", L="....x.......x...", Z="xgxgxgxgxgxgxgxg", Y="....x.......x...")],
        BRK=[P(S="x.x.xx.x.x.xx.x.", J="x.......x......."), P(T="xxx.xxx.xxx.xxxx", J="x...x...x...x..."),
             P(S="x.x.x.x.x.x.x.x.", T=".x.x.x.x.x.x.x.x"), P(S="xxxxxxxxxxxxxxxx", J="x...x...x.x.x.x.")],
        A2=[P(J="x.....x...x.....", T="..x.x.....x.x...", S="....x...x.....x.", H="..x...x...x...x.", L="x...x...x...x...", Z="xgxgxgxgxgxgxgxg", K="x.......x.......", Y="....x.......x..."),
            P(J="x.....x...x...x.", T="..x.x.....x.x...", S="....x...x...x.x.", H="..x...x...x...x.", L="x...x...x...x...", Z="xgxgxgxgxgxgxgxg", K="x.......x.......", Y="....x.......x...")],
        fills=[P(J="........x.....x.", S="........x.x.xxxx")],
        small=[P(S="............xxxx")]),
    # 嵐の灯台（ボス）: トレーラー風（巨大なブーム・太鼓の合奏・金床・上昇音）
    "epic": dict(rt=2.4, swing=0.0, crash="C", rev=True, riser=True,
        voices={"X": ("boom", 0.85, 0.0, 0.4), "K": ("kick_rock", 0.75, 0.0, 0.1), "S": ("snare_gated", 0.95, 0.0, 0.3),
                "O": ("odaiko", 0.75, 0.0, 0.45), "3": ("tom_lo", 0.7, -0.35, 0.3), "4": ("tom_floor", 0.75, 0.35, 0.3),
                "2": ("tom_mid", 0.55, -0.1, 0.3), "A": ("anvil", 0.55, 0.4, 0.35), "C": ("crash", 0.6, 0.0, 0.25)},
        intro=[P(X="x..............."), P(X="x.......x......."), P(O="x..x..x...x..x..", X="x..............."),
               P(X="x...............", S="........x.x.xxxx", **{"3": "x.x.x.x.xxxxxxxx", "4": "x.x.x.x.xxxxxxxx"})],
        A=[P(X="x...............", O="x..x..x...x..x..", S="....x.......x...", A="............x...", **{"3": "x.x.x.x.x.x.x.x."}),
           P(X="x.......x.......", O="x..x..x...x.x...", S="....x.......x.xx", A="....x...........", **{"4": "x.x.x.x.x.x.x.x."})],
        B=[P(X="x.......x.......", K="x.....x.x.......", S="........x.......", A="........x.......", **{"3": "x.xx.xx.x.xx.xx.", "4": "..x...x...x...x."}),
           P(X="x...............", K="x.....x.x...x...", S="........x.....xx", A="........x.......", **{"3": "x.xx.xx.x.xx.xx.", "4": "..x...x...x.x.x."})],
        BRK=[P(O="x...x...x...x..."), P(O="x.x.x.x.x.x.x.x.", **{"4": "x...x...x...x..."}),
             P(O="x...x...x...x...", **{"3": "xxxxxxxxxxxxxxxx", "4": "xxxxxxxxxxxxxxxx"}),
             P(X="x...............", S="xxxxxxxxxxxxxxxx", **{"3": "x.x.x.x.xxxxxxxx", "2": "........xxxxxxxx"})],
        A2=[P(X="x...............", K="x.....x.x.......", O="x..x..x...x..x..", S="....x.......x...", A="............x...", **{"3": "x.x.x.x.x.x.x.x."}),
            P(X="x.......x.......", K="x.....x...x.x...", O="x..x..x...x.x...", S="....x.......x.xx", A="....x.......x...", **{"4": "x.x.x.x.x.x.x.x."})],
        fills=[P(S="............xxxx", **{"3": "........x.x.xxxx", "4": "........x.x.xxxx"})],
        small=[P(S="............x.xx")]),
}


# ---------------------------------------------------------------- 打ち込みとミックス

def _hits(ch, vel_scale=1.0):
    """1 ステップの文字 → [(ステップ内の時刻（拍の 1/4 を 1 とする）, 強さ)]"""
    if ch == ".":
        return []
    if ch == "x":
        return [(0.0, 1.0)]
    if ch == "o":
        return [(0.0, 0.7)]
    if ch == "g":
        return [(0.0, 0.32)]
    if ch.isdigit():
        return [(0.0, int(ch) / 10.0)]
    if ch == "f":
        return [(-0.22, 0.35), (0.0, 0.9)]
    if ch == "r":
        return [(0.0, 0.6), (0.5, 0.8)]
    if ch == "z":
        return [(k / 4.0, 0.42 + 0.03 * k) for k in range(4)]
    return [(0.0, 0.8)]


def _overlay(base, fill, from_step):
    """from_step 以降を fill で置き換えた小節パターン"""
    out = {}
    for v, pat in base.items():
        out[v] = pat[:from_step] + "." * (16 - from_step)
    for v, pat in fill.items():
        cur = out.get(v, "." * 16)
        out[v] = cur[:from_step] + pat[from_step:]
    return out


def _reverb_ir(rt, rng):
    n = int(SR * rt * 1.2)
    t = np.arange(n) / SR
    pre = int(SR * 0.012)
    irs = []
    for _ch in range(2):
        nz = rng.uniform(-1, 1, n)
        low = lp(nz, 3500) * np.exp(-t / (rt / 6.9))
        high = hp(nz, 3500) * np.exp(-t / (rt / 13.0)) * 0.5
        ir = np.concatenate([np.zeros(pre), low + high])
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    return irs


def _compress(x, thr_db=-14.0, ratio=3.0, tau=0.02, makeup=1.0):
    m = np.mean(x, axis=1)
    a = 1.0 / (tau * SR)
    e = np.sqrt(signal.lfilter([a], [1, -(1 - a)], m ** 2) + 1e-12)
    thr = 10 ** (thr_db / 20)
    g = np.where(e > thr, (e / thr) ** (1.0 / ratio - 1.0), 1.0)
    g = signal.lfilter([0.01], [1, -0.99], g)
    return x * g[:, None] * makeup


def render(style, bpm, sections, total_bars, seed=0, loop_bar=None):
    """sections: [(名前, 開始小節, 小節数)]。戻り値: total_bars 分ちょうどのステレオ。
    loop_bar を渡すと、そこから最後までを輪にして作る（最後の残響がループの頭へ回り込み、継ぎ目が切れない）。
    イントロの残響はループの頭の直前で消す（ループで戻ったときに鳴らないように）"""
    st = STYLES[style]
    rng = np.random.default_rng(seed + 7)
    spb = 60.0 / bpm
    step = spb / 4
    bar_s = 4 * spb
    n_song = int(round(total_bars * bar_s * SR))
    n_total = n_song + int(SR * 4.0)
    i_loop = int(round((loop_bar if loop_bar is not None else 0) * bar_s * SR))
    dry = np.zeros((n_total, 2))
    send = np.zeros(n_total)
    dry_in = np.zeros((n_total, 2))   # イントロだけ
    send_in = np.zeros(n_total)
    cache = {}

    def sample(name, var):
        key = (name, var)
        if key not in cache:
            vr = np.random.default_rng(zlib.crc32(f"{name}/{var}".encode()))
            cache[key] = norm(VOICES[name](vr, 1.0 + (var - 1) * 0.015))
        return cache[key]

    counter = {}
    cur = {"intro": False}

    def hit(letter, t_sec, vel):
        if letter not in st["voices"]:
            return
        name, gain, pan, snd = st["voices"][letter]
        k = counter.get(letter, 0)
        counter[letter] = k + 1
        x = sample(name, k % 3)
        # 人の揺れ: 拍より少しだけ遅れる方向にだけ揺らす（拍の前に出るとループの継ぎ目で音の頭が欠ける）
        t_sec += abs(rng.normal(0, 0.0018))
        vel = max(0.05, vel * (1 + rng.normal(0, 0.05)))
        i = int(round(max(0.0, t_sec) * SR))
        if i >= n_total:
            return
        seg = x[:n_total - i] * gain * vel ** 1.3
        a = (pan + 1) * np.pi / 4
        dd, ss = (dry_in, send_in) if cur["intro"] else (dry, send)
        dd[i:i + len(seg), 0] += seg * np.cos(a)
        dd[i:i + len(seg), 1] += seg * np.sin(a)
        ss[i:i + len(seg)] += seg * snd

    def play_bar(pat, bar):
        t0 = bar * bar_s
        for letter, s16 in pat.items():
            for k, chr_ in enumerate(s16[:16]):
                sw = st["swing"] * step if k % 2 == 1 else 0.0
                for off, v in _hits(chr_):
                    hit(letter, t0 + (k + off) * step + sw, v)

    crash_letter = st["crash"]
    for name, b0, n in sections:
        cur["intro"] = loop_bar is not None and b0 < loop_bar
        pats = st[name]
        for k in range(n):
            bar = b0 + k
            if name in ("intro", "BRK"):
                pat = dict(pats[min(k, len(pats) - 1)])
            else:
                pat = dict(pats[k % len(pats)])
                if k == n - 1:
                    pat = _overlay(pat, st["fills"][int(rng.integers(len(st["fills"])))], 8)
                elif k % 4 == 3:
                    pat = _overlay(pat, st["small"][int(rng.integers(len(st["small"])))], 12)
            play_bar(pat, bar)
            if k == 0 and name in ("A", "B", "A2", "BRK") or (name == "A2" and k == 4):
                hit(crash_letter, bar * bar_s, 1.0)
                if name != "BRK" and "X" in st["voices"]:
                    hit("X", bar * bar_s, 0.9)
    cur["intro"] = False
    # 区切りの直前の逆回しシンバル・上昇音（盛り上げ）
    starts = [b0 for name, b0, _n in sections if name in ("B", "BRK", "A2")] + [total_bars]
    for b in starts:
        t_end = b * bar_s
        if st["rev"]:
            rc = norm(crash(np.random.default_rng(b), 1.0))[:int(SR * bar_s)][::-1] * 0.45
            i = int(t_end * SR) - len(rc)
            if i >= 0:
                dry[i:i + len(rc), 0] += rc * 0.9
                dry[i:i + len(rc), 1] += rc
        if st["riser"] and b != total_bars:
            n = int(SR * bar_s)
            t = np.arange(n) / SR
            f = 300 * (20 ** (t / t[-1]))
            car = signal.sosfilt(signal.butter(2, [0.02, 0.6], "band", output="sos"), rng.uniform(-1, 1, n))
            r = car * (t / t[-1]) ** 2 * 0.35 * (0.6 + 0.4 * np.sin(2 * np.pi * np.cumsum(f) / SR * 0.01))
            r = hp(r, 400)
            i = int(t_end * SR) - n
            if i >= 0:
                dry[i:i + n, 0] += r
                dry[i:i + n, 1] += r
                send[i:i + n] += r * 0.4
    # リバーブ・バスコンプ・サチュレーション
    irl, irr = _reverb_ir(st["rt"], np.random.default_rng(seed + 99))

    def verb(snd):
        return np.stack([signal.fftconvolve(snd, irl)[:n_total], signal.fftconvolve(snd, irr)[:n_total]], axis=1)
    body = dry + verb(send) * 0.8
    if loop_bar is None:
        bus = body[:n_song].copy()
    else:
        # 輪にする: 曲の終わりからはみ出した残響をループの頭へ足す
        bus = body[:n_song].copy()
        over = body[n_song:]
        span = n_song - i_loop
        for k in range(0, len(over), span):
            part = over[k:k + span]
            bus[i_loop:i_loop + len(part)] += part
        intro = dry_in + verb(send_in) * 0.8
        fade = int(SR * 0.02)
        w = np.ones(n_total)
        w[max(0, i_loop - fade):i_loop] = np.linspace(1, 0, min(fade, i_loop))
        w[i_loop:] = 0
        bus += (intro * w[:, None])[:n_song]
    rms = np.sqrt(np.mean(bus ** 2)) + 1e-9
    bus = bus * (10 ** (-16 / 20) / rms)

    def post(x):
        x = signal.sosfilt(signal.butter(2, 30 / (SR / 2), "high", output="sos"), x, axis=0)
        low = signal.sosfilt(signal.butter(2, 120 / (SR / 2), "low", output="sos"), x, axis=0)
        high = signal.sosfilt(signal.butter(2, 3000 / (SR / 2), "high", output="sos"), x, axis=0)
        x = x - low * st.get("low_cut", 0.55) + high * st.get("air", 0.8)
        x = _compress(x, thr_db=-15.0, ratio=3.0)
        return 0.78 * x + 0.22 * np.tanh(x * 2.5) / np.tanh(2.5)
    if loop_bar is None:
        bus = post(bus)
    else:
        # フィルターとコンプの状態もループで切れないよう、ループ部分はその末尾を前に付けて処理してから捨てる
        warm = min(int(SR * 3.0), n_song - i_loop)
        lp_part = bus[i_loop:]
        ext = post(np.concatenate([lp_part[-warm:], lp_part]))[warm:]
        head = post(bus[:i_loop]) if i_loop > 0 else bus[:0]
        bus = np.concatenate([head, ext])
    return bus
