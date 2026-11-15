#!/usr/bin/env python3
"""富士スピードウェイのコースデータ生成 (コース図の画像から)

  python3 tools/build-fuji.py <コース図.png>        → src/data/fuji.js
  必要: numpy, pillow, scipy, scikit-image

手順:
  1. コース図の青い線 (本コース) を抽出して細線化し、走行順に並べる (細いピットレーンは除く)
  2. 全長 4,563m に合わせる
  3. 図に書かれたコーナー半径に合うよう各コーナーの曲率の山を均す (旋回角は図のまま)。
     生じた閉合誤差は距離に比例して全体へ配り、全長を合わせ直す
  4. 標高グラフ (緑の領域の上端) を読み取る
"""
import sys, json, numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

LENGTH = 4563.0
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else 'src/data/fuji.js'
a = np.asarray(Image.open(src).convert('RGB')).astype(int)
r, g, b = a[..., 0], a[..., 1], a[..., 2]

# ---------------------------------------------------------------- 1. 線の抽出
blue = (b > 100) & (b - r > 50) & (g < 130) & (r < 80)
blue[430:, :] = False
dist = ndi.distance_transform_edt(blue)
ys, xs = np.nonzero(skeletonize(blue))
keep = dist[ys, xs] >= 2.4                      # 太い線 = 本コース
pts = np.stack([xs[keep], ys[keep]], 1).astype(float)
start = np.argmin(np.hypot(pts[:, 0] - 390, pts[:, 1] - 40))   # START の印の位置
used = np.zeros(len(pts), bool); order = [start]; used[start] = True; cur = start; first = True
while True:
    dd = np.hypot(pts[:, 0] - pts[cur, 0], pts[:, 1] - pts[cur, 1]); dd[used] = 1e9
    if first: dd[pts[:, 0] < pts[cur, 0]] = 1e9; first = False      # 最初は右 (時計回り) へ
    j = np.argmin(dd)
    if dd[j] > 12: break
    order.append(j); used[j] = True; cur = j
P = pts[order]
# メインストレートは直線に置き換える (ピットレーン合流部の乱れを除く)
top = (P[:, 1] < 58) & (P[:, 0] > 40) & (P[:, 0] < 672)
good = top & (P[:, 1] < 41) & ((P[:, 0] < 290) | (P[:, 0] > 600))
k, c = np.polyfit(P[good, 0], P[good, 1], 1)
Q = P[~top]
head = np.arange(390, 672, 2.0); tail = np.arange(40, 390, 2.0)
Lp = np.vstack([np.stack([head, k * head + c], 1), Q, np.stack([tail, k * tail + c], 1)])

def resample(L, n):
    Lc = np.vstack([L, L[:1]]); seg = np.hypot(np.diff(Lc[:, 0]), np.diff(Lc[:, 1])); cum = np.concatenate([[0], np.cumsum(seg)])
    t = np.arange(n) * cum[-1] / n
    return np.stack([np.interp(t, cum, Lc[:, 0]), np.interp(t, cum, Lc[:, 1])], 1), cum[-1]
def smooth(R, w, passes):
    for _ in range(passes):
        ker = np.ones(2 * w + 1) / (2 * w + 1); ext = np.vstack([R[-w:], R, R[:w]])
        R = np.stack([np.convolve(ext[:, 0], ker, 'valid'), np.convolve(ext[:, 1], ker, 'valid')], 1)
    return R

# ---------------------------------------------------------------- 2. 全長合わせ
N = int(round(LENGTH / 2))
M, _ = resample(Lp, N); M = smooth(M, 4, 2); M, tot = resample(M, N); M *= LENGTH / tot
ds = LENGTH / N
d = np.roll(M, -1, 0) - M
theta = np.unwrap(np.arctan2(d[:, 1], d[:, 0]))               # 各区間の方位
dth = np.diff(np.concatenate([theta, [theta[0] + 2 * np.pi]]))  # 区間ごとの旋回量

