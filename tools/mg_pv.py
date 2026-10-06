#!/usr/bin/env python3
"""45 秒のモーショングラフィック風 PV を合成する
素材: tools/mg_capture.js で撮ったクリップ (<素材>/<名前>/00000.jpg ...)
音楽: music/out/warp.wav (174 BPM) を小節単位で編集。映像の切り替えはすべて小節/拍に合わせる
使い方: python3 tools/mg_pv.py <素材フォルダ> <出力フォルダ>   → frames/*.jpg, audio.wav
"""
import sys, os, math
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageChops

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(os.path.join(OUT, 'frames'), exist_ok=True)
W, H, FPS = 1280, 720, 30
BPM = 174
BEAT = 60 / BPM
BAR = BEAT * 4
TOTAL = 45.0
NF = int(TOTAL * FPS)
HERE = os.path.dirname(os.path.abspath(__file__))

CYAN = (80, 240, 255)
MAG = (255, 60, 160)
AMBER = (255, 190, 60)
WHITE = (235, 245, 255)
BG = (4, 6, 14)
MONO = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf', 18)
MONO_S = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 14)


# =====================================================================
# 補間
# =====================================================================
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def sat(x): return clamp(x)
def out_expo(x): x = sat(x); return 1 if x >= 1 else 1 - 2 ** (-10 * x)
def out_cubic(x): x = sat(x); return 1 - (1 - x) ** 3
def in_out(x): x = sat(x); return 4 * x ** 3 if x < 0.5 else 1 - (-2 * x + 2) ** 3 / 2
def lerp(a, b, u): return a + (b - a) * u


# =====================================================================
# ゲームのストロークフォント (game/src/font.js を移植)
# =====================================================================
GDEF = {
    'A': ['002640', '1232'], 'B': ['063645443303', '3342413000', '0006'], 'C': ['4536160501103041'],
    'D': ['0006', '063645413000'], 'E': ['46060040', '0333'], 'F': ['460600', '0333'],
    'G': ['45361605011030414323'], 'H': ['0006', '4046', '0343'], 'I': ['1636', '2026', '1030'],
    'J': ['4641301001'], 'K': ['0006', '460340'], 'L': ['060040'], 'M': ['0006244640'], 'N': ['00064046'],
    'O': ['010516364541301001'], 'P': ['0006', '063645443303'], 'Q': ['010516364541301001', '2240'],
    'R': ['0006', '063645443303', '2340'], 'S': ['453616050413334241301001'], 'T': ['0646', '2620'],
    'U': ['060110304146'], 'V': ['062046'], 'W': ['0610223046'], 'X': ['0046', '0640'], 'Y': ['062346', '2320'],
    'Z': ['06460040'],
    '0': ['010516364541301001', '1034'], '1': ['142620', '1030'], '2': ['05163645440040'],
    '3': ['064623334241301001'], '4': ['30360242'], '5': ['4606033342413000'], '6': ['46160501103041423303'],
    '7': ['064610'], '8': ['13040516364544331302011030414233'], '9': ['43130405163645413010'],
    '-': ['1333'], '+': ['1333', '2224'], '.': ['2021'], ':': ['2122', '2425'], '/': ['0046'],
    '!': ['2622', '2021'], '?': ['05163645442322', '2021'], '>': ['064300'], '<': ['460340'],
    'x': ['1135', '1531'], '&': ['40141526353401102043'], "'": ['2426'], ',': ['2110'],
}
GLY = {k: [[(int(s[i]), int(s[i + 1])) for i in range(0, len(s) - 1, 2)] for s in v] for k, v in GDEF.items()}
ADV = 5.3 / 6


def text_w(s, size):
    return len(s) * ADV * size - (ADV - 4 / 6) * size


