import * as THREE from 'three';
import { Match } from '../sim/match.js';
import { SIM_DT, PITCH, BALL_R } from '../config.js';
import { defaultLook } from '../render/humans.js';
import * as A from '../render/anim.js';
import { POSE_KEYS, makePose } from '../render/anim.js';
import { clamp, lerp, wrapAngle, smoothstep } from '../util/math.js';
import { flagCanvas } from '../ui/flags.js';

// 試合の見た目: シミュレーションを固定ステップで進め、補間して人物・ボール・カメラに反映する。
// ゴール後のセレブレーション/リプレイのカメラワークもここで行う。

const REF_LOOK = { shirt: '#111318', shirt2: '#2be38b', shorts: '#111318', socks: '#111318', boots: '#111111', pattern: 0 };
const AR_LOOK = { shirt: '#f5e400', shirt2: '#111318', shorts: '#111318', socks: '#111318', boots: '#111111', pattern: 0 };
const NUM_HUMANS = 33; // 選手22 + 審判3 + ベンチ8

function lookFrom(kit, pd, gkKit) {
  const look = defaultLook();
  const k = gkKit || kit;
  look.shirt.set(k.shirt);
  look.shirt2.set(k.shirt2);
  look.sleeve.set(k.shirt);
  look.shorts.set(k.shorts);
  look.socks.set(k.socks);
  look.pattern = k.pattern;
  if (pd) {
    look.skin.set(pd.look.skin);
    look.hair.set(pd.look.hair);
    look.hairStyle = pd.look.hairStyle;
    look.height = pd.look.height;
    look.build = pd.look.build;
    look.boots.set(pd.look.boots);
    look.number = pd.num;
  }
  if (gkKit) {
    look.gloves = new THREE.Color('#f2f2f2');
    look.longSleeve = true;
  }
  return look;
}

class ReplayBuffer {
  constructor(humans, seconds = 9, hz = 30) {
    this.hz = hz;
    this.n = humans;
    this.cap = Math.ceil(seconds * hz);
    this.stride = humans * (5 + POSE_KEYS.length) + 8;
    this.data = new Float32Array(this.cap * this.stride);
    this.times = new Float64Array(this.cap);
    this.count = 0;
    this.head = 0;
    this.lastT = -1;
  }

  clear() {
    this.count = 0;
    this.head = 0;
    this.lastT = -1;
  }

  record(t, humans, ball, ballQuat) {
    if (t - this.lastT < 1 / this.hz - 1e-4) return;
    this.lastT = t;
    const i = this.head;
    this.times[i] = t;
    let o = i * this.stride;
    const d = this.data;
    for (let h = 0; h < this.n; h++) {
      const tr = humans.transforms[h];
      d[o++] = tr.x;
      d[o++] = tr.y || 0;
      d[o++] = tr.z;
      d[o++] = tr.yaw;
      d[o++] = tr.visible ? 1 : 0;
      const p = humans.poses[h];
      for (const k of POSE_KEYS) d[o++] = p[k];
    }
    d[o++] = ball.x;
    d[o++] = ball.y;
    d[o++] = ball.z;
    d[o++] = ballQuat.x;
    d[o++] = ballQuat.y;
    d[o++] = ballQuat.z;
    d[o++] = ballQuat.w;
    d[o++] = ball.speed || 0;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.count + 1, this.cap);
  }

  /** 古い順のインデックス */
  index(k) {
    return (this.head - this.count + k + this.cap) % this.cap;
  }

  get startTime() {
    return this.count ? this.times[this.index(0)] : 0;
  }

  get endTime() {
    return this.count ? this.times[this.index(this.count - 1)] : 0;
  }

  /** 時刻tの状態を人物とボールへ書き込む */
  apply(t, humans, ballOut) {
    if (!this.count) return;
    let lo = 0;
    let hi = this.count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.times[this.index(mid)] <= t) lo = mid;
      else hi = mid - 1;
    }
    const i0 = this.index(lo);
    const i1 = this.index(Math.min(lo + 1, this.count - 1));
    const t0 = this.times[i0];
    const t1 = this.times[i1];
    const f = t1 > t0 ? clamp((t - t0) / (t1 - t0), 0, 1) : 0;
    const d = this.data;
    let a = i0 * this.stride;
    let b = i1 * this.stride;
    for (let h = 0; h < this.n; h++) {
      const tr = humans.transforms[h];
      tr.x = lerp(d[a], d[b], f);
      tr.y = lerp(d[a + 1], d[b + 1], f);
      tr.z = lerp(d[a + 2], d[b + 2], f);
      tr.yaw = d[a + 3] + wrapAngle(d[b + 3] - d[a + 3]) * f;
      tr.visible = d[a + 4] > 0.5;
      a += 5;
      b += 5;
      const p = humans.poses[h];
      for (const k of POSE_KEYS) {
        p[k] = lerp(d[a], d[b], f);
        a++;
        b++;
      }
    }
    ballOut.x = lerp(d[a], d[b], f);
    ballOut.y = lerp(d[a + 1], d[b + 1], f);
    ballOut.z = lerp(d[a + 2], d[b + 2], f);
    ballOut.q.set(d[a + 3], d[a + 4], d[a + 5], d[a + 6]);
    ballOut.speed = lerp(d[a + 7], d[b + 7], f);
  }
}

