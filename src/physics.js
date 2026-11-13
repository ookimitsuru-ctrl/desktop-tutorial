// 車両物理モデル (OK-90 / 1990年前後のF1を想定した架空マシン)
// 2輪(前後軸)モデル + 前後輪の回転自由度 + 複合スリップタイヤ + 空力 + 荷重移動。
// ABS/TCS は標準では無い (アシスト設定時と AI ドライバーの「足」としてのみ使用)。
// 車体座標: x=前, y=右。ヨー角/ヨーレートは時計回り(右旋回)が正。

export const G = 9.81;
const RHO = 1.2;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export const CAR = {
  dryMass: 505 + 75,       // 車体 + ドライバー [kg]
  wheelbase: 2.85, a: 1.62, b: 1.23, // 重心→前軸 / 後軸 [m]
  cgh: 0.28,               // 重心高 [m]
  izK: 1.22,               // ヨー慣性 = m * izK
  rw: 0.33,                // タイヤ半径 [m]
  iwF: 1.7, iwR: 2.3,      // 前後輪(左右合計)の慣性 [kg m2]
  ie: 0.032,               // エンジン・駆動系慣性 [kg m2]
  halfTrack: 0.86,
  length: 4.45, width: 2.1,
  brakeForceMax: 23500,    // ペダル100%時の総制動力 [N] (ダウンフォースが無いと簡単にロックする)
  brakeBias: 0.67,
  eff: 0.91,               // 駆動効率
  revLimit: 13600, revMax: 14300, idle: 2500,
  shiftTime: 0.11,
  maxLock: 0.37,           // 前輪最大切れ角 [rad]
  fuelRate: 0.040,         // 全開時燃料消費 [kg/s]
  fuelPerLap: 2.75,        // 目安 [kg/周]
};

// 3.5L NA V10 トルクカーブ [rpm, Nm]  最高出力 約680ps / 12,800rpm
const TQ = [[1500, 150], [3000, 205], [5000, 268], [7000, 322], [9000, 362], [10500, 380], [11800, 386], [12800, 378], [13500, 352], [14300, 250], [15500, 80]];
export function engineTorque(rpm) {
  if (rpm <= TQ[0][0]) return TQ[0][1];
  for (let i = 1; i < TQ.length; i++) {
    if (rpm <= TQ[i][0]) { const a = TQ[i - 1], b = TQ[i]; return a[1] + (b[1] - a[1]) * (rpm - a[0]) / (b[0] - a[0]); }
  }
  return 0;
}
const engineBrake = rpm => 15 + 55 * sat(rpm / 13500);

// 総減速比 (ギア比×ファイナル) index 0 = R, 1..6
const BASE_RATIOS = [-13.2, 13.44, 10.18, 8.27, 6.91, 5.96, 5.25];

// セッティング 3種
export const SETUPS = {
  high: { id: 'high', name: '高速寄り', cda: 1.04, cla: 2.50, final: 0.955, front: 0.365, desc: '最高速重視。ストレートで有利' },
  mid: { id: 'mid', name: '中速寄り', cda: 1.20, cla: 2.90, final: 1.0, front: 0.37, desc: 'バランス型。鈴鹿の標準設定' },
  low: { id: 'low', name: '低速寄り', cda: 1.43, cla: 3.25, final: 1.055, front: 0.375, desc: '旋回と立ち上がり重視。最高速は低下' },
};

// タイヤ 4種
//  mu: 乾燥路の基準グリップ, muWet: 完全ウェット時, wear: 摩耗係数, opt: 適正温度, cold/hot: 温度感度幅
export const TYRES = {
  soft: { id: 'soft', name: 'ソフト', short: 'S', color: '#e8323c', mu: 1.88, muWet: 0.82, wear: 0.066, opt: 88, cold: 62, hot: 42 },
  medium: { id: 'medium', name: 'ミディアム', short: 'M', color: '#f2c230', mu: 1.845, muWet: 0.78, wear: 0.037, opt: 92, cold: 58, hot: 46 },
  hard: { id: 'hard', name: 'ハード', short: 'H', color: '#e8e8e8', mu: 1.81, muWet: 0.73, wear: 0.022, opt: 96, cold: 54, hot: 50 },
  rain: { id: 'rain', name: 'レイン', short: 'R', color: '#2f8fe8', mu: 1.46, muWet: 1.27, wear: 0.05, opt: 62, cold: 60, hot: 36 },
};

