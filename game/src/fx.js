// エフェクト: 火花・ワイヤー破片(シャッター)・衝撃波・スコアポップ
import { G } from './state.js';
import { rand, TAU, clamp, sat } from './util.js';
import { drawText } from './font.js';

const MAXP = 1400, MAXD = 900;
// 粒子 (SoA)
const P = { n: 0, x: new Float32Array(MAXP), y: new Float32Array(MAXP), z: new Float32Array(MAXP), vx: new Float32Array(MAXP), vy: new Float32Array(MAXP), vz: new Float32Array(MAXP), life: new Float32Array(MAXP), max: new Float32Array(MAXP), r: new Float32Array(MAXP), g: new Float32Array(MAXP), b: new Float32Array(MAXP), len: new Float32Array(MAXP), drag: new Float32Array(MAXP) };
// 破片
const D = { n: 0, x: new Float32Array(MAXD), y: new Float32Array(MAXD), z: new Float32Array(MAXD), ax: new Float32Array(MAXD), ay: new Float32Array(MAXD), az: new Float32Array(MAXD), vx: new Float32Array(MAXD), vy: new Float32Array(MAXD), vz: new Float32Array(MAXD), wx: new Float32Array(MAXD), wy: new Float32Array(MAXD), wz: new Float32Array(MAXD), life: new Float32Array(MAXD), max: new Float32Array(MAXD), r: new Float32Array(MAXD), g: new Float32Array(MAXD), b: new Float32Array(MAXD) };
const rings = [];
const pops = [];

export function clearFx() { P.n = 0; D.n = 0; rings.length = 0; pops.length = 0; }

export function spark(x, y, z, vx, vy, vz, life, r, g, b, len = 0.05, drag = 1.2) {
  if (P.n >= MAXP) return;
  const i = P.n++;
  P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
  P.life[i] = life; P.max[i] = life; P.r[i] = r; P.g[i] = g; P.b[i] = b; P.len[i] = len; P.drag[i] = drag;
}

export function burst(x, y, z, n, speed, col, life = 0.7, ivx = 0, ivy = 0, ivz = 0) {
  for (let i = 0; i < n; i++) {
    // 球面上の一様分布
    const u = rand(-1, 1), a = rand(0, TAU), s = Math.sqrt(1 - u * u);
    const sp = speed * (0.25 + Math.random() * 0.9);
    spark(x, y, z, ivx + s * Math.cos(a) * sp, ivy + u * sp, ivz + s * Math.sin(a) * sp, life * (0.5 + Math.random() * 0.8), col[0], col[1], col[2], 0.05 + Math.random() * 0.04);
  }
}

export function ring(x, y, z, maxR, life, col, w = 2.5, plane = 0) {
  rings.push({ x, y, z, r: 0, maxR, life, max: life, col, w, plane });
}

export function popup(x, y, z, text, col, size = 0.07, life = 1.1) {
  if (pops.length > 40) pops.shift();
  pops.push({ x, y, z, text, col, size, life, max: life });
}

function rotEuler(yaw, pitch, roll, m) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cx = Math.cos(pitch), sx = Math.sin(pitch), cz = Math.cos(roll), sz = Math.sin(roll);
  const p00 = cz, p01 = -sz, p02 = 0, p10 = cx * sz, p11 = cx * cz, p12 = -sx, p20 = sx * sz, p21 = sx * cz, p22 = cx;
  m[0] = cy * p00 + sy * p20; m[1] = cy * p01 + sy * p21; m[2] = cy * p02 + sy * p22;
  m[3] = p10; m[4] = p11; m[5] = p12;
  m[6] = -sy * p00 + cy * p20; m[7] = -sy * p01 + cy * p21; m[8] = -sy * p02 + cy * p22;
}
const _m = new Float32Array(9);

