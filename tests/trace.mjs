import { buildTrack } from '../src/track.js';
import { createCar, stepCar, placeCar } from '../src/physics.js';
import { computeRacingLine, Driver } from '../src/ai.js';
const T = buildTrack(); const line = computeRacingLine(T);
const car = createCar({ setup: 'mid', tyre: process.argv[6] || 'soft' }); car.fuel = 15;
const drv = new Driver(car, T, line, { skill: 1 });
const s0 = Number(process.argv[2] ?? T.length - 300), dur = Number(process.argv[3] ?? 20), step = Number(process.argv[4] ?? 0.5);
placeCar(car, T, s0, line.off[T.idx(s0)], Number(process.argv[5] ?? 50));
const env = { track: T, wet: 0 };
let t = 0, nx = 0;
while (t < dur) {
  drv.update(1 / 60, 0, null, null);
  for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; }
  if (t >= nx) { nx += step; console.log(`t${t.toFixed(1)} s${car.s.toFixed(0)} d${car.d.toFixed(1)} L${line.off[car.i].toFixed(1)} v${(car.vx * 3.6).toFixed(0)} vt${(drv.profile[car.i] * 3.6).toFixed(0)} vy${car.vy.toFixed(1)} g${car.gear} rpm${car.rpm.toFixed(0)} thr${car.throttle.toFixed(2)} brk${car.brake.toFixed(2)} st${car.steerIn.toFixed(2)} ay${(car.ay / 9.81).toFixed(1)} kR${car.kR.toFixed(2)} tF${car.tempF.toFixed(0)} tR${car.tempR.toFixed(0)} off${car.offCount}`); }
}
