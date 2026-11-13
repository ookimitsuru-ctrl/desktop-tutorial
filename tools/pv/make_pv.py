#!/usr/bin/env python3
"""PV（45 秒の宣伝映像）の編集。

pv_director.tscn が Movie Maker で撮った素材（raw.avi）とショットのログから、
150BPM の拍に合わせてカットをつなぎ、字幕・機体名・ロゴを重ね、BGM と効果音を混ぜて MP4 にする。

使い方: python3 tools/pv/make_pv.py <raw.avi> <raw_log.json> <出力.mp4> [作業ディレクトリ]
"""
import json
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FPS = 30
W, H = 1920, 1080
BEAT = 12  # 150BPM の 1 拍 = 0.4 秒 = 12 フレーム
FONT_DIR = pathlib.Path("/opt/tools/fonts/x/package")
JP_BLACK = str(FONT_DIR / "900Black/NotoSansJP_900Black.ttf")
JP_BOLD = str(FONT_DIR / "700Bold/NotoSansJP_700Bold.ttf")
LOGO = str(ROOT / "assets/fonts/DelaGothicOne-Regular.ttf")
RED = (232, 69, 44)
WHITE = (255, 255, 255)

# タイムライン: (ショット名, ショット内の開始フレーム, 使うフレーム数)。合計 1350 フレーム = 45.0 秒
TIMELINE = [
    ("hero", 0, 96),
    ("g1", 0, 48), ("g2", 0, 48),
    ("g3", 0, 96), ("g4", 0, 96), ("g5", 0, 96),
] + [(f"r{i}", 2, 24) for i in range(1, 10)] + [
    ("g6", 0, 72),
] + [(f"s{i}", 0, 48) for i in range(1, 7)] + [
    ("ko", 4, 96),
    ("lineup", 0, 198),
]
FLASHES = [6.4, 16.0, 25.6, 35.2, 38.4, 41.6]
STAGES = {"s1": "skyline", "s2": "bamboo", "s3": "lighthouse", "s4": "ruins", "s5": "temple", "s6": "fort"}
ROSTER = ["toma", "lena", "bjorn", "zaw", "yuelan", "mariel", "adrien", "ravi", "gensai"]


def font(path, size):
    return ImageFont.truetype(path, size)


def shadowed(img, draw_fn, blur=10, alpha=170, offset=(0, 4)):
    """文字の下に柔らかい影を敷く（draw_fn(draw, fill) で文字を描く）"""
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw_fn(ImageDraw.Draw(sh), (0, 0, 0, alpha))
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(sh, offset)
    draw_fn(ImageDraw.Draw(img), None)


def caption_center(text, path, y=850, size=84):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    f = font(JP_BLACK, size)
    tw = ImageDraw.Draw(img).textlength(text, font=f)
    x = (W - tw) / 2

    def d(dr, fill):
        dr.text((x, y), text, font=f, fill=fill or WHITE)
    shadowed(img, d)
    dr = ImageDraw.Draw(img)
    lw = tw * 0.22
    dr.rectangle([W / 2 - lw / 2, y + size * 1.48, W / 2 + lw / 2, y + size * 1.48 + 6], fill=RED)
    img.save(path)


def caption_tag(tag, text, path, size=66):
    """左下の見出し: 赤い斜めの札（英語）と白い大きな文字（日本語）"""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    ft = font(JP_BOLD, 30)
    x, y = 120, 800
    tw = dr.textlength(tag, font=ft)
    dr.polygon([(x, y), (x + tw + 44, y), (x + tw + 30, y + 50), (x - 14, y + 50)], fill=RED + (235,))
    dr.text((x + 14, y + 4), tag, font=ft, fill=WHITE)
    f = font(JP_BLACK, size)

    def d(dr2, fill):
        dr2.text((x, y + 62), text, font=f, fill=fill or WHITE)
    shadowed(img, d)
    img.save(path)


def stage_tag(name_ja, name_en, path):
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    dr = ImageDraw.Draw(img)
    f1 = font(JP_BLACK, 40)
    f2 = font(JP_BOLD, 22)
    t1 = "STAGE  " + name_ja
    w1 = dr.textlength(t1, font=f1)
    x = W - 110 - w1
    y = 168  # 試合の画面の体力ゲージ（上端）に重ならない高さ

    def d(dr2, fill):
        dr2.text((x, y), t1, font=f1, fill=fill or WHITE)
        dr2.text((x + 2, y + 54), name_en.upper(), font=f2, fill=fill or (200, 205, 215))
    shadowed(img, d, blur=6, alpha=200, offset=(0, 2))
    dr = ImageDraw.Draw(img)
    dr.rectangle([W - 96, y + 6, W - 88, y + 82], fill=RED)
    img.save(path)


