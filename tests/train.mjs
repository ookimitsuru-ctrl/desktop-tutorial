// トレーニングモードの検証:  node tests/train.mjs [区間index]
import { buildTrack } from '../src/track.js';
import { computeRacingLine, speedProfile } from '../src/ai.js';
import { Session, fmtTime } from '../src/race.js';
import { buildReference, TRAIN_SECTIONS } from '../src/trainer.js';
import { tyreBaseMu, totalMass } from '../src/physics.js';
const T = buildTrack(), line = computeRacingLine(T), N = T.N;
let t0 = performance.now();
const ref = buildReference(T, line, { setup: 'mid', tyre: 'soft', wet: 0 });
console.log('お手本ラップ', fmtTime(ref.lapTime), '生成', (performance.now() - t0).toFixed(0), 'ms', 'ghost', ref.pose.x.length);
const follow = (lead, margin, gain = 0.5) => (c, prof) => { const i = (c.i + Math.round(lead / T.ds)) % N, e = prof[i] * margin - c.vx; let thr = e > 0 ? Math.min(1, 0.15 + e * gain) : 0, brk = e < -1 ? Math.min(1, -e * 0.12) : 0; if (c.gear <= 2) thr = Math.min(thr, 0.55); if (c.kR > 0.12) thr *= 0.4; return [thr, brk]; };
export function runTrain(secIdx, pedal, { name = '', verbose = true } = {}) {
  const S = new Session(T, line, { mode: 'train', laps: 0, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: false, assist: false, reference: ref, trainSection: secIdx });
  const pl = S.player, c = pl.car, tr = S.trainer; c.autoShift = true;
  const prof = speedProfile(T, line, { mu: tyreBaseMu(c.tyre, 0), use: 0.94, cla: c.setup.cla, cda: c.setup.cda, mass: totalMass(c), power: 1, brake: 0.8 });
  let n = 0, cues = [];
  while (!tr.report && n < 60 * 400) { const [thr, brk] = pedal(c, prof, S); S.playerInput.throttle = thr; S.playerInput.brake = brk; S.tick(1 / 60); n++; if (tr.cue && (!cues.length || cues[cues.length - 1] !== tr.cue.text)) cues.push(tr.cue.text); S.events.length = 0; }
  const r = tr.report;
  if (verbose) {
    console.log(`\n[${TRAIN_SECTIONS[secIdx].name}] ${name}: ★${r.stars} score ${r.score} 差 ${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)}s ${r.aborted ? '(中断)' : ''}`);
    for (const a of r.advice) console.log('  助言:', a.text);
    console.log('  ライブ:', cues.slice(0, 8).join(' / '));
  }
  return r;
}
if ((process.argv[1] || "").endsWith("train.mjs")) {
  const sec = Number(process.argv[2] || 1);
  runTrain(sec, follow(10, 0.95), { name: '上手い人' });
  runTrain(sec, follow(25, 0.85), { name: '慎重な人' });
  runTrain(sec, follow(0, 1.0), { name: 'ブレーキが遅い人' });
  runTrain(sec, (c, prof) => { const e = prof[(c.i + 8) % N] * 0.95 - c.vx; return e > 0 ? [1, 0] : e < -2 ? [0, 1] : [0, 0]; }, { name: '雑な人' });
}
