#!/usr/bin/env python3
"""BGM（ハードロック編曲）。全曲を作り直す。

旋律・調・コード進行は gen_bgm.py と同じ種から作り（同じ曲の編曲違い）、演奏を全てハードロックの編成に置き換える:
  - 歪んだギター 2 本（左右）: 弦の物理モデル（Karplus-Strong）→ アンプ（歪み）→ キャビネットの特性
  - リードギター（ビブラート・ディレイ、後半は 3 度のハモリ）
  - ピック弾きのベース、drumkit.py の合成ドラム（ハードロック用のパターンをここで追加）
  - オルガンとステージごとの彩りの楽器だけ FluidSynth（FluidR3_GM, MIT）
外部のサンプル・既存曲の引用は無い。出力: assets/audio/bgm/<id>.ogg
使い方: python3 tools/audio/gen_bgm_rock.py [bgm_arena ...]
"""
import sys

import numpy as np
from scipy import signal

import drumkit
import gen_bgm as gb
from gen_bgm import SR, Song, motif

# ---------------------------------------------------------------- 弦とアンプ

_cache = {}


def pluck(midi, dur, mute=False, var=0, t60=None, bright=1.0):
    """弦を弾いた音（アンプに入れる前の生音）。mute: ブリッジミュート"""
    key = (round(midi, 3), round(dur, 3), mute, var, t60, bright)
    if key in _cache:
        return _cache[key]
    rng = np.random.default_rng(hash(key) & 0xFFFFFFFF)
    f = 440.0 * 2 ** ((midi - 69) / 12)
    n_out = int(SR * (dur + 0.03))
    if t60 is None:
        t60 = 0.22 if mute else max(1.2, 5.0 - (midi - 40) * 0.07)
    g = 10 ** (-3.0 / (f * t60))
    s = 0.5 if not mute else 0.5
    period = SR / f - s
    n = int(period)
    fr = period - n
    poly = g * np.convolve([1 - fr, fr], [1 - s, s])
    a = np.zeros(n + 3)
    a[0] = 1.0
    a[n:n + 3] -= poly
    exc = rng.uniform(-1, 1, n + 2)
    cut = (2200 if mute else 5500) * bright
    exc = signal.sosfilt(signal.butter(1, min(cut, SR * 0.45) / (SR / 2), "low", output="sos"), exc)
    # ピックの位置（弦長の約 1/7）で倍音にくしをかける
    pp = max(1, int(n * 0.14))
    exc[pp:] -= exc[:-pp] * 0.6
    x = np.zeros(n_out)
    m = min(len(exc), n_out)
    x[:m] = exc[:m]
    y = signal.lfilter([1.0], a, x)
    rel = int(SR * 0.012)
    y[-rel:] *= np.linspace(1, 0, rel)
    y /= np.max(np.abs(y)) + 1e-9
    _cache[key] = y
    return y


def _f(kind, x, f, order=2):
    ny = SR / 2
    if kind == "band":
        sos = signal.butter(order, [f[0] / ny, f[1] / ny], "band", output="sos")
    else:
        sos = signal.butter(order, f / ny, kind, output="sos")
    return signal.sosfilt(sos, x)


def amp(x, gain=14.0, tight=110.0, presence=0.7, dark=4800.0):
    """真空管アンプ風の 2 段の歪み + スピーカーキャビネットの特性（2 倍オーバーサンプリング）"""
    act = np.abs(x) > 1e-4
    x = x / (np.sqrt(np.mean(x[act] ** 2)) + 1e-9) * 0.2 if act.any() else x
    x = _f("high", x, tight)
    x = x + 1.5 * _f("band", x, (500, 1800), 1)
    u = signal.resample_poly(x, 2, 1)
    u = np.tanh(u * gain)
    u = signal.sosfilt(signal.butter(2, 7000 / SR, "low", output="sos"), u)
    u = np.tanh(u * 2.2 + 0.18) - np.tanh(0.18)
    y = signal.resample_poly(u, 1, 2)[:len(x)]
    y = _f("high", y, 85)
    y = _f("low", y, dark, 4)
    y = y + presence * _f("band", y, (1900, 3600), 1) - 0.35 * _f("band", y, (280, 520), 1)
    return y


