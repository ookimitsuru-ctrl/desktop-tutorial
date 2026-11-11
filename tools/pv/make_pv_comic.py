#!/usr/bin/env python3
"""PV（45 秒）の編集・アメコミ版: 字幕なし。コマ割り、インクの線と網点、止め絵、擬音（POW! など）で見せる。

pv_director.tscn が撮った素材（raw.avi）とログ（各ショットの開始フレームと、打撃などの出来事の画面上の位置）から、
150BPM の拍に合わせて 1 フレームずつ合成し、BGM と効果音を付けて MP4 にする。

使い方: python3 tools/pv/make_pv_comic.py <raw.avi> <raw_log.json> <出力.mp4> [作業ディレクトリ]
必要: ffmpeg, numpy, Pillow, opencv-python-headless, soundfile
"""
import json
import math
import pathlib
import subprocess
import sys

import cv2
import numpy as np
import soundfile as sf
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
FPS = 30
W, H = 1920, 1080
FONT = str(ROOT / "assets/fonts/DelaGothicOne-Regular.ttf")
SFX = ROOT / "assets/audio/sfx"
MARGIN = 22      # 紙の余白
BORDER = 9       # コマの枠線
INK = (12, 10, 14)
PAPER = (246, 242, 230)
rng = np.random.default_rng(20261111)

# 擬音の色: (上の色, 下の色, 破裂の色, 網点の色)
STYLES = {
    "fire": ((255, 236, 60), (240, 70, 30), (255, 255, 255), (255, 205, 40)),
    "red": ((255, 250, 235), (255, 215, 50), (228, 40, 36), (150, 16, 20)),
    "blue": ((255, 255, 255), (120, 225, 255), (30, 80, 200), (16, 40, 130)),
    "gold": ((228, 40, 36), (150, 20, 60), (255, 222, 50), (255, 150, 30)),
    "green": ((255, 250, 120), (255, 150, 20), (40, 170, 90), (16, 100, 60)),
}

# ------------------------------------------------------------------ 素材


class Footage:
    def __init__(self, raw, log_path, work):
        self.dir = work / "frames"
        self.log = {r["name"]: r for r in json.loads(pathlib.Path(log_path).read_text())}
        if not (self.dir / "done").exists():
            self.dir.mkdir(parents=True, exist_ok=True)
            subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw, "-start_number", "0", "-q:v", "2",
                            str(self.dir / "%05d.jpg")], check=True)
            (self.dir / "done").write_text("ok")
        self._cache = {}

    def frame(self, shot, j):
        r = self.log[shot]
        j = int(np.clip(j, 0, r["len"] - 1))
        n = r["start"] + r["pre"] + j
        if n not in self._cache:
            if len(self._cache) > 40:
                self._cache.clear()
            self._cache[n] = cv2.imread(str(self.dir / f"{n:05d}.jpg"))[:, :, ::-1].copy()
        return self._cache[n]

    def event(self, shot, kinds=("hit",), near=None, pick="first"):
        """ショット内の出来事。near を指定するとそのフレームに最も近いもの"""
        ev = [e for e in self.log[shot].get("events", []) if e["kind"] in kinds]
        if not ev:
            return None
        if near is not None:
            return min(ev, key=lambda e: abs(e["j"] - near))
        return ev[0] if pick == "first" else ev[-1]

    def events(self, shot, kinds):
        return [e for e in self.log[shot].get("events", []) if e["kind"] in kinds]


# ------------------------------------------------------------------ 漫画の絵作り

_yy, _xx = np.mgrid[0:H, 0:W].astype(np.float32)
_a = math.radians(32)
_u = (_xx * math.cos(_a) + _yy * math.sin(_a)) / 7.0
_v = (-_xx * math.sin(_a) + _yy * math.cos(_a)) / 7.0
# 網点: 各格子の中心からの距離（0 = 中心）
DOTS = np.sqrt((_u - np.floor(_u) - 0.5) ** 2 + (_v - np.floor(_v) - 0.5) ** 2) / 0.7071


