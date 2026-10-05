// 背景・環境: 星、小惑星帯、トレンチ、都市面、巨大惑星
import { G } from './state.js';
import { rand, rng, TAU, clamp, sat } from './util.js';
import { ROCKS_LOW } from './models.js';

export const THEMES = {
  belt: { star: [0.35, 0.55, 1], grid: [0.1, 0.5, 0.9], accent: [0.2, 0.9, 1], bgA: [0.0, 0.004, 0.02], bgB: [0.0, 0.02, 0.05], tint: [1, 1, 1], fog: [60, 420] },
  trench: { star: [0.5, 0.45, 0.9], grid: [0.9, 0.4, 0.1], accent: [1, 0.65, 0.2], bgA: [0.02, 0.006, 0.0], bgB: [0.03, 0.012, 0.0], tint: [1, 1, 1], fog: [40, 300] },
  warp: { star: [0.55, 0.75, 1], grid: [0.3, 0.45, 1], accent: [0.45, 0.85, 1], bgA: [0.0, 0.004, 0.03], bgB: [0.012, 0.0, 0.05], tint: [1, 1, 1], fog: [90, 450] },
  home: { star: [0.5, 0.6, 1], grid: [0.3, 0.55, 1], accent: [0.3, 0.8, 1], bgA: [0.0, 0.006, 0.025], bgB: [0.0, 0.015, 0.05], tint: [1, 1, 1], fog: [500, 1700] },
  city: { star: [0.9, 0.4, 0.8], grid: [0.8, 0.15, 0.6], accent: [1, 0.3, 0.8], bgA: [0.02, 0.0, 0.025], bgB: [0.05, 0.0, 0.05], tint: [1, 1, 1], fog: [60, 440] },
};

const STARS = 340, DECO = 26;
let stars, deco, theme = 'belt', scroll = 0, gates, towers, rnd = rng(5);

export function initWorld(name) {
  theme = name;
  const th = THEMES[name];
  scroll = 0;
  rnd = rng(77);
  stars = [];
  for (let i = 0; i < STARS; i++) stars.push(newStar(rand(1, 430)));
  deco = [];
  if (name === 'belt') {
    for (let i = 0; i < DECO; i++) deco.push(newDeco(rand(20, 440)));
  }
  gates = [];
  for (let i = 0; i < 6; i++) gates.push(i * 85 + 40);
  towers = [];
  if (name === 'city') for (let i = 0; i < 46; i++) towers.push(newTower(rand(10, 460)));
  G.gfx.fogNear = th.fog[0]; G.gfx.fogFar = th.fog[1];
  G.gfx.fx.bgA = th.bgA; G.gfx.fx.bgB = th.bgB;
}

// 星: ワープ面では中心を空けた円筒状に並べ、色も青白〜紫にばらす
function newStar(z) {
  if (theme === 'warp') {
    const a = rand(0, TAU), r = 14 + Math.pow(Math.random(), 0.7) * 130;
    const h = Math.random();
    return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.75, z, b: rand(0.45, 1), c: h < 0.6 ? null : h < 0.85 ? [0.75, 0.45, 1] : [1, 1, 1] };
  }
  return { x: rand(-150, 150), y: rand(-110, 110), z, b: rand(0.35, 1), c: null };
}

function newDeco(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  return { x: side * rand(30, 110), y: rand(-50, 50), z, s: rand(3, 10), rx: rand(0, TAU), ry: rand(0, TAU), vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5), m: (Math.random() * 8) | 0, c: rand(0.5, 1) };
}
function newTower(z) {
  const side = Math.random() < 0.5 ? -1 : 1;
  const w = rand(3, 10);
  return { x: side * rand(20, 120), z, w, d: rand(3, 10), h: rand(8, 55), c: rand(0.5, 1) };
}

export function updateWorld(dt) {
  const V = G.V;
  const VS = G.VS || V;  // 星だけの見かけの速度 (ワープ面では岩より桁違いに速く流す)
  scroll += V * dt;
  for (const s of stars) {
    s.z -= VS * dt;
    if (s.z < 1) Object.assign(s, newStar(s.z + 430));
  }
  if (theme === 'belt') {
    for (const d of deco) {
      d.z -= V * dt; d.rx += d.vx * dt; d.ry += d.vy * dt;
      if (d.z < -12) Object.assign(d, newDeco(rand(420, 470)));
    }
  }
  const gv = theme === 'warp' ? Math.max(V, VS * 0.45) : V;
  for (let i = 0; i < gates.length; i++) { gates[i] -= gv * dt; if (gates[i] < 2) gates[i] += 510; }
  if (theme === 'city') {
    for (const t of towers) { t.z -= V * dt; if (t.z < -12) Object.assign(t, newTower(rand(440, 480))); }
  }
}

function noFog(g, fn) {
  const n = g.fogNear, f = g.fogFar;
  g.fogNear = 1e6; g.fogFar = 2e6;
  fn();
  g.fogNear = n; g.fogFar = f;
}

