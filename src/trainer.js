// トレーニングモード
//  ・お手本ラップ: AI(スキル最大)が理想ラインを走った1周を事前に記録 (速度・ギヤ・ペダル・時刻・位置)
//  ・目標表示: いま走っている位置でのお手本の速度と、そこから算出した最適ギヤ
//  ・ライブ助言: ブレーキ開始点、アクセルを開ける点、ギヤ、空転/ロックなどをその場で声かけ
//  ・走行分析: 区間(またはラップ全体)を走り終えるたびに、お手本との差を数値化して講評
//  ・区間リピート: 選んだ区間の少し手前からお手本と同じ速度で再スタートし、何度でも挑戦できる
import { createCar, stepCar, placeCar, fitTyres, CAR } from './physics.js';
import { Driver } from './ai.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const KMH = 3.6;

// 練習区間 (n0〜n1 はコントロールラインからの距離[m]。ブレーキ開始点はお手本から自動で検出する)
export const TRAIN_SECTIONS = [
  { id: 'lap', name: 'ラップ全体', short: '全周' },
  { id: 'c12', name: '1〜2コーナー', short: '1-2', n0: 300, n1: 700 },
  { id: 'esses', name: 'S字・逆バンク', short: 'S字', n0: 760, n1: 1400 },
  { id: 'dunlop', name: 'ダンロップ', short: 'ダンロップ', n0: 1400, n1: 1960 },
  { id: 'degner', name: 'デグナー', short: 'デグナー', n0: 1960, n1: 2330 },
  { id: 'hairpin', name: 'ヘアピン', short: 'ヘアピン', n0: 2400, n1: 2820 },
  { id: 'spoon', name: '200R〜スプーン', short: 'スプーン', n0: 2900, n1: 3950 },
  { id: 'chicane', name: '130R・シケイン', short: 'シケイン', n0: 4560, n1: 5300 },
  { id: 'final', name: '最終コーナー', short: '最終', n0: 5300, n1: 5650 },
];

// ---------------------------------------------------------------- お手本ラップ
const refCache = new Map();
export function buildReference(T, line, { setup = 'mid', tyre = 'soft', wet = 0 } = {}) {
  const key = `${setup}|${tyre}|${Math.round(wet * 20)}`;
  if (refCache.has(key)) return refCache.get(key);
  const N = T.N, L = T.length, ds = T.ds;
  const car = createCar({ setup, tyre }); car.fuel = 14; fitTyres(car, tyre);
  const drv = new Driver(car, T, line, { skill: 1 }); drv.errT = 1e9;
  const sStart = L - 470, s0 = L - 150, i0 = T.idx(s0);
  placeCar(car, T, sStart, line.off[T.idx(sStart)], 46);
  const env = { track: T, wet, noFuel: true, noWear: true, noDamage: true };
  const ref = {
    key, N, s0, i0, wet, setup, tyre,
    v: new Float32Array(N), thr: new Float32Array(N), brk: new Float32Array(N), gear: new Uint8Array(N), t: new Float32Array(N), vis: new Uint8Array(N),
    pose: { dt: 1 / 60, x: [], y: [], h: [] }, lapTime: 0,
  };
  const first = 320 + L;             // 1周目はウォームアップ (s0 を2回目に通過した所から記録)
  const stop = first + L + 900;      // ゴースト用に1周ぶんのあと900mも記録
  let dist = 0, prevS = car.s, t = 0, recT0 = -1, lastI = -1, ticks = 0;
  while (dist < stop && ticks < 60 * 400) {
    drv.update(1 / 60, wet, null, null);
    for (let k = 0; k < 4; k++) stepCar(car, 1 / 240, env);
    ticks++;
    dist += T.sDiff(car.s, prevS); prevS = car.s;
    if (dist >= first) {
      if (recT0 < 0) recT0 = ticks / 60;
      t = ticks / 60 - recT0;
      ref.pose.x.push(car.x); ref.pose.y.push(car.y); ref.pose.h.push(car.yaw);
      const i = car.i;
      if (i !== lastI && dist < first + L) {
        let j = lastI < 0 ? i : (lastI + 1) % N;
        for (let g = 0; g < 4; g++) {
          if (!ref.vis[j]) { ref.vis[j] = 1; ref.v[j] = car.speed; ref.thr[j] = car.throttle; ref.brk[j] = car.brake; ref.gear[j] = car.gear; ref.t[j] = t; }
          if (j === i) break; j = (j + 1) % N;
        }
        lastI = i;
      }
      if (dist >= first + L && !ref.lapTime) ref.lapTime = t;
    }
  }
  // 取りこぼしを補間
  for (let i = 0; i < N; i++) if (!ref.vis[i]) { const a = (i - 1 + N) % N, b = (i + 1) % N; ref.v[i] = (ref.v[a] + ref.v[b]) / 2; ref.t[i] = (ref.t[a] + ref.t[b]) / 2; ref.thr[i] = ref.thr[a]; ref.brk[i] = ref.brk[a]; ref.gear[i] = ref.gear[a]; }
  ref.ratios = car.ratios;
  refCache.set(key, ref);
  return ref;
}

