import { PITCH, BALL_R } from '../config.js';
import { clamp, lerp, makeRng, smoothstep, wrapAngle } from '../util/math.js';
import { Ball, groundPassSpeed, solveLob, solveShot } from './ball.js';
import { Player } from './player.js';
import { TeamAI } from './ai.js';
import { KeeperAI } from './keeper.js';
import { FORMATIONS } from '../data/formations.js';

// 試合エンジン: 状態遷移（キックオフ→プレー→アウト/ファウル/ゴール→セットプレー）、
// ボールと選手の接触、ルール判定（ゴール・ラインアウト・オフサイド・ファウル）、審判、操作の反映

const DIFFICULTY = {
  easy: { reaction: 1.3, noise: 0.05, slide: 0.04, aiShot: 0.8, aiTackle: 0.8, userTackle: 1.15, gk: 0.92, userGk: 1.08 },
  normal: { reaction: 0.95, noise: 0.025, slide: 0.06, aiShot: 1.05, aiTackle: 1.1, userTackle: 0.9, gk: 1.02, userGk: 0.97 },
  hard: { reaction: 0.75, noise: 0.012, slide: 0.08, aiShot: 1.2, aiTackle: 1.35, userTackle: 0.75, gk: 1.1, userGk: 0.9 },
};

export class Match {
  /**
   * @param {object} o {home, away, kits:[home, away], settings:{halfLength, difficulty, offside, userTeam, knockout}, seed}
   */
  constructor(o) {
    this.settings = { halfLength: 180, difficulty: 'normal', offside: true, userTeam: 0, knockout: false, ...o.settings };
    this.rng = makeRng(o.seed ?? 12345);
    this.rngGauss = this.rng.gauss;
    this.diff = DIFFICULTY[this.settings.difficulty] || DIFFICULTY.normal;
    this.ball = new Ball();
    this.time = 0;
    this.clock = 0;
    this.half = 1;
    this.addedTime = 0;
    this.phase = 'prematch';
    this.phaseT = 0;
    this.events = [];
    this.traj = [];
    this.icCache = new Map();
    this.lastPossession = 0;
    this.lastPossessionT = 0;
    this.possessionStartT = 0;
    this.offsideSet = null;
    this.goalsLog = [];
    this.cards = [];
    this.sp = null;
    this.user = { team: this.settings.userTeam, controlled: null, input: { x: 0, z: 0, mag: 0, sprint: false }, shootHold: -1, autoSwitch: true };

    this.teams = [o.home, o.away].map((data, i) => {
      const team = {
        index: i,
        data,
        kit: o.kits[i],
        dir: i === 0 ? 1 : -1,
        score: 0,
        players: [],
        stats: { shots: 0, onTarget: 0, possession: 0, passes: 0, passesOk: 0, corners: 0, fouls: 0, offsides: 0, saves: 0, yellow: 0 },
        isUser: this.settings.userTeam === i,
      };
      const formation = FORMATIONS[data.formation] || FORMATIONS['4-4-2'];
      data.players.forEach((pd, k) => {
        const p = new Player(pd, team, k);
        p.slot = formation[k];
        team.players.push(p);
      });
      team.ai = new TeamAI(this, team);
      team.keeper = new KeeperAI(this, team);
      return team;
    });
    this.players = [...this.teams[0].players, ...this.teams[1].players];
    this.officials = [
      { kind: 'ref', x: 0, z: -8, vx: 0, vz: 0, facing: Math.PI / 2, pose: 'run', poseT: 0 },
      { kind: 'ar', x: 20, z: -PITCH.HW - 1.2, vx: 0, vz: 0, facing: Math.PI / 2, side: -1, pose: 'run', poseT: 0 },
      { kind: 'ar', x: -20, z: PITCH.HW + 1.2, vx: 0, vz: 0, facing: -Math.PI / 2, side: 1, pose: 'run', poseT: 0 },
    ];
    this.kickoffTeam = 0;
  }

  // ------------------------------------------------------------ ユーティリティ