def stroke_text(dr, s, x, y, size, col, width=3, prog=1.0, align='c', italic=0.0, alpha=1.0, stagger=0.0):
    """文字列をストロークで描く。prog: 0→1 で一筆ずつ描き進める (stagger>0 なら文字ごとに遅れて開始)"""
    s = str(s)
    tw = text_w(s, size)
    ox = x - tw / 2 if align == 'c' else (x - tw if align == 'r' else x)
    sc = size / 6
    y0 = y + size / 2   # 画面座標は下向き → フォントの y を反転
    col = tuple(int(c * alpha) for c in col)
    n = len(s)
    for i, ch in enumerate(s):
        gl = GLY.get(ch) or GLY.get(ch.upper())
        if gl:
            # 文字ごとの進行
            if stagger > 0:
                st = i / max(1, n) * stagger
                p = sat((prog - st) / max(1e-6, 1 - stagger))
            else:
                p = prog
            segs = []
            for stroke in gl:
                for a, b in zip(stroke, stroke[1:]):
                    segs.append(((ox + (a[0] + a[1] * italic) * sc, y0 - a[1] * sc), (ox + (b[0] + b[1] * italic) * sc, y0 - b[1] * sc)))
            L = sum(math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]) for q in segs) or 1
            budget = p * L
            for (ax, ay), (bx, by) in segs:
                l = math.hypot(bx - ax, by - ay)
                if budget <= 0: break
                if budget < l:
                    u = budget / l; bx, by = ax + (bx - ax) * u, ay + (by - ay) * u
                dr.line([(ax, ay), (bx, by)], fill=col, width=width)
                budget -= l
        ox += ADV * size


def mono(dr, s, x, y, col, font=MONO, anchor='la', alpha=1.0, typed=1.0):
    s = s[:int(round(len(s) * sat(typed)))]
    dr.text((x, y), s, fill=tuple(int(c * alpha) for c in col), font=font, anchor=anchor)


# =====================================================================
# 素材
# =====================================================================
_cache = {}


def clip(name, t, size=(W, H)):
    """クリップ name の t 秒目のフレーム (範囲外は端で止める)"""
    d = os.path.join(SRC, name)
    if name not in _cache:
        _cache[name] = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
    fs = _cache[name]
    i = int(clamp(round(t * FPS), 0, len(fs) - 1))
    im = Image.open(os.path.join(d, fs[i])).convert('RGB')
    if size != (W, H): im = im.resize(size, Image.BILINEAR)
    return im


def crop_center(im, w, h, zoom=1.0):
    """16:9 素材から w×h 枠ぶんを中央クロップ (zoom で拡大)"""
    iw, ih = im.size
    s = max(w / iw, h / ih) * zoom
    im = im.resize((max(1, int(iw * s)), max(1, int(ih * s))), Image.BILINEAR)
    x0, y0 = (im.size[0] - w) // 2, (im.size[1] - h) // 2
    return im.crop((x0, y0, x0 + w, y0 + h))


def paste_panel(base, glow, im, x, y, w, h, col=CYAN, border=2, brackets=True, alpha=1.0):
    if w < 4 or h < 4: return
    p = crop_center(im, int(w), int(h))
    if alpha < 1: p = Image.blend(Image.new('RGB', p.size, BG), p, alpha)
    base.paste(p, (int(x), int(y)))
    g = ImageDraw.Draw(glow)
    g.rectangle([x, y, x + w, y + h], outline=col, width=border)
    if brackets:
        L = 18
        for cx, cy, sx, sy in ((x, y, 1, 1), (x + w, y, -1, 1), (x, y + h, 1, -1), (x + w, y + h, -1, -1)):
            g.line([(cx - sx * 6, cy + sy * L), (cx - sx * 6, cy - sy * 6), (cx + sx * L, cy - sy * 6)], fill=col, width=3)


def scanlines(img, k=0.12):
    a = np.asarray(img).astype(np.float32)
    a[::3] *= (1 - k)
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))


def rgb_split(img, px):
    if px < 1: return img
    r, g, b = img.split()
    r = ImageChops.offset(r, int(px), 0); b = ImageChops.offset(b, -int(px), 0)
    return Image.merge('RGB', (r, g, b))


def glitch(img, amt, seed):
    if amt <= 0: return img
    rng = np.random.default_rng(seed)
    a = np.asarray(img).copy()
    for _ in range(int(3 + 10 * amt)):
        y = rng.integers(0, H - 20); h = rng.integers(4, 40); dx = int(rng.integers(-60, 60) * amt)
        a[y:y + h] = np.roll(a[y:y + h], dx, axis=1)
    return Image.fromarray(a)


