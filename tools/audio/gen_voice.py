#!/usr/bin/env python3
"""アナウンス（espeak-ng による合成音声を加工）と、キャラの掛け声（声帯音源 + フォルマントの合成）。
出力: assets/audio/announcer/*.wav, assets/audio/voice/<char>/*.wav"""
import json
import pathlib
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
ROOT = pathlib.Path(__file__).resolve().parents[2]
rng = np.random.default_rng(77)


def resample(x, sr_in):
    if sr_in == SR:
        return x
    n = int(len(x) * SR / sr_in)
    return signal.resample(x, n)


def reverb(x, size=0.6, wet=0.25):
    n = int(SR * size)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / (SR * size / 6))
    sos = signal.butter(2, 4000 / (SR / 2), output="sos")
    ir = signal.sosfilt(sos, ir)
    ir /= np.sqrt(np.sum(ir ** 2))
    y = signal.fftconvolve(x, ir)
    out = np.zeros(len(y))
    out[: len(x)] += x * (1 - wet)
    return out + y * wet


def norm(x, db=-1.0):
    x = x - np.mean(x)
    return x / (np.max(np.abs(x)) + 1e-9) * 10 ** (db / 20)


def announcer():
    out = ROOT / "assets/audio/announcer"
    out.mkdir(parents=True, exist_ok=True)
    lines = {
        "round_1": "Round one", "round_2": "Round two", "round_3": "Round three", "round_4": "Round four", "round_5": "Round five",
        "final_round": "Final round", "fight": "Fight!", "ko": "K. O.", "ring_out": "Ring out!", "time_up": "Time up",
        "draw": "Draw", "perfect": "Perfect", "extra_round": "Extra round",
    }
    # 「（キャラ名） Wins」
    for d in sorted((ROOT / "data/characters").iterdir()):
        cj = json.loads((d / "character.json").read_text())
        first = str(cj.get("name", [d.name, d.name])[1]).split(" ")[0]
        if d.name == "gensai":
            first = "Gensai"
        lines["win_" + d.name] = first + " wins!"
    for k, txt in lines.items():
        with tempfile.TemporaryDirectory() as td:
            wp = pathlib.Path(td) / "a.wav"
            subprocess.run(["espeak-ng", "-v", "en-us+m3", "-s", "135", "-p", "28", "-a", "180", "-w", str(wp), txt], check=True)
            x, sr = sf.read(wp)
        x = resample(x, sr)
        # 低く太く: ピッチを下げる（再サンプル）＋ 低域強調 ＋ 倍音の歪み ＋ 残響
        x = signal.resample(x, int(len(x) * 1.18))
        sos = signal.butter(2, [90 / (SR / 2), 6000 / (SR / 2)], btype="band", output="sos")
        x = signal.sosfilt(sos, x)
        x = np.tanh(x / (np.max(np.abs(x)) + 1e-9) * 2.2)
        low = signal.sosfilt(signal.butter(2, 300 / (SR / 2), output="sos"), x)
        x = x + low * 0.6
        x = reverb(x, 0.9, 0.22)
        sf.write(out / f"{k}.wav", norm(x, -1.5).astype(np.float32), SR, subtype="PCM_16")
    print("announcer:", len(lines))


# ---------------------------------------------------------------- 掛け声（フォルマント合成）

VOWELS = {  # F1, F2, F3（男性基準 Hz）
    "a": (800, 1200, 2500), "o": (500, 900, 2400), "u": (350, 1000, 2300), "e": (500, 1800, 2500), "i": (300, 2200, 2900),
}


def formant_voice(pitch, dur, vowel, attack=0.01, decay=0.12, breath=0.25, glide=0.0, female=False, rough=0.0):
    n = int(SR * dur)
    tt = np.arange(n) / SR
    f0 = pitch * (1 + glide * (1 - tt / dur)) * (1 + 0.012 * rng.standard_normal(n).cumsum() / np.sqrt(np.arange(1, n + 1)))
    ph = np.cumsum(f0) / SR
    src = 2 * (ph % 1.0) - 1.0  # のこぎり波（声帯音源の近似）
    src = signal.lfilter([1], [1, -0.9], src) * 0.15
    if rough > 0:
        src *= 1 + rough * rng.standard_normal(n) * 0.5
    noise = rng.standard_normal(n) * breath
    exc = src + noise
    k = 1.17 if female else 1.0
    y = np.zeros(n)
    for i, (f, bw) in enumerate(zip(VOWELS[vowel], (90, 110, 160))):
        ff = f * k
        sos = signal.butter(2, [max(50, ff - bw) / (SR / 2), min(ff + bw, SR / 2 - 100) / (SR / 2)], btype="band", output="sos")
        y += signal.sosfilt(sos, exc) * (1.0, 0.7, 0.35)[i]
    a = np.clip(tt / attack, 0, 1) * np.exp(-np.maximum(tt - attack, 0) / decay)
    return y * a


def char_voices(cid, cj):
    v = cj.get("voice", {})
    female = v.get("type", "").startswith("female")
    pitch = float(v.get("pitch", "1.0")) * (215.0 if female else 118.0)
    rough = float(v.get("rough", "0.1"))
    out = ROOT / f"assets/audio/voice/{cid}"
    out.mkdir(parents=True, exist_ok=True)
    defs = {
        "attack": [("a", 0.16, 0.05, 0.2, 0.15), ("e", 0.14, 0.045, 0.25, 0.1), ("u", 0.13, 0.04, 0.3, 0.05)],
        "attack_heavy": [("a", 0.32, 0.12, 0.25, 0.25), ("o", 0.30, 0.11, 0.2, 0.2), ("e", 0.34, 0.12, 0.25, 0.3)],
        "hurt": [("u", 0.18, 0.06, 0.35, -0.1), ("o", 0.2, 0.07, 0.3, -0.15), ("a", 0.17, 0.06, 0.35, -0.1)],
        "hurt_heavy": [("a", 0.42, 0.16, 0.35, -0.25), ("o", 0.45, 0.18, 0.3, -0.3)],
        "ko": [("a", 0.9, 0.35, 0.3, -0.4)],
        "win": [("o", 0.35, 0.15, 0.15, 0.1)],
    }
    for kind, lst in defs.items():
        for i, (vw, dur, dec, br, gl) in enumerate(lst):
            x = formant_voice(pitch * (1 + 0.04 * i), dur, vw, 0.008 if "attack" in kind else 0.02, dec, br, gl, female, rough)
            x = reverb(x, 0.25, 0.1)
            sf.write(out / f"{kind}_{i + 1}.wav", norm(x, -3.0 if "attack" in kind else -4.0).astype(np.float32), SR, subtype="PCM_16")


def main():
    announcer()
    for d in sorted((ROOT / "data/characters").iterdir()):
        cj = json.loads((d / "character.json").read_text())
        char_voices(d.name, cj)
        print("voice:", d.name)


if __name__ == "__main__":
    main()