// メッシュを辺ごとに分解して飛び散らせる (ワイヤーフレームならではの破壊表現)
export function shatter(mesh, x, y, z, yaw, pitch, roll, s, col, speed = 14, ivx = 0, ivy = 0, ivz = 0, life = 1.6, maxPieces = 60, mask = null) {
  rotEuler(yaw, pitch, roll, _m);
  const v = mesh.v, e = mesh.e;
  const ne = e.length / 2;
  const step = Math.max(1, Math.ceil(ne / maxPieces));
  for (let k = 0; k < ne; k += step) {
    if (D.n >= MAXD) return;
    if (mask && (mask[k >> 5] & (1 << (k & 31)))) continue;
    const a = e[k * 2] * 3, b = e[k * 2 + 1] * 3;
    const ax = v[a] * s, ay = v[a + 1] * s, az = v[a + 2] * s, bx = v[b] * s, by = v[b + 1] * s, bz = v[b + 2] * s;
    const wax = _m[0] * ax + _m[1] * ay + _m[2] * az, way = _m[3] * ax + _m[4] * ay + _m[5] * az, waz = _m[6] * ax + _m[7] * ay + _m[8] * az;
    const wbx = _m[0] * bx + _m[1] * by + _m[2] * bz, wby = _m[3] * bx + _m[4] * by + _m[5] * bz, wbz = _m[6] * bx + _m[7] * by + _m[8] * bz;
    const cx = (wax + wbx) / 2, cy = (way + wby) / 2, cz = (waz + wbz) / 2;
    const i = D.n++;
    D.x[i] = x + cx; D.y[i] = y + cy; D.z[i] = z + cz;
    D.ax[i] = (wax - wbx) / 2; D.ay[i] = (way - wby) / 2; D.az[i] = (waz - wbz) / 2;
    const l = Math.hypot(cx, cy, cz) + 0.001;
    const sp = speed * (0.4 + Math.random() * 0.8);
    D.vx[i] = ivx + cx / l * sp + rand(-2, 2); D.vy[i] = ivy + cy / l * sp + rand(-2, 2); D.vz[i] = ivz + cz / l * sp + rand(-2, 2);
    D.wx[i] = rand(-5, 5); D.wy[i] = rand(-5, 5); D.wz[i] = rand(-5, 5);
    D.life[i] = life * (0.55 + Math.random() * 0.6); D.max[i] = D.life[i];
    D.r[i] = col[0]; D.g[i] = col[1]; D.b[i] = col[2];
  }
}

// 爆発。size: 0.5 小 〜 4 巨大
export function explosion(x, y, z, size, col, vz = 0) {
  burst(x, y, z, Math.round(10 + 14 * size), 16 + 12 * size, col, 0.5 + size * 0.25, 0, 0, vz);
  burst(x, y, z, Math.round(4 + 4 * size), 8 + 6 * size, [1, 1, 1], 0.35 + size * 0.1, 0, 0, vz);
  ring(x, y, z, 3 + size * 5, 0.45 + size * 0.15, col, 3);
  if (size >= 1.5) ring(x, y, z, 5 + size * 9, 0.8 + size * 0.2, [1, 1, 1], 2, 1);
  const d = Math.max(8, z);
  G.trauma = Math.min(1, G.trauma + size * 0.1 * clamp(60 / d, 0.15, 1.4));
  if (size >= 1) G.flash[0] = Math.max(G.flash[0], col[0]); // 軽いフラッシュ
  const f = Math.min(0.5, 0.03 * size * clamp(80 / d, 0.2, 2));
  G.flash[3] = Math.max(G.flash[3], f);
  const sx = G.gfx ? clamp((x - G.px) / 60, -1, 1) : 0;
  G.audio.explode(size, sx);
}

