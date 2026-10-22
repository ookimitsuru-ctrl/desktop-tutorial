import { PITCH, BALL_R } from '../config.js';
import { clamp, lerp } from '../util/math.js';

// GKのAI: ポジショニング（角度を消す）、シュート反応とダイブ、クロス処理、1対1の飛び出し、配球

export class KeeperAI {
  constructor(match, team) {
    this.match = match;
    this.team = team;
    this.holdT = 0;
    this.plan = null;
  }

  get gk() {
    return this.team.players[0];
  }

  goalX() {
    return -this.team.dir * PITCH.HL;
  }

  update(dt) {
    const m = this.match;
    const gk = this.gk;
    const b = m.ball;
    const dir = this.team.dir;
    const gx = this.goalX();
    if (gk.controlled) return;

    if (b.owner === gk) {
      this.distribute(dt);
      return;
    }
    if (gk.state === 'dive' || gk.state === 'fall' || gk.state === 'throw' || gk.state === 'kick') return;

    if (m.phase !== 'play') {
      this.position(dt, 1);
      return;
    }

    // シュートへの反応
    if (!b.owner && this.reactToShot()) return;

    // クロス・浮き球の処理
    if (!b.owner && this.claimCross()) return;

    // 1対1
    const carrier = b.owner;
    if (carrier && carrier.team !== this.team) {
      const ax = carrier.x * -dir; // 自陣ゴールに近いほど大きい
      const dToGoal = Math.hypot(carrier.x - gx, carrier.z);
      if (dToGoal < 17 && Math.abs(carrier.z) < 18 && ax > 30) {
        // 間にDFがいなければ前へ出てコースを消す
        const blockers = this.team.players.filter((p) => p !== gk && Math.hypot(p.x - gx, p.z) < dToGoal - 1 && Math.abs(p.z - carrier.z) < 4);
        if (blockers.length === 0) {
          const t = clamp(dToGoal - 2.2, 1.5, 9) / dToGoal;
          const tx = gx + (carrier.x - gx) * t;
          const tz = carrier.z * t;
          gk.moveTo(tx, tz, gk.topSpeed);
          gk.faceTo(carrier.x, carrier.z);
          const d = Math.hypot(carrier.x - gk.x, carrier.z - gk.z);
          if (d < 1.6 && gk.tackleCd <= 0) {
            gk.tackleCd = 1.2;
            m.keeperSmother(gk, carrier);
          }
          return;
        }
      }
    }
    // ボールが自陣ゴール近くでフリー: 拾いに行く
    if (!b.owner && m.ballSpeed < 9) {
      const inBox = Math.abs(b.x - gx) < PITCH.boxDepth - 1 && Math.abs(b.z) < PITCH.boxHalfW - 1;
      if (inBox) {
        const icpt = m.intercept(gk);
        const opp = m.teams[1 - this.team.index];
        const oppBest = Math.min(...opp.players.map((p) => m.intercept(p).t));
        if (icpt.t < oppBest - 0.1) {
          gk.moveTo(icpt.x, icpt.z, gk.topSpeed);
          gk.faceTo(b.x, b.z);
          return;
        }
      }
    }
    this.position(dt, 0);
  }

  position(dt, setPiece) {
    const m = this.match;
    const gk = this.gk;
    const b = m.ball;
    const gx = this.goalX();
    const dir = this.team.dir;
    const bx = b.owner ? b.owner.x : b.x;
    const bz = b.owner ? b.owner.z : b.z;
    const dx = bx - gx;
    const dz = bz;
    const d = Math.hypot(dx, dz);
    let tx;
    let tz;
    if (d < 45 || setPiece) {
      const depth = clamp(0.8 + (d - 6) * 0.07, 0.6, 4.2);
      tx = gx + (dx / (d || 1)) * depth;
      tz = clamp((dz / (d || 1)) * depth * 1.6, -2.9, 2.9);
      if (Math.abs(tx) > PITCH.HL - 0.3) tx = Math.sign(tx) * (PITCH.HL - 0.3);
    } else {
      // スイーパー的に前へ
      tx = gx + dir * clamp(6 + (d - 45) * 0.25, 6, 16);
      tz = clamp(bz * 0.15, -6, 6);
    }
    const far = Math.hypot(tx - gk.x, tz - gk.z);
    gk.moveTo(tx, tz, far > 3 ? gk.topSpeed * 0.85 : 3.5);
    gk.faceTo(bx, bz);
  }