// 速度 v[m/s] で回転数が約12,000rpm (パワーバンドの中心) になるギヤ
export function optimalGear(ratios, v) {
  let best = 1, bd = 1e9;
  for (let g = 1; g <= 6; g++) {
    const rpm = v / CAR.rw * ratios[g] * 60 / TAU;
    if (rpm > 13300) continue;
    const d = Math.abs(rpm - 11800);
    if (d < bd) { bd = d; best = g; }
  }
  return best;
}

// 区間の準備: お手本のブレーキング区間(ゾーン)を検出
function prepareSection(T, ref, sec) {
  const N = T.N, ds = T.ds, L = T.length;
  const ix = s => clamp(Math.round(s / ds), 0, N - 1);
  const o = { sec, zones: [] };
  if (!sec.n0) { // ラップ全体
    o.start = ref.s0; o.len = L; o.id = sec.id;
    return o;
  }
  let bs = ix(sec.n0);
  for (let i = ix(sec.n0 - 120); i < ix(sec.n1); i++) if (ref.brk[i] > 0.2) { bs = i; break; }
  o.id = sec.id; o.bs = bs;
  o.start = Math.max(0, bs * ds - 300);
  o.endS = Math.min(L - 1, sec.n1 + 40);
  o.len = o.endS - o.start;
  o.zones = detectZones(T, ref, ix(sec.n0 - 120), ix(sec.n1));
  return o;
}

export function detectZones(T, ref, i0, i1) {
  const ds = T.ds, zones = [];
  let i = i0;
  while (i < i1) {
    if (ref.brk[i] > 0.15) {
      let s = i, e = i, gap = 0;
      for (let j = i; j < i1 + 40; j++) { if (ref.brk[j] > 0.15) { e = j; gap = 0; } else if (++gap > 8) break; }
      let peak = 0; for (let j = s; j <= e; j++) peak = Math.max(peak, ref.brk[j]);
      // 最低速度位置: ゾーン終了から60m先まで
      let mi = e, mv = 1e9; for (let j = s; j <= Math.min(T.N - 1, e + Math.round(60 / ds)); j++) if (ref.v[j] < mv) { mv = ref.v[j]; mi = j; }
      const drop = ref.v[s] - mv;
      if (drop > 7) zones.push({ start: s, end: e, minIdx: mi, vStart: ref.v[s], vMin: mv, peak });
      i = e + 1;
    } else i++;
  }
  return zones.slice(0, 4);
}

export const stars = (dT, len) => {
  const k = Math.sqrt(clamp(len / 400, 0.7, 4));
  return dT <= 0.15 * k ? 5 : dT <= 0.4 * k ? 4 : dT <= 0.9 * k ? 3 : dT <= 1.8 * k ? 2 : 1;
};