export function updateFx(dt) {
  // 粒子
  for (let i = 0; i < P.n; i++) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) { const l = --P.n; if (i !== l) copyP(i, l); i--; continue; }
    const k = Math.exp(-P.drag[i] * dt);
    P.vx[i] *= k; P.vy[i] *= k; P.vz[i] *= k;
    P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += (P.vz[i] - G.V * 0.55) * dt;
  }
  for (let i = 0; i < D.n; i++) {
    D.life[i] -= dt;
    if (D.life[i] <= 0) { const l = --D.n; if (i !== l) copyD(i, l); i--; continue; }
    D.x[i] += D.vx[i] * dt; D.y[i] += D.vy[i] * dt; D.z[i] += (D.vz[i] - G.V * 0.6) * dt;
    const k = Math.exp(-0.7 * dt); D.vx[i] *= k; D.vy[i] *= k; D.vz[i] *= k;
    // 回転 (小角近似 + 長さ維持)
    const ax = D.ax[i], ay = D.ay[i], az = D.az[i];
    const l0 = Math.hypot(ax, ay, az);
    let nx = ax + (D.wy[i] * az - D.wz[i] * ay) * dt, ny = ay + (D.wz[i] * ax - D.wx[i] * az) * dt, nz = az + (D.wx[i] * ay - D.wy[i] * ax) * dt;
    const l1 = Math.hypot(nx, ny, nz) || 1;
    D.ax[i] = nx / l1 * l0; D.ay[i] = ny / l1 * l0; D.az[i] = nz / l1 * l0;
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.life -= dt; r.z -= G.V * 0.5 * dt;
    if (r.life <= 0) { rings.splice(i, 1); continue; }
    r.r = r.maxR * (1 - Math.pow(r.life / r.max, 2.2));
  }
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.life -= dt; p.y += dt * 1.6;
    if (p.life <= 0) pops.splice(i, 1);
  }
}
function copyP(i, l) { for (const k in P) { if (k !== 'n') P[k][i] = P[k][l]; } }
function copyD(i, l) { for (const k in D) { if (k !== 'n') D[k][i] = D[k][l]; } }

export function drawFx(g, dt) {
  // 破片
  for (let i = 0; i < D.n; i++) {
    const a = sat(D.life[i] / D.max[i]);
    const f = Math.min(1, a * 2.2);
    g.line3(D.x[i] - D.ax[i], D.y[i] - D.ay[i], D.z[i] - D.az[i], D.x[i] + D.ax[i], D.y[i] + D.ay[i], D.z[i] + D.az[i], D.r[i] * f, D.g[i] * f, D.b[i] * f, 1.6);
  }
  // 火花
  const V = G.V * 0;
  for (let i = 0; i < P.n; i++) {
    const a = sat(P.life[i] / P.max[i]);
    const f = a * a + 0.05;
    const l = P.len[i];
    g.line3(P.x[i], P.y[i], P.z[i], P.x[i] - P.vx[i] * l, P.y[i] - P.vy[i] * l, P.z[i] - P.vz[i] * l, P.r[i] * f, P.g[i] * f, P.b[i] * f, 1.8);
  }
  // 衝撃波リング
  for (const r of rings) {
    const a = sat(r.life / r.max);
    const f = a * a * 1.2;
    const n = 28;
    let px = 0, py = 0, pz = 0;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * TAU, c = Math.cos(t) * r.r, s = Math.sin(t) * r.r;
      let X, Y, Z;
      if (r.plane === 0) { X = r.x + c; Y = r.y + s; Z = r.z; } else { X = r.x + c; Y = r.y; Z = r.z + s; }
      if (i > 0) g.line3(px, py, pz, X, Y, Z, r.col[0] * f, r.col[1] * f, r.col[2] * f, r.w);
      px = X; py = Y; pz = Z;
    }
  }
}

const _p = [0, 0, 0];
export function drawPops(g) {
  for (const p of pops) {
    if (!g.project(p.x, p.y, p.z, _p)) continue;
    const a = sat(p.life / p.max);
    const s = p.size * (0.7 + 0.3 * sat((p.max - p.life) * 8));
    drawText(g, p.text, _p[0], _p[1], s, p.col[0], p.col[1], p.col[2], 2, Math.min(1, a * 2.5), 'c');
  }
}
