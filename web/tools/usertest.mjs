// 人間っぽい操作をするボットでユーザーチームを動かし、難易度ごとのバランスを確認する
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT, PITCH } from '../src/config.js';
const games = +(process.argv[2] || 3);
const diffs = (process.argv[3] || 'easy,normal,hard').split(',');
for (const diff of diffs) {
  let gf = 0, ga = 0, sf = 0, sa = 0, w = 0, d = 0, l = 0;
  for (let g = 0; g < games; g++) {
    const home = TEAMS[0];
    const away = TEAMS[1 + (g % 3)];
    const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 180, userTeam: 0, difficulty: diff, noReplay: true }, seed: 500 + g * 13 });
    m.start();
    let actT = 0;
    for (let s = 0; s < 180 * 2 * 60 * 2 && m.phase !== 'fulltime'; s++) {
      if (m.phase === 'halftime') m.startSecondHalf();
      actT -= SIM_DT;
      const team = m.teams[0];
      const c = m.user.controlled;
      const b = m.ball;
      if (m.phase === 'kickoff' && m.sp?.team === team && m.phaseT > 2) m.userAction('pass');
      if (m.phase === 'setpiece' && m.sp?.team === team && m.sp.ready && actT <= 0) { m.userAction(Math.random() < 0.5 ? 'pass' : 'lob'); actT = 1; }
      if (m.phase === 'play' && c) {
        const dir = team.dir;
        if (b.owner === c) {
          const gx = dir * PITCH.HL;
          const dx = gx - c.x;
          const dz = -c.z * 0.4;
          const l = Math.hypot(dx, dz);
          let nd = 99;
          for (const o of m.teams[1].players) nd = Math.min(nd, Math.hypot(o.x - c.x, o.z - c.z));
          m.setUserInput(dx / l, dz / l, 1, nd > 3);
          const dist = Math.hypot(gx - c.x, c.z);
          if (actT <= 0 && !c.busy) {
            if (dist < 21) { m.userAction('shoot', { power: 0.55 + Math.random() * 0.3 }); actT = 0.8; }
            else if (nd < 2.2 && Math.random() < 0.5) { m.setUserInput(dir, (Math.random() - 0.5), 1, false); m.userAction(Math.random() < 0.7 ? 'pass' : 'through'); actT = 0.6; }
          }
        } else if (!b.owner || b.owner.team !== team) {
          const tx = b.owner ? b.owner.x : b.x;
          const tz = b.owner ? b.owner.z : b.z;
          const dx = tx - c.x;
          const dz = tz - c.z;
          const l = Math.hypot(dx, dz) || 1;
          m.setUserInput(dx / l, dz / l, 1, l > 5);
          if (b.owner && l < 1.6 && actT <= 0) { m.userAction(Math.random() < 0.85 ? 'through' : 'shoot'); actT = 0.7; }
        } else m.setUserInput(0, 0, 0, false);
      }
      m.step(SIM_DT);
      m.drainEvents();
    }
    const [a, bb] = m.teams;
    gf += a.score; ga += bb.score; sf += a.stats.shots; sa += bb.stats.shots;
    if (a.score > bb.score) w++; else if (a.score === bb.score) d++; else l++;
    console.log(`  ${diff} ${a.data.id} ${a.score}-${bb.score} ${bb.data.id}  shots ${a.stats.shots}(${a.stats.onTarget})-${bb.stats.shots}(${bb.stats.onTarget}) pos ${(a.stats.possession / (a.stats.possession + bb.stats.possession) * 100).toFixed(0)}% fouls ${a.stats.fouls}-${bb.stats.fouls}`);
  }
  console.log(`${diff}: W${w} D${d} L${l}  goals ${gf}-${ga}  shots ${sf}-${sa}`);
}
