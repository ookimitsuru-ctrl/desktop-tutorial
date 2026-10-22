import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';
const home = TEAMS[0], away = TEAMS[1];
const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 300, userTeam: null, noReplay: true }, seed: 3 });
m.start();
const res = {};
let pend = null;
const add = (k) => (res[k] = (res[k] || 0) + 1);
for (let s = 0; s < 300 * 60; s++) {
  m.step(SIM_DT);
  for (const e of m.drainEvents()) {
    if (e.type === 'kick' && ['pass', 'through', 'lob', 'cross'].includes(e.kind)) {
      if (pend) add(pend.kind + ':unresolved');
      const b = m.ball;
      pend = { kind: e.kind, team: e.player.team, target: b.passTarget, from: [e.player.x, e.player.z], t: m.time, d: b.passTarget ? Math.hypot(b.passTarget.x - e.player.x, b.passTarget.z - e.player.z) : -1 };
    } else if (pend && e.type === 'possession') {
      const ok = e.player.team === pend.team;
      add(`${pend.kind}:${ok ? (e.player === pend.target ? 'ok' : 'ok-other') : 'lost'}`);
      if (!ok && process.argv[2]) console.log(`${pend.kind} lost d=${pend.d.toFixed(1)} after ${(m.time - pend.t).toFixed(2)}s at (${m.ball.x.toFixed(1)},${m.ball.z.toFixed(1)}) by ${e.player.name}`);
      pend = null;
    } else if (pend && (e.type === 'out' || e.type === 'tackle' || e.type === 'header' || e.type === 'block' || e.type === 'offside')) {
      if (e.type === 'header' || e.type === 'block') { add(`${pend.kind}:${e.type}`); pend = null; }
      else if (e.type === 'out') { add(`${pend.kind}:out`); pend = null; }
    }
  }
  if (m.phase === 'halftime') m.startSecondHalf();
  if (m.phase === 'fulltime') break;
}
console.log(res);
