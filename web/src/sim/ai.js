import { PITCH } from '../config.js';
import { clamp, lerp, smoothstep } from '../util/math.js';
import { groundPassSpeed } from './ball.js';

// チームAI: フォーメーションに基づくポジショニング、守備時のプレス/カバー/マーク、
// 攻撃時のサポートと裏抜け、ボール保持者の判断（シュート/パス/ドリブル）

const ROLL_C0 = 0.85;
const ROLL_C1 = 0.32;

/** 地上パスの到達時間（解析解） */
export function groundTime(v0, va) {
  return (1 / ROLL_C1) * Math.log((ROLL_C0 + ROLL_C1 * v0) / (ROLL_C0 + ROLL_C1 * va));
}

export class TeamAI {
  constructor(match, team) {
    this.match = match;
    this.team = team;
    this.roleT = 0;
    this.presser = null;
    this.cover = null;
    this.supporters = [];
    this.runner = null;
    this.runnerT = 0;
    this.markAssign = new Map();
  }

  get dir() {
    return this.team.dir;
  }

  /** 攻撃方向基準の座標へ */
  ax(x) {
    return x * this.team.dir;
  }

  get opp() {
    return this.match.teams[1 - this.team.index];
  }

  /** 位置の価値（攻撃側から見た脅威度）。ax, az は攻撃方向座標 */
  value(ax, az) {
    const gx = PITCH.HL;
    const d = Math.hypot(gx - ax, az);
    const ang = Math.abs(Math.atan2(az, gx - ax));
    const angF = 1 - smoothstep(0.6, 1.35, ang);
    return 0.03 + 0.55 * Math.exp(-d / 13) * (0.35 + 0.65 * angF) + 0.12 * ((ax + PITCH.HL) / PITCH.L);
  }

  /** 相手に奪われた場合の損失（自陣ゴールに近いほど大） */
  lossCost(ax, az) {
    const d = Math.hypot(ax + PITCH.HL, az);
    return 0.04 + 0.4 * Math.exp(-d / 16);
  }

  /** 相手の最終ライン（オフサイドライン）攻撃方向座標 */
  offsideLine() {
    const xs = this.opp.players.map((p) => this.ax(p.x)).sort((a, b) => b - a);
    const second = xs[1] ?? 0;
    const bx = this.ax(this.match.ball.x);
    return Math.max(second, bx, 0);
  }

  phase() {
    const m = this.match;
    const b = m.ball;
    if (b.owner) return b.owner.team === this.team ? 'attack' : 'defend';
    if (m.lastPossession === this.team.index && m.time - m.lastPossessionT < 1.2) return 'attack';
    if (m.lastPossession === 1 - this.team.index && m.time - m.lastPossessionT < 1.2) return 'defend';
    return 'loose';
  }

  /** フォーメーション上の基本位置（ワールド座標） */
  formationSpot(p, phase) {
    const m = this.match;
    const b = m.ball;
    const bx = this.ax(b.owner ? b.owner.x : b.x);
    const bz = (b.owner ? b.owner.z : b.z) * this.dir;
    const st = this.team.data.style;
    const s = p.slot;
    let defLine;
    let fwdLine;
    let width;
    let pull;
    if (phase === 'attack') {
      defLine = clamp(bx - 32, -38, 6);
      fwdLine = clamp(bx + 16, 4, 40);
      const off = this.offsideLine();
      fwdLine = Math.min(fwdLine, off - 0.8);
      width = 25 + st.width * 7;
      pull = 0.22;
    } else {
      defLine = clamp(bx - 16, -45, -4 + st.pressing * 10);
      fwdLine = clamp(defLine + 25 + st.pressing * 6, -22, 18);
      width = 19 + st.width * 3;
      pull = 0.38;
    }
    const t = clamp((s.x + 0.72) / 0.86, 0, 1.05);
    let ax = lerp(defLine, fwdLine, t);
    let az = s.z * width + bz * pull;
    // サイドバックの攻撃参加
    if (phase === 'attack' && (s.pos === 'LB' || s.pos === 'RB' || s.pos === 'LWB' || s.pos === 'RWB')) {
      if (Math.sign(s.z) === Math.sign(bz) && bx > -10) ax += 10;
    }
    // FW は前残り気味
    if (phase !== 'attack' && p.role === 'FW') ax = Math.max(ax, -6);
    ax = clamp(ax, -PITCH.HL + 6, PITCH.HL - 4);
    az = clamp(az, -PITCH.HW + 2.5, PITCH.HW - 2.5);
    return { x: ax * this.dir, z: az * this.dir, ax, az };
  }