// ---------------------------------------------------------------- トレーナー本体
export class Trainer {
  constructor(session, ref, secIdx = 0) {
    this.S = session; this.T = session.T; this.line = session.line;
    this.ref = ref; this.secIdx = clamp(secIdx | 0, 0, TRAIN_SECTIONS.length - 1);
    this.N = this.T.N;
    this.pT = new Float32Array(this.N); this.pV = new Float32Array(this.N); this.pThr = new Float32Array(this.N); this.pBrk = new Float32Array(this.N);
    this.pGear = new Uint8Array(this.N); this.pLock = new Uint8Array(this.N); this.pSpin = new Uint8Array(this.N); this.pOff = new Uint8Array(this.N); this.pVis = new Uint8Array(this.N);
    this.prepared = TRAIN_SECTIONS.map(sec => prepareSection(this.T, ref, sec));
    this.cue = null; this.cueCd = {}; this.zoneShown = new Set(); this.zoneDone = new Set();
    this.runs = 0; this.lastReport = null; this.report = null; this.done = false; this.lastRunTime = null;
    this.target = { speed: 0, gear: 1, gearNow: 1, dv: 0, thr: 0, brk: 0, delta: 0, gearState: 'ok', nextBrake: null };
    this.gearWrongT = 0;
  }
  get sec() { return TRAIN_SECTIONS[this.secIdx]; }
  get prep() { return this.prepared[this.secIdx]; }
  get isLap() { return !this.sec.n0; }

  setReference(ref) { this.ref = ref; this.prepared = TRAIN_SECTIONS.map(sec => prepareSection(this.T, ref, sec)); }
  setSection(idx) { this.secIdx = clamp(idx | 0, 0, TRAIN_SECTIONS.length - 1); }

  // 走行の開始(やり直し): 区間の手前へ、お手本と同じ速度・ギヤで配置する
  begin() {
    const S = this.S, T = this.T, e = S.player, c = e.car, p = this.prep, ref = this.ref;
    const i = T.idx(p.start);
    placeCar(c, T, p.start, this.line.off[i], ref.v[i]);
    c.gear = c.nextGear = Math.max(1, ref.gear[i]); c.shiftT = 0;
    c.rpm = Math.max(CAR.idle, ref.v[i] / CAR.rw * c.ratios[c.gear] * 60 / TAU);
    c.dmgF = c.dmgR = c.dmgS = 0; c.pull = 0; c.retired = false; e.retired = false; e.stuckT = 0; e.pilot = null;
    c.fuel = 40; c.draft = 0;
    e.dist = p.start; e.prevS = c.s; e.lap = 0; e.lapValid = true;
    this.pVis.fill(0); this.zoneShown.clear(); this.zoneDone.clear();
    this.runT = 0; this.runDist = 0; this.prevS = c.s; this.lastI = -1;
    this.tref0 = ref.t[i]; this.startIdx = i;
    this.done = false; this.report = null; this.cue = null; this.cueCd = {}; this.gearWrongT = 0;
    this.runs++;
    S.state = 'countdown'; S.stateT = 0; S.cdDur = 1.7; S.delta = null; S.resultsReady = false;
    c.speed = ref.v[i]; this.target.delta = 0;
    this.updateGhost(0); this.updateTarget(c);
    S.emit('trainstart', {});
  }
  restart() { this.begin(); }

  // 目標ギヤ/速度のための参照インデックス
  idxAhead(i, meters) { return (i + Math.round(meters / this.T.ds)) % this.N; }

  updateGhost(elapsed) {
    const g = this.ref.pose, f = (this.tref0 + elapsed) / g.dt, i0 = Math.floor(f);
    if (i0 + 1 >= g.x.length) { this.S.ghostPose = null; return; }
    const t = f - i0; let dh = g.h[i0 + 1] - g.h[i0]; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    this.S.ghostPose = { x: g.x[i0] + (g.x[i0 + 1] - g.x[i0]) * t, y: g.y[i0] + (g.y[i0 + 1] - g.y[i0]) * t, h: g.h[i0] + dh * t };
  }

  // いまの位置でのお手本の速度と、最適ギヤ (0.4秒先の目標速度で回転が約12,000rpmになるギヤ)
  updateTarget(c) {
    const ref = this.ref, i = c.i, tg = this.target, la = this.idxAhead(i, Math.max(8, c.speed * 0.4));
    tg.speed = ref.v[i]; tg.gear = optimalGear(ref.ratios, ref.v[la]); tg.gearNow = c.gear;
    tg.dv = c.speed - ref.v[i]; tg.thr = ref.thr[i]; tg.brk = ref.brk[i];
    tg.delta = this.runT - (ref.t[i] - this.tref0);
    tg.gearState = tg.gear === c.gear ? 'ok' : tg.gear > c.gear ? 'up' : 'down';
  }