// 路面種別ごとの係数 [舗装, 縁石, 芝, グラベル]
const SURF_MU = [1.0, 0.93, 0.42, 0.50];
const SURF_MU_WET = [1.0, 0.72, 0.62, 0.9]; // ウェット時に追加で掛かる係数
const SURF_DRAG = [0.014, 0.02, 0.085, 0.24];

const HEAT_K = 0.42;          // 滑りによる発熱のうちタイヤに蓄積される割合
const KPEAK = 0.105;         // 最大グリップとなるスリップ率
const APEAK_F = Math.tan(0.118), APEAK_R = Math.tan(0.105); // 最大グリップとなるスリップ角
const SH_C = 1.5, SH_B = Math.tan(Math.PI / (2 * SH_C));

export function tyreGripFactor(ty, temp, wear) {
  const dt = temp - ty.opt;
  const w = dt < 0 ? ty.cold : ty.hot;
  const ft = 1 - Math.min(0.24, (dt / w) * (dt / w) * 0.15);
  const cliff = wear > 0.72 ? ((wear - 0.72) / 0.28) : 0;
  const fw = 1 - 0.075 * wear - 0.30 * cliff * cliff;
  return ft * fw;
}
export function tyreBaseMu(ty, wet) {
  const w = Math.pow(sat(wet), 0.8);
  return ty.mu + (ty.muWet - ty.mu) * w;
}

export function createCar(opts = {}) {
  const car = {
    id: opts.id || 0,
    x: 0, y: 0, yaw: 0, vx: 0, vy: 0, r: 0,
    wF: 0, wR: 0, gear: 1, shiftT: 0, nextGear: 1, rpm: CAR.idle,
    throttle: 0, brake: 0, steerIn: 0, delta: 0,
    fuel: 10,
    setup: SETUPS[opts.setup || 'mid'],
    tyre: TYRES[opts.tyre || 'medium'],
    tempF: 75, tempR: 75, wearF: 0, wearR: 0,
    dmgF: 0, dmgR: 0, dmgS: 0, pull: 0, retired: false,
    power: opts.power || 1, gripK: opts.gripK || 1,
    assistTC: false, assistABS: false, autoShift: false,
    ratios: BASE_RATIOS,
    // トラック上の状態
    fi: 0, i: 0, s: 0, d: 0, relH: 0,
    // 出力・演出用
    ax: 0, ay: 0, kF: 0, kR: 0, slipF: 0, slipR: 0, saF: 0, saR: 0,
    surf: [0, 0, 0, 0], offCount: 0, limiter: false, shiftDenied: 0,
    draft: 0, hit: 0, hitSide: 0, speed: 0, mu: 1.7,
    fzF: 3000, fzR: 4000, stopped: false, lockedF: false,
  };
  applySetup(car);
  return car;
}

export function applySetup(car) {
  car.ratios = BASE_RATIOS.map(r => r * car.setup.final);
}
export function fitTyres(car, id) {
  car.tyre = TYRES[id];
  car.tempF = car.tempR = id === 'rain' ? 55 : 78; // タイヤウォーマー
  car.wearF = car.wearR = 0;
}
export function placeCar(car, track, s, d, speed = 0) {
  const p = { x: 0, y: 0, h: 0 };
  track.pos(s, d, p);
  car.x = p.x; car.y = p.y; car.yaw = p.h; car.vx = speed; car.vy = 0; car.r = 0;
  car.wF = car.wR = speed / CAR.rw; car.delta = 0; car.steerIn = 0; car.throttle = 0; car.brake = 0;
  car.fi = track.wrapS(s) / track.ds; car.i = track.idx(s); car.s = track.wrapS(s); car.d = d;
  car.shiftT = 0; car.ax = 0; car.ay = 0; car.hit = 0;
  let g = 1;
  if (speed > 1) { while (g < 6 && speed / CAR.rw * car.ratios[g] * 60 / TAU > 12200) g++; }
  car.gear = car.nextGear = g;
  car.rpm = Math.max(CAR.idle, speed / CAR.rw * car.ratios[g] * 60 / TAU);
}

