import { buildTrack } from '../src/track.js';
import { createCar, stepCar, placeCar, requestShift, CAR, fitTyres, SETUPS, applySetup } from '../src/physics.js';
const T = buildTrack();
const env = { track: T, wet: 0, noDamage: true };
const DT = 1 / 240;
// 直線加速 (西ストレート相当の平坦条件にするため slope を無視できる短距離 → メインストレートは下りなので flat な環境を作る)
const flat = { ...T, slope: new Float32Array(T.N) };
flat.locate = T.locate; 
function accelRun(setup, tc) {
  const car = createCar({ setup, tyre: 'soft' }); car.fuel = 20; car.assistTC = tc; car.autoShift = true;
  // 仮想直線: トラック無しで走らせるためメインストレートに置き、位置を毎回戻す
  placeCar(car, T, 5600, 0, 0);
  const e = { track: flat, wet: 0, noDamage: true, noFuel: true };
  let t = 0, t100 = 0, t200 = 0, t300 = 0, vmax = 0;
  for (; t < 40; t += DT) {
    car.throttle = 1; car.brake = 0; car.steerIn = 0;
    stepCar(car, DT, e);
    car.x = T.x[T.idx(5600)]; car.y = T.y[T.idx(5600)]; car.yaw = T.hdg[T.idx(5600)]; car.vy = 0; car.r = 0; car.fi = T.idx(5600);
    const k = car.vx * 3.6;
    if (!t100 && k >= 100) t100 = t; if (!t200 && k >= 200) t200 = t; if (!t300 && k >= 300) t300 = t;
    vmax = Math.max(vmax, k);
  }
  return { setup, tc, t100: t100.toFixed(2), t200: t200.toFixed(2), t300: t300.toFixed(2), vmax: vmax.toFixed(1), gear: car.gear, rpm: car.rpm.toFixed(0), tempR: car.tempR.toFixed(0) };
}
console.log(accelRun('mid', true)); console.log(accelRun('mid', false)); console.log(accelRun('high', true)); console.log(accelRun('low', true));
function brakeRun(v0, pedal, abs) {
  const car = createCar({ setup: 'mid', tyre: 'soft' }); car.fuel = 20; car.assistABS = abs; car.autoShift = true;
  placeCar(car, T, 5600, 0, v0);
  const e = { track: flat, wet: 0, noDamage: true, noFuel: true };
  let t = 0, dist = 0, locked = 0, gmax = 0;
  for (; t < 15 && car.vx > 1; t += DT) {
    car.throttle = 0; car.brake = pedal; car.steerIn = 0;
    stepCar(car, DT, e); dist += car.vx * DT; if (car.lockedF) locked += DT; gmax = Math.max(gmax, -car.ax / 9.81);
    car.x = T.x[T.idx(5600)]; car.y = T.y[T.idx(5600)]; car.yaw = T.hdg[T.idx(5600)]; car.vy = 0; car.r = 0; car.fi = T.idx(5600);
  }
  return { v0: (v0 * 3.6).toFixed(0), pedal, abs, t: t.toFixed(2), dist: dist.toFixed(0), lockedSec: locked.toFixed(2), gmax: gmax.toFixed(2), wearF: car.wearF.toFixed(4) };
}
console.log(brakeRun(83, 1, false)); console.log(brakeRun(83, 1, true)); console.log(brakeRun(83, 0.6, false)); console.log(brakeRun(40, 1, false)); console.log(brakeRun(40, 0.5, false));
