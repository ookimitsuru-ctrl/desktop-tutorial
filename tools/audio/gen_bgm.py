#!/usr/bin/env python3
"""BGM の自動作曲（MIDI）と FluidSynth によるレンダリング。
音色: FluidR3_GM（MIT ライセンス, Frank Wen）。曲は全て本プロジェクトのオリジナル。
出力: assets/audio/bgm/<id>.ogg（ループ用に末尾の残響を先頭へ重ねる）"""
import pathlib
import subprocess
import sys
import tempfile

import mido
import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "assets/audio/bgm"
SF2 = "/usr/share/sounds/sf2/FluidR3_GM.sf2"
SR = 44100
TPB = 480

SCALES = {
    "minor": [0, 2, 3, 5, 7, 8, 10], "major": [0, 2, 4, 5, 7, 9, 11], "dorian": [0, 2, 3, 5, 7, 9, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10], "hijaz": [0, 1, 4, 5, 7, 8, 10], "japanese": [0, 1, 5, 7, 8, 10, 12 - 2],
    "harmonic": [0, 2, 3, 5, 7, 8, 11], "lydian": [0, 2, 4, 6, 7, 9, 11],
}


class Song:
    def __init__(self, sid, bpm, root, mode, seed):
        self.id = sid
        self.bpm = bpm
        self.root = root
        self.scale = SCALES[mode]
        self.rng = np.random.default_rng(seed)
        self.tracks = {}
        self.programs = {}
        self.bars = 0

    def note_of(self, degree, octave=0):
        sc = self.scale
        o, d = divmod(degree, len(sc))
        return self.root + sc[d] + 12 * (o + octave)

    def chord(self, degree, octave=0, size=3):
        return [self.note_of(degree + 2 * k, octave) for k in range(size)]

    def add(self, ch, start_beats, dur_beats, note, vel):
        self.tracks.setdefault(ch, []).append((start_beats, dur_beats, int(note), int(max(1, min(127, vel)))))

    def write_midi(self, path):
        mid = mido.MidiFile(ticks_per_beat=TPB)
        meta = mido.MidiTrack()
        meta.append(mido.MetaMessage("set_tempo", tempo=mido.bpm2tempo(self.bpm)))
        mid.tracks.append(meta)
        for ch, notes in self.tracks.items():
            tr = mido.MidiTrack()
            ev = []
            if ch != 9:
                prog, vol = self.programs.get(ch, (0, 100))
                tr.append(mido.Message("program_change", channel=ch, program=prog, time=0))
                tr.append(mido.Message("control_change", channel=ch, control=7, value=vol, time=0))
                tr.append(mido.Message("control_change", channel=ch, control=91, value=self.programs.get(("rev", ch), 50), time=0))
            else:
                tr.append(mido.Message("control_change", channel=9, control=7, value=self.programs.get(9, (0, 110))[1], time=0))
            for s, d, n, v in notes:
                ev.append((int(s * TPB), 1, n, v))
                ev.append((int((s + d) * TPB), 0, n, 0))
            ev.sort(key=lambda e: (e[0], e[1]))
            now = 0
            for tk, on, n, v in ev:
                tr.append(mido.Message("note_on" if on else "note_off", channel=ch, note=n, velocity=v if on else 0, time=tk - now))
                now = tk
            mid.tracks.append(tr)
        mid.save(path)


# ---------------------------------------------------------------- パターン

