// セッション進行: フリー走行 / タイムアタック / 予選 / 決勝
// 車両とAIの更新、計時(ラップ・セクター)、順位、スタート手順、ピット、天候、ゴーストを扱う。
import { createCar, stepCar, placeCar, collideCars, fitTyres, applySetup, requestShift, CAR, SETUPS, TYRES } from './physics.js';
import { Driver, rand, seedRand } from './ai.js';
import { SECTOR_SPLITS } from './track.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// 架空のチームとドライバー (実在の名称は使用しない)
export const TEAMS = [
  { id: 'ok', name: 'OK RACING', c1: '#f47a1f', c2: '#14254f', c3: '#ffffff', power: 1.0, grip: 1.0 },
  { id: 'vlk', name: 'ヴォルカ GP', c1: '#d21f2b', c2: '#1b1b1b', c3: '#ffd23a', power: 1.0, grip: 0.998 },
  { id: 'ast', name: 'アストラ', c1: '#f4f4f0', c2: '#0f6b4a', c3: '#0f6b4a', power: 0.995, grip: 1.0 },
  { id: 'nrd', name: 'ノルド・モータース', c1: '#1c4fb8', c2: '#f5d400', c3: '#ffffff', power: 0.99, grip: 0.995 },
  { id: 'slv', name: 'シルバーアロー技研', c1: '#b9c0c8', c2: '#101418', c3: '#00b4c8', power: 0.985, grip: 0.992 },
  { id: 'mrg', name: 'ミラージュ', c1: '#18a6a0', c2: '#f2f2f2', c3: '#0d3a4a', power: 0.975, grip: 0.99 },
  { id: 'tgr', name: 'ティグレ', c1: '#f0c21a', c2: '#17361f', c3: '#17361f', power: 0.97, grip: 0.985 },
  { id: 'brs', name: 'ボレアス', c1: '#6a2aa6', c2: '#f0f0f0', c3: '#ff5aa0', power: 0.965, grip: 0.98 },
  { id: 'kmk', name: 'カミカワ', c1: '#101010', c2: '#c9a24a', c3: '#c9a24a', power: 0.955, grip: 0.978 },
  { id: 'rss', name: 'ロッソ・ピッコロ', c1: '#8c1d2f', c2: '#f3e9d2', c3: '#2b2b2b', power: 0.95, grip: 0.972 },
];
export const DRIVERS = [
  { no: 1, name: 'YOU', short: 'YOU', team: 0, skill: 1, aggr: 0.5, player: true },
  { no: 2, name: '岡 健一', short: 'OKA', team: 0, skill: 0.80, aggr: 0.5 },
  { no: 5, name: 'A. ヴェルナー', short: 'VER', team: 1, skill: 1.0, aggr: 0.8 },
  { no: 6, name: 'L. モレッティ', short: 'MOR', team: 1, skill: 0.88, aggr: 0.6 },
  { no: 7, name: 'J. ハートレイ', short: 'HAR', team: 2, skill: 0.97, aggr: 0.5 },
  { no: 8, name: '高見 涼', short: 'TAK', team: 2, skill: 0.84, aggr: 0.7 },
  { no: 11, name: 'N. リンドグレン', short: 'LIN', team: 3, skill: 0.92, aggr: 0.4 },
  { no: 12, name: 'P. ドゥラン', short: 'DUR', team: 3, skill: 0.78, aggr: 0.6 },
  { no: 15, name: 'M. シュタイナー', short: 'STE', team: 4, skill: 0.86, aggr: 0.7 },
  { no: 16, name: '水野 駿', short: 'MIZ', team: 4, skill: 0.74, aggr: 0.5 },
  { no: 19, name: 'R. カルヴァーリョ', short: 'CAR', team: 5, skill: 0.82, aggr: 0.9 },
  { no: 20, name: 'T. ベケット', short: 'BEC', team: 5, skill: 0.68, aggr: 0.4 },
  { no: 23, name: 'E. サントーロ', short: 'SAN', team: 6, skill: 0.76, aggr: 0.6 },
  { no: 24, name: '氷室 丈', short: 'HIM', team: 6, skill: 0.64, aggr: 0.5 },
  { no: 27, name: 'D. オブライエン', short: 'OBR', team: 7, skill: 0.72, aggr: 0.7 },
  { no: 28, name: 'K. ヤンセン', short: 'JAN', team: 7, skill: 0.58, aggr: 0.5 },
  { no: 31, name: '神川 透', short: 'KAM', team: 8, skill: 0.66, aggr: 0.6 },
  { no: 32, name: 'F. マルシャン', short: 'MAR', team: 8, skill: 0.52, aggr: 0.4 },
  { no: 35, name: 'G. ロッシーニ', short: 'ROS', team: 9, skill: 0.60, aggr: 0.8 },
  { no: 36, name: 'S. パーマー', short: 'PAL', team: 9, skill: 0.45, aggr: 0.5 },
];

