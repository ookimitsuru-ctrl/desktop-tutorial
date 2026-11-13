import { buildTrack, SECTIONS } from '../src/track.js';
const t0 = performance.now();
const T = buildTrack();
console.log('build ms', (performance.now() - t0).toFixed(0), 'N', T.N, 'ds', T.ds.toFixed(4));
let L = 0; for (let i = 0; i < T.N; i++) { const j = (i + 1) % T.N; L += Math.hypot(T.x[j] - T.x[i], T.y[j] - T.y[i]); }
console.log('length', L.toFixed(2), 'turnTotal(deg)', (T.turnTotal * 180 / Math.PI).toFixed(1));
console.log('cross', T.cross && { sLo: T.cross.sLo.toFixed(0), sHi: T.cross.sHi.toFixed(0), dz: (T.z[T.cross.hi] - T.z[T.cross.lo]).toFixed(1) });
let wmin = 99, wmax = 0, smax = 0; for (let i = 0; i < T.N; i++) { const w = T.wl[i] + T.wr[i]; wmin = Math.min(wmin, w); wmax = Math.max(wmax, w); smax = Math.max(smax, Math.abs(T.slope[i])); }
console.log('width', wmin.toFixed(2), wmax.toFixed(2), 'max slope %', (smax * 100).toFixed(1));
for (const c of SECTIONS) {
  let kmax = 0; for (let s = c.from; s < c.to; s += 2) { const k = T.curv[T.idx(s)]; if (Math.abs(k) > Math.abs(kmax)) kmax = k; }
  const i = T.idx((c.from + c.to) / 2);
  console.log(c.name.padEnd(10), String(c.from).padStart(5), 'Rmin', kmax ? (1 / kmax).toFixed(0).padStart(6) : '-', kmax > 0 ? '右' : '左', 'z', T.z[i].toFixed(1), 'wallL', T.wallL[i].toFixed(1), 'wallR', T.wallR[i].toFixed(1));
}
// locate round trip
const o = {}, p = {};
let err = 0;
for (let s = 0; s < T.length; s += 37.3) { for (const d of [-4, 0, 3.5]) { T.pos(s, d, p); T.locate(p.x, p.y, s / T.ds + 3, o); err = Math.max(err, Math.abs(T.sDiff(o.s, s)), Math.abs(o.d - d)); } }
console.log('locate max err', err.toFixed(3));
if (Math.abs(L - 5807) > 1 || err > 0.4 || !T.cross) { console.error('TRACK TEST FAILED'); process.exit(1); }
