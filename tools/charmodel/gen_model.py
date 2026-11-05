#!/usr/bin/env python3
"""SDF ベースの手続き的キャラクターモデル生成器。

骨格（data/baked/<id>.rig.json）と character.json の "model"/"costumes" から、
体・顔・髪・衣装を SDF の滑らかな合成で作り、マーチングキューブでメッシュ化し、
スキンウェイトとパレット番号（頂点カラー）を付けて glTF (.glb) に書き出す。

使い方: python3 tools/charmodel/gen_model.py toma [costume ...]
出力: assets/characters/<id>/<id>_<costume>.glb
"""
import json
import math
import pathlib
import sys
import time

import numpy as np
from scipy import ndimage
from skimage import measure
import fast_simplification

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import sdf  # noqa: E402
from gltf_writer import write_glb  # noqa: E402
import outfits  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parents[2]
VOXEL = 0.0055
TARGET_TRIS = 24000

# パレット番号
SKIN, HAIR, PRIMARY, SECONDARY, ACCENT, GLOVES, SHOES, EYE_WHITE, DARK, LIPS, METAL, TERTIARY = range(12)
# 材質（頂点カラー G）
MT_SKIN, MT_CLOTH, MT_HAIR, MT_LEATHER, MT_EYE = 0.0, 0.25, 0.5, 0.75, 1.0


class Prim:
    """SDF 形状 1 つ。bone はスキニングの所属ボーン、slot はパレット番号。"""

    def __init__(self, kind, args, bone, slot=SKIN, mtype=MT_SKIN, k=0.025, layer="body", own_bone=False, bias=0.0):
        self.kind = kind
        self.args = args
        self.bone = bone
        self.slot = slot
        self.mtype = mtype
        self.k = k
        self.layer = layer
        self.own_bone = own_bone
        self.bias = bias
        self.cut = None  # (法線, 点) の半空間で切り取る

    def eval(self, P):
        a = self.args
        if self.kind == "sphere":
            d = sdf.sd_sphere(P, a[0], a[1])
        elif self.kind == "cone":
            d = sdf.sd_round_cone(P, a[0], a[1], a[2], a[3])
        elif self.kind == "capsule":
            d = sdf.sd_capsule(P, a[0], a[1], a[2])
        elif self.kind == "ell":
            d = sdf.sd_ellipsoid(P, a[0], a[1], a[2] if len(a) > 2 else None)
        elif self.kind == "box":
            d = sdf.sd_round_box(P, a[0], a[1], a[2], a[3] if len(a) > 3 else None)
        elif self.kind == "torus":
            d = sdf.sd_torus(P, a[0], a[1], a[2], a[3] if len(a) > 3 else None)
        else:
            raise ValueError(self.kind)
        if self.cut is not None:
            n, p0 = self.cut
            plane = np.sum((P - p0) * n, axis=-1)
            d = np.maximum(d, plane)
        return d

    def aabb(self):
        a = self.args
        m = self.k + 0.02
        if self.kind == "sphere":
            c, r = a[0], a[1]
            return c - r - m, c + r + m
        if self.kind in ("cone", "capsule"):
            r = max(a[2], a[3]) if self.kind == "cone" else a[2]
            lo = np.minimum(a[0], a[1]) - r - m
            hi = np.maximum(a[0], a[1]) + r + m
            return lo, hi
        if self.kind == "ell":
            r = float(np.max(a[1]))
            return a[0] - r - m, a[0] + r + m
        if self.kind == "box":
            r = float(np.linalg.norm(a[1]))
            return a[0] - r - m, a[0] + r + m
        if self.kind == "torus":
            r = a[1] + a[2]
            return a[0] - r - m, a[0] + r + m
        raise ValueError(self.kind)


def v3(x):
    return np.asarray(x, dtype=np.float32)