def machine_card(cid, idx, path):
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    name = cj["name"][0]
    no = cj.get("machine", "")
    pilot = cj.get("pilot", ["", ""])[0]
    style = cj.get("style", ["", ""])[0]
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x, y = 150, 560
    fno = font(JP_BLACK, 44)
    fnm = font(JP_BLACK, 132)
    fpl = font(JP_BOLD, 40)
    fst = font(JP_BOLD, 32)
    fcnt = font(JP_BOLD, 28)

    def d(dr, fill):
        dr.text((x, y), no, font=fno, fill=fill or RED)
        dr.text((x - 6, y + 46), name, font=fnm, fill=fill or WHITE)
        dr.text((x, y + 236), "パイロット  " + pilot, font=fpl, fill=fill or WHITE)
        dr.text((x, y + 292), style, font=fst, fill=fill or (190, 196, 208))
    shadowed(img, d, blur=12, alpha=190)
    dr = ImageDraw.Draw(img)
    dr.rectangle([x - 40, y + 8, x - 30, y + 330], fill=RED)
    cnt = f"{idx:02d} / 09"
    dr.text((x, 120), "MACHINES & PILOTS", font=fcnt, fill=(205, 210, 220))
    dr.text((x, 158), cnt, font=font(JP_BLACK, 40), fill=WHITE)
    img.save(path)


def end_card(path):
    # 後ろの映像を暗くして文字を読みやすく（上ほど暗い）
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = Image.new("L", (1, H))
    for yy in range(H):
        grad.putpixel((0, yy), int(205 - 120 * (yy / H)))
    img.putalpha(grad.resize((W, H)))
    dr = ImageDraw.Draw(img)
    fl = font(LOGO, 200)
    fk = font(LOGO, 84)
    ft = font(JP_BLACK, 44)
    fa = font(JP_BOLD, 34)
    t = "RINGBOUND"
    tw = dr.textlength(t, font=fl)
    x = (W - tw) / 2
    y = 120

    def d(dr2, fill):
        dr2.text((x, y), t, font=fl, fill=fill or WHITE)
    shadowed(img, d, blur=16, alpha=210, offset=(0, 6))
    dr = ImageDraw.Draw(img)
    k = "闘 環"
    kw = dr.textlength(k, font=fk)
    dr.text(((W - kw) / 2, y + 236), k, font=fk, fill=RED)
    tag = "武術家が操る、機甲兵の3D対戦格闘"
    tgw = dr.textlength(tag, font=ft)

    def d2(dr2, fill):
        dr2.text(((W - tgw) / 2, y + 360), tag, font=ft, fill=fill or WHITE)
    shadowed(img, d2, blur=8, alpha=200, offset=(0, 3))
    dr = ImageDraw.Draw(img)
    a = "Android"
    aw = dr.textlength(a, font=fa)
    bx = (W - aw) / 2 - 28
    dr.rounded_rectangle([bx, y + 440, bx + aw + 56, y + 498], radius=10, outline=WHITE, width=3)
    dr.text((bx + 28, y + 446), a, font=fa, fill=WHITE)
    img.save(path)