def drums(s, style, bar0, bars, intensity=1.0, fill=True):
    K, S, CH, OH, RIM, LT, MT, HT, CR, RIDE, TAMB, CLAP = 36, 38, 42, 46, 37, 45, 47, 50, 49, 51, 54, 39
    for b in range(bars):
        base = (bar0 + b) * 4
        last = fill and b == bars - 1
        if style == "rock":
            for k in (0, 2, 2.5):
                s.add(9, base + k, 0.2, K, 110)
            for k in (1, 3):
                s.add(9, base + k, 0.2, S, 115)
            for k in range(8):
                s.add(9, base + k * 0.5, 0.1, CH, 70 + 20 * (k % 2 == 0))
            if b % 4 == 0:
                s.add(9, base, 0.5, CR, 100)
        elif style == "four":
            for k in range(4):
                s.add(9, base + k, 0.2, K, 115)
                s.add(9, base + k + 0.5, 0.1, OH, 70)
            for k in (1, 3):
                s.add(9, base + k, 0.2, CLAP, 100)
            for k in range(16):
                if k % 2:
                    s.add(9, base + k * 0.25, 0.05, CH, 45)
        elif style == "dnb":
            for k in (0, 1.75, 2.5):
                s.add(9, base + k, 0.15, K, 115)
            for k in (1, 3):
                s.add(9, base + k, 0.15, S, 120)
            s.add(9, base + 3.75, 0.1, S, 70)
            for k in range(16):
                s.add(9, base + k * 0.25, 0.05, CH, 40 + 25 * (k % 4 == 2))
        elif style == "taiko":
            for k in (0, 0.75, 1.5, 2, 3, 3.5):
                s.add(9, base + k, 0.3, LT if k in (0, 2) else MT, 100 + 15 * (k == 0))
            s.add(9, base + 2.5, 0.2, RIM, 80)
            if b % 2 == 1:
                for k in (3, 3.25, 3.5, 3.75):
                    s.add(9, base + k, 0.2, HT, 85)
        elif style == "march":
            s.add(9, base, 0.3, K, 110)
            s.add(9, base + 2, 0.3, K, 100)
            for k in (1, 3):
                s.add(9, base + k, 0.2, S, 110)
            for k in (1.75, 3.5, 3.75):
                s.add(9, base + k, 0.1, S, 70)
        elif style == "perc":
            pat = [(0, 64, 110), (0.5, 63, 70), (1, 62, 90), (1.5, 63, 70), (1.75, 63, 60), (2, 64, 100), (2.75, 62, 80), (3, 63, 85), (3.5, 62, 70)]
            for k, n, v in pat:
                s.add(9, base + k, 0.15, n, v)
            s.add(9, base, 0.2, K, 90)
            s.add(9, base + 2.5, 0.2, K, 80)
        elif style == "lofi":
            for k in (0, 1.75, 2.5):
                s.add(9, base + k, 0.2, K, 90)
            for k in (1, 3):
                s.add(9, base + k, 0.2, RIM, 85)
            for k in range(8):
                s.add(9, base + k * 0.5 + (0.08 if k % 2 else 0), 0.1, CH, 50)
        elif style == "halftime":
            s.add(9, base, 0.2, K, 115)
            s.add(9, base + 1.5, 0.2, K, 95)
            s.add(9, base + 2, 0.2, S, 120)
            for k in range(8):
                s.add(9, base + k * 0.5, 0.1, RIDE, 55)
        elif style == "light":
            s.add(9, base, 0.2, K, 80)
            s.add(9, base + 2, 0.2, K, 70)
            for k in range(8):
                s.add(9, base + k * 0.5, 0.1, TAMB if k % 2 else CH, 45)
        if last and style not in ("light", "perc", "lofi"):
            for k in range(4):
                s.add(9, base + 3 + k * 0.25, 0.1, [HT, MT, LT, S][k], 90 + k * 6)


def bass(s, ch, style, prog_degrees, bar0, octave=-2):
    for b, deg in enumerate(prog_degrees):
        base = (bar0 + b) * 4
        r = s.note_of(deg, octave)
        if style == "eighth":
            for k in range(8):
                s.add(ch, base + k * 0.5, 0.45, r if k != 7 else r + 7, 95 if k % 2 == 0 else 80)
        elif style == "offbeat":
            for k in range(4):
                s.add(ch, base + k + 0.5, 0.4, r, 100)
        elif style == "sync":
            for k, d in ((0, 0.7), (1.5, 0.4), (2.5, 0.4), (3.25, 0.5)):
                s.add(ch, base + k, d, r if k != 3.25 else r + 12, 100)
        elif style == "long":
            s.add(ch, base, 3.9, r, 90)
        elif style == "walk":
            for k in range(4):
                s.add(ch, base + k, 0.9, s.note_of(deg + [0, 2, 4, 2][k], octave), 85)
        elif style == "pulse":
            for k in range(16):
                s.add(ch, base + k * 0.25, 0.22, r, 70 + 20 * (k % 4 == 0))


