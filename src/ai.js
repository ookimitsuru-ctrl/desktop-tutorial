// AIドライバー: レーシングライン生成・速度プロファイル・操縦・追い越し/防御
import { RACELINE_N, RACELINE_OFF } from './data/raceline.js';
import { CAR, G, steerLock, tyreBaseMu, tyreGripFactor, totalMass, engineTorque } from './physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const RHO = 1.2;

// レーシングライン (最小曲率ライン)
export function computeRacingLine(T) {
  const N = T.N;
  const d = new Float32Array(N);
  const lo = new Float32Array(N), hi = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    lo[i] = -(T.wl[i] - 1.25) - (T.kerbL[i] ? 0.55 : 0);
    hi[i] = (T.wr[i] - 1.25) + (T.kerbR[i] ? 0.55 : 0);
  }
  const px = new Float32Array(N), py = new Float32Array(N);
  const W = i => ((i % N) + N) % N;
  // 事前計算済みの最小曲率ライン (tools/build-line.mjs) を読み込む
  for (let i = 0; i < N; i++) {
    const v = RACELINE_N === N ? RACELINE_OFF[i] : RACELINE_OFF[Math.round(i * RACELINE_N / N) % RACELINE_N];
    d[i] = clamp(v, lo[i], hi[i]);
    px[i] = T.x[i] + T.nx[i] * d[i]; py[i] = T.y[i] + T.ny[i] * d[i];
  }
  // 曲率
  const curv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = W(i - 3), b = W(i + 3);
    const x1 = px[a], y1 = py[a], x2 = px[i], y2 = py[i], x3 = px[b], y3 = py[b];
    const ax = x2 - x1, ay = y2 - y1, bx = x3 - x2, by = y3 - y2;
    const cr = ax * by - ay * bx;
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by), lc = Math.hypot(x3 - x1, y3 - y1);
    curv[i] = 2 * cr / (la * lb * lc + 1e-9);
  }
  // 平滑化
  const cs = new Float32Array(N);
  for (let i = 0; i < N; i++) { let a = 0; for (let q = -2; q <= 2; q++) a += curv[W(i + q)]; cs[i] = a / 5; }
  return { off: d, x: px, y: py, curv: cs, lo, hi };
}

// 速度プロファイル (前後方向パス)。p = { mu, cla, cda, mass, power, use }
export function speedProfile(T, line, p, out) {
  const N = T.N, ds = T.ds;
  const v = out || new Float32Array(N);
  const kdf = 0.5 * RHO * p.cla / p.mass, kdr = 0.5 * RHO * p.cda / p.mass;
  const mu = p.mu * (p.use ?? 1);
  const VTOP = 96;
  for (let i = 0; i < N; i++) {
    const k = Math.abs(line.curv[i]) + 1e-5;
    const den = k - mu * kdf * (p.dfUse ?? 0.93);
    let vv = den > 1e-6 ? Math.sqrt(mu * G * (p.gUse ?? 0.97) / den) : VTOP;
    v[i] = Math.min(vv, VTOP);
  }
  // 後ろ向き: ブレーキング
  const bk = p.brake ?? 0.9;
  for (let pass = 0; pass < 2; pass++) {
    for (let q = N - 1; q >= 0; q--) {
      const i = q, j = (q + 1) % N;
      const vj = v[j];
      const amax = mu * (G + kdf * vj * vj);
      const alat = vj * vj * Math.abs(line.curv[j]);
      const along = amax * Math.pow(Math.max(0, 1 - (alat * alat) / (amax * amax)), 0.85) * bk + kdr * vj * vj + G * T.slope[i];
      const vi = Math.sqrt(vj * vj + 2 * Math.max(1, along) * ds);
      if (vi < v[i]) v[i] = vi;
    }
  }
  // 前向き: 加速
  const pw = 507000 * CAR.eff * (p.power ?? 1);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N, vi = v[i];
      const amax = mu * (G + kdf * vi * vi);
      const alat = vi * vi * Math.abs(line.curv[i]);
      const atr = Math.sqrt(Math.max(0, amax * amax - alat * alat)) * 0.58;
      const apw = pw / (p.mass * Math.max(vi, 12)) ;
      const acc = Math.min(atr, apw) - kdr * vi * vi - G * T.slope[i];
      const vj = Math.sqrt(Math.max(4, vi * vi + 2 * acc * ds));
      if (vj < v[j]) v[j] = vj;
    }
  }
  return v;
}

