import { clamp, wrapAngle, approachAngle } from '../util/math.js';

// 選手の状態と運動

export const STATE_DUR = {
  kick: 0.5,
  slide: 1.05,
  tackle: 0.4,
  header: 0.7,
  dive: 1.5,
  fall: 2.2,
  stumble: 0.45,
  throw: 0.9,
  catch: 0.5,
};

export class Player {
  constructor(data, team, index) {
    this.data = data;
    this.team = team;
    this.index = index;
    this.id = data.id;
    this.role = data.role;
    this.pos = data.pos;
    this.attrs = data.attrs;
    this.name = data.short;
    this.num = data.num;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.facing = 0;
    this.state = 'move';
    this.stateT = 0;
    this.stateDur = 0;
    this.sd = {}; // 状態ごとのデータ
    this.tx = 0;
    this.tz = 0;
    this.tSpeed = 0;
    this.faceX = null;
    this.faceZ = null;
    this.kickCd = 0;
    this.tackleCd = 0;
    this.decideT = 0;
    this.stamina = 1;
    this.controlled = false;
    this.input = null; // 操作中の入力 {x,z,mag,sprint}
    this.sprinting = false;
    this.role2 = ''; // AI上の役割（press, cover, support, run 等）
    this.slot = null;
    const a = this.attrs;
    this.topSpeed = 6.9 + a.pace * 0.026; // m/s
    this.accel = 6.2 + a.pace * 0.03;
    this.reaction = 0.32 - a.pace * 0.0006 - (this.role === 'GK' ? a.gk * 0.001 : 0);
    this.turnRate = 9 + a.dribbling * 0.04;
    this.anim = { gait: 0, turn: 0, lastFacing: 0 };
    this.yellow = 0;
    this.offsideFlag = false;
    this.stats = { goals: 0, assists: 0, shots: 0, tackles: 0, saves: 0, passes: 0 };
  }

  get isGK() {
    return this.role === 'GK';
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  get busy() {
    return this.state !== 'move';
  }

  /** 体力を考慮した最高速度 */
  maxSpeed(sprint) {
    const st = 0.82 + 0.18 * this.stamina;
    return (sprint ? this.topSpeed : this.topSpeed * 0.74) * st;
  }

  setState(state, dur = STATE_DUR[state] || 0.5, data = {}) {
    this.state = state;
    this.stateT = 0;
    this.stateDur = dur;
    this.sd = data;
  }

  /** 目標地点へ移動（AI） */
  moveTo(x, z, speed) {
    this.tx = x;
    this.tz = z;
    this.tSpeed = speed;
    this.input = null;
  }

  faceTo(x, z) {
    this.faceX = x;
    this.faceZ = z;
  }

  /** 物理更新 */
  update(dt, withBall) {
    this.stateT += dt;
    this.kickCd = Math.max(0, this.kickCd - dt);
    this.tackleCd = Math.max(0, this.tackleCd - dt);
    let dvx;
    let dvz;
    let accel = this.accel * (withBall ? 0.85 : 1);
    if (this.state === 'move' || this.state === 'kick' || this.state === 'header' || this.state === 'catch') {
      let wantX;
      let wantZ;
      if (this.input) {
        const sp = this.maxSpeed(this.input.sprint) * (withBall ? 0.9 : 1) * clamp(this.input.mag, 0, 1);
        wantX = this.input.x * sp;
        wantZ = this.input.z * sp;
        this.sprinting = this.input.sprint && this.input.mag > 0.5;
      } else {
        const dx = this.tx - this.x;
        const dz = this.tz - this.z;
        const d = Math.hypot(dx, dz);
        let sp = Math.min(this.tSpeed, this.maxSpeed(this.tSpeed > this.topSpeed * 0.8) * (withBall ? 0.9 : 1));
        // 到着時に減速
        sp = Math.min(sp, Math.sqrt(2 * 7 * Math.max(0, d - 0.15)));
        if (d < 0.2) sp = 0;
        wantX = d > 1e-4 ? (dx / d) * sp : 0;
        wantZ = d > 1e-4 ? (dz / d) * sp : 0;
        this.sprinting = sp > this.topSpeed * 0.8;
      }
      if (this.state === 'kick') {
        wantX *= 0.35;
        wantZ *= 0.35;
      }
      if (this.state === 'header' || this.state === 'catch') {
        wantX *= 0.6;
        wantZ *= 0.6;
      }
      dvx = wantX - this.vx;
      dvz = wantZ - this.vz;
      // 減速は加速より速い
      const cur = this.speed;
      const want = Math.hypot(wantX, wantZ);
      if (want < cur) accel *= 1.8;
      const dl = Math.hypot(dvx, dvz);
      const maxDv = accel * dt;
      if (dl > maxDv) {
        dvx *= maxDv / dl;
        dvz *= maxDv / dl;
      }
      this.vx += dvx;
      this.vz += dvz;
    } else if (this.state === 'slide') {
      const k = this.stateT < 0.55 ? 2.2 : 6;
      this.vx -= this.vx * Math.min(1, k * dt);
      this.vz -= this.vz * Math.min(1, k * dt);
    } else if (this.state === 'dive') {
      const k = this.stateT < this.sd.airTime ? 0.5 : 8;
      this.vx -= this.vx * Math.min(1, k * dt);
      this.vz -= this.vz * Math.min(1, k * dt);
    } else {
      // 倒れている・スローイン等: 止まる
      const k = 8;
      this.vx -= this.vx * Math.min(1, k * dt);
      this.vz -= this.vz * Math.min(1, k * dt);
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // 向き
    const sp = this.speed;
    let wantFacing = null;
    if (this.state === 'move' || this.state === 'catch') {
      if (sp > 0.6 && !(this.faceX !== null && sp < 2.5 && !withBall)) wantFacing = Math.atan2(this.vz, this.vx);
      else if (this.faceX !== null) wantFacing = Math.atan2(this.faceZ - this.z, this.faceX - this.x);
      else if (sp > 0.2) wantFacing = Math.atan2(this.vz, this.vx);
    }
    if (wantFacing !== null) {
      const rate = (this.turnRate - sp * 0.5) * dt;
      this.facing = approachAngle(this.facing, wantFacing, Math.max(rate, 3 * dt));
    }
    this.facing = wrapAngle(this.facing);

    // 体力
    if (this.sprinting && sp > this.topSpeed * 0.75) this.stamina -= dt * (0.012 - this.attrs.stamina * 0.00006);
    else this.stamina = Math.min(1, this.stamina + dt * 0.004);
    this.stamina = clamp(this.stamina, 0.3, 1);

    // 状態の終了
    if (this.state !== 'move' && this.state !== 'hold' && this.state !== 'celebrate' && this.state !== 'wait' && this.stateT >= this.stateDur) {
      this.state = 'move';
      this.sd = {};
    }
    // ジャンプ
    if (this.y > 0 || this.vy !== 0) {
      this.vy -= 9.81 * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }
  }
}