class Body:
    """骨格（モデル空間: +X 右, +Y 上, -Z 前）と体型パラメータ"""

    def __init__(self, rig, model, body_json):
        self.bones = {b["name"]: i for i, b in enumerate(rig["bones"])}
        self.J = {b["name"]: v3(b["pos"]) for b in rig["bones"]}
        self.T = {b["name"]: v3(b["tip"]) for b in rig["bones"]}
        self.h = rig["height"]
        self.s = self.h / 1.78
        self.m = model
        self.build = model.get("build", "athletic")
        self.female = bool(model.get("female", False))
        bp = {
            "athletic": dict(mus=1.0, fat=0.0, limb=1.0, torso=1.0),
            "slim": dict(mus=0.75, fat=0.0, limb=0.88, torso=0.92),
            "lean": dict(mus=0.9, fat=0.0, limb=0.93, torso=0.95),
            "heavy": dict(mus=1.35, fat=0.35, limb=1.28, torso=1.25),
            "stocky": dict(mus=1.15, fat=0.1, limb=1.08, torso=1.08),
            "old": dict(mus=0.7, fat=0.05, limb=0.88, torso=0.95),
        }[self.build]
        for k2, v in model.get("tweak", {}).items():
            bp[k2] = float(v)
        self.p = bp

    def b(self, name):
        return self.bones[name]

    def j(self, name):
        return self.J[name]

    def t(self, name):
        return self.T[name]


def body_prims(B):
    """裸の体（筋肉の盛り上がりを楕円体で）"""
    s, p = B.s, B.p
    L = p["limb"]
    M = p["mus"]
    F = p["fat"]
    T = p["torso"]
    pr = []
    hips, spine, chest, neck, head = B.j("Hips"), B.j("Spine"), B.j("Chest"), B.j("Neck"), B.j("Head")
    fem = B.female
    # 胴体
    sw = abs(B.j("RightUpperArm")[0]) / (0.185 * s)
    pr.append(Prim("ell", [v3(chest + [0, 0.10 * s, 0.005]), v3([0.150 * s * sw * T, 0.150 * s, 0.105 * s * T])], B.b("Chest"), k=0.04))
    pr.append(Prim("ell", [v3(spine + [0, 0.05 * s, 0.0]), v3([(0.125 + 0.05 * F) * s * T, 0.13 * s, (0.090 + 0.05 * F) * s * T])], B.b("Spine"), k=0.05))
    pr.append(Prim("ell", [v3(hips + [0, -0.02 * s, 0.005]), v3([(0.140 + 0.03 * F + (0.015 if fem else 0)) * s * T, 0.10 * s, 0.095 * s * T])], B.b("Hips"), k=0.045))
    # 胸筋 / 胸
    for sx, nm in ((-1, "Left"), (1, "Right")):
        if fem:
            pr.append(Prim("ell", [v3(chest + [sx * 0.058 * s, 0.075 * s, -0.075 * s]), v3([0.060 * s, 0.058 * s, 0.050 * s])], B.b("Chest"), k=0.03))
        else:
            pr.append(Prim("ell", [v3(chest + [sx * 0.062 * s, 0.10 * s, -0.070 * s]), v3([0.070 * s * M, 0.050 * s, 0.040 * s * M])], B.b("Chest"), k=0.03))
        # 広背筋
        pr.append(Prim("ell", [v3(chest + [sx * 0.10 * s, 0.03 * s, 0.03 * s]), v3([0.055 * s * M, 0.11 * s, 0.065 * s])], B.b("Chest"), k=0.04))
        # 臀部
        pr.append(Prim("ell", [v3(hips + [sx * 0.065 * s, -0.06 * s, 0.055 * s]), v3([0.075 * s * (1 + 0.15 * F), 0.08 * s, 0.065 * s * (1 + 0.2 * F)])], B.b("Hips"), k=0.035))
    # 首・僧帽筋
    pr.append(Prim("cone", [v3(neck - [0, 0.03 * s, 0]), v3(head + [0, 0.02 * s, 0.005]), 0.058 * s * (1 + 0.25 * (M - 1)), 0.050 * s], B.b("Neck"), k=0.03))
    pr.append(Prim("ell", [v3(neck + [0, -0.035 * s, 0.025 * s]), v3([0.12 * s * M * sw, 0.045 * s, 0.05 * s])], B.b("Chest"), k=0.04))
    if F > 0.1:
        pr.append(Prim("ell", [v3(spine + [0, 0.0, -0.05 * s]), v3([0.12 * s, 0.10 * s, 0.08 * s * (1 + F)])], B.b("Spine"), k=0.05))
    # 腕
    for nm in ("Left", "Right"):
        sh, el, wr = B.j(nm + "UpperArm"), B.j(nm + "LowerArm"), B.j(nm + "Hand")
        ua, la = B.b(nm + "UpperArm"), B.b(nm + "LowerArm")
        pr.append(Prim("sphere", [v3(sh + (el - sh) * 0.08 + [0, 0.012 * s, 0]), 0.060 * s * M * L], ua, k=0.035))
        pr.append(Prim("cone", [sh, el, 0.050 * s * L * (0.9 + 0.1 * M), 0.040 * s * L], ua, k=0.02))
        mid = sh + (el - sh) * 0.45
        n = (el - sh) / np.linalg.norm(el - sh)
        R = sdf.frame_from(n)
        pr.append(Prim("ell", [v3(mid + [0, 0, -0.012 * s]), v3([0.038 * s * M * L, 0.10 * s, 0.040 * s * M * L]), R], ua, k=0.02))
        pr.append(Prim("cone", [el, wr, 0.042 * s * L, 0.029 * s * L], la, k=0.02))
        pr.append(Prim("ell", [v3(el + (wr - el) * 0.28), v3([0.042 * s * L * (0.9 + 0.1 * M), 0.08 * s, 0.037 * s * L]), sdf.frame_from((wr - el))], la, k=0.02))
        pr += hand_prims(B, nm)
    # 脚
    for nm in ("Left", "Right"):
        hp, kn, an = B.j(nm + "UpperLeg"), B.j(nm + "LowerLeg"), B.j(nm + "Foot")
        ul, ll = B.b(nm + "UpperLeg"), B.b(nm + "LowerLeg")
        pr.append(Prim("cone", [hp + [0, 0.02 * s, 0], kn, 0.088 * s * L * (1 + 0.15 * F), 0.052 * s * L], ul, k=0.03))
        R = sdf.frame_from(kn - hp)
        pr.append(Prim("ell", [v3(hp + (kn - hp) * 0.38 + [0, 0, -0.02 * s]), v3([0.072 * s * M * L, 0.17 * s, 0.070 * s * L]), R], ul, k=0.03))
        pr.append(Prim("cone", [kn, an, 0.050 * s * L, 0.033 * s * L], ll, k=0.02))
        pr.append(Prim("ell", [v3(kn + (an - kn) * 0.28 + [0, 0, 0.02 * s]), v3([0.048 * s * L * M, 0.10 * s, 0.050 * s * L]), sdf.frame_from(an - kn)], ll, k=0.025))
        pr.append(Prim("sphere", [v3(kn + [0, 0.0, -0.025 * s]), 0.043 * s * L], ul, k=0.02))
        pr += foot_prims(B, nm)
    return pr