let _seed = 12345;
export function seedRand(s) { _seed = s >>> 0; }
export function rand() { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; }

const _p = { x: 0, y: 0, h: 0 };

export class Driver {
  static DF_USE = 0.98; static G_USE = 1.0;
  // skill: 0..1 (1 = 最速)
  constructor(car, T, line, opts = {}) {
    this.car = car; this.T = T; this.line = line;
    this.skill = opts.skill ?? 0.8;
    this.use = 0.86 + 0.13 * this.skill;      // グリップ使用率
    this.aggr = opts.aggr ?? 0.5;
    this.profile = new Float32Array(T.N);
    this.profileMu = 0; this.profileT = 0;
    this.offset = 0; this.offsetTarget = 0;     // レーシングラインからの横オフセット
    this.followCap = 999; this.defended = 0;
    this.reaction = 0.18 + rand() * 0.35;
    this.errT = 3 + rand() * 20; this.err = 0;
    this.lift = 0; this.wet = 0;
    this.passSide = 0; this.passT = 0;
    this.steerOnly = !!opts.steerOnly;   // プレイヤー車の自動操舵: ステアリングと進路取りだけを行う
    if (!this.steerOnly) { car.assistTC = true; car.assistABS = true; car.autoShift = true; }
    this.refresh(0);
  }
  estMu(wet) {
    const c = this.car;
    const f = Math.max(0.7, Math.min(tyreGripFactor(c.tyre, c.tempF, c.wearF), tyreGripFactor(c.tyre, c.tempR + 8, c.wearR)));
    return tyreBaseMu(c.tyre, wet) * f * c.gripK * (1 - 0.25 * c.dmgS) * (1 - 0.1 * c.dmgF);
  }
  refresh(wet) {
    const c = this.car;
    this.wet = wet;
    const mu = this.estMu(wet);
    this.profileMu = mu;
    speedProfile(this.T, this.line, {
      mu, use: this.use * (wet > 0.3 ? 0.97 : 1), cla: c.setup.cla * (1 - 0.3 * c.dmgF - 0.25 * c.dmgR), cda: c.setup.cda,
      mass: totalMass(c), power: c.power, brake: 0.86 + 0.06 * this.skill, dfUse: Driver.DF_USE, gUse: Driver.G_USE,
    }, this.profile);
  }
  // cars: 全車, me index。 dt 秒ごとに呼ぶ (60Hz)
  update(dt, wet, cars, info) {
    const c = this.car, T = this.T, L = this.line;
    this.profileT -= dt;
    if (this.profileT <= 0 || Math.abs(wet - this.wet) > 0.04) {
      this.profileT = 4 + rand() * 2;
      if (Math.abs(this.estMu(wet) - this.profileMu) > 0.012 || Math.abs(wet - this.wet) > 0.04) this.refresh(wet);
    }
    const v = Math.max(0, c.vx);
    const N = T.N;

    // ---------- レースクラフト ----------
    let cap = 999, lift = 0;
    if (cars) {
      const myOff = c.d;
      let ahead = null, aGap = 1e9, behind = null, bGap = 1e9, sideBy = false, block = null, blGap = 1e9;
      for (let k = 0; k < cars.length; k++) {
        const o = cars[k];
        if (o === c || o.inPit || o.out) continue;
        const gap = T.sDiff(o.s, c.s);
        if (Math.abs(gap) > 95) continue;
        // 立体交差の上下は無関係
        const dx = o.x - c.x, dy = o.y - c.y;
        if (dx * dx + dy * dy > 110 * 110) continue;
        if (gap > 0 && gap < aGap) { aGap = gap; ahead = o; }
        // 自分の進路上にいる最も近い車 (隣の列の車に隠れた前走車を見落とさない)
        if (gap > 0 && gap < blGap) {
          const l1 = o.d - myOff, l2 = (o.d - L.off[o.i]) - (myOff - L.off[c.i]);
          if (Math.abs(l1) < 2.3 || Math.abs(l2) < 2.3 || (info?.caution && gap > 4)) { blGap = gap; block = o; }
        }
        if (gap <= 0 && -gap < bGap) { bGap = -gap; behind = o; }
        // 横並び: 間隔を確保
        if (Math.abs(gap) < 6.5) {
          const lat = o.d - myOff;
          if (Math.abs(lat) < 3.0 && Math.abs(lat) > 0.3) {
            const push = (3.0 - Math.abs(lat)) * (lat > 0 ? -1 : 1);
            this.offsetTarget += push * 0.5;
            sideBy = true;
          }
        }
      }
      // 次のコーナーの向き (イン側)
      let kn = 0;
      for (let q = 10; q < 110; q += 6) { const kk = L.curv[(c.i + q) % N]; if (Math.abs(kk) > Math.abs(kn)) kn = kk; }
      const inside = kn > 0.004 ? 1 : kn < -0.004 ? -1 : 0;
      this.passT -= dt;
      if (ahead) {
        const ov = Math.max(0, ahead.vx);
        const closing = v - ov;
        const lat = ahead.d - myOff;
        const slow = ov < 12 && v > 20;
        if (aGap < (this.steerOnly ? 16 + Math.max(0, closing) * 2.2 : 9 + Math.max(0, closing) * 1.4) + (slow ? 40 : 0)) {
          if (Math.abs(lat) < 2.5 || this.passT > 0) {
            // 抜く側を決める
            if (this.passT <= 0) {
              const roomR = L.hi[c.i] - (ahead.d + 2.4), roomL = (ahead.d - 2.4) - L.lo[c.i];
              let side = 0;
              if (inside > 0 && roomR > 0.2) side = 1; else if (inside < 0 && roomL > 0.2) side = -1;
              else side = roomR > roomL ? (roomR > 0.2 ? 1 : 0) : (roomL > 0.2 ? -1 : 0);
              const cornering = Math.abs(L.curv[c.i]) > 0.008;
              if (cornering && !slow && !this.steerOnly && rand() > 0.02 + this.aggr * 0.05) side = 0;
              this.passSide = side; this.passT = side ? 2.5 : 0.4;
            }
            if (this.passSide) {
              const tgt = ahead.d + this.passSide * 2.55 - L.off[c.i];
              this.offsetTarget += (tgt - this.offsetTarget) * Math.min(1, dt * 3.5);
            }
          }
        }
      } else if (this.passT <= 0) this.passSide = 0;
      // 進路上の車に追突しない速度に抑える (前車が急減速しても止まれること)
      if (block && blGap < 90) {
        const ov = Math.max(0, block.vx);
        const room = Math.max(0, blGap - (5.4 + v * 0.035) - (info?.caution ? 3 : 0));
        const decel = (Math.abs(L.curv[c.i]) > 0.004 ? 4.2 : 6.2) * this.profileMu;
        cap = Math.min(cap, Math.sqrt(ov * ov + 2 * decel * room));
        if (blGap < 25 && Math.abs(L.curv[c.i]) > 0.004) cap = Math.min(cap, this.profile[c.i] * 0.985 + 1);
        if (blGap < 5.2) cap = Math.min(cap, ov - 1.5);
      }
      if ((!ahead || aGap > 30) && !sideBy) { if (this.passT <= 0) this.offsetTarget *= (1 - Math.min(1, dt * 0.9)); }
      if (sideBy) cap = Math.min(cap, Math.max(20, this.profile[c.i] * 0.95));
      // 防御: 直線で後ろから迫られたらイン側へ一度だけ動く
      this.defended -= dt;
      if (behind && bGap < 14 && behind.vx > v + 1.5 && Math.abs(L.curv[c.i]) < 0.003 && inside && this.defended <= 0 && !info?.blue) {
        if (rand() < 0.25 + this.aggr * 0.5) {
          const tgt = clamp(inside * 2.8, L.lo[c.i] - L.off[c.i] + 0.3, L.hi[c.i] - L.off[c.i] - 0.3);
          this.offsetTarget = tgt * 0.8;
        }
        this.defended = 6;
      }
      if (info?.blue) { // 周回遅れ: ラインを外して少しリフト
        const side = inside ? -inside : (c.d > 0 ? 1 : -1);
        this.offsetTarget += (side * 3 - this.offsetTarget) * Math.min(1, dt * 2);
        lift = 0.12;
      }
    }
    // ドライバーの小さなミス
    this.errT -= dt;
    if (this.errT <= 0) { this.errT = 6 + rand() * 30; this.err = (rand() - 0.3) * (1 - this.skill) * 0.05; }
    this.err *= (1 - dt * 0.4);

    if (info?.keepRight) this.offsetTarget += ((L.hi[c.i] - L.off[c.i] - 0.6) - this.offsetTarget) * Math.min(1, dt * 2.5); // ピット入口へ
    // オフセットをコース幅に収める
    const oi = (c.i + 8) % N;
    this.offsetTarget = clamp(this.offsetTarget, L.lo[oi] - L.off[oi], L.hi[oi] - L.off[oi]);
    this.offset += clamp(this.offsetTarget - this.offset, -3.2 * dt, 3.2 * dt);

    // ---------- ステアリング (pure pursuit) ----------
    const look = 6.5 + v * 0.26;
    const fi = c.fi + look / T.ds;
    const li = Math.floor(fi) % N, li2 = (li + 1) % N, lt = fi - Math.floor(fi);
    const off = L.off[li] + (L.off[li2] - L.off[li]) * lt + this.offset;
    T.pos(fi * T.ds, off, _p);
    const dx = _p.x - c.x, dy = _p.y - c.y;
    const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
    const lx = dx * cy + dy * sy, ly = -dx * sy + dy * cy;
    const curvCmd = 2 * ly / (lx * lx + ly * ly + 1e-6);
    // 必要舵角 = ホイールベース×曲率 + スリップ角分の補正
    const m = totalMass(c);
    const ayReq = v * v * curvCmd;
    const ayMax = this.profileMu * (G + 0.5 * RHO * c.setup.cla * v * v / m);
    let delta = Math.atan(CAR.wheelbase * curvCmd) + 0.055 * clamp(ayReq / ayMax, -1.2, 1.2);
    // スピン抑制: リアの滑り角が限界を大きく超えたらカウンターを当てる
    const beta = Math.atan2(c.vy - CAR.b * c.r, Math.max(v, 3));
    const bTh = this.steerOnly ? 0.10 : 0.15;
    if (Math.abs(beta) > bTh) delta += (beta - Math.sign(beta) * bTh) * (this.steerOnly ? 2.2 : 1.6);
    if (lx < 1.5) delta = Math.sign(ly || 1) * CAR.maxLock; // 目標が後ろ (スピン後など): 目一杯切って向きを戻す
    this.dSm = (this.dSm ?? delta) + (delta - (this.dSm ?? delta)) * Math.min(1, dt * 14);
    delta = this.dSm;
    const lock = steerLock(c, v);
    c.steerIn = clamp(delta / lock, -1, 1);

    if (this.steerOnly) return; // アクセル・ブレーキはプレイヤーが操作する

    // ---------- 速度制御 ----------
    const pi = (c.i + Math.round((2 + v * 0.07) / T.ds)) % N;
    let vt = this.profile[pi] * (1 + this.err);
    const offAbs = Math.abs(this.offset);
    if (offAbs > 0.7 && Math.abs(L.curv[pi]) > 0.004) vt *= 1 - Math.min(0.12, offAbs * 0.028);
    if (info?.caution && Math.abs(L.curv[pi]) > 0.003) vt *= 0.93; // スタート直後の混戦では無理をしない
    if (c.offCount >= 2) vt = Math.min(vt, 30);
    const stuck = c.offCount >= 2 && v < 8;
    vt = Math.min(vt, cap);
    if (info?.vmax) vt = Math.min(vt, info.vmax);
    const e = vt - v;
    let thr = 0, brk = 0;
    const pwr = engineTorque(Math.max(c.rpm, 6000)) * c.ratios[Math.max(1, c.gear)] * CAR.eff / CAR.rw; // 最大駆動力
    const dragF = 0.5 * RHO * c.setup.cda * v * v + 0.016 * m * G + m * G * T.slope[c.i];
    const hold = clamp(dragF / pwr, 0, 1); // 速度維持に必要なスロットル
    if (e > -1.5) {
      thr = sat(hold * (1 + Math.min(0, e) / 1.5) + Math.max(0, e) * 0.45);
      // 横Gに応じてスロットルを絞る (摩擦円)
      const used = Math.abs(c.ay) / (ayMax + 1e-6);
      const room = Math.sqrt(Math.max(0, 1 - Math.min(1, used * used * 0.94)));
      const trac = c.mu * c.fzR * room;
      thr = Math.min(thr, clamp(trac / pwr * 1.0 + hold * 0.6 + 0.04, 0.06, 1));
      thr *= (1 - lift);
      if (stuck) thr = Math.max(thr, 0.75);
    }
    // ブレーキ: プロファイルの減速度をフィードフォワード + 速度偏差
    {
      const k2 = (pi + 4) % N, vp1 = this.profile[pi] , vp2 = this.profile[k2];
      const aff = Math.max(0, (vp1 * vp1 - vp2 * vp2) / (2 * 4 * T.ds));
      const dragA = 0.5 * RHO * c.setup.cda * v * v / m;
      let need = 0;
      if (e < 1.5 && aff > dragA + 1.5) need = (aff - dragA) * m / CAR.brakeForceMax;
      if (e < -1.5) need += (-e - 1.5) * 0.10;
      if (cap < 900 && e < -0.3) need = Math.max(need, -e * 0.22);
      if (need > 0.02) { brk = sat(need); thr = 0; }
    }
    if (Math.abs(beta) > 0.14 && v > 15) { thr *= sat(1 - (Math.abs(beta) - 0.14) * 8); }
    // アシスト無しの車では、空転・ロックを感じ取って足で調整する (人間のドライバー相当)
    if (!c.assistTC) {
      this.footT = clamp((this.footT || 0) + (c.kR > 0.085 ? dt * 9 * (1 + (c.kR - 0.085) * 12) : -dt * 1.6), 0, 0.9);
      thr *= 1 - this.footT;
      if (c.gear <= 2) thr = Math.min(thr, 0.35 + 0.65 * sat((c.rpm - 6000) / 7000) + (c.gear - 1) * 0.2);
    }
    if (!c.assistABS) {
      this.footB = clamp((this.footB || 0) + ((c.kF < -0.12 || c.kR < -0.14) ? dt * 10 : -dt * 2.5), 0, 0.85);
      brk *= 1 - this.footB;
    }
    c.throttle += clamp(thr - c.throttle, -dt * 12, dt * (4 + 4 * this.skill));
    c.brake += clamp(brk - c.brake, -dt * 10, dt * 9);
  }
}