function planet(g, th, t) {
  const bx = g.bendX, by = g.bendY;
  g.bendX *= 0.25; g.bendY *= 0.25;
  noFog(g, () => {
    const cx = -300, cy = 120, cz = 780, R = 210;
    const c = th.grid;
    for (let i = -3; i <= 3; i++) {
      const y = Math.sin(i / 4 * Math.PI / 2 * 1.0) * R, r = Math.cos(i / 4 * Math.PI / 2) * R;
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k <= 30; k++) {
        const a = (k / 30) * TAU + t * 0.02;
        const X = cx + Math.cos(a) * r, Y = cy + y, Z = cz + Math.sin(a) * r;
        if (k > 0 && Z < cz + r * 0.3 + 40) g.line3(px, py, pz, X, Y, Z, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 1.2);
        px = X; py = Y; pz = Z;
      }
    }
    for (let j = 0; j < 8; j++) {
      const lon = (j / 8) * Math.PI + t * 0.02;
      let px = 0, py = 0, pz = 0;
      for (let k = 0; k <= 24; k++) {
        const a = (k / 24) * TAU;
        const X = cx + Math.cos(a) * R * Math.cos(lon), Y = cy + Math.sin(a) * R, Z = cz + Math.cos(a) * R * Math.sin(lon);
        if (k > 0 && Z < cz + 60) g.line3(px, py, pz, X, Y, Z, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 1.2);
        px = X; py = Y; pz = Z;
      }
    }
    // 環
    let px = 0, py = 0, pz = 0;
    for (let k = 0; k <= 60; k++) {
      const a = (k / 60) * TAU;
      for (const rr of [1.5, 1.7]) {
        const X = cx + Math.cos(a) * R * rr, Z = cz + Math.sin(a) * R * rr * 0.35, Y = cy + Math.sin(a) * R * rr * 0.25;
        if (k > 0 && rr === 1.5) g.line3(px, py, pz, X, Y, Z, 0.6, 0.35, 0.1, 1.2);
        if (rr === 1.5) { px = X; py = Y; pz = Z; }
      }
    }
  });
  g.bendX = bx; g.bendY = by;
}

function gateRing(g, z, w, h, col, a) {
  // 面取りした矩形ゲート
  const c = 0.28 * Math.min(w, h);
  const pts = [[-w + c, -h], [w - c, -h], [w, -h + c], [w, h - c], [w - c, h], [-w + c, h], [-w, h - c], [-w, -h + c]];
  for (let i = 0; i < 8; i++) {
    const p = pts[i], q = pts[(i + 1) % 8];
    g.line3(p[0], p[1], z, q[0], q[1], z, col[0] * a, col[1] * a, col[2] * a, 1.5);
  }
}

export function drawWorld(g, t) {
  const th = THEMES[theme];
  const V = G.VS || G.V;
  // 星 (ストリーク)
  const streak = V * 0.028 * (1 + (G.od > 0 ? 0 : 0.2));
  const sb = theme === 'warp' ? 0.6 : 0.8;
  for (const s of stars) {
    const b = s.b, c = s.c || th.star;
    g.line3(s.x, s.y, s.z, s.x, s.y, s.z + streak * (0.5 + 1.6 * (1 - s.z / 430)) + 0.4, c[0] * b * sb, c[1] * b * sb, c[2] * b * sb, 1.1);
  }
  if (theme === 'warp') drawWarp(g, th, t);
  if (theme === 'home') planet(g, THEMES.belt, t);
  if (theme === 'belt') {
    planet(g, th, t);
    for (const d of deco) {
      if (d.z < 25) continue;
      g.mesh(ROCKS_LOW[d.m], d.x, d.y, d.z, d.ry, d.rx, 0, d.s, th.grid[0] * d.c * 0.6, th.grid[1] * d.c * 0.6, th.grid[2] * d.c * 0.6, 1.2);
    }
  }
  // ゲート (距離感・速度感を出す)
  for (const z of gates) {
    const a = 0.35 * (1 + G.beat * 0.9);
    if (theme === 'belt') gateRing(g, z, 34, 22, th.accent, a * 0.45);
    else if (theme === 'city') gateRing(g, z, 40, 24, th.accent, a);
  }
  if (theme === 'trench') drawTrench(g, th, t);
  if (theme === 'city') drawCity(g, th, t);
}

// ワープ空間: 流れていく光のリング + 中心の消失点のにじみ
function drawWarp(g, th, t) {
  const h = G.hyper || 0;
  if (h <= 0.01) return;
  const ac = th.accent;
  for (let i = 0; i < gates.length; i++) {
    const z = gates[i];
    const R = 62 + 6 * Math.sin(i * 1.7 + t * 0.5);
    const a = h * 0.32 * (1 + G.beat * 0.8) * Math.min(1, z / 60);
    const n = 24;
    const rot = t * 0.3 + i;
    let px = 0, py = 0;
    for (let k = 0; k <= n; k++) {
      const u = (k / n) * TAU + rot;
      const x = Math.cos(u) * R, y = Math.sin(u) * R * 0.72;
      if (k > 0 && k % 3 !== 0) g.line3(px, py, z, x, y, z, ac[0] * a, ac[1] * a, ac[2] * a, 1.6);
      px = x; py = y;
    }
  }
}

