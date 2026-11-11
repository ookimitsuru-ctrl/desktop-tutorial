#!/usr/bin/env python3
"""効果音の合成（numpy）。全て本プロジェクト用に生成したオリジナル音源。
出力: assets/audio/sfx/*.wav（16bit / 44.1kHz / モノラル）"""
import pathlib

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/audio/sfx"
rng = np.random.default_rng(20261104)


def t(dur):
    return np.arange(int(SR * dur)) / SR


def noise(dur):
    return rng.standard_normal(int(SR * dur))


def env(n, attack=0.002, decay=0.1, curve=1.0):
    x = np.arange(n) / SR
    a = np.clip(x / max(attack, 1e-5), 0, 1)
    d = np.exp(-np.maximum(x - attack, 0) / max(decay, 1e-5) * curve)
    return a * d


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo / (SR / 2), min(hi / (SR / 2), 0.99)], btype="band", output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    sos = signal.butter(order, f / (SR / 2), btype="low", output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    sos = signal.butter(order, f / (SR / 2), btype="high", output="sos")
    return signal.sosfilt(sos, x)


def sweep(f0, f1, dur, shape="exp"):
    tt = t(dur)
    if shape == "exp":
        f = f0 * (f1 / f0) ** (tt / dur)
    else:
        f = f0 + (f1 - f0) * tt / dur
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph)


def pad(x, n):
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros(n - len(x))])


def mix(*parts):
    n = max(len(p) for p in parts)
    return sum(pad(p, n) for p in parts)


def reverb(x, size=0.25, wet=0.18):
    n = int(SR * size)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * size / 5))
    ir = lp(ir, 5000)
    ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)[: len(x) + n]
    return pad(x, len(y)) * (1 - wet) + y * wet


def sat(x, drive=2.0):
    return np.tanh(x * drive) / np.tanh(drive)


def finish(x, peak_db=-1.0, fade=0.01):
    x = np.asarray(x, dtype=np.float64)
    x = x - np.mean(x)
    nf = int(SR * fade)
    if len(x) > nf:
        x[-nf:] *= np.linspace(1, 0, nf)
    m = np.max(np.abs(x)) + 1e-9
    return x / m * (10 ** (peak_db / 20))


def save(name, x, peak_db=-1.0):
    OUT.mkdir(parents=True, exist_ok=True)
    if name in ("slam", "land", "land_heavy", "wall_hit", "wall_break") or name.startswith("step_"):
        x = punchy(x, 0.5, 2.2)
    sf.write(OUT / f"{name}.wav", finish(x, peak_db).astype(np.float32), SR, subtype="PCM_16")


# ---------------------------------------------------------------- 打撃

def clang(f0, dur, bright=1.0):
    """金属の板を打った響き（非整数倍の倍音が速く減衰する）。機甲兵どうしの打撃・ガード・着地に重ねる"""
    tt = t(dur)
    modes = ((1.0, 1.0, 1.0), (1.594, 0.7, 0.8), (2.136, 0.5, 0.6), (2.653, 0.38, 0.5), (3.41, 0.25 * bright, 0.35), (4.17, 0.16 * bright, 0.28))
    x = sum(np.sin(2 * np.pi * f0 * r * tt + r) * a * env(len(tt), 0.0005, dur * d * 0.4) for r, a, d in modes)
    return x + bp(noise(dur), f0 * 1.5, min(f0 * 8, 9000)) * env(len(tt), 0.0005, dur * 0.06) * 0.6


def thump(f, dur, drive=2.5):
    """低い「ドン」: 正弦を歪ませて倍音を作る（スマホのスピーカーでも重さが伝わる帯域に）"""
    tt = t(dur)
    return sat(np.sin(2 * np.pi * f * tt) * env(len(tt), 0.002, dur * 0.32), drive)


def plate(f0, dur, seed, n_modes=34, bright=1.0, spread=13.0):
    """鋼板を強く打った響き。不規則に並ぶ多数の倍音（高いほど速く消える）に、近接した倍音の対でうなりを付ける。
    乱数は音ごとに固定（seed）して、他の音の生成順に左右されないようにする"""
    r = np.random.default_rng(seed)
    tt = t(dur)
    x = np.zeros(len(tt))
    ratios = np.sort(1.0 + (spread - 1.0) * r.random(n_modes) ** 1.6)
    ratios[0] = 1.0
    for k, ratio in enumerate(ratios):
        f = f0 * ratio
        if f > 15000:
            continue
        amp = (0.5 + r.random()) / ratio ** (0.75 / bright)
        dec = dur * (0.42 / ratio ** 0.62) * (0.7 + 0.6 * r.random())
        ph = r.random() * 6.283
        x += np.sin(2 * np.pi * f * tt + ph) * amp * env(len(tt), 0.0003, dec)
        # うなり（わずかにずれた対）
        x += np.sin(2 * np.pi * f * (1.0 + 0.004 + 0.008 * r.random()) * tt + ph * 1.7) * amp * 0.6 * env(len(tt), 0.0003, dec * 0.8)
    return x / np.max(np.abs(x) + 1e-9)


