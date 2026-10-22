// ユーザーボット相手に、AIの攻撃がどこまで進んでどう終わるかを集計
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT, PITCH } from '../src/config.js';
const diff = process.argv[2] || 'normal';
const agg = { possessions: 0, maxAx: [0, 0, 0, 0, 0], ends: {}, aiDecisions: {}, len: 0 };
for (let g = 0; g < 3; g++) {
  const home = TEAMS[0], away = TEAMS[1 + g];
  const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 180, userTeam: 0, difficulty: diff, noReplay: true }, seed: 77 + g });
  const ex = m.teams[1].ai.execute.bind(m.teams[1].ai);
  m.teams[1].ai.execute = (p, c) => { agg.aiDecisions[c.kind] = (agg.aiDecisions[c.kind] || 0) + 1; return ex(p, c); };
  m.start();
  let actT = 0, poss = null;
  for (let s = 0; s < 180 * 2 * 60 * 2 && m.phase !== 'fulltime'; s++) {
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
    for (const e of m.drainEvents()) {
      if (e.type === 'possession') {
        if (poss && poss.team === 1 && e.team === 0) {
          const lk = m.ball.lastKick;
          const cause = lk && m.time - lk.time < 2.5 && lk.player.team.index === 1 ? `after-${lk.kind}` : 'tackled';
          agg.ends[cause] = (agg.ends[cause] || 0) + 1;
          const bucket = Math.min(4, Math.max(0, Math.floor((poss.maxAx + 52.5) / 21)));
          agg.maxAx[bucket]++;
          agg.len += m.time - poss.t0;
        }
        if (!poss || poss.team !== e.team) { poss = { team: e.team, maxAx: -99, t0: m.time }; if (e.team === 1) agg.possessions++; }
      }
      if (e.type === 'shot' && e.player.team.index === 1) agg.ends.shot = (agg.ends.shot || 0) + 1;
      if (e.type === 'out' && poss?.team === 1) {
        agg.ends[`out-${e.kind}`] = (agg.ends[`out-${e.kind}`] || 0) + 1;
        const lt = m.ball.lastTouch; const lk = m.ball.lastKick;
        const key = `${e.kind}:${lt?.team.index}:${lk && lk.player === lt ? lk.kind : 'other'}:${lt?.state}`;
        agg.outs = agg.outs || {}; agg.outs[key] = (agg.outs[key] || 0) + 1;
      }
    }
    if (poss && poss.team === 1 && b.owner) poss.maxAx = Math.max(poss.maxAx, b.x * m.teams[1].dir);
  }
}
agg.len = (agg.len / agg.possessions).toFixed(1);
console.log(JSON.stringify(agg));