const TW = 31, TH = 19;
function drawTrench(g, th, t) {
  const spacing = 22;
  const off = scroll % spacing;
  const N = 20;
  const gc = th.grid, ac = th.accent;
  let prev = null;
  for (let k = 0; k < N; k++) {
    const z = k * spacing - off + 1;
    const sI = Math.floor((scroll + z) / spacing);
    const wob = 1 + 0.12 * Math.sin((scroll + z) * 0.004);
    const w = TW * wob, h = TH;
    const pulse = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin((scroll + z) * 0.05 - t * 5), 6);
    const strong = sI % 4 === 0;
    const c = strong ? ac : gc;
    const a = (strong ? 0.9 : 0.5) * (0.6 + 0.6 * pulse);
    const ch = 7;
    const pts = [[-w + ch, -h], [w - ch, -h], [w, -h + ch], [w, h - ch], [w - ch, h], [-w + ch, h], [-w, h - ch], [-w, -h + ch]];
    for (let i = 0; i < 8; i++) {
      const p = pts[i], q = pts[(i + 1) % 8];
      g.line3(p[0], p[1], z, q[0], q[1], z, c[0] * a, c[1] * a, c[2] * a, strong ? 2.2 : 1.5);
    }
    if (prev) {
      for (let i = 0; i < 8; i++) {
        g.line3(prev.pts[i][0], prev.pts[i][1], prev.z, pts[i][0], pts[i][1], z, gc[0] * 0.35, gc[1] * 0.35, gc[2] * 0.35, 1.2);
      }
      // 壁のパネル線
      for (const yy of [-9, 0, 9]) {
        g.line3(-prev.w, yy, prev.z, -w, yy, z, gc[0] * 0.18, gc[1] * 0.18, gc[2] * 0.18, 1);
        g.line3(prev.w, yy, prev.z, w, yy, z, gc[0] * 0.18, gc[1] * 0.18, gc[2] * 0.18, 1);
      }
      for (const xx of [-16, -6, 6, 16]) {
        g.line3(xx, -h, prev.z, xx, -h, z, gc[0] * 0.2, gc[1] * 0.2, gc[2] * 0.2, 1);
        g.line3(xx, h, prev.z, xx, h, z, gc[0] * 0.12, gc[1] * 0.12, gc[2] * 0.12, 1);
      }
    }
    prev = { pts, z, w };
  }
}

const FLOOR = -27;
function drawCity(g, th, t) {
  const gc = th.grid, ac = th.accent;
  const sp = 14;
  const off = scroll % sp;
  // 床グリッド (横線)
  for (let k = 0; k < 30; k++) {
    const z = k * sp - off + 1;
    const a = 0.5;
    g.line3(-140, FLOOR, z, -40, FLOOR, z, gc[0] * a, gc[1] * a, gc[2] * a, 1.2);
    g.line3(-40, FLOOR, z, 40, FLOOR, z, gc[0] * a, gc[1] * a, gc[2] * a, 1.2);
    g.line3(40, FLOOR, z, 140, FLOOR, z, gc[0] * a, gc[1] * a, gc[2] * a, 1.2);
  }
  // 縦線
  for (let i = -10; i <= 10; i++) {
    const x = i * 14;
    const a = i % 3 === 0 ? 0.6 : 0.3;
    for (let s = 0; s < 6; s++) g.line3(x, FLOOR, 1 + s * 75, x, FLOOR, 1 + (s + 1) * 75, gc[0] * a, gc[1] * a, gc[2] * a, 1.2);
  }
  // 塔
  for (const tw of towers) {
    if (tw.z < -10) continue;
    const x0 = tw.x - tw.w, x1 = tw.x + tw.w, z0 = tw.z - tw.d, z1 = tw.z + tw.d, y1 = FLOOR + tw.h;
    const a = tw.c * 0.8;
    const L = (ax, ay, az, bx, by, bz) => g.line3(ax, ay, az, bx, by, bz, gc[0] * a, gc[1] * a, gc[2] * a, 1.4);
    L(x0, FLOOR, z0, x0, y1, z0); L(x1, FLOOR, z0, x1, y1, z0); L(x0, FLOOR, z1, x0, y1, z1); L(x1, FLOOR, z1, x1, y1, z1);
    L(x0, y1, z0, x1, y1, z0); L(x1, y1, z0, x1, y1, z1); L(x1, y1, z1, x0, y1, z1); L(x0, y1, z1, x0, y1, z0);
    // 窓の帯
    for (let f = 1; f < 4; f++) {
      const yy = FLOOR + tw.h * f / 4;
      g.line3(x0, yy, z0, x1, yy, z0, ac[0] * a * 0.35, ac[1] * a * 0.35, ac[2] * a * 0.35, 1);
    }
  }
}
