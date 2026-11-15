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
  const { buildReference } = await import('../src/trainer.js'); const TRAIN_SECTIONS = T.def.train;
  const { runTrain } = await import('./train.mjs');
  const ref = buildReference(T, line, { setup: 'mid', tyre: 'soft', wet: 0 });
  check('お手本ラップが生成される (1:38〜1:48)', ref.lapTime > 98 && ref.lapTime < 108 && ref.pose.x.length > 6000, ref.lapTime.toFixed(2));
  let ok = true; for (let i = 0; i < T.N; i++) if (!(ref.v[i] > 5 && ref.v[i] < 100 && ref.gear[i] >= 1 && Number.isFinite(ref.t[i]))) ok = false;
  check('お手本が全区間で有効な値を持つ (補間は5点以内)', ok && ref.filled <= 5, `補間 ${ref.filled}点`);
  const good = runTrain(1, (c, prof) => { const k = (c.i + 5) % T.N, e = prof[k] * 0.95 - c.vx; let th = e > 0 ? Math.min(1, 0.15 + e * 0.5) : 0, br = e < -1 ? Math.min(1, -e * 0.12) : 0; if (c.gear <= 2) th = Math.min(th, 0.55); if (c.kR > 0.12) th *= 0.4; return [th, br]; }, { verbose: false });
  const bad = runTrain(1, (c, prof) => [1, 0], { verbose: false });
  check('区間の講評が出る (評価・差・助言)', good.stars >= 1 && good.advice.length >= 1 && Number.isFinite(good.delta), `★${good.stars} ${good.delta.toFixed(2)}s`);
  check('アクセル全開のままだと中断または低評価になる', bad.aborted || bad.stars <= good.stars, bad.aborted ? '中断' : `★${bad.stars}`);
  check('練習区間が定義されている (全周+8区間)', TRAIN_SECTIONS.length === 9);
}
// --- 富士スピードウェイ ---
{
  const { TRACKS } = await import('../src/tracks.js');
  const F = buildTrack(TRACKS.fuji), fl = computeRacingLine(F);
  let FL = 0; for (let i = 0; i < F.N; i++) { const j = (i + 1) % F.N; FL += Math.hypot(F.x[j] - F.x[i], F.y[j] - F.y[i]); }
  check('富士: コース全長 4563m', Math.abs(FL - 4563) < 1, FL.toFixed(1));
  let fmin = 99, fmax = 0, up = 0, dn = 0; for (let i = 0; i < F.N; i++) { const w = F.wl[i] + F.wr[i]; fmin = Math.min(fmin, w); fmax = Math.max(fmax, w); up = Math.max(up, F.slope[i]); dn = Math.min(dn, F.slope[i]); }
  check('富士: 幅員 15〜25m', fmin >= 14.99 && fmax <= 25.01, `${fmin.toFixed(1)}〜${fmax.toFixed(1)}`);
  check('富士: 最大勾配が上り7〜10%・下り8〜11%', up > 0.07 && up < 0.10 && dn < -0.08 && dn > -0.11, `+${(up * 100).toFixed(1)}% / ${(dn * 100).toFixed(1)}%`);
  let ft = 0; for (let i = 0; i < F.N; i++) ft += F.curv[i] * F.ds;
  check('富士: 時計回りの1周 (総旋回角 ≒ 360°)', Math.abs(ft - 2 * Math.PI) < 0.1, (ft * 180 / Math.PI).toFixed(1));
  check('富士: 立体交差なし', !F.cross);
  // AI単独ラップ
  const car = createCar({ setup: 'mid', tyre: 'soft' }); car.fuel = 12; fitTyres(car, 'soft');
  const drv = new Driver(car, F, fl, { skill: 1 }); drv.errT = 1e9;
  placeCar(car, F, F.length - 470, fl.off[F.idx(F.length - 470)], 46);
  const env = { track: F, wet: 0, noFuel: true }; let t = 0, prev = car.s, st = -1, best = 1e9, n = 0, off = 0;
  while (n < 2 && t < 300) { drv.update(1 / 60, 0, null, null); for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; if (prev > F.length - 50 && car.s < 50) { if (st >= 0) { best = Math.min(best, t - st); n++; } st = t; } prev = car.s; } if (car.offCount >= 3) off += 1 / 60; }
  check('富士: AIがコースアウトせず周回 (1:15〜1:30)', best > 75 && best < 90 && off === 0, best.toFixed(2));
  // 決勝 3周
  const g2 = DRIVERS.map((_, i) => i); g2.splice(0, 1); g2.splice(9, 0, 0);
  const S2 = new Session(F, fl, { mode: 'race', laps: 3, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: true, grid: g2 });
  const p2 = S2.player, d2 = new Driver(p2.car, F, fl, { skill: 0.9 });
  while (!S2.resultsReady && S2.time < 500) {
    if (S2.state === 'green' && !p2.pit && !p2.finished) { d2.update(1 / 60, S2.wet, S2.cars, {}); Object.assign(S2.playerInput, { throttle: p2.car.throttle, brake: p2.car.brake, steer: p2.car.steerIn }); }
    else Object.assign(S2.playerInput, { throttle: 0, brake: 1, steer: 0 });
    S2.tick(1 / 60); S2.events.length = 0;
  }
  const dnf2 = (S2.results || []).filter(r => r.dnf).length;
  check('富士: 決勝が完走して結果が出る', S2.resultsReady && S2.results.length === 20 && dnf2 <= 4, `リタイア ${dnf2}台`);
  // ピットイン→作業→ピットアウト
  const S3 = new Session(F, fl, { mode: 'free', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false });
  const p3 = S3.player, d3 = new Driver(p3.car, F, fl, { skill: 0.8 }); p3.pitRequest = true; p3.nextTyre = 'hard'; let pitted = false, exited = false;
  while (S3.time < 200 && !exited) {
    if (S3.state === 'green' && !p3.pit) { d3.update(1 / 60, 0, S3.cars, {}); Object.assign(S3.playerInput, { throttle: p3.car.throttle, brake: p3.car.brake }); }
    S3.tick(1 / 60); if (p3.pit) pitted = true; else if (pitted) exited = true; S3.events.length = 0;
  }
  check('富士: ピットインしてタイヤ交換し、コースへ戻る', pitted && exited && p3.car.tyre.id === 'hard' && p3.car.offCount < 3, `s=${p3.car.s.toFixed(0)}`);
  // トレーニング
  const { buildReference } = await import('../src/trainer.js');
  const rf = buildReference(F, fl, { setup: 'mid', tyre: 'soft', wet: 0 });
  let zones = 0; const S4 = new Session(F, fl, { mode: 'train', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false, reference: rf, trainSection: 1 });
  for (const pp of S4.trainer.prepared) zones += pp.zones.length;
  check('富士: お手本ラップと練習区間 (全周+8区間)', rf.lapTime > 75 && rf.lapTime < 90 && F.def.train.length === 9 && zones >= 6, `${rf.lapTime.toFixed(2)}s ゾーン${zones}`);
}
// --- インディ (オーバル・反時計回り・ピットは左) ---
{
  const { TRACKS } = await import('../src/tracks.js');
  const I = buildTrack(TRACKS.indy), il = computeRacingLine(I);
  let IL = 0; for (let i = 0; i < I.N; i++) { const j = (i + 1) % I.N; IL += Math.hypot(I.x[j] - I.x[i], I.y[j] - I.y[i]); }
  check('インディ: コース全長 4023m', Math.abs(IL - 4023) < 1, IL.toFixed(1));
  let it = 0, kmax = 0; for (let i = 0; i < I.N; i++) { it += I.curv[i] * I.ds; kmax = Math.max(kmax, Math.abs(I.curv[i])); }
  check('インディ: 反時計回りの1周 (総旋回角 ≒ -360°)', Math.abs(it + 2 * Math.PI) < 0.1, (it * 180 / Math.PI).toFixed(1));
  check('インディ: ターン半径 ≒ 256m', 1 / kmax > 245 && 1 / kmax < 265, (1 / kmax).toFixed(0));
  check('インディ: ピットレーンは左側 (内側)', I.pit.side === -1 && I.pit.dAt(3700) < -(I.wl[I.idx(3700)] + 5), I.pit.dAt(3700).toFixed(1));
  const car = createCar({ setup: 'mid', tyre: 'soft' }); car.fuel = 12; fitTyres(car, 'soft');
  const drv = new Driver(car, I, il, { skill: 1 }); drv.errT = 1e9;
  placeCar(car, I, I.length - 470, il.off[I.idx(I.length - 470)], 46);
  const env = { track: I, wet: 0, noFuel: true }; let t = 0, prev = car.s, st = -1, best = 1e9, n = 0, off = 0;
  while (n < 2 && t < 300) { drv.update(1 / 60, 0, null, null); for (let k = 0; k < 4; k++) { stepCar(car, 1 / 240, env); t += 1 / 240; if (prev > I.length - 50 && car.s < 50) { if (st >= 0) { best = Math.min(best, t - st); n++; } st = t; } prev = car.s; } if (car.offCount >= 3) off++; }
  check('インディ: AIがコースアウトせず周回 (44〜52秒)', best > 44 && best < 52 && off === 0, best.toFixed(2));
  const g2 = DRIVERS.map((_, i) => i); g2.splice(0, 1); g2.splice(9, 0, 0);
  const S2 = new Session(I, il, { mode: 'race', laps: 4, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: true, grid: g2 });
  const p2 = S2.player, d2 = new Driver(p2.car, I, il, { skill: 0.9 });
  while (!S2.resultsReady && S2.time < 500) {
    if (S2.state === 'green' && !p2.pit && !p2.finished) { d2.update(1 / 60, S2.wet, S2.cars, {}); Object.assign(S2.playerInput, { throttle: p2.car.throttle, brake: p2.car.brake, steer: p2.car.steerIn }); }
    else Object.assign(S2.playerInput, { throttle: 0, brake: 1, steer: 0 });
    S2.tick(1 / 60); S2.events.length = 0;
  }
  const dnf2 = (S2.results || []).filter(r => r.dnf).length;
  check('インディ: 決勝が完走して結果が出る', S2.resultsReady && S2.results.length === 20 && dnf2 <= 4, `リタイア ${dnf2}台`);
  const S3 = new Session(I, il, { mode: 'free', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false });
  const p3 = S3.player, d3 = new Driver(p3.car, I, il, { skill: 0.8 }); p3.pitRequest = true; p3.nextTyre = 'hard'; let pitted = false, exited = false, dmin = 0;
  while (S3.time < 200 && !exited) {
    if (S3.state === 'green' && !p3.pit) { d3.update(1 / 60, 0, S3.cars, { keepRight: true, vmax: 70 }); Object.assign(S3.playerInput, { throttle: p3.car.throttle, brake: p3.car.brake }); }
    S3.tick(1 / 60); if (p3.pit) { pitted = true; dmin = Math.min(dmin, p3.car.d); } else if (pitted) exited = true; S3.events.length = 0;
  }
  for (let k = 0; k < 300; k++) { d3.update(1 / 60, 0, S3.cars, {}); Object.assign(S3.playerInput, { throttle: p3.car.throttle, brake: p3.car.brake }); S3.tick(1 / 60); }
  check('インディ: 左側のピットでタイヤ交換し、コースへ戻る', pitted && exited && p3.car.tyre.id === 'hard' && p3.car.offCount < 3, `s=${p3.car.s.toFixed(0)}`);
  const { buildReference } = await import('../src/trainer.js');
  const rf = buildReference(I, il, { setup: 'mid', tyre: 'soft', wet: 0 });
  const S4 = new Session(I, il, { mode: 'train', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false, reference: rf, trainSection: 1 });
  for (let k = 0; k < 600; k++) { Object.assign(S4.playerInput, { throttle: 1, brake: 0 }); S4.tick(1 / 60); S4.events.length = 0; }
  check('インディ: お手本ラップと練習区間 (全周+2区間)', rf.lapTime > 44 && rf.lapTime < 52 && I.def.train.length === 3 && S4.trainer.prepared.length === 3, `${rf.lapTime.toFixed(2)}s`);
}
console.log(fail ? `\n${fail} 件失敗` : '\nすべて成功');
process.exit(fail ? 1 : 0);
