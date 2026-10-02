// 汎用ユーティリティ
export const PI = Math.PI;
export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smooth = (t) => { t = sat(t); return t * t * (3 - 2 * t); };
export const easeOut = (t) => 1 - Math.pow(1 - sat(t), 3);
export const easeInOut = (t) => { t = sat(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
// フレームレート非依存の指数減衰補間
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const dampAngle = (cur, target, rate, dt) => {
  let d = (target - cur) % TAU;
  if (d > PI) d -= TAU; else if (d < -PI) d += TAU;
  return cur + d * (1 - Math.exp(-rate * dt));
};

export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const randi = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const sign = (v) => (v < 0 ? -1 : 1);

// シード付き乱数 (mulberry32)
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// HSV -> RGB (0..1)
export function hsv(h, s, v, out) {
  h = ((h % 1) + 1) % 1;
  const i = Math.floor(h * 6), f = h * 6 - i;
  const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    default: r = v; g = p; b = q;
  }
  if (out) { out[0] = r; out[1] = g; out[2] = b; return out; }
  return [r, g, b];
}

export function fmtScore(n) {
  return String(Math.floor(n)).padStart(8, '0');
}