def hand_prims(B, nm):
    s = B.s
    hd, fi, th = B.j(nm + "Hand"), B.j(nm + "Fingers"), B.j(nm + "Thumb")
    d = (fi - hd) / np.linalg.norm(fi - hd)
    side = -1.0 if nm == "Left" else 1.0
    a = math.radians(50.0)
    palm_n = v3([-side * math.cos(a), -math.sin(a), 0.0])
    width = np.cross(d, palm_n)
    width /= np.linalg.norm(width)
    if width[2] > 0:
        width = -width  # 幅方向の正を前（-Z）へ
    R = np.stack([width, d, palm_n], axis=1).astype(np.float32)
    hb, fb, tb = B.b(nm + "Hand"), B.b(nm + "Fingers"), B.b(nm + "Thumb")
    pr = [Prim("box", [v3(hd + d * 0.045 * s), v3([0.040 * s, 0.046 * s, 0.017 * s]), 0.012 * s, R], hb, k=0.012)]
    for k, off in enumerate((-0.026, -0.009, 0.008, 0.024)):
        ln = (0.080, 0.088, 0.084, 0.068)[k] * s
        base = fi + width * off * s
        pr.append(Prim("capsule", [v3(base), v3(base + d * ln), 0.0095 * s], fb, k=0.008))
    tt = B.t(nm + "Thumb")
    pr.append(Prim("cone", [th, tt, 0.013 * s, 0.010 * s], tb, k=0.01))
    return pr