def vibrato(y, rate=5.6, cents=28.0, delay=0.16):
    t = np.arange(len(y)) / SR
    depth = (2 ** (cents / 1200) - 1) / (2 * np.pi * rate)
    ramp = np.clip((t - delay) / 0.2, 0, 1)
    return np.interp(t + depth * np.sin(2 * np.pi * rate * t) * ramp, t, y)


def place(track, y, t, gain=1.0):
    i = int(round(t * SR))
    if i < 0 or i >= len(track):
        return
    seg = y[:len(track) - i]
    track[i:i + len(seg)] += seg * gain


def pan(x, p):
    a = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(a), x * np.sin(a)], axis=1)


def fold(x, n_song, i_loop):
    """曲の長さからはみ出した余韻をループの頭へ重ねる"""
    out = x[:n_song].copy()
    over = x[n_song:]
    span = n_song - i_loop
    for k in range(0, len(over), span):
        part = over[k:k + span]
        out[i_loop:i_loop + len(part)] += part
    return out


def arms(x):
    act = np.abs(x) > 1e-4
    return np.sqrt(np.mean(x[act] ** 2)) + 1e-9 if act.any() else 1.0


def level(x, db):
    return x * (10 ** (db / 20) / arms(x))


# ---------------------------------------------------------------- 音符

def base_note(s, deg, lo=38):
    return lo + (s.root + s.scale[deg % 7] - lo) % 12