  /** 毎ステップ: 全選手の目標を決める */
  update(dt) {
    const m = this.match;
    if (m.phase !== 'play') return;
    const b = m.ball;
    const phase = this.phase();
    this.roleT -= dt;
    if (this.roleT <= 0) {
      this.roleT = 0.18;
      this.assignRoles(phase);
    }
    for (const p of this.team.players) {
      if (p.isGK) continue;
      if (p.controlled || p.busy) continue;
      if (b.owner === p) {
        this.carrier(p, dt);
        continue;
      }
      if (b.passTarget === p && !b.owner) {
        // パスの受け手: ボールに寄る
        const ic = m.intercept(p);
        if (ic.t < Infinity) p.moveTo(ic.x, ic.z, Math.max(4, Math.min(p.topSpeed, ic.d / Math.max(0.2, ic.t) + 1.5)));
        else p.moveTo(b.x, b.z, p.topSpeed);
        p.faceTo(b.x, b.z);
        continue;
      }
      if (phase === 'defend') this.defend(p);
      else if (phase === 'attack') this.support(p);
      else this.loose(p);
    }
  }

  assignRoles(phase) {
    const m = this.match;
    const b = m.ball;
    const outfield = this.team.players.filter((p) => !p.isGK && p.state !== 'fall');
    this.presser = null;
    this.cover = null;
    this.chaser = null;
    this.chaser2 = null;
    if (phase === 'defend' && b.owner) {
      const c = b.owner;
      const sorted = outfield
        .map((p) => ({ p, d: Math.hypot(p.x - c.x, p.z - c.z) - (this.ax(p.x) < this.ax(c.x) ? 2 : 0) }))
        .sort((a, b2) => a.d - b2.d);
      this.presser = sorted[0]?.p ?? null;
      this.cover = sorted[1]?.p ?? null;
      this.computeMarking(outfield);
    } else if (phase === 'loose' || phase === 'defend' || (phase === 'attack' && !b.owner)) {
      let best = null;
      let second = null;
      for (const p of outfield) {
        const ic = m.intercept(p);
        if (!best || ic.t < best.t) {
          second = best;
          best = { p, t: ic.t, ic };
        } else if (!second || ic.t < second.t) second = { p, t: ic.t, ic };
      }
      this.chaser = best?.p ?? null;
      if (second && best && second.t - best.t < 0.6) this.chaser2 = second.p;
      this.computeMarking(outfield);
    }
    if (phase === 'attack' && b.owner && b.owner.team === this.team) this.chooseSupport(outfield, b.owner);
  }

