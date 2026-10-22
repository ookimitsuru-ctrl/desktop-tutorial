import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';
for (let g = 0; g < 4; g++) {
  const home = TEAMS[g % 4], away = TEAMS[(g + 1) % 4];
  const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 240, userTeam: null, noReplay: true }, seed: 11 + g });
  m.start();
  let shot = null;
  for (let s = 0; s < 240 * 2 * 60 * 2; s++) {
    m.step(SIM_DT);
    for (const e of m.drainEvents()) {
      if (e.type === 'shot') {
        const p = e.player;
        const opp = m.teams[1 - p.team.index];
        const gk = opp.players[0];
        shot = { who: p.name, header: !!e.header, d: Math.hypot(p.team.dir * 52.5 - p.x, p.z).toFixed(1), gk: `${gk.x.toFixed(1)},${gk.z.toFixed(1)} ${gk.state}`, on: e.onTarget, t: m.time };
      } else if (shot && ['goal', 'save', 'out', 'block', 'possession'].includes(e.type)) {
        console.log(`${m.minute}' ${shot.who}${shot.header ? '(H)' : ''} d=${shot.d} on=${shot.on} gk=${shot.gk} -> ${e.type}${e.kind ? ':' + e.kind : ''} ${e.type === 'possession' ? e.player.name : ''} after ${(m.time - shot.t).toFixed(2)}s`);
        shot = null;
      } else if (e.type === 'goal') console.log(`${m.minute}' GOAL (no shot event) by ${e.scorer?.name} og=${e.ownGoal} lastKick=${m.ball.lastKick?.kind}`);
    }
    if (m.phase === 'halftime') m.startSecondHalf();
    if (m.phase === 'fulltime') break;
  }
  console.log('---', m.teams[0].score, m.teams[1].score);
}
