// 試合のスナップショットをJSONに書き出す（tools/simviz.py で可視化）
import { Match } from '../src/sim/match.js';
import { TEAMS, chooseKits } from '../src/data/teams.js';
import { SIM_DT } from '../src/config.js';
import { writeFileSync } from 'node:fs';
const [start = 0, dur = 20, every = 0.5, seed = 7, out = 'dump.json'] = process.argv.slice(2);
const home = TEAMS[0], away = TEAMS[1];
const m = new Match({ home, away, kits: chooseKits(home, away), settings: { halfLength: 600, userTeam: null, noReplay: true }, seed: +seed });
m.start();
const frames = [];
let evs = [];
const total = (+start + +dur) * 60;
for (let s = 0; s < total; s++) {
  m.step(SIM_DT);
  if (m.phase === 'halftime') m.startSecondHalf();
  for (const e of m.drainEvents()) if (!['bounce','possession','setpieceReady','kickoffSetup','shotfaced','whistle'].includes(e.type)) evs.push(`${e.type}${e.kind ? ':' + e.kind : ''} ${e.player?.name ?? e.fouler?.name ?? ''}`);
  if (s >= +start * 60 && s % Math.round(+every * 60) === 0) {
    frames.push({
      t: +m.time.toFixed(2), phase: m.phase,
      ball: [m.ball.x, m.ball.z, m.ball.y], owner: m.ball.owner?.id ?? null, pt: m.ball.passTarget?.id ?? null,
      players: m.players.map((p) => ({ id: p.id, n: p.num, team: p.team.index, x: p.x, z: p.z, f: p.facing, st: p.state, r: p === p.team.ai.presser ? 'P' : p === p.team.ai.cover ? 'C' : p === p.team.ai.runner ? 'R' : p === p.team.ai.chaser ? 'H' : '', tx: p.tx, tz: p.tz })),
      ev: evs,
    });
    evs = [];
  }
}
writeFileSync(out, JSON.stringify(frames));
console.log('frames', frames.length);