# =====================================================================
# 背景・共通 HUD
# =====================================================================
DOTS = np.random.default_rng(3).uniform(0, 1, (140, 3))


def background(t):
    img = Image.new('RGB', (W, H), BG)
    dr = ImageDraw.Draw(img)
    # 奥へ流れるグリッド (パース付きの床)
    hz = H * 0.62
    for k in range(14):
        z = ((k + (t * 1.6) % 1) / 14)
        y = hz + (H - hz) * z ** 2
        c = int(18 + 40 * z)
        dr.line([(0, y), (W, y)], fill=(0, c // 2, c), width=1)
    for i in range(-12, 13):
        dr.line([(W / 2 + i * 18, hz), (W / 2 + i * 150, H)], fill=(0, 22, 44), width=1)
    # 漂う点
    for x, y, s in DOTS:
        xx = (x * W + t * 30 * (0.3 + s)) % W
        b = int(60 + 120 * s)
        dr.point((xx, y * hz), fill=(b // 2, b, b))
    return img


def hud(glow, base, t, label, idx):
    """四隅のブラケット・ラベル・タイムコード・拍の点滅"""
    g = ImageDraw.Draw(glow); d = ImageDraw.Draw(base)
    m, L = 26, 30
    for cx, cy, sx, sy in ((m, m, 1, 1), (W - m, m, -1, 1), (m, H - m, 1, -1), (W - m, H - m, -1, -1)):
        g.line([(cx, cy + sy * L), (cx, cy), (cx + sx * L, cy)], fill=(60, 150, 200), width=2)
    mono(d, 'WIRED', m + 14, m + 8, CYAN, MONO)
    mono(d, '// ' + label, m + 90, m + 8, (120, 170, 200), MONO)
    mono(d, '%02d' % idx, W - m - 14, m + 8, MAG, MONO, anchor='ra')
    fr = int(t * FPS)
    mono(d, 'T+%02d:%02d:%02d' % (fr // (FPS * 60), (fr // FPS) % 60, fr % FPS), m + 14, H - m - 26, (110, 160, 190), MONO_S)
    # 拍のメーター
    bt = (t / BEAT) % 4
    for i in range(4):
        on = int(bt) == i
        x = W - m - 120 + i * 26
        g.rectangle([x, H - m - 22, x + 18, H - m - 14], fill=MAG if on else (40, 60, 80))
    mono(d, '174 BPM', W - m - 14, H - m - 44, (110, 160, 190), MONO_S, anchor='ra')


# =====================================================================
# 小節ごとのシーン
# =====================================================================
def T(bar): return bar * BAR


def feature(base, glow, t, t0, num, name, title, sub, side, col):
    """機能紹介: 素材パネルが横から滑り込み、反対側に番号・見出し・説明"""
    u = t - t0
    d = ImageDraw.Draw(base); g = ImageDraw.Draw(glow)
    pw, ph = 740, 416
    k = out_expo(u / 0.45)
    if side == 'r':
        px = lerp(W + 40, W - pw - 60, k); tx = 70
    else:
        px = lerp(-pw - 40, 60, k); tx = 830
    py = (H - ph) // 2 + 10
    paste_panel(base, glow, clip(name, u), px, py, pw, ph, col)
    # 番号 (大きなアウトライン) + 見出し + 説明
    stroke_text(g, num, tx + 10, 205, 110, col, 4, prog=out_cubic(u / 0.4), align='l')
    lines = title.split('\n')
    for i, ln in enumerate(lines):
        stroke_text(g, ln, tx + 10, 330 + i * 56, 40, WHITE, 3, prog=sat((u - 0.15 - i * 0.12) / 0.45), align='l', stagger=0.4)
    yy = 330 + len(lines) * 56 - 10
    g.line([(tx + 10, yy), (tx + 10 + 340 * out_expo((u - 0.3) / 0.6), yy)], fill=col, width=3)
    for i, s in enumerate(sub.split('\n')):
        mono(d, s, tx + 12, yy + 18 + i * 26, (170, 210, 230), MONO, typed=(u - 0.5 - i * 0.2) / 0.5)


def big_word(g, word, t0, t, size, col, y=H / 2, dur=0.3):
    stroke_text(g, word, W / 2, y, size, col, 6, prog=out_cubic((t - t0) / dur), align='c', stagger=0.3)


# 場面の並び (小節数)。機能紹介・ボス紹介を省き、残りを約 1.5 倍に伸ばして 45 秒
SCENES = [('intro', 6), ('logo', 3), ('quad', 1.5), ('stages', 3), ('warp', 1.5), ('err', 3), ('wall', 3),
          ('kill', 1.5), ('hull', 3.5), ('flyby', 3), ('final', 99)]
STARTS = []
_b = 0.0
for _n, _l in SCENES:
    STARTS.append((_n, _b, _l)); _b += _l


def frame(t):
    """t 秒目の 1 フレームを作る"""
    for name, b0, nb in STARTS:
        if t < (b0 + nb) * BAR: break
    u = t - b0 * BAR            # 場面内の経過秒
    dur = nb * BAR
    ub = (t / BAR) % 1
    beat = int(u / BEAT)        # 場面内の拍
    base = background(t)
    glow = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(base); g = ImageDraw.Draw(glow)
    label, idx = 'INTRO', 0
    post_split = 0; post_glitch = 0; flash = 0.0

    if name == 'intro':
        # ---- 文字のモーション (各 1.5 小節)
        label, idx = 'TRANSMISSION', 0
        g.line([(W / 2 - 520 * out_expo(u / 0.8), H / 2 + 70), (W / 2 + 520 * out_expo(u / 0.8), H / 2 + 70)], fill=CYAN, width=2)
        part = int(u / (1.5 * BAR)); pu = u - part * 1.5 * BAR
        if part == 0:
            mono(d, '> INCOMING SIGNAL', W / 2, H / 2 - 120, (140, 200, 230), MONO, anchor='ma', typed=u / 1.0)
            big_word(g, 'A WIREFRAME', 0.3, pu, 70, WHITE, dur=1.1)
        elif part == 1:
            big_word(g, 'COCKPIT SHOOTER', 0, pu, 70, WHITE, dur=1.0)
            for b in range(int(pu / BEAT) + 1):   # 拍ごとに広がる輪
                r = 40 + 420 * out_expo((pu - b * BEAT) / 0.7)
                a = int(160 * (1 - sat((pu - b * BEAT) / 0.7)))
                g.ellipse([W / 2 - r, H / 2 - r, W / 2 + r, H / 2 + r], outline=(0, a, a), width=2)
        elif part == 2:
            big_word(g, 'LOCK ON', 0, pu, 130, CYAN, dur=0.6)
            r = 210 * out_expo(pu / 0.6)
            g.ellipse([W / 2 - r, H / 2 - r * 0.6, W / 2 + r, H / 2 + r * 0.6], outline=MAG, width=2)
            for b in range(int(pu / BEAT) + 1):   # 拍ごとにロックの四角が吸い付く
                ang = b * 1.7 + 0.4
                cx, cy = W / 2 + math.cos(ang) * 330, H / 2 + math.sin(ang) * 150
                sz = 26 * (1 + 2 * (1 - out_expo((pu - b * BEAT) / 0.25)))
                g.rectangle([cx - sz, cy - sz, cx + sz, cy + sz], outline=AMBER, width=3)
                mono(d, 'LOCK %d' % (b + 1), cx + sz + 6, cy - 8, AMBER, MONO_S)
        else:
            words = ['FIRE', 'ON', 'THE', 'BEAT']
            k = min(3, int(pu / BEAT))
            big_word(g, words[k], k * BEAT, pu, 170 if k == 3 else 130, MAG if k == 3 else WHITE, dur=0.12)
            if k == 3: flash = 0.25 * sat((u - (dur - 0.2)) / 0.2)
            post_split = 3
    elif name == 'logo':
        # ---- ロゴ着地 (ゲームのオープニング)
        label, idx = 'TITLE', 1
        base = clip('op', 2.62 + u)
        d = ImageDraw.Draw(base)
        post_split = 8 * (1 - sat(u / 0.4)); post_glitch = 1 - sat(u / 0.3)
        mono(d, 'A RHYTHM-SYNCED LOCK-ON SHOOTER FOR ANDROID', W / 2, H - 120, (180, 220, 240), MONO, anchor='ma', typed=(u - 0.8) / 1.2)
    elif name == 'quad':
        # ---- 4 面: 2x2 で拍ごとに出る
        label, idx = 'STAGES', 2
        names = [('s1', '01 OUTER BELT'), ('s2', '02 STATION TRENCH'), ('err', '03 HYPERSPACE'), ('s4', '04 DREADNOUGHT')]
        pw, ph = 560, 300
        for i, (nm, lab) in enumerate(names):
            k = out_expo((u - i * BEAT) / 0.35)
            if k <= 0: continue
            cx = 90 + (i % 2) * (pw + 40); cy = 70 + (i // 2) * (ph + 40)
            w = pw * k
            paste_panel(base, glow, clip(nm, 0.5 + u * 0.8), cx + (pw - w) / 2, cy, w, ph, CYAN if i % 2 == 0 else MAG, brackets=False)
            mono(d, lab, cx + 10, cy + ph - 26, WHITE, MONO, typed=(u - i * BEAT - 0.1) / 0.3)
        bw = W * out_expo((u - 0.1) / 0.5)
        d.rectangle([W / 2 - bw / 2, H / 2 - 52, W / 2 + bw / 2, H / 2 + 52], fill=BG)
        stroke_text(g, '4 STAGES', W / 2, H / 2, 80, WHITE, 5, prog=out_cubic((u - 0.15) / 0.5), stagger=0.3)
    elif name == 'stages':
        # ---- 各面を 3 拍ずつ
        label, idx = 'STAGES', 3
        seg = dur / 4
        k = min(3, int(u / seg))
        nm, num, nmtxt, col = [('s1', '01', 'OUTER BELT', CYAN), ('s2', '02', 'STATION TRENCH', AMBER), ('wall', '03', 'HYPERSPACE', MAG), ('s4', '04', 'DREADNOUGHT', CYAN)][k]
        su = u - k * seg
        base = clip(nm, 0.4 + su)
        base = Image.fromarray((np.asarray(base).astype(np.float32) * 0.8).astype(np.uint8))
        d = ImageDraw.Draw(base)
        x = lerp(-200, 70, out_expo(su / 0.3))
        stroke_text(g, num, x, H / 2 - 30, 230, col, 7, prog=out_cubic(su / 0.25), align='l')
        stroke_text(g, nmtxt, x + 10, H / 2 + 130, 44, WHITE, 3, prog=out_cubic((su - 0.1) / 0.4), align='l', stagger=0.4)
        post_glitch = 0.8 * (1 - sat(su / 0.12))
    elif name == 'warp':
        # ---- ワープ突入 (スローで、星が伸び切った瞬間に場面が終わる)
        label, idx = 'HYPERSPACE', 4
        base = clip('warp', u * 1.38 / dur)
        d = ImageDraw.Draw(base)
        mono(d, '> ENGAGE HYPERSPACE', W / 2, H - 130, CYAN, MONO, anchor='ma', typed=u / 0.8)
        post_split = 6 * sat(u / dur) ** 3
    elif name == 'err':
        label, idx = 'HYPERSPACE', 5
        base = clip('err', 0.2 + u * 0.7)
        d = ImageDraw.Draw(base)
        yb = H - 150
        sh = (u * 120) % 40
        for i in range(-2, 36):   # 警告の斜線帯
            x0 = i * 40 + sh
            g.polygon([(x0, yb), (x0 + 20, yb), (x0 + 0, yb + 22), (x0 - 20, yb + 22)], fill=(90, 70, 0))
        stroke_text(g, 'INDESTRUCTIBLE', 70, yb - 90, 54, AMBER, 4, prog=out_cubic(u / 0.5), align='l', stagger=0.4)
        stroke_text(g, 'ASTEROIDS', 70, yb - 30, 54, WHITE, 4, prog=out_cubic((u - 0.2) / 0.5), align='l', stagger=0.4)
        if u < 0.1: flash = 0.5 * (1 - u / 0.1)
    elif name == 'wall':
        label, idx = 'HYPERSPACE', 6
        base = clip('wall', 0.4 + u * 0.65)
        d = ImageDraw.Draw(base)
        for j, wd in enumerate(['DODGE.', 'GRAZE.', 'SURVIVE.']):
            t0 = j * 3 * BEAT
            if u >= t0:
                stroke_text(g, wd, 80 + j * 380, H / 2 + 200, 62, [CYAN, MAG, WHITE][j], 5, prog=out_cubic((u - t0) / 0.25), align='l')
        post_glitch = 0.5 * (1 - sat((u % (3 * BEAT)) / 0.1)) if u < 9 * BEAT else 0
    elif name == 'kill':
        label, idx = 'FINAL BATTLE', 7
        base = clip('kill', u * 0.8)
        d = ImageDraw.Draw(base)
        big_word(g, 'BREAK THE CORE', 0.15, u, 64, WHITE, y=H - 130, dur=0.5)
        if u < 0.12: flash = 0.6 * (1 - u / 0.12)
    elif name == 'hull':
        # ---- エンディング: 船腹の並走
        label, idx = 'HOMECOMING', 8
        base = clip('hull', 0.3 + u * 0.68)
        d = ImageDraw.Draw(base)
        x = 70
        d.rectangle([x - 10, H - 170, x + 560 * out_expo((u - 0.3) / 0.6), H - 100], fill=(0, 0, 0))
        g.line([(x - 10, H - 170), (x - 10, H - 100)], fill=CYAN, width=4)
        stroke_text(g, 'RETURN TO THE', x + 10, H - 150, 26, (170, 220, 240), 2, prog=sat((u - 0.5) / 0.6), align='l')
        stroke_text(g, 'MOTHERSHIP', x + 10, H - 116, 34, WHITE, 3, prog=sat((u - 0.7) / 0.7), align='l', stagger=0.3)
    elif name == 'flyby':
        # ---- 加速して通過 → 白 (クリップの閃光 2.8 秒目が場面の終わりに来るよう速度を合わせる)
        label, idx = 'HOMECOMING', 9
        base = clip('flyby', 0.06 + u * 2.74 / dur)
        d = ImageDraw.Draw(base)
        lb = 70 * out_expo(u / 0.8)   # シネマスコープの帯
        d.rectangle([0, 0, W, lb], fill=(0, 0, 0)); d.rectangle([0, H - lb, W, H], fill=(0, 0, 0))
        flash = sat((u - dur + 0.15) / 0.15)
    else:
        # ---- 最後: ロゴ
        label, idx = 'WIRED', 10
        flash = 1 - sat(u / 0.6)
        g.line([(W / 2 - 560 * out_expo(u / 1.0), H / 2 + 92), (W / 2 + 560 * out_expo(u / 1.0), H / 2 + 92)], fill=CYAN, width=3)
        g.line([(W / 2 - 440 * out_expo((u - 0.1) / 1.0), H / 2 - 105), (W / 2 + 440 * out_expo((u - 0.1) / 1.0), H / 2 - 105)], fill=MAG, width=2)
        stroke_text(g, 'WIRED', W / 2 + 5, H / 2 - 5, 150, (255, 60, 160), 5, prog=out_cubic((u - 0.05) / 1.0), stagger=0.35, alpha=0.5)
        stroke_text(g, 'WIRED', W / 2, H / 2, 150, CYAN, 8, prog=out_cubic(u / 1.0), stagger=0.35)
        stroke_text(g, 'WIREFRAME COCKPIT COMBAT', W / 2, H / 2 + 135, 30, WHITE, 3, prog=sat((u - 0.9) / 0.8), stagger=0.5)
        mono(d, '4 STAGES  /  4 BOSSES  /  ORIGINAL SOUNDTRACK', W / 2, H / 2 + 185, (150, 200, 225), MONO, anchor='ma', typed=(u - 1.6) / 0.9)
        bx = W / 2; by = H - 120
        if u > 2.2:
            k = out_expo((u - 2.2) / 0.5)
            g.rectangle([bx - 90 * k, by - 22, bx + 90 * k, by + 22], outline=AMBER, width=2)
            if k > 0.9: stroke_text(g, 'ANDROID', bx, by, 24, AMBER, 2)
        post_split = 6 * (1 - sat(u / 0.5)); post_glitch = 0.6 * (1 - sat(u / 0.25))

    hud(glow, base, t, label, idx)
    # 発光の合成
    bl = glow.filter(ImageFilter.GaussianBlur(7))
    out = ImageChops.add(ImageChops.add(base, glow), bl)
    out = ImageChops.add(out, bl)
    if post_glitch > 0: out = glitch(out, post_glitch, int(t * 30))
    if post_split > 0: out = rgb_split(out, post_split)
    out = scanlines(out, 0.08)
    if flash > 0:
        out = Image.blend(out, Image.new('RGB', (W, H), (255, 255, 255)), clamp(flash))
    # 最後 0.6 秒でフェードアウト
    if t > TOTAL - 0.6:
        out = Image.blend(out, Image.new('RGB', (W, H), (0, 0, 0)), sat((t - (TOTAL - 0.6)) / 0.6))
    return out


# =====================================================================
# 音楽 (warp.wav を小節で切り貼り)
# =====================================================================
def make_audio():
    x, fs = sf.read(os.path.join(HERE, '..', 'music', 'out', 'warp.wav'))
    N = int(TOTAL * fs)
    out = np.zeros((N, 2))
    def put(src_bar, dst_bar, nbars, fade_in=0.004, fade_out=0.006):
        a = int(round(src_bar * BAR * fs)); n = int(round(nbars * BAR * fs))
        seg = x[a:a + n + int(fade_out * fs)].copy()
        fi = int(fade_in * fs); fo = int(fade_out * fs)
        seg[:fi] *= np.linspace(0, 1, fi)[:, None]; seg[-fo:] *= np.linspace(1, 0, fo)[:, None]
        i = int(round(dst_bar * BAR * fs)); ln = min(len(seg), N - i)
        out[i:i + ln] += seg[:ln]
    put(3, 0, 6)       # イントロ (フィルター付きブレイク → アルペジオ → フィル)
    put(33, 6, 20)     # ドロップ 2 (ロゴ着地と同時) + ニューロ
    put(62, 26, 3)     # ビルド (スネアロール + ライザー)
    # 最後の一撃 (ラストドロップの頭) を響かせて終わる
    a = int(round(65 * BAR * fs)); i = int(round(29 * BAR * fs))   # 29 小節目 = 最後のロゴ
    hit = x[a:a + int(1.2 * fs)].copy()
    hit *= np.exp(-np.arange(len(hit)) / (0.35 * fs))[:, None]
    out[i:i + len(hit)] += hit[:N - i]
    # 残響: 一撃をぼかして長く伸ばす
    sys.path.insert(0, os.path.join(HERE, '..', 'music'))
    from synth import convolve_reverb, make_ir, impact, limiter, FS
    tail = np.zeros((N - i, 2)); tail[:len(hit)] = hit[:N - i]
    rv = convolve_reverb(tail, make_ir(3.5, np.random.default_rng(4)))[:N - i]
    out[i:] += rv * 0.6
    im = impact(np.random.default_rng(5), 3.5)
    out[i:i + len(im)] += np.stack([im, im], 1)[:N - i] * 0.35
    fo = int(0.6 * fs); out[-fo:] *= np.linspace(1, 0, fo)[:, None]
    out = limiter(out / (np.max(np.abs(out)) + 1e-9) * 0.95, 0.89)
    sf.write(os.path.join(OUT, 'audio.wav'), out.astype(np.float32), fs, subtype='PCM_16')


if __name__ == '__main__':
    only = sys.argv[3] if len(sys.argv) > 3 else None
    if only != 'video': make_audio(); print('audio ok')
    if only == 'audio': sys.exit()
    frames = range(NF)
    if only and only.startswith('t='):   # 確認用: 指定秒のフレームだけ
        frames = [int(float(v) * FPS) for v in only[2:].split(',')]
    for f in frames:
        frame(f / FPS).save(os.path.join(OUT, 'frames', '%05d.jpg' % f), quality=92)
        if f % 150 == 0: print('frame', f, flush=True)
    print('done', len(frames))
