#!/usr/bin/env python3
"""機甲兵（ロボット）のモデル生成器。

骨格（data/baked/<id>.rig.json）はそのまま使い、各ボーンに硬い部品（角を落とした箱・台形の箱・円柱・ドーム）を
剛体で取り付ける。部品は凸包からメッシュにし、面ごとに法線を分けて硬質な見た目にする。
頂点カラーは人間のモデルと同じ規約（R = パレット番号、G = 材質、B = 簡易 AO）。

材質（G）の意味は機甲兵用に読み替える（シェーダーの mech モード）:
  0.00 塗装した装甲 / 0.25 ゴム・布 / 0.50 地金（ピストン・可動部） / 0.75 暗いフレーム / 1.00 カメラのレンズ（発光）

デザインは character.json の "model" の "mech" に書く（頭・肩・腕・脚などの型）。costumes の "model" で上書きできる。

使い方: python3 tools/charmodel/gen_mech.py toma [costume ...]
出力: assets/characters/<id>/<id>_<costume>.glb
"""
import json
import math
import pathlib
import sys
import time

import numpy as np
from scipy.spatial import ConvexHull

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from gltf_writer import write_glb  # noqa: E402
from gen_model import Body, ROOT  # noqa: E402

# パレット番号（人間のモデルと共通の並び。機甲兵での意味）
FRAME, HOSE, ARMOR, ARMOR2, MARK, HANDS, FEET, LENS, DARK, STRIPE, METAL, INNER = range(12)
# 材質
M_PAINT, M_RUBBER, M_METAL, M_FRAME, M_LENS = 0.0, 0.25, 0.5, 0.75, 1.0

BULK = {"heavy": 1.26, "stocky": 1.12, "athletic": 1.0, "lean": 0.97, "slim": 0.93, "old": 0.98}


# ------------------------------------------------------------------ 形状（局所座標の点群）

def cbox(hx, hy, hz, c=0.18, top=(1.0, 1.0), bottom=(1.0, 1.0)):
    """角を落とした箱。c は面取りの割合（短辺に対して）。top/bottom は上下端の x, z の倍率（台形）"""
    ch = c * min(hx, hy, hz)
    pts = []
    for sy in (-1, 1):
        sx_, sz_ = top if sy > 0 else bottom
        for (ax, ay, az) in ((hx - ch, hy, hz - ch), (hx - ch, hy - ch, hz), (hx, hy - ch, hz - ch)):
            for ex in (-1, 1):
                for ez in (-1, 1):
                    pts.append((ex * ax * sx_, sy * ay, ez * az * sz_))
    return np.array(pts, dtype=np.float64)


def cyl(r0, r1, h, n=12, axis="y"):
    """円柱（r0 が -側、r1 が +側）。axis は軸の向き"""
    pts = []
    for sy, r in ((-1, r0), (1, r1)):
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            pts.append((math.cos(a) * r, sy * h * 0.5, math.sin(a) * r))
    p = np.array(pts, dtype=np.float64)
    if axis == "x":
        p = p[:, [1, 0, 2]]
    elif axis == "z":
        p = p[:, [0, 2, 1]]
    return p


def dome(r, h, n=12, rings=4, base=0.0):
    """ドーム（y=0 が底面、y=h が頂点）。base は底面より下に伸ばす長さ"""
    pts = []
    for i in range(rings + 1):
        t = i / rings * (math.pi * 0.5)
        rr, yy = math.cos(t) * r, math.sin(t) * h
        m = 1 if i == rings else n
        for k in range(m):
            a = 2 * math.pi * (k + 0.5) / n
            pts.append((math.cos(a) * rr, yy, math.sin(a) * rr))
    if base > 0:
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n
            pts.append((math.cos(a) * r, -base, math.sin(a) * r))
    return np.array(pts, dtype=np.float64)


def rot(ax=0.0, ay=0.0, az=0.0):
    """x→y→z の順に回す回転行列"""
    cx, sx = math.cos(ax), math.sin(ax)
    cy, sy = math.cos(ay), math.sin(ay)
    cz, sz = math.cos(az), math.sin(az)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx


# ------------------------------------------------------------------ 組み立て

class Frame:
    """部品を置く座標系。origin とワールドでの 3 軸（o: 外側、y: 骨の向き、f: 前）"""

    def __init__(self, origin, o, y, f):
        self.origin = np.asarray(origin, dtype=np.float64)
        self.M = np.stack([o, y, f], axis=1).astype(np.float64)

    def to_world(self, p):
        return self.origin + p @ self.M.T


