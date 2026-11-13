// AI単独走行でラップタイムと各種状態を確認する
import { buildTrack, SECTIONS } from '../src/track.js';
import { createCar, stepCar, placeCar, CAR } from '../src/physics.js';
import { computeRacingLine, Driver } from '../src/ai.js';
const T = buildTrack();
let t0 = performance.now();
const line = computeRacingLine(T);
console.log('line ms', (performance.now() - t0).toFixed(0));
export function runLaps({ setup = 'mid', tyre = 'soft', skill = 1, wet = 0, laps = 3, fuel = 15, verbose = false, power = 1 }) {
  const car = createCar({ setup, tyre, power }); car.fuel = fuel;
  if (tyre === 'rain') { car.tempF = car.tempR = 55; }
  const drv = new Driver(car, T, line, { skill });
  placeCar(car, T, T.length - 300, line.off[T.idx(T.length - 300)], 50);
  const env = { track: T, wet, noDamage: false };
  const DT = 1 / 240; let t = 0, lapStart = -1, lap = -1, prevS = car.s; const times = [];
  let vmaxSec = {}, vminSec = {}, off = 0, maxT = 0;
  const f0 = []; 
  while (times.length < laps && t < 600) {
    drv.update(1 / 60, wet, null, null);
    for (let k = 0; k < 4; k++) { stepCar(car, DT, env); t += DT;
      if (prevS > T.length - 50 && car.s < 50) { if (lapStart >= 0) { times.push(t - lapStart); f0.push({ fuel: car.fuel.toFixed(2), wF: (car.wearF * 100).toFixed(1), wR: (car.wearR * 100).toFixed(1), tF: car.tempF.toFixed(0), tR: car.tempR.toFixed(0) }); } lapStart = t; lap++; }
      prevS = car.s; }
    if (car.offCount >= 3) off += 1 / 60;
    if (lap >= 1) { const sec = T.sectionAt(car.s); if (sec) { const k = sec.name; vmaxSec[k] = Math.max(vmaxSec[k] || 0, car.vx * 3.6); vminSec[k] = Math.min(vminSec[k] ?? 999, car.vx * 3.6); } }
    if (car.retired) { console.log('RETIRED at', car.s.toFixed(0)); break; }
  }
  if (verbose) { for (const c of SECTIONS) if (vmaxSec[c.name]) console.log(c.name.padEnd(9), 'min', vminSec[c.name].toFixed(0).padStart(4), 'max', vmaxSec[c.name].toFixed(0).padStart(4)); }
  const fmt = x => `${Math.floor(x / 60)}:${(x % 60).toFixed(3).padStart(6, '0')}`;
  console.log(`${setup}/${tyre}/skill${skill}/wet${wet}:`, times.map(fmt).join('  '), 'offSec', off.toFixed(1), JSON.stringify(f0[f0.length - 1]), 'dmg', (car.dmgF + car.dmgR + car.dmgS).toFixed(2));
  return times;
}
if ((process.argv[1] || '').endsWith('lap.mjs')) {
  runLaps({ verbose: true });
}