def pad(s, ch, prog_degrees, bar0, octave=0, rhythm="hold", vel=70):
    for b, deg in enumerate(prog_degrees):
        base = (bar0 + b) * 4
        notes = s.chord(deg, octave, 3)
        if rhythm == "hold":
            for n in notes:
                s.add(ch, base, 3.95, n, vel)
        elif rhythm == "stab":
            for k in (0, 1.5, 2.5):
                for n in notes:
                    s.add(ch, base + k, 0.35, n, vel)
        elif rhythm == "power":
            r = s.note_of(deg, octave)
            for k in range(8):
                for n in (r, r + 7, r + 12):
                    s.add(ch, base + k * 0.5, 0.42, n, vel + (10 if k % 2 == 0 else 0))
        elif rhythm == "ostinato":
            seq = [notes[0], notes[1], notes[2], notes[1]] * 4
            for k, n in enumerate(seq):
                s.add(ch, base + k * 0.25, 0.22, n + 12, vel - 10 + 15 * (k % 4 == 0))
        elif rhythm == "arp":
            seq = [notes[0], notes[1], notes[2], notes[0] + 12, notes[2], notes[1]] * 3
            for k in range(16):
                s.add(ch, base + k * 0.25, 0.2, seq[k], vel)
        elif rhythm == "pluck":
            for k in range(4):
                n = notes[k % 3] + 12
                s.add(ch, base + k + 0.5 * (k % 2), 0.9, n, vel)


def motif(s, length_beats=8, density=0.6):
    """2小節のモチーフ（相対音度と長さ）"""
    cells = [[1, 1], [0.5, 0.5, 1], [1.5, 0.5], [0.5, 0.5, 0.5, 0.5], [2], [1, 0.5, 0.5], [0.75, 0.25, 1]]
    out = []
    beat = 0.0
    deg = int(s.rng.choice([0, 2, 4]))
    while beat < length_beats - 0.01:
        cell = cells[int(s.rng.integers(len(cells)))] if s.rng.random() < density + 0.3 else [2]
        for d in cell:
            if beat + d > length_beats:
                d = length_beats - beat
            if d <= 0:
                break
            rest = s.rng.random() < 0.12 and beat > 0
            out.append((beat, d, None if rest else deg))
            beat += d
            step = int(s.rng.choice([-2, -1, -1, 1, 1, 2, 0, 3, -3], p=[0.08, 0.2, 0.12, 0.2, 0.12, 0.08, 0.1, 0.05, 0.05]))
            deg = max(-3, min(9, deg + step))
    return out


def melody(s, ch, prog_degrees, bar0, mot, octave=1, vel=95, vary=0.0):
    for b2 in range(0, len(prog_degrees), 2):
        base = (bar0 + b2) * 4
        shift = prog_degrees[b2] % 7 if s.rng.random() < 0.5 else 0
        for beat, d, deg in mot:
            if deg is None:
                continue
            dd = deg + shift
            if vary > 0 and s.rng.random() < vary:
                dd += int(s.rng.choice([-1, 1, 2]))
            n = s.note_of(dd, octave)
            s.add(ch, base + beat, d * 0.95, n, vel - 8 + int(s.rng.integers(16)))


# ---------------------------------------------------------------- 曲