# ---------------------------------------------------------------- 3. 半径の補正
# (名前, 開始s, 終了s, 図の半径)。s は補正前の距離 [m]
CORNERS = [('TGR', 672, 759, 27), ('coca', 1225, 1338, 80), ('100R-a', 1411, 1584, 105), ('100R-b', 1587, 1674, 100), ('100R-c', 1690, 1810, 95),
           ('advan', 1939, 2104, 30), ('165R', 2236, 2299, 165), ('230R', 2734, 2762, 230), ('dunlop-b', 2833, 2908, 30),
           ('13', 3047, 3164, 45), ('85R', 3200, 3298, 85), ('lexus', 3303, 3435, 25), ('panasonic', 3493, 3710, 33),
           ('75R', 832, 907, 75), ('178R', 1359, 1399, 178), ('120R', 2457, 2504, 120), ('dunlop-a', 2776, 2830, 15), ('60R', 2913, 2993, 60)]
kap = dth / ds
kk = np.convolve(np.concatenate([kap[-2:], kap, kap[:2]]), np.ones(5) / 5, 'valid')   # 10m 平均
mult = np.ones(N); iscorner = np.zeros(N, bool)
# 各コーナーの曲率の山を 1/R で頭打ちにし、削ったぶんの旋回量を同じコーナーの前後へ配り直す (旋回角は保つ)。
# 各コーナーが使える区間は、隣のコーナーとの中間点まで (互いに重ならない)。
CS = sorted(CORNERS, key=lambda t: t[1])
for q, (name, s0, s1, R) in enumerate(CS):
    lo_s = (CS[q - 1][2] + s0) / 2 if q > 0 else s0 - 60
    hi_s = (s1 + CS[q + 1][1]) / 2 if q + 1 < len(CS) else s1 + 60
    j0, j1 = int(s0 / ds), int(s1 / ds)
    sg = np.sign(dth[j0:j1].sum()); cap = 1.0 / R
    need = abs(dth[j0:j1].sum()) / ds / cap                        # この半径で回り切るのに必要な点数
    ext = int(max(4, min(40, (need * 1.15 - (j1 - j0)) / 2 + 4)))   # 足りないぶんだけ前後に広げる
    i0, i1 = max(int(lo_s / ds), j0 - ext), min(int(hi_s / ds), j1 + ext)
    v = sg * dth[i0:i1] / ds
    adj = v > -1e-4                           # 逆向きに曲がっている点は触らない
    target = v[adj].sum()
    cap_eff = max(cap, target / (0.97 * adj.sum()))   # 区間が足りない時は、収まる範囲でいちばん大きい半径にする
    if v[adj].max() > cap_eff:
        lo, hi = 0.0, cap_eff
        for _ in range(60):
            c = (lo + hi) / 2
            if np.minimum(v[adj] + c, cap_eff).sum() < target: lo = c
            else: hi = c
        v2 = v.copy(); v2[adj] = np.minimum(v[adj] + hi, cap_eff)
        v2[adj] *= target / v2[adj].sum()     # 旋回角を厳密に保つ
        dth[i0:i1] = sg * v2 * ds
    iscorner[i0:i1] = True
theta = theta[0] + np.concatenate([[0], np.cumsum(dth)[:-1]])
# 半径を直したぶん 1周が閉じなくなるので、閉合誤差を距離に比例して全体へ配る (測量のコンパス法則)。その後、全長を合わせ直す
cx, sx = np.cos(theta) * ds, np.sin(theta) * ds
X = np.concatenate([[[0, 0]], np.cumsum(np.stack([cx, sx], 1), 0)])
err = X[-1].copy(); print('補正前の閉合誤差 [m]:', np.round(err, 1), ' 旋回角の合計:', round(float(np.degrees(dth.sum())), 2))
X = X - np.outer(np.arange(N + 1) / N, err)
print('閉合誤差 [m]:', np.round(X[-1], 4))
X = X[:-1]
F, tot = resample(X, int(round(LENGTH / 5)))           # 5m 間隔
F = smooth(F, 1, 1); F, tot = resample(F, len(F)); F *= LENGTH / tot
F -= F[0]

# 検証: 図の半径との比較
def minR(F, s0f, s1f):
    n = len(F); dsf = LENGTH / n; dd = np.roll(F, -1, 0) - F; th = np.unwrap(np.arctan2(dd[:, 1], dd[:, 0]))
    kq = np.diff(np.concatenate([th, [th[0] + 2 * np.pi]])) / dsf
    kq = np.convolve(np.concatenate([kq[-1:], kq, kq[:1]]), np.ones(3) / 3, 'valid')
    return kq