export function totalMass(car) { return CAR.dryMass + car.fuel; }

// 速度に応じた実用最大舵角 (入力100%が「限界を少し超える」舵角になるよう整形)
export function steerLock(car, v) {
  const m = totalMass(car);
  const ay = 1.75 * (G + 0.5 * RHO * car.setup.cla * v * v / m);
  const need = CAR.wheelbase * ay / Math.max(v * v, 40) + 0.105;
  return Math.min(CAR.maxLock, need);
}

export function requestShift(car, dir) {
  if (car.shiftT > 0) return false;
  const ng = car.gear + dir;
  if (ng > 6) return false;
  if (ng < 1) {
    // 1速より下: ほぼ停止時のみリバース
    if (ng === 0 && Math.abs(car.vx) < 2.5) { car.nextGear = 0; car.shiftT = CAR.shiftTime; return true; }
    return false;
  }
  if (car.gear === 0 && car.vx < -2.5) return false;
  if (dir < 0) {
    const rpmNew = car.wR * car.ratios[ng] * 60 / TAU;
    if (rpmNew > CAR.revMax) { car.shiftDenied = 0.5; return false; } // オーバーレブ防止
  }
  car.nextGear = ng; car.shiftT = CAR.shiftTime;
  return true;
}

function autoShiftLogic(car) {
  if (car.shiftT > 0 || car.gear === 0) return;
  const rpm = car.wR * car.ratios[car.gear] * 60 / TAU;
  if (car.gear < 6 && rpm > 13150 && car.kR < 0.2 && car.throttle > 0.3) requestShift(car, 1);
  else if (car.gear > 1) {
    const rl = car.wR * car.ratios[car.gear - 1] * 60 / TAU;
    if (rl < (car.throttle > 0.6 ? 10600 : 12300) && rpm < 11200) requestShift(car, -1);
  }
}

const _loc = { fi: 0, i: 0, s: 0, d: 0, dist2: 0 };

