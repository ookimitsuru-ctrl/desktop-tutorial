// 決勝のAIのペース確認:  node tests/pace.mjs [周回] [難易度] [タイヤ]
import { buildTrack } from '../src/track.js';
import { computeRacingLine, Driver } from '../src/ai.js';
import { Session, DRIVERS, fmtTime } from '../src/race.js';
const T = buildTrack(), line = computeRacingLine(T);
const laps = Number(process.argv[2] || 5), diff = process.argv[3] || 'normal';
const grid = DRIVERS.map((_, i) => i); grid.splice(0, 1); grid.splice(19, 0, 0);
const S = new Session(T, line, { mode: 'race', laps, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: diff, damage: true, grid });
const pl = S.player, drv = new Driver(pl.car, T, line, { skill: 0.7 }); // プレイヤー車も走らせる (停止車が詰まりの原因になるため)
while (!S.resultsReady && S.time < laps * 160 + 100) {
  if (S.state === 'green' && !pl.pit && !pl.finished) { drv.update(1 / 60, S.wet, S.cars, {}); Object.assign(S.playerInput, { throttle: pl.car.throttle, brake: pl.car.brake, steer: pl.car.steerIn }); } else Object.assign(S.playerInput, { throttle: 0, brake: 1, steer: 0 });
  S.tick(1 / 60); S.events.length = 0; if (S.raceTime > laps * 150) break;
}
// 1周目 (スタンディングスタート) は平均から除く
const rows = S.entries.filter(e => !e.isPlayer).map(e => { const ts = e.lapTimes.slice(1).filter(l => l.valid).map(l => l.t); const srt = ts.slice().sort((a, b) => a - b), avg = srt.length ? srt[srt.length >> 1] : 0; return { n: e.d.short, sk: e.d.skill, best: e.bestLap, avg, laps: e.lapTimes.length }; }).sort((a, b) => a.best - b.best);
for (const r of rows) console.log(r.n.padEnd(4), 'skill', r.sk.toFixed(2), 'best', fmtTime(r.best), 'median', fmtTime(r.avg), 'gap', (r.avg - r.best).toFixed(1), 'laps', r.laps);
const gaps = rows.map(r => r.avg - r.best).sort((a, b) => a - b); console.log('ベスト比の遅れ(中央値-ベスト) 中央値:', gaps[gaps.length >> 1].toFixed(2), '最大:', gaps[gaps.length - 1].toFixed(2));
if (process.argv[4]) for (const n of process.argv[4].split(',')) { const e = S.entries.find(x => x.d.short === n); console.log(n, e.lapTimes.map(l => fmtTime(l.t)).join(' '), 'dmg', (e.car.dmgF + e.car.dmgR + e.car.dmgS).toFixed(2), 'wear', (Math.max(e.car.wearF, e.car.wearR) * 100).toFixed(0)); }