def strike(dur, seed, lo=1800, hi=12000):
    """ぶつかった瞬間の鋭い破裂音（金属の面どうしが当たる「ガッ」）と、短い擦れ"""
    r = np.random.default_rng(seed)
    n = int(SR * dur)
    click = bp(r.standard_normal(n), lo, hi) * env(n, 0.0002, dur * 0.12)
    # 擦れ: 速く震える帯域雑音
    tt = np.arange(n) / SR
    grind = bp(r.standard_normal(n), 2500, 8000) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 310 * tt))) * env(n, 0.001, dur * 0.3)
    return click + grind * 0.35


def clank(seed, f0, count, span):
    """衝撃のあとに装甲板どうしが跳ねて鳴る小さな金属音"""
    r = np.random.default_rng(seed)
    out = np.zeros(int(SR * (span + 0.3)))
    for k in range(count):
        at = int(SR * (0.03 + span * r.random() ** 0.8))
        c = plate(f0 * (0.8 + 0.9 * r.random()), 0.22, seed * 31 + k, 14, 1.2) * (0.9 - 0.5 * k / max(count, 1))
        c = mix(c, strike(0.012, seed * 17 + k) * 0.5)
        out[at:at + len(c)] += c[: len(out) - at]
    return out


def crush(x, drive):
    """強く歪ませて密度を上げる（激しさ）"""
    return sat(x / (np.max(np.abs(x)) + 1e-9), drive)


def punchy(x, cut=0.35, drive=2.0, crack=None, crack_amt=0.0):
    """スマホの小さなスピーカー向けの整音: 再生できない超低音だけを削り、歪みで倍音を足して密度と重さを出す
    （超低音が大きいと、最大音量を合わせたときに聞こえる帯域が小さくなる）"""
    x = hp(x, 60)
    x = x - cut * lp(x, 110)
    y = sat(x / (np.max(np.abs(x)) + 1e-9), drive)
    if crack is not None:
        # 当たった瞬間の硬い破裂音は、歪ませた後に足す（歪みに埋もれて「こもった音」にならないように）
        c = crack / (np.max(np.abs(crack)) + 1e-9) * crack_amt
        y = mix(y, c)
    return y


def crack(dur, seed, lo, hi):
    """硬い面どうしが当たった瞬間の破裂音（10 ms 前後の広い帯域の雑音）。これが無いと「こもった音」になる"""
    r = np.random.default_rng(seed)
    n = int(SR * dur)
    return bp(r.standard_normal(n), lo, hi) * env(n, 0.0002, dur * 0.3)


def knock(f0, dur, seed, n=10):
    """硬い塊どうしが当たった鈍い響き: 少数の低い倍音がすぐに消える（金属のようには鳴り続けない）"""
    return plate(f0, dur, seed, n, 0.65, 5.0)


def boom(f0, f1, dur, drive):
    """重さの芯: 音程が落ちる低い胴鳴りを強く歪ませ、150〜400 Hz に倍音を作る（小さなスピーカーでも重く聞こえる）"""
    n = int(SR * dur)
    return sat(sweep(f0, f1, dur) * env(n, 0.0015, dur * 0.3), drive)


