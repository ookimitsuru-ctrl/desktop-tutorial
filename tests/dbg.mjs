import { buildTrack } from '../src/track.js';
import { computeRacingLine } from '../src/ai.js';
const T = buildTrack(); const line = computeRacingLine(T);
const a = Number(process.argv[2]), b = Number(process.argv[3]);
for (let s = a; s < b; s += 6) { const i = T.idx(s); console.log(s, 'kc', (T.curv[i]*1000).toFixed(1), 'kl', (line.curv[i]*1000).toFixed(1), 'd', line.off[i].toFixed(2), 'lo', line.lo[i].toFixed(1), 'hi', line.hi[i].toFixed(1)); }
