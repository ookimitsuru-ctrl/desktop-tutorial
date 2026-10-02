// ワイヤーフレームモデル定義 (頂点 + 辺リスト)
import { rng } from './util.js';

function build(verts, edges, scale = 1) {
  const n = verts.length;
  const v = new Float32Array(n * 3);
  let r = 0;
  for (let i = 0; i < n; i++) {
    v[i * 3] = verts[i][0] * scale; v[i * 3 + 1] = verts[i][1] * scale; v[i * 3 + 2] = verts[i][2] * scale;
    r = Math.max(r, Math.hypot(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]));
  }
  const e = new Uint16Array(edges.length * 2);
  for (let i = 0; i < edges.length; i++) { e[i * 2] = edges[i][0]; e[i * 2 + 1] = edges[i][1]; }
  return { v, e, r, n, ne: edges.length };
}

// 頂点配列 + 面リストから重複なしの辺を生成
function edgesFromFaces(faces) {
  const set = new Set(), out = [];
  for (const f of faces) {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = a < b ? a * 1000 + b : b * 1000 + a;
      if (!set.has(k)) { set.add(k); out.push([Math.min(a, b), Math.max(a, b)]); }
    }
  }
  return out;
}

const PHI = (1 + Math.sqrt(5)) / 2;
const ICO_V = [
  [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
  [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
  [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
].map((p) => { const l = Math.hypot(...p); return [p[0] / l, p[1] / l, p[2] / l]; });
const ICO_F = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

export function icosa(r = 1) { return build(ICO_V, edgesFromFaces(ICO_F), r); }

export function octa(r = 1) {
  const v = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  return build(v, edgesFromFaces([[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [0, 2, 5], [2, 1, 5], [1, 3, 5], [3, 0, 5]]), r);
}

export function cube(r = 1, sy = 1, sz = 1) {
  const v = [];
  for (let i = 0; i < 8; i++) v.push([(i & 1 ? 1 : -1) * r, (i & 2 ? 1 : -1) * r * sy, (i & 4 ? 1 : -1) * r * sz]);
  const e = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  return build(v, e);
}

// 細分化ICOS (42頂点) をシードで歪めた岩
export function rock(seed, r = 1) {
  const rnd = rng(seed);
  const verts = ICO_V.map((p) => p.slice());
  const mid = new Map();
  const faces2 = [];
  const getMid = (a, b) => {
    const k = a < b ? a * 100 + b : b * 100 + a;
    if (mid.has(k)) return mid.get(k);
    const p = [(verts[a][0] + verts[b][0]) / 2, (verts[a][1] + verts[b][1]) / 2, (verts[a][2] + verts[b][2]) / 2];
    const l = Math.hypot(...p);
    verts.push([p[0] / l, p[1] / l, p[2] / l]);
    mid.set(k, verts.length - 1);
    return verts.length - 1;
  };
  for (const [a, b, c] of ICO_F) {
    const ab = getMid(a, b), bc = getMid(b, c), ca = getMid(c, a);
    faces2.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  const sx = 0.8 + rnd() * 0.5, sy = 0.7 + rnd() * 0.5, sz = 0.8 + rnd() * 0.5;
  const out = verts.map((p) => {
    const k = 0.72 + rnd() * 0.5;
    return [p[0] * k * sx, p[1] * k * sy, p[2] * k * sz];
  });
  return build(out, edgesFromFaces(faces2), r);
}
// 低ポリ岩 (遠景用)
export function rockLow(seed, r = 1) {
  const rnd = rng(seed);
  const sx = 0.8 + rnd() * 0.5, sy = 0.7 + rnd() * 0.5, sz = 0.8 + rnd() * 0.5;
  const out = ICO_V.map((p) => { const k = 0.62 + rnd() * 0.75; return [p[0] * k * sx, p[1] * k * sy, p[2] * k * sz]; });
  return build(out, edgesFromFaces(ICO_F), r);
}

export function ring(n = 16, r = 1, plane = 'xy') {
  const v = [], e = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r;
    v.push(plane === 'xy' ? [c, s, 0] : plane === 'xz' ? [c, 0, s] : [0, c, s]);
    e.push([i, (i + 1) % n]);
  }
  return build(v, e);
}

// 敵ドローン: 八面体 + 円盤リング
export function drone() {
  const v = [[1.1, 0, 0], [-1.1, 0, 0], [0, 1.0, 0], [0, -1.0, 0], [0, 0, 1.1], [0, 0, -1.1]];
  const e = edgesFromFaces([[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [0, 2, 5], [2, 1, 5], [1, 3, 5], [3, 0, 5]]);
  const base = v.length;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    v.push([Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0]);
    e.push([base + i, base + ((i + 1) % 8)]);
  }
  e.push([base, 0], [base + 2, 4], [base + 4, 1], [base + 6, 5]);
  return build(v, e);
}

// 敵戦闘機
export function fighter() {
  const v = [
    [0, 0, 3.2], [0, 0.8, -0.5], [0, -0.6, -0.5], [-0.8, 0, 0], [0.8, 0, 0], [0, 0, -2.4],
    [-3.3, -0.2, -2.3], [3.3, -0.2, -2.3], [-0.8, 0, -1.6], [0.8, 0, -1.6], [0, 1.7, -2.3],
  ];
  const e = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 3], [1, 4], [2, 3], [2, 4], [3, 8], [4, 9], [8, 5], [9, 5], [3, 6], [6, 8], [4, 7], [7, 9], [1, 10], [10, 5], [1, 5], [2, 5]];
  return build(v, e);
}

export function mine() {
  const v = ICO_V.map((p) => p.slice()), e = edgesFromFaces(ICO_F);
  const n = v.length;
  for (let i = 0; i < n; i++) { v.push([ICO_V[i][0] * 1.9, ICO_V[i][1] * 1.9, ICO_V[i][2] * 1.9]); e.push([i, n + i]); }
  return build(v, e, 1.1);
}

export function seeker() {
  const v = [[0, 0, 3.4], [0.9, 0.9, -1.6], [-0.9, 0.9, -1.6], [-0.9, -0.9, -1.6], [0.9, -0.9, -1.6], [0, 0, -2.4], [2.0, 0, -2.6], [-2.0, 0, -2.6], [0, 2.0, -2.6], [0, -2.0, -2.6]];
  const e = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [1, 5], [2, 5], [3, 5], [4, 5], [1, 6], [4, 6], [2, 7], [3, 7], [1, 8], [2, 8], [3, 9], [4, 9]];
  return build(v, e, 0.8);
}

export function turret() {
  const v = [
    [-1.5, -1.5, 0], [1.5, -1.5, 0], [1.5, 1.5, 0], [-1.5, 1.5, 0],
    [-0.9, -0.9, 1.6], [0.9, -0.9, 1.6], [0.9, 0.9, 1.6], [-0.9, 0.9, 1.6],
    [-0.3, -0.3, 1.6], [0.3, -0.3, 1.6], [0.3, 0.3, 1.6], [-0.3, 0.3, 1.6],
    [-0.3, -0.3, 4.2], [0.3, -0.3, 4.2], [0.3, 0.3, 4.2], [-0.3, 0.3, 4.2],
  ];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [1, 5], [2, 6], [3, 7], [4, 5], [5, 6], [6, 7], [7, 4], [8, 12], [9, 13], [10, 14], [11, 15], [12, 13], [13, 14], [14, 15], [15, 12]];
  return build(v, e);
}