class Mech:
    def __init__(self, B):
        self.B = B
        self.tris = []  # (3x3 頂点, slot, mt, bone, ao)

    def frame_world(self, origin=(0, 0, 0)):
        """モデル空間そのもの（部品の位置はワールド座標で指定する。正面は -Z、+X が右）"""
        return Frame(origin, np.array([1.0, 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, 1.0]))

    def frame_bone(self, name, side=0):
        """骨に沿った座標系。y は骨の向き、f は前（-Z を骨に直交化）、o は体の外側（side: -1 左 / +1 右 / 0 は右手系）"""
        B = self.B
        a, b = B.j(name), B.t(name)
        y = b - a
        y = y / (np.linalg.norm(y) + 1e-9)
        f = np.array([0.0, 0.0, -1.0])
        f = f - y * np.dot(f, y)
        if np.linalg.norm(f) < 1e-3:
            f = np.array([0.0, -1.0, 0.0]) - y * np.dot(np.array([0.0, -1.0, 0.0]), y)
        f = f / np.linalg.norm(f)
        o = np.cross(y, f)
        if side != 0 and np.dot(o, [side, 0, 0]) < 0:
            o = -o
        return Frame(a, o, y, f)

    def add(self, fr, pts, bone, slot, mt=M_PAINT, at=(0, 0, 0), R=None, ao=1.0, mirror_o=False):
        p = np.asarray(pts, dtype=np.float64)
        if R is not None:
            p = p @ np.asarray(R).T
        p = p + np.asarray(at, dtype=np.float64)
        if mirror_o:
            p[:, 0] *= -1
        w = fr.to_world(p)
        hull = ConvexHull(w)
        cen = w.mean(axis=0)
        bi = self.B.b(bone)
        for s in hull.simplices:
            a, b, c = w[s[0]], w[s[1]], w[s[2]]
            n = np.cross(b - a, c - a)
            if np.dot(n, a - cen) < 0:
                b, c = c, b
            self.tris.append((np.stack([a, b, c]), slot, mt, bi, ao))

    def mesh(self):
        V, N, C, J, W, F = [], [], [], [], [], []
        for k, (t, slot, mt, bi, ao) in enumerate(self.tris):
            n = np.cross(t[1] - t[0], t[2] - t[0])
            ln = np.linalg.norm(n)
            if ln < 1e-12:
                continue
            n = n / ln
            # 簡易 AO: 下向きの面ほど暗く
            a = ao * (0.62 + 0.38 * (n[1] * 0.5 + 0.5))
            base = len(V)
            for v in t:
                V.append(v)
                N.append(n)
                C.append(((slot + 0.5) / 16.0, mt, a, 1.0))
                J.append((bi, 0, 0, 0))
                W.append((1.0, 0.0, 0.0, 0.0))
            F.append((base, base + 1, base + 2))
        return (np.array(V, dtype=np.float32), np.array(N, dtype=np.float32), np.array(F, dtype=np.uint32),
                np.array(C, dtype=np.float32), np.array(J, dtype=np.uint8), np.array(W, dtype=np.float32))


# ------------------------------------------------------------------ 部位

def bone_len(B, name):
    return float(np.linalg.norm(B.t(name) - B.j(name)))


