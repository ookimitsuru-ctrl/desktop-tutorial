import { PITCH, BALL_R } from '../config.js';
import { clamp } from '../util/math.js';

// ボールの物理: 重力・空気抵抗・マグヌス効果（カーブ）・バウンド・転がり抵抗・ポスト/ネットとの衝突

export const G = 9.81;
const DRAG = 0.0135; // 空気抵抗係数 (1/m)
const MAGNUS = 0.024; // カーブの強さ
const SPIN_DECAY = 0.6;
const RESTITUTION = 0.58;
const GROUND_FRICTION = 0.6; // バウンド時の水平速度の減衰
const ROLL_DECEL = 0.85; // 転がり時の一定減速 (m/s^2)
const ROLL_LINEAR = 0.32; // 速度比例の減速 (1/s)
const GOAL_X = PITCH.HL;
const POST_Z = PITCH.goalHalfW + PITCH.postR;
const BAR_Y = PITCH.goalH + PITCH.postR;
const NET_DEPTH = 2.0;

export class Ball {
  constructor() {
    this.x = 0;
    this.y = BALL_R;
    this.z = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    // 回転（縦軸まわりのカーブ用スピンと、トップ/バックスピン）
    this.spinY = 0;
    this.spinTop = 0;
    this.owner = null;
    this.lastTouch = null; // 最後に触った選手
    this.lastKick = null; // 最後のキック情報 {player, kind, time}
    this.passTarget = null;
    this.inGoal = 0; // ゴール内に入った側 (+1/-1)
    this.frozen = false;
    this.events = [];
  }

  get speed() {
    return Math.hypot(this.vx, this.vy, this.vz);
  }

  get groundSpeed() {
    return Math.hypot(this.vx, this.vz);
  }

  place(x, z, y = BALL_R) {
    this.x = x;
    this.z = z;
    this.y = y;
    this.vx = this.vy = this.vz = 0;
    this.spinY = this.spinTop = 0;
    this.inGoal = 0;
  }

  /** 物理を1ステップ進める（所有者がいる時は呼ばない） */
  step(dt) {
    if (this.frozen) return;
    const sub = 2;
    const h = dt / sub;
    for (let i = 0; i < sub; i++) this.integrate(h, true);
  }