// 1ステップ進める。env = { track, wet (0..1), ambient }
export function stepCar(car, dt, env) {
  const T = env.track, wet = env.wet || 0;
  const S = car.setup, ty = car.tyre;
  const m = CAR.dryMass + car.fuel, Iz = m * CAR.izK;
  const { a, b, wheelbase: L, rw } = CAR;

  if (car.autoShift) autoShiftLogic(car);
  if (car.shiftDenied > 0) car.shiftDenied -= dt;

  let thr = car.retired || car.fuel <= 0 ? 0 : sat(car.throttle);
  let brk = sat(car.brake);
  const v = Math.hypot(car.vx, car.vy);
  car.speed = v;

  // --- ステアリング ---
  const lock = steerLock(car, Math.abs(car.vx));
  const dTarget = clamp(car.steerIn, -1, 1) * lock + car.pull * 0.02;
  const dRate = 2.4 * dt;
  car.delta += clamp(dTarget - car.delta, -dRate, dRate);
  const delta = car.delta, cd = Math.cos(delta), sd = Math.sin(delta);

  // --- 路面 (4輪) ---
  const ci = car.i;
  const cosr = Math.cos(car.yaw), sinr = Math.sin(car.yaw);
  const nx = T.nx[ci], ny = T.ny[ci];
  const fwdN = cosr * nx + sinr * ny;       // 車体前方ベクトルのコース法線成分
  const rgtN = -sinr * nx + cosr * ny;      // 車体右方ベクトルのコース法線成分
  const ht = CAR.halfTrack;
  const dFL = car.d + a * fwdN - ht * rgtN, dFR = car.d + a * fwdN + ht * rgtN;
  const dRL = car.d - b * fwdN - ht * rgtN, dRR = car.d - b * fwdN + ht * rgtN;
  const sf = car.surf;
  sf[0] = T.surface(ci, dFL); sf[1] = T.surface(ci, dFR); sf[2] = T.surface(ci, dRL); sf[3] = T.surface(ci, dRR);
  const wetK = Math.pow(sat(wet), 0.8);
  const smu = k => SURF_MU[k] * (1 + (SURF_MU_WET[k] - 1) * wetK);
  const muFL = smu(sf[0]), muFR = smu(sf[1]), muRL = smu(sf[2]), muRR = smu(sf[3]);
  const surfF = (muFL + muFR) * 0.5, surfR = (muRL + muRR) * 0.5;
  car.offCount = (sf[0] > 1) + (sf[1] > 1) + (sf[2] > 1) + (sf[3] > 1);

  // --- 空力 ---
  const q = 0.5 * RHO * car.vx * car.vx;
  const draft = car.draft;
  const dfF = S.cla * S.front * q * (1 - 0.75 * car.dmgF) * (1 - 0.22 * draft);
  const dfR = S.cla * (1 - S.front) * q * (1 - 0.6 * car.dmgR) * (1 - 0.08 * draft);
  const drag = S.cda * q * (1 + 0.3 * car.dmgF + 0.3 * car.dmgR) * (1 - 0.34 * draft) * Math.sign(car.vx);

  // --- 輪荷重 ---
  const slope = T.slope[ci];
  const zdd = (T.slope[(ci + 3) % T.N] - T.slope[(ci - 3 + T.N) % T.N]) / (6 * T.ds);
  const gEff = G + clamp(car.vx * car.vx * zdd, -3, 3);
  const trans = m * car.ax * CAR.cgh / L;
  let fzF = Math.max(50, m * gEff * b / L + dfF - trans);
  let fzR = Math.max(50, m * gEff * a / L + dfR + trans);
  car.fzF = fzF; car.fzR = fzR;

  // --- タイヤ摩擦係数 ---
  const base = tyreBaseMu(ty, wet) * car.gripK * (1 - 0.25 * car.dmgS);
  const ls = fz => 1 - 0.085 * clamp(fz / 3600 - 1, -0.5, 2.2); // 荷重感度
  const latLoss = 1 - 0.035 * Math.min(1, Math.abs(car.ay) / 25);  // 左右荷重移動による損失(簡易)
  const muF = base * tyreGripFactor(ty, car.tempF, car.wearF) * surfF * ls(fzF) * latLoss;
  const muR = base * 1.12 * tyreGripFactor(ty, car.tempR, car.wearR) * surfR * ls(fzR) * latLoss; // 後輪は幅広タイヤ
  car.mu = (muF + muR) * 0.5;

  // --- パワートレイン ---
  let gear = car.gear;
  let ratio = car.ratios[gear];
  let engaged = true, Te = 0;
  if (car.shiftT > 0) {
    car.shiftT -= dt; engaged = false;
    if (car.shiftT <= 0) { car.gear = gear = car.nextGear; ratio = car.ratios[gear]; }
  }
  const wheelRpm = car.wR * ratio * 60 / TAU;
  let rpm = wheelRpm;
  car.limiter = false;
  if (engaged) {
    if (wheelRpm < 3900) {
      // 半クラッチ域 (発進・極低速)
      engaged = false;
      rpm = Math.max(wheelRpm, CAR.idle + thr * 5200);
      Te = thr > 0.01 ? thr * engineTorque(rpm) * car.power * (0.55 + 0.45 * sat(wheelRpm / 3900)) : 0;
    } else if (wheelRpm > CAR.revLimit) {
      Te = -engineBrake(wheelRpm); car.limiter = true;
    } else {
      Te = thr * engineTorque(wheelRpm) * car.power * (1 - 0.2 * car.dmgR * 0) - (1 - thr) * engineBrake(wheelRpm);
    }
  } else {
    rpm = Math.max(CAR.idle, car.rpm + (Math.abs(car.wR * car.ratios[car.nextGear] * 60 / TAU) - car.rpm) * Math.min(1, dt * 30));
  }
  rpm = Math.abs(rpm);

  // --- スリップ計算 ---
  // 前軸 (操舵輪)
  const vxf = car.vx, vyf = car.vy + a * car.r;
  const vLongF = vxf * cd + vyf * sd, vLatF = -vxf * sd + vyf * cd;
  const vrefF = Math.max(Math.abs(vLongF), 2.2);
  let kF = (car.wF * rw - vLongF) / vrefF;
  const taF = vLatF / vrefF;
  // 後軸
  const vLongR = car.vx, vLatR = car.vy - b * car.r;
  const vrefR = Math.max(Math.abs(vLongR), 2.2);
  let kR = (car.wR * rw - vLongR) / vrefR;
  const taR = vLatR / vrefR;

  // アシスト (TC / ABS)
  // 横滑りが大きいほど前後方向に使える余力は小さいので、しきい値を下げる
  const roomF = Math.max(0.3, 1 - Math.abs(taF / APEAK_F) * 0.75), roomR = Math.max(0.3, 1 - Math.abs(taR / APEAK_R) * 0.75);
  if (car.assistTC && Te > 0) { const th = 0.07 * roomR; if (kR > th) Te *= sat(1 - (kR - th) / 0.08); }
  let brkF = brk * CAR.brakeForceMax * CAR.brakeBias * rw;
  let brkR = brk * CAR.brakeForceMax * (1 - CAR.brakeBias) * rw;
  if (car.assistABS) {
    const tf = 0.085 * roomF, tr = 0.08 * roomR;
    if (kF < -tf) brkF *= sat(1 - (-kF - tf) / 0.06);
    if (kR < -tr) { brkR *= sat(1 - (-kR - tr) / 0.06); if (Te < 0 && engaged) Te *= sat(1 - (-kR - tr) / 0.03); } // エンブレも抜く(ヒール&トウ相当)
  }

  // 複合スリップ → 力
  const sxF = kF / KPEAK, syF = taF / APEAK_F;
  const rhoF = Math.hypot(sxF, syF) + 1e-6;
  const FF = muF * fzF * Math.sin(SH_C * Math.atan(SH_B * rhoF));
  const FxF = FF * sxF / rhoF, FyF = -FF * syF / rhoF;
  const sxR = kR / KPEAK, syR = taR / APEAK_R;
  const rhoR = Math.hypot(sxR, syR) + 1e-6;
  const FR = muR * fzR * Math.sin(SH_C * Math.atan(SH_B * rhoR));
  const FxR = FR * sxR / rhoR, FyR = -FR * syR / rhoR;
  car.kF = kF; car.kR = kR; car.slipF = rhoF; car.slipR = rhoR; car.saF = taF; car.saR = taR;

  // --- 車輪の回転 (半陰解法) ---
  const stiffF = muF * fzF * (SH_B * SH_C / KPEAK) / (1 + 2.2 * rhoF * rhoF);
  const stiffR = muR * fzR * (SH_B * SH_C / KPEAK) / (1 + 2.2 * rhoR * rhoR);
  const rollF = SURF_DRAG[sf[0]] + SURF_DRAG[sf[1]], rollR = SURF_DRAG[sf[2]] + SURF_DRAG[sf[3]];
  {
    const I = CAR.iwF, den = I + dt * rw * rw * stiffF / vrefF;
    let w = car.wF + dt * (-FxF * rw) / den;
    const db = brkF * dt / den;
    if (Math.abs(w) <= db) w = 0; else w -= Math.sign(w) * db;
    car.wF = w;
    car.lockedF = w === 0 && Math.abs(vLongF) > 4;
  }
  {
    const I = CAR.iwR + (engaged ? CAR.ie * ratio * ratio : 0), den = I + dt * rw * rw * stiffR / vrefR;
    const Td = Te * ratio * CAR.eff;
    let w = car.wR + dt * (Td - FxR * rw) / den;
    const db = brkR * dt / den;
    if (Math.abs(w) <= db) w = 0; else w -= Math.sign(w) * db;
    car.wR = w;
  }
  car.rpm = engaged ? Math.abs(car.wR * ratio * 60 / TAU) : rpm;

  // --- 車体に働く力 ---
  const rollRes = (rollF * fzF + rollR * fzR) * 0.5;
  const vsgn = Math.abs(car.vx) > 0.3 ? Math.sign(car.vx) : car.vx / 0.3;
  const hx = T.tx[ci], hy = T.ty[ci];
  const gx = -m * G * slope * (cosr * hx + sinr * hy), gy = -m * G * slope * (-sinr * hx + cosr * hy);
  let Fx = FxF * cd - FyF * sd + FxR - drag - rollRes * vsgn + gx;
  let Fy = FxF * sd + FyF * cd + FyR + gy;
  // 路面による横方向の引きずり抵抗 (グラベル/芝で横滑りも減速)
  if (car.offCount) Fy -= clamp(car.vy, -1, 1) * rollRes * 0.8;
  // 左右で路面が異なる時のヨーモーメント
  const splitF = (muFR - muFL) / (muFR + muFL + 1e-6), splitR = (muRR - muRL) / (muRR + muRL + 1e-6);
  let Mz = a * (FxF * sd + FyF * cd) - b * FyR - ht * (FxF * cd * splitF + FxR * splitR);
  Mz -= (SURF_DRAG[sf[1]] + SURF_DRAG[sf[3]] - SURF_DRAG[sf[0]] - SURF_DRAG[sf[2]]) * (fzF + fzR) * 0.25 * ht * vsgn;

  const axB = Fx / m, ayB = Fy / m;
  car.ax += (axB - car.ax) * Math.min(1, dt * 18);
  car.ay += (ayB - car.ay) * Math.min(1, dt * 18);
  car.vx += (axB + car.r * car.vy) * dt;
  car.vy += (ayB - car.r * car.vx) * dt;
  car.r += (Mz / Iz) * dt;

  // 停止保持
  car.stopped = false;
  if (v < 0.6 && thr < 0.03 && (brk > 0.05 || v < 0.25)) {
    car.vx *= 0.8; car.vy *= 0.5; car.r *= 0.5;
    if (v < 0.25) { car.vx = 0; car.vy = 0; car.r = 0; car.wF = 0; car.wR = 0; car.stopped = true; }
  }

  // --- 位置更新 ---
  const c2 = Math.cos(car.yaw), s2 = Math.sin(car.yaw);
  car.x += (car.vx * c2 - car.vy * s2) * dt;
  car.y += (car.vx * s2 + car.vy * c2) * dt;
  car.yaw += car.r * dt;

  // --- コース座標 / バリア衝突 ---
  T.locate(car.x, car.y, car.fi, _loc, 7);
  car.fi = _loc.fi; car.i = _loc.i; car.s = _loc.s; car.d = _loc.d;
  car.relH = Math.atan2(Math.sin(car.yaw - T.hdg[car.i]), Math.cos(car.yaw - T.hdg[car.i]));
  car.hit = 0;
  const HW = 0.95;
  const lim = car.d > 0 ? T.wallR[car.i] - HW : T.wallL[car.i] - HW;
  if (Math.abs(car.d) > lim) {
    const side = car.d > 0 ? 1 : -1;
    const wnx = T.nx[car.i] * side, wny = T.ny[car.i] * side; // 外向き法線
    const c3 = Math.cos(car.yaw), s3 = Math.sin(car.yaw);
    let wvx = car.vx * c3 - car.vy * s3, wvy = car.vx * s3 + car.vy * c3;
    const vn = wvx * wnx + wvy * wny;
    const pen = Math.abs(car.d) - lim;
    car.x -= wnx * pen; car.y -= wny * pen; car.d -= side * pen;
    if (vn > 0) {
      const tyreWall = side > 0 ? T.tyreR[car.i] : T.tyreL[car.i];
      const e = tyreWall ? 0.08 : 0.22;
      wvx -= (1 + e) * vn * wnx; wvy -= (1 + e) * vn * wny;
      const fr = 1 - Math.min(0.55, vn * (tyreWall ? 0.09 : 0.05));
      const tx = -wny, ty2 = wnx, vt = (wvx * tx + wvy * ty2) * fr, vn2 = wvx * wnx + wvy * wny;
      wvx = tx * vt + wnx * vn2; wvy = ty2 * vt + wny * vn2;
      car.vx = wvx * c3 + wvy * s3; car.vy = -wvx * s3 + wvy * c3;
      // 壁に沿う向きへ回す
      const nose = c3 * wnx + s3 * wny; // +: ノーズが壁向き
      const cross = c3 * wny - s3 * wnx;
      car.r = car.r * 0.4 - Math.sign(cross || 1) * Math.min(2.5, vn * 0.22) * (nose >= 0 ? 1 : -1);
      car.wF = car.wR = car.vx / rw;
      car.hit = vn; car.hitSide = nose > 0.35 ? 1 : nose < -0.35 ? -1 : 0;
      if (vn > 2.2 && !env.noDamage) {
        const dm = (vn - 2.2) / (tyreWall ? 30 : 21);
        if (car.hitSide > 0) { car.dmgF = Math.min(1, car.dmgF + dm); car.dmgS = Math.min(1, car.dmgS + dm * 0.35); }
        else if (car.hitSide < 0) { car.dmgR = Math.min(1, car.dmgR + dm); car.dmgS = Math.min(1, car.dmgS + dm * 0.3); }
        else { car.dmgS = Math.min(1, car.dmgS + dm * 0.8); car.dmgF = Math.min(1, car.dmgF + dm * 0.3); }
        car.pull = clamp(car.pull + (Math.random() - 0.5) * dm * 3, -1, 1) * (car.dmgS > 0.05 ? 1 : 0);
        if (car.dmgF + car.dmgR + car.dmgS * 1.2 >= 1.9 || car.dmgS >= 1) car.retired = true;
      }
    }
  }

  // --- タイヤ温度と摩耗 ---
  const amb = env.ambient ?? 24;
  const pF = Math.abs(FxF * (car.wF * rw - vLongF)) + Math.abs(FyF * vLatF);
  const pR = Math.abs(FxR * (car.wR * rw - vLongR)) + Math.abs(FyR * vLatR);
  const cool = (26 + 1.25 * v) * (1 + 1.6 * wetK);
  const CAP = 1500;
  const hF = Math.min(pF, 150000) * HEAT_K + fzF * v * 0.0035, hR = Math.min(pR, 150000) * HEAT_K + fzR * v * 0.0035;
  car.tempF += (hF - cool * (car.tempF - amb)) / CAP * dt;
  car.tempR += (hR - cool * 1.5 * (car.tempR - amb)) / (CAP * 1.3) * dt;
  if (!env.noWear) {
    const wk = ty.wear * (ty.id === 'rain' ? (1.6 - 1.25 * wetK) : 1) * 1e-6;
    const oh = t => 1 + Math.max(0, t - ty.opt - 12) * 0.035;
    car.wearF = Math.min(1, car.wearF + wk * Math.min(pF, 60000) * oh(car.tempF) * dt * (car.lockedF ? 1.3 : 1));
    car.wearR = Math.min(1, car.wearR + wk * 0.75 * Math.min(pR, 60000) * oh(car.tempR) * dt);
  }
  // --- 燃料 ---
  if (!env.noFuel && thr > 0 && car.fuel > 0) car.fuel = Math.max(0, car.fuel - CAR.fuelRate * thr * sat(rpm / 12800) * dt);
}