  /** 守備時のマーク割り当て（危険な相手から順に、近い味方を割り当てる） */
  computeMarking(outfield) {
    this.markAssign.clear();
    const opps = this.opp.players.filter((o) => !o.isGK);
    const scored = opps
      .map((o) => ({ o, danger: this.opp.ai.value(this.opp.ai.ax(o.x), o.z * this.opp.dir) }))
      .sort((a, b) => b.danger - a.danger);
    const free = new Set(outfield.filter((p) => p !== this.presser && p !== this.chaser));
    for (const { o, danger } of scored) {
      if (danger < 0.12) continue;
      let best = null;
      let bd = 16;
      for (const p of free) {
        const spot = this.formationSpot(p, 'defend');
        const d = Math.hypot(spot.x - o.x, spot.z - o.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) {
        this.markAssign.set(best, o);
        free.delete(best);
      }
    }
  }

  defend(p) {
    const m = this.match;
    const b = m.ball;
    const c = b.owner;
    const gx = -this.dir * PITCH.HL;
    if (p === this.presser && c) {
      // 相手の進路の先（ゴール側）に回り込んで寄せる
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const lead = clamp(d / (p.topSpeed + 1), 0.15, 1.3);
      const ax = c.x + c.vx * lead;
      const az = c.z + c.vz * lead;
      const dx = gx - ax;
      const dz = -az;
      const dl = Math.hypot(dx, dz) || 1;
      const off = d > 4 ? 1.6 : 0.7;
      const tx = ax + (dx / dl) * off;
      const tz = az + (dz / dl) * off;
      const urgency = 0.75 + this.team.data.style.pressing * 0.25;
      p.moveTo(tx, tz, d > 3 ? p.topSpeed * urgency : 4.5);
      p.faceTo(c.x, c.z);
      // タックル判断
      if (d < 1.5 && p.tackleCd <= 0) {
        m.tryTackle(p, c);
      } else if (d > 1.6 && d < 3.2 && p.tackleCd <= 0 && !p.controlled) {
        const behind = Math.cos(c.facing) * (p.x - c.x) + Math.sin(c.facing) * (p.z - c.z) < 0;
        const inOwnBox = Math.abs(c.x - gx) < PITCH.boxDepth && Math.abs(c.z) < PITCH.boxHalfW;
        const chance = m.aiSlideChance(this.team) * (behind ? 0.3 : 1) * (inOwnBox ? 0.25 : 1);
        if (m.rng() < chance) m.startSlide(p, Math.atan2(c.z + c.vz * 0.3 - p.z, c.x + c.vx * 0.3 - p.x));
        else p.tackleCd = 0.5;
      }
      return;
    }
    if (p === this.cover && c) {
      // プレスする味方の背後、ボールとゴールの間
      const t = 0.3;
      const tx = c.x + (gx - c.x) * t;
      const tz = c.z * (1 - t);
      p.moveTo(tx, tz, p.topSpeed * 0.8);
      p.faceTo(c.x, c.z);
      return;
    }
    if (p === this.chaser || p === this.chaser2) {
      this.loose(p);
      return;
    }
    const spot = this.formationSpot(p, 'defend');
    let tx = spot.x;
    let tz = spot.z;
    const mark = this.markAssign.get(p);
    if (mark) {
      // マークする相手とゴールの間、少しボール寄り
      const dx = gx - mark.x;
      const dz = -mark.z;
      const dl = Math.hypot(dx, dz) || 1;
      const k = 1.6;
      const bx = b.x - mark.x;
      const bz = b.z - mark.z;
      const bl = Math.hypot(bx, bz) || 1;
      const mx = mark.x + (dx / dl) * k + (bx / bl) * 0.8;
      const mz = mark.z + (dz / dl) * k + (bz / bl) * 0.8;
      const w = this.ax(mark.x) < -20 ? 0.85 : 0.6;
      tx = lerp(spot.x, mx, w);
      tz = lerp(spot.z, mz, w);
    }
    const d = Math.hypot(tx - p.x, tz - p.z);
    p.moveTo(tx, tz, d > 6 ? p.topSpeed * 0.85 : d > 2 ? 4.2 : 2.5);
    p.faceTo(b.x, b.z);
  }

  loose(p) {
    const m = this.match;
    const b = m.ball;
    if (p === this.chaser || p === this.chaser2) {
      const ic = m.intercept(p);
      if (ic.t < Infinity) p.moveTo(ic.x, ic.z, p.topSpeed);
      else p.moveTo(b.x, b.z, p.topSpeed);
      p.faceTo(b.x, b.z);
      return;
    }
    const ph = m.lastPossession === this.team.index ? 'attack' : 'defend';
    const spot = this.formationSpot(p, ph);
    const d = Math.hypot(spot.x - p.x, spot.z - p.z);
    p.moveTo(spot.x, spot.z, d > 6 ? p.topSpeed * 0.8 : 4);
    p.faceTo(b.x, b.z);
  }

  /** 攻撃時: パスコースを作る、裏へ抜ける */
  chooseSupport(outfield, carrier) {
    const m = this.match;
    const sorted = outfield
      .filter((p) => p !== carrier)
      .map((p) => ({ p, d: Math.hypot(p.x - carrier.x, p.z - carrier.z) }))
      .sort((a, b) => a.d - b.d);
    this.supporters = sorted.slice(0, 2).map((s) => s.p);
    // 裏抜け役: 前線の選手で、ボール保持者が前を向いている時
    const cax = this.ax(carrier.x);
    this.runnerT -= 0.18;
    if (this.runnerT <= 0) {
      this.runnerT = 1.5 + m.rng() * 1.5;
      const fws = outfield.filter((p) => p !== carrier && (p.role === 'FW' || (p.slot.pos === 'AM' || p.slot.pos === 'LM' || p.slot.pos === 'RM')));
      this.runner = cax > -15 && fws.length && m.rng() < 0.75 ? fws[Math.floor(m.rng() * fws.length)] : null;
    }
  }

  support(p) {
    const m = this.match;
    const b = m.ball;
    const c = b.owner;
    if (!c) {
      this.loose(p);
      return;
    }
    const spot = this.formationSpot(p, 'attack');
    let tx = spot.x;
    let tz = spot.z;
    let speed = 4.5;
    if (p === this.runner) {
      // オフサイドラインぎりぎりで待ち、タイミングを見て裏へ
      const off = this.offsideLine();
      const ax = Math.min(off - 0.4, PITCH.HL - 8);
      tx = ax * this.dir;
      tz = clamp(spot.z * 0.7, -24, 24);
      speed = p.topSpeed * 0.8;
    } else if (this.supporters.includes(p)) {
      const best = this.bestSupportSpot(p, c, spot);
      tx = best.x;
      tz = best.z;
      speed = 5.5;
    }
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (d > 8) speed = Math.max(speed, p.topSpeed * 0.8);
    p.moveTo(tx, tz, speed);
    p.faceTo(b.x, b.z);
  }

  bestSupportSpot(p, c, spot) {
    // ボール保持者の周囲でパスコースが空いていて前向きな場所
    if (p._supT > this.match.time && p._sup) return p._sup;
    let best = null;
    let bestS = -Infinity;
    const opp = this.opp.players;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      for (const r of [9, 15]) {
        const x = c.x + Math.cos(a) * r;
        const z = c.z + Math.sin(a) * r;
        if (Math.abs(z) > PITCH.HW - 2 || Math.abs(x) > PITCH.HL - 3) continue;
        let free = 99;
        let lane = 99;
        for (const o of opp) {
          free = Math.min(free, Math.hypot(o.x - x, o.z - z));
          // パスコース上の相手
          const vx = x - c.x;
          const vz = z - c.z;
          const l2 = vx * vx + vz * vz;
          const t = clamp(((o.x - c.x) * vx + (o.z - c.z) * vz) / l2, 0, 1);
          lane = Math.min(lane, Math.hypot(o.x - (c.x + vx * t), o.z - (c.z + vz * t)));
        }
        const ax = this.ax(x);
        const off = this.offsideLine();
        if (ax > off - 0.3) continue;
        const s = Math.min(free, 8) * 0.25 + Math.min(lane, 5) * 0.35 + this.value(ax, z * this.dir) * 4 - Math.hypot(x - spot.x, z - spot.z) * 0.06 - Math.hypot(x - p.x, z - p.z) * 0.05;
        if (s > bestS) {
          bestS = s;
          best = { x, z };
        }
      }
    }
    p._sup = best || spot;
    p._supT = this.match.time + 0.8;
    return p._sup;
  }

