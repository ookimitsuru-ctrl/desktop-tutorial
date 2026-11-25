// オリジナル版 (架空サーキット) の自動テスト:  node tests/original.mjs
import { buildTrack } from '../src/track.js';
import { computeRacingLine, Driver } from '../src/ai.js';
import { createCar, stepCar, placeCar, fitTyres } from '../src/physics.js';
import { Session, DRIVERS } from '../src/race.js';
import { buildReference } from '../src/trainer.js';
import { TRACKS } from '../src/variants/original/tracks.js';
import * as COURSES from '../src/variants/original/data/courses.js';
let fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fail++; };

for (const [id, def] of Object.entries(TRACKS)) {
  const C = COURSES[id.toUpperCase()], T = buildTrack(def), line = computeRacingLine(T), nm = def.name;
  // --- コースの形 ---
  let L = 0; for (let i = 0; i < T.N; i++) { const j = (i + 1) % T.N; L += Math.hypot(T.x[j] - T.x[i], T.y[j] - T.y[i]); }
  check(`${nm}: 全長が定義と一致`, Math.abs(L - def.length) < 1, L.toFixed(1));
  let turn = 0; for (let i = 0; i < T.N; i++) turn += T.curv[i] * T.ds;
  check(`${nm}: ${C.dir > 0 ? '右' : '左'}回りの1周 (総旋回角 ≒ ${C.dir * 360}°)`, Math.abs(turn - C.dir * 2 * Math.PI) < 0.1, (turn * 180 / Math.PI).toFixed(1));
  check(`${nm}: 立体交差なし`, !T.cross);
  // 自分自身と近づきすぎていない (コース上で 300m 以上離れた区間どうしが 100m 以上離れている)
  let sep = 1e9; for (let i = 0; i < T.N; i += 3) for (let j = i + 3; j < T.N; j += 3) { const ds = Math.min(j - i, T.N - (j - i)) * T.ds; if (ds < 300) continue; sep = Math.min(sep, Math.hypot(T.x[i] - T.x[j], T.y[i] - T.y[j])); }
  check(`${nm}: 離れた区間どうしの間隔 70m 以上`, sep >= 70, sep.toFixed(0) + 'm');
  // ピットの建物側 (ピットレーン区間でピット側 110m 以内) に他の区間がない
  let clash = 0; const P = T.pit;
  for (let i = 0; i < T.N; i++) { const s = i * T.ds; if (!P.contains(s)) continue; const nx = T.nx[i] * P.side, ny = T.ny[i] * P.side;
    for (let j = 0; j < T.N; j += 2) { const ds = Math.min(Math.abs(j - i), T.N - Math.abs(j - i)) * T.ds; if (ds < 400) continue; const dx = T.x[j] - T.x[i], dy = T.y[j] - T.y[i], lat = dx * nx + dy * ny, lon = Math.abs(dx * T.tx[i] + dy * T.ty[i]); if (lat > 0 && lat < 110 && lon < 40) clash++; } }
  check(`${nm}: ピットの建物の場所に他の区間がない`, clash === 0, `${clash}`);
  // --- AI 単独ラップ ---
  const car = createCar({ setup: 'mid', tyre: 'soft', trim: def.aero }); car.fuel = 12; fitTyres(car, 'soft');
  const drv = new Driver(car, T, line, { skill: 1 }); drv.errT = 1e9;
  placeCar(car, T, T.length - 300, line.off[T.idx(T.length - 300)], 50);
  const env = { track: T, wet: 0, noFuel: true }; let t = 0, prev = car.s, st = -1, best = 1e9, n = 0, off = 0;
  while (n < 2 && t < 400) { drv.update(1 / 60, 0, null, null); for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; if (prev > T.length - 50 && car.s < 50) { if (st >= 0) { best = Math.min(best, t - st); n++; } st = t; } prev = car.s; } if (car.offCount >= 3) off++; }
  check(`${nm}: AIがコースアウトせず周回 (想定 ${def.baseLap}s ±3s)`, Math.abs(best - def.baseLap) < 3 && off === 0, best.toFixed(2));
  // --- 決勝 3 周 (20台) ---
  const g = DRIVERS.map((_, i) => i); g.splice(0, 1); g.splice(9, 0, 0);
  const S2 = new Session(T, line, { mode: 'race', laps: 3, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: true, grid: g });
  const p2 = S2.player, d2 = new Driver(p2.car, T, line, { skill: 0.9 });
  while (!S2.resultsReady && S2.time < 600) {
    if (S2.state === 'green' && !p2.pit && !p2.finished) { d2.update(1 / 60, S2.wet, S2.cars, {}); Object.assign(S2.playerInput, { throttle: p2.car.throttle, brake: p2.car.brake, steer: p2.car.steerIn }); }
    else Object.assign(S2.playerInput, { throttle: 0, brake: 1, steer: 0 });
    S2.tick(1 / 60); S2.events.length = 0;
  }
  const dnf = (S2.results || []).filter(r => r.dnf).length;
  check(`${nm}: 決勝が完走して結果が出る`, S2.resultsReady && S2.results.length === 20 && dnf <= 4, `リタイア ${dnf}台`);
  // --- ピットイン → タイヤ交換 → コースへ戻る ---
  const S3 = new Session(T, line, { mode: 'free', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false });
  const p3 = S3.player, d3 = new Driver(p3.car, T, line, { skill: 0.8 }); p3.pitRequest = true; p3.nextTyre = 'hard'; let pitted = false, exited = false, dmax = 0;
  while (S3.time < 300 && !exited) {
    if (S3.state === 'green' && !p3.pit) { const toPit = T.sDiff(T.pit.sEntry, p3.car.s); d3.update(1 / 60, 0, S3.cars, toPit > 0 && toPit < 260 ? { keepRight: true, vmax: 70 } : {}); Object.assign(S3.playerInput, { throttle: p3.car.throttle, brake: p3.car.brake }); }
    S3.tick(1 / 60); if (p3.pit) { pitted = true; } else if (pitted) exited = true; S3.events.length = 0;
  }
  check(`${nm}: ピットイン (${P.side > 0 ? '右' : '左'}側) してタイヤ交換し、コースへ戻る`, pitted && exited && p3.car.tyre.id === 'hard' && p3.car.offCount < 3, `s=${p3.car.s.toFixed(0)}`);
  // --- トレーニング ---
  const rf = buildReference(T, line, { setup: 'mid', tyre: 'soft', wet: 0 });
  const S4 = new Session(T, line, { mode: 'train', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false, reference: rf, trainSection: 1 });
  const okSec = def.train.slice(1).every(x => x.n0 >= 0 && x.n1 <= T.length && x.n1 > x.n0 + 150);
  check(`${nm}: お手本ラップと練習区間 (全周+${def.train.length - 1}区間)`, Math.abs(rf.lapTime - def.baseLap) < 4 && S4.trainer.prepared.length === def.train.length && okSec, `${rf.lapTime.toFixed(2)}s`);
}
console.log(fail ? `\n${fail} 件失敗` : '\nすべて成功');
process.exitCode = fail ? 1 : 0;
