// レーシングライン(最小曲率ライン)の事前計算
//   node tools/build-line.mjs   → src/data/raceline.js
// コース幅の範囲内で ∫κ²ds を最小化する横オフセット d(s) を、勾配射影 + 共役勾配法で解く。
import fs from 'fs';
import { buildTrack } from '../src/track.js';
const T = buildTrack();
const N = T.N;
const lo = new Float64Array(N), hi = new Float64Array(N);
for (let i = 0; i < N; i++) {
  lo[i] = -(T.wl[i] - 1.25) - (T.kerbL[i] ? 0.55 : 0);
  hi[i] = (T.wr[i] - 1.25) + (T.kerbR[i] ? 0.55 : 0);
}
const W = i => ((i % N) + N) % N;
const d = new Float64Array(N);
const w = new Float64Array(N).fill(1);
const EPS_SHORT = 0.004; // 最短経路項の重み (曲率が同程度なら短い方を選ぶ)
const RHO = 50;          // 制約ペナルティ
const active = new Int8Array(N); // (未使用: 常に0)
const cx = new Float64Array(N), cy = new Float64Array(N); // 中心線の2階差分
const fx = new Float64Array(N), fy = new Float64Array(N); // 中心線の1階差分
for (let i = 0; i < N; i++) {
  const a = W(i - 1), b = W(i + 1);
  cx[i] = T.x[a] - 2 * T.x[i] + T.x[b]; cy[i] = T.y[a] - 2 * T.y[i] + T.y[b];
  fx[i] = T.x[b] - T.x[i]; fy[i] = T.y[b] - T.y[i];
}
const rx = new Float64Array(N), ry = new Float64Array(N), gx = new Float64Array(N), gy = new Float64Array(N);
// A*v (c を含めるかどうかを withC で切替)。戻り値 out = 勾配/2
function apply(v, out, withC) {
  for (let i = 0; i < N; i++) {
    const a = W(i - 1), b = W(i + 1);
    rx[i] = (withC ? cx[i] : 0) + T.nx[a] * v[a] - 2 * T.nx[i] * v[i] + T.nx[b] * v[b];
    ry[i] = (withC ? cy[i] : 0) + T.ny[a] * v[a] - 2 * T.ny[i] * v[i] + T.ny[b] * v[b];
    gx[i] = (withC ? fx[i] : 0) + T.nx[b] * v[b] - T.nx[i] * v[i];
    gy[i] = (withC ? fy[i] : 0) + T.ny[b] * v[b] - T.ny[i] * v[i];
  }
  for (let j = 0; j < N; j++) {
    const a = W(j - 1), b = W(j + 1);
    const sx = w[b] * rx[b] - 2 * w[j] * rx[j] + w[a] * rx[a], sy = w[b] * ry[b] - 2 * w[j] * ry[j] + w[a] * ry[a];
    const tx = gx[a] - gx[j], ty = gy[a] - gy[j];
    out[j] = T.nx[j] * (sx + EPS_SHORT * tx) + T.ny[j] * (sy + EPS_SHORT * ty);
  }
}
// 勾配射影 + 部分空間CG (GPCG 風):
//  境界に張り付いていて外向きに押されている変数を固定し、残りの自由変数について CG で解いて射影する。
const diag = new Float64Array(N);
const fixed = new Uint8Array(N);
const g = new Float64Array(N);
function energy(v) {
  let e = 0;
  for (let i = 0; i < N; i++) {
    const a = W(i - 1), b = W(i + 1);
    const ex = cx[i] + T.nx[a] * v[a] - 2 * T.nx[i] * v[i] + T.nx[b] * v[b], ey = cy[i] + T.ny[a] * v[a] - 2 * T.ny[i] * v[i] + T.ny[b] * v[b];
    const qx = fx[i] + T.nx[b] * v[b] - T.nx[i] * v[i], qy = fy[i] + T.ny[b] * v[b] - T.ny[i] * v[i];
    e += w[i] * (ex * ex + ey * ey) + EPS_SHORT * (qx * qx + qy * qy);
  }
  return e;
}
function reweight() {
  for (let i = 0; i < N; i++) {
    const a = W(i - 1), b = W(i + 1);
    const pxa = T.x[a] + T.nx[a] * d[a], pya = T.y[a] + T.ny[a] * d[a], pxi = T.x[i] + T.nx[i] * d[i], pyi = T.y[i] + T.ny[i] * d[i], pxb = T.x[b] + T.nx[b] * d[b], pyb = T.y[b] + T.ny[b] * d[b];
    const h = (Math.hypot(pxi - pxa, pyi - pya) + Math.hypot(pxb - pxi, pyb - pyi)) / 2 / T.ds;
    w[i] = 1 / (h * h * h);
  }
}
const ITERS = Number(process.argv[2] || 400);
const x = new Float64Array(N), r = new Float64Array(N), zz = new Float64Array(N), p = new Float64Array(N), Ap = new Float64Array(N), trial = new Float64Array(N);
let stall = 0;
for (let k = 0; k < ITERS; k++) {
  if (k % 25 === 0) reweight();
  apply(d, g, true);
  let nfix = 0, gfree = 0;
  for (let i = 0; i < N; i++) {
    fixed[i] = (d[i] <= lo[i] + 1e-9 && g[i] > 0) || (d[i] >= hi[i] - 1e-9 && g[i] < 0) ? 1 : 0;
    if (fixed[i]) nfix++; else gfree = Math.max(gfree, Math.abs(g[i]));
  }
  // 自由変数について A x = -g
  for (let j = 0; j < N; j++) diag[j] = w[W(j + 1)] + 4 * w[j] + w[W(j - 1)] + 2 * EPS_SHORT;
  let rz = 0;
  for (let i = 0; i < N; i++) { x[i] = 0; r[i] = fixed[i] ? 0 : -g[i]; zz[i] = r[i] / diag[i]; p[i] = zz[i]; rz += r[i] * zz[i]; }
  const rz0 = rz; let it = 0;
  for (; it < 600 && rz > rz0 * 1e-10 && rz > 1e-22; it++) {
    apply(p, Ap, false);
    let pAp = 0; for (let i = 0; i < N; i++) { if (fixed[i]) Ap[i] = 0; pAp += p[i] * Ap[i]; }
    const al = rz / pAp; let rz2 = 0;
    for (let i = 0; i < N; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; zz[i] = r[i] / diag[i]; rz2 += r[i] * zz[i]; }
    const be = rz2 / rz; rz = rz2;
    for (let i = 0; i < N; i++) p[i] = fixed[i] ? 0 : zz[i] + be * p[i];
  }
  // 射影つき直線探索
  const e0 = energy(d); let al = 1, e1 = e0, moved = 0;
  for (let ls = 0; ls < 12; ls++) {
    for (let i = 0; i < N; i++) trial[i] = Math.min(hi[i], Math.max(lo[i], d[i] + al * x[i]));
    e1 = energy(trial);
    if (e1 < e0) break;
    al *= 0.5;
  }
  if (e1 < e0) { for (let i = 0; i < N; i++) { moved = Math.max(moved, Math.abs(trial[i] - d[i])); d[i] = trial[i]; } }
  if (k % 20 === 0 || moved < 1e-5) console.log('iter', k, 'cg', it, 'fixed', nfix, 'gfree', gfree.toExponential(2), 'alpha', al, 'E', e1.toFixed(6), 'moved', moved.toExponential(2));
  if (moved < 1e-5) { if (++stall > 2 && k % 25 !== 0) break; } else stall = 0;
}
const off = Array.from(d, (v, i) => Math.round(Math.min(hi[i], Math.max(lo[i], v)) * 100) / 100);
fs.writeFileSync(new URL('../src/data/raceline.js', import.meta.url),
  `// レーシングライン: コース中心線からの横オフセット[m] (右+)。tools/build-line.mjs による自動生成。\nexport const RACELINE_N = ${N};\nexport const RACELINE_OFF = ${JSON.stringify(off)};\n`);
console.log('written', off.length);
