import * as THREE from 'three';
import { Ball, solveShot } from '../sim/ball.js';
import { PITCH, BALL_R } from '../config.js';
import * as A from '../render/anim.js';
import { makePose, POSE_KEYS } from '../render/anim.js';
import { h } from '../ui/dom.js';
import { flagImg } from '../ui/flags.js';
import { clamp, lerp, makeRng } from '../util/math.js';
import { haptic } from '../platform.js';

// PK戦: キッカーの背後からのカメラ。ユーザーのキッカーは狙いと強さを、GKはダイブ方向を選ぶ。

const GX = PITCH.HL; // +x側のゴールを使う
const SPOT = GX - PITCH.spot;

export class Shootout {
  constructor(app, mv, onDone) {
    this.app = app;
    this.mv = mv;
    this.m = mv.match;
    this.world = mv.world;
    this.onDone = onDone;
    this.rng = makeRng((Math.random() * 1e9) | 0);
    this.ball = new Ball();
    this.results = [[], []];
    this.turn = 0; // 先攻
    this.kickIndex = [0, 0];
    this.state = 'intro';
    this.t = 0;
    this.aim = { x: 0, y: 0.5 };
    this.pose = makePose();
    this.gkDive = 0;
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.buildUI();
    this.m.phase = 'penalties';
    this.app.audio.whistle('short');
    this.setupKick();
  }