  // ---------------------------------------------------------------- ボール保持者

  carrier(p, dt) {
    const m = this.match;
    p.decideT -= dt;
    if (p.decideT > 0 && p.sd.dribble) {
      const d = p.sd.dribble;
      p.moveTo(d.x, d.z, d.speed);
      return;
    }
    const tempo = this.team.data.style.tempo;
    p.decideT = lerp(0.42, 0.22, tempo) * m.aiReactionScale(this.team) * (0.8 + m.rng() * 0.4);
    // 寄せられていたら早く判断する
    if (this.pressureOn(p).nd < 3) p.decideT *= 0.5;
    // ボールを受けた直後は少し間を置く
    if (m.time - m.possessionStartT < 0.18) {
      p.sd.dribble = { x: p.x + Math.cos(p.facing) * 2, z: p.z + Math.sin(p.facing) * 2, speed: 3 };
      return;
    }
    const choice = this.decide(p);
    this.execute(p, choice);
  }

  pressureOn(p) {
    let nd = 99;
    for (const o of this.opp.players) nd = Math.min(nd, Math.hypot(o.x - p.x, o.z - p.z));
    return { nd, pressure: 1 - smoothstep(1.2, 5, nd) };
  }

  /** ボール進路上で相手がどれだけ間に合うか（大きいほど安全, 秒） */
  laneMargin(x0, z0, x1, z1, v0, va, exclude = null) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    const avg = (v0 + va) / 2;
    let minM = 9;
    const steps = Math.max(2, Math.ceil(d / 3));
    for (let i = 0; i <= steps; i++) {
      const f = i === 0 ? Math.min(0.9 / Math.max(d, 1), 0.5) : i / steps;
      const px = x0 + (x1 - x0) * f;
      const pz = z0 + (z1 - z0) * f;
      const tb = (d * f) / avg;
      for (const o of this.opp.players) {
        if (o === exclude) continue;
        const reach = o.isGK && this.isInOppBox(px, pz) ? 1.6 : 0.9;
        const to = o.reaction + Math.max(0, Math.hypot(o.x - px, o.z - pz) - reach) / (o.topSpeed * 0.92);
        minM = Math.min(minM, to - tb);
      }
    }
    return minM;
  }

  isInOppBox(x, z) {
    const ax = this.ax(x);
    return ax > PITCH.HL - PITCH.boxDepth && Math.abs(z) < PITCH.boxHalfW;
  }

  decide(p) {
    const m = this.match;
    const b = m.ball;
    const dir = this.dir;
    const pax = this.ax(p.x);
    const paz = p.z * dir;
    const { nd, pressure } = this.pressureOn(p);
    const st = this.team.data.style;
    const opts = [];
    const lossHere = this.lossCost(pax, paz);
    const noise = m.aiNoise(this.team);

    // ボールを保持していること自体の価値（自陣でも安全なパスを選ぶ）
    const KEEP = 0.09;
    // チームとして長くボールを持つほど前進したくなる
    const teamHeld = m.time - (this.team.possSince ?? m.time);
    const urge = 0.25 + Math.min(1, teamHeld / 10) * (0.6 + st.directness * 0.6);
    const prog = (tx) => ((this.ax(tx) - pax) / 52) * 0.12 * urge;

    // --- シュート
    const shot = this.evalShot(p, urge);
    if (shot) opts.push({ kind: 'shot', score: shot.score * (0.85 + st.shootiness * 0.3) + 0.06 + Math.max(0, urge - 0.6) * 0.05, shot });
    // ボールを持っている時間が長いほどパスを出したくなる
    const held = m.time - m.possessionStartT;
    const passBias = 0.012 + st.tempo * 0.02 + Math.min(held, 4) * 0.006;

    // --- パス
    for (const t of this.team.players) {
      if (t === p || t.state === 'fall') continue;
      const tax = this.ax(t.x);
      const dist = Math.hypot(t.x - p.x, t.z - p.z);
      if (dist < 4 || dist > 55) continue;
      // 地上パス（足元）
      {
        const lead = 0.5;
        const rx = t.x + t.vx * lead;
        const rz = t.z + t.vz * lead;
        const d = Math.hypot(rx - p.x, rz - p.z);
        const va = d > 22 ? 7 : 5.5;
        const v0 = groundPassSpeed(d, va);
        if (v0 < 30) {
          const margin = this.laneMargin(p.x, p.z, rx, rz, v0, va, null);
          let pSafe = 1 / (1 + Math.exp(-(margin - 0.12) * 9));
          const recvP = this.pressureAt(rx, rz, t);
          pSafe *= 1 - recvP * 0.35;
          const off = this.offsideRisk(t);
          const val = this.value(this.ax(rx), rz * dir);
          const space = Math.min(this.match.nearestOpponentDist(t), 7);
          let score = pSafe * (val + KEEP + space * 0.004 + passBias + prog(rx)) - (1 - pSafe) * this.lossCost(this.ax(rx), rz * dir) - off;
          // 後ろ向きのパスは少し割り引く
          if (tax < pax - 5) score -= 0.01 * (1 - pressure);
          if (t.isGK) score -= 0.08;
          opts.push({ kind: 'pass', t, x: rx, z: rz, v0, score, pSafe });
        }
      }
      // スルーパス（前線の裏へ）
      const offLine = this.offsideLine();
      if ((t.role === 'FW' || t.role === 'MF') && tax > pax - 3 && tax > offLine - 8) {
        const runLen = clamp(Math.max(offLine + 7 - tax, 6) + (t.speed > 5 ? 3 : 0), 6, 16);
        let tx = this.ax(t.x) + runLen;
        let tz = t.z * dir * 0.85;
        tx = Math.min(tx, PITCH.HL - 6);
        tz = clamp(tz, -PITCH.HW + 4, PITCH.HW - 4);
        const wx = tx * dir;
        const wz = tz * dir;
        const d = Math.hypot(wx - p.x, wz - p.z);
        const recvT = t.reaction * 0.5 + Math.hypot(wx - t.x, wz - t.z) / (t.topSpeed * 0.95);
        const va = 3;
        const v0 = groundPassSpeed(d, va);
        const tb = groundTime(v0, va);
        if (v0 < 30 && tb > recvT - 0.6) {
          const margin = this.laneMargin(p.x, p.z, wx, wz, v0, va, null);
          // 受け手より先に相手が着くか
          let oppFirst = 9;
          for (const o of this.opp.players) {
            const to = o.reaction + Math.max(0, Math.hypot(o.x - wx, o.z - wz) - (o.isGK ? 1.8 : 1)) / (o.topSpeed * 0.95);
            oppFirst = Math.min(oppFirst, to - Math.max(tb, recvT));
          }
          const pSafe = (1 / (1 + Math.exp(-(margin + 0.05) * 7))) * (1 / (1 + Math.exp(-(oppFirst + 0.2) * 5)));
          const off = this.offsideRisk(t);
          const val = this.value(tx, tz) * 1.2 + 0.02;
          const score = pSafe * (val + KEEP + prog(wx)) - (1 - pSafe) * lossHere * 0.7 - off;
          opts.push({ kind: 'through', t, x: wx, z: wz, v0, score, pSafe });
        }
      }
      // ロングボール/クロス
      const crossing = this.isInOppBox(t.x, t.z) && Math.abs(paz) > 13 && pax > 25;
      if (dist > 26 || crossing) {
        const rx = t.x + t.vx * 1.0;
        const rz = t.z + t.vz * 1.0;
        // 滞空時間のあいだに誰が先に落下点へ着くか
        const flight = 0.6 + dist / 18;
        const tMe = t.reaction + Math.max(0, Math.hypot(t.x - rx, t.z - rz) - 0.8) / (t.topSpeed * 0.9);
        let contest = 9;
        for (const o of this.opp.players) {
          const reach = o.isGK && crossing ? 2.2 : 0.9;
          const tO = o.reaction + Math.max(0, Math.hypot(o.x - rx, o.z - rz) - reach) / (o.topSpeed * 0.9);
          contest = Math.min(contest, Math.max(tO, flight) - Math.max(tMe, flight));
        }
        const pSafe = (1 / (1 + Math.exp(-(contest - 0.15) * 4))) * (crossing ? 0.72 : 0.82) * lerp(0.8, 1, p.attrs.passing / 100);
        const val = this.value(this.ax(rx), rz * dir) * (crossing ? 0.9 : 0.85);
        const score = pSafe * (val + KEEP + prog(rx)) - (1 - pSafe) * this.lossCost(this.ax(rx), rz * dir) * 0.6 - this.offsideRisk(t) + st.directness * 0.015 - 0.02;
        opts.push({ kind: crossing ? 'cross' : 'lob', t, x: rx, z: rz, score, pSafe });
      }
    }

    // --- ドリブル
    const baseA = dir > 0 ? 0 : Math.PI;
    const dribAngles = [0, -0.5, 0.5, -1.0, 1.0, -1.5, 1.5, 2.4, -2.4];
    for (const da of dribAngles) {
      const a = baseA + da;
      const L = 4;
      const x = p.x + Math.cos(a) * L;
      const z = p.z + Math.sin(a) * L;
      if (Math.abs(z) > PITCH.HW - 1.5 || Math.abs(x) > PITCH.HL - 1) continue;
      let space = 99;
      for (const o of this.opp.players) {
        const dO = Math.hypot(o.x - x, o.z - z);
        space = Math.min(space, dO - L * 0.75);
      }
      const skill = p.attrs.dribbling / 100;
      // すぐ近くに相手がいる状態でのドリブルはそれだけで奪われやすい
      const close = 1 - smoothstep(1.0, 3.2, nd);
      const pSafe = (1 / (1 + Math.exp(-(space - 0.6 + skill * 1.2) * 1.5))) * (1 - close * (0.55 - skill * 0.25));
      const val = this.value(this.ax(x), z * dir);
      const toBox = this.ax(x) > PITCH.HL - 26 && Math.abs(z) < PITCH.boxHalfW + 4 ? 0.02 : 0;
      // 正面から寄せてくる相手がいる方向へのドリブルは避ける
      let block = 0;
      for (const o of this.opp.players) {
        const ox = o.x - p.x;
        const oz = o.z - p.z;
        const od = Math.hypot(ox, oz);
        if (od < 3.5 && (ox * Math.cos(a) + oz * Math.sin(a)) / (od || 1) > 0.6) block = Math.max(block, 1 - od / 3.5);
      }
      const dribBias = (skill - 0.8) * 0.06 - pressure * 0.05 - block * 0.12 - Math.min(held, 5) * 0.006 + toBox;
      const score = pSafe * (val + KEEP + prog(x)) - (1 - pSafe) * this.lossCost(this.ax(x), z * dir) + dribBias;
      opts.push({ kind: 'dribble', x, z, a, score, pSafe, space });
    }

    // --- 自陣で囲まれたらクリア
    if (pax < -32 && pressure > 0.75) {
      opts.push({ kind: 'clear', score: 0.04 + pressure * 0.03 });
    }

    // ノイズ（難易度・チームの判断力）
    for (const o of opts) o.score += m.rngGauss() * noise;
    opts.sort((a, b2) => b2.score - a.score);
    void b;
    return opts[0] || { kind: 'dribble', x: p.x + dir * 3, z: p.z, score: 0 };
  }

  pressureAt(x, z, exclude) {
    let nd = 99;
    for (const o of this.opp.players) nd = Math.min(nd, Math.hypot(o.x - x, o.z - z));
    void exclude;
    return 1 - smoothstep(1.5, 6, nd);
  }

  offsideRisk(t) {
    if (!this.match.settings.offside) return 0;
    const tax = this.ax(t.x);
    const off = this.offsideLine();
    if (tax > off + 0.2) return 0.5;
    return 0;
  }

  evalShot(p, urge = 0.25) {
    const m = this.match;
    const dir = this.dir;
    const gx = PITCH.HL * dir;
    const d = Math.hypot(gx - p.x, p.z);
    if (d > 32) return null;
    // ポストの見込み角
    const a1 = Math.atan2(PITCH.goalHalfW - p.z * dir, PITCH.HL - this.ax(p.x));
    const a2 = Math.atan2(-PITCH.goalHalfW - p.z * dir, PITCH.HL - this.ax(p.x));
    const ang = Math.abs(a1 - a2);
    let xg = clamp(1.25 * ang * Math.exp(-Math.max(0, d - 7) / 11), 0, 0.85);
    // シュートコース上の相手
    let block = 1;
    for (const o of this.opp.players) {
      if (o.isGK) continue;
      const vx = gx - p.x;
      const vz = -p.z;
      const l2 = vx * vx + vz * vz;
      const t = ((o.x - p.x) * vx + (o.z - p.z) * vz) / l2;
      if (t < 0.02 || t > 1) continue;
      const lat = Math.abs(((o.x - p.x) * vz - (o.z - p.z) * vx) / Math.sqrt(l2));
      const coneHalf = PITCH.goalHalfW * t + 0.4;
      if (lat < coneHalf) block *= 0.55 + 0.4 * (lat / coneHalf);
    }
    xg *= block;
    // GKとの距離（前に出ている時は角度が狭い）
    const gk = this.opp.players[0];
    const gkd = Math.hypot(gk.x - p.x, gk.z - p.z);
    if (gkd < 3 && d > 6) xg *= 0.6;
    xg *= lerp(0.7, 1.15, p.attrs.shooting / 100);
    const { pressure } = this.pressureOn(p);
    xg *= 1 - pressure * 0.25;
    const thresh = lerp(0.05, 0.025, this.team.data.style.shootiness) * (urge > 0.8 ? 0.7 : 1);
    if (xg < thresh * 0.7) return null;
    const inBox = this.isInOppBox(p.x, p.z);
    return { xg, score: xg * 1.7 + (inBox ? 0.04 : 0) + (d < 12 ? 0.05 : 0) };
  }

  /** シュートの狙いを決める（GKから遠いサイド） */
  shotTarget(p) {
    const m = this.match;
    const dir = this.dir;
    const gx = PITCH.HL * dir;
    const gk = this.opp.players[0];
    const leftSpace = Math.abs(-PITCH.goalHalfW - gk.z);
    const rightSpace = Math.abs(PITCH.goalHalfW - gk.z);
    let side = leftSpace > rightSpace ? -1 : 1;
    if (m.rng() < 0.25) side = -side;
    const tz = side * (PITCH.goalHalfW - 0.75 - m.rng() * 1.2);
    const ty = m.rng() < 0.55 ? 0.25 + m.rng() * 0.5 : 0.9 + m.rng() * 1.1;
    return { x: gx, y: ty, z: tz };
  }

  execute(p, c) {
    const m = this.match;
    p.sd.dribble = null;
    switch (c.kind) {
      case 'shot': {
        const tgt = this.shotTarget(p);
        const d = Math.hypot(tgt.x - p.x, tgt.z - p.z);
        const power = clamp(0.55 + d / 40 + m.rng() * 0.2, 0.5, 1);
        m.kickShot(p, tgt, power, m.rng() < 0.3 ? (m.rng() - 0.5) * 8 : 0);
        break;
      }
      case 'pass':
        m.kickPass(p, c.t, c.x, c.z, 'pass');
        break;
      case 'through':
        m.kickPass(p, c.t, c.x, c.z, 'through');
        break;
      case 'lob':
      case 'cross':
        m.kickLob(p, c.t, c.x, c.z, c.kind);
        break;
      case 'clear': {
        const tx = clamp(p.x + this.dir * 38, -42, 42);
        const tz = clamp(p.z * 0.5 + (m.rng() - 0.5) * 16, -22, 22);
        m.kickLob(p, null, tx, tz, 'clear');
        break;
      }
      default: {
        const space = c.space ?? 3;
        const speed = space > 3 ? p.topSpeed : space > 1 ? p.topSpeed * 0.8 : 4.5;
        p.sd.dribble = { x: c.x, z: c.z, speed };
        p.moveTo(c.x, c.z, speed);
      }
    }
  }

  // ---------------------------------------------------------------- セットプレー

  /** セットプレー時の配置（ワールド座標）を返す */
  setPiecePositions(sp) {
    const m = this.match;
    const dir = this.dir;
    const attacking = sp.team === this.team;
    const out = new Map();
    const bx = sp.x;
    const bz = sp.z;
    const players = this.team.players;
    const gk = players[0];
    const ownGoalX = -dir * PITCH.HL;
    const oppGoalX = dir * PITCH.HL;
    const gkSpot = { x: ownGoalX + dir * 0.6, z: 0 };
    switch (sp.type) {
      case 'kickoff': {
        for (const p of players) {
          const s = p.slot;
          let ax = clamp(-PITCH.HL * 0.9 + (s.x + 1) * 0.5 * PITCH.HL * 0.95, -50, -1.2);
          let az = s.z * 26;
          if (!attacking) {
            // センターサークルの外
            const r = Math.hypot(ax, az);
            if (r < PITCH.circleR + 0.8) {
              const k = (PITCH.circleR + 1) / (r || 1);
              ax *= k;
              az *= k;
            }
          }
          out.set(p, { x: ax * dir, z: az * dir });
        }
        if (attacking) {
          const fws = players.filter((p) => p !== sp.taker && (p.role === 'FW' || p.slot.pos === 'AM')).slice(0, 1);
          for (const f of fws) out.set(f, { x: -dir * 1.0, z: dir * 4 });
          out.set(sp.taker, { x: -dir * 0.35, z: 0 });
        }
        out.set(gk, gkSpot);
        break;
      }
      case 'corner': {
        if (attacking) {
          const tall = players.filter((p) => p !== sp.taker && !p.isGK).sort((a, b) => b.attrs.physical - a.attrs.physical);
          const boxSpots = [
            [PITCH.HL - 6, -2],
            [PITCH.HL - 8, 3],
            [PITCH.HL - 11, -4],
            [PITCH.HL - 4, 4.5],
            [PITCH.HL - 12, 1],
            [PITCH.HL - 16, -7],
            [PITCH.HL - 18, 6],
          ];
          tall.forEach((p, i) => {
            if (i < boxSpots.length) out.set(p, { x: boxSpots[i][0] * dir, z: boxSpots[i][1] * dir });
            else out.set(p, { x: -6 * dir + (i - 7) * 4 * dir, z: (i % 2 ? 12 : -12) * dir });
          });
        } else {
          // 守備側: ゾーン + マンマーク
          const atk = m.teams[sp.team.index].players.filter((p) => !p.isGK);
          const defs = players.filter((p) => !p.isGK);
          const oppSpots = m.teams[sp.team.index].ai.setPieceCache;
          defs.forEach((p, i) => {
            if (i < 3) {
              const zs = [-2.5, 0.5, 3.5];
              out.set(p, { x: ownGoalX + dir * 5.5, z: zs[i] });
            } else if (oppSpots) {
              const target = atk[(i - 3) % atk.length];
              const t = oppSpots.get(target) || target;
              out.set(p, { x: t.x + dir * -0.0 + (ownGoalX - t.x) * 0.08, z: t.z * 0.95 });
            } else {
              out.set(p, { x: ownGoalX + dir * (8 + i), z: (i % 2 ? 6 : -6) });
            }
          });
          // 2人はカウンター用に残す
          const fws = players.filter((p) => p.role === 'FW');
          fws.slice(0, 1).forEach((p) => out.set(p, { x: -dir * 2, z: 0 }));
        }
        out.set(gk, attacking ? { x: ownGoalX + dir * 25, z: 0 } : { x: ownGoalX + dir * 0.7, z: Math.sign(bz) * 1.2 });
        break;
      }
      case 'goalkick': {
        for (const p of players) {
          const spot = this.formationSpot(p, attacking ? 'attack' : 'defend');
          let x = spot.x;
          if (!attacking) {
            // 相手のペナルティエリアの外
            const lim = PITCH.HL - PITCH.boxDepth - 1;
            if (Math.abs(x) > lim && Math.sign(x) === Math.sign(bx)) x = Math.sign(x) * lim;
          } else {
            x = lerp(x, ownGoalX + dir * 30, 0.3);
          }
          out.set(p, { x, z: spot.z });
        }
        if (!attacking) out.set(gk, gkSpot);
        break;
      }
      case 'penalty': {
        let k = 0;
        for (const p of players) {
          if (p === sp.taker) continue;
          if (p.isGK && !attacking) {
            out.set(p, { x: Math.sign(bx) * PITCH.HL, z: 0 });
            continue;
          }
          if (p.isGK) {
            out.set(p, gkSpot);
            continue;
          }
          const sx = Math.sign(bx);
          out.set(p, { x: sx * (PITCH.HL - PITCH.boxDepth - 2 - (k % 3) * 2), z: -14 + (k++ % 7) * 4.5 });
        }
        break;
      }
      default: {
        // フリーキック・スローイン
        const toGoal = Math.hypot(oppGoalX - bx, bz);
        for (const p of players) {
          const spot = this.formationSpot(p, attacking ? 'attack' : 'defend');
          let { x, z } = spot;
          if (!attacking) {
            // ボールから9.15m以上離れる
            const d = Math.hypot(x - bx, z - bz);
            if (d < 9.5) {
              const k = 9.6 / (d || 1);
              x = bx + (x - bx) * k;
              z = bz + (z - bz) * k;
            }
          }
          out.set(p, { x, z });
        }
        if (!attacking && sp.type === 'freekick') {
          // 壁
          const myGoalX = ownGoalX;
          const dGoal = Math.hypot(myGoalX - bx, bz);
          if (dGoal < 32) {
            const wallN = dGoal < 22 ? 4 : 3;
            const ux = (myGoalX - bx) / dGoal;
            const uz = -bz / dGoal;
            const cx = bx + ux * 9.15;
            const cz = bz + uz * 9.15;
            const wall = players.filter((p) => !p.isGK).sort((a, b) => Math.hypot(a.x - cx, a.z - cz) - Math.hypot(b.x - cx, b.z - cz)).slice(0, wallN);
            wall.forEach((p, i) => {
              const off = (i - (wallN - 1) / 2) * 0.62 - uz * 0 + 0.3;
              out.set(p, { x: cx - uz * off, z: cz + ux * off, wall: true });
            });
          }
        }
        if (attacking && sp.type === 'freekick' && toGoal < 32) {
          // 攻撃側はボックスへ
          let k = 0;
          for (const p of players) {
            if (p === sp.taker || p.isGK || p.role === 'DF') continue;
            out.set(p, { x: (PITCH.HL - 8 - (k % 3) * 3) * dir, z: (-8 + (k++ % 5) * 4) * dir });
          }
        }
        out.set(gk, attacking ? { x: ownGoalX + dir * 14, z: 0 } : { x: ownGoalX + dir * 0.8, z: clamp(bz * 0.08, -1.5, 1.5) });
      }
    }
    if (sp.taker && sp.taker.team === this.team) out.set(sp.taker, { x: bx - Math.sign(oppGoalX - bx) * 0.6, z: bz });
    if (attacking) this.setPieceCache = out;
    return out;
  }
}