  integrate(h, collide) {
    const onGround = this.y <= BALL_R + 0.002 && Math.abs(this.vy) < 0.5;
    if (onGround) {
      this.y = BALL_R;
      this.vy = 0;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0) {
        const dec = (ROLL_DECEL + ROLL_LINEAR * sp) * h;
        const ns = Math.max(0, sp - dec);
        const k = ns / sp;
        this.vx *= k;
        this.vz *= k;
      }
      this.spinY *= Math.exp(-h * 3);
    } else {
      const sp = Math.hypot(this.vx, this.vy, this.vz);
      // 空気抵抗
      const d = DRAG * sp * h;
      this.vx -= this.vx * d;
      this.vy -= this.vy * d;
      this.vz -= this.vz * d;
      // マグヌス効果（縦軸スピンで横に曲がる、トップスピンで落ちる）
      const ax = -MAGNUS * this.spinY * this.vz;
      const az = MAGNUS * this.spinY * this.vx;
      this.vx += ax * h;
      this.vz += az * h;
      this.vy -= MAGNUS * this.spinTop * Math.hypot(this.vx, this.vz) * h;
      this.vy -= G * h;
      this.spinY *= Math.exp(-h * SPIN_DECAY);
      this.spinTop *= Math.exp(-h * SPIN_DECAY);
    }
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;
    if (this.y < BALL_R) {
      this.y = BALL_R;
      if (this.vy < -0.5) {
        if (collide && this.vy < -2.5) this.events.push({ type: 'bounce', v: -this.vy });
        this.vy = -this.vy * RESTITUTION;
        this.vx *= GROUND_FRICTION + 0.3;
        this.vz *= GROUND_FRICTION + 0.3;
        this.spinY *= 0.5;
        if (this.vy < 0.8) this.vy = 0;
      } else {
        this.vy = 0;
      }
    }
    if (collide) this.collideGoals();
  }

  collideGoals() {
    for (const side of [-1, 1]) {
      const gx = side * (GOAL_X + PITCH.postR);
      if (Math.abs(this.x - gx) > 3.2) continue;
      // ポスト（鉛直円柱）
      for (const sz of [-1, 1]) {
        const pz = sz * POST_Z;
        const dx = this.x - gx;
        const dz = this.z - pz;
        const d = Math.hypot(dx, dz);
        const R = PITCH.postR + BALL_R;
        if (d < R && this.y < BAR_Y + PITCH.postR) {
          const nx = dx / (d || 1);
          const nz = dz / (d || 1);
          this.x = gx + nx * R;
          this.z = pz + nz * R;
          const vn = this.vx * nx + this.vz * nz;
          if (vn < 0) {
            this.vx -= 1.7 * vn * nx;
            this.vz -= 1.7 * vn * nz;
            this.events.push({ type: 'post', v: -vn, side });
          }
        }
      }
      // クロスバー（z方向の水平円柱）
      if (Math.abs(this.z) < POST_Z) {
        const dx = this.x - gx;
        const dy = this.y - BAR_Y;
        const d = Math.hypot(dx, dy);
        const R = PITCH.postR + BALL_R;
        if (d < R) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          this.x = gx + nx * R;
          this.y = BAR_Y + ny * R;
          const vn = this.vx * nx + this.vy * ny;
          if (vn < 0) {
            this.vx -= 1.65 * vn * nx;
            this.vy -= 1.65 * vn * ny;
            this.events.push({ type: 'bar', v: -vn, side });
          }
        }
      }
      // ゴール内のネット
      const inside = side * this.x > GOAL_X && side * this.x < GOAL_X + NET_DEPTH + 0.5;
      if (inside && Math.abs(this.z) < POST_Z + 0.3 && this.y < BAR_Y + 0.2) {
        if (side * this.x > GOAL_X + 0.3 && Math.abs(this.z) < POST_Z) this.inGoal = side;
        const back = GOAL_X + NET_DEPTH - 0.1 - BALL_R;
        if (side * this.x > back) {
          this.x = side * back;
          if (side * this.vx > 0) {
            this.events.push({ type: 'net', v: Math.abs(this.vx) + Math.abs(this.vz), side, x: this.x, y: this.y, z: this.z });
            this.vx *= -0.12;
            this.vz *= 0.3;
            this.vy *= 0.3;
          }
        }
        if (this.inGoal) {
          const sideLim = POST_Z - BALL_R;
          if (Math.abs(this.z) > sideLim) {
            if (this.z * this.vz > 0) {
              this.events.push({ type: 'net', v: Math.abs(this.vz), side, x: this.x, y: this.y, z: this.z });
              this.vz *= -0.15;
              this.vx *= 0.4;
            }
            this.z = Math.sign(this.z) * sideLim;
          }
          if (this.y > BAR_Y - BALL_R && this.vy > 0) {
            this.vy *= -0.2;
            this.y = BAR_Y - BALL_R;
          }
        }
      } else if (inside && Math.abs(this.z) >= POST_Z && Math.abs(this.z) < POST_Z + 0.4 && this.y < BAR_Y) {
        // サイドネットの外側に当たる
        if (Math.abs(this.z) - Math.abs(this.z - this.vz * 0.016) < 0) {
          this.vz *= -0.1;
          this.vx *= 0.3;
          this.events.push({ type: 'sidenet', side });
        }
      }
    }
  }

  /** 物理を真似て未来位置を予測する（選手・GKの判断用） */
  predict(seconds, step = 1 / 30, out = []) {
    const s = { x: this.x, y: this.y, z: this.z, vx: this.vx, vy: this.vy, vz: this.vz, spinY: this.spinY, spinTop: this.spinTop };
    const sim = Object.assign(Object.create(Ball.prototype), s, { events: [] });
    out.length = 0;
    out.push({ t: 0, x: sim.x, y: sim.y, z: sim.z, vx: sim.vx, vy: sim.vy, vz: sim.vz });
    const n = Math.ceil(seconds / step);
    for (let i = 1; i <= n; i++) {
      sim.integrate(step / 2, false);
      sim.integrate(step / 2, false);
      out.push({ t: i * step, x: sim.x, y: sim.y, z: sim.z, vx: sim.vx, vy: sim.vy, vz: sim.vz });
    }
    return out;
  }
}