  tick(dt) {
    const S = this.S, T = this.T, c = S.player.car, ref = this.ref;
    if (S.state !== 'green' || this.done) return;
    this.runT += dt;
    const dsg = T.sDiff(c.s, this.prevS); this.runDist += dsg; this.prevS = c.s;
    // --- テレメトリ記録 ---
    const i = c.i;
    if (i !== this.lastI) {
      let j = this.lastI < 0 ? i : (this.lastI + 1) % this.N;
      for (let g = 0; g < 4; g++) {
        this.pVis[j] = 1; this.pT[j] = this.runT; this.pV[j] = c.speed; this.pThr[j] = c.throttle; this.pBrk[j] = c.brake; this.pGear[j] = c.gear;
        this.pLock[j] = (c.kF < -0.14 && c.speed > 8) || c.lockedF ? 1 : 0; this.pSpin[j] = c.kR > 0.28 && c.speed > 5 ? 1 : 0; this.pOff[j] = c.offCount >= 3 ? 1 : 0;
        if (j === i) break; j = (j + 1) % this.N;
      }
      this.lastI = i;
    }
    // --- ゴースト・目標 ---
    this.updateGhost(this.runT);
    this.updateTarget(c);
    const v = c.speed;
    this.liveCues(dt, c, i, v);
    this.checkZones(c, i);
    // --- 終了判定 ---
    if (this.runDist >= this.prep.len) this.finish();
  }

  // ---------------- ライブ助言 ----------------
  say(kind, text, sev, dur = 1.9, cd = 2.5) {
    const now = this.S.time;
    if (this.cueCd[kind] && now < this.cueCd[kind]) return;
    const pri = { urgent: 3, warn: 2, info: 1, good: 1 };
    if (this.cue && now - this.cue.at < this.cue.dur && (pri[this.cue.sev] || 0) > (pri[sev] || 0)) return;
    this.cue = { kind, text, sev, at: now, dur };
    this.cueCd[kind] = now + cd;
    this.S.emit('traincue', { kind, sev });
  }
  allZones() {
    if (this._zones) return this._zones;
    const T = this.T, ref = this.ref, z = [];
    // ラップ全体のゾーンは各区間のゾーンを並べたもの
    for (const p of this.prepared) if (p.zones) for (const q of p.zones) z.push(q);
    z.sort((a, b) => a.start - b.start);
    return (this._zones = z);
  }
  liveCues(dt, c, i, v) {
    if (this.runT < 0.5) return;
    const ref = this.ref, ds = this.T.ds, N = this.N;
    const brk = c.brake, thr = c.throttle;
    for (let zi = 0; zi < this.allZones().length; zi++) {
      const z = this.allZones()[zi];
      let toStart = ((z.start - i + N + N / 2) % N) - N / 2; toStart *= ds;           // +: 手前, -: 通過済み
      if (toStart <= clamp(v * 0.5, 14, 48) && toStart >= 0 && brk < 0.12 && !this.zoneShown.has(zi)) { this.say('brake', 'ブレーキ！', 'urgent', 1.2, 0.5); this.zoneShown.add(zi); }
      else if (toStart < 0 && toStart > -40 && brk < 0.12 && v > ref.v[i] + 8) this.say('late', 'ブレーキが遅れています！ 強く踏んで', 'urgent', 1.6, 2);
    }
    // ブレーキを残しすぎ
    const ahead = this.idxAhead(i, 14);
    if (brk > 0.2 && ref.brk[i] < 0.05 && ref.brk[ahead] < 0.08 && v < ref.v[i] - 6) this.say('release', 'ブレーキを離して！ 速度を残す', 'warn', 1.5, 2.5);
    // アクセルを開ける
    if (ref.thr[i] > 0.85 && thr < 0.35 && brk < 0.1 && v < ref.v[i] - 4) this.say('thr', 'アクセルを開けて！', 'warn', 1.4, 3);
    // 空転 / ロック
    if (c.kR > 0.3 && v > 4) this.say('spin', 'アクセルが開きすぎ！ 空転しています', 'warn', 1.5, 3);
    if (c.lockedF && v > 8) this.say('lock', 'ロック！ ブレーキを少し緩めて', 'warn', 1.5, 3);
    // ギヤ
    if (this.target.gearState !== 'ok') this.gearWrongT += dt; else this.gearWrongT = 0;
    if (this.gearWrongT > 0.7 && c.shiftT <= 0) {
      const g = this.target.gear;
      if (g < c.gear) this.say('gear', `シフトダウン → ${g}速`, 'info', 1.6, 4);
      else this.say('gear', `シフトアップ → ${g}速`, 'info', 1.6, 4);
    }
  }