// 爆撃艦: 六角柱の船体 + 翼
export function bomber() {
  const v = [], e = [];
  const rings = [[-7, 2.6], [-1, 3.8], [5, 3.0]];
  for (const [z, r] of rings) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; v.push([Math.cos(a) * r * 1.3, Math.sin(a) * r * 0.7, z]); }
  }
  for (let k = 0; k < 3; k++) for (let i = 0; i < 6; i++) e.push([k * 6 + i, k * 6 + ((i + 1) % 6)]);
  for (let k = 0; k < 2; k++) for (let i = 0; i < 6; i++) e.push([k * 6 + i, (k + 1) * 6 + i]);
  const nose = v.length; v.push([0, 0, 11]);
  for (let i = 0; i < 6; i++) e.push([12 + i, nose]);
  const w = v.length;
  v.push([-5.4, 0, -1], [-11, 0.4, -6], [-5, 0.2, -5.5], [5.4, 0, -1], [11, 0.4, -6], [5, 0.2, -5.5]);
  e.push([w, w + 1], [w + 1, w + 2], [w + 2, w], [w + 3, w + 4], [w + 4, w + 5], [w + 5, w + 3]);
  e.push([6, w], [9, w + 3], [7, w + 2], [10, w + 5]);
  return build(v, e, 0.9);
}

export function orb(r = 0.5) { return octa(r); }
export function plasma(r = 1.2) {
  const m = icosa(r);
  return m;
}
export function missile() {
  const v = [[0, 0, 1.4], [0.3, 0.3, -0.6], [-0.3, 0.3, -0.6], [-0.3, -0.3, -0.6], [0.3, -0.3, -0.6], [0, 0, -1.0]];
  const e = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [1, 5], [2, 5], [3, 5], [4, 5]];
  return build(v, e, 0.9);
}
export function bolt() {
  return build([[0, 0, 1.6], [0, 0, -1.6]], [[0, 1]]);
}
export function needle() {
  return build([[0, 0, 2.6], [0.2, 0.2, 0], [-0.2, 0.2, 0], [-0.2, -0.2, 0], [0.2, -0.2, 0], [0, 0, -1.2]],
    [[0, 1], [0, 2], [0, 3], [0, 4], [1, 2], [2, 3], [3, 4], [4, 1], [1, 5], [2, 5], [3, 5], [4, 5]]);
}

