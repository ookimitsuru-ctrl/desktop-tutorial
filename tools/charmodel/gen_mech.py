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
    """角を落とした箱。c は面取りの割合（短辺に対して）。top/bottom は上下端の x, z の倍率（台形）。
    ボルトや溝のような小さな部品は面取りしても見えないので、頂点 8 個の箱にする（三角形の数を抑える）"""
    if min(hx, hy, hz) < 0.0065:
        pts = []
        for sy in (-1, 1):
            sx_, sz_ = top if sy > 0 else bottom
            for ex in (-1, 1):
                for ez in (-1, 1):
                    pts.append((ex * hx * sx_, sy * hy, ez * hz * sz_))
        return np.array(pts, dtype=np.float64)
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
        seen = {}
        for k, (t, slot, mt, bi, ao) in enumerate(self.tris):
            n = np.cross(t[1] - t[0], t[2] - t[0])
            ln = np.linalg.norm(n)
            if ln < 1e-12:
                continue
            n = n / ln
            # 簡易 AO: 下向きの面ほど暗く
            a = ao * (0.62 + 0.38 * (n[1] * 0.5 + 0.5))
            idx = []
            for v in t:
                # 同じ平面（同じ法線）の三角形どうしは頂点を共有する
                key = (round(v[0], 5), round(v[1], 5), round(v[2], 5), round(n[0], 3), round(n[1], 3), round(n[2], 3), slot, mt, bi)
                i = seen.get(key)
                if i is None:
                    i = len(V)
                    seen[key] = i
                    V.append(v)
                    N.append(n)
                    C.append(((slot + 0.5) / 16.0, mt, a, 1.0))
                    J.append((bi, 0, 0, 0))
                    W.append((1.0, 0.0, 0.0, 0.0))
                idx.append(i)
            F.append(tuple(idx))
        return (np.array(V, dtype=np.float32), np.array(N, dtype=np.float32), np.array(F, dtype=np.uint32),
                np.array(C, dtype=np.float32), np.array(J, dtype=np.uint8), np.array(W, dtype=np.float32))


# ------------------------------------------------------------------ 部位

def bone_len(B, name):
    return float(np.linalg.norm(B.t(name) - B.j(name)))


def plate(m, fr, bone, half, at, R=None, slot=ARMOR, mt=M_PAINT, c=0.25, top=(1.0, 1.0), bottom=(1.0, 1.0),
          front=1, grooves=1, bolts=True, s=1.0, vents=0, trim=False):
    """細部の付いた装甲板: 本体の箱、前面の溝（パネルライン）、四隅のボルト、通気口のスリット、縁取り（trim）。
    front: 前面の向き（局所 z の符号。骨の座標系は +1、モデル空間は -1）"""
    hx, hy, hz = half
    m.add(fr, cbox(hx, hy, hz, c=c, top=top, bottom=bottom), bone, slot, mt, at=at, R=R)

    def fz(y):
        # 台形の箱の前面の z（上下の倍率を線形に補間）
        t = (y / hy + 1.0) * 0.5
        return front * (hz * (bottom[1] + (top[1] - bottom[1]) * t) + 0.0015 * s)

    def fx(y):
        t = (y / hy + 1.0) * 0.5
        return hx * (bottom[0] + (top[0] - bottom[0]) * t)

    for i in range(grooves):
        y = hy * (0.5 - (i + 1) / (grooves + 1)) * 1.5
        m.add(fr, cbox(fx(y) * 0.8, 0.0028 * s, 0.002 * s, c=0.2) + [0, y, fz(y)], bone, DARK, M_FRAME, at=at, R=R)
    if bolts:
        for ex in (-1, 1):
            for ey in (-1, 1):
                y = ey * hy * 0.78
                m.add(fr, cbox(0.0055 * s, 0.0055 * s, 0.003 * s, c=0.3) + [ex * fx(y) * 0.78, y, fz(y)], bone, INNER, M_FRAME, at=at, R=R)
    for i in range(vents):
        y = -hy * 0.45 + i * 0.016 * s
        m.add(fr, cbox(fx(y) * 0.45, 0.0035 * s, 0.003 * s, c=0.2) + [0, y, fz(y)], bone, DARK, M_FRAME, at=at, R=R)
    if trim:
        for ey in (-1, 1):
            y = ey * hy * 0.94
            m.add(fr, cbox(fx(y) * 0.92, 0.004 * s, 0.003 * s, c=0.2) + [0, y, fz(y)], bone, MARK, M_METAL, at=at, R=R)


def piston(m, fr, bone, a, b, r, s):
    """油圧シリンダー（外筒と、細く光るロッド）。a から b へ（局所座標）"""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    d = b - a
    ln = float(np.linalg.norm(d))
    if ln < 1e-6:
        return
    y = d / ln
    u = np.array([1.0, 0, 0]) if abs(y[0]) < 0.9 else np.array([0, 0, 1.0])
    x = np.cross(y, u)
    x /= np.linalg.norm(x)
    z = np.cross(x, y)
    R = np.stack([x, y, z], axis=1)
    m.add(fr, cyl(r, r, ln * 0.55, n=8), bone, INNER, M_FRAME, at=a + y * ln * 0.28, R=R)
    m.add(fr, cyl(r * 0.55, r * 0.55, ln * 0.5, n=8), bone, METAL, M_METAL, at=a + y * ln * 0.72, R=R)
    m.add(fr, cyl(r * 1.25, r * 1.25, r * 1.6, n=8, axis="x"), bone, DARK, M_FRAME, at=a, R=R)


