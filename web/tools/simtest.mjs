// AI同士の試合をヘッドレスで回して、スコアやスタッツが妥当かを確認する
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';

const N = +(process.argv[2] || 4);
const halfLength = +(process.argv[3] || 240);
const verbose = process.argv.includes('-v');
let totalGoals = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const home = TEAMS[i % 4];
  const away = TEAMS[(i + 1 + Math.floor(i / 4)) % 4];
  const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength, userTeam: null, noReplay: true }, seed: 100 + i });
  m.start();
  let steps = 0;
  let lastPhase = m.phase;
  let phaseSince = 0;
  const counts = {};
  const maxSteps = halfLength * 2 * 60 * 3;
  while (m.phase !== 'fulltime' && steps < maxSteps) {
    m.step(SIM_DT);
    steps++;
    if (m.phase === 'halftime') m.startSecondHalf();
    for (const e of m.drainEvents()) {
      counts[e.type] = (counts[e.type] || 0) + 1;
      if (verbose && (e.type === 'goal' || e.type === 'offside' || e.type === 'foul' || e.type === 'card')) {
        console.log(`  ${e.type} ${e.type === 'goal' ? `${m.teams[e.team].data.id} ${e.scorer?.name} ${e.minute}' ${e.ownGoal ? '(OG)' : ''} assist=${e.assist?.name ?? '-'}` : e.player?.name ?? e.fouler?.name ?? ''}`);
      }
    }
    if (m.phase !== lastPhase) {
      lastPhase = m.phase;
      phaseSince = steps;
    } else if (steps - phaseSince > 60 * 40 && m.phase !== 'play') {
      console.log(`  STUCK in phase ${m.phase} at ${m.minute}'`, m.sp?.type, m.sp?.ready);
      phaseSince = steps;
    }
  }
  const [a, b] = m.teams;
  const pos = a.stats.possession / (a.stats.possession + b.stats.possession);
  totalGoals += a.score + b.score;
  console.log(`${a.data.id} ${a.score}-${b.score} ${b.data.id}  pos ${(pos * 100).toFixed(0)}%  shots ${a.stats.shots}(${a.stats.onTarget})-${b.stats.shots}(${b.stats.onTarget})  pass ${a.stats.passesOk}/${a.stats.passes} - ${b.stats.passesOk}/${b.stats.passes}  corners ${a.stats.corners}-${b.stats.corners}  fouls ${a.stats.fouls}-${b.stats.fouls}  offs ${a.stats.offsides}-${b.stats.offsides}  saves ${a.stats.saves}-${b.stats.saves}`);
  if (verbose) console.log('  events', JSON.stringify(counts));
}
console.log(`avg goals ${(totalGoals / N).toFixed(2)}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
