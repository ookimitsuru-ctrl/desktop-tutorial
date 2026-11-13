import { buildTrack, SECTIONS } from '../src/track.js';
import { computeRacingLine, speedProfile } from '../src/ai.js';
const T = buildTrack(); const line = computeRacingLine(T);
const prof = speedProfile(T, line, { mu: 1.8, use: 0.99, cla: 2.8, cda: 1.2, mass: 595, power: 1 });
let tt = 0; for (let i = 0; i < T.N; i++) tt += T.ds / prof[i];
console.log('ideal profile lap', tt.toFixed(2));
for (const c of SECTIONS) {
  let kc = 0, kl = 0, vmin = 999, rough = 0;
  for (let s = c.from; s < c.to; s += 2) { const i = T.idx(s); if (Math.abs(T.curv[i]) > Math.abs(kc)) kc = T.curv[i]; if (Math.abs(line.curv[i]) > Math.abs(kl)) kl = line.curv[i]; vmin = Math.min(vmin, prof[i]); rough += Math.abs(line.curv[(i + 1) % T.N] - line.curv[i]); }
  console.log(c.name.padEnd(9), 'Rcenter', (1 / kc).toFixed(0).padStart(6), 'Rline', (1 / kl).toFixed(0).padStart(6), 'vmin', (vmin * 3.6).toFixed(0), 'rough', rough.toFixed(3));
}
if (process.argv[2]) { // dump svg
  let p = '', q = '';
  for (let i = 0; i < T.N; i++) { p += `${i ? 'L' : 'M'}${T.x[i].toFixed(1)},${T.y[i].toFixed(1)}`; q += `${i ? 'L' : 'M'}${line.x[i].toFixed(1)},${line.y[i].toFixed(1)}`; }
  console.log(p.length, q.length);
}