def rel(s, deg, d):
    a = s.scale[deg % 7] + 12 * (deg // 7)
    b = s.scale[(deg + d) % 7] + 12 * ((deg + d) // 7)
    return b - a


def riff_events(s, prog, bar0, pats):
    """16 ステップの文字列 → [(拍, 長さ, 種類, [音])]
    X 強いパワーコード / x パワーコード / m ミュートの刻み / 0-9 単音（コードの根音から数えた音階の度数） / - 休み / . 伸ばす"""
    out = []
    for b, deg in enumerate(prog):
        pat = pats[b % len(pats)]
        r = base_note(s, deg)
        k = 0
        while k < 16:
            c = pat[k]
            j = k + 1
            while j < 16 and pat[j] == ".":
                j += 1
            if c not in ".-":
                beat = (bar0 + b) * 4 + k * 0.25
                d = (j - k) * 0.25
                if c in "Xx":
                    out.append((beat, d, c, [r, r + 7, r + 12]))
                elif c == "m":
                    out.append((beat, min(d, 0.25), "m", [r, r + 7]))
                elif c.isdigit():
                    out.append((beat, d, "n", [r + rel(s, deg, int(c))]))
            k = j
    return out


def mel_events(s, prog, bar0, mot, octave, vary):
    """gen_bgm.melody と同じ乱数の使い方で、旋律を（拍, 長さ, 度数, オクターブ）で返す"""
    out = []
    for b2 in range(0, len(prog), 2):
        base = (bar0 + b2) * 4
        shift = prog[b2] % 7 if s.rng.random() < 0.5 else 0
        for beat, d, deg in mot:
            if deg is None:
                continue
            dd = deg + shift
            if vary > 0 and s.rng.random() < vary:
                dd += int(s.rng.choice([-1, 1, 2]))
            s.rng.integers(16)
            out.append((base + beat, d, dd, octave))
    return out


# ---------------------------------------------------------------- ドラム（ハードロックのパターン）

def P(**kw):
    return kw


_ROCK = drumkit.STYLES["rock"]
_INTRO = [P(H="x...x...x...x..."), P(H="x...x...x...x...", K="x.......x......."),
          P(K="x...x...x...x...", S="....x.......x...", **{"4": "x.x.x.x.x.x.x.x."}),
          P(**{"1": "....xx..........", "2": "......xx........", "3": "........xx......", "4": "..........xxxx.."}, K="x.......x.x.x.xx", S="x.g.x.........rr")]


def _style(A, B, A2=None, intro=None, BRK=None, **over):
    d = dict(_ROCK)
    d.update(A=A, B=B, A2=A2 or A, intro=intro or _INTRO, BRK=BRK or _ROCK["BRK"])
    d.update(over)
    return d


drumkit.STYLES.update({
    "hr_drive": _style(
        A=[P(K="x.....x.x.....x.", S="....x.......x...", H="x.o.x.o.x.o.x.o."),
           P(K="x.....x.x.x.....", S="....x.......x..g", H="x.o.x.o.x.o.x.o.", O="..............x.")],
        B=[P(K="x.x...x.x.x...x.", S="....x.......x...", O="x...x...x...x...", C="x..............."),
           P(K="x.x...x.x.x.x...", S="....x.......x.g.", O="x...x...x...x...")],
        A2=[P(K="x.....x.x.....x.", S="....x.......x...", R="x.x.x.x.x.x.x.x."),
            P(K="x.....x.x.x.....", S="....x.......x..g", R="x.x.x.x.x.x.x.x.", C="x...............")]),
    "hr_fast": _style(
        A=[P(K="x.x.x.x.x.x.x.x.", S="....x.......x...", H="x.x.x.x.x.x.x.x."),
           P(K="x.x.x.x.x.x.x.xx", S="....x.......x.g.", H="x.x.x.x.x.x.x.x.")],
        B=[P(K="x...x...x...x...", S="..x...x...x...x.", R="x...x...x...x...", C="x..............."),
           P(K="x...x...x...x.x.", S="..x...x...x...xg", R="x...x...x...x...")],
        A2=[P(K="xoxoxoxoxoxoxoxo", S="....x.......x...", R="x...x...x...x..."),
            P(K="xoxoxoxoxoxoxoxo", S="....x.......x.g.", R="x...x...x...x...", C="x...............")]),
    "hr_half": _style(
        A=[P(K="x.........x.x...", S="........x.......", H="x.x.x.x.x.x.x.x."),
           P(K="x..x......x.x...", S="........x.....g.", H="x.x.x.x.x.x.x.x.", O="..............x.")],
        B=[P(K="x..x..x...x.....", S="........x.......", O="x...x...x...x...", C="x..............."),
           P(K="x..x..x...x.x.x.", S="........x......g", O="x...x...x...x...")],
        A2=[P(K="x.........x.x...", S="........x.......", R="x.x.x.x.x.x.x.x.", **{"4": "......x........."}),
            P(K="x..x......x.xx..", S="........x.....g.", R="x.x.x.x.x.x.x.x.", C="x...............")]),
    "hr_gallop": _style(
        A=[P(K="x.xxx.xxx.xxx.xx", S="....x.......x...", H="x...x...x...x..."),
           P(K="x.xxx.xxx.xxx.xx", S="....x.......x.g.", H="x...x...x...x...", O="..............x.")],
        B=[P(K="xoxoxoxoxoxoxoxo", S="....x.......x...", R="x...x...x...x...", C="x..............."),
           P(K="xoxoxoxoxoxoxoxo", S="....x.......x..x", R="x...x...x...x...", C="........x.......")],
        A2=[P(K="x.xxx.xxx.xxx.xx", S="....x.......x...", R="x.x.x.x.x.x.x.x."),
            P(K="x.xxx.xxx.xxx.xx", S="....x.......x.g.", R="x.x.x.x.x.x.x.x.", C="x...............")]),
    "hr_stomp": _style(
        A=[P(K="x...x.....x.x...", S="....x.......x...", P="....x.......x...", **{"4": "x...x...x...x..."}),
           P(K="x...x.....x.x.x.", S="....x.......x...", P="....x.......x...", **{"4": "x...x...x...x.x."})],
        B=[P(K="x.....x.x.....x.", S="....x.......x...", O="x...x...x...x...", C="x..............."),
           P(K="x.....x.x.x.....", S="....x.......x.g.", O="x...x...x...x...")]),
    "hr_boogie": _style(
        A=[P(K="x..x..x.x..x..x.", S="....x.......x...", H="x.x.x.x.x.x.x.x."),
           P(K="x..x..x.x..x.x..", S="....x.......x..g", H="x.x.x.x.x.x.x.x.", O="..............x.")],
        B=[P(K="x.x.x.x.x.x.x.x.", S="....x.......x...", O="x...x...x...x...", C="x..............."),
           P(K="x.x.x.x.x.x.x.x.", S="....x..x....x...", O="x...x...x...x...")]),
    "hr_ballad": _style(
        A=[P(K="x.......x.x.....", S="....x.......x...", H="o.o.o.o.o.o.o.o."),
           P(K="x.......x.x...x.", S="....x.......x...", H="o.o.o.o.o.o.o.o.")],
        B=[P(K="x.....x.x.x.....", S="....x.......x...", R="x.x.x.x.x.x.x.x.", C="x..............."),
           P(K="x.....x.x.x...x.", S="....x.......x.g.", R="x.x.x.x.x.x.x.x.")],
        intro=[P(H="o...o...o...o..."), P(H="o...o...o...o..."), P(H="o.o.o.o.o.o.o.o.", K="x.......x......."),
               P(H="o.o.o.o.o.o.o.o.", K="x.......x.......", S="............x.xx", **{"3": "........x.x.....", "4": "..........x.x..."})],
        BRK=[P(K="x.......x.......", R="x...x...x...x..."), P(K="x.......x.......", R="x...x...x...x...", S="........x......."),
             P(K="x.......x.x.....", R="x...x...x...x...", S="....x.......x..."),
             P(K="x...x...x.x.xxxx", S="....x...x.x.xxrr", **{"3": "..........x.....", "4": "............xx.."})]),
    # ジングル（イントロの並びだけを使う）
    "jingle_win": _style(A=[P()], B=[P()], intro=[
        P(K="x..x..x.....x...", S="x..x..........x.", C="......x.........", **{"3": "..........x.....", "4": "............x..."}),
        P(K="x...............", C="x...............")], rev=False),
    "jingle_lose": _style(A=[P()], B=[P()], intro=[
        P(K="x.......x.......", **{"4": "x...x...x.x.x..."}),
        P(K="x...............", **{"4": "x......."}, C="x...............")], rev=False),
})


# ---------------------------------------------------------------- 曲を組む

def guitar_track(events, n_total, spb, seed, detune=0.0, vol=None):
    rng = np.random.default_rng(seed)
    tr = np.zeros(n_total)
    for beat, d, kind, notes in events:
        t = beat * spb + abs(rng.normal(0, 0.003))
        mute = kind == "m"
        v = {"X": 1.0, "x": 0.85, "m": 0.8, "n": 0.9}[kind] * (1 + rng.normal(0, 0.05))
        var = int(rng.integers(3))
        for k, n in enumerate(notes):
            y = pluck(n + detune, d * spb, mute, var)
            place(tr, y, t + k * 0.004, v * (0.8 if k == 2 else 1.0))
    return tr


def clean_track(events, n_total, spb, seed):
    rng = np.random.default_rng(seed)
    tr = np.zeros(n_total)
    for beat, d, n in events:
        y = pluck(n, d * spb, False, int(rng.integers(3)), t60=3.5, bright=1.3)
        place(tr, y, beat * spb + abs(rng.normal(0, 0.003)), 0.8 + 0.2 * rng.random())
    return tr


def bass_track(events, n_total, spb, seed):
    rng = np.random.default_rng(seed)
    tr = np.zeros(n_total)
    for beat, d, kind, notes in events:
        n = notes[0] - 12
        y = pluck(n, d * spb * (0.9 if kind == "m" else 1.0), False, int(rng.integers(3)), t60=2.2, bright=0.8)
        place(tr, y, beat * spb + abs(rng.normal(0, 0.002)), 0.9 + 0.1 * rng.random())
    low = _f("low", tr, 250)
    grit = np.tanh(_f("band", tr, (250, 2800), 1) * 6.0)
    return _f("high", low * 1.6 + _f("low", grit, 3200) * 0.35, 35)


def lead_track(s, mel, n_total, spb, harmony=0, seed=0):
    rng = np.random.default_rng(seed)
    tr = np.zeros(n_total)
    for beat, d, deg, octv in mel:
        n = s.note_of(deg + harmony, octv)
        while n > 88:
            n -= 12
        y = pluck(n, d * spb * 0.97, False, int(rng.integers(3)), t60=6.0, bright=0.9)
        if d * spb > 0.28:
            y = vibrato(y)
        place(tr, y, beat * spb + abs(rng.normal(0, 0.002)), 1.0)
    return tr


def delay(x, t, fb=0.32, mix=0.28):
    """左右に振るディレイ"""
    n = int(t * SR)
    out = pan(x, 0.0)
    cur = x
    for k in range(1, 5):
        cur = _f("low", cur, 3200) * fb if k > 1 else cur * 1.0
        d = np.concatenate([np.zeros(n * k), cur])[:len(x)]
        out += pan(d, 0.6 if k % 2 else -0.6) * mix * (fb ** (k - 1))
    return out


def room(x, seed, rt=0.9, wet=0.12):
    irl, irr = drumkit._reverb_ir(rt, np.random.default_rng(seed))
    m = x.mean(axis=1)
    w = np.stack([signal.fftconvolve(m, irl)[:len(x)], signal.fftconvolve(m, irr)[:len(x)]], axis=1)
    return x + w * wet


def arp_events(s, prog, bar0):
    out = []
    for b, deg in enumerate(prog):
        r = base_note(s, deg, 43)
        third, fifth = r + rel(s, deg, 2), r + rel(s, deg, 4)
        seq = [r, fifth, r + 12, third + 12, fifth + 12, third + 12, r + 12, fifth]
        for k, n in enumerate(seq):
            out.append(((bar0 + b) * 4 + k * 0.5, 1.75, n))
    return out


OPEN = ["X.....X...X.x.x.", "X.....X...X....."]
BASS8 = ["0.0.0.0.0.0.0.0."]


def build(cfg):
    sid, bpm = cfg["id"], cfg["bpm"]
    s = Song(sid, bpm, cfg["root"], cfg["mode"], cfg["seed"])
    mot_a, mot_b = motif(s, 8, 0.6), motif(s, 8, 0.75)
    progA, progB = cfg["progA"], cfg["progB"]
    spb = 60.0 / bpm
    intro_n, brk_n = 4, 4
    mo = cfg.get("mel_oct", 1)
    clean_in = set(cfg.get("clean", []))
    riffA, riffB = cfg["riffA"], cfg.get("riffB", OPEN)
    bassB = cfg.get("bassB", BASS8)
    sections = [("intro", 0, intro_n)]
    gl, gr, bs, ld, ld2, cl = [], [], [], [], [], []
    keys = Song(sid, bpm, cfg["root"], cfg["mode"], 0)
    keys.programs.update({2: (18, 78), 4: (cfg.get("flavor", 18), 112), ("rev", 4): 85, ("rev", 2): 60})
    # イントロ: 左のギターだけ → 3 小節目から全員
    ip = progA[:intro_n]
    if "intro" in clean_in:
        cl += arp_events(s, ip, 0)
    else:
        gl += riff_events(s, ip, 0, riffA)
        gr += riff_events(s, ip[2:], 2, riffA)
        bs += riff_events(s, ip[2:], 2, riffA)
    bar = intro_n
    loop_bar = bar
    for sec, prog, mot in (("A", progA, mot_a), ("B", progB, mot_b), ("BRK", progA[:brk_n], None), ("A2", progA, mot_a)):
        n = len(prog)
        sections.append((sec, bar, n))
        if sec == "BRK":
            # ブレイク: ギターは頭だけ鳴らして止め、ベースとドラムがリフを回す。最後の小節で刻んで戻る
            stops = ["X...-..........."] * (n - 1) + ["m.m.m.m.mmmmmmmm"]
            ev = riff_events(s, prog, bar, stops)
            ev = [e for k, e in enumerate(ev)]
            gl += ev
            gr += ev
            bs += riff_events(s, prog, bar, riffA)
        else:
            riff = riffB if sec == "B" else riffA
            if sec in clean_in:
                cl += arp_events(s, prog, bar)
                bs += riff_events(s, prog, bar, ["0.......0...0..."])
            else:
                ev = riff_events(s, prog, bar, riff)
                gl += ev
                gr += ev
                bs += riff_events(s, prog, bar, bassB) if sec == "B" else ev
            mel = mel_events(s, prog, bar, mot, mo + (1 if sec == "B" else 0), 0.25 if sec == "A2" else 0.0)
            ld += mel
            if sec == "A2":
                ld2 += mel
            if sec in ("B", "A2"):
                for b, deg in enumerate(prog):
                    for nn in s.chord(deg, 0, 3):
                        keys.add(2, (bar + b) * 4, 3.9, nn, 72)
            if "flavor" in cfg and sec in ("A", "A2"):
                for beat, d, deg, octv in mel:
                    keys.add(4, beat, d * 0.95, s.note_of(deg, octv), 92)
        bar += n
    total_bars = bar
    keys.bars = s.bars = total_bars
    n_song = int(round(total_bars * 4 * spb * SR))
    i_loop = int(round(loop_bar * 4 * spb * SR))
    n_total = n_song + int(SR * 4)
    g = cfg.get("gain", 14.0)
    seed = cfg["seed"]
    parts = []
    if gl:
        parts.append(level(pan(amp(guitar_track(gl, n_total, spb, seed + 1, -0.04), g), -0.85), cfg.get("gtr_db", -20.5)))
    if gr:
        parts.append(level(pan(amp(guitar_track(gr, n_total, spb, seed + 2, 0.05), g * 0.9, presence=0.9), 0.85), cfg.get("gtr_db", -20.5)))
    if bs:
        parts.append(level(pan(bass_track(bs, n_total, spb, seed + 3), 0.0), -19.5))
    if ld:
        lead = amp(lead_track(s, ld, n_total, spb, 0, seed + 4), 30.0, tight=220, presence=0.5, dark=4200)
        parts.append(level(delay(lead, spb * 0.75), cfg.get("lead_db", -19.0)))
    if ld2:
        h = amp(lead_track(s, ld2, n_total, spb, 2, seed + 5), 30.0, tight=220, presence=0.5, dark=4200)
        parts.append(level(pan(h, 0.35), cfg.get("lead_db", -19.0) - 5.0))
    if cl:
        c = clean_track(cl, n_total, spb, seed + 6)
        c = _f("high", c, 120)
        wide = np.stack([c, vibrato(c, 0.7, 9.0, 0.0)], axis=1)
        parts.append(level(room(wide, seed + 8, 1.6, 0.3), -19.0))
    mixd = np.zeros((n_total, 2))
    for p in parts:
        mixd += p
    mixd = fold(room(mixd, seed + 9, 0.8, 0.07), n_song, i_loop)
    dr = drumkit.render(cfg["kit"], bpm, sections, total_bars, seed, loop_bar=loop_bar)[:n_song]
    mixd += level(dr, cfg.get("drum_db", -16.5))
    if keys.tracks:
        kx, _ = gb.render(keys, loop_bar)
        mixd += level(kx[:n_song], cfg.get("keys_db", -27.0))
    return mixd, i_loop


def glue(x):
    x = signal.sosfilt(signal.butter(2, 30 / (SR / 2), "high", output="sos"), x, axis=0)
    x = x / (np.sqrt(np.mean(x ** 2)) + 1e-9) * 10 ** (-16 / 20)
    return drumkit._compress(x, thr_db=-13.0, ratio=2.2, tau=0.03)


def jingle(sid, bpm, root, mode, chords, lead, kit, bars, seed):
    """chords: [(拍, 長さ, 度数)]、lead: [(拍, 長さ, 度数, オクターブ)]。ループしない"""
    s = Song(sid, bpm, root, mode, seed)
    spb = 60.0 / bpm
    n_song = int(round(bars * 4 * spb * SR))
    n_total = n_song + SR
    ev = [(b, d, "X", [base_note(s, deg), base_note(s, deg) + 7, base_note(s, deg) + 12]) for b, d, deg in chords]
    x = level(pan(amp(guitar_track(ev, n_total, spb, seed + 1, -0.04)), -0.8), -20.5)
    x += level(pan(amp(guitar_track(ev, n_total, spb, seed + 2, 0.05), 12.0, presence=0.9), 0.8), -20.5)
    x += level(pan(bass_track(ev, n_total, spb, seed + 3), 0.0), -19.5)
    ld = amp(lead_track(s, lead, n_total, spb, 0, seed + 4), 30.0, tight=220, presence=0.5, dark=4200)
    x += level(delay(ld, spb * 0.75), -18.5)
    x = room(x, seed, 1.4, 0.15)[:n_song]
    dr = drumkit.render(kit, bpm, [("intro", 0, 2)], bars, seed)
    x += level(dr[:n_song], -17.0)
    fade = int(SR * 1.2)
    x[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    return x


def ch(prog):
    return prog


G = gb.P
SONGS = [
    # ---- ステージ
    dict(id="bgm_arena", bpm=152, root=52, mode="minor", seed=11, progA=[0, 5, 3, 4] * 2, progB=[5, 3, 0, 4, 5, 3, 6, 4], kit="hr_drive",
         riffA=["X.mmX.mm2.3.X.mm", "X.mmX.mm6...4.3."]),
    dict(id="bgm_harbor", bpm=132, root=45, mode="phrygian", seed=22, progA=[0, 0, 1, 6] * 2, progB=[3, 1, 0, 6, 3, 1, 5, 6], kit="hr_half",
         riffA=["X..mm.X..mm.1.0.", "X..mm.X..mm.1.2."], riffB=["X.......X...1...", "X.....X.....m.m."], bassB=["0..0..0...0.0..."]),
    dict(id="bgm_bamboo", bpm=128, root=50, mode="japanese", seed=33, progA=[0, 3, 4, 3] * 2, progB=[5, 4, 3, 0, 5, 4, 1, 0], kit="hr_drive",
         riffA=["0.0.1.0.2.0.1.0.", "X...mmX...mm3.1."], flavor=G["shakuhachi"]),
    dict(id="bgm_fort", bpm=116, root=50, mode="harmonic", seed=44, progA=[0, 5, 3, 4] * 2, progB=[5, 6, 4, 0, 3, 4, 5, 4], kit="hr_stomp",
         riffA=["X...X...mmmmX...", "X...X...m.4.6.7."], riffB=["X.....X.X.....X.", "X.....X.X.x....."], flavor=G["brass"], keys_db=-29.0),
    dict(id="bgm_ruins", bpm=124, root=50, mode="hijaz", seed=55, progA=[0, 1, 0, 6] * 2, progB=[3, 1, 0, 6, 4, 3, 1, 0], kit="hr_half",
         riffA=["m.m.1.m.m.2.m.1.", "m.m.1.m.m.3.2.1."], riffB=["X..X..X...X.....", "X..X..X...1.2.1."], bassB=["0..0..0...0.0..."], flavor=G["sitar"]),
    dict(id="bgm_skyline", bpm=172, root=47, mode="minor", seed=66, progA=[0, 5, 6, 4] * 2, progB=[3, 4, 0, 5, 3, 4, 6, 6], kit="hr_fast",
         riffA=["X.mmmmX.mmmmX.mm", "X.mmmmX.mm2.3.4."], riffB=["X...X...X...X.X.", "X...X...X.X.X..."]),
    dict(id="bgm_temple", bpm=108, root=48, mode="japanese", seed=77, progA=[0, 4, 3, 1] * 2, progB=[5, 4, 0, 3, 5, 4, 1, 0], kit="hr_half",
         riffA=["X.......1...0...", "X.....mmX...3.2."], riffB=["X.......X.......", "X.......X...m.m."], bassB=["0.....0.0......."], flavor=G["koto"], gain=18.0),
    dict(id="bgm_raft", bpm=144, root=55, mode="major", seed=88, progA=[0, 4, 5, 3] * 2, progB=[3, 0, 4, 5, 3, 0, 4, 4], kit="hr_boogie",
         riffA=["X..X..X.-.X.X...", "X..X..X.-.2.4.2."], riffB=["X.x.X.x.X.x.X.x.", "X.x.X.x.X.X.X..."], gain=9.0),
    dict(id="bgm_boss", bpm=150, root=50, mode="harmonic", seed=99, progA=[0, 5, 1, 4] * 2, progB=[3, 1, 4, 0, 5, 1, 6, 4], kit="hr_gallop",
         riffA=["m.mmm.mmX.mmm.mm", "m.mmm.mm6.7.6.4."], riffB=["X.......X.......", "X.......X...X..."], bassB=["0.000.000.000.00"], flavor=G["choir"], gain=18.0),
    # ---- 画面
    dict(id="bgm_title", bpm=96, root=50, mode="minor", seed=101, progA=[0, 5, 3, 4] * 2, progB=[5, 3, 0, 4] * 2, kit="hr_half",
         riffA=["X...........X...", "X.......m.m.4.2."], riffB=["X.......X.......", "X.......X...X..."], bassB=["0.....0.0......."],
         clean=["intro"], lufs=-14.5),
    dict(id="bgm_menu", bpm=104, root=53, mode="dorian", seed=102, progA=[0, 3, 4, 3] * 2, progB=[5, 3, 1, 4] * 2, kit="hr_drive",
         riffA=["X..m..X.m.X.....", "X..m..X.m.2.3.2."], gain=8.0, lufs=-16.0),
    dict(id="bgm_select", bpm=132, root=50, mode="minor", seed=103, progA=[0, 5, 3, 4] * 2, progB=[5, 6, 4, 4] * 2, kit="hr_drive",
         riffA=["m.m.m.m.X.m.m.m.", "m.m.m.m.X...4.6."], lufs=-15.0),
    dict(id="bgm_training", bpm=108, root=52, mode="dorian", seed=104, progA=[0, 3] * 4, progB=[5, 4] * 4, kit="hr_boogie",
         riffA=["X.-.m.X.-.m.2.0.", "X.-.m.X.-.2.3.2."], riffB=["X.....X...X.....", "X.....X...X.x..."], gain=8.0, lufs=-16.0),
    dict(id="bgm_ending", bpm=76, root=53, mode="major", seed=105, progA=[0, 4, 5, 3] * 2, progB=[3, 4, 0, 5, 3, 4, 0, 0], kit="hr_ballad",
         riffA=["X.......X.......", "X.......X...X..."], riffB=["X.......X...x...", "X.......X.x.X..."], bassB=["0.....0.0......."],
         clean=["intro", "A"], gain=9.0, lufs=-15.0),
]


def main():
    only = set(sys.argv[1:])
    for cfg in SONGS:
        if only and cfg["id"] not in only:
            continue
        x, i_loop = build(cfg)
        gb.save(cfg["id"], gb.loudness(glue(x), cfg.get("lufs", -12.5)), i_loop)
        _cache.clear()
    if not only or "bgm_result_win" in only:
        x = jingle("bgm_result_win", 132, 52, "major", [(0, 0.75, 3), (0.75, 0.75, 4), (1.5, 6.0, 0)],
                   [(1.5, 0.25, 0, 1), (1.75, 0.25, 2, 1), (2.0, 0.25, 4, 1), (2.25, 0.25, 7, 1), (2.5, 0.5, 9, 1), (3.0, 4.0, 11, 1)], "jingle_win", 3, 7)
        gb.save("bgm_result_win", gb.loudness(glue(x), -14.0), 0, loop=False)
    if not only or "bgm_result_lose" in only:
        x = jingle("bgm_result_lose", 84, 52, "minor", [(0, 2.0, 5), (2.0, 2.0, 4), (4.0, 6.0, 0)],
                   [(0, 1.0, 4, 1), (1.0, 1.0, 3, 1), (2.0, 1.5, 1, 1), (3.5, 0.5, 2, 1), (4.0, 5.0, 0, 1)], "jingle_lose", 3, 8)
        gb.save("bgm_result_lose", gb.loudness(glue(x), -15.0), 0, loop=False)


if __name__ == "__main__":
    main()
