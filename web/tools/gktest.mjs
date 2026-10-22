// GKのセーブ率テスト: 様々な位置からシュートさせる
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';
const home = TEAMS[0], away = TEAMS[1];
const res = { goal: 0, save: 0, miss: 0, other: 0 };
const detail = {};
for (let i = 0; i < 200; i++) {
  const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 600, userTeam: null, noReplay: true }, seed: 50 + i });
  m.start();
  m.phase = 'play';
  // 攻撃側(JPN dir=+1)のFWをシュート位置へ、他の選手は遠くへ
  const shooter = m.teams[0].players[10];
  for (const p of m.players) { p.x = -30 + (p.index % 5); p.z = -20 + p.index * 3; }
  const gk = m.teams[1].players[0];
  const dist = 8 + (i % 5) * 5;
  const ang = ((i % 7) - 3) * 0.15;
  shooter.x = 52.5 - Math.cos(ang) * dist; shooter.z = Math.sin(ang) * dist;
  gk.x = 51.5; gk.z = shooter.z * 0.05;
  m.ball.place(shooter.x + 0.5, shooter.z);
  m.giveBall(shooter, true);
  const tz = (i % 2 ? 1 : -1) * (1 + (i % 3));
  m.kickShot(shooter, { x: 52.5, y: 0.3 + (i % 4) * 0.5, z: tz }, 0.5 + (i % 3) * 0.25, 0);
  let outcome = 'other';
  for (let s = 0; s < 240; s++) {
    m.step(SIM_DT);
    for (const e of m.drainEvents()) {
      if (e.type === 'goal') outcome = 'goal';
      if (e.type === 'save') outcome = 'save';
      if (e.type === 'out' && outcome === 'other') outcome = 'miss';
    }
    if (outcome !== 'other') break;
  }
  res[outcome]++;
  const k = `d${dist}`;
  detail[k] = detail[k] || { goal: 0, save: 0, miss: 0, other: 0 };
  detail[k][outcome]++;
}
console.log(res);
console.log(detail);