def hit(weight, var):
    """打撃: 硬くて重いものどうしがぶつかる音。短く硬い破裂音 + すぐ消える鈍い響き + 重い胴鳴り + 砕ける音"""
    j = 1 + var * 0.06
    sd = {"light": 100, "medium": 200, "heavy": 300}[weight] + var * 7
    if weight == "light":
        ck = mix(crack(0.0256, sd, 900, 6500), knock(900 * j, 0.05, sd + 5, 8) * 0.5)
        x = mix(knock(340 * j, 0.13, sd + 1) * 0.8, boom(300 * j, 95, 0.14, 3.5) * 1.1,
                thump(135 * j, 0.13, 3.2) * 1.0, lp(noise(0.06), 1400) * env(int(SR * 0.06), 0.001, 0.015) * 0.5)
        return reverb(punchy(x, 0.5, 2.2, ck, 1.0), 0.18, 0.06)
    if weight == "medium":
        ck = mix(crack(0.038400000000000004, sd, 800, 6000), knock(700 * j, 0.07, sd + 5, 8) * 0.5)
        x = mix(knock(250 * j, 0.19, sd + 1) * 0.85, boom(240 * j, 62, 0.26, 4.2) * 1.2,
                thump(105 * j, 0.24, 3.8) * 1.0, np.sin(2 * np.pi * 52 * t(0.32)) * env(int(SR * 0.32), 0.002, 0.11) * 0.4,
                lp(noise(0.16), 1500) * env(int(SR * 0.16), 0.001, 0.035) * 0.6)
        return reverb(punchy(x, 0.5, 2.6, ck, 1.0), 0.26, 0.09)
    ck = mix(crack(0.064, sd, 700, 5500), knock(560 * j, 0.1, sd + 5, 10) * 0.55)
    x = mix(knock(175 * j, 0.3, sd + 1, 12) * 0.9, knock(430 * j, 0.16, sd + 2, 8) * 0.35,
            boom(200 * j, 44, 0.48, 5.0) * 1.3, thump(86 * j, 0.42, 4.2) * 1.0,
            sat(sweep(48, 30, 0.6) * env(int(SR * 0.6), 0.003, 0.22), 1.8) * 0.45,
            lp(noise(0.34), 1300) * env(int(SR * 0.34), 0.001, 0.075) * 0.75,
            lp(noise(0.6), 700) * env(int(SR * 0.6), 0.02, 0.16) * 0.3)
    return reverb(punchy(x, 0.5, 3.0, ck, 1.0), 0.42, 0.14)


def counter():
    """カウンター: 強い打撃に、もう一段深い衝撃と砕ける音を重ねる"""
    return reverb(mix(hit("heavy", 2) * 1.0, strike(0.05, 902, 700, 5000) * 0.35, boom(150, 36, 0.6, 5.0) * 0.6,
                      lp(noise(0.5), 1100) * env(int(SR * 0.5), 0.004, 0.12) * 0.4), 0.5, 0.15)


def guard(heavy, var):
    """ガード: 硬い面で受け止める「ゴツッ」。打撃より短く、締まった音"""
    j = 1 + var * 0.07
    sd = (500 if heavy else 400) + var * 7
    if heavy:
        ck = mix(crack(0.0416, sd, 900, 6500), knock(820 * j, 0.07, sd + 5, 8) * 0.6)
        x = mix(knock(310 * j, 0.17, sd + 1) * 1.0, boom(260 * j, 90, 0.18, 3.6) * 1.0,
                thump(125 * j, 0.17, 3.2) * 0.9, lp(noise(0.08), 1800) * env(int(SR * 0.08), 0.001, 0.02) * 0.5)
        return reverb(punchy(x, 0.5, 2.2, ck, 1.0), 0.22, 0.08)
    ck = mix(crack(0.0256, sd, 1000, 7000), knock(1100 * j, 0.05, sd + 5, 8) * 0.6)
    x = mix(knock(440 * j, 0.11, sd + 1) * 1.0, boom(320 * j, 130, 0.1, 3.0) * 0.8,
            thump(165 * j, 0.09, 2.8) * 0.7)
    return punchy(x, 0.5, 2.0, ck, 1.0)


def swish(heavy, var):
    dur = 0.2 if heavy else 0.13
    n = int(SR * dur)
    x = noise(dur)
    # 時間変化するバンドパス（ブロック処理）
    out = np.zeros(n)
    blocks = 24
    for b in range(blocks):
        a0 = b * n // blocks
        a1 = (b + 1) * n // blocks
        ph = b / blocks
        fc = (500 + 2200 * np.sin(np.pi * ph)) * (0.7 if heavy else 1.0) * (1 + var * 0.05)
        seg = bp(x[max(0, a0 - 400):a1], fc * 0.6, fc * 1.6)[-(a1 - a0):]
        out[a0:a1] = seg
    shape = np.sin(np.pi * np.linspace(0, 1, n)) ** 1.5
    return out * shape