def build(B, d):
    """d: デザインの指定（頭・肩・腕などの型と寸法の倍率、features: 機体ごとの特徴的な部品）"""
    m = Mech(B)
    s = B.s
    k = BULK.get(B.build, 1.0) * float(d.get("bulk", 1.0)) * 1.32
    feats = set(d.get("features", []))
    W = m.frame_world()
    hips, spine, chest, neck, head = (B.j(n) for n in ("Hips", "Spine", "Chest", "Neck", "Head"))

    # --- 腰（骨盤ブロック・帯・股の装甲・腰の側板・後ろの板）
    m.add(W, cbox(0.16 * s * k, 0.095 * s, 0.12 * s * k, c=0.3), "Hips", INNER, M_FRAME, at=hips)
    m.add(W, cbox(0.168 * s * k, 0.022 * s, 0.128 * s * k, c=0.35), "Hips", DARK, M_RUBBER, at=hips + [0, 0.07 * s, 0])
    plate(m, W, "Hips", (0.08 * s * k, 0.075 * s, 0.026 * s), hips + [0, -0.05 * s, -0.118 * s * k], R=rot(ax=0.18),
          bottom=(0.55, 1.0), front=-1, grooves=1, s=s)
    skirt = d.get("skirt", "side")
    for sx in (-1, 1):
        if skirt != "none":
            hgt = 0.115 if skirt == "long" else 0.09
            plate(m, W, "Hips", (0.09 * s * k, hgt * s, 0.024 * s), hips + [sx * 0.17 * s * k, -0.045 * s - (hgt - 0.09) * s, 0.0],
                  R=rot(az=sx * 0.12) @ rot(ay=sx * math.pi * 0.5), slot=ARMOR2, bottom=(0.85, 1.0), front=1, grooves=1, s=s)
        m.add(W, cyl(0.06 * s * k, 0.06 * s * k, 0.055 * s, n=10, axis="x"), "Hips", DARK, M_FRAME,
              at=B.j("LeftUpperLeg" if sx < 0 else "RightUpperLeg") + [sx * 0.02 * s, 0.0, 0.0])
    plate(m, W, "Hips", (0.11 * s * k, 0.075 * s, 0.03 * s), hips + [0, -0.01 * s, 0.11 * s * k], slot=ARMOR2, front=1, grooves=1, s=s)

    # --- 胴の可動部（蛇腹の輪を重ね、前にピストン、脇に配管）
    for i in range(4):
        r = (0.108 - (0.006 if i % 2 else 0.0)) * s * k
        m.add(W, cyl(r, r, 0.035 * s, n=14), "Spine", DARK, M_RUBBER, at=spine + [0, 0.012 * s + i * 0.034 * s, 0.0])
    for sx in (-1, 1):
        piston(m, W, "Spine", spine + [sx * 0.075 * s * k, 0.0, -0.085 * s * k], spine + [sx * 0.075 * s * k, 0.17 * s, -0.085 * s * k], 0.013 * s, s)
        m.add(W, cyl(0.011 * s, 0.011 * s, 0.17 * s, n=6), "Spine", HOSE, M_RUBBER, at=spine + [sx * 0.105 * s * k, 0.085 * s, 0.02 * s])

    # --- 胸（操縦席）
    ch = d.get("chest", "hatch")
    cw, chh, cd = {"hatch": (0.205, 0.135, 0.155), "heavy": (0.23, 0.145, 0.17), "slim": (0.185, 0.13, 0.14), "round": (0.195, 0.135, 0.155)}[ch]
    cc = chest + [0, 0.13 * s, 0.0]
    if ch == "round":
        m.add(W, cyl(cw * s * k, cw * 0.95 * s * k, 2 * chh * s, n=16), "Chest", ARMOR, M_PAINT, at=cc)
        hz = cc[2] - cw * 0.95 * s * k
    else:
        plate(m, W, "Chest", (cw * s * k, chh * s, cd * s * k), cc, c=0.22, top=(0.95, 0.9), bottom=(0.95, 1.0), front=-1, grooves=0, s=s)
        hz = cc[2] - cd * s * k
    # 胸の側面の装甲と通気口
    for sx in (-1, 1):
        plate(m, W, "Chest", (cd * 0.75 * s * k, chh * 0.75 * s, 0.012 * s), cc + [sx * (cw * s * k + 0.01 * s), -0.01 * s, 0.0],
              R=rot(ay=sx * math.pi * 0.5), slot=ARMOR2, front=1, grooves=0, vents=3, s=s)
    lc = chest + [0, -0.035 * s, -0.012 * s * k]
    m.add(W, cbox(cw * 0.86 * s * k, 0.075 * s, cd * 1.05 * s * k, c=0.25, bottom=(0.85, 0.85)), "Chest", ARMOR2 if d.get("hatch2") else ARMOR, M_PAINT, at=lc)
    lz = lc[2] - cd * 1.05 * s * k
    for i in range(4):
        m.add(W, cbox(cw * 0.62 * s * k, 0.005 * s, 0.006 * s, c=0.2), "Chest", DARK, M_FRAME, at=[lc[0], lc[1] + (0.04 - i * 0.025) * s, lz - 0.002 * s])
    # ハッチ（盛り上がった板・取っ手・蝶番・覗き窓・ボルト）
    plate(m, W, "Chest", (cw * 0.72 * s * k, 0.095 * s, 0.016 * s), [cc[0], cc[1] - 0.01 * s, hz - 0.012 * s], c=0.3, front=-1, grooves=1, s=s)
    m.add(W, cyl(0.015 * s, 0.015 * s, cw * 1.4 * s * k, n=8, axis="x"), "Chest", METAL, M_METAL, at=[cc[0], cc[1] + 0.1 * s, hz - 0.006 * s])
    for sx in (-1, 1):
        m.add(W, cbox(0.022 * s, 0.014 * s, 0.014 * s, c=0.3), "Chest", INNER, M_FRAME, at=[cc[0] + sx * cw * 0.55 * s * k, cc[1] + 0.1 * s, hz - 0.012 * s])
    m.add(W, cbox(0.045 * s, 0.007 * s, 0.012 * s, c=0.3), "Chest", METAL, M_METAL, at=[cc[0], cc[1] + 0.035 * s, hz - 0.034 * s])
    for sx in (-1, 1):
        m.add(W, cbox(0.004 * s, 0.012 * s, 0.012 * s, c=0.2), "Chest", METAL, M_METAL, at=[cc[0] + sx * 0.045 * s, cc[1] + 0.027 * s, hz - 0.034 * s])
    m.add(W, cbox(0.055 * s, 0.009 * s, 0.006 * s, c=0.3), "Chest", DARK, M_FRAME, at=[cc[0], cc[1] - 0.06 * s, hz - 0.03 * s])
    if d.get("stripe", True):
        m.add(W, cbox(0.022 * s, 0.024 * s, 0.004 * s, c=0.2, bottom=(0.4, 1.0)), "Chest", MARK, M_PAINT, at=[cc[0] + 0.135 * s * k, cc[1] + 0.07 * s, hz + 0.003 * s])
        m.add(W, cbox(0.035 * s, 0.008 * s, 0.004 * s, c=0.2), "Chest", MARK, M_PAINT, at=[cc[0] - 0.13 * s * k, cc[1] + 0.08 * s, hz + 0.003 * s])
    # 小さな灯火（胸の上の角）
    for sx in (-1, 1):
        m.add(W, cyl(0.009 * s, 0.009 * s, 0.01 * s, n=8, axis="z"), "Chest", FRAME, M_LENS, at=[cc[0] + sx * cw * 0.86 * s * k, cc[1] + 0.105 * s, hz + 0.004 * s])
    # 襟と首の後ろの装甲
    m.add(W, cyl(0.09 * s * k, 0.075 * s * k, 0.05 * s, n=12), "Chest", DARK, M_RUBBER, at=neck + [0, -0.01 * s, 0.01 * s])
    m.add(W, cbox(0.15 * s * k, 0.068 * s, 0.036 * s, c=0.3, top=(0.85, 1.0)), "Chest", ARMOR2, M_PAINT, at=neck + [0, 0.02 * s, 0.075 * s * k], R=rot(ax=-0.3))
    for sx in (-1, 1):
        m.add(W, cbox(0.032 * s, 0.042 * s, 0.075 * s * k, c=0.3), "Chest", ARMOR2, M_PAINT, at=neck + [sx * 0.11 * s * k, -0.005 * s, 0.01 * s], R=rot(az=sx * 0.35))
    # 背中
    bp = d.get("back", "pack")
    bc = chest + [0, 0.10 * s, (cd + 0.065) * s * k]
    if bp == "pack":
        plate(m, W, "Chest", (0.16 * s * k, 0.135 * s, 0.075 * s), bc, slot=ARMOR2, front=1, grooves=2, vents=4, s=s)
        for sx in (-1, 1):
            m.add(W, cyl(0.024 * s, 0.028 * s, 0.11 * s, n=10), "Chest", METAL, M_METAL, at=bc + [sx * 0.105 * s * k, 0.18 * s, 0.02 * s])
            m.add(W, cyl(0.03 * s, 0.03 * s, 0.025 * s, n=10), "Chest", DARK, M_FRAME, at=bc + [sx * 0.105 * s * k, 0.24 * s, 0.02 * s])
            m.add(W, cbox(0.012 * s, 0.12 * s, 0.01 * s, c=0.3), "Chest", INNER, M_FRAME, at=bc + [sx * 0.06 * s * k, 0.0, 0.08 * s])
    elif bp == "tanks":
        for sx in (-1, 1):
            m.add(W, cyl(0.058 * s, 0.058 * s, 0.27 * s, n=14), "Chest", ARMOR2, M_PAINT, at=bc + [sx * 0.085 * s * k, 0.0, 0.01 * s])
            m.add(W, dome(0.058 * s, 0.032 * s, n=14, rings=2), "Chest", ARMOR2, M_PAINT, at=bc + [sx * 0.085 * s * k, 0.135 * s, 0.01 * s])
            for yy in (-0.08, 0.08):
                m.add(W, cyl(0.061 * s, 0.061 * s, 0.012 * s, n=14), "Chest", DARK, M_FRAME, at=bc + [sx * 0.085 * s * k, yy * s, 0.01 * s])
        m.add(W, cbox(0.05 * s, 0.11 * s, 0.03 * s, c=0.3), "Chest", INNER, M_FRAME, at=bc + [0, 0, -0.03 * s])
    elif bp == "flat":
        plate(m, W, "Chest", (0.14 * s * k, 0.125 * s, 0.04 * s), bc + [0, 0, -0.03 * s], slot=INNER, mt=M_FRAME, front=1, grooves=2, s=s)
    elif bp == "mantle":
        for i in range(3):
            plate(m, W, "Chest", (0.21 * s * k, 0.07 * s, 0.018 * s), bc + [0, 0.06 * s - i * 0.11 * s, 0.02 * s + i * 0.012 * s], R=rot(ax=0.12),
                  slot=ARMOR2, front=1, grooves=0, bolts=False, trim=True, s=s)

    # --- 首と頭
    m.add(W, cyl(0.052 * s, 0.047 * s, 0.07 * s, n=10), "Neck", DARK, M_RUBBER, at=neck + [0, 0.03 * s, 0.0])
    _head(m, B, d.get("head", "turret"), head, s, d)

    for nm, sx in (("Left", -1), ("Right", 1)):
        _arm(m, B, nm, sx, s, k, d, feats)
    for nm, sx in (("Left", -1), ("Right", 1)):
        _leg(m, B, nm, sx, s, k, d, feats)
    _features(m, B, s, k, d, feats, cc, hz, bc, cw, cd)

    # --- 揺れ物: 頭から背中へ垂れる配線（髪の骨）、腰の垂れ板（帯の骨）
    if d.get("hose"):
        for bn in ("Hair1", "Hair2", "Hair3"):
            fr = m.frame_bone(bn)
            ln = bone_len(B, bn)
            m.add(fr, cyl(0.024 * s, 0.024 * s, ln * 1.05, n=8), bn, HOSE, M_RUBBER, at=(0, ln * 0.5, 0))
            m.add(fr, cyl(0.029 * s, 0.029 * s, 0.018 * s, n=8), bn, METAL, M_METAL, at=(0, ln, 0))
    if d.get("flap"):
        for bn in ("Sash1", "Sash2"):
            fr = m.frame_bone(bn)
            ln = bone_len(B, bn)
            plate(m, fr, bn, (0.048 * s, ln * 0.52, 0.008 * s), (0, ln * 0.5, 0), slot=STRIPE, mt=M_RUBBER, front=1, grooves=0, bolts=False, trim=True, s=s)
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