def build(B, d):
    """d: デザインの指定（頭・肩・腕などの型と寸法の倍率）"""
    m = Mech(B)
    s = B.s
    k = BULK.get(B.build, 1.0) * float(d.get("bulk", 1.0)) * 1.1
    W = m.frame_world()
    hips, spine, chest, neck, head = (B.j(n) for n in ("Hips", "Spine", "Chest", "Neck", "Head"))

    # --- 腰（骨盤ブロック・股の装甲・腰の側板・後ろの板）
    m.add(W, cbox(0.15 * s * k, 0.09 * s, 0.11 * s * k, c=0.3), "Hips", INNER, M_FRAME, at=hips + [0, 0.0, 0.0])
    m.add(W, cbox(0.075 * s * k, 0.075 * s, 0.025 * s, c=0.3, bottom=(0.55, 1.0)), "Hips", ARMOR, M_PAINT,
          at=hips + [0, -0.055 * s, -0.112 * s * k], R=rot(ax=0.18))
    for sx in (-1, 1):
        skirt = d.get("skirt", "side")
        if skirt != "none":
            hgt = 0.11 if skirt == "long" else 0.085
            m.add(W, cbox(0.022 * s, hgt * s, 0.085 * s * k, c=0.3, bottom=(1.0, 0.85)), "Hips", ARMOR2, M_PAINT,
                  at=hips + [sx * 0.158 * s * k, -0.045 * s - (hgt - 0.085) * s, 0.0], R=rot(az=sx * 0.12))
        # 股関節の玉
        m.add(W, cyl(0.055 * s * k, 0.055 * s * k, 0.05 * s, n=10, axis="x"), "Hips", DARK, M_FRAME,
              at=B.j("LeftUpperLeg" if sx < 0 else "RightUpperLeg") + [sx * 0.02 * s, 0.0, 0.0])
    m.add(W, cbox(0.10 * s * k, 0.07 * s, 0.03 * s, c=0.3), "Hips", ARMOR2, M_PAINT, at=hips + [0, -0.01 * s, 0.10 * s * k])

    # --- 胴の可動部（蛇腹とピストン）
    m.add(W, cyl(0.10 * s * k, 0.11 * s * k, 0.14 * s, n=12), "Spine", DARK, M_RUBBER, at=spine + [0, 0.06 * s, 0.0])
    for sx in (-1, 1):
        m.add(W, cyl(0.012 * s, 0.012 * s, 0.17 * s, n=8), "Spine", METAL, M_METAL, at=spine + [sx * 0.07 * s * k, 0.08 * s, -0.075 * s * k])

    # --- 胸（操縦席）: 肩幅いっぱいの上の箱と、前へ張り出した下の箱（横の筋）
    ch = d.get("chest", "hatch")
    cw, chh, cd = {"hatch": (0.20, 0.13, 0.15), "heavy": (0.225, 0.14, 0.165), "slim": (0.175, 0.125, 0.135), "round": (0.19, 0.13, 0.15)}[ch]
    cc = chest + [0, 0.13 * s, 0.0]
    if ch == "round":
        m.add(W, cyl(cw * s * k, cw * 0.95 * s * k, 2 * chh * s, n=14), "Chest", ARMOR, M_PAINT, at=cc)
    else:
        m.add(W, cbox(cw * s * k, chh * s, cd * s * k, c=0.22, top=(0.95, 0.9), bottom=(0.95, 1.0)), "Chest", ARMOR, M_PAINT, at=cc)
    lc = chest + [0, -0.035 * s, -0.012 * s * k]
    m.add(W, cbox(cw * 0.86 * s * k, 0.075 * s, cd * 1.05 * s * k, c=0.25, bottom=(0.85, 0.85)), "Chest", ARMOR2 if d.get("hatch2") else ARMOR, M_PAINT, at=lc)
    lz = lc[2] - cd * 1.05 * s * k
    for i in range(4):
        m.add(W, cbox(cw * 0.62 * s * k, 0.005 * s, 0.006 * s, c=0.2), "Chest", DARK, M_FRAME, at=[lc[0], lc[1] + (0.04 - i * 0.025) * s, lz - 0.002 * s])
    # 上の箱の前面: ハッチ（取っ手と蝶番）
    hz = cc[2] - (cd if ch != "round" else cw * 0.95) * s * k
    m.add(W, cbox(cw * 0.75 * s * k, 0.10 * s, 0.018 * s, c=0.3), "Chest", ARMOR, M_PAINT, at=[cc[0], cc[1] - 0.01 * s, hz - 0.01 * s])
    m.add(W, cyl(0.014 * s, 0.014 * s, cw * 1.4 * s * k, n=8, axis="x"), "Chest", METAL, M_METAL, at=[cc[0], cc[1] + 0.105 * s, hz - 0.004 * s])
    m.add(W, cbox(0.05 * s, 0.008 * s, 0.012 * s, c=0.3), "Chest", METAL, M_METAL, at=[cc[0], cc[1] + 0.02 * s, hz - 0.03 * s])
    for sx in (-1, 1):
        m.add(W, cbox(0.004 * s, 0.012 * s, 0.012 * s, c=0.2), "Chest", METAL, M_METAL, at=[cc[0] + sx * 0.05 * s, cc[1] + 0.012 * s, hz - 0.03 * s])
    # 胸の脇の排気口
    for sx in (-1, 1):
        for i in range(3):
            m.add(W, cbox(0.006 * s, 0.03 * s, 0.006 * s, c=0.2), "Chest", DARK, M_FRAME,
                  at=[cc[0] + sx * (cw * s * k + 0.002 * s), cc[1] - 0.04 * s, cc[2] - 0.05 * s + i * 0.025 * s])
    # 識別の帯
    if d.get("stripe", True):
        # 識別章（盾形）と番号の帯
        m.add(W, cbox(0.022 * s, 0.024 * s, 0.004 * s, c=0.2, bottom=(0.4, 1.0)), "Chest", MARK, M_PAINT, at=[cc[0] + 0.13 * s * k, cc[1] + 0.06 * s, hz + 0.004 * s])
        m.add(W, cbox(0.035 * s, 0.008 * s, 0.004 * s, c=0.2), "Chest", MARK, M_PAINT, at=[cc[0] - 0.12 * s * k, cc[1] + 0.07 * s, hz + 0.004 * s])
    # 襟のリング
    m.add(W, cyl(0.085 * s * k, 0.07 * s * k, 0.05 * s, n=12), "Chest", DARK, M_RUBBER, at=neck + [0, -0.01 * s, 0.01 * s])
    # 背中（バックパックと排気管）
    bp = d.get("back", "pack")
    bc = chest + [0, 0.10 * s, (cd + 0.06) * s * k]
    if bp == "pack":
        m.add(W, cbox(0.15 * s * k, 0.13 * s, 0.07 * s, c=0.3), "Chest", ARMOR2, M_PAINT, at=bc)
        for sx in (-1, 1):
            m.add(W, cyl(0.022 * s, 0.026 * s, 0.10 * s, n=10), "Chest", METAL, M_METAL, at=bc + [sx * 0.10 * s * k, 0.17 * s, 0.02 * s])
            m.add(W, cyl(0.028 * s, 0.028 * s, 0.025 * s, n=10), "Chest", DARK, M_FRAME, at=bc + [sx * 0.10 * s * k, 0.225 * s, 0.02 * s])
    elif bp == "tanks":
        for sx in (-1, 1):
            m.add(W, cyl(0.055 * s, 0.055 * s, 0.26 * s, n=12), "Chest", ARMOR2, M_PAINT, at=bc + [sx * 0.08 * s * k, 0.0, 0.01 * s])
            m.add(W, dome(0.055 * s, 0.03 * s, n=12, rings=2), "Chest", ARMOR2, M_PAINT, at=bc + [sx * 0.08 * s * k, 0.13 * s, 0.01 * s])
    elif bp == "flat":
        m.add(W, cbox(0.13 * s * k, 0.12 * s, 0.035 * s, c=0.3), "Chest", INNER, M_FRAME, at=bc + [0, 0, -0.03 * s])
    elif bp == "mantle":
        # 背中から腰へ垂れる装甲板（羽織のような重ね板）
        for i in range(3):
            m.add(W, cbox(0.20 * s * k, 0.07 * s, 0.018 * s, c=0.3), "Chest", ARMOR2, M_PAINT,
                  at=bc + [0, 0.06 * s - i * 0.11 * s, 0.02 * s + i * 0.012 * s], R=rot(ax=0.12))

    # --- 首と頭
    m.add(W, cyl(0.05 * s, 0.045 * s, 0.07 * s, n=10), "Neck", DARK, M_RUBBER, at=neck + [0, 0.03 * s, 0.0])
    m.add(W, cbox(0.14 * s * k, 0.065 * s, 0.035 * s, c=0.3, top=(0.85, 1.0)), "Chest", ARMOR2, M_PAINT,
          at=neck + [0, 0.02 * s, 0.07 * s * k], R=rot(ax=-0.3))
    for sx in (-1, 1):
        m.add(W, cbox(0.03 * s, 0.04 * s, 0.07 * s * k, c=0.3), "Chest", ARMOR2, M_PAINT,
              at=neck + [sx * 0.105 * s * k, -0.005 * s, 0.01 * s], R=rot(az=sx * 0.35))
    _head(m, B, d.get("head", "turret"), head, s, d)

    # --- 腕
    for nm, sx in (("Left", -1), ("Right", 1)):
        _arm(m, B, nm, sx, s, k, d)
    # --- 脚
    for nm, sx in (("Left", -1), ("Right", 1)):
        _leg(m, B, nm, sx, s, k, d)

    # --- 揺れ物: 頭から背中へ垂れる配線（髪の骨）、腰の垂れ板（帯の骨）
    if d.get("hose"):
        for i, bn in enumerate(("Hair1", "Hair2", "Hair3")):
            fr = m.frame_bone(bn)
            ln = bone_len(B, bn)
            m.add(fr, cyl(0.022 * s, 0.022 * s, ln * 1.05, n=8), bn, HOSE, M_RUBBER, at=(0, ln * 0.5, 0))
            m.add(fr, cyl(0.027 * s, 0.027 * s, 0.018 * s, n=8), bn, METAL, M_METAL, at=(0, ln, 0))
    if d.get("flap"):
        for bn in ("Sash1", "Sash2"):
            fr = m.frame_bone(bn)
            ln = bone_len(B, bn)
            m.add(fr, cbox(0.045 * s, ln * 0.52, 0.008 * s, c=0.3), bn, HOSE, M_RUBBER, at=(0, ln * 0.5, 0))
    return m