def whoosh(dur, f0, f1, flutter=0.0):
    n = int(SR * dur)
    x = noise(dur)
    out = np.zeros(n)
    blocks = 30
    for b in range(blocks):
        a0 = b * n // blocks
        a1 = (b + 1) * n // blocks
        fc = f0 * (f1 / f0) ** (b / blocks)
        out[a0:a1] = bp(x[max(0, a0 - 400):a1], fc * 0.5, fc * 1.5)[-(a1 - a0):]
    shape = np.sin(np.pi * np.linspace(0, 1, n))
    if flutter > 0:
        shape *= 1 + 0.5 * np.sin(2 * np.pi * flutter * np.linspace(0, dur, n))
    return out * shape


def thud(dur=0.3, f0=110, f1=35, noise_amt=0.6):
    body = sat(sweep(f0, f1, dur) * env(int(SR * dur), 0.002, dur * 0.35), 2.2)
    rumble = lp(noise(dur), 500) * env(int(SR * dur), 0.002, dur * 0.3)
    return mix(body, rumble * noise_amt)


def chime(freqs, dur=0.5):
    tt = t(dur)
    return sum(np.sin(2 * np.pi * f * tt) * env(len(tt), 0.002, dur * 0.3) / (i + 1) for i, f in enumerate(freqs))


def crumble(dur=1.0):
    n = int(SR * dur)
    out = np.zeros(n)
    for _ in range(60):
        start = int(rng.uniform(0, n * 0.8))
        g = bp(noise(0.05), rng.uniform(300, 2500), 5000) * env(int(SR * 0.05), 0.001, 0.012)
        out[start:start + len(g)] += g[: n - start] * rng.uniform(0.2, 1.0) * (1 - start / n)
    return mix(out, thud(0.6, 90, 30, 0.8) * 1.2)


def splash(dur=0.9):
    n = int(SR * dur)
    x = hp(noise(dur), 800) * env(n, 0.005, 0.25)
    bub = np.zeros(n)
    for _ in range(25):
        s0 = int(rng.uniform(0.05, 0.7) * n)
        f = rng.uniform(400, 1400)
        b = sweep(f, f * 1.8, 0.04) * env(int(SR * 0.04), 0.002, 0.012)
        bub[s0:s0 + len(b)] += b[: n - s0] * 0.3
    return reverb(mix(x, bub, thud(0.4, 80, 30, 0.3) * 0.6), 0.5, 0.2)