def foot_prims(B, nm):
    s = B.s
    an, to = B.j(nm + "Foot"), B.j(nm + "Toes")
    tt = B.t(nm + "Toes")
    fb, tb = B.b(nm + "Foot"), B.b(nm + "Toes")
    d = to - an
    d[1] = 0
    d /= np.linalg.norm(d)
    R = sdf.frame_from(d, (0, 1, 0))
    mid = (an + to) * 0.5
    mid[1] = 0.035 * s
    pr = [Prim("box", [v3(mid), v3([0.042 * s, 0.030 * s, 0.078 * s]), 0.026 * s, R @ np.array([[1, 0, 0], [0, 0, 1], [0, 1, 0]], dtype=np.float32)], fb, k=0.025),
          Prim("sphere", [v3(an + [0, -0.035 * s, 0.03 * s]), 0.040 * s], fb, k=0.025),
          Prim("ell", [v3((to + tt) * 0.5 + [0, -0.005, 0]), v3([0.044 * s, 0.020 * s, 0.040 * s])], tb, k=0.015)]
    return pr


def head_prims(B):
    s = B.s
    hj = B.j("Head")
    hb = B.b("Head")
    face = B.m.get("face", {})
    jaw = float(face.get("jaw", 0.5))
    nose = float(face.get("nose", 0.5))
    brow = float(face.get("brow", 0.5))
    fem = B.female
    old = B.build == "old"
    c = hj + v3([0, 0.105 * s, -0.008 * s])
    pr = [Prim("ell", [v3(c), v3([0.080 * s, 0.108 * s, 0.098 * s])], hb, k=0.02)]
    # 頭蓋の後ろ
    pr.append(Prim("ell", [v3(c + [0, 0.02 * s, 0.025 * s]), v3([0.083 * s, 0.095 * s, 0.085 * s])], hb, k=0.03))
    # 顎
    jw = (0.058 + 0.018 * jaw - (0.01 if fem else 0)) * s
    pr.append(Prim("ell", [v3(hj + [0, 0.035 * s, -0.050 * s]), v3([jw, 0.040 * s, 0.050 * s])], hb, k=0.035))
    pr.append(Prim("ell", [v3(hj + [0, 0.025 * s, -0.085 * s]), v3([0.025 * s, 0.022 * s, 0.020 * s])], hb, k=0.02))
    # 頬骨
    for sx in (-1, 1):
        pr.append(Prim("ell", [v3(c + [sx * 0.050 * s, -0.012 * s, -0.070 * s]), v3([0.025 * s, 0.020 * s, 0.020 * s])], hb, k=0.02))
        # 耳
        pr.append(Prim("ell", [v3(c + [sx * 0.082 * s, -0.005 * s, 0.005 * s]), v3([0.012 * s, 0.030 * s, 0.020 * s])], hb, k=0.01))
    # 眉骨
    pr.append(Prim("ell", [v3(c + [0, 0.028 * s, -0.088 * s]), v3([0.065 * s, (0.012 + 0.008 * brow) * s, 0.016 * s])], hb, k=0.02))
    # 鼻
    nl = (0.035 + 0.012 * nose) * s
    pr.append(Prim("cone", [v3(c + [0, 0.018 * s, -0.096 * s]), v3(c + [0, -0.022 * s, -0.096 * s - nl * 0.6]), 0.008 * s, 0.012 * s], hb, k=0.012))
    # 口元
    pr.append(Prim("ell", [v3(c + [0, -0.052 * s, -0.088 * s]), v3([0.022 * s, 0.009 * s, 0.009 * s])], hb, slot=LIPS, k=0.008, bias=0.0006))
    if old:
        pr.append(Prim("ell", [v3(c + [0, -0.06 * s, -0.08 * s]), v3([0.05 * s, 0.03 * s, 0.03 * s])], hb, k=0.03))
    return pr


EYE_OUT = 0.0040   # 白目の前端を顔の表面からどれだけ前に出すか（m、体格倍率を掛ける）
BROW_OUT = 0.0012  # 眉の前面を眉骨の表面からどれだけ前に出すか