export const DIFFICULTY = {
  easy: { name: 'やさしい', skill: -0.30, grip: 0.955, power: 0.975 },
  normal: { name: 'ふつう', skill: -0.12, grip: 0.98, power: 0.99 },
  hard: { name: 'むずかしい', skill: 0, grip: 1.0, power: 1.0 },
};
export const WEATHERS = {
  dry: { name: '晴れ', wet: 0, rain: 0 },
  damp: { name: '曇り (ハーフウェット)', wet: 0.38, rain: 0.02 },
  wet: { name: '雨', wet: 0.9, rain: 0.75 },
  change: { name: '変わりやすい', wet: 0, rain: 0 },
};

// AI の予選タイムの目安 [s] (実走AIの計測値から作った近似式)
export function estimateQualiTime(d, team, diff, wet) {
  const D = DIFFICULTY[diff] || DIFFICULTY.normal;
  const skill = clamp(d.skill + D.skill, 0, 1);
  let t = 102.7 + (1 - skill) * 7.0 + (1 - team.power * D.power) * 20 + (1 - team.grip * D.grip) * 42;
  if (wet > 0.05) t *= 1 + 0.27 * Math.pow(sat(wet), 0.7);
  return t;
}

export function fmtTime(t, showMin = true) {
  if (t == null || !isFinite(t)) return '-:--.---';
  const neg = t < 0; t = Math.abs(t);
  const m = Math.floor(t / 60), s = t - m * 60;
  const ss = s.toFixed(3).padStart(6, '0');
  return (neg ? '-' : '') + (showMin || m ? `${m}:${ss}` : s.toFixed(3));
}

const GHOST_DT = 0.1;
const _p = { x: 0, y: 0, h: 0, d: 0 };