def song_battle(sid, bpm, root, mode, seed, progA, progB, kit, bass_style, chord_rhythm, programs, intro_bars=4, mel_oct=1, extra=None):
    s = Song(sid, bpm, root, mode, seed)
    s.programs.update(programs)
    mot_a = motif(s, 8, 0.6)
    mot_b = motif(s, 8, 0.75)
    bar = 0
    # イントロ
    intro = progA[:intro_bars]
    pad(s, 2, intro, bar, 0, "hold", 60)
    drums(s, kit, bar, intro_bars, fill=True) if kit not in ("none",) else None
    bar += intro_bars
    loop_start = bar
    for sec, prog, mot, oct_shift in (("A", progA, mot_a, 0), ("B", progB, mot_b, 1), ("A2", progA, mot_a, 0)):
        n = len(prog)
        if kit != "none":
            drums(s, kit, bar, n)
        bass(s, 1, bass_style, prog, bar)
        pad(s, 2, prog, bar, 0, chord_rhythm, 72)
        melody(s, 3, prog, bar, mot, mel_oct + (1 if sec == "B" else 0), 98, vary=0.25 if sec == "A2" else 0.0)
        if extra:
            extra(s, prog, bar, sec)
        bar += n
    s.bars = bar
    return s, loop_start


def render(s, loop_start_bar, gain=0.5):
    with tempfile.TemporaryDirectory() as td:
        mp = pathlib.Path(td) / "a.mid"
        wp = pathlib.Path(td) / "a.wav"
        s.write_midi(mp)
        subprocess.run(["fluidsynth", "-ni", "-q", "-g", str(gain), "-r", str(SR), "-F", str(wp), SF2, str(mp)], check=True,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        x, sr = sf.read(wp)
    if x.ndim == 1:
        x = np.stack([x, x], axis=1)
    spb = 60.0 / s.bpm
    total = int(round(s.bars * 4 * spb * SR))
    loop0 = int(round(loop_start_bar * 4 * spb * SR))
    tail = x[total:]
    x = x[:total].copy()
    if len(x) < total:
        x = np.concatenate([x, np.zeros((total - len(x), 2))])
    # 末尾の残響をループ開始位置へ重ねる（継ぎ目なし）
    if len(tail) > 0:
        n = min(len(tail), total - loop0)
        x[loop0:loop0 + n] += tail[:n]
    return x, loop0


def master(x, target_rms_db=-17.0):
    rms = np.sqrt(np.mean(x ** 2)) + 1e-9
    x = x * (10 ** (target_rms_db / 20) / rms)
    x = np.tanh(x * 1.1) / np.tanh(1.1)
    peak = np.max(np.abs(x))
    if peak > 0.97:
        x = x / peak * 0.97
    return x


def save(sid, x, loop0, loop=True):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f"{sid}.ogg"
    # libsndfile の Vorbis 書き込みは大きな一括書き込みで落ちることがあるため分割して書く
    with sf.SoundFile(path, "w", SR, 2, format="OGG", subtype="VORBIS") as f:
        data = x.astype(np.float32)
        for k in range(0, len(data), 8192):
            f.write(data[k:k + 8192])
    imp = path.with_suffix(".ogg.import")
    imp.write_text(f'[remap]\n\nimporter="oggvorbisstr"\ntype="AudioStreamOggVorbis"\n\n[params]\n\nloop={"true" if loop else "false"}\nloop_offset={loop0 / SR:.4f}\nbpm=0\nbeat_count=0\nbar_beats=4\n')
    print(f"{sid}: {len(x) / SR:.1f}s loop@{loop0 / SR:.2f}s {path.stat().st_size // 1024}KB")


# GM 音色（0 始まり）
P = dict(piano=0, epiano=4, organ=16, nylon=24, steel=25, jazzg=26, cleang=27, mutedg=28, overdrive=29, distortion=30,
         fbass=33, pbass=34, fretless=35, slap=36, synbass1=38, synbass2=39, violin=40, strings=48, slowstr=49, synstr=50,
         choir=52, orchhit=55, trumpet=56, brass=61, synbrass=62, flute=73, recorder=74, panflute=75, shakuhachi=77,
         whistle=78, square=80, saw=81, calliope=82, chiff=83, charang=84, voice=85, fifths=86, basslead=87,
         newage=88, warmpad=89, polysynth=90, choirpad=91, bowed=92, metallic=93, halo=94, sweep=95,
         sitar=104, banjo=105, shamisen=106, koto=107, kalimba=108, taiko=116, timpani=47, harp=46, glock=9, vibes=11)


def ch(prog, vol=100):
    return prog, vol


def main():
    only = set(sys.argv[1:])
    songs = []

    def want(n):
        return not only or n in only

    if want("bgm_arena"):
        s, l0 = song_battle("bgm_arena", 150, 52, "minor", 11, [0, 5, 3, 4] * 2, [5, 3, 0, 4, 5, 3, 6, 4], "rock", "eighth", "power",
                            {1: ch(P["pbass"], 105), 2: ch(P["distortion"], 82), 3: ch(P["square"], 92), 9: ch(0, 115)})
        songs.append((s, l0))
    if want("bgm_harbor"):
        s, l0 = song_battle("bgm_harbor", 132, 45, "phrygian", 22, [0, 0, 1, 6] * 2, [3, 1, 0, 6, 3, 1, 5, 6], "four", "offbeat", "arp",
                            {1: ch(P["synbass2"], 105), 2: ch(P["saw"], 70), 3: ch(P["polysynth"], 85), 9: ch(0, 110), ("rev", 3): 80})
        songs.append((s, l0))
    if want("bgm_bamboo"):
        def bamboo_extra(sg, prog, bar, sec):
            pad(sg, 4, prog, bar, 0, "pluck", 70)
        s, l0 = song_battle("bgm_bamboo", 120, 50, "japanese", 33, [0, 3, 4, 3] * 2, [5, 4, 3, 0, 5, 4, 1, 0], "taiko", "long", "hold",
                            {1: ch(P["fretless"], 90), 2: ch(P["warmpad"], 60), 3: ch(P["shakuhachi"], 100), 4: ch(P["koto"], 90), 9: ch(0, 105), ("rev", 3): 90},
                            extra=bamboo_extra)
        songs.append((s, l0))
    if want("bgm_fort"):
        def fort_extra(sg, prog, bar, sec):
            pad(sg, 4, prog, bar, -1, "stab", 85)
        s, l0 = song_battle("bgm_fort", 112, 50, "harmonic", 44, [0, 5, 3, 4] * 2, [5, 6, 4, 0, 3, 4, 5, 4], "march", "walk", "ostinato",
                            {1: ch(P["strings"], 95), 2: ch(P["strings"], 80), 3: ch(P["brass"], 95), 4: ch(P["timpani"], 100), 9: ch(0, 100), ("rev", 3): 70},
                            extra=fort_extra)
        songs.append((s, l0))
    if want("bgm_ruins"):
        s, l0 = song_battle("bgm_ruins", 124, 50, "hijaz", 55, [0, 1, 0, 6] * 2, [3, 1, 0, 6, 4, 3, 1, 0], "perc", "sync", "hold",
                            {1: ch(P["fbass"], 100), 2: ch(P["bowed"], 60), 3: ch(P["sitar"], 100), 9: ch(0, 110), ("rev", 3): 70})
        songs.append((s, l0))
    if want("bgm_skyline"):
        s, l0 = song_battle("bgm_skyline", 172, 47, "minor", 66, [0, 5, 6, 4] * 2, [3, 4, 0, 5, 3, 4, 6, 6], "dnb", "sync", "hold",
                            {1: ch(P["synbass1"], 110), 2: ch(P["halo"], 70), 3: ch(P["square"], 85), 9: ch(0, 115), ("rev", 3): 75})
        songs.append((s, l0))
    if want("bgm_temple"):
        s, l0 = song_battle("bgm_temple", 108, 48, "japanese", 77, [0, 4, 3, 1] * 2, [5, 4, 0, 3, 5, 4, 1, 0], "taiko", "long", "pluck",
                            {1: ch(P["fretless"], 85), 2: ch(P["shamisen"], 85), 3: ch(P["flute"], 95), 9: ch(0, 110), ("rev", 3): 85})
        songs.append((s, l0))
    if want("bgm_raft"):
        s, l0 = song_battle("bgm_raft", 140, 55, "major", 88, [0, 4, 5, 3] * 2, [3, 0, 4, 5, 3, 0, 4, 4], "light", "walk", "pluck",
                            {1: ch(P["fbass"], 95), 2: ch(P["steel"], 90), 3: ch(P["whistle"], 85), 9: ch(0, 100), ("rev", 3): 60})
        songs.append((s, l0))
    if want("bgm_boss"):
        def boss_extra(sg, prog, bar, sec):
            pad(sg, 4, prog, bar, 0, "hold", 80)
            for b in range(len(prog)):
                if b % 2 == 0:
                    for n in sg.chord(prog[b], 0, 3):
                        sg.add(5, (bar + b) * 4, 0.5, n, 110)
        s, l0 = song_battle("bgm_boss", 140, 50, "harmonic", 99, [0, 5, 1, 4] * 2, [3, 1, 4, 0, 5, 1, 6, 4], "halftime", "sync", "ostinato",
                            {1: ch(P["synbass2"], 105), 2: ch(P["strings"], 90), 3: ch(P["brass"], 95), 4: ch(P["choir"], 85), 5: ch(P["orchhit"], 85), 9: ch(0, 115), ("rev", 4): 90},
                            extra=boss_extra)
        songs.append((s, l0))
    if want("bgm_title"):
        s, l0 = song_battle("bgm_title", 90, 50, "minor", 101, [0, 5, 3, 4], [5, 3, 0, 4], "taiko", "long", "hold",
                            {1: ch(P["strings"], 80), 2: ch(P["choirpad"], 70), 3: ch(P["shakuhachi"], 90), 9: ch(0, 105), ("rev", 3): 100}, intro_bars=4)
        songs.append((s, l0))
    if want("bgm_menu"):
        s, l0 = song_battle("bgm_menu", 92, 53, "dorian", 102, [0, 3, 4, 3] * 2, [5, 3, 1, 4] * 2, "lofi", "walk", "hold",
                            {1: ch(P["fbass"], 85), 2: ch(P["epiano"], 70), 3: ch(P["koto"], 80), 9: ch(0, 95), ("rev", 3): 70})
        songs.append((s, l0))
    if want("bgm_select"):
        s, l0 = song_battle("bgm_select", 128, 50, "minor", 103, [0, 5, 3, 4], [5, 6, 4, 4], "halftime", "pulse", "ostinato",
                            {1: ch(P["synbass1"], 90), 2: ch(P["strings"], 85), 3: ch(P["brass"], 80), 9: ch(0, 100)}, intro_bars=2)
        songs.append((s, l0))
    if want("bgm_training"):
        s, l0 = song_battle("bgm_training", 100, 52, "dorian", 104, [0, 3] * 4, [5, 4] * 4, "lofi", "walk", "hold",
                            {1: ch(P["fbass"], 80), 2: ch(P["warmpad"], 60), 3: ch(P["vibes"], 70), 9: ch(0, 85)})
        songs.append((s, l0))
    if want("bgm_ending"):
        s, l0 = song_battle("bgm_ending", 76, 53, "major", 105, [0, 4, 5, 3] * 2, [3, 4, 0, 5, 3, 4, 0, 0], "none", "long", "hold",
                            {1: ch(P["strings"], 70), 2: ch(P["slowstr"], 70), 3: ch(P["piano"], 95), ("rev", 3): 90})
        songs.append((s, l0))
    for s, l0 in songs:
        x, loop0 = render(s, l0)
        save(s.id, master(x), loop0)
    # ジングル（ループなし）
    for sid, prog, notes in (("bgm_result_win", P["brass"], [0, 2, 4, 7]), ("bgm_result_lose", P["strings"], [4, 3, 1, 0])):
        if not want(sid):
            continue
        s = Song(sid, 100, 55, "major" if "win" in sid else "minor", 7)
        s.programs[3] = ch(prog, 100)
        s.programs[2] = ch(P["timpani"], 100)
        for k, d in enumerate(notes):
            s.add(3, k * 0.5, 0.45 if k < 3 else 2.5, s.note_of(d, 0), 105)
            s.add(3, k * 0.5, 0.45 if k < 3 else 2.5, s.note_of(d + 2, 0), 90)
        s.add(2, 1.5, 0.5, s.note_of(0, -2), 110)
        s.bars = 2
        x, _ = render(s, 0)
        save(sid, master(x, -16.0), 0, loop=False)


if __name__ == "__main__":
    main()