export class MatchView {
  /**
   * @param {World} world
   * @param {object} cfg {home, away, kits, settings, seed, preset, pitchStyle}
   */
  constructor(world, cfg) {
    this.world = world;
    this.cfg = cfg;
    this.match = new Match({ home: cfg.home, away: cfg.away, kits: cfg.kits, settings: cfg.settings, seed: cfg.seed });
    this.listeners = [];
    this.acc = 0;
    this.timeScale = 1;
    this.paused = false;
    this.prev = new Map();
    this.renderPose = makePose();
    this.gaitPhase = new Float32Array(NUM_HUMANS);
    this.lastFacing = new Float32Array(NUM_HUMANS);
    this.refPoseT = 0;
    this.replay = new ReplayBuffer(NUM_HUMANS);
    this.replayState = null;
    this.camMode = 'broadcast';
    this.camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 30 };
    this.ballDisplay = { x: 0, y: BALL_R, z: 0, speed: 0, q: new THREE.Quaternion() };
    this.excite = 0.2;
    this.netEvents = [];
    this.hold = false; // 試合前の演出中はシミュレーションを止める
    this.externalCamera = false;
    this.introT = null;
    this.setupWorld();
  }

  dispose() {
    this.listeners.length = 0;
  }

  on(fn) {
    this.listeners.push(fn);
  }

  emit(e) {
    for (const fn of this.listeners) fn(e);
  }

  setupWorld() {
    const w = this.world;
    const m = this.match;
    const [hk, ak] = this.cfg.kits;
    m.teams.forEach((t, ti) => {
      const kit = ti === 0 ? hk : ak;
      t.players.forEach((p, i) => {
        w.humans.applyLook(ti * 11 + i, lookFrom(kit, p.data, p.isGK ? t.data.kits.gk : null));
      });
    });
    w.humans.applyLook(22, lookFrom(REF_LOOK, null));
    w.humans.applyLook(23, lookFrom(AR_LOOK, null));
    w.humans.applyLook(24, lookFrom(AR_LOOK, null));
    for (const i of [22, 23, 24]) {
      w.humans.looks[i].hairStyle = 1;
      w.humans.looks[i].height = 0.98;
    }
    // ベンチ: 控え選手3人（トレーニングウェア）と監督
    m.teams.forEach((t, ti) => {
      const kit = ti === 0 ? hk : ak;
      for (let k = 0; k < 4; k++) {
        const idx = 25 + ti * 4 + k;
        const look = defaultLook();
        if (k < 3) {
          look.shirt.set(kit.shirt).multiplyScalar(0.55);
          look.shirt2.set(kit.shirt2);
          look.sleeve.copy(look.shirt);
          look.shorts.set(kit.shorts).multiplyScalar(0.6);
          look.socks.set(kit.socks);
          look.longSleeve = true;
          look.pattern = 0;
          const pd = t.data.players[(k * 3 + 2) % 11];
          look.skin.set(pd.look.skin);
          look.hair.set(pd.look.hair);
        } else {
          look.shirt.set('#1d2230');
          look.shirt2.set('#ffffff');
          look.sleeve.set('#1d2230');
          look.shorts.set('#1d2230');
          look.socks.set('#1d2230');
          look.trousers = new THREE.Color('#1d2230');
          look.boots.set('#0e0e0e');
          look.longSleeve = true;
          look.skin.set(t.data.skin[0]);
          look.hair.set(ti === 0 ? '#3a3a3a' : '#5a4a3a');
          look.height = 0.98;
        }
        w.humans.applyLook(idx, look);
      }
    });
    w.stadium.setBenchColors(hk.shirt, ak.shirt);
    w.humans.setCount(NUM_HUMANS);
    w.setCrowdTeams(this.cfg.home.crowdColors, this.cfg.away.crowdColors);
    w.standFlags.setTeams(flagCanvas(this.cfg.home.flag), flagCanvas(this.cfg.away.flag));
    w.weather = this.cfg.weather || 'clear';
    w.setPreset(this.cfg.preset || 'day');
    w.setPitchStyle(this.cfg.pitchStyle || 0);
    w.setBroadcastCamera();
    const userIdx = m.settings.userTeam;
    w.markers.setUserColor(userIdx === null || userIdx === undefined ? '#ffe14a' : '#ffe14a');
    w.ball.resetTrail();
    this.snapshotPrev();
  }

  start() {
    this.match.start();
    this.snapshotPrev();
  }

  snapshotPrev() {
    for (const p of this.match.players) {
      let s = this.prev.get(p);
      if (!s) {
        s = {};
        this.prev.set(p, s);
      }
      s.x = p.x;
      s.z = p.z;
      s.y = p.y;
      s.f = p.facing;
    }
    const b = this.match.ball;
    let s = this.prev.get(b);
    if (!s) {
      s = {};
      this.prev.set(b, s);
    }
    s.x = b.x;
    s.y = b.y;
    s.z = b.z;
    for (const o of this.match.officials) {
      let so = this.prev.get(o);
      if (!so) {
        so = {};
        this.prev.set(o, so);
      }
      so.x = o.x;
      so.z = o.z;
      so.f = o.facing;
    }
  }

  // ------------------------------------------------------------ 更新

  update(dt) {
    const m = this.match;
    const w = this.world;
    if (this.replayState) {
      this.updateReplay(dt);
      w.update(dt);
      return;
    }
    if (!this.paused && !this.hold) {
      this.acc += dt * this.timeScale;
      let steps = 0;
      while (this.acc >= SIM_DT && steps < 5) {
        this.snapshotPrev();
        m.step(SIM_DT);
        this.acc -= SIM_DT;
        steps++;
        for (const e of m.drainEvents()) this.handleEvent(e);
        if (this.replayState) break;
      }
      if (steps === 5) this.acc = 0;
    }
    const alpha = this.paused || this.hold ? 1 : clamp(this.acc / SIM_DT, 0, 1);
    this.applyState(alpha, this.paused ? 0 : dt);
    this.updateCamera(dt);
    this.updateCrowd(dt);
    w.update(this.paused ? 0 : dt);
    if (!this.paused && !this.hold) this.replay.record(m.time, w.humans, this.ballDisplay, w.ball.mesh.quaternion);
  }

  /** シミュレーション状態を描画用に反映 */
  applyState(alpha, dt) {
    const m = this.match;
    const w = this.world;
    const H = w.humans;
    const time = w.time;
    m.players.forEach((p, i) => {
      const idx = p.team.index * 11 + p.index;
      const pr = this.prev.get(p);
      const tr = H.transforms[idx];
      tr.x = lerp(pr.x, p.x, alpha);
      tr.z = lerp(pr.z, p.z, alpha);
      tr.y = lerp(pr.y, p.y, alpha);
      const f = pr.f + wrapAngle(p.facing - pr.f) * alpha;
      tr.yaw = Math.PI / 2 - f;
      tr.visible = true;
      this.poseFor(p, idx, dt, time);
      void i;
    });
    // 審判
    m.officials.forEach((o, k) => {
      const idx = 22 + k;
      const pr = this.prev.get(o);
      const tr = H.transforms[idx];
      tr.x = lerp(pr.x, o.x, alpha);
      tr.z = lerp(pr.z, o.z, alpha);
      tr.y = 0;
      const f = pr.f + wrapAngle(o.facing - pr.f) * alpha;
      tr.yaw = Math.PI / 2 - f;
      tr.visible = true;
      const sp = Math.hypot(o.vx, o.vz);
      const target = this.renderPose;
      if (o.kind === 'ar' && o.pose === 'flag') A.flagUp(target, o.side > 0 ? -1 : 1);
      else if (o.kind === 'ref' && this.refPoseT > 0) A.pointArm(target, 1, 0.3);
      else {
        this.gaitPhase[idx] = (this.gaitPhase[idx] + (sp * dt) / (0.9 + sp * 0.17)) % 1;
        A.locomotion(target, sp, this.gaitPhase[idx], time, { seed: idx });
      }
      this.blendPose(idx, target, dt);
    });
    this.refPoseT = Math.max(0, this.refPoseT - dt);
    // ベンチ
    for (let ti = 0; ti < 2; ti++) {
      const t = m.teams[ti];
      const cx = (ti === 0 ? -1 : 1) * 11;
      for (let k = 0; k < 4; k++) {
        const idx = 25 + ti * 4 + k;
        const tr = H.transforms[idx];
        tr.visible = true;
        tr.y = 0;
        const target = this.renderPose;
        if (k < 3) {
          tr.x = cx - 2.4 + k * 1.07 * 1.5;
          tr.z = -(PITCH.HW + 5.4) - 0.45;
          tr.yaw = 0;
          A.seated(target, w.time, idx);
          if (m.phase === 'goal' && m.goalInfo?.team === ti) {
            A.celebrate(target, 3, 0.5, 0, 0, w.time + idx);
            tr.z += 1.2;
          }
        } else {
          // 監督はテクニカルエリアでボールの方を見る
          const b = m.ball;
          tr.x = cx + Math.sin(w.time * 0.2 + ti) * 1.5;
          tr.z = -(PITCH.HW + 2.2);
          const f = Math.atan2(b.z - tr.z, b.x - tr.x);
          tr.yaw = Math.PI / 2 - f;
          const near = Math.abs(b.x - tr.x) < 25 && m.phase === 'play';
          A.coach(target, w.time, idx, near && Math.sin(w.time * 0.7 + ti * 2) > 0.3 ? 1 : 0);
          if (m.phase === 'goal' && m.goalInfo?.team === ti) A.celebrate(target, 2, 0.5, 0, 0, w.time);
        }
        this.blendPose(idx, target, dt);
      }
      void t;
    }
    H.update();

    // ボール
    const b = m.ball;
    const pb = this.prev.get(b);
    const bd = this.ballDisplay;
    bd.x = lerp(pb.x, b.x, alpha);
    bd.y = lerp(pb.y, b.y, alpha);
    bd.z = lerp(pb.z, b.z, alpha);
    bd.speed = b.speed;
    const o = b.owner;
    if (o && (o.state === 'hold' || o.state === 'throw' || (o.isGK && o.sd.holding))) {
      const idx = o.team.index * 11 + o.index;
      const hp = H.handPos[idx];
      bd.x = (hp[0].x + hp[1].x) / 2;
      bd.y = (hp[0].y + hp[1].y) / 2 + (o.state === 'throw' && !o.sd.underarm ? 0.08 : 0.05);
      bd.z = (hp[0].z + hp[1].z) / 2;
    }
    w.ball.update(bd, { x: b.vx, y: b.vy, z: b.vz }, dt || 1 / 60, w.camera);

    // 旗
    [1, 2].forEach((k, j) => {
      const of = m.officials[k];
      const idx = 22 + k;
      const flag = w.flags[j];
      flag.visible = true;
      const hp = H.handPos[idx][of.side > 0 ? 0 : 1];
      flag.position.copy(hp);
      flag.rotation.y = H.transforms[idx].yaw;
    });

    // マーカー
    const u = m.user;
    const showUser = u.controlled && (m.phase === 'play' || m.phase === 'setpiece' || m.phase === 'kickoff' || m.phase === 'stoppage');
    let user = null;
    if (showUser) {
      const idx = u.controlled.team.index * 11 + u.controlled.index;
      const tr = H.transforms[idx];
      user = { x: tr.x, z: tr.z, headY: H.headPos[idx].y };
    }
    let receiver = null;
    if (b.passTarget && !b.owner && u.team !== null && u.team !== undefined && b.passTarget.team.index === u.team && m.phase === 'play' && b.passTarget !== u.controlled) {
      const idx = b.passTarget.team.index * 11 + b.passTarget.index;
      receiver = { x: H.transforms[idx].x, z: H.transforms[idx].z };
    }
    let aim = null;
    if (m.phase === 'setpiece' && m.sp && m.sp.ready && m.sp.team.isUser && m.sp.type !== 'penalty') {
      const inp = u.input;
      let ang;
      if (inp.mag > 0.2) ang = Math.atan2(inp.z, inp.x);
      else ang = Math.atan2(-m.sp.z * 0.5, m.sp.team.dir * PITCH.HL - m.sp.x);
      aim = { x: m.ball.x, z: m.ball.z, angle: ang, length: 5 };
    }
    w.markers.update(dt, { user, receiver, aim, showArrow: true });
  }

  blendPose(idx, target, dt) {
    const p = this.world.humans.poses[idx];
    const k = dt > 0 ? 1 - Math.exp(-dt * 20) : 1;
    for (const key of POSE_KEYS) p[key] += (target[key] - p[key]) * k;
    p.groundLock = target.groundLock;
  }

  /** 選手の状態から姿勢を作る */
  poseFor(p, idx, dt, time) {
    const m = this.match;
    const t = this.renderPose;
    const sp = p.speed;
    const stride = 0.95 + sp * 0.17;
    this.gaitPhase[idx] = (this.gaitPhase[idx] + (sp * dt) / stride) % 1;
    const ph = this.gaitPhase[idx];
    const dF = wrapAngle(p.facing - this.lastFacing[idx]);
    this.lastFacing[idx] = p.facing;
    const turnRate = dt > 0 ? dF / dt : 0;
    const lean = clamp(turnRate * sp * 0.035, -0.35, 0.35);
    const st = p.state;
    const tn = p.stateDur > 0 ? clamp(p.stateT / p.stateDur, 0, 1) : 0;
    switch (st) {
      case 'kick': {
        const kind = p.sd.kind === 'shot' ? 'shot' : p.sd.kind === 'lob' || p.sd.kind === 'cross' ? 'lob' : 'pass';
        // 接触タイミングがアニメーションの0.5に来るように時間を変換
        const c = p.sd.contact || 0.15;
        const tt = p.stateT < c ? (p.stateT / c) * 0.5 : 0.5 + ((p.stateT - c) / Math.max(0.1, p.stateDur - c)) * 0.5;
        A.kick(t, clamp(tt, 0, 1), p.sd.foot || 1, kind);
        break;
      }
      case 'tackle':
        A.kick(t, clamp(0.35 + tn * 0.5, 0, 1), 1, 'pass');
        t.bodyPitch += 0.15;
        break;
      case 'slide':
        A.slide(t, tn);
        break;
      case 'header':
        A.header(t, tn, Math.max(0.1, p.y));
        t.rootY = 0;
        break;
      case 'dive': {
        const air = p.sd.airTime || 0.4;
        const tt = p.stateT < air ? (p.stateT / air) * 0.45 : 0.45 + ((p.stateT - air) / Math.max(0.2, p.stateDur - air)) * 0.55;
        if (p.sd.smother) {
          A.slide(t, clamp(tt, 0, 1));
          t.bodyRoll = 1.2;
        } else A.dive(t, clamp(tt, 0, 1), p.sd.side || 1, p.sd.height || 0.3);
        t.rootY += p.y * 0;
        break;
      }
      case 'catch':
        A.keeperReady(t, time, 0.6, idx);
        t.lShSwing = 1.2;
        t.rShSwing = 1.2;
        t.lElbow = 1.0;
        t.rElbow = 1.0;
        break;
      case 'fall':
        A.fall(t, tn);
        break;
      case 'stumble':
        A.locomotion(t, sp, ph, time, { turnLean: lean });
        t.bodyPitch += 0.35 * Math.sin(tn * Math.PI);
        break;
      case 'hold':
        A.holdBall(t, time);
        if (sp > 0.3) {
          const leg = makePose();
          A.locomotion(leg, sp, ph, time);
          for (const k of ['lHipSwing', 'rHipSwing', 'lKnee', 'rKnee', 'lAnkle', 'rAnkle', 'rootY']) t[k] = leg[k];
        }
        break;
      case 'throw': {
        if (p.sd.underarm) A.throwBall(t, tn, false);
        else A.throwBall(t, p.sd.ready ? 0.3 : clamp(0.3 + tn * 0.9, 0, 1), true);
        break;
      }
      case 'celebrate': {
        const kind = p.sd.kind ?? 0;
        A.celebrate(t, kind, clamp(m.phaseT / 4, 0, 1), sp, ph, time + idx);
        break;
      }
      case 'dejected':
        A.dejected(t, time, idx);
        break;
      default: {
        // 移動
        const gkReady = p.isGK && m.phase === 'play' && sp < 3.5 && Math.hypot(m.ball.x - p.x, m.ball.z - p.z) < 32;
        if (gkReady) {
          A.keeperReady(t, time, 1 - sp / 3.5, idx);
          if (sp > 0.3) {
            // 構えたまま横移動
            const leg = makePose();
            A.locomotion(leg, sp, ph, time);
            for (const k of ['lHipSwing', 'rHipSwing', 'lKnee', 'rKnee']) t[k] = lerp(t[k], leg[k], 0.6);
          }
        } else if (p.stamina < 0.45 && sp < 0.5 && m.phase !== 'play') {
          A.tired(t, time, idx);
        } else {
          A.locomotion(t, sp, ph, time, { turnLean: lean, seed: idx, carry: false });
        }
      }
    }
    this.blendPose(idx, t, dt);
  }

  // ------------------------------------------------------------ イベント

  handleEvent(e) {
    const w = this.world;
    const m = this.match;
    switch (e.type) {
      case 'net':
        w.goals.hitNet(e.side, new THREE.Vector3(e.x, e.y, e.z), clamp(e.v / 18, 0.2, 1.3), w.time);
        this.netEvents.push({ t: m.time, side: e.side, x: e.x, y: e.y, z: e.z, v: e.v });
        break;
      case 'slide':
        w.fx.grassSpray(e.player.x, e.player.z, Math.cos(e.player.facing), Math.sin(e.player.facing));
        break;
      case 'goal': {
        const t = m.teams[e.team];
        const kit = t.kit;
        const area = { x: t.dir * 60, z: 0, w: 30, d: 90 };
        w.fx.confettiBurst([kit.shirt, kit.shirt2, '#ffffff'], 500, area);
        this.goalTime = m.time;
        this.camMode = 'celebrate';
        this.celebrateStart = w.time;
        break;
      }
      case 'replay':
        this.startReplay(e.goal);
        break;
      case 'foul':
        this.refPoseT = 1.5;
        break;
      case 'kickoffSetup':
        this.camMode = 'broadcast';
        this.world.ball.resetTrail();
        break;
      default:
        break;
    }
    this.emit(e);
  }

  updateCrowd(dt) {
    const m = this.match;
    const b = m.ball;
    const w = this.world;
    // ボールがゴールに近いほど盛り上がる
    let target = 0.15;
    let home = 0;
    let away = 0;
    if (m.phase === 'play') {
      const dHome = Math.hypot(b.x - m.teams[1].dir * -PITCH.HL, b.z); // ホームが攻めるゴールまで
      const atkHome = m.teams[0].dir * PITCH.HL;
      const dToAway = Math.hypot(b.x - atkHome, b.z);
      const dToHome = Math.hypot(b.x + atkHome, b.z);
      home = 0.15 + 0.5 * (1 - smoothstep(10, 40, dToAway));
      away = 0.15 + 0.5 * (1 - smoothstep(10, 40, dToHome));
      void dHome;
      target = 0.15;
    }
    if (m.phase === 'goal' || m.phase === 'replay') {
      const g = m.goalInfo;
      if (g) {
        if (g.team === 0) home = 1;
        else away = 1;
      }
    }
    this.excite = lerp(this.excite, target, 1 - Math.exp(-dt));
    w.crowd.setExcitement(this.excite, home, away);
  }

  // ------------------------------------------------------------ カメラ

  updateCamera(dt) {
    if (this.externalCamera) return;
    const w = this.world;
    const cam = w.camera;
    const m = this.match;
    if (this.introT !== null && this.introT !== undefined) {
      // 試合前: スタジアム上空から中継カメラ位置へ降りてくる
      const f = w.broadcast;
      const k = smoothstep(0, 4.0, this.introT);
      const a = (1 - k) * 1.2;
      const start = new THREE.Vector3(Math.sin(a) * 70, 70 - k * 0, Math.cos(a) * 110);
      cam.position.lerpVectors(start, f.position, k);
      const look = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 5, 0), f.target, k);
      cam.lookAt(look);
      cam.fov = lerp(40, f.fov, k);
      cam.updateProjectionMatrix();
      w.stadium.setBroadcastView(true);
      return;
    }
    if (this.camMode === 'celebrate' && m.goalInfo && m.goalInfo.scorer) {
      const s = m.goalInfo.ownGoal ? null : m.goalInfo.scorer;
      const elapsed = w.time - this.celebrateStart;
      if (s && elapsed > 1.0) {
        const idx = s.team.index * 11 + s.index;
        const tr = w.humans.transforms[idx];
        const toCenter = new THREE.Vector3(-tr.x, 0, -tr.z).normalize();
        const want = new THREE.Vector3(tr.x + toCenter.x * 11, 3.2, tr.z + toCenter.z * 11 + 2);
        const look = new THREE.Vector3(tr.x, 1.2, tr.z);
        if (elapsed < 1.05) {
          this.camState.pos.copy(want);
          this.camState.look.copy(look);
        }
        this.camState.pos.lerp(want, 1 - Math.exp(-dt * 2));
        this.camState.look.lerp(look, 1 - Math.exp(-dt * 5));
        cam.position.copy(this.camState.pos);
        cam.lookAt(this.camState.look);
        cam.fov = 34;
        cam.updateProjectionMatrix();
        w.stadium.setBroadcastView(false);
        return;
      }
    }
    if (this.camMode !== 'broadcast' && m.phase !== 'goal') this.camMode = 'broadcast';
    if (this.zoomCamera) {
      // ズームカメラ: 中継カメラと同じ角度で、ボールを追いながら寄る
      const f = w.broadcast;
      const b = m.ball;
      const bx = clamp(b.owner ? b.owner.x : b.x, -34, 34);
      const bz = clamp(b.owner ? b.owner.z : b.z, -20, 20);
      if (!this.zoomState) this.zoomState = { x: bx, z: bz };
      this.zoomState.x = lerp(this.zoomState.x, bx, 1 - Math.exp(-dt * 2.2));
      this.zoomState.z = lerp(this.zoomState.z, bz, 1 - Math.exp(-dt * 1.6));
      const dir = new THREE.Vector3().subVectors(f.target, f.position);
      const target = new THREE.Vector3(this.zoomState.x, 0, f.target.z + this.zoomState.z * 0.55);
      cam.position.copy(target).addScaledVector(dir, -0.55);
      cam.lookAt(target);
      cam.fov = f.fov;
      cam.updateProjectionMatrix();
      w.stadium.setBroadcastView(true);
      return;
    }
    w.setBroadcastCamera();
  }

  // ------------------------------------------------------------ リプレイ

  startReplay(goal) {
    const rb = this.replay;
    if (!rb.count) {
      this.match.endReplay();
      return;
    }
    const end = Math.min(rb.endTime, this.goalTime + 1.2);
    const start = Math.max(rb.startTime, end - 6.0);
    this.replayState = { t: start, start, end, goal, speed: 0.55, side: this.match.teams[goal.team].dir, netIdx: 0 };
    this.world.ball.resetTrail();
    this.world.stadium.setBroadcastView(false);
    this.emit({ type: 'replayStart' });
  }

  skipReplay() {
    if (this.replayState) this.replayState.t = this.replayState.end + 1;
  }

  updateReplay(dt) {
    const r = this.replayState;
    const w = this.world;
    r.t += dt * r.speed;
    if (r.t >= r.end) {
      this.replayState = null;
      this.emit({ type: 'replayEnd' });
      this.camMode = 'broadcast';
      this.match.endReplay();
      for (const e of this.match.drainEvents()) this.handleEvent(e);
      this.snapshotPrev();
      w.setBroadcastCamera();
      w.humans.setCount(NUM_HUMANS);
      return;
    }
    this.replay.apply(r.t, w.humans, this.ballDisplay);
    // ネットの揺れを再現
    for (const ne of this.netEvents) {
      if (ne.t > r.t - dt * r.speed && ne.t <= r.t) w.goals.hitNet(ne.side, new THREE.Vector3(ne.x, ne.y, ne.z), clamp(ne.v / 18, 0.2, 1.3), w.time);
    }
    w.humans.update();
    const bd = this.ballDisplay;
    w.ball.mesh.quaternion.copy(bd.q);
    w.ball.lastPos.set(bd.x, bd.y, bd.z);
    w.ball.update(bd, { x: bd.speed, y: 0, z: 0 }, dt * r.speed, w.camera);
    w.markers.update(dt, { user: null, receiver: null, aim: null });
    // カメラ: 序盤は横から追いかけ、ゴール前はゴール裏の低い位置から
    const cam = w.camera;
    const side = r.side;
    const nearGoal = Math.abs(bd.x - side * PITCH.HL) < 24;
    let pos;
    let look;
    if (!nearGoal) {
      pos = new THREE.Vector3(bd.x - side * 7, 4.5, bd.z + 15);
      look = new THREE.Vector3(bd.x + side * 3, 1.0, bd.z);
      cam.fov = 38;
    } else {
      pos = new THREE.Vector3(side * (PITCH.HL + 9), 2.6, clamp(bd.z * 0.4, -6, 6) + 3);
      look = new THREE.Vector3(bd.x, Math.max(0.8, bd.y * 0.6), bd.z);
      cam.fov = 30;
    }
    if (this.replayCut !== nearGoal) {
      this.replayCut = nearGoal;
      this.camState.pos.copy(pos);
      this.camState.look.copy(look);
    }
    this.camState.pos.lerp(pos, 1 - Math.exp(-dt * 3));
    this.camState.look.lerp(look, 1 - Math.exp(-dt * 6));
    cam.position.copy(this.camState.pos);
    cam.lookAt(this.camState.look);
    cam.updateProjectionMatrix();
  }

  get inReplay() {
    return !!this.replayState;
  }
}