  buildUI() {
    const [a, b] = this.m.teams;
    this.board = h('div.pk-board.panel');
    this.rows = [a, b].map((t) => {
      const dots = h('div.dots');
      this.board.append(h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } }, flagImg(t.data, 'mini-flag'), t.data.id), dots);
      return dots;
    });
    this.reticle = h('div', {
      style: {
        position: 'absolute',
        width: '34px',
        height: '34px',
        margin: '-17px 0 0 -17px',
        borderRadius: '50%',
        border: '3px solid #ffd84a',
        boxShadow: '0 0 12px rgba(255,216,74,0.8), inset 0 0 8px rgba(255,216,74,0.6)',
        pointerEvents: 'none',
        display: 'none',
      },
    });
    this.msg = h('div.hint-bar', { style: { bottom: '64px' } });
    this.big = h('div.goal-overlay');
    this.el = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } }, this.board, this.reticle, this.msg, this.big);
    this.app.ui.append(this.el);
    this.renderBoard();
  }

  renderBoard() {
    for (let ti = 0; ti < 2; ti++) {
      const row = this.rows[ti];
      row.innerHTML = '';
      const n = Math.max(5, this.results[ti].length);
      for (let i = 0; i < n; i++) {
        const r = this.results[ti][i];
        row.append(h(`i${r === true ? '.ok' : r === false ? '.ng' : ''}`));
      }
    }
  }

  get kickTeam() {
    return this.m.teams[this.turn];
  }

  get keepTeam() {
    return this.m.teams[1 - this.turn];
  }

  setupKick() {
    const kt = this.kickTeam;
    const outfield = kt.players.filter((p) => !p.isGK).sort((a, b) => b.attrs.shooting - a.attrs.shooting);
    this.kicker = outfield[this.kickIndex[this.turn] % outfield.length];
    this.kickIndex[this.turn]++;
    this.gk = this.keepTeam.players[0];
    this.ball.place(SPOT, 0);
    this.ball.inGoal = 0;
    this.state = 'setup';
    this.t = 0;
    this.saved = false;
    this.diveSide = 0;
    this.gkPlan = null;
    this.userKick = this.kickTeam.isUser;
    this.userKeep = this.keepTeam.isUser;
    this.aim = { x: 0, y: 0.45 };
    this.big.innerHTML = '';
    this.msg.innerHTML = this.userKick ? 'スティックで狙い → <b>シュート</b>長押しで強さ、離して蹴る' : this.userKeep ? 'スティックで飛ぶ方向を選ぶ（蹴る瞬間に反応）' : '';
    this.msg.style.display = this.msg.innerHTML ? '' : 'none';
    this.app.controls?.setMode(this.userKick ? 'penalty' : this.userKeep ? 'keeper' : 'defend');
  }

  onButton(name, down, hold) {
    if (this.state !== 'aim' || !this.userKick) {
      if (this.userKeep && name === 'shoot' && down && this.state === 'runup') this.commitDive();
      return;
    }
    if (name !== 'shoot' || down) return;
    const power = clamp(0.3 + hold / 0.85, 0.3, 1);
    this.startRunup(this.aim.x * (PITCH.goalHalfW + 0.2), 0.15 + this.aim.y * 2.3, power);
  }

  startRunup(tz, ty, power) {
    this.shot = { tz, ty, power };
    this.state = 'runup';
    this.t = 0;
    this.reticle.style.display = 'none';
  }

  commitDive() {
    if (this.diveSide) return;
    const st = this.app.controls?.state;
    const x = st && st.mag > 0.3 ? st.x : 0;
    this.diveSide = Math.abs(x) < 0.3 ? 2 : Math.sign(x); // 2 = 中央に残る
  }

  update(dt) {
    this.t += dt;
    const m = this.m;
    const ctrl = this.app.controls;
    if (ctrl && this.userKick && this.state === 'aim') {
      const st = ctrl.state;
      // 画面右 = ゴールに向かって右（カメラはゴールを向いている: +x方向、右は+z）
      this.aim.x = clamp(this.aim.x + st.x * st.mag * dt * 1.6, -1.05, 1.05);
      this.aim.y = clamp(this.aim.y + st.y * st.mag * dt * 1.2, 0, 1.05);
    }
    switch (this.state) {
      case 'setup':
        if (this.t > 1.4) {
          this.state = this.userKick ? 'aim' : 'runup';
          this.t = 0;
          if (!this.userKick) {
            const side = this.rng() < 0.5 ? -1 : 1;
            const tz = this.rng() < 0.12 ? (this.rng() - 0.5) * 1.2 : side * (1.4 + this.rng() * 1.9);
            this.shot = { tz, ty: 0.25 + this.rng() * 1.7, power: 0.55 + this.rng() * 0.35 };
            this.t = -0.6;
          } else this.reticle.style.display = '';
        }
        break;
      case 'runup':
        if (this.t >= 0.75) this.strike();
        break;
      case 'flight':
        this.updateFlight(dt);
        break;
      case 'result':
        if (this.t > 2.2) this.next();
        break;
      default:
        break;
    }
    this.render(dt);
  }

  strike() {
    const k = this.kicker;
    const s = this.shot;
    const skill = k.attrs.shooting / 100;
    const sigma = 0.15 + (1 - skill) * 0.6 + s.power * s.power * 0.45;
    const tz = s.tz + this.rng.gauss() * sigma * 0.6;
    const ty = clamp(s.ty + this.rng.gauss() * sigma * 0.45 + s.power * 0.2, 0.12, 4);
    const sol = solveShot(SPOT, BALL_R, 0, GX, ty, tz, 17 + s.power * 12, 0);
    const b = this.ball;
    b.vx = sol.vx;
    b.vy = sol.vy;
    b.vz = sol.vz;
    this.target = { tz, ty };
    this.state = 'flight';
    this.t = 0;
    this.app.audio.kick(s.power);
    // GKの反応
    const gk = this.gk;
    let side;
    if (this.userKeep) {
      if (!this.diveSide) this.commitDive();
      side = this.diveSide === 2 ? 0 : this.diveSide;
    } else {
      const r = this.rng();
      side = r < 0.12 ? 0 : r < 0.56 ? -1 : 1;
    }
    this.diveDir = side; // +1 = +z方向
    const correct = (side === 0 && Math.abs(tz) < 0.9) || (side !== 0 && Math.sign(tz) === side && Math.abs(tz) > 0.5);
    const reachable = Math.abs(tz) < 3.0 && ty < 2.1;
    const skillGK = gk.attrs.gk / 100;
    const onTarget = Math.abs(tz) < PITCH.goalHalfW && ty < PITCH.goalH;
    this.saved = onTarget && correct && reachable && this.rng() < 0.42 + skillGK * 0.3 - s.power * 0.15;
    this.diveT = 0;
  }

  updateFlight(dt) {
    const b = this.ball;
    b.step(dt);
    this.diveT += dt;
    for (const e of b.events) {
      if (e.type === 'net') {
        this.world.goals.hitNet(1, new THREE.Vector3(e.x, e.y, e.z), clamp(e.v / 18, 0.3, 1.2), this.world.time);
        this.app.audio.net();
      }
      if (e.type === 'post' || e.type === 'bar') this.app.audio.post();
    }
    b.events.length = 0;
    // セーブ: GKの位置を通過する時に弾く
    if (this.saved && b.x > GX - 0.9 && !this.parried) {
      this.parried = true;
      b.vx = -Math.abs(b.vx) * 0.25;
      b.vz = (this.diveDir || 1) * 3;
      b.vy = 3;
      this.app.audio.thud(0.5);
      this.finish('save');
      return;
    }
    if (b.inGoal) {
      this.finish('goal');
      return;
    }
    if (b.x > GX + 0.5 || this.t > 2.2 || (b.x > GX - 2 && Math.abs(b.z) > PITCH.goalHalfW + 1.5)) this.finish('miss');
  }

  finish(kind) {
    if (this.state === 'result') return;
    this.state = 'result';
    this.t = 0;
    const ok = kind === 'goal';
    this.results[this.turn].push(ok);
    this.renderBoard();
    const txt = ok ? 'GOAL!' : kind === 'save' ? 'SAVED!' : 'MISS!';
    this.big.innerHTML = '';
    this.big.append(h('div.goal-text', { style: { fontSize: 'clamp(50px, 11vw, 120px)' } }, txt));
    this.msg.style.display = 'none';
    if (ok) this.app.audio.roar(0.9, 3);
    else this.app.audio.groan();
    haptic(ok ? 60 : 30);
    this.parried = false;
  }

  /** 決着判定 */
  decided() {
    const [ra, rb] = this.results;
    const ga = ra.filter(Boolean).length;
    const gb = rb.filter(Boolean).length;
    const na = ra.length;
    const nb = rb.length;
    if (na <= 5 && nb <= 5) {
      const remA = 5 - na;
      const remB = 5 - nb;
      if (ga + remA < gb || gb + remB < ga) return true;
      if (na === 5 && nb === 5 && ga !== gb) return true;
      return false;
    }
    return na === nb && ga !== gb;
  }

  next() {
    if (this.decided()) {
      const ga = this.results[0].filter(Boolean).length;
      const gb = this.results[1].filter(Boolean).length;
      this.app.audio.whistle('end');
      this.onDone({ h: ga, a: gb });
      return;
    }
    this.turn = 1 - this.turn;
    this.setupKick();
  }

  render(dt) {
    const w = this.world;
    const H = w.humans;
    const m = this.m;
    // 全員: センターサークル付近に並ぶ
    m.teams.forEach((t, ti) => {
      t.players.forEach((p, i) => {
        const idx = ti * 11 + i;
        const tr = H.transforms[idx];
        const pose = this.pose;
        if (p === this.kicker) {
          let x = SPOT - 2.2;
          let z = -0.8;
          if (this.state === 'runup') {
            const k = clamp(this.t / 0.75, 0, 1);
            x = lerp(SPOT - 2.2, SPOT - 0.55, k);
            z = lerp(-0.8, -0.25, k);
            if (this.t >= 0) A.locomotion(pose, 4.5, (this.t * 1.6) % 1, w.time);
            else A.locomotion(pose, 0, 0, w.time);
          } else if (this.state === 'flight' || (this.state === 'result' && this.t < 0.6)) {
            x = SPOT - 0.55;
            z = -0.25;
            A.kick(pose, clamp(0.5 + (this.state === 'flight' ? this.t : 0.6) * 1.2, 0, 1), 1, 'shot');
          } else if (this.state === 'result' && this.results[this.turn].at(-1)) {
            A.celebrate(pose, 2, clamp(this.t / 2, 0, 1), 0, 0, w.time);
            x = SPOT - 0.55;
            z = -0.25;
          } else if (this.state === 'result') {
            A.dejected(pose, w.time, idx);
            x = SPOT - 0.55;
            z = -0.25;
          } else A.locomotion(pose, 0, 0, w.time, { seed: idx });
          tr.x = x;
          tr.z = z;
          tr.yaw = Math.PI / 2 - Math.atan2(0.25, 1);
        } else if (p === this.gk) {
          tr.x = GX - 0.3;
          tr.z = 0;
          tr.yaw = -Math.PI / 2;
          if ((this.state === 'flight' || this.state === 'result') && this.diveDir) {
            const tt = clamp(this.diveT / 1.4, 0, 1);
            // GKは -x を向いているので、+z は GK から見て右 → dive(dir=-1)
            A.dive(pose, tt, -this.diveDir, clamp((this.target.ty - 0.3) / 1.8, 0, 1));
            tr.z = this.diveDir * Math.min(1, this.diveT * 3) * 0.9;
          } else if (this.state === 'result' && !this.diveDir) {
            A.keeperReady(pose, w.time, 1, idx);
          } else {
            A.keeperReady(pose, w.time, 1, idx);
            if (this.userKeep && this.app.controls) {
              const st = this.app.controls.state;
              tr.z = st.mag > 0.3 ? st.x * 0.4 : 0;
            }
          }
        } else {
          // センターサークルで待機（肩を組んで並ぶ）
          const k = t.players.filter((q) => q !== this.kicker && q !== this.gk && (q.team === t)).indexOf(p);
          tr.x = 4 + (ti === 0 ? -1 : 1) * 0.6 * 0;
          tr.x = -3 + k * 0.0 + (ti === 0 ? 0 : 2.2);
          tr.z = -6 + k * 1.2;
          tr.yaw = Math.PI / 2;
          if (p.isGK && t === this.kickTeam) {
            tr.x = 2;
            tr.z = 8;
          }
          A.locomotion(pose, 0, 0, w.time, { seed: idx });
          pose.lShAbd = 0.6;
          pose.rShAbd = 0.6;
        }
        tr.y = 0;
        tr.visible = true;
        const target = H.poses[idx];
        const kk = 1 - Math.exp(-dt * 18);
        for (const key of POSE_KEYS) target[key] += (pose[key] - target[key]) * kk;
        target.groundLock = pose.groundLock;
      });
    });
    // 審判
    for (let k = 0; k < 3; k++) {
      const idx = 22 + k;
      const tr = H.transforms[idx];
      tr.x = k === 0 ? SPOT - 4 : k === 1 ? GX : -20;
      tr.z = k === 0 ? 6 : k === 1 ? -PITCH.goalHalfW - 3 : PITCH.HW + 1.2;
      tr.yaw = k === 0 ? -0.6 : 0;
      A.locomotion(this.pose, 0, 0, w.time, { seed: idx });
      const target = H.poses[idx];
      for (const key of POSE_KEYS) target[key] = this.pose[key];
    }
    H.update();
    const b = this.ball;
    w.ball.update({ x: b.x, y: b.y, z: b.z }, { x: b.vx, y: b.vy, z: b.vz }, dt, w.camera);
    w.markers.update(dt, { user: null, receiver: null, aim: null });
    for (const f of w.flags) f.visible = false;
    // カメラ
    const cam = w.camera;
    const pos = new THREE.Vector3(SPOT - 6.0, 2.3, 0.5);
    const look = new THREE.Vector3(GX, 1.0, 0);
    if (this.state === 'result' && this.t > 0.4) {
      pos.set(GX - 4, 2.2, 7);
      look.set(GX - 1, 1, 0);
    }
    this.camPos.lerp(pos, 1 - Math.exp(-dt * (this.state === 'setup' ? 6 : 3)));
    this.camLook.lerp(look, 1 - Math.exp(-dt * 6));
    if (!this.camInit) {
      this.camInit = true;
      this.camPos.copy(pos);
      this.camLook.copy(look);
    }
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    cam.fov = 36;
    cam.updateProjectionMatrix();
    w.stadium.setBroadcastView(false);
    // 照準をスクリーン座標へ
    if (this.reticle.style.display !== 'none') {
      const v = new THREE.Vector3(GX, 0.15 + this.aim.y * 2.3, this.aim.x * (PITCH.goalHalfW + 0.2)).project(cam);
      this.reticle.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      this.reticle.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
    }
    w.crowd.setExcitement(0.3, 0.6, 0.6);
    w.update(dt);
  }

  destroy() {
    this.el.remove();
  }
}