  // ブレーキングゾーンを通過した直後に短い講評を出す
  checkZones(c, i) {
    const zs = this.allZones(), ds = this.T.ds, N = this.N;
    for (let zi = 0; zi < zs.length; zi++) {
      const z = zs[zi];
      if (this.zoneDone.has(zi)) continue;
      const after = ((i - (z.minIdx + Math.round(60 / ds)) + N + N / 2) % N) - N / 2;
      const before = ((z.start - i + N + N / 2) % N) - N / 2;
      if (after >= 0 && after < 40 && before < 0 && this.pVis[z.start]) {
        this.zoneDone.add(zi);
        const r = this.analyzeZone(z);
        if (!r) continue;
        if (r.noBrake) this.say('zone', 'ブレーキを踏まずに通過しました', 'warn', 2.2, 0.5);
        else if (r.off) this.say('zone', 'コースアウト！ 進入速度を落としましょう', 'warn', 2.2, 0.5);
        else if (r.brakeDiffM > 12) this.say('zone', `ブレーキが ${Math.round(r.brakeDiffM)}m 遅い`, 'warn', 2.4, 0.5);
        else if (r.brakeDiffM < -20) this.say('zone', `ブレーキが ${Math.round(-r.brakeDiffM)}m 早い`, 'warn', 2.4, 0.5);
        else if (r.exitDiffM > 14) this.say('zone', `アクセルが ${Math.round(r.exitDiffM)}m 遅い`, 'warn', 2.4, 0.5);
        else if (r.vMinPl < r.vMinRef - 10) this.say('zone', `コーナー速度が ${Math.round(r.vMinRef - r.vMinPl)}km/h 低い`, 'warn', 2.4, 0.5);
        else this.say('zone', 'ナイス！ お手本どおり', 'good', 2.2, 0.5);
      }
    }
  }

  // ---------------- 分析 ----------------
  analyzeZone(z) {
    const T = this.T, ref = this.ref, ds = T.ds, N = this.N;
    // 直前のブレーキングゾーンの終わりより前は見ない (連続するコーナーで前のブレーキを誤判定しないため)
    let prevEnd = 0; for (const q of this.allZones()) if (q.end < z.start && q.end > prevEnd) prevEnd = q.end;
    const w0 = Math.max(prevEnd + 1, z.start - Math.round(100 / ds)), w1 = Math.min(N - 1, z.end + Math.round(20 / ds));
    const vEnd = Math.min(N - 1, z.minIdx + Math.round(60 / ds));
    // ブレーキを踏み始めた点 (立ち上がり) のうち、お手本の開始点にいちばん近いもの
    let pb = -1, bestD = 1e9, peak = 0, held = false;
    for (let j = w0; j <= w1; j++) {
      if (!this.pVis[j]) continue;
      const prevB = j > w0 && this.pVis[j - 1] ? this.pBrk[j - 1] : (j === w0 ? this.pBrk[j] : 0);
      if (this.pBrk[j] > 0.25 && (prevB <= 0.25 || j === w0)) { const d = Math.abs(j - z.start); if (d < bestD) { bestD = d; pb = j; held = j === w0 && this.pBrk[j] > 0.25 && w0 > z.start - Math.round(100 / ds); } }
      peak = Math.max(peak, this.pBrk[j]);
    }
    // 最低速度 (あなた)
    let pMin = 1e9, pMinI = z.minIdx;
    for (let j = z.start; j <= vEnd; j++) if (this.pVis[j] && this.pV[j] < pMin) { pMin = this.pV[j]; pMinI = j; }
    if (pMin > 1e8) return null;
    // アクセルを開けた点 (最低速度のあと)
    const lim = Math.min(N - 1, pMinI + Math.round(300 / ds));
    let pOn = -1, rOn = -1;
    for (let j = pMinI; j <= lim; j++) if (this.pVis[j] && this.pThr[j] > 0.6) { pOn = j; break; }
    for (let j = z.minIdx; j <= Math.min(N - 1, z.minIdx + Math.round(300 / ds)); j++) if (ref.thr[j] > 0.6) { rOn = j; break; }
    let lock = 0, spin = 0, off = 0;
    for (let j = w0; j <= Math.min(N - 1, z.minIdx + Math.round(150 / ds)); j++) if (this.pVis[j]) { lock += this.pLock[j]; spin += this.pSpin[j]; off += this.pOff[j]; }
    const e0 = w0, e1 = Math.min(N - 1, z.minIdx + Math.round(150 / ds));
    const dT = this.pVis[e0] && this.pVis[e1] ? (this.pT[e1] - this.pT[e0]) - (ref.t[e1] - ref.t[e0]) : 0;
    const gOpt = optimalGear(ref.ratios, z.vMin);
    const nm = T.sectionAt(z.minIdx * ds);
    return {
      label: nm && nm.name ? nm.name : `${Math.round(z.minIdx * ds)}m 付近`,
      noBrake: pb < 0 && z.peak > 0.3 && this.pV[z.start] > z.vMin + 12,
      brakeDiffM: pb < 0 || held ? 0 : (pb - z.start) * ds,
      peakPl: peak, peakRef: z.peak,
      vMinPl: pMin * KMH, vMinRef: z.vMin * KMH,
      vEntryPl: this.pVis[z.start] ? this.pV[z.start] * KMH : 0, vEntryRef: z.vStart * KMH,
      exitDiffM: pOn < 0 || rOn < 0 ? 0 : (pOn - pMinI - (rOn - z.minIdx)) * ds,
      gearPl: this.pVis[pMinI] ? this.pGear[pMinI] : 0, gearOpt: gOpt,
      lock, spin, off, dT,
    };
  }

