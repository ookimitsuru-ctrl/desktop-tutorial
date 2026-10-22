// AIの攻撃がどこで止まっているかを集計する
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT, PITCH } from '../src/config.js';
const agg = { thirds: [0, 0, 0], decisions: {}, losses: {}, entries: 0, boxEntries: 0, shots: 0 };
for (let g = 0; g < 4; g++) {
  const home = TEAMS[g % 4], away = TEAMS[(g + 2) % 4];
  const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 180, userTeam: null, noReplay: true }, seed: 900 + g });
  for (const t of m.teams) { const ex = t.ai.execute.bind(t.ai); t.ai.execute = (p, c) => { agg.decisions[c.kind] = (agg.decisions[c.kind] || 0) + 1; return ex(p, c); }; }
  m.start();
  let lastOwnerTeam = null, inFinal = false, inBox = false;
  for (let s = 0; s < 180 * 2 * 60 * 2 && m.phase !== 'fulltime'; s++) {
    if (m.phase === 'halftime') m.startSecondHalf();
    m.step(SIM_DT);
    const b = m.ball;
    if (b.owner) {
      const t = b.owner.team; const ax = b.x * t.dir;
      agg.thirds[ax < -17.5 ? 0 : ax < 17.5 ? 1 : 2] += SIM_DT;
      if (ax > 17.5 && !inFinal) { agg.entries++; inFinal = true; }
      if (ax < 10) inFinal = false;
      const inB = ax > PITCH.HL - PITCH.boxDepth && Math.abs(b.z) < PITCH.boxHalfW;
      if (inB && !inBox) { agg.boxEntries++; inBox = true; }
      if (!inB) inBox = false;
    }
    for (const e of m.drainEvents()) {
      if (e.type === 'possession' && lastOwnerTeam !== null && e.team !== lastOwnerTeam) {
        const lk = m.ball.lastKick;
        const cause = lk && m.time - lk.time < 3 ? `after-${lk.kind}` : 'tackle/dribble';
        agg.losses[cause] = (agg.losses[cause] || 0) + 1;
      }
      if (e.type === 'possession') lastOwnerTeam = e.team;
      if (e.type === 'shot') agg.shots++;
    }
  }
}
console.log(JSON.stringify(agg, null, 1));