export class Session {
  // opts: { mode, laps, weather, setup, tyre, difficulty, damage, assist, autoShift, grid:[driverIndex...], qualiLaps, ghost, bestTrace }
  constructor(T, line, opts) {
    this.T = T; this.line = line; this.opts = opts;
    this.mode = opts.mode;
    this.laps = opts.mode === 'race' ? opts.laps : (opts.mode === 'quali' ? (opts.qualiLaps || 3) : 0);
    this.time = 0; this.raceTime = 0; this.state = 'pre'; this.stateT = 0;
    this.events = [];
    this.lights = 0; this.lightsOut = false; this.goDelay = 0;
    this.finishedCount = 0; this.leaderFinished = false;
    this.env = { track: T, wet: 0, ambient: 24, noDamage: !opts.damage, noWear: false, noFuel: false };
    seedRand((Math.random() * 1e9) | 0);
    // 天候
    const W = WEATHERS[opts.weather] || WEATHERS.dry;
    this.wet = W.wet; this.rain = W.rain; this.rainTarget = W.rain; this.weatherPlan = null;
    if (opts.weather === 'change') {
      const startWet = rand() < 0.4;
      this.wet = startWet ? 0.8 : 0; this.rain = this.rainTarget = startWet ? 0.7 : 0;
      const dur = opts.mode === 'race' ? opts.laps * 108 : 600;
      this.weatherPlan = [{ t: dur * (0.2 + rand() * 0.3), rain: startWet ? 0 : 0.5 + rand() * 0.5 }];
      if (dur > 900) this.weatherPlan.push({ t: dur * (0.65 + rand() * 0.2), rain: startWet ? 0.6 : 0 });
    }
    this.env.wet = this.wet; this.env.ambient = this.wet > 0.3 ? 18 : 24;

    // エントリー
    const diff = DIFFICULTY[opts.difficulty] || DIFFICULTY.normal;
    this.entries = [];
    const order = opts.mode === 'race' ? (opts.grid || DRIVERS.map((_, i) => i)) : [0];
    order.forEach((di, slot) => {
      const d = DRIVERS[di], team = TEAMS[d.team];
      const isPlayer = !!d.player;
      const car = createCar({
        id: di, setup: isPlayer ? opts.setup : 'mid', tyre: 'medium',
        power: isPlayer ? 1 : team.power * diff.power, gripK: isPlayer ? 1 : team.grip * diff.grip,
      });
      const e = {
        di, d, team, car, isPlayer, ai: null, slot,
        dist: 0, lap: 0, lapStart: 0, lastLap: null, bestLap: null, lapValid: true, lapTimes: [],
        sector: 0, secStart: 0, curSec: [null, null, null], bestSec: [null, null, null], lastSec: [null, null, null],
        totalTime: 0, finished: false, finishTime: null, pos: slot + 1, gap: 0,
        pit: null, pitRequest: false, nextTyre: 'medium', pitStops: 0,
        retired: false, out: false, stuckT: 0, wrongT: 0, penalty: 0, jump: false,
        topSpeed: 0, startTyre: 'medium', blue: false, prevS: 0, started: false,
      };
      if (isPlayer) {
        car.assistTC = car.assistABS = !!opts.assist; car.autoShift = !!opts.autoShift;
        fitTyres(car, opts.tyre); e.nextTyre = opts.tyre;
      } else {
        const sk = clamp(d.skill + diff.skill, 0, 1);
        // AI のタイヤ選択
        let ty = 'medium';
        if (this.wet > 0.42) ty = 'rain';
        else if (opts.laps <= 6) ty = 'soft';
        else if (opts.laps >= 30) ty = rand() < 0.6 ? 'hard' : 'medium';
        else if (opts.laps <= 12) ty = rand() < 0.5 ? 'soft' : 'medium';
        fitTyres(car, ty); e.nextTyre = ty;
        e.ai = new Driver(car, T, line, { skill: sk, aggr: d.aggr });
      }
      e.startTyre = car.tyre.id;
      this.entries.push(e);
    });
    this.player = this.entries.find(e => e.isPlayer);
    this.cars = this.entries.map(e => e.car);
    this.entries.forEach(e => { e.car.entry = e; });

    // 燃料
    for (const e of this.entries) {
      if (this.mode === 'race') e.car.fuel = opts.laps * CAR.fuelPerLap * 1.04 + 4;
      else if (this.mode === 'free') e.car.fuel = 40;
      else e.car.fuel = 12;
    }
    if (this.mode !== 'race') { this.env.noFuel = this.mode !== 'free'; }

    // 初期配置
    if (this.mode === 'race') {
      this.entries.forEach((e, k) => {
        const s = T.length - 9 - k * 8, d = (k % 2 === 0 ? 1 : -1) * 3.3;
        placeCar(e.car, T, s, d, 0);
        e.dist = -(9 + k * 8); e.prevS = e.car.s;
        if (e.ai) e.ai.refresh(this.wet);
      });
      this.state = 'grid'; this.stateT = 0;
    } else {
      const e = this.player;
      const s0 = T.length - 470;
      placeCar(e.car, T, s0, line.off[T.idx(s0)], 46);
      e.dist = -470; e.prevS = e.car.s;
      this.state = 'countdown'; this.stateT = 0;
    }
    // ゴースト
    this.ghost = opts.ghost || null;      // { dt, lap, x:[], y:[], h:[] }
    this.ghostRec = null; this.ghostPose = null; this.newGhost = null;
    this.bestTrace = opts.bestTrace || null; // 10mごとの通過時刻
    this.traceRec = null; this.delta = null;
    this.playerInput = { throttle: 0, brake: 0, steer: 0 };
    this.sessionBest = null; // { time, entry }
    this.message = null; this.resultsReady = false;
    this.qualiResult = null;
    this.acc = 0;
    this.sortPositions();
  }

  emit(type, data) { this.events.push({ type, ...data }); }

  get wetness() { return this.wet; }