def _head(m, B, kind, head, s, d):
    W = m.frame_world()
    hc = head + [0, 0.02 * s, -0.035 * s]
    if kind == "turret":
        # 丸い頭とレンズの砲塔（大きなレンズ 1・小さなレンズ 1・上に潜望鏡）
        m.add(W, dome(0.095 * s, 0.09 * s, n=14, rings=4, base=0.05 * s), "Head", ARMOR, M_PAINT, at=hc + [0, -0.01 * s, 0])
        m.add(W, cbox(0.07 * s, 0.045 * s, 0.03 * s, c=0.3), "Head", DARK, M_FRAME, at=hc + [0, 0.0, -0.085 * s])
        m.add(W, cyl(0.03 * s, 0.026 * s, 0.035 * s, n=12, axis="z"), "Head", DARK, M_FRAME, at=hc + [-0.018 * s, 0.0, -0.12 * s])
        m.add(W, cyl(0.022 * s, 0.022 * s, 0.01 * s, n=12, axis="z"), "Head", LENS, M_LENS, at=hc + [-0.018 * s, 0.0, -0.14 * s])
        m.add(W, cyl(0.014 * s, 0.014 * s, 0.03 * s, n=10, axis="z"), "Head", DARK, M_FRAME, at=hc + [0.035 * s, 0.012 * s, -0.115 * s])
        m.add(W, cyl(0.010 * s, 0.010 * s, 0.008 * s, n=10, axis="z"), "Head", LENS, M_LENS, at=hc + [0.035 * s, 0.012 * s, -0.132 * s])
        m.add(W, cbox(0.012 * s, 0.03 * s, 0.012 * s, c=0.3), "Head", METAL, M_METAL, at=hc + [0.03 * s, 0.10 * s, 0.0])
    elif kind == "visor":
        # 前へ傾いた箱の頭と横長の覗き窓
        m.add(W, cbox(0.085 * s, 0.075 * s, 0.10 * s, c=0.3, top=(0.85, 0.8)), "Head", ARMOR, M_PAINT, at=hc)
        m.add(W, cbox(0.07 * s, 0.012 * s, 0.01 * s, c=0.3), "Head", LENS, M_LENS, at=hc + [0, 0.012 * s, -0.103 * s])
        m.add(W, cbox(0.078 * s, 0.022 * s, 0.012 * s, c=0.3), "Head", DARK, M_FRAME, at=hc + [0, 0.012 * s, -0.095 * s])
        for sx in (-1, 1):
            m.add(W, cyl(0.022 * s, 0.022 * s, 0.03 * s, n=10, axis="x"), "Head", INNER, M_FRAME, at=hc + [sx * 0.095 * s, 0.0, 0.0])
    elif kind == "twin":
        m.add(W, cbox(0.09 * s, 0.07 * s, 0.095 * s, c=0.45), "Head", ARMOR, M_PAINT, at=hc)
        for sx in (-1, 1):
            m.add(W, cyl(0.022 * s, 0.024 * s, 0.03 * s, n=12, axis="z"), "Head", DARK, M_FRAME, at=hc + [sx * 0.04 * s, 0.01 * s, -0.098 * s])
            m.add(W, cyl(0.016 * s, 0.016 * s, 0.008 * s, n=12, axis="z"), "Head", LENS, M_LENS, at=hc + [sx * 0.04 * s, 0.01 * s, -0.115 * s])
        m.add(W, cbox(0.035 * s, 0.015 * s, 0.015 * s, c=0.3), "Head", DARK, M_FRAME, at=hc + [0, -0.045 * s, -0.09 * s])
    elif kind == "mono":
        # 兜型の頭と縦長の溝に 1 つ目
        m.add(W, dome(0.092 * s, 0.10 * s, n=14, rings=4, base=0.04 * s), "Head", ARMOR, M_PAINT, at=hc + [0, -0.01 * s, 0])
        m.add(W, cbox(0.022 * s, 0.05 * s, 0.02 * s, c=0.3), "Head", DARK, M_FRAME, at=hc + [0, 0.0, -0.088 * s])
        m.add(W, cyl(0.016 * s, 0.016 * s, 0.01 * s, n=12, axis="z"), "Head", LENS, M_LENS, at=hc + [0, 0.01 * s, -0.107 * s])
        m.add(W, cbox(0.10 * s, 0.018 * s, 0.10 * s, c=0.3), "Head", ARMOR2, M_PAINT, at=hc + [0, -0.045 * s, 0.0])
    elif kind == "crest":
        # 鍬形の飾りを持つ兜の頭、細い目
        m.add(W, cbox(0.085 * s, 0.07 * s, 0.10 * s, c=0.35, top=(0.8, 0.8)), "Head", ARMOR, M_PAINT, at=hc)
        m.add(W, cbox(0.115 * s, 0.015 * s, 0.11 * s, c=0.3, bottom=(1.0, 1.0)), "Head", ARMOR2, M_PAINT, at=hc + [0, -0.05 * s, 0.01 * s], R=rot(ax=0.15))
        m.add(W, cbox(0.055 * s, 0.008 * s, 0.01 * s, c=0.3), "Head", LENS, M_LENS, at=hc + [0, 0.008 * s, -0.102 * s])
        for sx in (-1, 1):
            m.add(W, cbox(0.008 * s, 0.07 * s, 0.018 * s, c=0.3), "Head", MARK, M_METAL, at=hc + [sx * 0.04 * s, 0.11 * s, -0.08 * s], R=rot(az=-sx * 0.45, ax=-0.3))
    elif kind == "array":
        # 縦に 3 つ並んだ小さなレンズの頭
        m.add(W, cbox(0.075 * s, 0.085 * s, 0.09 * s, c=0.35, top=(0.9, 0.85)), "Head", ARMOR, M_PAINT, at=hc)
        m.add(W, cbox(0.022 * s, 0.06 * s, 0.012 * s, c=0.3), "Head", DARK, M_FRAME, at=hc + [0, 0.0, -0.092 * s])
        for i in range(3):
            m.add(W, cyl(0.010 * s, 0.010 * s, 0.008 * s, n=10, axis="z"), "Head", LENS, M_LENS, at=hc + [0, (0.035 - i * 0.035) * s, -0.105 * s])
        m.add(W, cbox(0.09 * s, 0.012 * s, 0.07 * s, c=0.3), "Head", ARMOR2, M_PAINT, at=hc + [0, 0.09 * s, 0.0])
    # アンテナ
    ant = d.get("antenna", "rod")
    if ant in ("rod", "twin"):
        for sx in ((1,) if ant == "rod" else (-1, 1)):
            m.add(W, cyl(0.004 * s, 0.003 * s, 0.16 * s, n=6), "Head", METAL, M_METAL, at=hc + [sx * 0.06 * s, 0.13 * s, 0.03 * s], R=rot(az=-sx * 0.12, ax=-0.15))