def comic(img, strength=1.0):
    """写真のような絵を、色面 + インクの輪郭線 + 影の網点にする"""
    small = cv2.resize(img, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
    flat = cv2.bilateralFilter(small, 7, 60, 7)
    flat = cv2.bilateralFilter(flat, 7, 60, 7)
    flat = cv2.resize(flat, (W, H), interpolation=cv2.INTER_LINEAR).astype(np.float32) / 255.0
    # 彩度と明るさを上げ、段階を減らす
    lum = flat @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    col = lum[..., None] + (flat - lum[..., None]) * 1.45
    col = np.clip(col, 0, 1) ** 0.72 * 1.12 + 0.02
    col = np.clip(col, 0, 1)
    q = 6.0
    col = col * (1 - 0.8 * strength) + (np.floor(col * q + 0.5) / q) * (0.8 * strength)
    # 影の網点（暗いほど点が大きい）
    shade = np.clip((0.30 - lum) / 0.30, 0, 1)
    dots = (DOTS < shade * 0.95).astype(np.float32)
    col *= (1.0 - 0.30 * strength * dots)[..., None]
    # 輪郭線
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    g = cv2.GaussianBlur(g, (0, 0), 1.4)
    edge = cv2.Canny(g, 38, 96)
    edge = cv2.dilate(edge, np.ones((3, 3), np.uint8))
    edge = cv2.GaussianBlur(edge, (0, 0), 0.8).astype(np.float32) / 255.0
    col *= (1.0 - np.clip(edge * 1.5, 0, 1) * 0.92 * strength)[..., None]
    return (np.clip(col, 0, 1) * 255).astype(np.uint8)


def zoom(img, cx, cy, s):
    """(cx, cy)（0〜1）を中心に s 倍へ寄る"""
    if abs(s - 1.0) < 1e-3:
        return img
    w2, h2 = W / s, H / s
    x0 = float(np.clip(cx * W - w2 / 2, 0, W - w2))
    y0 = float(np.clip(cy * H - h2 / 2, 0, H - h2))
    m = np.array([[s, 0, -x0 * s], [0, s, -y0 * s]], dtype=np.float32)
    return cv2.warpAffine(img, m, (W, H), flags=cv2.INTER_LINEAR)


def speed_lines(cx, cy, seed, inner=330, n=52, color=INK):
    """集中線（中心へ向かう細い三角）。RGBA の PIL 画像"""
    r = np.random.default_rng(seed)
    im = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    far = 2400
    for k in range(n):
        a = (k + r.random()) / n * 2 * math.pi
        wid = 0.004 + 0.011 * r.random()
        r0 = inner * (1.0 + 0.9 * r.random())
        tip = (cx + math.cos(a) * r0, cy + math.sin(a) * r0 * 0.8)
        p1 = (cx + math.cos(a - wid) * far, cy + math.sin(a - wid) * far)
        p2 = (cx + math.cos(a + wid) * far, cy + math.sin(a + wid) * far)
        c = color if r.random() < 0.72 else (255, 255, 255)
        d.polygon([tip, p1, p2], fill=c + (255,))
    return im


def burst(size, style, seed, spikes=16):
    """擬音の後ろの破裂（とげとげの吹き出し）"""
    top, bot, bc, dc = STYLES[style]
    r = np.random.default_rng(seed)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    c = size / 2

    def poly(scale, jitter_seed):
        rr = np.random.default_rng(jitter_seed)
        pts = []
        for k in range(spikes * 2):
            a = k / (spikes * 2) * 2 * math.pi + 0.1
            rad = (0.47 if k % 2 == 0 else 0.27 + 0.06 * rr.random()) * size * scale * (0.86 + 0.14 * rr.random() if k % 2 == 0 else 1.0)
            pts.append((c + math.cos(a) * rad, c + math.sin(a) * rad * 0.82))
        return pts
    js = int(r.integers(1 << 30))
    d.polygon([(x + 12, y + 14) for x, y in poly(1.0, js)], fill=INK + (255,))
    d.polygon(poly(1.0, js), fill=INK + (255,))
    d.polygon(poly(0.93, js), fill=bc + (255,))
    # 中の網点（外へ行くほど小さい）
    arr = np.array(im)
    yy, xx = np.mgrid[0:size, 0:size].astype(np.float32)
    u = (xx + yy) / 13.0
    v = (xx - yy) / 13.0
    dist = np.sqrt((u - np.floor(u) - 0.5) ** 2 + (v - np.floor(v) - 0.5) ** 2)
    rad = np.sqrt((xx - c) ** 2 + ((yy - c) / 0.82) ** 2) / (size * 0.5)
    inside = (arr[..., :3] == np.array(bc, dtype=np.uint8)).all(axis=-1)
    dot = inside & (dist < 0.42 * np.clip(1.15 - rad * 1.5, 0, 1))
    arr[dot, :3] = dc
    return Image.fromarray(arr)


def word_sprite(text, style, seed, size=250, tilt=None):
    """擬音: 1 文字ずつ大きさと傾きを変え、太い縁取りと立体の影を付ける"""
    top, bot, _bc, _dc = STYLES[style]
    r = np.random.default_rng(seed)
    letters = []
    x = 0
    n = len(text)
    for k, ch in enumerate(text):
        sz = int(size * (0.86 + 0.34 * (k / max(n - 1, 1)) if n > 1 else 1.0) * (0.95 + 0.1 * r.random()))
        f = ImageFont.truetype(FONT, sz)
        st = max(8, sz // 13)
        bb = f.getbbox(ch, stroke_width=st)
        w, h = bb[2] - bb[0] + 8, bb[3] - bb[1] + 8
        # 塗り（縦のグラデーション）
        mask = Image.new("L", (w, h), 0)
        ImageDraw.Draw(mask).text((4 - bb[0], 4 - bb[1]), ch, font=f, fill=255)
        grad = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
        fill = (np.array(top, dtype=np.float32) * (1 - grad) + np.array(bot, dtype=np.float32) * grad)
        fill = np.broadcast_to(fill, (h, w, 3)).astype(np.uint8)
        outline = Image.new("L", (w, h), 0)
        ImageDraw.Draw(outline).text((4 - bb[0], 4 - bb[1]), ch, font=f, fill=255, stroke_width=st)
        ext = max(8, sz // 16)
        lay = Image.new("RGBA", (w + ext + 4, h + ext + 4), (0, 0, 0, 0))
        ink = Image.new("RGBA", (w, h), INK + (255,))
        for o in range(ext, 0, -2):
            lay.paste(ink, (o, o), outline)
        lay.paste(ink, (0, 0), outline)
        lay.paste(Image.fromarray(np.dstack([fill, np.full((h, w), 255, np.uint8)])), (0, 0), mask)
        # 上の縁に白い光
        hi = Image.new("L", (w, h), 0)
        ImageDraw.Draw(hi).text((4 - bb[0] + st // 3, 4 - bb[1] + st // 3), ch, font=f, fill=255)
        hi_np = (np.array(mask) > 128) & (np.array(hi) < 128)
        la = np.array(lay)
        la[:h, :w][hi_np] = (255, 255, 255, 255)
        lay = Image.fromarray(la).rotate(float(r.uniform(-7, 7)), expand=True, resample=Image.BICUBIC)
        dy = int(r.uniform(-0.07, 0.07) * size) - int(0.05 * size * k / max(n - 1, 1))
        letters.append((lay, x, dy))
        x += int(w * 0.84)
    tw = x + int(size * 0.5)
    th = int(size * 1.9)
    im = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    for lay, lx, dy in letters:
        im.alpha_composite(lay, (lx + 10, max(0, int(th * 0.2) + dy)))
    im = im.crop(im.getbbox())
    return im.rotate(tilt if tilt is not None else float(r.uniform(-13, 9)), expand=True, resample=Image.BICUBIC)


_sprite_cache = {}


def onomatopoeia(text, style, seed, size=250):
    key = (text, style, seed, size)
    if key not in _sprite_cache:
        # 文字数が多いほど 1 文字を小さくして、全体の幅をそろえる
        eff = int(np.clip(size * 3.0 / len(text), size * 0.44, size * 0.8))
        w = word_sprite(text, style, seed, eff)
        bs = int(max(w.size) * 1.25)
        b = burst(bs, style, seed + 5)
        b.alpha_composite(w, ((bs - w.size[0]) // 2, (bs - w.size[1]) // 2))
        _sprite_cache[key] = b
    return _sprite_cache[key]


def paste_sprite(canvas, sprite, cx, cy, scale=1.0, rot=0.0):
    """canvas（PIL RGB）へ、中心 (cx, cy) に sprite を置く"""
    s = sprite
    if abs(scale - 1.0) > 1e-3 or abs(rot) > 1e-3:
        w, h = sprite.size
        s = sprite.resize((max(2, int(w * scale)), max(2, int(h * scale))), Image.BILINEAR)
        if abs(rot) > 1e-3:
            s = s.rotate(rot, expand=True, resample=Image.BILINEAR)
    canvas.paste(s, (int(cx - s.size[0] / 2), int(cy - s.size[1] / 2)), s)


def pop(k):
    """擬音が飛び出す大きさ（k = 出てからのフレーム）"""
    return [0.35, 0.9, 1.22, 1.08, 1.0][k] if k < 5 else 1.0 + 0.012 * math.sin(k * 1.3)


def word_pos(ex, ey, sprite):
    """打点 (ex, ey)（0〜1）のそば、画面内に収まる位置"""
    sw, sh = sprite.size[0] * 0.7, sprite.size[1] * 0.7
    x = ex * W + (-1 if ex > 0.5 else 1) * sw * 0.2
    y = ey * H - sh * 0.4 - 150
    x = float(np.clip(x, sw * 0.5 + 40, W - sw * 0.5 - 40))
    y = float(np.clip(y, sh * 0.5 + 34, H - sh * 0.5 - 60))
    return x, y


def page(panels):
    """紙の上にコマを置く。panels = [(画像 np, 四隅の座標 [(x, y)×4])]。コマは四角形（斜めの辺も可）"""
    out = Image.new("RGB", (W, H), PAPER)
    for img, quad in panels:
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(quad, fill=255)
        out.paste(Image.fromarray(img), (0, 0), mask)
        ImageDraw.Draw(out).line(list(quad) + [quad[0]], fill=INK, width=BORDER, joint="curve")
    return out


FULL = [(MARGIN, MARGIN), (W - MARGIN, MARGIN), (W - MARGIN, H - MARGIN), (MARGIN, H - MARGIN)]


def single(img, shake=(0, 0)):
    q = [(x + shake[0], y + shake[1]) for x, y in FULL]
    return page([(img, q)])


# ------------------------------------------------------------------ タイムライン（1 要素 = 出力の 1 フレームを作る関数）

class Edit:
    def __init__(self, footage):
        self.fo = footage
        self.frames = []     # 関数のリスト
        self.sounds = []     # (秒, ファイル名, 音量)

    def t(self):
        return len(self.frames) / FPS

    def add(self, fn):
        self.frames.append(fn)

    def sfx(self, name, vol=1.0, dt=0.0):
        self.sounds.append((self.t() + dt, name, vol))

    # --- 1 コマ: そのまま流す
    def play(self, shot, j0, n, zoom_to=None, strength=0.85):
        for k in range(n):
            def fn(k=k):
                img = self.fo.frame(shot, j0 + k)
                if zoom_to is not None:
                    s = 1.0 + (zoom_to[2] - 1.0) * (k / max(n - 1, 1))
                    img = zoom(img, zoom_to[0], zoom_to[1], s)
                return single(comic(img, strength))
            self.add(fn)

    # --- 止め絵 + 擬音
    def freeze(self, shot, j, n, ev, text, style, seed, size=250, inset=False, big=1.0):
        ex = float(np.clip(ev["x"], 0.15, 0.85)) if ev else 0.5
        ey = float(np.clip(ev["y"], 0.2, 0.8)) if ev else 0.5
        spr = onomatopoeia(text, style, seed, size)
        wx, wy = word_pos(ex, ey, spr)
        lines = speed_lines(ex * W, ey * H, seed, inner=400 * big)
        base_cache = {}
        for k in range(n):
            def fn(k=k):
                s = 1.0 + 0.10 * big * min(1.0, k / 3.0) + 0.004 * k
                if "c" not in base_cache:
                    base_cache["c"] = comic(self.fo.frame(shot, j), 1.0)
                img = zoom(base_cache["c"], ex, ey, s)
                if k == 0:
                    img = np.clip(img.astype(np.int16) + 140, 0, 255).astype(np.uint8)
                amp = max(0, 14 - k * 3) * big
                sh = (int(rng.uniform(-amp, amp)), int(rng.uniform(-amp, amp)))
                pil = single(img, sh)
                if k >= 1:
                    pil.paste(lines, sh, lines)
                    ImageDraw.Draw(pil).line([(x + sh[0], y + sh[1]) for x, y in FULL + [FULL[0]]], fill=INK, width=BORDER)
                    # 枠の外は紙に戻す
                    d = ImageDraw.Draw(pil)
                    for rect in ([0, 0, W, MARGIN - 5], [0, H - MARGIN + 5, W, H], [0, 0, MARGIN - 5, H], [W - MARGIN + 5, 0, W, H]):
                        d.rectangle(rect, fill=PAPER)
                if inset and k >= 3:
                    self._inset(pil, base_cache["c"], ex, ey, min(1.0, (k - 3) / 3.0), seed)
                if k >= 1:
                    paste_sprite(pil, spr, wx, wy, pop(k - 1) * 0.7, 0.0)
                return pil
            self.add(fn)

    def _inset(self, pil, img, ex, ey, a, seed):
        """打点の拡大コマ（隅に斜めの枠で）"""
        cw, ch = 520, 400
        x0 = int(np.clip(ex * W - cw / 2, 0, W - cw))
        y0 = int(np.clip(ey * H - ch / 2, 0, H - ch))
        crop = cv2.resize(img[y0:y0 + ch, x0:x0 + cw], (598, 460), interpolation=cv2.INTER_CUBIC)
        left = ex > 0.5
        px = 70 if left else W - 70 - 598
        py = H - 70 - 460 + int((1 - a) * 500)
        quad = [(px + 26, py), (px + 598, py + 12), (px + 572, py + 460), (px, py + 446)]
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(quad, fill=255)
        layer = Image.new("RGB", (W, H))
        layer.paste(Image.fromarray(crop), (px, py))
        d = ImageDraw.Draw(pil)
        d.polygon([(x + 12, y + 12) for x, y in quad], fill=INK)
        pil.paste(layer, (0, 0), mask)
        d.line(quad + [quad[0]], fill=PAPER, width=16, joint="curve")
        d.line(quad + [quad[0]], fill=INK, width=7, joint="curve")

    # --- 打撃 1 発（3 拍 = 36 フレーム）: 助走 → 止め絵と擬音 → 余韻
    def hit(self, shot, text, style, seed, n=36, lead=13, hold=11, inset=False, sound="hit_heavy_1", size=250):
        ev = self.fo.event(shot, ("hit",), near=self.fo_event_at(shot)) or {"j": self.fo_event_at(shot), "x": 0.5, "y": 0.45}
        je = ev["j"]
        self.sfx("swish_heavy_1", 0.5, (lead - 5) / FPS)
        self.play(shot, je - lead + 1, lead)
        self.sfx(sound, 1.0)
        self.freeze(shot, je + 1, hold, ev, text, style, seed, size, inset)
        self.play(shot, je + 2, n - lead - hold)

    def fo_event_at(self, shot):
        return SHOT_EVENT_AT.get(shot, 20)

    # --- 長いショット: 流しながら、出来事ごとに短く止めて擬音
    def long(self, shot, j0, n, marks):
        """marks = [(出来事 dict, 擬音, 色, 止めるフレーム数, 音, 大きさ)]（時間順）"""
        j = j0
        left = n
        seed = 500 + len(self.frames)
        for ev, text, style, hold, sound, size in marks:
            run = ev["j"] + 1 - j
            if run < 0 or run + hold > left:
                continue
            self.play(shot, j, run)
            self.sfx(sound, 1.0)
            self.freeze(shot, ev["j"] + 1, hold, ev, text, style, seed, size, big=1.0 if hold >= 8 else 0.6)
            seed += 13
            j = ev["j"] + 2
            left -= run + hold
        self.play(shot, j, left)

    # --- 3 機の縦割りコマ（4 拍 = 48 フレーム）
    def triptych(self, shots3, n=48):
        xs = [MARGIN, 640, 1280, W - MARGIN]
        sl = 70  # 斜めのずれ
        centers = []
        for s in shots3:
            f = self.fo.frame(s, 20).astype(np.float32).sum(axis=2)
            col = f[200:900].sum(axis=0)
            col = np.clip(col - np.percentile(col, 40), 0, None)
            centers.append(float((col * np.arange(W)).sum() / max(col.sum(), 1)))
        for k in range(n):
            def fn(k=k):
                panels = []
                for i, s in enumerate(shots3):
                    t0 = i * 8
                    if k < t0:
                        continue
                    a = min(1.0, (k - t0) / 6.0)
                    a = 1 - (1 - a) ** 3
                    slide = int((1 - a) * H * (1 if i % 2 == 0 else -1))
                    img = comic(self.fo.frame(s, 4 + (k - t0)), 1.0)
                    # 機体を枠の中央へ
                    pc = (xs[i] + xs[i + 1]) / 2
                    dx = int(pc - centers[i])
                    m = np.array([[1, 0, dx], [0, 1, slide]], dtype=np.float32)
                    img = cv2.warpAffine(img, m, (W, H), borderMode=cv2.BORDER_REPLICATE)
                    g = 9
                    l0 = xs[i] + (g if i > 0 else 0)
                    r0 = xs[i + 1] - (g if i < 2 else 0)
                    quad = [(l0 + (sl if i > 0 else 0), MARGIN + slide), (r0 + (sl if i < 2 else 0), MARGIN + slide),
                            (r0 - (sl if i < 2 else 0), H - MARGIN + slide), (l0 - (sl if i > 0 else 0), H - MARGIN + slide)]
                    panels.append((img, quad))
                return page(panels)
            self.add(fn)
        for i in range(3):
            self.sounds.append((self.t() - n / FPS + i * 8 / FPS, "land", 0.8))

    # --- 4 コマのページ（止め絵が順に貼られる）
    def page4(self, shots4, words, n=48):
        cx, cy = W // 2, H // 2
        g = 10
        quads = [
            [(MARGIN, MARGIN), (cx + 50 - g, MARGIN), (cx - 50 - g, cy - 30 - g), (MARGIN, cy + 30 - g)],
            [(cx + 50 + g, MARGIN), (W - MARGIN, MARGIN), (W - MARGIN, cy - 60 - g), (cx - 50 + g, cy - 30 - g)],
            [(MARGIN, cy + 30 + g), (cx - 50 - g, cy - 30 + g), (cx - 90 - g, H - MARGIN), (MARGIN, H - MARGIN)],
            [(cx - 50 + g, cy - 30 + g), (W - MARGIN, cy - 60 + g), (W - MARGIN, H - MARGIN), (cx - 90 + g, H - MARGIN)],
        ]
        stills = []
        for i, s in enumerate(shots4):
            ev = self.fo.event(s, ("hit",), near=self.fo_event_at(s)) or {"j": 20, "x": 0.5, "y": 0.45}
            img = comic(self.fo.frame(s, ev["j"] + 1), 1.0)
            # コマの中心に打点が来るように寄せる
            qx = sum(p[0] for p in quads[i]) / 4
            qy = sum(p[1] for p in quads[i]) / 4
            sc = 0.8
            m = np.array([[sc, 0, qx - ev["x"] * W * sc], [0, sc, qy - ev["y"] * H * sc]], dtype=np.float32)
            img = cv2.warpAffine(img, m, (W, H), borderMode=cv2.BORDER_REPLICATE)
            spr = onomatopoeia(words[i][0], words[i][1], 700 + i * 7, 150)
            stills.append((img, spr, qx, qy))
        for k in range(n):
            def fn(k=k):
                panels = []
                for i in range(4):
                    if k >= i * 6:
                        panels.append((stills[i][0], quads[i]))
                pil = page(panels)
                for i in range(4):
                    kk = k - i * 6
                    if kk >= 1:
                        _img, spr, qx, qy = stills[i]
                        paste_sprite(pil, spr, qx + (170 if i % 2 == 0 else -170), qy - 110, pop(kk - 1) * 0.95)
                return pil
            self.add(fn)
        for i in range(4):
            self.sounds.append((self.t() - n / FPS + i * 6 / FPS, f"hit_medium_{i + 1}", 0.9))

    def fade_out(self, n):
        """最後の n フレームを、中心へ閉じる丸い絞りで閉じる"""
        total = len(self.frames)
        for k in range(n):
            idx = total - n + k
            base = self.frames[idx]

            def fn(base=base, k=k):
                pil = base()
                a = (k + 1) / n
                rad = int((1 - a) ** 1.5 * 1250)
                mask = Image.new("L", (W, H), 255)
                ImageDraw.Draw(mask).ellipse([W // 2 - rad, H // 2 - rad, W // 2 + rad, H // 2 + rad], fill=0)
                pil.paste(Image.new("RGB", (W, H), INK), (0, 0), mask)
                return pil
            self.frames[idx] = fn


SHOT_EVENT_AT = {}


def build(fo):
    for sh in json.loads((ROOT / "tools/pv/shots_comic.json").read_text()):
        SHOT_EVENT_AT[sh["name"]] = int(sh.get("event_at", 20))
    e = Edit(fo)
    # A: 開幕（6 拍）
    e.play("hero", 22, 72, zoom_to=(0.5, 0.42, 1.12), strength=1.0)
    # B: 打撃 6 連（各 3 拍）
    B = [("g1", "POW!", "fire", "hit_heavy_1", False), ("g2", "KRAK!", "red", "counter", True), ("s1", "WHAM!", "blue", "hit_heavy_2", False),
         ("s2", "BAM!", "green", "hit_heavy_3", False), ("s3", "THWAK!", "gold", "hit_heavy_4", True), ("s4", "SMASH!", "fire", "hit_heavy_1", False)]
    for i, (s, w, st, snd, ins) in enumerate(B):
        e.hit(s, w, st, 100 + i * 11, inset=ins, sound=snd)
    # C: 9 機（3 機ずつ、各 4 拍）
    for i in range(3):
        e.triptych([f"r{i * 3 + 1}", f"r{i * 3 + 2}", f"r{i * 3 + 3}"])
    # D: 浮かせて追撃（6 拍）・投げ（6 拍）・壁（5 拍）
    marks = []
    la = fo.event("g3", ("launch",))
    if la:
        marks.append((la, "WHOOSH!", "blue", 8, "launch", 210))
    words = [("BAM!", "fire"), ("POW!", "gold"), ("KRAK!", "red"), ("WHAM!", "green")]
    last = la["j"] if la else 0
    for h in fo.events("g3", ("hit",)):
        if h["j"] > last + 9 and len(marks) < 4:
            w, st = words[len(marks) - 1]
            marks.append((h, w, st, 5, "hit_medium_%d" % (len(marks)), 190))
            last = h["j"]
    e.long("g3", SHOT_EVENT_AT["g3"] - 12, 72, marks)
    th = [h for h in fo.events("g4", ("hit",)) if h.get("throw")] or fo.events("g4", ("hit",))
    marks = [(th[0], "SLAM!", "red", 12, "slam", 260)] if th else []
    j0 = max(0, (th[0]["j"] if th else 40) - 44)
    e.long("g4", j0, 72, marks)
    wh = fo.event("g5", ("wall_hit",))
    e.long("g5", max(0, (wh["j"] if wh else 22) - 20), 60, [(wh, "KRASH!", "gold", 12, "wall_hit", 260)] if wh else [])
    # E: 打撃 6 連
    E = [("s5", "BOOM!", "red", "hit_heavy_2", False), ("s6", "KLANG!", "blue", "hit_heavy_3", True), ("n1", "ZWAK!", "fire", "hit_heavy_4", False),
         ("n2", "THUD!", "green", "hit_heavy_1", False), ("n3", "KRUNCH!", "gold", "counter", True), ("n4", "WHAK!", "fire", "hit_heavy_2", False)]
    for i, (s, w, st, snd, ins) in enumerate(E):
        e.hit(s, w, st, 300 + i * 11, inset=ins, sound=snd)
    # F: リングアウト（7 拍）
    ro = fo.event("g6", ("ringout",))
    pre = [h for h in fo.events("g6", ("hit",)) if ro and h["j"] < ro["j"]]
    marks = []
    if pre:
        marks.append((pre[-1], "WHAM!", "fire", 6, "hit_heavy_3", 220))
    if ro:
        ro2 = dict(ro)
        ro2["j"] = ro["j"] + 10
        marks.append((ro2, "SPLASH!", "blue", 14, "ringout_raft", 250))
    j0 = max(0, (pre[-1]["j"] if pre else (ro["j"] if ro else 20)) - 16)
    e.long("g6", j0, 84, marks)
    # G: 4 コマのページ（4 拍）
    e.page4(["p1", "p2", "p3", "p4"], [("POW!", "fire"), ("BAM!", "blue"), ("KRAK!", "red"), ("WHAM!", "gold")])
    # H: 打撃 4 連
    Hs = [("h1", "KA-POW!", "red", "counter", True), ("h2", "THOOM!", "blue", "hit_heavy_4", False), ("h3", "SMAK!", "green", "hit_heavy_1", False),
          ("h4", "BLAM!", "fire", "hit_heavy_2", True)]
    for i, (s, w, st, snd, ins) in enumerate(Hs):
        e.hit(s, w, st, 500 + i * 11, inset=ins, sound=snd, size=250 if len(w) < 7 else 210)
    # I: KO（8 拍）
    ko = fo.event("ko", ("hit",), near=SHOT_EVENT_AT["ko"])
    e.long("ko", max(0, (ko["j"] if ko else 26) - 22), 96, [(ko, "KA-BOOM!", "fire", 22, "counter", 270)] if ko else [])
    # J: 全機（残り）
    rest = 1350 - len(e.frames)
    e.play("lineup", 2, rest, zoom_to=(0.5, 0.5, 1.06), strength=1.0)
    e.sounds.append(((1350 - rest) / FPS, "ui_vs", 1.0))
    e.fade_out(18)
    assert len(e.frames) == 1350, len(e.frames)
    return e


def render_audio(e, path):
    sr = 44100
    out = np.zeros((int(sr * 45.0), 2), dtype=np.float64)
    bgm, bsr = sf.read(str(ROOT / "assets/audio/bgm/bgm_arena.ogg"))
    assert bsr == sr
    n = min(len(bgm), len(out))
    out[:n] += bgm[:n] * 0.62
    for t, name, vol in e.sounds:
        p = SFX / f"{name}.wav"
        if not p.exists():
            continue
        x, xsr = sf.read(str(p))
        if xsr != sr:
            continue
        if x.ndim == 1:
            x = np.stack([x, x], axis=1)
        a = int(max(0.0, t) * sr)
        b = min(len(out), a + len(x))
        if b > a:
            out[a:b] += x[: b - a] * vol * 0.95
    fade = int(sr * 1.4)
    out[-fade:] *= np.linspace(1, 0, fade)[:, None]
    fi = int(sr * 0.2)
    out[:fi] *= np.linspace(0, 1, fi)[:, None]
    out = np.tanh(out * 1.1) / np.tanh(1.1) * 0.97
    sf.write(path, out, sr, subtype="PCM_16")


def main():
    raw, log_path, out = sys.argv[1], sys.argv[2], sys.argv[3]
    work = pathlib.Path(sys.argv[4] if len(sys.argv) > 4 else pathlib.Path(out).parent / "pv_comic_work")
    work.mkdir(parents=True, exist_ok=True)
    fo = Footage(raw, log_path, work)
    e = build(fo)
    only = [int(x) for x in sys.argv[5].split(",")] if len(sys.argv) > 5 else None
    if only:
        for n in only:
            e.frames[n]().save(work / f"preview_{n:04d}.jpg", quality=88)
        return
    wav = str(work / "audio.wav")
    render_audio(e, wav)
    enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                            "-i", wav, "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
                            "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", "-t", "45", out], stdin=subprocess.PIPE)
    for n, fn in enumerate(e.frames):
        enc.stdin.write(np.asarray(fn().convert("RGB")).tobytes())
        if n % 150 == 0:
            print("frame", n, flush=True)
    enc.stdin.close()
    enc.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