def main():
    raw, log_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    work = pathlib.Path(sys.argv[4] if len(sys.argv) > 4 else pathlib.Path(out).parent / "pv_work")
    work.mkdir(parents=True, exist_ok=True)
    log = {r["name"]: r for r in json.loads(pathlib.Path(log_path).read_text())}

    # --- カット: 素材のフレーム範囲（撮影順 = 時間順なので select で一度に取り出せる）
    ranges = []
    t = 0
    starts = {}
    for name, off, n in TIMELINE:
        r = log[name]
        a = r["start"] + r["pre"] + off
        if off + n > r["len"] + 2:
            raise SystemExit(f"shot {name}: {off}+{n} > {r['len']}")
        ranges.append((a, a + n - 1))
        starts[name] = t / FPS
        t += n
    total = t
    assert total == 1350, total
    ranges.sort()
    vsel = "+".join(f"between(n,{a},{b})" for a, b in ranges)
    asel = "+".join(f"between(t,{a / FPS:.5f},{(b + 1) / FPS - 1e-4:.5f})" for a, b in ranges)

    # --- 重ねる画像
    ov = []  # (png, 始め, 終わり, フェード)
    caption_center("鋼の拳が、ぶつかり合う。", work / "c1.png")
    ov.append(("c1.png", 0.6, 3.05, 0.25))
    caption_center("武術家が操る、機甲兵の格闘戦。", work / "c2.png")
    ov.append(("c2.png", 3.35, 6.3, 0.15))
    caption_tag("3-BUTTON 3D FIGHTING", "P・K・Gの3ボタンで戦う、本格3D格闘", work / "c3.png")
    ov.append(("c3.png", 6.65, 9.45, 0.15))
    caption_tag("STRIKE / THROW / SIDESTEP", "打撃・投げ・横移動の読み合い", work / "c4.png")
    ov.append(("c4.png", 9.85, 12.65, 0.15))
    caption_tag("WALLS & RING OUTS", "壁際とリングアウトで一発逆転", work / "c5.png")
    ov.append(("c5.png", 13.05, 15.85, 0.15))
    for i, cid in enumerate(ROSTER):
        machine_card(cid, i + 1, work / f"m{i + 1}.png")
        a = starts[f"r{i + 1}"]
        ov.append((f"m{i + 1}.png", a, a + 0.8, 0.0))
    caption_tag("RING OUT", "場外へ、叩き落とせ。", work / "c6.png")
    ov.append(("c6.png", 23.35, 25.5, 0.12))
    for key, sid in STAGES.items():
        sj = json.loads((ROOT / f"data/stages/{sid}.json").read_text())
        stage_tag(sj["name"][0], sj["name"][1], work / f"st_{key}.png")
        a = starts[key]
        ov.append((f"st_{key}.png", a, a + 1.6, 0.0))
    caption_tag("9 STAGES", "雪原、砂漠、嵐の灯台 ― 9つの戦場", work / "c7.png")
    ov.append(("c7.png", 25.8, 30.25, 0.15))
    caption_tag("GAME MODES", "アーケード・VS・トレーニング・サバイバル", work / "c8.png", size=60)
    ov.append(("c8.png", 30.55, 35.05, 0.15))
    caption_center("9機の機甲兵、9人の武術家。", work / "c9.png", y=860, size=76)
    ov.append(("c9.png", 38.6, 41.4, 0.2))
    end_card(work / "end.png")
    ov.append(("end.png", 41.6, 45.0, 0.25))

    # --- ffmpeg
    bgm = ROOT / "assets/audio/bgm/bgm_arena.ogg"
    slam = ROOT / "assets/audio/sfx/ui_vs.wav"
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", raw, "-i", str(bgm), "-i", str(slam)]
    for png, a, b, _fd in ov:
        cmd += ["-loop", "1", "-framerate", str(FPS), "-t", f"{b:.3f}", "-i", str(work / png)]
    fc = []
    fc.append(f"[0:v]select='{vsel}',setpts=N/({FPS}*TB),format=yuv420p,"
              f"eq=contrast=1.05:saturation=1.08,vignette=angle=PI/5[v0]")
    cur = "v0"
    for k, (png, a, b, fd) in enumerate(ov):
        src = f"[{k + 3}:v]format=rgba"
        if fd > 0:
            src += f",fade=t=in:st={a:.3f}:d={fd}:alpha=1,fade=t=out:st={b - fd:.3f}:d={fd}:alpha=1"
        fc.append(f"{src}[o{k}]")
        fc.append(f"[{cur}][o{k}]overlay=0:0:enable='between(t,{a:.3f},{b:.3f})':eof_action=pass[v{k + 1}]")
        cur = f"v{k + 1}"
    for k, ft in enumerate(FLASHES):
        fc.append(f"color=c=white:s={W}x{H}:r={FPS}:d=0.3,format=rgba,fade=t=out:st=0:d=0.3:alpha=1,"
                  f"setpts=PTS+{ft:.3f}/TB[fl{k}]")
        fc.append(f"[{cur}][fl{k}]overlay=0:0:eof_action=pass[f{k}]")
        cur = f"f{k}"
    fc.append(f"[{cur}]fade=t=in:st=0:d=0.4,fade=t=out:st=44.3:d=0.7,trim=duration=45,format=yuv420p[vout]")
    fc.append(f"[0:a]aselect='{asel}',asetpts=N/SR/TB,volume=0.9,aresample=48000[ga]")
    fc.append("[1:a]atrim=0:45,asetpts=N/SR/TB,afade=t=in:st=0:d=0.3,afade=t=out:st=43.2:d=1.8,volume=0.8,aresample=48000[bg]")
    fc.append("[2:a]adelay=41600|41600,volume=1.0,aresample=48000[sx]")
    fc.append("[ga][bg][sx]amix=inputs=3:normalize=0:duration=longest,atrim=0:45,alimiter=limit=0.93[aout]")
    script = work / "filter.txt"
    script.write_text(";\n".join(fc))
    cmd += ["-filter_complex_script", str(script), "-map", "[vout]", "-map", "[aout]",
            "-r", str(FPS), "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", "45", out]
    print("ffmpeg:", len(ov), "overlays,", len(ranges), "cuts")
    subprocess.run(cmd, check=True)
    print("wrote", out)


if __name__ == "__main__":
    main()
