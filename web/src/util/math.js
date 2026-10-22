// シミュレーション用の軽量数学ユーティリティ（three.js非依存）

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const sign = (v) => (v < 0 ? -1 : 1);
export const TAU = Math.PI * 2;

/** フレームレート非依存の指数減衰補間 */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

export function dampAngle(a, b, lambda, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
}

/** 角度aをbへ最大stepだけ回す */
export function approachAngle(a, b, step) {
  const d = wrapAngle(b - a);
  if (Math.abs(d) <= step) return b;
  return a + Math.sign(d) * step;
}

export class V2 {
  constructor(x = 0, z = 0) {
    this.x = x;
    this.z = z;
  }
  set(x, z) {
    this.x = x;
    this.z = z;
    return this;
  }
  copy(v) {
    this.x = v.x;
    this.z = v.z;
    return this;
  }
  clone() {
    return new V2(this.x, this.z);
  }
  add(v) {
    this.x += v.x;
    this.z += v.z;
    return this;
  }
  sub(v) {
    this.x -= v.x;
    this.z -= v.z;
    return this;
  }
  scale(s) {
    this.x *= s;
    this.z *= s;
    return this;
  }
  addScaled(v, s) {
    this.x += v.x * s;
    this.z += v.z * s;
    return this;
  }
  len() {
    return Math.hypot(this.x, this.z);
  }
  lenSq() {
    return this.x * this.x + this.z * this.z;
  }
  norm() {
    const l = this.len();
    if (l > 1e-9) {
      this.x /= l;
      this.z /= l;
    }
    return this;
  }
  dot(v) {
    return this.x * v.x + this.z * v.z;
  }
  dist(v) {
    return Math.hypot(this.x - v.x, this.z - v.z);
  }
  distSq(v) {
    const dx = this.x - v.x;
    const dz = this.z - v.z;
    return dx * dx + dz * dz;
  }
  angle() {
    return Math.atan2(this.z, this.x);
  }
  clampLen(max) {
    const l = this.len();
    if (l > max) this.scale(max / l);
    return this;
  }
  static fromAngle(a, len = 1) {
    return new V2(Math.cos(a) * len, Math.sin(a) * len);
  }
}

export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

/** 点pから線分abへの最近点のパラメータt(0..1)と距離 */
export function segPoint(ax, az, bx, bz, px, pz) {
  const vx = bx - ax;
  const vz = bz - az;
  const l2 = vx * vx + vz * vz;
  let t = l2 > 1e-9 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t;
  const cz = az + vz * t;
  return { t, d: Math.hypot(px - cx, pz - cz), x: cx, z: cz };
}

/** シード付き乱数 (mulberry32) */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (a0, b0) => a0 + (b0 - a0) * rng();
  rng.int = (a0, b0) => Math.floor(a0 + (b0 - a0 + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  };
  rng.chance = (p) => rng() < p;
  return rng;
}

export const globalRng = makeRng((Date.now() & 0xffffffff) >>> 0);
