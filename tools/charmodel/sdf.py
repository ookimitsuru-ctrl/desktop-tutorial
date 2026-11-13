"""SDF（符号付き距離関数）の基本形状と演算。numpy でベクトル化。

全て float32 の配列 P[..., 3] を受け取り、距離 [...] を返す。
"""
import numpy as np


def _dot(a, b):
    return np.sum(a * b, axis=-1)


def length(v):
    return np.sqrt(np.sum(v * v, axis=-1))


def sd_sphere(P, c, r):
    return length(P - c) - r


def sd_round_cone(P, a, b, r1, r2):
    """a→b の丸い円錐（半径 r1→r2）。Inigo Quilez の式。"""
    ba = b - a
    l2 = float(np.dot(ba, ba))
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = _dot(pa, ba)
    z = y - l2
    xv = pa * l2 - np.multiply.outer(y, ba)
    x2 = _dot(xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    res = np.empty_like(y)
    m1 = np.sign(z) * a2 * z2 > k
    m2 = (~m1) & (np.sign(y) * a2 * y2 < k)
    m3 = ~(m1 | m2)
    res[m1] = np.sqrt(x2[m1] + z2[m1]) * il2 - r2
    res[m2] = np.sqrt(x2[m2] + y2[m2]) * il2 - r1
    res[m3] = (np.sqrt(x2[m3] * a2 * il2) + y[m3] * rr) * il2 - r1
    return res


def sd_capsule(P, a, b, r):
    pa = P - a
    ba = b - a
    h = np.clip(_dot(pa, ba) / float(np.dot(ba, ba)), 0.0, 1.0)
    return length(pa - np.multiply.outer(h, ba)) - r


def sd_ellipsoid(P, c, radii, R=None):
    """楕円体（近似距離）。R は列ベクトルが局所軸の回転行列。"""
    q = P - c
    if R is not None:
        q = q @ R
    k0 = length(q / radii)
    k1 = length(q / (radii * radii))
    return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


def sd_round_box(P, c, half, r, R=None):
    q = P - c
    if R is not None:
        q = q @ R
    d = np.abs(q) - (half - r)
    out = length(np.maximum(d, 0.0)) + np.minimum(np.max(d, axis=-1), 0.0) - r
    return out


def sd_torus(P, c, R_major, r_minor, R=None):
    """xz 平面のトーラス（R で向きを変える）"""
    q = P - c
    if R is not None:
        q = q @ R
    xz = np.sqrt(q[..., 0] ** 2 + q[..., 2] ** 2) - R_major
    return np.sqrt(xz * xz + q[..., 1] ** 2) - r_minor


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def frame_from(direction, up_hint=(0.0, 0.0, -1.0)):
    """direction を y 軸とする回転行列（列が局所軸 x, y, z）"""
    y = np.asarray(direction, dtype=np.float64)
    y = y / (np.linalg.norm(y) + 1e-12)
    u = np.asarray(up_hint, dtype=np.float64)
    if abs(np.dot(u, y)) > 0.95:
        u = np.array([1.0, 0.0, 0.0])
    x = np.cross(y, u)
    x /= np.linalg.norm(x) + 1e-12
    z = np.cross(x, y)
    return np.stack([x, y, z], axis=1).astype(np.float32)