  // ---------- メイン更新 (dt は可変。内部は 1/60 固定ステップ) ----------
  update(dt) {
    this.acc += Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= 1 / 60 && n < 5) { this.tick(1 / 60); this.acc -= 1 / 60; n++; }
    if (n === 5) this.acc = 0;
  }

  tick(dt) {
    const T = this.T;
    this.time += dt; this.stateT += dt;
    // --- 状態遷移 ---
    if (this.state === 'countdown') {
      if (this.stateT >= 3) { this.state = 'green'; this.stateT = 0; this.emit('go', {}); }
    } else if (this.state === 'grid') {
      if (this.stateT >= 2.5) { this.state = 'lights'; this.stateT = 0; this.lights = 0; this.goDelay = 0.6 + rand() * 1.8; }
    } else if (this.state === 'lights') {
      const n = Math.min(5, Math.floor(this.stateT / 0.85) + 1);
      if (n !== this.lights) { this.lights = n; this.emit('light', { n }); }
      if (this.stateT >= 5 * 0.85 + this.goDelay) { this.state = 'green'; this.stateT = 0; this.lights = 0; this.lightsOut = true; this.emit('go', {}); }
    }
    const racing = this.state === 'green' || this.state === 'finished';
    if (this.state === 'green') this.raceTime += dt;

    // --- 天候 ---
    if (this.weatherPlan && this.state === 'green') {
      for (const w of this.weatherPlan) if (!w.done && this.raceTime >= w.t) { w.done = true; this.rainTarget = w.rain; this.emit('weather', { rain: w.rain }); }
    }
    this.rain += clamp(this.rainTarget - this.rain, -dt * 0.03, dt * 0.03);
    this.wet = sat(this.wet + (this.rain * 0.016 - (1 - this.rain) * (this.rain > 0.05 ? 0.001 : 0.0032)) * dt);
    this.env.wet = this.wet;

    // --- 入力とAI ---
    const pl = this.player, pc = pl.car;
    const frozen = this.state === 'countdown';
    for (const e of this.entries) {
      const c = e.car;
      if (e.out) continue;
      if (e.pit) { this.updatePit(e, dt); continue; }
      if (e.isPlayer && !e.finished) {
        const inp = this.playerInput;
        c.throttle = inp.throttle; c.brake = inp.brake; c.steerIn = inp.steer;
        if (this.state === 'grid' || this.state === 'lights') {
          // フライング判定 (動き出したら)
          if (c.speed > 1.2 && !e.jump) { e.jump = true; e.penalty += 10; this.emit('penalty', { text: 'フライング +10秒' }); }
        }
      } else if (e.ai || e.finished) {
        if (!e.ai) { // ゴール後のプレイヤーは自動で流す
          e.ai = new Driver(c, T, this.line, { skill: 0.3 }); e.cool = true;
        }
        if (!racing) { c.throttle = 0; c.brake = 1; c.steerIn = 0; }
        else if (this.state === 'green' && this.stateT < e.ai.reaction && !e.started) { c.throttle = 0; c.brake = 1; }
        else {
          e.started = true;
          const info = { blue: e.blue, vmax: e.finished ? 45 : (e.retired ? 0.01 : undefined) };
          e.ai.update(dt, this.wet, this.cars, info);
          if (e.finished) { c.throttle = Math.min(c.throttle, 0.5); }
        }
      }
      if (e.retired && !e.pit) { c.throttle = 0; c.brake = e.car.speed > 8 ? 0.5 : 1; }
    }
    // スリップストリーム
    this.updateDraft();

    // --- 物理 (240Hz) ---
    const SUB = 4, h = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      for (const e of this.entries) {
        if (e.out || e.pit) continue;
        if (frozen) continue;
        const c = e.car;
        stepCar(c, h, this.env);
        if (c.hit > 2.5) this.emit('crash', { e, v: c.hit });
      }
      // 車同士の衝突
      const es = this.entries;
      for (let i = 0; i < es.length; i++) {
        const A = es[i]; if (A.out || A.pit) continue;
        for (let j = i + 1; j < es.length; j++) {
          const B = es[j]; if (B.out || B.pit) continue;
          const dx = A.car.x - B.car.x; if (dx > 6 || dx < -6) continue;
          const dy = A.car.y - B.car.y; if (dy > 6 || dy < -6) continue;
          if (Math.abs(T.sDiff(A.car.s, B.car.s)) > 12) continue; // 立体交差の上下
          const imp = collideCars(A.car, B.car, this.env.noDamage);
          if (imp > 1.5 && (A.isPlayer || B.isPlayer)) this.emit('contact', { v: imp });
        }
      }
    }
    if (frozen) { // カウントダウン中は惰性で進めず静止表示
      return this.afterStep(dt);
    }
    // --- 計時 ---
    for (const e of this.entries) {
      if (e.out) continue;
      this.updateTiming(e, dt);
    }
    this.afterStep(dt);
  }

  afterStep(dt) {
    const T = this.T, pl = this.player;
    // リタイア・スタック処理
    for (const e of this.entries) {
      const c = e.car;
      if (e.out) continue;
      if (c.retired && !e.retired) { e.retired = true; e.retireT = 0; this.emit('retire', { e }); }
      if (e.retired) {
        e.retireT += dt;
        if (!e.isPlayer && e.retireT > 6 && c.speed < 3) e.out = true; // マーシャルが撤去
        continue;
      }
      if (e.ai && !e.pit && this.state === 'green' && e.started) {
        const wrong = Math.abs(c.relH) > 1.9;
        if ((c.speed < 3 && c.offCount >= 2) || wrong || (c.speed < 1.5 && this.stateT > 5)) e.stuckT += dt; else e.stuckT = Math.max(0, e.stuckT - dt * 2);
        if (e.stuckT > 3.5) { this.resetToTrack(e); e.stuckT = 0; }
      }
      c.entry = e;
      if (c.speed * 3.6 > e.topSpeed) e.topSpeed = c.speed * 3.6;
    }
    // AI のピット判断
    if (this.mode === 'race' && this.state === 'green') {
      for (const e of this.entries) {
        if (!e.ai || e.cool || e.out || e.pit || e.finished || e.retired) continue;
        const c = e.car, left = this.laps - e.lap;
        const worn = Math.max(c.wearF, c.wearR);
        let want = false, ty = e.nextTyre;
        const slick = c.tyre.id !== 'rain';
        if (slick && this.wet > 0.5) { want = true; ty = 'rain'; }
        else if (!slick && this.wet < 0.22 && this.rain < 0.2) { want = left > 1; ty = left > 22 ? 'hard' : left > 9 ? 'medium' : 'soft'; }
        else if (worn > 0.7 && left > 2) { want = true; ty = this.wet > 0.42 ? 'rain' : (left > 24 ? 'hard' : left > 10 ? 'medium' : 'soft'); }
        else if ((c.dmgF > 0.35 || c.dmgR > 0.45) && left > 2) { want = true; ty = this.wet > 0.42 ? 'rain' : (worn > 0.35 ? (left > 12 ? 'medium' : 'soft') : c.tyre.id); }
        e.pitRequest = want; if (want) e.nextTyre = ty;
      }
    }
    // ピット入口判定
    const P = T.pit;
    for (const e of this.entries) {
      if (e.out || e.pit || !e.pitRequest || e.retired) continue;
      const c = e.car;
      const ds = T.sDiff(c.s, P.sEntry);
      if (ds >= 0 && ds < 14 && c.d > -2.5 && c.vx > 3 && c.speed < 75) this.enterPit(e);
    }
    this.sortPositions();
    // 周回遅れへの青旗
    if (this.mode === 'race') {
      for (const e of this.entries) {
        e.blue = false;
        if (!e.ai || e.out) continue;
        for (const o of this.entries) {
          if (o === e || o.out || o.pit) continue;
          const lapDiff = o.dist - e.dist;
          if (lapDiff > T.length * 0.6) {
            const gap = T.sDiff(e.car.s, o.car.s);
            if (gap > 0 && gap < 28) { e.blue = true; break; }
          }
        }
      }
    }
    // ゴースト再生/記録
    this.updateGhost(dt);
    // 終了判定
    if (!this.resultsReady) {
      if (this.mode === 'race') {
        if ((pl.finished && this.time - pl.finishWall > 4) || (pl.retired && pl.retireT > 3.5)) this.finishSession();
      } else if (this.mode === 'quali') {
        if (pl.lap > this.laps || (pl.retired && pl.retireT > 3)) this.finishSession();
      } else if (pl.retired && pl.retireT > 2.5) {
        // フリー/タイムアタックは自動で復帰
        this.repairAndReset(pl);
      }
    }
  }

  updateDraft() {
    const es = this.entries;
    for (const e of es) e.car.draft = 0;
    if (es.length < 2) return;
    for (const A of es) {
      if (A.out || A.pit) continue;
      const a = A.car; if (a.vx < 28) continue;
      const ca = Math.cos(a.yaw), sa = Math.sin(a.yaw);
      let best = 0;
      for (const B of es) {
        if (B === A || B.out || B.pit) continue;
        const b = B.car;
        const dx = b.x - a.x, dy = b.y - a.y;
        const fwd = dx * ca + dy * sa; if (fwd < 3 || fwd > 55) continue;
        const lat = Math.abs(-dx * sa + dy * ca); if (lat > 1.9) continue;
        if (Math.abs(this.T.sDiff(a.s, b.s)) > 70) continue;
        const f = (1 - fwd / 55) * (1 - lat / 1.9) * sat(b.vx / 40);
        if (f > best) best = f;
      }
      a.draft = best;
    }
  }

  // ---------- 計時 ----------
  updateTiming(e, dt) {
    const T = this.T, c = e.car, L = T.length;
    const s = e.pit ? e.pit.s % L : c.s;
    const dsg = T.sDiff(s, e.prevS);
    const before = e.dist;
    e.dist += dsg; e.prevS = s;
    if (this.state !== 'green' && this.state !== 'finished') return;
    const now = this.mode === 'race' ? this.raceTime : this.time;
    if (e.finished) return;
    // セクター通過
    const lapPos = ((e.dist % L) + L) % L, lapPosB = ((before % L) + L) % L;
    if (e.lap >= 1 && dsg > 0) {
      for (let k = 0; k < 2; k++) {
        const sp = SECTOR_SPLITS[k];
        if (lapPosB < sp && lapPos >= sp && e.sector === k) {
          const tc = now - dt * (lapPos - sp) / Math.max(dsg, 1e-6);
          this.closeSector(e, k, tc);
        }
      }
    }
    // コントロールライン通過
    const lapsB = Math.floor(before / L), lapsA = Math.floor(e.dist / L);
    if (lapsA > lapsB && e.dist >= 0 && lapsA + 1 > e.lap) {
      const over = e.dist - lapsA * L;
      const tc = now - dt * over / Math.max(dsg, 1e-6);
      if (e.lap >= 1) {
        this.closeSector(e, 2, tc);
        const lt = tc - e.lapStart;
        e.lastLap = lt; e.lastValid = e.lapValid;
        e.lapTimes.push({ t: lt, valid: e.lapValid, tyre: c.tyre.id });
        let pb = false, sb = false;
        if (e.lapValid) {
          if (e.bestLap == null || lt < e.bestLap) { e.bestLap = lt; pb = true; }
          if (!this.sessionBest || lt < this.sessionBest.time) { this.sessionBest = { time: lt, e }; sb = true; }
        }
        if (e.isPlayer) {
          this.emit('lap', { e, time: lt, valid: e.lapValid, pb, sb, lap: e.lap });
          this.finishGhostLap(lt, e.lapValid && pb);
        } else if (sb && this.mode === 'race') this.emit('fastest', { e, time: lt });
      } else if (this.mode === 'race') {
        // 決勝の1周目はスタートから計測
      }
      e.lap = lapsA + 1; // 現在走行中のラップ番号
      e.lapStart = (this.mode === 'race' && lapsA === 0) ? 0 : tc;
      if (this.mode === 'race' && lapsA === 0) e.lapStart = 0;
      e.secStart = e.lapStart; e.sector = 0; e.curSec = [null, null, null]; e.lapValid = true;
      if (e.isPlayer) this.startGhostLap();
      // フィニッシュ
      if (this.mode === 'race') {
        if (lapsA >= this.laps && !this.leaderFinished) { this.leaderFinished = true; this.emit('flag', { e }); }
        if (this.leaderFinished && lapsA >= 1) {
          e.finished = true; e.finishTime = tc + e.penalty; e.finishWall = this.time; e.finishOrder = this.finishedCount++;
          e.lapsDone = lapsA;
          if (e.isPlayer) this.emit('finish', { e });
        }
      }
    }
    if (this.mode === 'race' && e.lap === 0 && e.dist >= 0) e.lap = 1;
    // トラックリミット (4輪脱輪でそのラップは無効)
    if (c.offCount === 4 && e.lapValid && e.lap >= 1 && this.mode !== 'race' && !e.pit) {
      e.lapValid = false; if (e.isPlayer) this.emit('invalid', {});
    }
    if (c.offCount === 4 && e.lap === 0 && this.mode !== 'race') e.nextInvalid = true;
  }

  closeSector(e, k, tc) {
    const st = tc - e.secStart;
    e.curSec[k] = st; e.lastSec[k] = st; e.secStart = tc; e.sector = k + 1;
    let pb = false;
    if (e.lapValid && (e.bestSec[k] == null || st < e.bestSec[k])) { pb = e.bestSec[k] != null; e.bestSec[k] = st; }
    if (e.isPlayer) this.emit('sector', { k, time: st, pb, best: e.bestSec[k], valid: e.lapValid });
  }

  // ---------- 順位 ----------
  sortPositions() {
    const arr = this._order || (this._order = this.entries.slice());
    arr.sort((a, b) => {
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      if (a.finished) return a.finishOrder - b.finishOrder;
      return b.dist - a.dist;
    });
    const lead = arr[0];
    arr.forEach((e, i) => { e.pos = i + 1; e.gap = lead.dist - e.dist; });
    this.order = arr;
  }

  // ---------- ピット ----------
  enterPit(e) {
    const T = this.T, c = e.car;
    e.pit = { state: 'in', s: c.s, v: Math.max(8, c.speed), d0: c.d, lat: 0, timer: 0, box: T.pit.boxS[e.d.team], total: 0 };
    c.inPit = true; e.pitRequest = false;
    if (e.isPlayer) this.emit('pitin', {});
  }
  updatePit(e, dt) {
    const T = this.T, P = T.pit, p = e.pit, c = e.car, L = T.length;
    const limit = 100 / 3.6;
    p.total += dt;
    const toBox = T.sDiff(p.box, p.s % L);
    let vt = limit;
    const sWrap = T.wrapS(p.s);
    const inExitRamp = T.sDiff(sWrap, P.sExitStart) > 0 && T.sDiff(sWrap, P.sExitStart) < 200;
    if (p.state === 'in') {
      vt = Math.min(limit, Math.sqrt(Math.max(0, 2 * 9 * Math.max(0, toBox - 0.15))) + 0.4);
      if (toBox < 0.25 && p.v < 1.2) {
        p.state = 'service'; p.v = 0;
        const dmg = c.dmgF + c.dmgR + c.dmgS;
        p.timer = 6.2 + rand() * 2.2 + dmg * 9;
        p.serviceTotal = p.timer;
        if (e.isPlayer) this.emit('pitstop', { time: p.timer });
      }
    } else if (p.state === 'service') {
      vt = 0; p.timer -= dt;
      if (p.timer <= 0) {
        fitTyres(c, e.nextTyre); c.dmgF = 0; c.dmgR = 0; c.dmgS *= 0.25; c.pull = 0;
        if (this.mode !== 'race') c.fuel = Math.max(c.fuel, 30);
        e.pitStops++; p.state = 'out';
        if (e.ai) e.ai.refresh(this.wet);
        if (e.isPlayer) this.emit('pitout', {});
      }
    } else {
      vt = inExitRamp ? 46 : limit;
    }
    const acc = p.v < vt ? 7.5 : -14;
    p.v = Math.max(0, Math.min(vt > p.v ? vt : 1e9, p.v + acc * dt));
    if (p.v < vt && acc < 0) p.v = vt;
    p.s += p.v * dt;
    // 姿勢
    T.pitPos(p.s, _p);
    // 入口では現在の横位置から滑らかにレーンへ
    const tIn = sat(T.sDiff(T.wrapS(p.s), P.sEntry) / 60);
    const blend = p.state === 'in' && tIn < 1 ? (1 - tIn) * (1 - tIn) : 0;
    // ボックスへの寄せ
    const near = sat(1 - Math.abs(T.sDiff(p.box, T.wrapS(p.s))) / 22);
    const latT = (p.state === 'out' && toBox < -1) ? Math.max(0, near) : near;
    p.lat = latT * latT * (3 - 2 * latT) * P.boxOffset;
    const i = T.idx(p.s);
    const dd = (p.d0 - _p.d) * blend + p.lat;
    const x = _p.x + T.nx[i] * dd, y = _p.y + T.ny[i] * dd;
    const hx = x - c.x, hy = y - c.y;
    if (hx * hx + hy * hy > 0.0004) c.yaw = Math.atan2(hy, hx);
    c.x = x; c.y = y; c.vx = p.v; c.vy = 0; c.r = 0; c.speed = p.v;
    c.s = T.wrapS(p.s); c.i = i; c.fi = c.s / T.ds; c.d = _p.d + dd;
    c.throttle = p.v < vt ? 0.4 : 0.1; c.brake = 0; c.delta = 0; c.steerIn = 0;
    c.gear = p.v < 20 ? 1 : 2; c.rpm = Math.max(3000, p.v / CAR.rw * c.ratios[c.gear] * 60 / (2 * Math.PI));
    c.offCount = 0; c.kR = 0; c.kF = 0; c.slipF = 0; c.slipR = 0; c.hit = 0; c.surf[0] = c.surf[1] = c.surf[2] = c.surf[3] = 0;
    this.updateTiming(e, dt);
    // 出口
    if (p.state === 'out' && T.sDiff(T.wrapS(p.s), P.sExit) >= 0 && T.sDiff(T.wrapS(p.s), P.sExit) < 60) {
      const v = p.v;
      placeCar(c, T, p.s, _p.d, v);
      c.inPit = false; e.pit = null; e.prevS = c.s;
      if (e.isPlayer) this.emit('pitexit', { total: p.total });
    }
  }

  // ---------- コース復帰 ----------
  resetToTrack(e) {
    const T = this.T, c = e.car;
    let s = c.s;
    // 他車と重ならない位置を探す
    for (let tries = 0; tries < 8; tries++) {
      let ok = true;
      for (const o of this.entries) { if (o === e || o.out) continue; if (Math.abs(T.sDiff(o.car.s, s)) < 10 && !o.pit) { ok = false; break; } }
      if (ok) break; s = T.wrapS(s - 12);
    }
    const before = c.s;
    placeCar(c, T, s, 0, 0);
    e.dist += T.sDiff(c.s, before); e.prevS = c.s;
    if (this.mode !== 'race') { e.lapValid = false; }
    if (e.isPlayer) this.emit('reset', {});
  }
  repairAndReset(e) {
    const c = e.car;
    c.dmgF = c.dmgR = c.dmgS = 0; c.pull = 0; c.retired = false; e.retired = false; e.retireT = 0;
    this.resetToTrack(e);
  }
  // フリー走行中のセッティング/タイヤ変更
  changeConfig(setup, tyre) {
    const c = this.player.car;
    if (setup && SETUPS[setup]) { c.setup = SETUPS[setup]; applySetup(c); this.opts.setup = setup; }
    if (tyre && TYRES[tyre]) { fitTyres(c, tyre); this.opts.tyre = tyre; this.player.nextTyre = tyre; }
    c.dmgF = c.dmgR = c.dmgS = 0; c.pull = 0;
    if (this.mode === 'free') c.fuel = 40;
  }
  setWeather(id) {
    const W = WEATHERS[id]; if (!W) return;
    this.opts.weather = id; this.weatherPlan = null;
    this.wet = W.wet; this.rain = this.rainTarget = W.rain; this.env.wet = this.wet;
  }
  shift(dir) {
    const e = this.player;
    if (e.pit || e.finished || this.state === 'countdown') return false;
    return requestShift(e.car, dir);
  }

  // ---------- ゴースト ----------
  startGhostLap() {
    if (this.mode !== 'ta' && this.mode !== 'quali' && this.mode !== 'free') return;
    this.ghostRec = { t: 0, next: 0, x: [], y: [], h: [] };
    this.traceRec = { next: 0, t: [] };
    this.ghostTime = 0;
  }
  updateGhost(dt) {
    const pl = this.player, c = pl.car;
    if (this.ghostRec && this.state === 'green') {
      const g = this.ghostRec; g.t += dt;
      while (g.t >= g.next) { g.x.push(c.x); g.y.push(c.y); g.h.push(c.yaw); g.next += GHOST_DT; }
      // 10m ごとの通過時刻
      const L = this.T.length, lapPos = ((pl.dist % L) + L) % L, tr = this.traceRec;
      while (tr.next <= lapPos && tr.t.length < 590) { tr.t.push(g.t); tr.next += 10; }
      // 現在のデルタ
      const bt = this.bestTrace;
      if (bt && pl.lap >= 1) {
        const k = lapPos / 10, k0 = Math.floor(k);
        if (k0 + 1 < bt.length) this.delta = g.t - (bt[k0] + (bt[k0 + 1] - bt[k0]) * (k - k0));
      } else this.delta = null;
      // 再生
      const gh = this.ghost;
      if (gh && this.mode === 'ta' && pl.lap >= 1) {
        const f = g.t / gh.dt, i0 = Math.floor(f);
        if (i0 + 1 < gh.x.length) {
          const t = f - i0;
          let dh = gh.h[i0 + 1] - gh.h[i0]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
          this.ghostPose = { x: gh.x[i0] + (gh.x[i0 + 1] - gh.x[i0]) * t, y: gh.y[i0] + (gh.y[i0 + 1] - gh.y[i0]) * t, h: gh.h[i0] + dh * t };
        } else this.ghostPose = null;
      } else this.ghostPose = null;
    }
  }
  finishGhostLap(lapTime, isBest) {
    const g = this.ghostRec, tr = this.traceRec;
    if (!g) return;
    if (isBest) {
      tr.t.push(lapTime);
      this.bestTrace = tr.t.slice();
      if (this.mode === 'ta') {
        this.newGhost = { dt: GHOST_DT, lap: lapTime, x: g.x, y: g.y, h: g.h, trace: this.bestTrace };
        if (!this.ghost || lapTime < this.ghost.lap) this.ghost = this.newGhost;
      }
    }
  }

  // ---------- 終了処理 ----------
  finishSession() {
    this.resultsReady = true; this.state = 'finished';
    const pl = this.player;
    if (this.mode === 'race') {
      // 未フィニッシュ車は走行距離順
      const rows = this.order.map(e => ({
        e, pos: 0, name: e.d.name, team: e.team.name, no: e.d.no, laps: e.finished ? e.lapsDone : Math.max(0, Math.floor(e.dist / this.T.length)),
        time: e.finished ? e.finishTime : null, best: e.bestLap, stops: e.pitStops, dnf: e.retired, player: e.isPlayer, penalty: e.penalty,
      }));
      // ペナルティ込みで並べ替え (完走車のみ)
      const fin = rows.filter(r => r.time != null && !r.dnf).sort((a, b) => (b.laps - a.laps) || (a.time - b.time));
      const run = rows.filter(r => r.time == null && !r.dnf), dnf = rows.filter(r => r.dnf).sort((a, b) => b.laps - a.laps);
      this.results = [...fin, ...run, ...dnf];
      this.results.forEach((r, i) => { r.pos = i + 1; });
    } else if (this.mode === 'quali') {
      const rows = DRIVERS.map((d, di) => {
        if (d.player) return { di, name: d.name, team: TEAMS[d.team].name, no: d.no, best: pl.bestLap, player: true };
        const t = estimateQualiTime(d, TEAMS[d.team], this.opts.difficulty, this.wet) + (rand() - 0.35) * 0.9;
        return { di, name: d.name, team: TEAMS[d.team].name, no: d.no, best: t, player: false };
      });
      rows.sort((a, b) => (a.best ?? 1e9) - (b.best ?? 1e9));
      rows.forEach((r, i) => { r.pos = i + 1; });
      this.results = rows;
      this.qualiResult = rows.map(r => r.di);
    }
    this.emit('results', {});
  }
}