kq = minR(F, 0, 0)
cum_old = np.arange(N) * ds; cum_new = cum_old * 1.0
report = []
for name, s0, s1, R in CORNERS:
    n0, n1 = np.interp([s0, s1], cum_old, cum_new); i0, i1 = int(n0 / 5), max(int(n1 / 5) + 1, int(n0 / 5) + 3)
    report.append((name, R, 1 / np.abs(kq[i0:i1]).max(), n0, n1))
for name, R, got, n0, n1 in sorted(report, key=lambda t: t[3]): print('  %-14s 図 %4dR → データ %5.0fR   s=%4.0f〜%4.0f' % (name, R, got, n0, n1))
print('スタート→1コーナー入口: %.0f m' % np.interp(672, cum_old, cum_new), ' メインストレート長: %.0f m' % (np.interp(672, cum_old, cum_new) + LENGTH - np.interp(3710, cum_old, cum_new)))
secs = {name: [round(float(v)) for v in np.interp([s0, s1], cum_old, cum_new)] for name, s0, s1, R in CORNERS}

# ---------------------------------------------------------------- 4. 標高
green = (g > 140) & (g - r > 30) & (g - b > 30)
X0, KM = 82.0, (693.0 - 82.0) / 4.5            # 距離軸: 0.0km の位置と 1km あたりのピクセル
Y590, PXM = 472.0, (593.0 - 472.0) / 60.0      # 標高軸: 590m の位置と 1m あたりのピクセル
elev = []
for x in range(int(X0) + 1, min(a.shape[1] - 2, int(X0 + KM * LENGTH / 1000))):
    col = np.nonzero(green[455:612, x])[0]
    if len(col) == 0: continue
    elev.append(((x - X0) / KM * 1000, 590 - (455 + col[0] - Y590) / PXM))
elev = np.array(elev)
z = ndi.median_filter(elev[:, 1], 9, mode='nearest'); z = ndi.uniform_filter1d(z, 9, mode='nearest')
keys = [[int(s), round(float(np.interp(s, elev[:, 0], z)), 1)] for s in range(0, int(LENGTH), 60)]
print('標高 最小 %.1f / 最大 %.1f m (差 %.1f m)' % (z.min(), z.max(), z.max() - z.min()))

# ---------------------------------------------------------------- 出力
# 幅員: 全幅 15〜25m。メインストレートは 25m、その他は 15m
n = len(F); pts_out = []
s1c = np.interp(672, cum_old, cum_new); s_pan = np.interp(3710, cum_old, cum_new)
for i in range(n):
    s = i * LENGTH / n
    t = min(max((s1c - 60 - s) / 120, 0), 1) if s < LENGTH / 2 else min(max((s - s_pan - 20) / 120, 0), 1)
    t = t * t * (3 - 2 * t); hw = 7.5 + 5.0 * t
    pts_out.append([round(float(F[i, 0]), 2), round(float(F[i, 1]), 2), round(hw, 2), round(hw, 2)])
js = """// 富士スピードウェイ コース中心線データ (自動生成: tools/build-fuji.py)
// 出典: 提供されたコース図 (画像) の線を読み取り、図に記載のコーナー半径・全長・標高グラフに合わせて補正したもの。
//       測量データではないため、形状は近似です。
// 形式: [x, y, 右側幅, 左側幅] 単位m。x=東, y=南(画面下向き)。点間隔 約5m、時計回り、先頭がコントロールライン。
export const FUJI_LENGTH = %d;
export const FUJI_POINTS = %s;
// 標高 [距離m, 標高m] (標高グラフから読み取り)
export const FUJI_ELEVATION = %s;
// コーナー区間の距離 [開始m, 終了m]
export const FUJI_CORNERS = %s;
""" % (LENGTH, json.dumps(pts_out, separators=(',', ':')), json.dumps(keys, separators=(',', ':')), json.dumps(secs, separators=(',', ':'), ensure_ascii=False))
open(out, 'w', encoding='utf8').write(js)
print('written', out, len(pts_out), 'points')