  /** シュートを検知したらダイブ/キャッチの計画を立てる */
  reactToShot() {
    const m = this.match;
    const gk = this.gk;
    const b = m.ball;
    const gx = this.goalX();
    const toward = -this.team.dir; // 自陣ゴールへ向かう x 方向
    if (b.vx * toward < 4) return false;
    if (this.plan && this.plan.until > m.time) return true;
    const traj = m.traj;
    let cross = null;
    let atGk = null;
    for (let i = 1; i < traj.length; i++) {
      const p = traj[i];
      if (!atGk && (p.x - gk.x) * toward >= 0) atGk = p;
      if ((p.x - gx) * toward >= 0) {
        cross = p;
        break;
      }
    }
    if (!cross) return false;
    const onTarget = Math.abs(cross.z) < PITCH.goalHalfW + 0.25 && cross.y < PITCH.goalH + 0.25;
    if (!onTarget || cross.t > 2.2) return false;
    if (!atGk) atGk = cross;
    // GKの位置で受け止めるべき点
    const pt = atGk;
    const lateral = Math.hypot(pt.z - gk.z, (pt.x - gk.x) * 0.5);
    const height = pt.y;
    const skill = gk.attrs.gk / 100;
    const reaction = lerp(0.3, 0.14, skill) * m.aiReactionScale(this.team);
    const avail = pt.t - reaction;
    const diveSpeed = 4.4 + skill * 2.4;
    const reach = 0.9 + Math.max(0, avail) * diveSpeed;
    const maxReach = 3.0 + skill * 0.8;
    const sp = m.ballSpeed;
    let pSave;
    if (avail < 0.02) pSave = lateral < 0.5 ? 0.6 : 0.05;
    else if (lateral > Math.min(reach, maxReach)) pSave = 0.03;
    else {
      const effort = lateral / Math.min(reach, maxReach);
      pSave = (0.74 + skill * 0.26) * (1 - effort * effort * 0.5) * (1 - clamp((sp - 22) * 0.02, 0, 0.35));
      if (height > 2.1 && lateral > 1.5) pSave *= 0.8;
      if (height < 0.4 && lateral > 2.0) pSave *= 0.88;
    }
    pSave = clamp(pSave * m.gkSaveBonus(this.team), 0, 0.97);
    const save = m.rng() < pSave;
    const catchable = sp < 21 && lateral < 1.6 && height < 2.0 && m.rng() < 0.45 + skill * 0.4;
    this.plan = { until: m.time + pt.t + 0.6, save, catchable, pt, cross };
    m.emit({ type: 'shotfaced', gk, pSave, save });
    if (lateral > 0.75) {
      // ダイブ: 体の左右（ローカル）を判定
      const fx = Math.cos(gk.facing);
      const fz = Math.sin(gk.facing);
      const side = Math.sign(fz * (pt.x - gk.x) - fx * (pt.z - gk.z)) || 1; // +1 = 左手側
      const airTime = clamp(pt.t - reaction, 0.25, 0.8);
      gk.setState('dive', 1.6, {
        side,
        height: clamp((height - 0.3) / 1.8, 0, 1),
        airTime,
        start: m.time + Math.max(0, reaction - 0.05),
        plan: this.plan,
      });
      // ダイブの速度
      const ddx = pt.x - gk.x;
      const ddz = pt.z - gk.z;
      const dd = Math.hypot(ddx, ddz) || 1;
      const reachUse = Math.min(dd - 0.4, maxReach);
      const v = Math.max(0, reachUse) / Math.max(0.25, airTime);
      gk.vx = (ddx / dd) * v * (save ? 1 : 0.85);
      gk.vz = (ddz / dd) * v * (save ? 1 : 0.85);
      gk.vy = height > 0.8 ? Math.sqrt(2 * 9.81 * Math.min(0.6, height * 0.35)) : 0;
    } else {
      gk.setState('catch', 0.7, { plan: this.plan, height });
      gk.moveTo(pt.x, pt.z, 3);
    }
    return true;
  }

  claimCross() {
    const m = this.match;
    const gk = this.gk;
    const b = m.ball;
    if (b.y < 1.0 && b.vy <= 0) return false;
    if (m.ballSpeed < 6) return false;
    const gx = this.goalX();
    const traj = m.traj;
    // GKが届く高さでゴールエリア付近に落ちてくる点
    let best = null;
    for (let i = 1; i < traj.length; i++) {
      const p = traj[i];
      if (p.y > 2.75 || p.vy > 0) continue;
      const inArea = Math.abs(p.x - gx) < 9 && Math.abs(p.z) < 11;
      if (!inArea) continue;
      const d = Math.hypot(p.x - gk.x, p.z - gk.z);
      const tNeed = gk.reaction + d / (gk.topSpeed * 0.9);
      if (tNeed < p.t) {
        best = p;
        break;
      }
    }
    if (!best) return false;
    // 相手より先に触れるか
    const opp = m.teams[1 - this.team.index];
    for (const o of opp.players) {
      const d = Math.hypot(best.x - o.x, best.z - o.z);
      if (o.reaction + d / o.topSpeed < best.t - 0.25) return false;
    }
    gk.moveTo(best.x, best.z, gk.topSpeed);
    gk.faceTo(b.x, b.z);
    gk.sd.claim = best;
    return true;
  }

  /** ボール保持中: しばらく持ってから配球 */
  distribute(dt) {
    const m = this.match;
    const gk = this.gk;
    if (gk.state === 'throw' || gk.state === 'kick' || gk.state === 'dive') return;
    if (gk.state !== 'hold') {
      gk.setState('hold', 99);
      this.holdT = 1.4 + m.rng() * 1.4;
      gk.vx *= 0.3;
      gk.vz *= 0.3;
    }
    this.holdT -= dt;
    // 少し前に歩く
    const dir = this.team.dir;
    gk.moveTo(this.goalX() + dir * 9, gk.z * 0.9, 1.5);
    if (this.holdT > 0) return;
    // 近くのフリーな味方へスロー、いなければロングキック
    let best = null;
    let bestScore = -Infinity;
    for (const p of this.team.players) {
      if (p === gk) continue;
      const d = Math.hypot(p.x - gk.x, p.z - gk.z);
      if (d < 8 || d > 32) continue;
      const free = m.nearestOpponentDist(p);
      const score = free * 1.5 - d * 0.2 + (p.x * dir) * 0.05;
      if (free > 7 && score > bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best && m.rng() < 0.75) {
      m.keeperThrow(gk, best);
    } else {
      // パント: 前線の味方の方向へ
      const fwd = this.team.players.filter((p) => p.role === 'FW' || p.role === 'MF');
      const tgt = fwd[Math.floor(m.rng() * fwd.length)];
      const tx = clamp(tgt.x + dir * 6, -45, 45);
      m.keeperPunt(gk, tx, clamp(tgt.z, -28, 28));
    }
  }
}

export const GK_CONST = { BALL_R };