  emit(e) {
    e.t = this.time;
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  get ballSpeed() {
    return this.ball.speed;
  }

  aiReactionScale(team) {
    return team.isUser ? 1 : this.diff.reaction;
  }

  aiNoise(team) {
    return team.isUser ? 0.03 : this.diff.noise;
  }

  aiSlideChance(team) {
    return team.isUser ? 0.08 : this.diff.slide;
  }

  gkSaveBonus(team) {
    return team.isUser ? this.diff.userGk : this.diff.gk;
  }

  nearestOpponentDist(p) {
    let nd = 99;
    for (const o of this.teams[1 - p.team.index].players) nd = Math.min(nd, Math.hypot(o.x - p.x, o.z - p.z));
    return nd;
  }

  /** 表示用の試合時間（分） */
  get minute() {
    const m = (this.clock / this.settings.halfLength) * 45;
    return Math.floor(Math.min(m, 45 + 9)) + (this.half - 1) * 45;
  }

  get displayClock() {
    const total = (this.clock / this.settings.halfLength) * 45 * 60;
    const base = (this.half - 1) * 45 * 60;
    const secs = Math.floor(total);
    const cap = 45 * 60;
    if (secs >= cap) {
      const extra = Math.floor((secs - cap) / 60) + 1;
      return { text: `${(this.half * 45).toString()}:00`, added: extra, addedTotal: Math.round((this.addedTime / this.settings.halfLength) * 45) };
    }
    const t = base + secs;
    return { text: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`, added: 0 };
  }

  /** ボールに最速で触れる地点と時間（キャッシュ） */
  intercept(p) {
    const c = this.icCache.get(p);
    if (c) return c;
    const b = this.ball;
    let res;
    if (b.owner) {
      const d = Math.hypot(b.x - p.x, b.z - p.z);
      res = { t: p.reaction + d / p.topSpeed, x: b.x, z: b.z, d };
    } else {
      res = { t: Infinity, x: b.x, z: b.z, d: 0 };
      const ownLoft = b.lastTouch && b.lastTouch.team === p.team && !p.isGK;
      const maxH = p.isGK ? 2.7 : ownLoft ? 1.3 : 2.3;
      const reach = p.isGK ? 1.0 : 0.7;
      const sp = p.topSpeed * 0.95;
      // 現在の速度方向へのボーナス
      for (let i = 0; i < this.traj.length; i++) {
        const q = this.traj[i];
        if (q.y > maxH) continue;
        if (Math.abs(q.x) > PITCH.HL + 1 || Math.abs(q.z) > PITCH.HW + 1) break;
        const d = Math.max(0, Math.hypot(q.x - p.x, q.z - p.z) - reach);
        const need = (d > 0.5 ? p.reaction * 0.6 : 0) + d / sp;
        if (need <= q.t + 0.02) {
          res = { t: q.t, x: q.x, z: q.z, d };
          break;
        }
      }
      if (res.t === Infinity && this.traj.length) {
        const q = this.traj[this.traj.length - 1];
        const d = Math.hypot(q.x - p.x, q.z - p.z);
        res = { t: Math.max(q.t, p.reaction + d / sp), x: q.x, z: q.z, d };
      }
    }
    this.icCache.set(p, res);
    return res;
  }

  // ------------------------------------------------------------ 進行

  start() {
    this.firstKickoff = this.kickoffTeam;
    this.setupKickoff(this.kickoffTeam);
  }

  step(dt) {
    this.time += dt;
    this.phaseT += dt;
    this.icCache.clear();
    const b = this.ball;
    if (!b.owner) b.predict(2.6, 1 / 30, this.traj);
    else this.traj.length = 0;

    switch (this.phase) {
      case 'kickoff':
        this.updateKickoff(dt);
        break;
      case 'play':
        this.clock += dt;
        this.updatePlay(dt);
        break;
      case 'stoppage':
        this.updateStoppage(dt);
        break;
      case 'setpiece':
        this.clock += dt * 0.5;
        this.updateSetPiece(dt);
        break;
      case 'goal':
        this.updateGoal(dt);
        break;
      case 'replay':
      case 'halftime':
      case 'fulltime':
      case 'prematch':
        this.updateIdle(dt);
        break;
      default:
        break;
    }
    this.updateOfficials(dt);
    this.checkHalfEnd();
  }

  updateIdle(dt) {
    for (const p of this.players) {
      p.input = null;
      p.update(dt, false);
    }
  }

  // ------------------------------------------------------------ キックオフ

  setupKickoff(teamIdx) {
    this.kickoffTeam = teamIdx;
    const team = this.teams[teamIdx];
    const taker = team.players.filter((p) => p.role === 'FW').sort((a, b) => a.slot.x - b.slot.x)[0] || team.players[10];
    this.sp = { type: 'kickoff', team, x: 0, z: 0, taker, t: 0, ready: false };
    for (const t of this.teams) {
      const spots = t.ai.setPiecePositions(this.sp);
      for (const p of t.players) {
        const s = spots.get(p);
        p.x = s.x;
        p.z = s.z;
        p.vx = p.vz = 0;
        p.state = 'move';
        p.facing = t.dir > 0 ? 0 : Math.PI;
        p.moveTo(s.x, s.z, 0);
        p.faceTo(0, 0);
      }
    }
    this.ball.place(0, 0);
    this.ball.owner = null;
    this.ball.passTarget = null;
    this.ball.inGoal = 0;
    this.ball.lastTouch = null;
    this.offsideSet = null;
    this.phase = 'kickoff';
    this.phaseT = 0;
    this.setControlled(team.isUser ? taker : this.bestUserPlayer());
    this.emit({ type: 'kickoffSetup', team: teamIdx });
  }

  updateKickoff(dt) {
    for (const p of this.players) {
      p.input = null;
      p.update(dt, false);
    }
    const sp = this.sp;
    // 1.6秒後に笛。ユーザーチームは操作待ち（3秒で自動）
    if (this.phaseT > 1.4 && !sp.whistled) {
      sp.whistled = true;
      this.emit({ type: 'whistle', kind: 'start' });
    }
    if (!sp.whistled) return;
    const userTaking = sp.team.isUser;
    if ((userTaking && (sp.userGo || this.phaseT > 3.6)) || (!userTaking && this.phaseT > 2.2)) {
      // 後ろの味方へパス
      const taker = sp.taker;
      const mates = sp.team.players.filter((p) => p !== taker && !p.isGK && p.role !== 'DF');
      let tgt = mates.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
      if (sp.userDir) tgt = this.pickTeammate(taker, sp.userDir.x, sp.userDir.z) || tgt;
      this.ball.owner = taker;
      taker.facing = Math.atan2(tgt.z - taker.z, tgt.x - taker.x);
      this.phase = 'play';
      this.phaseT = 0;
      this.giveBall(taker, true);
      this.kickPass(taker, tgt, tgt.x, tgt.z, 'pass', true);
    }
  }

  // ------------------------------------------------------------ プレー中

  updatePlay(dt) {
    const b = this.ball;
    if (this.pending && this.time >= this.pending.t) {
      const pd = this.pending;
      this.pending = null;
      pd.fn();
    }
    if (this.pendingPenaltyDive && this.time >= this.pendingPenaltyDive.t) {
      const pd = this.pendingPenaltyDive;
      this.pendingPenaltyDive = null;
      this.penaltyDive(pd);
    }
    this.updateUser(dt);
    for (const t of this.teams) {
      t.ai.update(dt);
      t.keeper.update(dt);
    }
    for (const p of this.players) p.update(dt, b.owner === p);
    this.updateActions(dt);
    if (b.owner) this.updateDribble(dt);
    else b.step(dt);
    this.handleBallEvents();
    if (!b.owner) this.forcePlannedSaves();
    if (!b.owner) this.updateContacts();
    this.separatePlayers();
    if (b.owner) {
      const t = b.owner.team;
      t.stats.possession += dt;
      this.lastPossession = t.index;
      this.lastPossessionT = this.time;
    }
    this.checkRules();
  }

  updateStoppage(dt) {
    // ボールがラインを割った後など、少し流してからセットプレーへ
    const b = this.ball;
    if (!b.owner) b.step(dt);
    this.handleBallEvents();
    for (const t of this.teams) {
      for (const p of t.players) {
        if (!p.busy && !p.controlled) {
          const spot = t.ai.formationSpot(p, 'defend');
          p.moveTo(lerp(p.x, spot.x, 0.3), lerp(p.z, spot.z, 0.3), 2.5);
        }
        if (p.controlled) p.input = { x: 0, z: 0, mag: 0, sprint: false };
        p.update(dt, false);
      }
    }
    if (this.phaseT > this.stoppage.delay) {
      const s = this.stoppage;
      this.stoppage = null;
      if (s.then) s.then();
    }
  }

  stop(delay, then) {
    this.phase = 'stoppage';
    this.phaseT = 0;
    this.stoppage = { delay, then };
    if (this.ball.owner) {
      const o = this.ball.owner;
      this.ball.owner = null;
      this.ball.vx = o.vx * 0.5;
      this.ball.vz = o.vz * 0.5;
    }
    this.ball.passTarget = null;
  }

  /** ボールの保持者を設定 */
  giveBall(p, silent = false) {
    const b = this.ball;
    const prevTeam = b.lastTouch?.team;
    if (!silent && this.offsideSet && this.offsideSet.team === p.team && this.offsideSet.players.has(p) && this.settings.offside) {
      this.callOffside(p);
      return;
    }
    if (this.offsideSet && this.offsideSet.team !== p.team) this.offsideSet = null;
    if (this.offsideSet && this.offsideSet.team === p.team) this.offsideSet = null;
    // パス成功の集計
    if (b.lastKick && b.lastKick.counted === false && (b.lastKick.kind === 'pass' || b.lastKick.kind === 'through' || b.lastKick.kind === 'lob' || b.lastKick.kind === 'cross')) {
      b.lastKick.counted = true;
      if (b.lastKick.player.team === p.team && b.lastKick.player !== p) p.team.stats.passesOk++;
    }
    b.owner = p;
    b.passTarget = null;
    b.lastTouch = p;
    b.vy = 0;
    b.y = BALL_R;
    b.inGoal = 0;
    if (prevTeam !== p.team || this.lastPossession !== p.team.index) {
      this.possessionStartT = this.time;
      p.team.possSince = this.time;
      this.emit({ type: 'possession', team: p.team.index, player: p });
    } else if (this.time - this.possessionStartT > 0.5) this.possessionStartT = this.time;
    p.decideT = 0.1;
    p.sd.dribble = null;
    if (p.team.isUser && !p.isGK) this.setControlled(p);
  }

  /** ドリブル中のボール位置 */
  updateDribble(dt) {
    const b = this.ball;
    const p = b.owner;
    if (p.isGK && (p.state === 'hold' || p.sd.holding) && p.state !== 'throw') {
      b.x = p.x + Math.cos(p.facing) * 0.32;
      b.z = p.z + Math.sin(p.facing) * 0.32;
      b.y = p.state === 'dive' ? Math.max(0.3, 0.5 + p.y) : 1.05;
      b.vx = p.vx;
      b.vz = p.vz;
      b.vy = 0;
      return;
    }
    if (p.state === 'fall' || p.state === 'dive' || p.state === 'slide') {
      b.owner = null;
      b.vx = p.vx * 0.6 + (this.rng() - 0.5) * 2;
      b.vz = p.vz * 0.6 + (this.rng() - 0.5) * 2;
      return;
    }
    if (p.state === 'throw') {
      const under = p.sd.underarm;
      b.x = p.x + Math.cos(p.facing) * (under ? 0.35 : 0.1);
      b.z = p.z + Math.sin(p.facing) * (under ? 0.35 : 0.1);
      b.y = under ? 0.9 : 2.25;
      b.vx = b.vz = b.vy = 0;
      return;
    }
    // 進路にいる守備者の足元にボールが入ったら奪われることがある
    if (p.state === 'move' || p.state === 'kick') {
      for (const o of this.teams[1 - p.team.index].players) {
        if (o.busy || o.kickCd > 0 || o.isGK) continue;
        const ox = o.x + Math.cos(o.facing) * 0.3;
        const oz = o.z + Math.sin(o.facing) * 0.3;
        const d = Math.hypot(b.x - ox, b.z - oz);
        if (d > 0.62) continue;
        const facingBall = Math.cos(o.facing) * (b.x - o.x) + Math.sin(o.facing) * (b.z - o.z) > 0;
        // 守備者がドリブラーの進路上（前方）にいるときだけ
        const ahead = Math.cos(p.facing) * (o.x - p.x) + Math.sin(p.facing) * (o.z - p.z) > 0.2;
        if (!facingBall || !ahead) continue;
        // ボールが守備者の足に当たる: 全力で突っ込むほど奪われやすい
        const skill = 1.6 + (o.attrs.defending - p.attrs.dribbling) * 0.04;
        const rate = Math.max(0.5, skill) * (o.team.isUser ? this.diff.userTackle : this.diff.aiTackle) * (p.speed > 6 ? 2.2 : p.speed > 3.5 ? 1.3 : 0.8);
        if (this.rng() < rate * dt) {
          if (this.offsideSet && this.offsideSet.team !== o.team) this.offsideSet = null;
          b.owner = null;
          p.kickCd = 0.4;
          if (this.rng() < 0.5) this.giveBall(o);
          else {
            const a = Math.atan2(b.z - p.z, b.x - p.x) + (this.rng() - 0.5) * 1.5;
            b.vx = Math.cos(a) * 3 + p.vx * 0.4;
            b.vz = Math.sin(a) * 3 + p.vz * 0.4;
            b.lastTouch = o;
            o.kickCd = 0.15;
          }
          this.emit({ type: 'tackle', player: o, success: true, block: true });
          return;
        }
      }
    }
    const sp = p.speed;
    p.anim.touch = (p.anim.touch || 0) + sp * dt * 0.75;
    const touch = sp > 3 ? Math.max(0, Math.sin(p.anim.touch * Math.PI)) * (0.15 + sp * 0.03) : 0;
    const off = 0.42 + sp * 0.035 + touch;
    const tx = p.x + Math.cos(p.facing) * off;
    const tz = p.z + Math.sin(p.facing) * off;
    const k = Math.min(1, dt * 16);
    const nx = b.x + (tx - b.x) * k;
    const nz = b.z + (tz - b.z) * k;
    b.vx = (nx - b.x) / dt;
    b.vz = (nz - b.z) / dt;
    b.vy = 0;
    b.x = nx;
    b.z = nz;
    b.y = BALL_R;
  }

  /** ボールと選手の接触: トラップ、ブロック、ヘディング、キャッチ */
  updateContacts() {
    const b = this.ball;
    let best = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.kickCd > 0) continue;
      if (p.state === 'fall' || p.state === 'throw' || p.state === 'hold') continue;
      const isGKHands = p.isGK && this.inOwnBox(p, b.x, b.z);
      const fx = p.x + Math.cos(p.facing) * 0.25;
      const fz = p.z + Math.sin(p.facing) * 0.25;
      const d = Math.hypot(b.x - fx, b.z - fz);
      let reach = b.passTarget === p ? 0.95 : 0.72;
      if (isGKHands) reach = 1.15;
      if (p.state === 'dive') reach = 1.4;
      if (p.state === 'slide') continue;
      const maxH = isGKHands ? (p.state === 'dive' ? 2.6 : 2.75) : 2.25 + p.y;
      if (d > reach || b.y > maxH) continue;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const p = best;
    const rel = Math.hypot(b.vx - p.vx, b.vz - p.vz, b.vy);
    const isGKHands = p.isGK && this.inOwnBox(p, b.x, b.z);
    // GKのキャッチ/パンチング
    if (isGKHands) {
      const plan = p.sd.plan;
      if (plan && (p.state === 'dive' || p.state === 'catch')) {
        if (!plan.save) return; // 届かない
        plan.save = false;
        if (plan.catchable) this.keeperCatch(p);
        else this.keeperParry(p);
        return;
      }
      if (b.lastTouch && b.lastTouch.team === p.team && b.lastKick && b.lastKick.player.team === p.team && b.y < 0.8) {
        // 味方からのバックパスは足で処理
        if (rel < 16) this.giveBall(p);
        return;
      }
      const skill = p.attrs.gk / 100;
      if (rel < 14 + skill * 8 || this.rng() < 0.4 + skill * 0.3) this.keeperCatch(p);
      else this.keeperParry(p);
      return;
    }
    const h = b.y;
    const ctrl = 9 + p.attrs.dribbling * 0.1 + (b.passTarget === p ? 6 : 0);
    const ownPass = b.lastTouch && b.lastTouch.team === p.team;
    const contested = this.nearestOpponentDist(p) < 2.2;
    const attackBox = this.inBoxOf(this.teams[1 - p.team.index], p.x, p.z);
    if (h < 0.75) {
      if (rel < ctrl) this.giveBall(p);
      else this.deflect(p, rel);
    } else if (h < 1.9) {
      if (rel < ctrl * 0.8 && (!contested || ownPass || h < 1.4)) {
        this.giveBall(p);
        this.emit({ type: 'chest', player: p });
      } else if (h > 1.45 && (attackBox || !ownPass || contested)) this.doHeader(p);
      else if (rel >= ctrl * 0.8) this.deflect(p, rel);
    } else if (attackBox || !ownPass || contested) {
      this.doHeader(p);
    }
  }

  inOwnBox(p, x, z) {
    const gx = -p.team.dir * PITCH.HL;
    return Math.abs(x - gx) < PITCH.boxDepth + 0.3 && Math.abs(z) < PITCH.boxHalfW + 0.3 && Math.sign(x) === Math.sign(gx);
  }

  inBoxOf(team, x, z) {
    const gx = -team.dir * PITCH.HL;
    return Math.abs(x - gx) < PITCH.boxDepth && Math.abs(z) < PITCH.boxHalfW && Math.sign(x) === Math.sign(gx);
  }

  /** 速いボールが体に当たって跳ね返る */
  deflect(p, rel) {
    const b = this.ball;
    if (this.checkOffsideTouch(p)) return;
    const nx = b.x - p.x;
    const nz = b.z - p.z;
    const nl = Math.hypot(nx, nz) || 1;
    const vn = (b.vx * nx + b.vz * nz) / nl;
    const k = 0.35;
    b.vx = (b.vx - 1.6 * vn * (nx / nl)) * k + (this.rng() - 0.5) * 3 + p.vx * 0.5;
    b.vz = (b.vz - 1.6 * vn * (nz / nl)) * k + (this.rng() - 0.5) * 3 + p.vz * 0.5;
    b.vy = Math.abs(b.vy) * 0.3 + this.rng() * 2;
    b.spinY = 0;
    b.lastTouch = p;
    b.passTarget = null;
    p.kickCd = 0.25;
    if (this.offsideSet && this.offsideSet.team !== p.team) this.offsideSet = null;
    this.emit({ type: 'block', player: p, v: rel });
  }

  doHeader(p) {
    const b = this.ball;
    if (this.checkOffsideTouch(p)) return;
    const dir = p.team.dir;
    const ax = p.x * dir;
    let vx;
    let vy;
    let vz;
    const skill = (p.attrs.physical + p.attrs.shooting) / 200;
    if (ax > PITCH.HL - 18 && Math.abs(p.z) < 16) {
      // ゴールへヘディングシュート
      const gx = dir * PITCH.HL;
      const tz = (this.rng() - 0.5) * 2 * (PITCH.goalHalfW - 0.3) + this.rngGauss() * (1.4 - skill);
      const ty = 0.3 + this.rng() * 1.6 + this.rngGauss() * 0.5;
      const sp = 11 + skill * 7;
      const s = solveShot(b.x, b.y, b.z, gx, ty, tz, sp, 0);
      vx = s.vx;
      vy = s.vy;
      vz = s.vz;
      p.team.stats.shots++;
      const onT = Math.abs(tz) < PITCH.goalHalfW && ty < PITCH.goalH;
      if (onT) p.team.stats.onTarget++;
      this.emit({ type: 'shot', player: p, header: true, onTarget: onT });
    } else if (ax < -15) {
      // クリア
      vx = dir * (10 + this.rng() * 6);
      vz = Math.sign(p.z || 1) * (3 + this.rng() * 5);
      vy = 6 + this.rng() * 3;
    } else {
      // 味方の方へ落とす
      const mates = p.team.players.filter((q) => q !== p && !q.isGK);
      const t = mates.sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
      const dx = t.x - b.x;
      const dz = t.z - b.z;
      const d = Math.hypot(dx, dz) || 1;
      const sp = clamp(d * 0.8, 5, 11);
      vx = (dx / d) * sp;
      vz = (dz / d) * sp;
      vy = 0.5;
      b.passTarget = t;
    }
    b.vx = vx;
    b.vy = vy;
    b.vz = vz;
    b.spinY = 0;
    b.lastTouch = p;
    b.lastKick = { player: p, kind: 'header', time: this.time, counted: true };
    p.kickCd = 0.4;
    if (p.state === 'move') {
      p.setState('header', 0.65, {});
      p.vy = 3;
    }
    this.snapshotOffside(p);
    this.emit({ type: 'header', player: p });
  }

  // ------------------------------------------------------------ 選手の行動

  updateActions(dt) {
    const b = this.ball;
    for (const p of this.players) {
      if (p.state === 'kick' && !p.sd.done && p.stateT >= p.sd.contact) {
        p.sd.done = true;
        if (b.owner === p || (!b.owner && Math.hypot(b.x - p.x, b.z - p.z) < 1.3 && b.y < 1.2)) {
          if (!b.owner) b.lastTouch = p;
          b.owner = null;
          p.sd.exec();
        }
      }
      if (p.state === 'slide') this.updateSlide(p);
    }
  }

  updateSlide(p) {
    const b = this.ball;
    const sd = p.sd;
    if (sd.done || p.stateT < 0.06 || p.stateT > 0.62) return;
    const fx = p.x + Math.cos(p.facing) * 0.85;
    const fz = p.z + Math.sin(p.facing) * 0.85;
    const db = Math.hypot(b.x - fx, b.z - fz);
    if (db < 0.9 && b.y < 0.6) {
      sd.done = true;
      const victim = b.owner;
      b.owner = null;
      const a = p.facing + (this.rng() - 0.5) * 0.8;
      const sp = 5 + this.rng() * 4;
      b.vx = Math.cos(a) * sp;
      b.vz = Math.sin(a) * sp;
      b.vy = 0.5 + this.rng() * 1.5;
      b.lastTouch = p;
      b.passTarget = null;
      p.kickCd = 0.5;
      if (victim && victim.team !== p.team) {
        victim.kickCd = 0.4;
        this.emit({ type: 'tackle', player: p, success: true, slide: true });
        if (this.rng() < 0.3) victim.setState('stumble', 0.5);
      }
      if (this.offsideSet && this.offsideSet.team !== p.team) this.offsideSet = null;
      return;
    }
    // 先に相手の体に当たったらファウル
    for (const o of this.teams[1 - p.team.index].players) {
      if (o.state === 'fall') continue;
      const d = Math.hypot(o.x - fx, o.z - fz);
      if (d < 0.75) {
        sd.done = true;
        const behind = Math.cos(o.facing) * (p.x - o.x) + Math.sin(o.facing) * (p.z - o.z) < -0.2;
        this.callFoul(p, o, behind ? 0.55 : 0.2);
        return;
      }
    }
  }

  tryTackle(d, c) {
    if (d.tackleCd > 0 || d.busy) return;
    if (c.state === 'throw' || c.state === 'hold' || (c.isGK && c.sd.holding)) return;
    d.tackleCd = 0.75;
    d.setState('tackle', 0.38, {});
    const fx = Math.cos(c.facing);
    const fz = Math.sin(c.facing);
    const front = fx * (d.x - c.x) + fz * (d.z - c.z) > 0;
    let pS = 0.34 + (d.attrs.defending - c.attrs.dribbling) * 0.009 + (c.speed > 6 ? 0.08 : 0) + (front ? 0.08 : -0.15);
    pS *= d.team.isUser ? this.diff.userTackle : this.diff.aiTackle;
    pS = clamp(pS, 0.06, 0.82);
    const foulP = front ? 0.01 + (1 - d.attrs.defending / 100) * 0.03 : 0.07;
    const r = this.rng();
    if (r < foulP) {
      this.callFoul(d, c, front ? 0.1 : 0.35);
      return;
    }
    if (this.rng() < pS) {
      const b = this.ball;
      if (b.owner !== c) return;
      b.owner = null;
      c.kickCd = 0.45;
      b.lastTouch = d;
      if (this.offsideSet && this.offsideSet.team !== d.team) this.offsideSet = null;
      if (this.rng() < 0.45) {
        this.giveBall(d);
      } else {
        const a = Math.atan2(c.z - d.z, c.x - d.x) + (this.rng() - 0.5) * 1.6;
        const sp = 3 + this.rng() * 3;
        b.vx = Math.cos(a) * sp;
        b.vz = Math.sin(a) * sp;
        b.vy = this.rng() * 1.2;
        d.kickCd = 0.2;
      }
      this.emit({ type: 'tackle', player: d, success: true });
    } else {
      this.emit({ type: 'tackle', player: d, success: false });
    }
  }

  startSlide(p, angle) {
    if (p.busy) return;
    p.facing = angle;
    const sp = Math.max(p.speed, 6.5) * 1.05;
    p.vx = Math.cos(angle) * sp;
    p.vz = Math.sin(angle) * sp;
    p.setState('slide', 1.05, { done: false });
    p.tackleCd = 1.4;
    this.emit({ type: 'slide', player: p });
  }

  /** 方向に応じて味方を選ぶ（ユーザー操作のパス） */
  pickTeammate(p, dx, dz, kind = 'pass') {
    const dl = Math.hypot(dx, dz);
    if (dl < 0.1) {
      dx = Math.cos(p.facing);
      dz = Math.sin(p.facing);
    } else {
      dx /= dl;
      dz /= dl;
    }
    let best = null;
    let bestS = -Infinity;
    for (const t of p.team.players) {
      if (t === p) continue;
      const vx = t.x - p.x;
      const vz = t.z - p.z;
      const d = Math.hypot(vx, vz);
      if (d < 2) continue;
      const cos = (vx * dx + vz * dz) / d;
      if (cos < 0.45) continue;
      const free = this.nearestOpponentDist(t);
      const lane = this.laneOpen(p, t.x, t.z);
      let s = cos * 3 - d / (kind === 'lob' ? 60 : 30) + Math.min(free, 6) * 0.08 + lane * 0.6;
      if (t.isGK) s -= 1.5;
      if (s > bestS) {
        bestS = s;
        best = t;
      }
    }
    return best;
  }

  laneOpen(p, x, z) {
    let lane = 9;
    const vx = x - p.x;
    const vz = z - p.z;
    const l2 = vx * vx + vz * vz || 1;
    for (const o of this.teams[1 - p.team.index].players) {
      const t = clamp(((o.x - p.x) * vx + (o.z - p.z) * vz) / l2, 0, 1);
      lane = Math.min(lane, Math.hypot(o.x - (p.x + vx * t), o.z - (p.z + vz * t)));
    }
    return Math.min(lane, 3) / 3;
  }

  pressureOn(p) {
    const nd = this.nearestOpponentDist(p);
    return 1 - smoothstep(1.0, 4.5, nd);
  }

  chooseFoot(p, tx, tz) {
    const a = wrapAngle(Math.atan2(tz - p.z, tx - p.x) - p.facing);
    if (Math.abs(a) < 0.3) return (p.data.num % 4 === 0 ? -1 : 1);
    return a > 0 ? -1 : 1;
  }

  /** 地上パス / スルーパス */
  kickPass(p, receiver, tx, tz, kind = 'pass', instant = false) {
    const b = this.ball;
    if (b.owner !== p) return;
    const foot = this.chooseFoot(p, tx, tz);
    const pressure = this.pressureOn(p);
    const exec = () => {
      const d = Math.hypot(tx - b.x, tz - b.z);
      const va = kind === 'through' ? 2.8 : d > 22 ? 7 : 5.5;
      let v0 = groundPassSpeed(Math.max(1, d), va);
      const skill = p.attrs.passing / 100;
      const angErr = this.rngGauss() * ((1 - skill) * 0.075 + 0.012 + pressure * 0.035);
      v0 *= 1 + this.rngGauss() * (0.04 + (1 - skill) * 0.05);
      const a = Math.atan2(tz - b.z, tx - b.x) + angErr;
      v0 = Math.min(v0, 30);
      b.vx = Math.cos(a) * v0;
      b.vz = Math.sin(a) * v0;
      b.vy = d > 30 ? 1.2 : 0;
      b.spinY = 0;
      b.spinTop = 0;
      this.afterKick(p, kind, receiver, v0 / 30);
    };
    this.startKick(p, kind, foot, instant ? 0.0 : 0.12, exec);
    p.team.stats.passes++;
  }

  /** 浮き球のパス / クロス / クリア */
  kickLob(p, receiver, tx, tz, kind = 'lob') {
    const b = this.ball;
    if (b.owner !== p) return;
    const foot = this.chooseFoot(p, tx, tz);
    const pressure = this.pressureOn(p);
    const exec = () => {
      const d = Math.hypot(tx - b.x, tz - b.z);
      const skill = p.attrs.passing / 100;
      const err = d * (0.025 + (1 - skill) * 0.07 + pressure * 0.03) * (kind === 'clear' ? 2.5 : 1);
      const ex = clamp(tx, -PITCH.HL + 4, PITCH.HL - 4) + this.rngGauss() * err;
      const ez = clamp(tz, -PITCH.HW + 4, PITCH.HW - 4) + this.rngGauss() * err;
      let apex = clamp(2.5 + d * 0.13, 3, 13);
      let targetY = BALL_R;
      if (kind === 'cross') {
        apex = clamp(3.5 + d * 0.06, 4, 7);
        targetY = 1.7;
      }
      if (kind === 'clear') apex = 10 + this.rng() * 6;
      const s = solveLob(b.x, b.y, b.z, ex, ez, apex, targetY);
      b.vx = s.vx;
      b.vy = s.vy;
      b.vz = s.vz;
      b.spinY = kind === 'cross' ? (this.rng() - 0.5) * 6 : 0;
      b.spinTop = -1;
      this.afterKick(p, kind, receiver, clamp(Math.hypot(s.vx, s.vy, s.vz) / 28, 0.3, 1));
    };
    this.startKick(p, kind === 'clear' ? 'shot' : 'lob', foot, 0.17, exec);
    if (kind !== 'clear') p.team.stats.passes++;
  }

  /** シュート: tgt はゴールライン上の目標点, power 0..1, curl カーブ量 */
  kickShot(p, tgt, power, curl = 0) {
    const b = this.ball;
    if (b.owner !== p && !(Math.hypot(b.x - p.x, b.z - p.z) < 1.3)) return;
    const foot = this.chooseFoot(p, tgt.x, tgt.z);
    const pressure = this.pressureOn(p);
    const exec = () => {
      const d = Math.hypot(tgt.x - b.x, tgt.z - b.z);
      const skill = p.attrs.shooting / 100;
      const aiF = p.team.isUser ? 1 : 1 / this.diff.aiShot;
      const sigma = (0.3 + (1 - skill) * 1.15 + (d / 25) * 0.55 + pressure * 0.5 + power * power * 0.5) * aiF;
      const tz = tgt.z + this.rngGauss() * sigma * 0.8;
      const ty = clamp(tgt.y + this.rngGauss() * sigma * 0.55 + power * 0.25, 0.12, 4);
      const speed = 15 + power * 16 + skill * 2;
      const s = solveShot(b.x, b.y, b.z, tgt.x, ty, tz, speed, curl);
      b.vx = s.vx;
      b.vy = s.vy;
      b.vz = s.vz;
      b.spinY = curl;
      b.spinTop = power > 0.8 ? 1.5 : 0;
      const onTarget = Math.abs(tz) < PITCH.goalHalfW && ty < PITCH.goalH;
      p.team.stats.shots++;
      if (onTarget) p.team.stats.onTarget++;
      this.afterKick(p, 'shot', null, power);
      this.emit({ type: 'shot', player: p, onTarget, power });
    };
    this.startKick(p, 'shot', foot, 0.19, exec);
  }

  startKick(p, kind, foot, contact, exec) {
    p.setState('kick', contact + 0.38, { kind, foot, contact, exec, done: false });
    p.sd.dribble = null;
    // キックの方向へ体を向ける
    if (contact <= 0) {
      p.sd.done = true;
      this.ball.owner = null;
      exec();
    }
  }

  afterKick(p, kind, receiver, power) {
    const b = this.ball;
    if (b.lastKick && b.lastKick.player !== p) this.prevKick = b.lastKick;
    b.owner = null;
    b.lastTouch = p;
    b.passTarget = receiver;
    b.lastKick = { player: p, kind, time: this.time, counted: false };
    b.inGoal = 0;
    p.kickCd = 0.32;
    this.snapshotOffside(p);
    if (receiver && receiver.team.isUser && p.team.isUser) this.setControlled(receiver);
    this.emit({ type: 'kick', player: p, kind, power });
  }

  // ------------------------------------------------------------ GKのアクション

  keeperCatch(gk) {
    const b = this.ball;
    if (this.offsideSet && this.offsideSet.team !== gk.team) this.offsideSet = null;
    b.owner = gk;
    b.lastTouch = gk;
    b.passTarget = null;
    b.vx = b.vy = b.vz = 0;
    gk.sd.holding = true;
    if (gk.state !== 'dive') gk.setState('hold', 99, { holding: true });
    else gk.sd.holding = true;
    gk.team.stats.saves += b.lastKick && b.lastKick.kind === 'shot' && b.lastKick.player.team !== gk.team ? 1 : 0;
    this.lastPossession = gk.team.index;
    this.lastPossessionT = this.time;
    this.possessionStartT = this.time;
    this.emit({ type: 'save', player: gk, kind: 'catch' });
    this.emit({ type: 'possession', team: gk.team.index, player: gk });
  }

  keeperParry(gk) {
    const b = this.ball;
    const dir = gk.team.dir;
    const sp = Math.max(6, Math.hypot(b.vx, b.vz) * (0.3 + this.rng() * 0.25));
    const out = Math.sign(b.z - gk.z) || (this.rng() < 0.5 ? -1 : 1);
    const a = Math.atan2(out * (0.6 + this.rng() * 0.8), dir * (0.3 + this.rng() * 0.7));
    b.vx = Math.cos(a) * sp;
    b.vz = Math.sin(a) * sp;
    b.vy = 1.5 + this.rng() * 3.5;
    b.lastTouch = gk;
    b.passTarget = null;
    gk.kickCd = 0.6;
    if (b.lastKick && b.lastKick.kind === 'shot' && b.lastKick.player.team !== gk.team) gk.team.stats.saves++;
    this.emit({ type: 'save', player: gk, kind: 'parry' });
  }

  keeperSmother(gk, c) {
    const skill = gk.attrs.gk / 100;
    const p = 0.35 + skill * 0.35 - c.attrs.dribbling / 400;
    const a = Math.atan2(c.z - gk.z, c.x - gk.x);
    gk.facing = a;
    gk.setState('dive', 1.4, { side: 1, height: 0, airTime: 0.25, smother: true });
    gk.vx = Math.cos(a) * 5;
    gk.vz = Math.sin(a) * 5;
    if (this.rng() < p && this.ball.owner === c) {
      this.ball.owner = null;
      c.kickCd = 0.5;
      this.keeperCatch(gk);
    }
  }

  keeperThrow(gk, t) {
    const b = this.ball;
    gk.sd.holding = false;
    gk.facing = Math.atan2(t.z - gk.z, t.x - gk.x);
    gk.setState('throw', 0.8, { underarm: true });
    const exec = () => {
      const d = Math.hypot(t.x - gk.x, t.z - gk.z);
      const s = solveLob(gk.x, 1.0, gk.z, t.x + t.vx * 0.6, t.z + t.vz * 0.6, 1.3 + d * 0.04, BALL_R);
      b.owner = null;
      b.y = 1.0;
      b.vx = s.vx;
      b.vy = s.vy;
      b.vz = s.vz;
      this.afterKick(gk, 'pass', t, 0.4);
    };
    this.pending = { t: this.time + 0.42, fn: exec, p: gk };
  }

  keeperPunt(gk, tx, tz) {
    const b = this.ball;
    gk.sd.holding = false;
    gk.facing = Math.atan2(tz - gk.z, tx - gk.x);
    gk.state = 'move';
    // ボールを落としてキック
    b.owner = gk;
    b.y = BALL_R;
    const exec = () => {
      const s = solveLob(b.x, 0.4, b.z, tx, tz, 16 + this.rng() * 5, BALL_R);
      b.vx = s.vx;
      b.vy = s.vy;
      b.vz = s.vz;
      b.y = 0.4;
      this.afterKick(gk, 'lob', null, 0.9);
    };
    this.startKick(gk, 'lob', 1, 0.2, exec);
  }

  /** GKがセーブすると判定したシュートは、GKの位置を通過する時点で確実に止める */
  forcePlannedSaves() {
    const b = this.ball;
    for (const t of this.teams) {
      const gk = t.players[0];
      const plan = t.keeper.plan;
      if (!plan || !plan.save || plan.done || plan.until < this.time) continue;
      if (gk.state !== 'dive' && gk.state !== 'catch') continue;
      const toward = -t.dir;
      const passed = (b.x - gk.x) * toward > -0.2;
      if (passed && Math.abs(b.z - gk.z) < 3.6 && b.y < 2.9 && Math.abs(b.x) > PITCH.HL - 8) {
        plan.done = true;
        plan.save = false;
        b.x = gk.x + (b.x - gk.x) * 0.3;
        b.z = lerp(b.z, gk.z, 0.4);
        if (Math.abs(b.x) > PITCH.HL - 0.2) b.x = Math.sign(b.x) * (PITCH.HL - 0.25);
        if (plan.catchable) this.keeperCatch(gk);
        else this.keeperParry(gk);
      }
    }
  }

  /** PKでGKが山を張って飛ぶ */
  penaltyDive(pd) {
    const { gk, guess, tgt } = pd;
    const t = gk.team;
    const skill = gk.attrs.gk / 100;
    const sameSide = Math.sign(tgt.z) === guess && Math.abs(tgt.z) > 0.6;
    let pSave = 0;
    if (sameSide) pSave = 0.42 + skill * 0.3 - (Math.abs(tgt.z) > 2.9 ? 0.3 : 0) - (tgt.y > 1.9 ? 0.25 : 0);
    else if (Math.abs(tgt.z) < 0.6 && guess === 0) pSave = 0.7;
    const save = this.rng() < pSave * this.gkSaveBonus(t);
    const plan = { until: this.time + 1.5, save, catchable: save && this.rng() < 0.3, pt: { x: gk.x, y: tgt.y, z: guess * 2.4, t: 0.4 } };
    t.keeper.plan = plan;
    if (guess === 0) {
      gk.setState('catch', 0.8, { plan });
      return;
    }
    const fx = Math.cos(gk.facing);
    const fz = Math.sin(gk.facing);
    // +1 = GKから見て左側
    const side = Math.sign(fz * 0 - fx * (guess * 2.4 - gk.z)) || 1;
    gk.setState('dive', 1.6, { side, height: clamp((tgt.y - 0.3) / 1.8, 0, 1), airTime: 0.4, plan });
    gk.vz = guess * 6.2;
    gk.vx = 0;
    gk.vy = tgt.y > 1.0 ? 2.5 : 0.5;
  }

  // ------------------------------------------------------------ ルール

  snapshotOffside(p) {
    if (!this.settings.offside) return;
    const team = p.team;
    const opp = this.teams[1 - team.index];
    const dir = team.dir;
    const xs = opp.players.map((o) => o.x * dir).sort((a, b) => b - a);
    const second = xs[1];
    const bx = this.ball.x * dir;
    const set = new Set();
    for (const q of team.players) {
      if (q === p) continue;
      const ax = q.x * dir;
      if (ax > 0.2 && ax > bx + 0.2 && ax > second + 0.25) set.add(q);
    }
    this.offsideSet = { team, players: set, from: p };
  }

  checkOffsideTouch(p) {
    if (!this.settings.offside || !this.offsideSet) return false;
    if (this.offsideSet.team === p.team && this.offsideSet.players.has(p)) {
      this.callOffside(p);
      return true;
    }
    if (this.offsideSet.team !== p.team && !p.isGK) this.offsideSet = null;
    return false;
  }

  callOffside(p) {
    const opp = this.teams[1 - p.team.index];
    p.team.stats.offsides++;
    this.offsideSet = null;
    this.emit({ type: 'whistle', kind: 'short' });
    this.emit({ type: 'offside', player: p, team: p.team.index });
    const ar = p.x > 0 ? this.officials[1] : this.officials[2];
    ar.pose = 'flag';
    ar.poseT = 2.5;
    const x = p.x;
    const z = p.z;
    this.stop(1.6, () => this.startSetPiece('freekick', opp, clamp(x, -PITCH.HL + 1, PITCH.HL - 1), clamp(z, -PITCH.HW + 1, PITCH.HW - 1), { indirect: true }));
  }

  callFoul(fouler, victim, cardChance = 0.15) {
    const b = this.ball;
    if (this.phase !== 'play') return;
    victim.setState('fall', 2.0, {});
    victim.vx = fouler.vx * 0.3;
    victim.vz = fouler.vz * 0.3;
    fouler.team.stats.fouls++;
    const x = victim.x;
    const z = victim.z;
    const penalty = this.inBoxOf(fouler.team, x, z);
    this.emit({ type: 'whistle', kind: 'foul' });
    this.emit({ type: 'foul', fouler, victim, penalty });
    if (this.rng() < cardChance) {
      fouler.yellow++;
      fouler.team.stats.yellow++;
      this.cards.push({ player: fouler, minute: this.minute });
      this.emit({ type: 'card', player: fouler, color: 'yellow' });
    }
    if (b.owner) {
      b.owner = null;
    }
    const opp = victim.team;
    this.stop(1.8, () => {
      if (penalty) this.startSetPiece('penalty', opp, -fouler.team.dir * (PITCH.HL - PITCH.spot), 0);
      else this.startSetPiece('freekick', opp, clamp(x, -PITCH.HL + 1, PITCH.HL - 1), clamp(z, -PITCH.HW + 0.5, PITCH.HW - 0.5));
    });
  }

  handleBallEvents() {
    const b = this.ball;
    for (const e of b.events) {
      if (e.type === 'post' || e.type === 'bar') this.emit({ type: 'post', v: e.v });
      else if (e.type === 'net') this.emit({ type: 'net', side: e.side, x: e.x, y: e.y, z: e.z, v: e.v });
      else if (e.type === 'bounce') this.emit({ type: 'bounce', v: e.v });
      else if (e.type === 'sidenet') this.emit({ type: 'sidenet' });
    }
    b.events.length = 0;
  }

  checkRules() {
    const b = this.ball;
    if (this.phase !== 'play') return;
    // スローイン中（投げる前）はボールはまだインプレーではない
    if (b.owner && b.owner.state === 'throw') return;
    if (b.owner && b.owner.isGK && (b.owner.state === 'hold' || b.owner.sd.holding || b.owner.state === 'dive')) {
      // GKが手で持っているボールはゴールラインの手前に留める
      const lim = PITCH.HL - 0.3;
      if (Math.abs(b.x) > lim) b.x = Math.sign(b.x) * lim;
      return;
    }
    // ゴール
    if (b.inGoal || (Math.abs(b.x) > PITCH.HL + BALL_R && Math.abs(b.z) < PITCH.goalHalfW && b.y < PITCH.goalH)) {
      const side = b.inGoal || Math.sign(b.x);
      const scoring = this.teams.find((t) => t.dir === side);
      this.scoreGoal(scoring);
      return;
    }
    const lt = b.lastTouch;
    if (Math.abs(b.z) > PITCH.HW + BALL_R) {
      const team = lt ? this.teams[1 - lt.team.index] : this.teams[0];
      const x = clamp(b.x, -PITCH.HL + 0.5, PITCH.HL - 0.5);
      const z = Math.sign(b.z) * PITCH.HW;
      this.emit({ type: 'out', kind: 'throwin', team: team.index });
      this.stop(1.0, () => this.startSetPiece('throwin', team, x, z));
      return;
    }
    if (Math.abs(b.x) > PITCH.HL + BALL_R) {
      const side = Math.sign(b.x);
      const defending = this.teams.find((t) => t.dir === -side);
      const attacking = this.teams.find((t) => t.dir === side);
      const nearMiss = Math.abs(b.z) < PITCH.goalHalfW + 2.5 && b.lastKick && b.lastKick.kind === 'shot' && this.time - b.lastKick.time < 3;
      if (nearMiss) this.emit({ type: 'nearmiss', team: attacking.index });
      if (lt && lt.team === defending) {
        attacking.stats.corners++;
        this.emit({ type: 'out', kind: 'corner', team: attacking.index });
        this.stop(1.3, () => this.startSetPiece('corner', attacking, side * PITCH.HL, Math.sign(b.z || 1) * PITCH.HW));
      } else {
        this.emit({ type: 'out', kind: 'goalkick', team: defending.index });
        this.stop(1.3, () => this.startSetPiece('goalkick', defending, side * (PITCH.HL - PITCH.sixDepth), Math.sign(b.z || 1) * 4));
      }
    }
  }

  scoreGoal(team) {
    const b = this.ball;
    const lt = b.lastTouch;
    const ownGoal = lt && lt.team !== team;
    team.score++;
    const scorer = ownGoal ? lt : lt;
    // アシスト: 直前のパスの出し手
    let assist = null;
    const pk = this.prevKick;
    if (!ownGoal && pk && pk.player.team === team && pk.player !== lt && this.time - pk.time < 10 && pk.kind !== 'shot') assist = pk.player;
    const g = { team: team.index, scorer, assist, ownGoal, minute: this.minute, half: this.half, display: this.displayClock };
    this.goalsLog.push(g);
    this.phase = 'goal';
    this.phaseT = 0;
    this.offsideSet = null;
    this.goalInfo = g;
    b.owner = null;
    b.passTarget = null;
    this.emit({ type: 'goal', ...g });
    this.emit({ type: 'whistle', kind: 'goal' });
    // セレブレーションの準備
    const corner = { x: team.dir * (PITCH.HL - 2), z: (scorer && scorer.z > 0 ? 1 : -1) * (PITCH.HW - 2) };
    this.celebration = { scorer: ownGoal ? null : scorer, corner, kind: Math.floor(this.rng() * 4) };
  }

  updateGoal(dt) {
    const b = this.ball;
    b.step(dt);
    this.handleBallEvents();
    const c = this.celebration;
    const scoringTeam = this.teams[this.goalInfo.team];
    for (const t of this.teams) {
      for (const p of t.players) {
        p.input = null;
        if (p.busy && p.state !== 'celebrate') {
          p.update(dt, false);
          continue;
        }
        if (t === scoringTeam) {
          if (p === c.scorer) {
            if (p.state !== 'celebrate') p.setState('celebrate', 99, { kind: c.kind });
            const d = Math.hypot(c.corner.x - p.x, c.corner.z - p.z);
            p.moveTo(c.corner.x, c.corner.z, d > 2 ? p.topSpeed * 0.9 : 0);
            // celebrate状態でも移動させる
            this.celebrateMove(p, dt, c.corner.x, c.corner.z, c.kind === 1 && this.phaseT > 1.6 ? 0 : p.topSpeed * 0.85);
          } else if (!p.isGK) {
            const tx = c.scorer ? c.scorer.x : c.corner.x;
            const tz = c.scorer ? c.scorer.z : c.corner.z;
            const ang = p.index * 0.7;
            const gx = tx + Math.cos(ang) * 1.6 * (1 + (p.index % 3) * 0.4);
            const gz = tz + Math.sin(ang) * 1.6 * (1 + (p.index % 3) * 0.4);
            if (p.state !== 'celebrate') p.setState('celebrate', 99, { kind: 3, mate: true });
            this.celebrateMove(p, dt, gx, gz, this.phaseT > 1.2 ? p.topSpeed * 0.8 : 2);
          } else {
            p.moveTo(p.x, p.z, 0);
            p.update(dt, false);
          }
        } else {
          if (p.state !== 'dejected' && this.phaseT > 0.6 && p.state === 'move' && this.rng() < 0.02) p.setState('dejected', 4 + this.rng() * 2, {});
          if (p.state === 'dejected') {
            p.vx *= 0.9;
            p.vz *= 0.9;
            p.stateT += dt;
            if (p.stateT > p.stateDur) p.state = 'move';
          } else {
            const spot = t.ai.formationSpot(p, 'defend');
            p.moveTo(lerp(p.x, spot.x, 0.2), lerp(p.z, spot.z, 0.2), 1.6);
            p.update(dt, false);
          }
        }
      }
    }
    if (this.phaseT > 4.2 && !this.goalReplayRequested) {
      this.goalReplayRequested = true;
      this.phase = 'replay';
      this.phaseT = 0;
      this.emit({ type: 'replay', goal: this.goalInfo });
      if (this.settings.noReplay) this.endReplay();
    }
  }

  celebrateMove(p, dt, tx, tz, speed) {
    const dx = tx - p.x;
    const dz = tz - p.z;
    const d = Math.hypot(dx, dz);
    const sp = d > 0.5 ? Math.min(speed, d * 2) : 0;
    const wx = d > 1e-3 ? (dx / d) * sp : 0;
    const wz = d > 1e-3 ? (dz / d) * sp : 0;
    p.vx += (wx - p.vx) * Math.min(1, dt * 4);
    p.vz += (wz - p.vz) * Math.min(1, dt * 4);
    p.x += p.vx * dt;
    p.z += p.vz * dt;
    p.stateT += dt;
    if (p.speed > 0.5) p.facing = Math.atan2(p.vz, p.vx);
    else p.facing = Math.atan2(-p.z, -p.x * 0.2);
  }

  /** リプレイ終了後（ビュー側から呼ぶ） */
  endReplay() {
    if (this.phase !== 'replay') return;
    this.goalReplayRequested = false;
    for (const p of this.players) {
      p.state = 'move';
      p.sd = {};
    }
    const conceding = this.teams[1 - this.goalInfo.team];
    this.setupKickoff(conceding.index);
  }

  checkHalfEnd() {
    const len = this.settings.halfLength;
    if (this.phase !== 'play' && this.phase !== 'setpiece' && this.phase !== 'stoppage') return;
    if (!this.addedTime && this.clock > len) {
      this.addedTime = Math.round(1 + this.rng() * 3) * (len / 45);
      this.emit({ type: 'addedTime', minutes: Math.round((this.addedTime / len) * 45) });
    }
    if (this.addedTime && this.clock > len + this.addedTime) {
      // 攻撃中の決定機は待つ
      const b = this.ball;
      const danger = this.phase === 'play' && (Math.abs(b.x) > PITCH.HL - 20 && this.ballSpeed > 8);
      if (danger && this.clock < len + this.addedTime + 6) return;
      this.endHalf();
    }
  }

  endHalf() {
    for (const p of this.players) {
      p.state = 'move';
      p.sd = {};
      p.input = null;
    }
    this.ball.owner = null;
    if (this.half === 1) {
      this.phase = 'halftime';
      this.phaseT = 0;
      this.emit({ type: 'whistle', kind: 'half' });
      this.emit({ type: 'halftime' });
    } else {
      this.phase = 'fulltime';
      this.phaseT = 0;
      this.emit({ type: 'whistle', kind: 'end' });
      this.emit({ type: 'fulltime' });
    }
  }

  /** 後半開始（ビュー側から呼ぶ） */
  startSecondHalf() {
    this.half = 2;
    this.clock = 0;
    this.addedTime = 0;
    for (const t of this.teams) {
      t.dir = -t.dir;
      for (const p of t.players) p.stamina = Math.min(1, p.stamina + 0.25);
    }
    this.setupKickoff(1 - (this.firstKickoff ?? 0));
  }

  // ------------------------------------------------------------ セットプレー

  startSetPiece(type, team, x, z, opts = {}) {
    const b = this.ball;
    b.place(x, z);
    b.owner = null;
    b.passTarget = null;
    b.inGoal = 0;
    this.offsideSet = null;
    let taker;
    const cands = team.players.filter((p) => !p.isGK && p.state !== 'fall');
    if (type === 'goalkick') taker = team.players[0];
    else if (type === 'penalty' || (type === 'freekick' && Math.hypot(team.dir * PITCH.HL - x, z) < 30)) {
      taker = cands.reduce((a, c) => (c.attrs.shooting > a.attrs.shooting ? c : a), cands[0]);
    } else if (type === 'corner') {
      taker = cands.reduce((a, c) => (c.attrs.passing + (c.role === 'DF' ? -10 : 0) > a.attrs.passing + (a.role === 'DF' ? -10 : 0) ? c : a), cands[0]);
    } else {
      taker = cands.reduce((a, c) => (Math.hypot(c.x - x, c.z - z) < Math.hypot(a.x - x, a.z - z) ? c : a), cands[0]);
    }
    this.sp = { type, team, x, z, taker, t: 0, ready: false, opts, aim: null };
    this.phase = 'setpiece';
    this.phaseT = 0;
    const atkSpots = team.ai.setPiecePositions(this.sp);
    const defTeam = this.teams[1 - team.index];
    const defSpots = defTeam.ai.setPiecePositions(this.sp);
    this.spSpots = new Map([...atkSpots, ...defSpots]);
    for (const p of this.players) {
      p.state = p.state === 'fall' ? 'fall' : 'move';
      p.input = null;
    }
    if (team.isUser) this.setControlled(taker);
    else this.setControlled(this.bestUserPlayer());
    this.emit({ type: 'setpiece', kind: type, team: team.index, x, z });
  }

  updateSetPiece(dt) {
    const sp = this.sp;
    const b = this.ball;
    sp.t += dt;
    for (const p of this.players) {
      const s = this.spSpots.get(p);
      if (p === sp.taker) {
        let tx;
        let tz;
        if (sp.type === 'throwin') {
          tx = sp.x;
          tz = sp.z + Math.sign(sp.z) * 0.35;
        } else {
          const goalDir = sp.type === 'goalkick' ? sp.team.dir : Math.sign(sp.team.dir * PITCH.HL - sp.x) || sp.team.dir;
          tx = sp.x - goalDir * 1.2;
          tz = sp.z - (sp.type === 'corner' ? Math.sign(sp.z) * 0.8 : 0);
        }
        const d = Math.hypot(tx - p.x, tz - p.z);
        if (sp.t > 3.2 && d > 0.6) {
          // 遅いときはワープ（画面上は遠景なので目立たない）
          p.x += (tx - p.x) * 0.25;
          p.z += (tz - p.z) * 0.25;
        }
        p.moveTo(tx, tz, d > 4 ? p.topSpeed : 3);
        p.faceTo(b.x, b.z);
        if (sp.type === 'throwin' && d < 0.5) {
          p.faceTo(p.x, 0);
          if (p.state !== 'throw') p.setState('throw', 99, { ready: true });
        }
        if (d < 0.5 && sp.t > 1.2 && !sp.ready) {
          sp.ready = true;
          sp.readyT = sp.t;
          this.emit({ type: 'setpieceReady', kind: sp.type, team: sp.team.index });
        }
      } else if (s) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        p.moveTo(s.x, s.z, d > 5 ? p.topSpeed * 0.85 : 3.5);
        p.faceTo(b.x, b.z);
        if (sp.t > 4 && d > 1 && Math.abs(p.x - b.x) > 12) {
          p.x += (s.x - p.x) * 0.04;
          p.z += (s.z - p.z) * 0.04;
        }
      }
      if (p.state === 'throw' && p !== sp.taker) p.state = 'move';
      p.input = null;
      p.update(dt, false);
      if (p === sp.taker && p.state === 'throw') p.stateT = 0;
    }
    if (!sp.ready) return;
    if (sp.type === 'penalty' && !sp.whistled) {
      sp.whistled = true;
      this.emit({ type: 'whistle', kind: 'short' });
    }
    const userTaking = sp.team.isUser;
    const wait = sp.t - sp.readyT;
    if (userTaking) {
      if (sp.userGo || wait > 12) this.executeSetPiece(sp.userGo || null);
    } else if (wait > 0.9 + (sp.type === 'penalty' ? 0.8 : 0)) {
      this.executeSetPiece(null);
    }
  }

  /** セットプレーを実行。user: {kind:'pass'|'through'|'lob'|'shot', dx, dz, power} */
  executeSetPiece(user) {
    const sp = this.sp;
    if (!sp || this.phase !== 'setpiece') return;
    const p = sp.taker;
    const b = this.ball;
    const team = sp.team;
    const dir = team.dir;
    p.state = 'move';
    p.facing = Math.atan2(b.z - p.z, b.x - p.x);
    this.phase = 'play';
    this.phaseT = 0;
    this.giveBall(p, true);
    b.x = sp.x;
    b.z = sp.z;
    const ux = user ? user.dx : 0;
    const uz = user ? user.dz : 0;
    const ul = Math.hypot(ux, uz);
    switch (sp.type) {
      case 'throwin': {
        let tgt = ul > 0.2 ? this.pickTeammate(p, ux, uz, 'lob') : null;
        if (!tgt) {
          const mates = team.players.filter((q) => q !== p && !q.isGK).map((q) => ({ q, d: Math.hypot(q.x - p.x, q.z - p.z), free: this.nearestOpponentDist(q) }));
          mates.sort((a, c) => a.d - a.free * 2 - (c.d - c.free * 2));
          tgt = mates[0].q;
        }
        const d = Math.min(Math.hypot(tgt.x - b.x, tgt.z - b.z), 22);
        const a = Math.atan2(tgt.z - b.z, tgt.x - b.x);
        const tx = b.x + Math.cos(a) * d;
        const tz = b.z + Math.sin(a) * d;
        p.setState('throw', 0.85, { release: true });
        const exec = () => {
          // タッチラインのすぐ内側から投げ入れる
          b.z = Math.sign(sp.z) * (PITCH.HW - 0.05);
          const s = solveLob(b.x, 2.2, b.z, tx, tz, 2.6 + d * 0.06, BALL_R);
          b.owner = null;
          b.y = 2.2;
          b.vx = s.vx;
          b.vy = s.vy;
          b.vz = s.vz;
          this.afterKick(p, 'throw', tgt, 0.3);
          this.offsideSet = null;
        };
        this.pending = { t: this.time + 0.5, fn: exec, p };
        break;
      }
      case 'corner': {
        if (user && user.kind === 'pass') {
          const tgt = this.pickTeammate(p, ux || -Math.sign(sp.x), uz || -Math.sign(sp.z), 'pass') || team.players[5];
          this.kickPass(p, tgt, tgt.x, tgt.z, 'pass');
        } else {
          const box = team.players.filter((q) => q !== p && !q.isGK && this.inBoxOf(this.teams[1 - team.index], q.x, q.z));
          let tgt = box.sort((a, c) => c.attrs.physical - a.attrs.physical)[Math.floor(this.rng() * Math.min(3, box.length))];
          if (user && ul > 0.2) tgt = this.pickTeammate(p, ux, uz, 'lob') || tgt;
          const tx = tgt ? tgt.x : dir * (PITCH.HL - 7);
          const tz = tgt ? tgt.z : 0;
          this.kickLob(p, tgt || null, tx, tz, 'cross');
        }
        break;
      }
      case 'goalkick': {
        if (user && user.kind === 'pass') {
          const tgt = this.pickTeammate(p, ux || dir, uz, 'pass') || team.players[2];
          this.kickPass(p, tgt, tgt.x, tgt.z, 'pass');
        } else if (!user && this.rng() < 0.35) {
          const cbs = team.players.filter((q) => q.role === 'DF');
          const tgt = cbs[Math.floor(this.rng() * cbs.length)];
          this.kickPass(p, tgt, tgt.x, tgt.z, 'pass');
        } else {
          let tgt = null;
          if (user && ul > 0.2) tgt = this.pickTeammate(p, ux, uz, 'lob');
          if (!tgt) {
            const fw = team.players.filter((q) => q.role !== 'DF' && !q.isGK);
            tgt = fw[Math.floor(this.rng() * fw.length)];
          }
          this.kickLob(p, tgt, tgt.x + dir * 3, tgt.z, 'lob');
        }
        break;
      }
      case 'penalty': {
        const gx = dir * PITCH.HL;
        let tz;
        let ty;
        let power;
        if (user && user.kind === 'shot') {
          tz = clamp((user.dz || 0) * dir * 3.4, -3.3, 3.3) * dir;
          tz = clamp(user.aimZ ?? tz, -3.4, 3.4);
          ty = user.aimY ?? 0.5 + (user.power || 0.6) * 1.2;
          power = user.power ?? 0.7;
        } else {
          tz = (this.rng() < 0.5 ? -1 : 1) * (1.6 + this.rng() * 1.6);
          ty = 0.3 + this.rng() * 1.6;
          power = 0.6 + this.rng() * 0.3;
        }
        this.penaltyKick(p, { x: gx, y: ty, z: tz }, power);
        break;
      }
      default: {
        // フリーキック
        const toGoal = Math.hypot(dir * PITCH.HL - b.x, b.z);
        const direct = !sp.opts.indirect && toGoal < 30 && Math.abs(b.z) < 22;
        if (user) {
          if (user.kind === 'shot' && !sp.opts.indirect) {
            const tgt = { x: dir * PITCH.HL, y: 1.4 + (user.power || 0.6) * 0.6, z: user.aimZ ?? (ux * 3) };
            this.kickShot(p, tgt, user.power ?? 0.75, user.curl ?? -dir * Math.sign(b.z || 1) * 6);
          } else if (user.kind === 'lob') {
            const tgt = this.pickTeammate(p, ux || dir, uz, 'lob');
            if (tgt) this.kickLob(p, tgt, tgt.x, tgt.z, this.inBoxOf(this.teams[1 - team.index], tgt.x, tgt.z) ? 'cross' : 'lob');
            else this.kickLob(p, null, b.x + dir * 25, b.z, 'lob');
          } else {
            const tgt = this.pickTeammate(p, ux || dir, uz, 'pass') || team.players[6];
            this.kickPass(p, tgt, tgt.x, tgt.z, user.kind === 'through' ? 'through' : 'pass');
          }
        } else if (direct && this.rng() < 0.65) {
          const gx = dir * PITCH.HL;
          const side = b.z > 0 ? -1 : 1;
          const tgt = { x: gx, y: 1.5 + this.rng() * 0.6, z: side * (2.2 + this.rng() * 1.0) * (Math.abs(b.z) < 5 ? (this.rng() < 0.5 ? 1 : -1) : 1) };
          const curl = -dir * side * (5 + this.rng() * 4);
          this.kickShot(p, tgt, 0.75 + this.rng() * 0.15, curl);
        } else {
          const choice = team.ai.decide(p);
          team.ai.execute(p, choice.kind === 'dribble' ? { kind: 'pass', ...this.bestShortPass(p) } : choice);
        }
      }
    }
    this.sp = null;
    this.emit({ type: 'setpieceTaken' });
  }

  bestShortPass(p) {
    const t = p.team.players.filter((q) => q !== p && !q.isGK).sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - this.nearestOpponentDist(a) * 0.5 - (Math.hypot(c.x - p.x, c.z - p.z) - this.nearestOpponentDist(c) * 0.5))[0];
    return { t, x: t.x, z: t.z };
  }

  penaltyKick(p, tgt, power) {
    const opp = this.teams[1 - p.team.index];
    const gk = opp.players[0];
    this.kickShot(p, tgt, power, 0);
    // GKは読みで飛ぶ（AIまたはユーザー指定）
    const userGK = opp.isUser;
    const guess = userGK && this.penaltyUserDive !== undefined ? this.penaltyUserDive : this.rng() < 0.5 ? -1 : 1;
    this.pendingPenaltyDive = { gk, guess, t: this.time + 0.12, tgt };
  }

  // ------------------------------------------------------------ 操作（ユーザー）

  bestUserPlayer() {
    if (this.user.team === null || this.user.team === undefined) return null;
    const team = this.teams[this.user.team];
    let best = null;
    let bt = Infinity;
    for (const p of team.players) {
      if (p.isGK) continue;
      const t = this.intercept(p).t + (p.state === 'fall' ? 3 : 0);
      if (t < bt) {
        bt = t;
        best = p;
      }
    }
    return best;
  }

  setControlled(p) {
    if (this.user.team === null || this.user.team === undefined) return;
    const prev = this.user.controlled;
    if (prev === p) return;
    if (prev) {
      prev.controlled = false;
      prev.input = null;
    }
    this.user.controlled = p;
    if (p) {
      p.controlled = true;
      this.user.switchT = this.time;
      this.emit({ type: 'switch', player: p });
    }
  }

  setUserInput(x, z, mag, sprint) {
    const u = this.user.input;
    u.x = x;
    u.z = z;
    u.mag = mag;
    u.sprint = sprint;
  }

  updateUser(dt) {
    const u = this.user;
    if (u.team === null || u.team === undefined) return;
    const team = this.teams[u.team];
    const b = this.ball;
    let c = u.controlled;
    // 自動切替
    if (b.owner && b.owner.team === team && !b.owner.isGK && c !== b.owner) this.setControlled(b.owner);
    else if (!b.owner && b.passTarget && b.passTarget.team === team && !b.passTarget.isGK && c !== b.passTarget) this.setControlled(b.passTarget);
    else if (u.autoSwitch && (!b.owner || b.owner.team !== team) && this.time - (u.switchT || 0) > 0.8) {
      const best = this.bestUserPlayer();
      if (best && c && best !== c) {
        const tc = this.intercept(c).t;
        const tb = this.intercept(best).t;
        const dc = Math.hypot(c.x - b.x, c.z - b.z);
        if ((tc - tb > 1.2 && dc > 12) || c.state === 'fall') this.setControlled(best);
      } else if (!c) this.setControlled(best);
    }
    c = u.controlled;
    if (!c || c.isGK) return;
    if (c.state === 'fall') return;
    const inp = u.input;
    if (inp.mag > 0.12) c.input = { x: inp.x, z: inp.z, mag: inp.mag, sprint: inp.sprint };
    else c.input = { x: 0, z: 0, mag: 0, sprint: false };
    // 守備時は向きをボールへ
    if (inp.mag <= 0.12) c.faceTo(b.x, b.z);
    else c.faceX = null;
    // 守備時、相手のボールに体を当てたら自動で奪いにいく
    if (b.owner && b.owner.team !== team && !c.busy) {
      const d = Math.hypot(b.owner.x - c.x, b.owner.z - c.z);
      if (d < 1.1 && c.tackleCd <= 0 && inp.mag > 0.3) this.tryTackle(c, b.owner);
    }
  }

  /** ボタン操作 */
  userAction(action, opts = {}) {
    const u = this.user;
    if (u.team === null || u.team === undefined) return;
    const team = this.teams[u.team];
    const b = this.ball;
    const c = u.controlled;
    const inp = u.input;
    const dx = inp.mag > 0.2 ? inp.x : 0;
    const dz = inp.mag > 0.2 ? inp.z : 0;
    if (this.phase === 'kickoff' && this.sp && this.sp.team === team) {
      if (action === 'pass' || action === 'through' || action === 'shoot') {
        this.sp.userGo = true;
        this.sp.userDir = inp.mag > 0.2 ? { x: dx, z: dz } : null;
      }
      return;
    }
    if (this.phase === 'setpiece' && this.sp && this.sp.team === team && this.sp.ready) {
      const kind = action === 'shoot' ? 'shot' : action;
      const power = opts.power ?? 0.7;
      let aimZ;
      if (kind === 'shot') {
        const dir = team.dir;
        // 画面上の左右入力 → ゴールのどちら側か
        aimZ = clamp(dz * 3.3 + (Math.abs(dz) < 0.2 ? (this.rng() - 0.5) * 4 : 0), -3.3, 3.3);
        void dir;
      }
      this.sp.userGo = { kind, dx, dz, power, aimZ, aimY: 0.4 + power * 1.4 };
      return;
    }
    if (this.phase !== 'play' || !c) return;
    const hasBall = b.owner === c;
    if (hasBall) {
      if (c.busy) return;
      if (action === 'pass') {
        const t = this.pickTeammate(c, dx, dz, 'pass');
        if (t) {
          const lead = 0.45;
          this.kickPass(c, t, t.x + t.vx * lead, t.z + t.vz * lead, 'pass');
        } else {
          const a = inp.mag > 0.2 ? Math.atan2(dz, dx) : c.facing;
          this.kickPass(c, null, c.x + Math.cos(a) * 14, c.z + Math.sin(a) * 14, 'pass');
        }
      } else if (action === 'through') {
        const t = this.pickTeammate(c, dx || team.dir, dz, 'through');
        if (t) {
          const dir = team.dir;
          const lead = 7 + Math.min(6, t.speed);
          const ax = Math.min(t.x * dir + lead, PITCH.HL - 5);
          this.kickPass(c, t, ax * dir, clamp(t.z + t.vz * 0.8, -PITCH.HW + 3, PITCH.HW - 3), 'through');
        } else {
          const a = inp.mag > 0.2 ? Math.atan2(dz, dx) : c.facing;
          this.kickPass(c, null, c.x + Math.cos(a) * 18, c.z + Math.sin(a) * 18, 'through');
        }
      } else if (action === 'lob') {
        const t = this.pickTeammate(c, dx, dz, 'lob');
        if (t) {
          const opp = this.teams[1 - team.index];
          const cross = this.inBoxOf(opp, t.x, t.z);
          this.kickLob(c, t, t.x + t.vx * 1.0, t.z + t.vz * 1.0, cross ? 'cross' : 'lob');
        } else {
          const a = inp.mag > 0.2 ? Math.atan2(dz, dx) : c.facing;
          this.kickLob(c, null, c.x + Math.cos(a) * 25, c.z + Math.sin(a) * 25, 'lob');
        }
      } else if (action === 'shoot') {
        const power = clamp(opts.power ?? 0.7, 0.15, 1);
        const dir = team.dir;
        const gx = dir * PITCH.HL;
        const gk = this.teams[1 - team.index].players[0];
        let tz;
        if (Math.abs(dz) > 0.25) tz = Math.sign(dz) * (PITCH.goalHalfW - 0.55) * Math.min(1, Math.abs(dz) * 1.4);
        else {
          // 入力なし: GKのいない側
          tz = (gk.z > 0 ? -1 : 1) * (PITCH.goalHalfW - 0.7);
        }
        const ty = 0.35 + power * 1.25;
        this.kickShot(c, { x: gx, y: ty, z: tz }, power, opts.curl ?? 0);
      }
    } else if (!b.owner || b.owner.team !== team) {
      if (action === 'pass' || action === 'switch') {
        const best = this.bestUserPlayer();
        if (best) this.setControlled(best === c ? this.secondBestUserPlayer(c) || best : best);
      } else if (action === 'shoot' || action === 'slide') {
        if (!c.busy) {
          const a = inp.mag > 0.2 ? Math.atan2(dz, dx) : b.owner ? Math.atan2(b.owner.z - c.z, b.owner.x - c.x) : Math.atan2(b.z - c.z, b.x - c.x);
          this.startSlide(c, a);
        }
      } else if (action === 'through' || action === 'tackle') {
        if (b.owner && b.owner.team !== team) {
          const d = Math.hypot(b.owner.x - c.x, b.owner.z - c.z);
          if (d < 1.8) this.tryTackle(c, b.owner);
          else {
            c.tackleCd = 0;
          }
        }
      }
    } else if (b.owner && b.owner.team === team && b.owner !== c) {
      // 味方が持っている（GK等）: 切替
      if (action === 'pass') this.setControlled(b.owner.isGK ? c : b.owner);
    }
  }

  secondBestUserPlayer(exclude) {
    const team = this.teams[this.user.team];
    let best = null;
    let bt = Infinity;
    for (const p of team.players) {
      if (p.isGK || p === exclude) continue;
      const t = this.intercept(p).t;
      if (t < bt) {
        bt = t;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ 選手同士の衝突

  separatePlayers() {
    const ps = this.players;
    const R = 0.62;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      for (let j = i + 1; j < ps.length; j++) {
        const c = ps[j];
        const dx = c.x - a.x;
        const dz = c.z - a.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-8) continue;
        const d = Math.sqrt(d2);
        const push = (R - d) * 0.5;
        const ma = a.attrs.physical + (this.ball.owner === a ? -10 : 0);
        const mc = c.attrs.physical + (this.ball.owner === c ? -10 : 0);
        const wa = mc / (ma + mc);
        const wc = 1 - wa;
        a.x -= (dx / d) * push * wa * 2;
        a.z -= (dz / d) * push * wa * 2;
        c.x += (dx / d) * push * wc * 2;
        c.z += (dz / d) * push * wc * 2;
      }
    }
    // ピッチ外へ出すぎない
    for (const p of ps) {
      p.x = clamp(p.x, -PITCH.HL - 4, PITCH.HL + 4);
      p.z = clamp(p.z, -PITCH.HW - 3, PITCH.HW + 3);
      // GKはゴールの中に入らない（ボールを持ったまま入るとゴールになってしまう）
      if (p.isGK && Math.abs(p.z) < PITCH.goalHalfW + 0.5) {
        const lim = PITCH.HL - (this.ball.owner === p ? 0.6 : 0.15);
        if (Math.abs(p.x) > lim) {
          p.x = Math.sign(p.x) * lim;
          if (p.vx * Math.sign(p.x) > 0) p.vx = 0;
        }
      }
    }
  }

  // ------------------------------------------------------------ 審判

  updateOfficials(dt) {
    const b = this.ball;
    const bx = b.owner ? b.owner.x : b.x;
    const bz = b.owner ? b.owner.z : b.z;
    const [ref, ar1, ar2] = this.officials;
    // 主審: ボールから斜め後方に距離を取る
    const side = bx > 0 ? -1 : 1;
    let tx = bx + side * 10;
    let tz = bz - 9 * Math.sign(bz || 1) * (Math.abs(bz) > 20 ? 1 : 0.5) - 4;
    tx = clamp(tx, -PITCH.HL + 8, PITCH.HL - 8);
    tz = clamp(tz, -PITCH.HW + 4, PITCH.HW - 4);
    if (this.phase === 'goal' || this.phase === 'replay') {
      tx = 0;
      tz = -2;
    }
    this.moveOfficial(ref, tx, tz, dt, Math.atan2(bz - ref.z, bx - ref.x));
    // 副審: 担当サイドの最終ライン
    for (const ar of [ar1, ar2]) {
      const half = ar === ar1 ? 1 : -1;
      const defTeam = this.teams.find((t) => t.dir === -half);
      const xs = defTeam.players.map((p) => p.x * half).sort((a, c) => c - a);
      let lx = Math.max(xs[1] ?? 0, bx * half, 0);
      lx = clamp(lx, 0, PITCH.HL) * half;
      this.moveOfficial(ar, lx, half > 0 ? -PITCH.HW - 1.4 : PITCH.HW + 1.4, dt, half > 0 ? Math.PI / 2 : -Math.PI / 2, true);
      if (ar.poseT > 0) ar.poseT -= dt;
      else ar.pose = 'run';
    }
  }

  moveOfficial(o, tx, tz, dt, face, sideways = false) {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(d * 1.2, sideways ? 7 : 6.5);
    const wx = d > 0.1 ? (dx / d) * sp : 0;
    const wz = d > 0.1 ? (dz / d) * sp : 0;
    o.vx += (wx - o.vx) * Math.min(1, dt * 3);
    o.vz += (wz - o.vz) * Math.min(1, dt * 3);
    o.x += o.vx * dt;
    o.z += o.vz * dt;
    const spd = Math.hypot(o.vx, o.vz);
    const want = sideways || spd < 2 ? face : Math.atan2(o.vz, o.vx);
    o.facing += wrapAngle(want - o.facing) * Math.min(1, dt * 6);
  }
}