/** 初速から軌道を簡易シミュレーション */
function simulate(x, y, z, vx, vy, vz, spinY, spinTop, until, step = 1 / 60, maxT = 4) {
  const b = Object.assign(Object.create(Ball.prototype), { x, y, z, vx, vy, vz, spinY, spinTop, events: [] });
  let t = 0;
  let prev = { x, y, z, t };
  while (t < maxT) {
    b.integrate(step, false);
    t += step;
    const cur = { x: b.x, y: b.y, z: b.z, t, vx: b.vx, vy: b.vy, vz: b.vz };
    const hit = until(prev, cur);
    if (hit) return hit;
    prev = cur;
  }
  return null;
}

/**
 * 地上パス: 距離dで到達時の速度がarriveSpeedになる初速を求める
 */
export function groundPassSpeed(d, arriveSpeed = 4) {
  // dv/dt = -(c0 + c1 v) の解析解を二分探索
  const c0 = ROLL_DECEL;
  const c1 = ROLL_LINEAR;
  const dist = (v0) => (1 / c1) * (v0 - arriveSpeed - (c0 / c1) * Math.log((c0 + c1 * v0) / (c0 + c1 * arriveSpeed)));
  let lo = arriveSpeed;
  let hi = 45;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (dist(mid) < d) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** 地上を転がるボールが距離dに達するまでの時間 */
export function groundTravelTime(v0, d) {
  const c0 = ROLL_DECEL;
  const c1 = ROLL_LINEAR;
  // 数値積分（十分高速）
  let v = v0;
  let s = 0;
  let t = 0;
  const h = 1 / 60;
  while (s < d && t < 8) {
    v = Math.max(0, v - (c0 + c1 * v) * h);
    s += v * h;
    t += h;
    if (v <= 0) return Infinity;
  }
  return t;
}

/**
 * 浮き球: 点(x,z)から(tx,tz)に、着地点/到達高さ targetY で届く初速を求める
 * apex: 最高到達点の目安(m)
 */
export function solveLob(x, y, z, tx, tz, apex = 5, targetY = BALL_R) {
  const dx = tx - x;
  const dz = tz - z;
  const d = Math.hypot(dx, dz);
  const ux = dx / (d || 1);
  const uz = dz / (d || 1);
  // 抵抗なしの近似から始めて射撃法で補正
  let vy = Math.sqrt(2 * G * Math.max(0.5, apex - y));
  let T = vy / G + Math.sqrt(Math.max(0, 2 * (apex - targetY) / G));
  let vh = d / T;
  for (let it = 0; it < 8; it++) {
    const hit = simulate(x, y, z, ux * vh, vy, uz * vh, 0, 0, (p, c) => (c.vy < 0 && c.y <= targetY ? c : null), 1 / 60, 6);
    if (!hit) break;
    const reached = Math.hypot(hit.x - x, hit.z - z);
    if (Math.abs(reached - d) < 0.15) break;
    vh *= d / Math.max(0.5, reached);
  }
  return { vx: ux * vh, vy, vz: uz * vh, time: T };
}

/**
 * シュート: ゴールライン上の目標点(goalX, ty, tz)を、速度speedで通過する初速を求める
 * curl: 横回転（正で左に曲がる）
 */
export function solveShot(x, y, z, goalX, ty, tz, speed, curl = 0) {
  let yaw = Math.atan2(tz - z, goalX - x);
  let pitch = 0.05;
  const dir = Math.sign(goalX - x) || 1;
  for (let it = 0; it < 10; it++) {
    const cp = Math.cos(pitch);
    const vx = Math.cos(yaw) * cp * speed;
    const vz = Math.sin(yaw) * cp * speed;
    const vy = Math.sin(pitch) * speed;
    const hit = simulate(x, y, z, vx, vy, vz, curl, 0, (p, c) => (dir * c.x >= dir * goalX ? c : null), 1 / 120, 3);
    if (!hit) {
      pitch += 0.05;
      continue;
    }
    const ey = ty - hit.y;
    const ez = tz - hit.z;
    if (Math.abs(ey) < 0.03 && Math.abs(ez) < 0.03) break;
    const dist = Math.hypot(goalX - x, tz - z) || 1;
    pitch += clamp(ey / dist, -0.3, 0.3) * 0.9;
    yaw += (dir * ez) / dist * 0.9;
    pitch = clamp(pitch, -0.2, 1.2);
  }
  const cp = Math.cos(pitch);
  return { vx: Math.cos(yaw) * cp * speed, vy: Math.sin(pitch) * speed, vz: Math.sin(yaw) * cp * speed, spinY: curl };
}

export const BALL_CONST = { GOAL_X, POST_Z, BAR_Y, NET_DEPTH };