def main():
    for k in range(4):
        save(f"hit_light_{k + 1}", hit("light", k), -1.5)
        save(f"hit_medium_{k + 1}", hit("medium", k), -0.8)
        save(f"hit_heavy_{k + 1}", hit("heavy", k), -0.3)
    save("counter", counter(), -0.5)
    for k in range(3):
        save(f"guard_{k + 1}", guard(False, k), -2.0)
        save(f"guard_heavy_{k + 1}", guard(True, k), -1.0)
        save(f"swish_{k + 1}", swish(False, k), -9.0)
        save(f"swish_heavy_{k + 1}", swish(True, k), -6.0)
    save("evade", whoosh(0.25, 400, 1600, flutter=28), -8.0)
    save("grab", mix(bp(noise(0.09), 900, 3500) * env(int(SR * 0.09), 0.001, 0.03), thud(0.12, 160, 90, 0.2) * 0.6), -6.0)
    save("throw_break", mix(hp(noise(0.006), 3000) * env(int(SR * 0.006), 0.0005, 0.002), chime([2480, 3720], 0.25) * 0.5,
                            bp(noise(0.12), 1500, 7000) * env(int(SR * 0.12), 0.001, 0.03)), -1.5)
    save("slam", reverb(mix(thud(0.6, 95, 28, 0.9) * 1.2, bp(noise(0.3), 200, 2000) * env(int(SR * 0.3), 0.002, 0.08) * 0.6,
                            thump(62, 0.5, 3.0) * 0.8, knock(160, 0.34, 601, 12) * 0.9, strike(0.05, 602, 500, 3500) * 0.6, boom(190, 40, 0.5, 5.0) * 1.0,
                            lp(noise(0.5), 900) * env(int(SR * 0.5), 0.01, 0.14) * 0.4), 0.5, 0.2), -0.5)
    save("launch", mix(whoosh(0.3, 300, 1800) * 0.7, thud(0.15, 140, 70, 0.2) * 0.6), -4.0)
    save("land", mix(thud(0.25, 120, 45, 0.7), knock(260, 0.14, 611) * 0.6, strike(0.02, 612, 600, 4000) * 0.3, boom(220, 70, 0.18, 3.5) * 0.7), -3.0)
    save("land_heavy", reverb(mix(thud(0.45, 100, 32, 0.9), knock(190, 0.24, 621, 12) * 0.7, strike(0.04, 622, 500, 3500) * 0.4, boom(190, 48, 0.36, 4.5) * 0.9,
                                  lp(noise(0.3), 1000) * env(int(SR * 0.3), 0.005, 0.08) * 0.4), 0.35, 0.15), -1.0)
    save("tech", mix(bp(noise(0.05), 600, 3000) * env(int(SR * 0.05), 0.001, 0.015), pad(np.zeros(int(SR * 0.08)), int(SR * 0.08)),
                     ), -7.0)
    save("wall_hit", reverb(mix(thud(0.45, 120, 40, 0.6), bp(noise(0.15), 300, 3000) * env(int(SR * 0.15), 0.001, 0.04),
                                thump(75, 0.35, 2.8) * 0.7, knock(200, 0.3, 631, 12) * 0.9, strike(0.05, 632, 500, 4000) * 0.7, boom(210, 46, 0.42, 5.0) * 1.0,
                                lp(noise(0.4), 1100) * env(int(SR * 0.4), 0.005, 0.1) * 0.45), 0.45, 0.2), -0.5)
    save("wall_break", crumble(1.2), -0.5)
    save("ringout", mix(whoosh(0.7, 2000, 250) * 0.6, pad(np.zeros(int(SR * 0.45)), int(SR * 0.45))), -5.0)
    save("ringout_harbor", splash(1.0), -2.0)
    save("ringout_raft", splash(1.0), -2.0)
    save("ringout_lighthouse", splash(1.2), -2.0)
    save("ringout_ruins", mix(thud(0.5, 90, 30, 1.0), lp(noise(0.8), 1500) * env(int(SR * 0.8), 0.01, 0.3) * 0.7), -2.0)
    save("ringout_bamboo", mix(thud(0.4, 100, 35, 0.8), bp(noise(0.5), 500, 4000) * env(int(SR * 0.5), 0.005, 0.15) * 0.5), -2.0)
    save("ringout_fort", mix(thud(0.4, 90, 30, 0.8), lp(noise(0.7), 3000) * env(int(SR * 0.7), 0.01, 0.25) * 0.5), -2.0)
    save("ringout_skyline", mix(whoosh(1.0, 1500, 200) * 0.8, thud(0.3, 80, 30, 0.4) * 0.4), -3.0)
    tt = t(0.4)
    save("stagger", mix(np.sin(2 * np.pi * (110 + 25 * np.sin(2 * np.pi * 7 * tt)) * tt) * env(len(tt), 0.01, 0.15) * 0.8, lp(noise(0.4), 400) * env(len(tt), 0.01, 0.1) * 0.3), -9.0)
    save("parry", mix(whoosh(0.18, 2500, 6000) * 0.8, chime([1760, 2794, 3951], 0.4) * 0.5), -2.0)
    save("just", mix(chime([1568, 2349, 3136], 0.6), hp(noise(0.01), 4000) * env(int(SR * 0.01), 0.0005, 0.003)), -3.0)
    # UI
    save("ui_ok", mix(chime([1320, 1980], 0.12) * 0.8, hp(noise(0.004), 3000) * env(int(SR * 0.004), 0.0003, 0.001) * 0.4), -8.0)
    save("ui_move", mix(hp(noise(0.012), 2500) * env(int(SR * 0.012), 0.0005, 0.003), chime([2200], 0.04) * 0.3), -14.0)
    save("ui_back", chime([880, 660], 0.15), -10.0)
    save("ui_vs", mix(hit("heavy", 1), whoosh(0.6, 200, 2400) * 0.5), -1.0)
    # 足音（重い機体の一歩）と、損傷時の漏電
    for k in range(3):
        save(f"step_{k + 1}", mix(thud(0.16, 95 + 12 * k, 42, 0.5), knock(200 + 30 * k, 0.1, 641 + k, 8) * 0.35,
                                  bp(noise(0.05), 800, 3500) * env(int(SR * 0.05), 0.001, 0.012) * 0.25), -5.0)
    tz = t(0.16)
    save("zap", bp(noise(0.16) * (np.sin(2 * np.pi * 95 * tz) > 0.2) * env(len(tz), 0.001, 0.06), 1800, 9000)
         + np.sin(2 * np.pi * 2900 * tz) * env(len(tz), 0.001, 0.02) * 0.15, -8.0)
    print("sfx done:", len(list(OUT.glob("*.wav"))))


if __name__ == "__main__":
    main()
