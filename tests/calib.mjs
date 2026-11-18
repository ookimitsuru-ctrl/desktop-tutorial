// 予選想定タイムの式と、AI の実走タイムを突き合わせる / アシスト無しでの走行可否を確認する
import { buildTrack } from '../src/track.js';
import { createCar, stepCar, placeCar, fitTyres } from '../src/physics.js';
import { computeRacingLine, Driver } from '../src/ai.js';
import { DRIVERS, TEAMS, DIFFICULTY, estimateQualiTime, fmtTime } from '../src/race.js';
const T = buildTrack(), line = computeRacingLine(T);
function lap({ skill, power = 1, gripK = 1, tyre = 'soft', wet = 0, assist = true, fuel = 12, laps = 2 }) {
  const car = createCar({ setup: 'mid', tyre, power, gripK }); car.fuel = fuel; fitTyres(car, tyre);
  const drv = new Driver(car, T, line, { skill }); drv.errT = 1e9;
  if (!assist) { car.assistTC = false; car.assistABS = false; }
  placeCar(car, T, T.length - 470, line.off[T.idx(T.length - 470)], 46);
  const env = { track: T, wet, noFuel: true }; let t = 0, prev = car.s, start = -1, best = 1e9, n = 0, off = 0, lock = 0, spin = 0;
  while (n < laps && t < 400) { drv.update(1 / 60, wet, null, null); for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; if (prev > T.length - 50 && car.s < 50) { if (start >= 0) { best = Math.min(best, t - start); n++; } start = t; } prev = car.s; }
    if (car.offCount >= 3) off += 1 / 60; if (car.lockedF) lock += 1 / 60; if (car.kR > 0.3) spin += 1 / 60; if (car.retired) break; }
  return { best, off, lock, spin, retired: car.retired };
}
const mode = process.argv[2] || 'quali';
if (mode === 'quali') {
  for (const diff of ['hard', 'normal', 'easy']) { const D = DIFFICULTY[diff]; let err = 0, n = 0;
    for (const d of DRIVERS.filter((d, i) => !d.player && i % 3 === 2)) { const tm = TEAMS[d.team]; const sk = Math.max(0, Math.min(1, d.skill + D.skill));
      const r = lap({ skill: sk, power: tm.power * D.power, gripK: tm.grip * D.grip }); const est = estimateQualiTime(d, tm, diff, 0);
      console.log(diff, d.short, 'real', fmtTime(r.best), 'est', fmtTime(est), 'diff', (est - r.best).toFixed(2)); err += est - r.best; n++; }
    console.log(diff, 'mean err', (err / n).toFixed(2)); }
  for (const wet of [0.38, 0.9]) { const d = DRIVERS[2], tm = TEAMS[d.team]; const r = lap({ skill: 1, power: tm.power, gripK: tm.grip, tyre: 'rain', wet }); console.log('wet', wet, 'real', fmtTime(r.best), 'est', fmtTime(estimateQualiTime(d, tm, 'hard', wet))); }
} else {
  for (const a of [true, false]) for (const skill of [1, 0.7]) { const r = lap({ skill, assist: a }); console.log('assist', a, 'skill', skill, fmtTime(r.best), 'off', r.off.toFixed(1), 'lockSec', r.lock.toFixed(1), 'spinSec', r.spin.toFixed(1), r.retired ? 'RETIRED' : ''); }
  for (const wet of [0.9]) { const r = lap({ skill: 0.7, assist: false, tyre: 'rain', wet }); console.log('wet noassist', fmtTime(r.best), 'off', r.off.toFixed(1), 'lock', r.lock.toFixed(1), 'spin', r.spin.toFixed(1), r.retired ? 'RETIRED' : ''); }
}