def _arm(m, B, nm, sx, s, k, d, feats):
    sh = d.get("shoulder", "round")
    sb = nm + "Shoulder"
    fr = Frame(B.t(sb), np.array([float(sx), 0, 0]), np.array([0, 1.0, 0]), np.array([0, 0, -1.0]))
    cap = sh
    if sh == "asym":
        cap = "heavy" if sx < 0 else "slim"
    if cap == "round":
        m.add(fr, dome(0.13 * s * k, 0.10 * s * k, n=16, rings=4, base=0.03 * s), sb, ARMOR2, M_PAINT, at=(0.035 * s, 0.035 * s, 0.0), R=rot(az=-0.8))
        m.add(fr, cyl(0.133 * s * k, 0.133 * s * k, 0.012 * s, n=16), sb, DARK, M_FRAME, at=(0.06 * s, 0.01 * s, 0.0), R=rot(az=-0.8))
        m.add(fr, cbox(0.004 * s, 0.024 * s, 0.024 * s, c=0.2, bottom=(1.0, 0.4)), sb, MARK, M_PAINT, at=(0.165 * s * k, -0.01 * s, 0.0), R=rot(az=-0.3))
    elif cap == "box":
        plate(m, fr, sb, (0.10 * s * k, 0.065 * s * k, 0.065 * s * k), (0.04 * s, 0.045 * s, 0.0), R=rot(az=-0.35) @ rot(ay=math.pi * 0.5),
              slot=ARMOR2, front=1, grooves=1, s=s)
    elif cap == "heavy":
        plate(m, fr, sb, (0.125 * s * k, 0.08 * s * k, 0.09 * s * k), (0.05 * s, 0.035 * s, 0.0), R=rot(az=-0.45) @ rot(ay=math.pi * 0.5),
              slot=ARMOR2, bottom=(1.08, 1.0), front=1, grooves=2, s=s)
        m.add(fr, cbox(0.016 * s, 0.09 * s * k, 0.13 * s * k, c=0.3), sb, MARK, M_PAINT, at=(0.13 * s * k, -0.01 * s, 0.0), R=rot(az=-0.15))
    elif cap == "slim":
        m.add(fr, cbox(0.055 * s * k, 0.045 * s * k, 0.075 * s * k, c=0.4), sb, ARMOR2, M_PAINT, at=(0.025 * s, 0.04 * s, 0.0), R=rot(az=-0.4))
    elif cap == "layered":
        for i in range(3):
            plate(m, fr, sb, (0.105 * s * k, 0.024 * s, 0.075 * s * k - i * 0.008 * s), (0.03 * s + i * 0.024 * s, 0.065 * s - i * 0.042 * s, 0.0),
                  R=rot(az=-0.35 - 0.2 * i) @ rot(ay=math.pi * 0.5), slot=ARMOR2 if i % 2 == 0 else ARMOR, front=1, grooves=0, bolts=False,
                  trim="trim" in feats, s=s)
    m.add(fr, cyl(0.052 * s * k, 0.052 * s * k, 0.07 * s, n=12, axis="x"), sb, DARK, M_FRAME, at=(0.0, 0.0, 0.0))
    m.add(fr, cyl(0.03 * s, 0.03 * s, 0.075 * s, n=10, axis="x"), sb, METAL, M_METAL, at=(0.0, 0.0, 0.0))

    # 上腕: フレーム・装甲・外側の油圧シリンダー
    ua = nm + "UpperArm"
    fr = m.frame_bone(ua, side=sx)
    ln = bone_len(B, ua)
    m.add(fr, cyl(0.042 * s * k, 0.038 * s * k, ln * 0.95, n=12), ua, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    plate(m, fr, ua, (0.066 * s * k, ln * 0.33, 0.068 * s * k), (0.006 * s, ln * 0.38, 0), front=1, grooves=1, s=s)
    piston(m, fr, ua, (0.06 * s * k, ln * 0.2, -0.04 * s * k), (0.055 * s * k, ln * 0.92, -0.045 * s * k), 0.012 * s, s)
    m.add(fr, cyl(0.047 * s * k, 0.047 * s * k, 0.085 * s * k, n=12, axis="x"), ua, DARK, M_FRAME, at=(0, ln, 0))
    m.add(fr, cbox(0.04 * s * k, 0.03 * s, 0.022 * s, c=0.35), ua, ARMOR2, M_PAINT, at=(0, ln * 0.97, -0.045 * s * k))
    if "scales" in feats:
        for i in range(3):
            m.add(fr, cbox(0.07 * s * k, 0.018 * s, 0.072 * s * k, c=0.4, bottom=(1.05, 1.05)), ua, ARMOR2, M_PAINT,
                  at=(0.006 * s, ln * (0.12 + i * 0.1), 0.004 * s), R=rot(ax=-0.12))

    # 前腕
    la = nm + "LowerArm"
    fr = m.frame_bone(la, side=sx)
    ln = bone_len(B, la)
    fa = d.get("forearm", "block")
    m.add(fr, cyl(0.036 * s * k, 0.034 * s * k, ln * 0.9, n=12), la, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    if fa == "heavy":
        plate(m, fr, la, (0.084 * s * k, ln * 0.44, 0.086 * s * k), (0.005 * s, ln * 0.52, 0), top=(0.9, 0.9), front=1, grooves=2, s=s)
    elif fa == "blade":
        plate(m, fr, la, (0.062 * s * k, ln * 0.42, 0.066 * s * k), (0.0, ln * 0.52, 0), top=(0.9, 0.9), front=1, grooves=1, s=s)
        m.add(fr, cbox(0.009 * s, ln * 0.5, 0.034 * s, c=0.3, top=(1.0, 0.35)), la, ARMOR2, M_PAINT, at=(0.07 * s * k, ln * 0.55, 0.0))
        m.add(fr, cbox(0.004 * s, ln * 0.46, 0.006 * s, c=0.3), la, METAL, M_METAL, at=(0.07 * s * k, ln * 0.55, 0.03 * s))
    elif fa == "shield" and sx < 0:
        plate(m, fr, la, (0.062 * s * k, ln * 0.42, 0.066 * s * k), (0.0, ln * 0.52, 0), front=1, grooves=1, s=s)
        plate(m, fr, la, (0.11 * s * k, ln * 0.58, 0.012 * s), (0.08 * s * k, ln * 0.5, 0.0), R=rot(ay=math.pi * 0.5), slot=ARMOR2,
              top=(0.85, 1.0), front=1, grooves=2, s=s)
    elif fa == "slim":
        plate(m, fr, la, (0.055 * s * k, ln * 0.38, 0.058 * s * k), (0.0, ln * 0.5, 0), top=(0.85, 0.85), front=1, grooves=1, s=s)
    else:
        plate(m, fr, la, (0.08 * s * k, ln * 0.44, 0.084 * s * k), (0.004 * s, ln * 0.52, 0), top=(0.9, 0.88), front=1, grooves=2, s=s)
    m.add(fr, cbox(0.084 * s * k, 0.018 * s, 0.088 * s * k, c=0.3), la, DARK, M_FRAME, at=(0.004 * s, ln * 0.96, 0))
    if "hazard" in feats:
        for i in range(4):
            m.add(fr, cbox(0.012 * s, 0.01 * s, 0.003 * s, c=0.2), la, STRIPE if i % 2 == 0 else DARK, M_PAINT,
                  at=((-0.03 + i * 0.02) * s, ln * 0.2, 0.088 * s * k), R=rot(az=0.6))
    if d.get("wraps"):
        for i in range(2):
            m.add(fr, cyl(0.052 * s * k, 0.052 * s * k, 0.024 * s, n=12), la, HOSE, M_RUBBER, at=(0, ln * (0.86 - i * 0.07), 0))

    # 手: 掌・関節の付いた指 4 本・親指
    hd = nm + "Hand"
    fr = m.frame_bone(hd, side=sx)
    ln = bone_len(B, hd)
    hk = k * float(d.get("hands", 1.0)) * 1.3
    m.add(fr, cbox(0.028 * s * hk, 0.046 * s * hk, 0.048 * s * hk, c=0.3), hd, HANDS, M_FRAME, at=(0, ln * 0.5, 0))
    m.add(fr, cbox(0.031 * s * hk, 0.02 * s, 0.052 * s * hk, c=0.3), hd, DARK, M_FRAME, at=(0, 0.0, 0))
    m.add(fr, cbox(0.008 * s * hk, 0.04 * s * hk, 0.044 * s * hk, c=0.3), hd, ARMOR2, M_PAINT, at=(0.03 * s * hk, ln * 0.5, 0))
    fg = nm + "Fingers"
    fr = m.frame_bone(fg, side=sx)
    ln = bone_len(B, fg)
    for i in range(4):
        z = (-0.033 + i * 0.022) * s * hk
        m.add(fr, cbox(0.016 * s * hk, ln * 0.3, 0.0095 * s * hk, c=0.35), fg, HANDS, M_FRAME, at=(0.0, ln * 0.22, z))
        m.add(fr, cbox(0.014 * s * hk, ln * 0.28, 0.009 * s * hk, c=0.35), fg, HANDS, M_FRAME, at=(0.0, ln * 0.78, z))
        m.add(fr, cyl(0.007 * s * hk, 0.007 * s * hk, 0.02 * s * hk, n=6, axis="z"), fg, METAL, M_METAL, at=(0.012 * s * hk, ln * 0.5, z))
    if "knuckles" in feats or "claws" in feats:
        m.add(fr, cbox(0.02 * s * hk, ln * 0.35, 0.05 * s * hk, c=0.3), fg, ARMOR2, M_PAINT, at=(0.012 * s * hk, ln * 0.25, -0.0 * s))
    th = nm + "Thumb"
    fr = m.frame_bone(th, side=sx)
    ln = bone_len(B, th)
    m.add(fr, cbox(0.015 * s * hk, ln * 0.3, 0.015 * s * hk, c=0.35), th, HANDS, M_FRAME, at=(0.0, ln * 0.22, 0.0))
    m.add(fr, cbox(0.013 * s * hk, ln * 0.28, 0.013 * s * hk, c=0.35), th, HANDS, M_FRAME, at=(0.0, ln * 0.75, 0.0))


def _leg(m, B, nm, sx, s, k, d, feats):
    ul = nm + "UpperLeg"
    fr = m.frame_bone(ul, side=sx)
    ln = bone_len(B, ul)
    m.add(fr, cyl(0.058 * s * k, 0.05 * s * k, ln * 0.95, n=12), ul, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    plate(m, fr, ul, (0.08 * s * k, ln * 0.31, 0.084 * s * k), (0.022 * s, ln * 0.5, 0.0), bottom=(0.9, 0.9), front=1, grooves=1, s=s)
    plate(m, fr, ul, (0.06 * s * k, ln * 0.22, 0.012 * s), (0.084 * s * k, ln * 0.5, 0.0), R=rot(ay=math.pi * 0.5), slot=ARMOR2,
          front=1, grooves=0, s=s)
    if d.get("skirt", "side") != "none":
        plate(m, fr, ul, (0.082 * s * k, ln * 0.21, 0.016 * s), (0.006 * s, ln * 0.12, 0.1 * s * k), R=rot(ax=-0.12), slot=ARMOR2,
              bottom=(0.85, 1.0), front=1, grooves=1, s=s)
        m.add(fr, cbox(0.016 * s, 0.016 * s, 0.003 * s, c=0.2, bottom=(0.4, 1.0)), ul, MARK, M_PAINT, at=(0.03 * s, ln * 0.09, 0.118 * s * k))
    piston(m, fr, ul, (-0.03 * s, ln * 0.25, -0.07 * s * k), (-0.03 * s, ln * 0.95, -0.062 * s * k), 0.014 * s, s)
    if "pouches" in feats:
        m.add(fr, cbox(0.03 * s, 0.045 * s, 0.05 * s, c=0.35), ul, HOSE, M_RUBBER, at=(0.095 * s * k, ln * 0.68, 0.01 * s))
        m.add(fr, cbox(0.032 * s, 0.012 * s, 0.052 * s, c=0.35), ul, HOSE, M_RUBBER, at=(0.097 * s * k, ln * 0.6, 0.01 * s))
    # 脛
    ll = nm + "LowerLeg"
    fr = m.frame_bone(ll, side=sx)
    ln = bone_len(B, ll)
    sh = d.get("shin", "roller")
    sk = 1.12 if sh == "heavy" else (0.92 if sh == "slim" else 1.0)
    m.add(fr, cyl(0.046 * s * k, 0.044 * s * k, ln * 0.95, n=12), ll, INNER, M_FRAME, at=(0, ln * 0.5, 0))
    plate(m, fr, ll, (0.088 * s * k * sk, ln * 0.42, 0.098 * s * k * sk), (0.004 * s, ln * 0.55, 0.0), c=0.22,
          top=(0.85, 0.82), bottom=(1.2, 1.18), front=1, grooves=2, s=s)
    # 脛の後ろの通気口と側面の板
    for i in range(4):
        m.add(fr, cbox(0.045 * s * k, 0.004 * s, 0.004 * s, c=0.2), ll, DARK, M_FRAME,
              at=(0.0, ln * (0.45 + i * 0.06), -0.1 * s * k * sk))
    plate(m, fr, ll, (0.07 * s * k, ln * 0.3, 0.012 * s), (0.098 * s * k * sk, ln * 0.6, 0.0), R=rot(ay=math.pi * 0.5), slot=ARMOR2,
          front=1, grooves=0, s=s)
    m.add(fr, cbox(0.006 * s, 0.045 * s, 0.035 * s, c=0.3), ll, MARK, M_PAINT, at=(0.112 * s * k * sk, ln * 0.55, 0.0))
    # 膝: 丸い膝当てと関節
    m.add(fr, dome(0.085 * s * k, 0.06 * s * k, n=14, rings=3, base=0.03 * s), ll, ARMOR2, M_PAINT, at=(0.0, 0.03 * s, 0.05 * s * k), R=rot(ax=math.pi * 0.5))
    m.add(fr, cyl(0.052 * s * k, 0.052 * s * k, 0.1 * s * k, n=12, axis="x"), ll, DARK, M_FRAME, at=(0, 0.0, 0))
    if "spikes" in feats:
        m.add(fr, cbox(0.02 * s, 0.02 * s, 0.035 * s, c=0.2, top=(0.3, 0.3)), ll, METAL, M_METAL, at=(0.0, 0.03 * s, 0.13 * s * k), R=rot(ax=math.pi * 0.5))
    if "shinguards" in feats:
        plate(m, fr, ll, (0.07 * s * k, ln * 0.35, 0.014 * s), (0.0, ln * 0.5, 0.11 * s * k * sk), R=rot(ax=-0.08), slot=ARMOR2, front=1, grooves=2, s=s)
    if "hazard" in feats:
        for i in range(5):
            m.add(fr, cbox(0.012 * s, 0.011 * s, 0.003 * s, c=0.2), ll, STRIPE if i % 2 == 0 else DARK, M_PAINT,
                  at=((-0.04 + i * 0.02) * s, ln * 0.82, 0.112 * s * k * sk), R=rot(az=0.6))
    # 足首の装甲
    m.add(fr, cbox(0.07 * s * k, 0.03 * s, 0.075 * s * k, c=0.35), ll, DARK, M_FRAME, at=(0.0, ln * 0.97, 0.0))
    # 足
    ft = nm + "Foot"
    fr = m.frame_world()
    a, b = B.j(ft), B.t(ft)
    fc = (a + b) * 0.5
    fl = float(np.linalg.norm(b - a))
    fw = 0.082 * s * k * sk
    plate(m, fr, ft, (fw, 0.042 * s, fl * 0.75 + 0.065 * s), [fc[0], 0.042 * s, fc[2] + 0.01 * s], slot=FEET, mt=M_FRAME, c=0.3, top=(0.9, 0.92),
          front=-1, grooves=0, bolts=False, s=s)
    plate(m, fr, ft, (fw * 0.85, 0.035 * s, 0.075 * s), [fc[0], 0.11 * s, fc[2] + 0.035 * s], top=(0.85, 0.85), front=-1, grooves=1, s=s)
    m.add(fr, cbox(fw * 0.6, 0.03 * s, 0.03 * s, c=0.35), ft, ARMOR2, M_PAINT, at=[fc[0], 0.05 * s, fc[2] + fl * 0.5 + 0.07 * s])
    if sh in ("roller", "heavy"):
        for ox in (-1, 1):
            hx = fc[0] + ox * (fw + 0.013 * s)
            plate(m, fr, ft, (0.08 * s, 0.035 * s, 0.015 * s), [hx, 0.072 * s, fc[2] + 0.04 * s], R=rot(ay=ox * math.pi * 0.5), slot=ARMOR2,
                  front=1, grooves=0, s=s)
            for wz in (-0.035, 0.0, 0.035):
                m.add(fr, cyl(0.022 * s, 0.022 * s, 0.012 * s, n=12, axis="x"), ft, DARK, M_RUBBER, at=[hx + ox * 0.014 * s, 0.032 * s, fc[2] + 0.04 * s + wz * s])
                m.add(fr, cyl(0.01 * s, 0.01 * s, 0.016 * s, n=8, axis="x"), ft, METAL, M_METAL, at=[hx + ox * 0.016 * s, 0.032 * s, fc[2] + 0.04 * s + wz * s])
    if "spurs" in feats:
        m.add(fr, cbox(0.012 * s, 0.012 * s, 0.035 * s, c=0.2, bottom=(0.4, 0.4)), ft, METAL, M_METAL, at=[fc[0], 0.09 * s, fc[2] + fl * 0.5 + 0.1 * s])
    tt = nm + "Toes"
    a, b = B.j(tt), B.t(tt)
    tc = (a + b) * 0.5
    toe_top = (0.6, 0.4) if "spurs" in feats else (0.85, 0.75)
    m.add(fr, cbox(fw * 0.95, 0.03 * s, 0.06 * s, c=0.35, top=toe_top), tt, FEET, M_FRAME, at=[tc[0], 0.032 * s, tc[2] - 0.015 * s])
    m.add(fr, cbox(fw * 0.8, 0.008 * s, 0.03 * s, c=0.3), tt, ARMOR2, M_PAINT, at=[tc[0], 0.064 * s, tc[2] - 0.005 * s])


def _features(m, B, s, k, d, feats, cc, hz, bc, cw, cd):
    """機体ごとの特徴的な部品"""
    W = m.frame_world()
    hips, chest, head = B.j("Hips"), B.j("Chest"), B.j("Head")
    hc = head + [0, 0.02 * s, -0.035 * s]
    if "searchlight" in feats:
        # 左肩の上の探照灯
        p = cc + [-cw * 0.62 * s * k, 0.15 * s, -0.04 * s]
        m.add(W, cyl(0.034 * s, 0.03 * s, 0.07 * s, n=12, axis="z"), "Chest", ARMOR2, M_PAINT, at=p)
        m.add(W, cyl(0.026 * s, 0.026 * s, 0.008 * s, n=12, axis="z"), "Chest", FRAME, M_LENS, at=p + [0, 0, -0.037 * s])
        m.add(W, cbox(0.012 * s, 0.03 * s, 0.012 * s, c=0.3), "Chest", INNER, M_FRAME, at=p + [0, -0.035 * s, 0])
    if "belt" in feats:
        m.add(W, cbox(0.172 * s * k, 0.026 * s, 0.132 * s * k, c=0.35), "Hips", DARK, M_RUBBER, at=hips + [0, 0.07 * s, 0])
        m.add(W, cbox(0.03 * s, 0.022 * s, 0.012 * s, c=0.3), "Hips", DARK, M_RUBBER, at=hips + [0.03 * s, 0.07 * s, -0.138 * s * k])
        for sx2 in (-1, 1):
            m.add(W, cbox(0.012 * s, 0.05 * s, 0.006 * s, c=0.3), "Hips", DARK, M_RUBBER,
                  at=hips + [0.03 * s + sx2 * 0.02 * s, 0.025 * s, -0.142 * s * k], R=rot(az=sx2 * 0.25))
    if "radar" in feats:
        p = bc + [0.06 * s * k, 0.2 * s, 0.03 * s]
        m.add(W, cyl(0.008 * s, 0.008 * s, 0.14 * s, n=6), "Chest", METAL, M_METAL, at=p)
        m.add(W, dome(0.06 * s, 0.018 * s, n=14, rings=2), "Chest", ARMOR2, M_PAINT, at=p + [0, 0.075 * s, 0], R=rot(ax=-1.1))
        m.add(W, cyl(0.004 * s, 0.004 * s, 0.05 * s, n=6), "Chest", METAL, M_METAL, at=p + [0, 0.08 * s, -0.03 * s], R=rot(ax=-1.1))
        for i in range(3):
            m.add(W, cyl(0.003 * s, 0.003 * s, (0.09 + i * 0.03) * s, n=5), "Chest", METAL, M_METAL, at=bc + [(-0.08 + i * 0.03) * s * k, 0.2 * s + i * 0.015 * s, 0.03 * s])
    if "rollbar" in feats:
        r = 0.012 * s
        zf = hz - 0.05 * s
        for sx2 in (-1, 1):
            m.add(W, cyl(r, r, 0.26 * s, n=8), "Chest", METAL, M_METAL, at=[cc[0] + sx2 * cw * 0.82 * s * k, cc[1] - 0.01 * s, zf])
            m.add(W, cyl(r, r, 0.07 * s, n=8, axis="z"), "Chest", METAL, M_METAL, at=[cc[0] + sx2 * cw * 0.82 * s * k, cc[1] + 0.12 * s, zf + 0.035 * s])
        m.add(W, cyl(r, r, cw * 1.64 * s * k, n=8, axis="x"), "Chest", METAL, M_METAL, at=[cc[0], cc[1] + 0.12 * s, zf])
        m.add(W, cyl(r, r, cw * 1.64 * s * k, n=8, axis="x"), "Chest", METAL, M_METAL, at=[cc[0], cc[1] - 0.06 * s, zf])
    if "stacks" in feats:
        for sx2 in (-1, 1):
            p = bc + [sx2 * 0.12 * s * k, 0.22 * s, 0.05 * s]
            m.add(W, cyl(0.026 * s, 0.03 * s, 0.26 * s, n=10), "Chest", METAL, M_METAL, at=p)
            m.add(W, cyl(0.034 * s, 0.034 * s, 0.03 * s, n=10), "Chest", DARK, M_FRAME, at=p + [0, 0.14 * s, 0])
            m.add(W, cyl(0.033 * s, 0.033 * s, 0.01 * s, n=10), "Chest", DARK, M_FRAME, at=p + [0, -0.06 * s, 0])
    if "tassets" in feats:
        for sx2 in (-1, 1):
            for i in range(2):
                plate(m, W, "Hips", (0.075 * s * k, 0.05 * s, 0.012 * s), hips + [sx2 * (0.19 + i * 0.012) * s * k, -0.05 * s - i * 0.075 * s, -0.01 * s],
                      R=rot(az=sx2 * 0.18) @ rot(ay=sx2 * math.pi * 0.5), slot=ARMOR2 if i == 0 else ARMOR, front=1, grooves=0, bolts=False,
                      trim="trim" in feats, s=s)
    if "trim" in feats:
        m.add(W, cbox(cw * 0.9 * s * k, 0.005 * s, 0.004 * s, c=0.2), "Chest", MARK, M_METAL, at=[cc[0], cc[1] + 0.128 * s, hz - 0.001 * s])
        m.add(W, cbox(cw * 0.7 * s * k, 0.005 * s, 0.004 * s, c=0.2), "Chest", MARK, M_METAL, at=[cc[0], cc[1] - 0.105 * s, hz - 0.03 * s])
    if "sheaths" in feats:
        for sx2 in (-1, 1):
            m.add(W, cyl(0.014 * s, 0.014 * s, 0.5 * s, n=8), "Chest", HOSE, M_RUBBER, at=bc + [0, 0.02 * s, 0.09 * s], R=rot(az=sx2 * 0.55))
            m.add(W, cyl(0.018 * s, 0.018 * s, 0.03 * s, n=8), "Chest", METAL, M_METAL,
                  at=bc + [-sx2 * 0.13 * s, 0.23 * s, 0.09 * s], R=rot(az=sx2 * 0.55))
    if "plume" in feats:
        m.add(W, cbox(0.006 * s, 0.05 * s, 0.07 * s, c=0.3, top=(1.0, 0.5)), "Head", MARK, M_PAINT, at=hc + [0, 0.11 * s, 0.03 * s], R=rot(ax=0.3))
    if "beak" in feats:
        m.add(W, cbox(0.035 * s, 0.022 * s, 0.05 * s, c=0.3, top=(0.6, 1.0)), "Head", ARMOR2, M_PAINT, at=hc + [0, 0.07 * s, -0.09 * s], R=rot(ax=0.35))
    if "wings" in feats:
        for sx2 in (-1, 1):
            plate(m, W, "Chest", (0.05 * s, 0.18 * s, 0.01 * s), bc + [sx2 * 0.16 * s * k, 0.17 * s, 0.05 * s], R=rot(az=-sx2 * 0.6) @ rot(ax=0.35),
                  slot=ARMOR2, top=(0.5, 1.0), front=1, grooves=2, bolts=False, s=s)
            m.add(W, cbox(0.02 * s, 0.12 * s, 0.012 * s, c=0.3, top=(0.4, 1.0)), "Chest", MARK, M_PAINT,
                  at=bc + [sx2 * 0.22 * s * k, 0.12 * s, 0.07 * s], R=rot(az=-sx2 * 0.9) @ rot(ax=0.35))
    if "kusazuri" in feats:
        for sx2 in (-1, 1):
            for i in range(3):
                plate(m, W, "Hips", (0.075 * s * k, 0.035 * s, 0.012 * s), hips + [sx2 * (0.175 + i * 0.01) * s * k, -0.04 * s - i * 0.055 * s, 0.0],
                      R=rot(az=sx2 * 0.15) @ rot(ay=sx2 * math.pi * 0.5), slot=ARMOR if i % 2 == 0 else ARMOR2, front=1, grooves=0, bolts=False,
                      trim=True, s=s)
        for i in range(3):
            plate(m, W, "Hips", (0.1 * s * k, 0.035 * s, 0.012 * s), hips + [0, -0.04 * s - i * 0.055 * s, 0.13 * s * k + i * 0.01 * s],
                  R=rot(ax=0.15), slot=ARMOR if i % 2 == 0 else ARMOR2, front=1, grooves=0, bolts=False, trim=True, s=s)
    if "katana" in feats:
        m.add(W, cbox(0.012 * s, 0.012 * s, 0.32 * s, c=0.3), "Hips", HOSE, M_RUBBER, at=hips + [-0.19 * s * k, 0.0, 0.05 * s], R=rot(ax=-0.35))
        m.add(W, cbox(0.016 * s, 0.016 * s, 0.012 * s, c=0.3), "Hips", MARK, M_METAL, at=hips + [-0.19 * s * k, 0.05 * s, -0.09 * s], R=rot(ax=-0.35))


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
    write_glb(out, rig, verts, normals, faces, colors, joints, weights, compact=True)
    print(f"{cid}/{costume_id}: {len(faces)} tris, wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB) in {time.time() - t0:.1f}s")


def main():
    cid = sys.argv[1]
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    costumes = sys.argv[2:] or [c["id"] for c in cj.get("costumes", [{"id": "a"}])]
    for c in costumes:
        generate(cid, c)


if __name__ == "__main__":
    main()