def face_surface_z(B, x, y, z_in):
    """顔の皮膚（頭の SDF だけ。髪は含めない）の表面の z を、(x, y) の位置で内側 z_in から前方（-z）へ探す"""
    prims = head_prims(B)
    zs = np.arange(z_in, z_in - 0.16 * B.s, -0.0002, dtype=np.float32)
    P = np.stack([np.full_like(zs, x), np.full_like(zs, y), zs], axis=1)
    F = np.full(len(zs), 1.0, dtype=np.float32)
    for p in prims:
        F = sdf.smin(F, p.eval(P).astype(np.float32), p.k)
    outside = np.nonzero(F > 0)[0]
    if len(outside) == 0:
        return float(zs[-1])
    return float(zs[outside[0]])


def eye_parts(B):
    """目（白目と黒目）と眉を明示的な小メッシュとして作る（頭ボーン固定）。
    奥行きは顔の表面から決める（表面より奥に置くと皮膚に隠れて見えない）"""
    s = B.s
    hj = B.j("Head")
    c = hj + v3([0, 0.105 * s, -0.008 * s])
    parts = []
    fem = B.female
    for sx in (-1, 1):
        # 白目は横長の楕円で前端だけを顔の表面から出す。黒目は大きめ、上まぶた（肌）で上を覆ってアーモンド形に
        ex, ey = c[0] + sx * 0.032 * s, c[1] + 0.006 * s
        zs = face_surface_z(B, ex, ey, c[2])
        e = v3([ex, ey, zs - EYE_OUT * s + 0.0110 * s])
        parts.append(("ell", e, v3([0.0130 * s, 0.0085 * s, 0.0110 * s]), EYE_WHITE, MT_EYE))
        parts.append(("ell", e + v3([0, 0.0003 * s, -0.0088 * s]), v3([0.0066 * s, 0.0066 * s, 0.0030 * s]), DARK, MT_EYE))
        lid = e + v3([0, 0.0078 * s, -0.0012 * s])
        parts.append(("ell", lid, v3([0.0150 * s, 0.0048 * s if fem else 0.0056 * s, 0.0118 * s]), SKIN, MT_SKIN))
        bx, by = c[0] + sx * 0.034 * s, c[1] + 0.026 * s
        bz = face_surface_z(B, bx, by, c[2])
        bpos = v3([bx, by, bz - BROW_OUT * s + 0.006 * s])
        bw = 0.0028 * s if fem else 0.0040 * s
        parts.append(("box", bpos, v3([0.019 * s, bw, 0.006 * s]), sx * (-0.10 if fem else -0.22), B.m.get("brow_slot", HAIR)))
    # 口の線（唇の合わせ目）
    my = c[1] - 0.052 * s
    mz = face_surface_z(B, c[0], my, c[2])
    parts.append(("box", v3([c[0], my, mz - 0.0005 * s + 0.0015 * s]), v3([0.0115 * s, 0.0009 * s, 0.0015 * s]), 0.0, DARK))
    return parts


def build_prims(B, costume):
    pr = body_prims(B) + head_prims(B)
    pr += outfits.hair(B, costume, Prim, v3)
    pr += outfits.clothes(B, costume, Prim, v3)
    return pr


def evaluate(prims, voxel):
    lo = np.min([p.aabb()[0] for p in prims], axis=0) - 0.02
    hi = np.max([p.aabb()[1] for p in prims], axis=0) + 0.02
    shape = np.ceil((hi - lo) / voxel).astype(int) + 1
    print(f"  grid {shape} = {np.prod(shape)/1e6:.1f}M voxels")
    F = np.full(shape, 1.0, dtype=np.float32)
    for p in prims:
        a, b = p.aabb()
        i0 = np.clip(np.floor((a - lo) / voxel).astype(int), 0, shape - 1)
        i1 = np.clip(np.ceil((b - lo) / voxel).astype(int) + 1, 0, shape)
        xs = lo[0] + np.arange(i0[0], i1[0]) * voxel
        ys = lo[1] + np.arange(i0[1], i1[1]) * voxel
        zs = lo[2] + np.arange(i0[2], i1[2]) * voxel
        P = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), axis=-1).astype(np.float32)
        d = p.eval(P.reshape(-1, 3)).reshape(P.shape[:3]).astype(np.float32)
        sl = (slice(i0[0], i1[0]), slice(i0[1], i1[1]), slice(i0[2], i1[2]))
        F[sl] = sdf.smin(F[sl], d, p.k)
    return F, lo


def eval_all(prims, V):
    D = np.empty((len(prims), V.shape[0]), dtype=np.float32)
    for i, p in enumerate(prims):
        D[i] = p.eval(V)
    return D


