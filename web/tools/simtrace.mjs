import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';
const secs = +(process.argv[2] || 60);
const every = +(process.argv[3] || 2);
const home = TEAMS[0], away = TEAMS[1];
const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 600, userTeam: null, noReplay: true }, seed: 7 });
m.start();
const phaseTime = {};
const decisions = {};
const origExec = m.teams[0].ai.execute;
for (const t of m.teams) {
  const ex = t.ai.execute.bind(t.ai);
  t.ai.execute = (p, c) => { decisions[c.kind] = (decisions[c.kind] || 0) + 1; return ex(p, c); };
}
for (let s = 0; s < secs * 60; s++) {
  m.step(SIM_DT);
  phaseTime[m.phase] = (phaseTime[m.phase] || 0) + SIM_DT;
  for (const e of m.drainEvents()) if (['header','goal','foul','offside','out','setpiece','shot','save'].includes(e.type)) {
    if (e.type === 'header') { if (s % 30 === 0) console.log(`${m.time.toFixed(1)} header ${e.player.name} ball y=${m.ball.y.toFixed(2)} v=(${m.ball.vx.toFixed(1)},${m.ball.vy.toFixed(1)},${m.ball.vz.toFixed(1)})`); }
    else console.log(`${m.time.toFixed(1)} ${e.type} ${e.kind ?? ''} ${e.player?.name ?? ''}`);
  }
  if (s % (every * 60) === 0) {
    const b = m.ball;
    console.log(`t=${m.time.toFixed(1)} ${m.phase} ball(${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}) v=${b.speed.toFixed(1)} owner=${b.owner ? b.owner.team.data.id + ':' + b.owner.name + '[' + b.owner.state + ']' : '-'} pt=${b.passTarget?.name ?? '-'}`);
  }
}
console.log('phaseTime', phaseTime);
console.log('decisions', decisions);