  // 区間の分析と助言
  analyzeSection(p) {
    const T = this.T, ref = this.ref, ds = T.ds;
    const out = { id: p.id, name: p.sec.name, zones: [], advice: [] };
    const iA = Math.max(0, p.bs - Math.round(150 / ds)), iB = Math.min(this.N - 1, T.idx(p.sec.n1));
    out.len = (iB - iA) * ds;
    out.dT = this.pVis[iA] && this.pVis[iB] ? (this.pT[iB] - this.pT[iA]) - (ref.t[iB] - ref.t[iA]) : 0;
    out.stars = stars(out.dT, out.len);
    for (const z of p.zones) { const r = this.analyzeZone(z); if (r) out.zones.push(r); }
    out.advice = adviceFor(out.zones);
    return out;
  }

  finish() {
    if (this.done) return;
    this.done = true;
    const S = this.S, T = this.T;
    const rep = { aborted: false, secId: this.sec.id, name: this.sec.name, isLap: this.isLap, runT: this.runT, run: this.runs };
    if (this.isLap) {
      const rows = [];
      for (let k = 1; k < this.prepared.length; k++) if (this.prepared[k].zones.length) rows.push(this.analyzeSection(this.prepared[k]));
      rep.rows = rows;
      rep.refTime = this.ref.lapTime; rep.delta = this.runT - this.ref.lapTime;
      rep.stars = stars(Math.max(0, rep.delta), 5800);
      // 遅れが大きい区間から助言を集める
      const worst = rows.slice().sort((x, y) => y.dT - x.dT);
      rep.advice = [];
      for (const r of worst) { for (const adv of r.advice) { if (adv.sev !== 'good' && rep.advice.length < 3) rep.advice.push({ ...adv, text: `【${r.name}】${adv.text}` }); } }
      if (!rep.advice.length) rep.advice.push({ sev: 'good', text: 'どの区間もお手本に近い走りです。タイムをさらに縮めるには、各コーナーの立ち上がりを磨きましょう。' });
    } else {
      const r = this.analyzeSection(this.prep);
      rep.rows = [r]; rep.delta = r.dT; rep.stars = r.stars; rep.zones = r.zones; rep.advice = r.advice;
      rep.refTime = this.ref.t[T.idx(this.prep.endS)] - this.tref0;
    }
    rep.score = Math.round(100 * Math.exp(-Math.max(0, rep.delta) / (0.9 * Math.sqrt(clamp((this.isLap ? 5800 : this.prep.len) / 400, 0.7, 4) * (this.isLap ? 4 : 1)))));
    this.report = this.lastReport = rep; this.lastRunTime = this.runT;
    S.emit('trainreport', {});
  }