def skin_weights(prims, D, n_bones):
    """頂点ごとのボーンウェイト（上位4つ）"""
    nv = D.shape[1]
    W = np.zeros((nv, n_bones), dtype=np.float32)
    body_idx = [i for i, p in enumerate(prims) if not p.own_bone and p.layer == "body"]
    Db = D[body_idx]
    dmin = np.min(Db, axis=0)
    for row, i in enumerate(body_idx):
        w = np.exp(-np.maximum(Db[row] - dmin, 0) / 0.010)
        W[:, prims[i].bone] += w
    # 自前ボーンの部品（髪・帯の端など）が最も近い頂点はそのボーンに
    own_idx = [i for i, p in enumerate(prims) if p.own_bone]
    if own_idx:
        Do = D[own_idx]
        dmin_all = np.min(D, axis=0)
        best_own = np.argmin(Do, axis=0)
        own_d = Do[best_own, np.arange(nv)]
        mask = own_d <= dmin_all + 0.004
        for row, i in enumerate(own_idx):
            sel = mask & (best_own == row)
            W[sel] = 0
            W[sel, prims[i].bone] = 1.0
    order = np.argsort(-W, axis=1)[:, :4]
    top = np.take_along_axis(W, order, axis=1)
    top /= np.maximum(top.sum(axis=1, keepdims=True), 1e-8)
    top[top < 0.02] = 0
    top /= np.maximum(top.sum(axis=1, keepdims=True), 1e-8)
    return order.astype(np.uint8), top.astype(np.float32)


def sample_field(F, lo, voxel, V):
    idx = ((V - lo) / voxel).T
    return ndimage.map_coordinates(F, idx, order=1, mode="nearest")


def field_normals(F, lo, voxel, V):
    e = voxel
    out = np.zeros_like(V)
    for ax in range(3):
        o = np.zeros(3, dtype=np.float32)
        o[ax] = e
        out[:, ax] = sample_field(F, lo, voxel, V + o) - sample_field(F, lo, voxel, V - o)
    n = np.linalg.norm(out, axis=1, keepdims=True)
    return out / np.maximum(n, 1e-8)