// 車同士の衝突 (各車 3 円で近似)。衝撃の強さを返す。
const CIRC = [1.35, 0, -1.35], CR = 0.98;
export function collideCars(A, B, noDamage) {
  const dx0 = B.x - A.x, dy0 = B.y - A.y;
  if (dx0 * dx0 + dy0 * dy0 > 36) return 0;
  const ca = Math.cos(A.yaw), sa = Math.sin(A.yaw), cb = Math.cos(B.yaw), sb = Math.sin(B.yaw);
  let best = 0, bnx = 0, bny = 0, bax = 0, bay = 0, bbx = 0, bby = 0;
  for (let i = 0; i < 3; i++) {
    const ax = A.x + ca * CIRC[i], ay = A.y + sa * CIRC[i];
    for (let j = 0; j < 3; j++) {
      const bx = B.x + cb * CIRC[j], by = B.y + sb * CIRC[j];
      const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy), pen = 2 * CR - d;
      if (pen > best) { best = pen; const inv = 1 / (d || 1); bnx = dx * inv; bny = dy * inv; bax = ax; bay = ay; bbx = bx; bby = by; }
    }
  }
  if (best <= 0) return 0;
  // めり込み解消
  A.x -= bnx * best * 0.5; A.y -= bny * best * 0.5; B.x += bnx * best * 0.5; B.y += bny * best * 0.5;
  // ワールド速度
  const avx = A.vx * ca - A.vy * sa, avy = A.vx * sa + A.vy * ca;
  const bvx = B.vx * cb - B.vy * sb, bvy = B.vx * sb + B.vy * cb;
  const rax = bax - A.x, ray = bay - A.y, rbx = bbx - B.x, rby = bby - B.y;
  const pax = avx - A.r * ray, pay = avy + A.r * rax, pbx = bvx - B.r * rby, pby = bvy + B.r * rbx;
  const vn = (pbx - pax) * bnx + (pby - pay) * bny;
  if (vn >= 0) return 0;
  const mA = totalMass(A), mB = totalMass(B), iA = mA * CAR.izK, iB = mB * CAR.izK;
  const ra = rax * bny - ray * bnx, rb = rbx * bny - rby * bnx;
  const jn = -(1 + 0.25) * vn / (1 / mA + 1 / mB + ra * ra / iA + rb * rb / iB);
  const ix = bnx * jn, iy = bny * jn;
  const a2x = avx - ix / mA, a2y = avy - iy / mA, b2x = bvx + ix / mB, b2y = bvy + iy / mB;
  A.r -= ra * jn / iA * 0.35; B.r += rb * jn / iB * 0.35;
  A.vx = a2x * ca + a2y * sa; A.vy = -a2x * sa + a2y * ca;
  B.vx = b2x * cb + b2y * sb; B.vy = -b2x * sb + b2y * cb;
  const imp = -vn;
  if (imp > 4.5 && !noDamage) {
    const dm = (imp - 4.5) / 40;
    const fa = (bax - A.x) * ca + (bay - A.y) * sa, fb = (bbx - B.x) * cb + (bby - B.y) * sb;
    const apply = (c, f) => {
      if (f > 0.6) c.dmgF = Math.min(1, c.dmgF + dm); else if (f < -0.6) c.dmgR = Math.min(1, c.dmgR + dm * 0.8); else c.dmgS = Math.min(1, c.dmgS + dm * 0.6);
      if (c.dmgF + c.dmgR + c.dmgS * 1.2 >= 1.9 || c.dmgS >= 1) c.retired = true;
    };
    apply(A, fa); apply(B, fb);
  }
  return imp;
}