  abort(reason) {
    if (this.done) return;
    this.done = true;
    const rep = { aborted: true, secId: this.sec.id, name: this.sec.name, isLap: this.isLap, runT: this.runT, run: this.runs, stars: 0, score: 0, delta: 0, rows: [], zones: [],
      advice: [{ sev: 'warn', text: reason === 'wall' ? 'コースの外に出てしまいました。ブレーキを早めに踏み、進入速度を抑えましょう。' : 'コースアウトして復帰できませんでした。コーナー手前でしっかり減速し、立ち上がりのアクセルはゆっくり開けましょう。' }] };
    this.report = this.lastReport = rep;
    this.S.emit('trainreport', {});
  }
}

// 助言の文章を作る (重要度の高い順に最大3件)
export function adviceFor(zones) {
  const list = [];
  for (const z of zones) {
    const L = z.label;
    if (z.off > 0) list.push({ w: 100, sev: 'warn', text: `${L}: コースアウトしました。進入速度が高すぎます。ブレーキング開始を早めましょう。` });
    if (z.noBrake) list.push({ w: 95, sev: 'warn', text: `${L}: ブレーキを踏んでいません。お手本は約${Math.round(z.vEntryRef)}km/hからブレーキング。` });
    if (z.lock > 3) list.push({ w: 80, sev: 'warn', text: `${L}: ブレーキでタイヤがロックしています。最初に強く踏み、速度が落ちたら踏力を抜きましょう。` });
    if (z.brakeDiffM > 12 && !z.noBrake) list.push({ w: 70 + z.brakeDiffM / 3, sev: 'warn', text: `${L}: ブレーキが約${Math.round(z.brakeDiffM)}m 遅れています。道路脇のブレーキング指標を目安に、早めに踏み始めましょう。` });
    if (z.brakeDiffM < -20 && z.vMinPl < z.vMinRef - 4) list.push({ w: 60 + -z.brakeDiffM / 4, sev: 'warn', text: `${L}: ブレーキが約${Math.round(-z.brakeDiffM)}m 早すぎて、コーナー速度が${Math.round(z.vMinRef - z.vMinPl)}km/h 足りません。もう少し奥まで我慢しましょう。` });
    else if (z.vMinPl < z.vMinRef - 8) list.push({ w: 55 + (z.vMinRef - z.vMinPl) / 2, sev: 'warn', text: `${L}: コーナー中の最低速度が${Math.round(z.vMinRef - z.vMinPl)}km/h 低め。ブレーキを残しすぎず、早めに離してコーナーへ。` });
    if (z.peakPl < z.peakRef * 0.65 && z.vEntryPl > z.vEntryRef - 5 && !z.noBrake) list.push({ w: 50, sev: 'warn', text: `${L}: ブレーキが弱めです。最初に80%以上で強く踏み、徐々に抜いていきましょう。` });
    if (z.spin > 3) list.push({ w: 65, sev: 'warn', text: `${L}: 立ち上がりで後輪が空転しています。アクセルは一気に開けず、徐々に開けましょう。` });
    else if (z.exitDiffM > 14) list.push({ w: 45 + z.exitDiffM / 4, sev: 'warn', text: `${L}: アクセルを開けるのが約${Math.round(z.exitDiffM)}m 遅れています。コーナーの出口が見えたら素早く開けましょう。` });
    if (z.gearPl && Math.abs(z.gearPl - z.gearOpt) >= 1) list.push({ w: 40, sev: 'info', text: `${L}: コーナー中の最適ギヤは${z.gearOpt}速です (あなたは${z.gearPl}速)。ブレーキング中に先にシフトダウンしておきましょう。` });
  }
  list.sort((a, b) => b.w - a.w);
  const out = list.slice(0, 3);
  if (!out.length) out.push({ sev: 'good', text: 'ブレーキ・コーナー速度・アクセルのタイミングがお手本にとても近いです。この調子で繰り返し、さらに0.1秒を削りましょう。' });
  return out;
}
