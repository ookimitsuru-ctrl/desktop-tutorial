import { buildTrack } from '../src/track.js';
import { computeRacingLine, Driver } from '../src/ai.js';
import { Session, fmtTime, DRIVERS } from '../src/race.js';
const T = buildTrack(); const line = computeRacingLine(T);
const laps = Number(process.argv[2] || 3), weather = process.argv[3] || 'dry', diff = process.argv[4] || 'hard';
const grid = DRIVERS.map((_, i) => i); // player on pole
const gp = Number(process.argv[5] || 10); grid.splice(0, 1); grid.splice(gp - 1, 0, 0);
const S = new Session(T, line, { mode: 'race', laps, weather, setup: 'mid', tyre: laps <= 6 ? 'soft' : 'medium', difficulty: diff, damage: true, grid });
const pl = S.player; if (S.wet > 0.4) { const { fitTyres } = await import('../src/physics.js'); fitTyres(pl.car, 'rain'); }
const drv = new Driver(pl.car, T, line, { skill: 0.95 });
const t0 = performance.now(); let ticks = 0; const counts = {};
let lastPrint = 0;
while (!S.resultsReady && S.time < laps * 140 + 120) {
  if (!pl.pit && !pl.finished) {
    if (S.state === 'green') { drv.update(1 / 60, S.wet, S.cars, {}); S.playerInput.throttle = pl.car.throttle; S.playerInput.brake = pl.car.brake; S.playerInput.steer = pl.car.steerIn; }
    else { S.playerInput.throttle = 0; S.playerInput.brake = 1; S.playerInput.steer = 0; }
    // プレイヤーのピット判断(テスト用)
    if (Math.max(pl.car.wearF, pl.car.wearR) > 0.7 && S.laps - pl.lap > 1) { pl.pitRequest = true; pl.nextTyre = 'medium'; }
    if (pl.car.tyre.id !== 'rain' && S.wet > 0.5) { pl.pitRequest = true; pl.nextTyre = 'rain'; }
    if (pl.car.tyre.id === 'rain' && S.wet < 0.2) { pl.pitRequest = true; pl.nextTyre = 'medium'; }
  }
  S.tick(1 / 60); ticks++;
  for (const ev of S.events) { counts[ev.type] = (counts[ev.type] || 0) + 1; if (['retire', 'flag', 'weather', 'penalty'].includes(ev.type)) console.log(`[${S.raceTime.toFixed(1)}] ${ev.type} ${ev.e ? ev.e.d.name : ''} ${ev.text || ''} ${ev.rain ?? ''}`); }
  S.events.length = 0;
  if (S.raceTime - lastPrint > 60) { lastPrint = S.raceTime; console.log(`t=${S.raceTime.toFixed(0)} wet=${S.wet.toFixed(2)} order: ${S.order.slice(0, 20).map(e => e.d.short + (e.pit ? '(P)' : '') + (e.out ? 'x' : '')).join(' ')}`); }
}
const ms = performance.now() - t0;
console.log('sim', S.time.toFixed(0), 's in', ms.toFixed(0), 'ms →', (ms / ticks).toFixed(3), 'ms/tick', JSON.stringify(counts));
for (const r of (S.results || [])) console.log(String(r.pos).padStart(2), r.name.padEnd(14), String(r.laps).padStart(2), r.dnf ? 'DNF     ' : fmtTime(r.time), 'best', fmtTime(r.best), 'stops', r.stops, 'dmg', (r.e.car.dmgF + r.e.car.dmgR + r.e.car.dmgS).toFixed(2), r.e.car.tyre.short, 'wear', (Math.max(r.e.car.wearF, r.e.car.wearR) * 100).toFixed(0));