def _arm(m, B, nm, sx, s, k, d):
    sh = d.get("shoulder", "round")
    # 肩の装甲（鎖骨の骨に付ける。腕を振っても大きく動かない）。座標系は肩の関節を原点に o = 外側・y = 上・f = 前
    sb = nm + "Shoulder"
    fr = Frame(B.t(sb), np.array([float(sx), 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, -1.0]))
    cap = sh
    if sh == "asym":
        cap = "heavy" if sx < 0 else "slim"
    if cap == "round":
        m.add(fr, dome(0.125 * s * k, 0.095 * s * k, n=14, rings=4, base=0.03 * s), sb, ARMOR2, M_PAINT,
              at=(0.035 * s, 0.035 * s, 0.0), R=rot(az=-0.8))
        m.add(fr, cbox(0.004 * s, 0.022 * s, 0.022 * s, c=0.2, bottom=(1.0, 0.4)), sb, MARK, M_PAINT, at=(0.155 * s * k, -0.01 * s, 0.0), R=rot(az=-0.3))
    elif cap == "box":
        m.add(fr, cbox(0.065 * s * k, 0.06 * s * k, 0.095 * s * k, c=0.3), sb, ARMOR2, M_PAINT, at=(0.035 * s, 0.045 * s, 0.0), R=rot(az=-0.35))
    elif cap == "heavy":
        m.add(fr, cbox(0.085 * s * k, 0.075 * s * k, 0.12 * s * k, c=0.3, bottom=(1.0, 1.08)), sb, ARMOR2, M_PAINT,
              at=(0.045 * s, 0.035 * s, 0.0), R=rot(az=-0.45))
        m.add(fr, cbox(0.016 * s, 0.085 * s * k, 0.125 * s * k, c=0.3), sb, MARK, M_PAINT, at=(0.115 * s * k, -0.01 * s, 0.0), R=rot(az=-0.15))
    elif cap == "slim":
        m.add(fr, cbox(0.05 * s * k, 0.04 * s * k, 0.07 * s * k, c=0.4), sb, ARMOR2, M_PAINT, at=(0.025 * s, 0.04 * s, 0.0), R=rot(az=-0.4))
    elif cap == "layered":
        for i in range(3):
            m.add(fr, cbox(0.07 * s * k - i * 0.008 * s, 0.022 * s, 0.10 * s * k, c=0.3), sb, ARMOR2 if i % 2 == 0 else ARMOR, M_PAINT,
                  at=(0.03 * s + i * 0.022 * s, 0.06 * s - i * 0.04 * s, 0.0), R=rot(az=-0.35 - 0.2 * i))
    # 肩の関節
    m.add(fr, cyl(0.048 * s * k, 0.048 * s * k, 0.06 * s, n=10, axis="x"), sb, DARK, M_FRAME, at=(0.0, 0.0, 0.0))

    # 上腕（フレーム・装甲・ピストン）
    ua = nm + "UpperArm"
    fr = m.frame_bone(ua, side=sx)
    ln = bone_len(B, ua)
    m.add(fr, cyl(0.038 * s * k, 0.034 * s * k, ln * 0.95, n=10), ua, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    m.add(fr, cbox(0.058 * s * k, ln * 0.32, 0.06 * s * k, c=0.3), ua, ARMOR, M_PAINT, at=(0.006 * s, ln * 0.38, 0))
    m.add(fr, cyl(0.009 * s, 0.009 * s, ln * 0.6, n=8), ua, METAL, M_METAL, at=(0, ln * 0.55, -0.05 * s * k))
    # 肘
    m.add(fr, cyl(0.042 * s * k, 0.042 * s * k, 0.075 * s * k, n=10, axis="x"), ua, DARK, M_FRAME, at=(0, ln, 0))

    # 前腕（大きな装甲）
    la = nm + "LowerArm"
    fr = m.frame_bone(la, side=sx)
    ln = bone_len(B, la)
    fa = d.get("forearm", "block")
    m.add(fr, cyl(0.032 * s * k, 0.03 * s * k, ln * 0.9, n=10), la, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    if fa == "heavy":
        m.add(fr, cbox(0.07 * s * k, ln * 0.42, 0.072 * s * k, c=0.25, top=(0.9, 0.9)), la, ARMOR, M_PAINT, at=(0.005 * s, ln * 0.52, 0))
        m.add(fr, cbox(0.074 * s * k, 0.02 * s, 0.076 * s * k, c=0.3), la, DARK, M_FRAME, at=(0.005 * s, ln * 0.95, 0))
    elif fa == "blade":
        m.add(fr, cbox(0.05 * s * k, ln * 0.40, 0.055 * s * k, c=0.3, top=(0.9, 0.9)), la, ARMOR, M_PAINT, at=(0.0, ln * 0.52, 0))
        m.add(fr, cbox(0.008 * s, ln * 0.45, 0.03 * s, c=0.3, top=(1.0, 0.4)), la, ARMOR2, M_PAINT, at=(0.058 * s * k, ln * 0.55, 0.0))
    elif fa == "shield" and sx < 0:
        m.add(fr, cbox(0.05 * s * k, ln * 0.40, 0.055 * s * k, c=0.3), la, ARMOR, M_PAINT, at=(0.0, ln * 0.52, 0))
        m.add(fr, cbox(0.012 * s, ln * 0.55, 0.10 * s * k, c=0.3, top=(1.0, 0.85)), la, ARMOR2, M_PAINT, at=(0.065 * s * k, ln * 0.5, 0.0))
    elif fa == "slim":
        m.add(fr, cbox(0.042 * s * k, ln * 0.36, 0.046 * s * k, c=0.35, top=(0.85, 0.85)), la, ARMOR, M_PAINT, at=(0.0, ln * 0.5, 0))
    else:
        m.add(fr, cbox(0.074 * s * k, ln * 0.44, 0.078 * s * k, c=0.26, top=(0.92, 0.9)), la, ARMOR, M_PAINT, at=(0.004 * s, ln * 0.52, 0))
        m.add(fr, cbox(0.078 * s * k, 0.018 * s, 0.082 * s * k, c=0.3), la, DARK, M_FRAME, at=(0.004 * s, ln * 0.96, 0))
    if d.get("wraps"):
        for i in range(2):
            m.add(fr, cyl(0.045 * s * k, 0.045 * s * k, 0.025 * s, n=10), la, HOSE, M_RUBBER, at=(0, ln * (0.88 - i * 0.07), 0))

    # 手（掌・指・親指）
    hd = nm + "Hand"
    fr = m.frame_bone(hd, side=sx)
    ln = bone_len(B, hd)
    hk = k * float(d.get("hands", 1.0)) * 1.3
    m.add(fr, cbox(0.026 * s * hk, 0.045 * s * hk, 0.046 * s * hk, c=0.3), hd, HANDS, M_FRAME, at=(0, ln * 0.5, 0))
    m.add(fr, cbox(0.03 * s * hk, 0.02 * s, 0.05 * s * hk, c=0.3), hd, DARK, M_FRAME, at=(0, 0.0, 0))
    fg = nm + "Fingers"
    fr = m.frame_bone(fg, side=sx)
    ln = bone_len(B, fg)
    for i in range(3):
        m.add(fr, cbox(0.017 * s * hk, ln * 0.55, 0.012 * s * hk, c=0.35), fg, HANDS, M_FRAME,
              at=(0.0, ln * 0.45, (-0.028 + i * 0.028) * s * hk))
    th = nm + "Thumb"
    fr = m.frame_bone(th, side=sx)
    ln = bone_len(B, th)
    m.add(fr, cbox(0.014 * s * hk, ln * 0.55, 0.014 * s * hk, c=0.35), th, HANDS, M_FRAME, at=(0.0, ln * 0.45, 0.0))


def _leg(m, B, nm, sx, s, k, d):
    ul = nm + "UpperLeg"
    fr = m.frame_bone(ul, side=sx)
    ln = bone_len(B, ul)
    m.add(fr, cyl(0.052 * s * k, 0.046 * s * k, ln * 0.95, n=10), ul, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    m.add(fr, cbox(0.07 * s * k, ln * 0.30, 0.075 * s * k, c=0.28, bottom=(0.9, 0.9)), ul, ARMOR, M_PAINT, at=(0.008 * s, ln * 0.48, 0.0))
    # 腰から太腿の前に垂れる装甲板（脚と一緒に動く）
    if d.get("skirt", "side") != "none":
        m.add(fr, cbox(0.075 * s * k, ln * 0.21, 0.016 * s, c=0.3, bottom=(0.85, 1.0)), ul, ARMOR2, M_PAINT,
              at=(0.006 * s, ln * 0.12, 0.095 * s * k), R=rot(ax=-0.12))
        m.add(fr, cbox(0.016 * s, 0.016 * s, 0.003 * s, c=0.2, bottom=(0.4, 1.0)), ul, MARK, M_PAINT, at=(0.03 * s, ln * 0.10, 0.112 * s * k))
    m.add(fr, cyl(0.011 * s, 0.011 * s, ln * 0.5, n=8), ul, METAL, M_METAL, at=(0.062 * s * k, ln * 0.6, 0.0))
    # 脛: 下へ広がる大きな箱、丸い膝当て、前面の筋
    ll = nm + "LowerLeg"
    fr = m.frame_bone(ll, side=sx)
    ln = bone_len(B, ll)
    sh = d.get("shin", "roller")
    sk = 1.12 if sh == "heavy" else (0.9 if sh == "slim" else 1.0)
    m.add(fr, cyl(0.042 * s * k, 0.04 * s * k, ln * 0.95, n=10), ll, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    m.add(fr, cbox(0.08 * s * k * sk, ln * 0.42, 0.09 * s * k * sk, c=0.22, top=(0.85, 0.82), bottom=(1.2, 1.18)), ll, ARMOR, M_PAINT,
          at=(0.004 * s, ln * 0.55, 0.0))
    m.add(fr, dome(0.08 * s * k, 0.055 * s * k, n=12, rings=3, base=0.03 * s), ll, ARMOR2, M_PAINT,
          at=(0.0, 0.03 * s, 0.045 * s * k), R=rot(ax=math.pi * 0.5))
    m.add(fr, cyl(0.048 * s * k, 0.048 * s * k, 0.09 * s * k, n=10, axis="x"), ll, DARK, M_FRAME, at=(0, 0.0, 0))
    for ox in (-1, 1):
        m.add(fr, cbox(0.004 * s, ln * 0.30, 0.004 * s, c=0.2), ll, DARK, M_FRAME,
              at=(ox * 0.035 * s * k * sk, ln * 0.58, 0.093 * s * k * sk + 0.004 * s), R=rot(ax=-0.06))
    # 側面の番号板
    m.add(fr, cbox(0.006 * s, 0.045 * s, 0.035 * s, c=0.3), ll, MARK, M_PAINT, at=(0.086 * s * k * sk, ln * 0.5, 0.0))
    # 足: 幅の広い台と、側面のローラーの収納（車輪が覗く）
    ft = nm + "Foot"
    fr = m.frame_world()
    a, b = B.j(ft), B.t(ft)
    fc = (a + b) * 0.5
    fl = float(np.linalg.norm(b - a))
    fw = 0.075 * s * k * sk
    m.add(fr, cbox(fw, 0.04 * s, fl * 0.75 + 0.06 * s, c=0.3, top=(0.9, 0.92)), ft, FEET, M_FRAME,
          at=[fc[0], 0.04 * s, fc[2] + 0.01 * s])
    m.add(fr, cbox(fw * 0.85, 0.035 * s, 0.07 * s, c=0.3, top=(0.85, 0.85)), ft, ARMOR, M_PAINT, at=[fc[0], 0.105 * s, fc[2] + 0.035 * s])
    if sh in ("roller", "heavy"):
        for ox in (-1, 1):
            hx = fc[0] + ox * (fw + 0.012 * s)
            m.add(fr, cbox(0.014 * s, 0.032 * s, 0.075 * s, c=0.3), ft, ARMOR2, M_PAINT, at=[hx, 0.07 * s, fc[2] + 0.04 * s])
            for wz in (-0.03, 0.03):
                m.add(fr, cyl(0.022 * s, 0.022 * s, 0.012 * s, n=12, axis="x"), ft, DARK, M_RUBBER,
                      at=[hx + ox * 0.012 * s, 0.035 * s, fc[2] + 0.04 * s + wz * s])
                m.add(fr, cyl(0.01 * s, 0.01 * s, 0.016 * s, n=8, axis="x"), ft, METAL, M_METAL,
                      at=[hx + ox * 0.014 * s, 0.035 * s, fc[2] + 0.04 * s + wz * s])
    tt = nm + "Toes"
    a, b = B.j(tt), B.t(tt)
    tc = (a + b) * 0.5
    m.add(fr, cbox(fw * 0.95, 0.028 * s, 0.055 * s, c=0.35, top=(0.85, 0.75)), tt, FEET, M_FRAME, at=[tc[0], 0.03 * s, tc[2] - 0.015 * s])


# ------------------------------------------------------------------ 出力

def generate(cid, costume_id):
    t0 = time.time()
    rig = json.loads((ROOT / f"data/baked/{cid}.rig.json").read_text())
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    model = dict(cj.get("model", {}))
    design = dict(model.get("mech", {}))
    for c in cj.get("costumes", []):
        if c.get("id") == costume_id:
            design.update(c.get("model", {}).get("mech", {}))
    B = Body(rig, model, cj.get("body", {}))
    m = build(B, design)
    verts, normals, faces, colors, joints, weights = m.mesh()
    out = ROOT / f"assets/characters/{cid}/{cid}_{costume_id}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_glb(out, rig, verts, normals, faces, colors, joints, weights)
    print(f"{cid}/{costume_id}: {len(faces)} tris, wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB) in {time.time() - t0:.1f}s")


def main():
    cid = sys.argv[1]
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    costumes = sys.argv[2:] or [c["id"] for c in cj.get("costumes", [{"id": "a"}])]
    for c in costumes:
        generate(cid, c)


if __name__ == "__main__":
    main()
