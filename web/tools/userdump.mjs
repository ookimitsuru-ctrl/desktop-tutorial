// ユーザーボット戦のスナップショット（tools/simviz.py で可視化）
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT, PITCH } from '../src/config.js';
import { writeFileSync } from 'node:fs';
const [start = 20, dur = 12, every = 0.5, out = 'dump.json'] = process.argv.slice(2);
const home = TEAMS[0], away = TEAMS[1];
const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 180, userTeam: 0, difficulty: 'normal', noReplay: true }, seed: 77 });
m.start();
const frames = []; let evs = []; let actT = 0;
for (let s = 0; s < (+start + +dur) * 60; s++) {
  if (m.phase === 'halftime') m.startSecondHalf();
  actT -= SIM_DT;
  const team = m.teams[0]; const c = m.user.controlled; const b = m.ball;
  if (m.phase === 'kickoff' && m.sp?.team === team && m.phaseT > 2) m.userAction('pass');
  if (m.phase === 'setpiece' && m.sp?.team === team && m.sp.ready && actT <= 0) { m.userAction('pass'); actT = 1; }
  if (m.phase === 'play' && c) {
    if (b.owner === c) {
      const gx = team.dir * PITCH.HL; const dx = gx - c.x, dz = -c.z * 0.4, l = Math.hypot(dx, dz);
      m.setUserInput(dx / l, dz / l, 1, true);
      if (Math.hypot(gx - c.x, c.z) < 21 && actT <= 0) { m.userAction('shoot', { power: 0.7 }); actT = 0.8; }
    } else if (!b.owner || b.owner.team !== team) {
      const tx = b.owner ? b.owner.x : b.x, tz = b.owner ? b.owner.z : b.z;
      const dx = tx - c.x, dz = tz - c.z, l = Math.hypot(dx, dz) || 1;
      m.setUserInput(dx / l, dz / l, 1, l > 5);
      if (b.owner && l < 1.6 && actT <= 0) { m.userAction('through'); actT = 0.7; }
    }
  }
  m.step(SIM_DT);
  for (const e of m.drainEvents()) if (!['bounce', 'setpieceReady', 'kickoffSetup', 'shotfaced', 'whistle', 'switch'].includes(e.type)) evs.push(`${e.type}${e.kind ? ':' + e.kind : ''} ${e.player?.name ?? ''}`);
  if (s >= +start * 60 && s % Math.round(+every * 60) === 0) {
    frames.push({ t: +m.time.toFixed(2), phase: m.phase, ball: [b.x, b.z, b.y], owner: b.owner?.id ?? null, pt: b.passTarget?.id ?? null,
      players: m.players.map((p) => ({ id: p.id, n: p.num, team: p.team.index, x: p.x, z: p.z, f: p.facing, st: p.state, r: p.controlled ? 'U' : p === p.team.ai.presser ? 'P' : p === p.team.ai.cover ? 'C' : p === p.team.ai.chaser ? 'H' : '', tx: p.tx, tz: p.tz })), ev: evs });
    evs = [];
  }
}
writeFileSync(out, JSON.stringify(frames));
console.log('frames', frames.length);
