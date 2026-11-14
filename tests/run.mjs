// 画面なしで実行できる自動テスト:  npm test
import { buildTrack } from '../src/track.js';
import { computeRacingLine, Driver } from '../src/ai.js';
import { createCar, stepCar, placeCar, fitTyres } from '../src/physics.js';
import { Session, DRIVERS } from '../src/race.js';
let fail = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${info}`); if (!ok) fail++; };
const T = buildTrack(), line = computeRacingLine(T);

// --- コース ---
let L = 0; for (let i = 0; i < T.N; i++) { const j = (i + 1) % T.N; L += Math.hypot(T.x[j] - T.x[i], T.y[j] - T.y[i]); }
check('コース全長 5807m', Math.abs(L - 5807) < 1, L.toFixed(1));
let zmin = 1e9, zmax = -1e9, wmin = 99, wmax = 0; for (let i = 0; i < T.N; i++) { zmin = Math.min(zmin, T.z[i]); zmax = Math.max(zmax, T.z[i]); const w = T.wl[i] + T.wr[i]; wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); }
check('高低差 約52m', Math.abs(zmax - zmin - 52) < 0.5, (zmax - zmin).toFixed(1));
check('幅員 10〜16m', wmin >= 9.99 && wmax <= 16.01, `${wmin.toFixed(1)}〜${wmax.toFixed(1)}`);
check('立体交差あり (上下差 5m以上)', !!T.cross && T.z[T.cross.hi] - T.z[T.cross.lo] > 5);
let turn = 0; for (let i = 0; i < T.N; i++) turn += T.curv[i] * T.ds;
check('8の字レイアウト (総旋回角 ≒ 0)', Math.abs(turn) < 0.2, turn.toFixed(3));

// --- 車両 ---
function solo({ tyre = 'soft', wet = 0, assist = true, laps = 1 }) {
  const car = createCar({ setup: 'mid', tyre }); car.fuel = 12; fitTyres(car, tyre);
  const drv = new Driver(car, T, line, { skill: 1 }); drv.errT = 1e9; if (!assist) car.assistTC = car.assistABS = false;
  placeCar(car, T, T.length - 470, line.off[T.idx(T.length - 470)], 46);
  const env = { track: T, wet, noFuel: true }; let t = 0, prev = car.s, start = -1, best = 1e9, n = 0, off = 0, vmax = 0;
  while (n < laps && t < 300) { drv.update(1 / 60, wet, null, null); for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; if (prev > T.length - 50 && car.s < 50) { if (start >= 0) { best = Math.min(best, t - start); n++; } start = t; } prev = car.s; } if (car.offCount >= 3) off += 1 / 60; vmax = Math.max(vmax, car.vx * 3.6); }
  return { best, off, vmax };
}
const dry = solo({}), na = solo({ assist: false }), rain = solo({ tyre: 'rain', wet: 0.9 });
check('ドライのラップタイムが 1分38秒〜1分48秒', dry.best > 98 && dry.best < 108 && dry.off === 0, dry.best.toFixed(2));
check('最高速 280〜320km/h', dry.vmax > 280 && dry.vmax < 320, dry.vmax.toFixed(0));
check('ABS/TCS 無しでもコースアウトせず周回できる', na.best < 110 && na.off === 0, na.best.toFixed(2));
check('ウェットはドライより大幅に遅い', rain.best > dry.best * 1.15 && rain.best < 150, rain.best.toFixed(2));

// --- 決勝 (3周・20台) ---
const grid = DRIVERS.map((_, i) => i); grid.splice(0, 1); grid.splice(9, 0, 0);
const S = new Session(T, line, { mode: 'race', laps: 3, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: true, grid });
const pl = S.player, drv = new Driver(pl.car, T, line, { skill: 0.9 });
while (!S.resultsReady && S.time < 600) {
  if (S.state === 'green' && !pl.pit && !pl.finished) { drv.update(1 / 60, S.wet, S.cars, {}); Object.assign(S.playerInput, { throttle: pl.car.throttle, brake: pl.car.brake, steer: pl.car.steerIn }); }
  else Object.assign(S.playerInput, { throttle: 0, brake: 1, steer: 0 });
  S.tick(1 / 60); S.events.length = 0;
}
check('決勝が完走して結果が出る', S.resultsReady && S.results.length === 20);
const dnf = S.results.filter(r => r.dnf).length;
check('リタイアが多すぎない (4台以下)', dnf <= 4, `${dnf}台`);
check('プレイヤーが3周を完走', !!S.results.find(r => r.player && r.laps === 3 && !r.dnf));
// --- トレーニング ---
{
  const { buildReference, TRAIN_SECTIONS } = await import('../src/trainer.js');
  const { runTrain } = await import('./train.mjs');
  const ref = buildReference(T, line, { setup: 'mid', tyre: 'soft', wet: 0 });
  check('お手本ラップが生成される (1:38〜1:48)', ref.lapTime > 98 && ref.lapTime < 108 && ref.pose.x.length > 6000, ref.lapTime.toFixed(2));
  let ok = true; for (let i = 0; i < T.N; i++) if (!ref.vis[i]) ok = false;
  check('お手本が全区間を記録している', ok);
  const good = runTrain(1, (c, prof) => { const k = (c.i + 5) % T.N, e = prof[k] * 0.95 - c.vx; let th = e > 0 ? Math.min(1, 0.15 + e * 0.5) : 0, br = e < -1 ? Math.min(1, -e * 0.12) : 0; if (c.gear <= 2) th = Math.min(th, 0.55); if (c.kR > 0.12) th *= 0.4; return [th, br]; }, { verbose: false });
  const bad = runTrain(1, (c, prof) => [1, 0], { verbose: false });
  check('区間の講評が出る (評価・差・助言)', good.stars >= 1 && good.advice.length >= 1 && Number.isFinite(good.delta), `★${good.stars} ${good.delta.toFixed(2)}s`);
  check('アクセル全開のままだと中断または低評価になる', bad.aborted || bad.stars <= good.stars, bad.aborted ? '中断' : `★${bad.stars}`);
  check('練習区間が定義されている (全周+8区間)', TRAIN_SECTIONS.length === 9);
}
console.log(fail ? `\n${fail} 件失敗` : '\nすべて成功');
process.exit(fail ? 1 : 0);