def explicit_mesh(parts, head_bone):
    """目・眉などの小部品（UV球・箱）を三角形メッシュに"""
    verts, norms, faces, slots, mts = [], [], [], [], []
    base = 0
    for part in parts:
        if part[0] in ("sphere", "ell"):
            _, c, r, slot, mt = part
            r = np.array([r, r, r]) if part[0] == "sphere" else np.asarray(r)
            nu, nv = 10, 8
            for i in range(nv + 1):
                th = math.pi * i / nv
                for j in range(nu):
                    ph = 2 * math.pi * j / nu
                    n = np.array([math.sin(th) * math.cos(ph), math.cos(th), math.sin(th) * math.sin(ph)])
                    verts.append(c + n * r)
                    nn = n / r
                    norms.append(nn / np.linalg.norm(nn))
                    slots.append(slot)
                    mts.append(mt)
            for i in range(nv):
                for j in range(nu):
                    a = base + i * nu + j
                    b = base + i * nu + (j + 1) % nu
                    c2 = base + (i + 1) * nu + j
                    d = base + (i + 1) * nu + (j + 1) % nu
                    faces.append([a, c2, b])
                    faces.append([b, c2, d])
            base += (nv + 1) * nu
        else:
            _, c, half, tilt, slot = part
            ct, st = math.cos(tilt), math.sin(tilt)
            Rz = np.array([[ct, -st, 0], [st, ct, 0], [0, 0, 1]])
            for ax in range(3):
                for sg in (1, -1):
                    n = np.zeros(3)
                    n[ax] = sg
                    u, w = (ax + 1) % 3, (ax + 2) % 3
                    eu = np.zeros(3)
                    eu[u] = 1
                    ew = np.zeros(3)
                    ew[w] = 1
                    quad = [n * half[ax] + eu * half[u] * a1 + ew * half[w] * b1
                            for (a1, b1) in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
                    if np.dot(np.cross(quad[1] - quad[0], quad[2] - quad[0]), n) < 0:
                        quad = quad[::-1]
                    for q in quad:
                        verts.append(c + Rz @ q)
                        norms.append(Rz @ n)
                        slots.append(slot)
                        mts.append(MT_HAIR)
                    faces.append([base, base + 1, base + 2])
                    faces.append([base, base + 2, base + 3])
                    base += 4
    V = np.array(verts, dtype=np.float32)
    N = np.array(norms, dtype=np.float32)
    Fc = np.array(faces, dtype=np.uint32)
    return V, N, Fc, np.array(slots), np.array(mts)


def generate(cid, costume_id):
    t0 = time.time()
    rig = json.loads((ROOT / f"data/baked/{cid}.rig.json").read_text())
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    model = dict(cj.get("model", {}))
    costume = dict(model)
    for c in cj.get("costumes", []):
        if c.get("id") == costume_id:
            costume.update(c.get("model", {}))
    B = Body(rig, model, cj.get("body", {}))
    prims = build_prims(B, costume)
    print(f"{cid}/{costume_id}: {len(prims)} primitives")
    F, lo = evaluate(prims, VOXEL)
    verts, faces, _n, _v = measure.marching_cubes(F, level=0.0, spacing=(VOXEL,) * 3)
    verts = verts + lo
    faces = faces[:, ::-1]  # 外向きの巻き順へ
    print(f"  marching cubes: {len(verts)} verts {len(faces)} tris")
    ratio = 1.0 - TARGET_TRIS / max(len(faces), 1)
    verts, faces = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), target_reduction=max(0.0, ratio))
    print(f"  simplified: {len(verts)} verts {len(faces)} tris")
    verts = verts.astype(np.float32)
    normals = field_normals(F, lo, VOXEL, verts)
    D = eval_all(prims, verts)
    bias = np.array([p.bias for p in prims], dtype=np.float32)[:, None]
    best = np.argmin(D - bias, axis=0)
    slots = np.array([prims[i].slot for i in best])
    mtypes = np.array([prims[i].mtype for i in best], dtype=np.float32)
    # SDF による簡易 AO（法線方向にずらした距離）
    ao_d = sample_field(F, lo, VOXEL, verts + normals * 0.02)
    ao = np.clip(ao_d / 0.02, 0.35, 1.0)
    joints, weights = skin_weights(prims, D, len(rig["bones"]))
    # 目・眉
    ev, en, ef, es, em = explicit_mesh(eye_parts(B), B.b("Head"))
    nb = len(verts)
    verts = np.concatenate([verts, ev])
    normals = np.concatenate([normals, en])
    faces = np.concatenate([faces.astype(np.uint32), ef + nb])
    slots = np.concatenate([slots, es])
    mtypes = np.concatenate([mtypes, em])
    ao = np.concatenate([ao, np.ones(len(ev), dtype=np.float32)])
    # 巻き順を法線（外向き）に合わせる: glTF の表面は反時計回り。面ごとに頂点法線と比べて裏返す
    fv = verts[faces]
    fn = np.cross(fv[:, 1] - fv[:, 0], fv[:, 2] - fv[:, 0])
    vn = normals[faces].sum(axis=1)
    flip = (fn * vn).sum(axis=1) < 0
    faces[flip] = faces[flip][:, ::-1]
    print(f"  winding: flipped {int(flip.sum())} / {len(faces)} faces")
    hj = np.zeros((len(ev), 4), dtype=np.uint8)
    hj[:, 0] = B.b("Head")
    hw = np.zeros((len(ev), 4), dtype=np.float32)
    hw[:, 0] = 1.0
    joints = np.concatenate([joints, hj])
    weights = np.concatenate([weights, hw])
    colors = np.stack([(slots.astype(np.float32) + 0.5) / 16.0, mtypes, ao, np.ones(len(verts))], axis=1).astype(np.float32)
    out = ROOT / f"assets/characters/{cid}/{cid}_{costume_id}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    write_glb(out, rig, verts, normals, faces, colors, joints, weights)
    print(f"  wrote {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB) in {time.time() - t0:.1f}s")


def main():
    cid = sys.argv[1]
    cj = json.loads((ROOT / f"data/characters/{cid}/character.json").read_text())
    costumes = sys.argv[2:] or [c["id"] for c in cj.get("costumes", [{"id": "a"}])]
    for c in costumes:
        generate(cid, c)


if __name__ == "__main__":
    main()