// 修理パーツ (3D十字)
export function crossItem() {
  const v = [], e = [];
  const a = 0.35, b = 1.1;
  const pts = [
    [-a, -b, -a], [a, -b, -a], [a, -b, a], [-a, -b, a], [-a, b, -a], [a, b, -a], [a, b, a], [-a, b, a],
    [-b, -a, -a], [-b, a, -a], [-b, a, a], [-b, -a, a], [b, -a, -a], [b, a, -a], [b, a, a], [b, -a, a],
  ];
  pts.forEach((p) => v.push(p));
  for (let i = 0; i < 4; i++) { e.push([i, (i + 1) % 4], [4 + i, 4 + (i + 1) % 4], [i, 4 + i]); }
  for (let i = 0; i < 4; i++) { e.push([8 + i, 8 + (i + 1) % 4], [12 + i, 12 + (i + 1) % 4], [8 + i, 12 + i]); }
  return build(v, e);
}

// ボス: WARDEN (二重多面体)
export function bossCore(r = 5) { return icosa(r); }
export function bossCage(r = 10) { return octa(r); }

// ボス2: 蛇の節 (八角リング)
export function serpentSeg(r = 2.6, len = 2.4) {
  const v = [], e = [];
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    v.push([Math.cos(a) * r, Math.sin(a) * r, len / 2], [Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78, -len / 2]);
  }
  for (let i = 0; i < n; i++) {
    e.push([i * 2, ((i + 1) % n) * 2], [i * 2 + 1, ((i + 1) % n) * 2 + 1], [i * 2, i * 2 + 1]);
  }
  return build(v, e);
}
export function serpentHead() {
  const v = [
    [0, 0, 7], [0, 1.2, 3], [-3.2, 0, 0], [3.2, 0, 0], [0, 3.2, -1], [0, -1.6, 2], [-2.2, -1.2, 3.4], [2.2, -1.2, 3.4],
    [-2.6, 2.2, -2.5], [2.6, 2.2, -2.5], [0, -1.8, -2.5], [-5.2, 0.8, -3], [5.2, 0.8, -3],
  ];
  const e = [[0, 1], [0, 6], [0, 7], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [2, 5], [3, 5], [5, 6], [5, 7], [6, 2], [7, 3], [4, 8], [4, 9], [2, 8], [3, 9], [2, 10], [3, 10], [8, 9], [8, 10], [9, 10], [2, 11], [3, 12], [11, 8], [12, 9], [0, 5]];
  return build(v, e, 1.3);
}

// ボス3: 巨大リアクター (外殻 + 内核)
export function reactorShell(r = 12) {
  // 切頂二十面体風: icosa + 各面の中心を押し出す
  const v = ICO_V.map((p) => p.slice()), e = edgesFromFaces(ICO_F);
  for (const f of ICO_F) {
    const c = [(ICO_V[f[0]][0] + ICO_V[f[1]][0] + ICO_V[f[2]][0]) / 3, (ICO_V[f[0]][1] + ICO_V[f[1]][1] + ICO_V[f[2]][1]) / 3, (ICO_V[f[0]][2] + ICO_V[f[1]][2] + ICO_V[f[2]][2]) / 3];
    const l = Math.hypot(...c);
    v.push([c[0] / l * 1.35, c[1] / l * 1.35, c[2] / l * 1.35]);
    const id = v.length - 1;
    e.push([f[0], id], [f[1], id], [f[2], id]);
  }
  return build(v, e, r);
}

// 星型 (背景/ピックアップ用)
export function star4(r = 1) {
  return build([[r, 0, 0], [-r, 0, 0], [0, r, 0], [0, -r, 0], [0, 0, r], [0, 0, -r]], [[0, 1], [2, 3], [4, 5]]);
}

// 巨大建造物ブロック (都市面用)
export function tower(w, h, d) {
  const v = [], e = [];
  for (let i = 0; i < 8; i++) v.push([(i & 1 ? w : -w), (i & 2 ? h : 0), (i & 4 ? d : -d)]);
  e.push([0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]);
  return build(v, e);
}

export const M = {
  icosa1: icosa(1), octa1: octa(1), cube1: cube(1), ring16: ring(16, 1, 'xy'), ring24: ring(24, 1, 'xy'),
  drone: drone(), fighter: fighter(), mine: mine(), seeker: seeker(), turret: turret(), bomber: bomber(),
  orb: orb(0.55), plasma: plasma(1.3), missile: missile(), bolt: bolt(), needle: needle(), cross: crossItem(),
  bossCore: bossCore(5), bossCage: bossCage(11), serpentSeg: serpentSeg(), serpentHead: serpentHead(), reactor: reactorShell(12),
  star4: star4(1),
};
export const ROCKS = [];
export const ROCKS_LOW = [];
for (let i = 0; i < 8; i++) { ROCKS.push(rock(100 + i * 17)); ROCKS_LOW.push(rockLow(100 + i * 17)); }
