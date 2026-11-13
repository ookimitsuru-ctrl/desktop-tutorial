// 設定・記録・ゴーストの保存 (localStorage)
const KEY = 'okracing.v1';

export const DEFAULT_SETTINGS = {
  steerMode: 'tilt',      // tilt: 傾きセンサー / thumb: 親指シーソー
  steerSens: 1.0,         // 感度
  steerDead: 2,           // デッドゾーン [度]
  maxLock: 1.0,           // 最大操舵角 (倍率)
  tiltInvert: false,
  pedalDir: 'out',        // out: 外側へスライドで増加 / in: 内側へ
  pedalRelease: 'zero',   // zero: 指を離すと0 / hold: 保持
  paddleLayout: 'cross',  // cross: 左=UP 右=DOWN / std: 左=DOWN 右=UP
  autoShift: false,
  assist: false,          // TC + ABS (初心者向け)
  camera: 'up',           // up / right / north
  zoom: 'normal',
  lineAssist: true,
  ghost: true,
  damage: true,
  difficulty: 'normal',
  volume: 0.8,
  quality: 'high',
  showBoard: true,
};

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; }
}
let db = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* 容量超過などは無視 */ } }

export const Store = {
  settings() { return Object.assign({}, DEFAULT_SETTINGS, db.settings || {}); },
  saveSettings(s) { db.settings = s; save(); },
  last() { return Object.assign({ setup: 'mid', tyre: 'soft', weather: 'dry', laps: 5, gridMode: 'quali' }, db.last || {}); },
  saveLast(l) { db.last = l; save(); },
  records() { return db.records || (db.records = { laps: [], best: {}, sectors: {}, races: [] }); },
  // ラップ記録を追加。新記録なら true
  addLap(rec) {
    const R = this.records(), cls = rec.wet ? 'wet' : 'dry';
    R.laps.push(rec); R.laps.sort((a, b) => a.time - b.time); if (R.laps.length > 30) R.laps.length = 30;
    let isBest = false;
    if (!R.best[cls] || rec.time < R.best[cls].time) { R.best[cls] = rec; isBest = true; }
    save(); return isBest;
  },
  bestLap(wet) { const R = this.records(); return R.best[wet ? 'wet' : 'dry'] || null; },
  addSector(k, time, wet) {
    const R = this.records(), cls = wet ? 'wet' : 'dry'; R.sectors[cls] = R.sectors[cls] || [null, null, null];
    if (R.sectors[cls][k] == null || time < R.sectors[cls][k]) { R.sectors[cls][k] = time; save(); return true; }
    return false;
  },
  addRace(r) { const R = this.records(); R.races.unshift(r); if (R.races.length > 12) R.races.length = 12; save(); },
  quali() { return db.quali || null; },
  saveQuali(q) { db.quali = q; save(); },
  clearRecords() { db.records = { laps: [], best: {}, sectors: {}, races: [] }; db.quali = null; try { localStorage.removeItem(KEY + '.ghost.dry'); localStorage.removeItem(KEY + '.ghost.wet'); } catch (e) { /* 無視 */ } save(); },

  // ---- ゴースト ----
  saveGhost(g, wet) {
    try {
      const n = g.x.length, a = new Int16Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = Math.round(g.x[i] * 8); a[i * 3 + 1] = Math.round(g.y[i] * 8); a[i * 3 + 2] = Math.round(Math.atan2(Math.sin(g.h[i]), Math.cos(g.h[i])) * 10000); }
      const u8 = new Uint8Array(a.buffer); let bin = ''; for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      localStorage.setItem(KEY + '.ghost.' + (wet ? 'wet' : 'dry'), JSON.stringify({ lap: g.lap, dt: g.dt, n, data: btoa(bin), trace: (g.trace || []).map(v => Math.round(v * 1000) / 1000) }));
    } catch (e) { /* 無視 */ }
  },
  loadGhost(wet) {
    try {
      const raw = localStorage.getItem(KEY + '.ghost.' + (wet ? 'wet' : 'dry')); if (!raw) return null;
      const o = JSON.parse(raw), bin = atob(o.data), u8 = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      const a = new Int16Array(u8.buffer), x = [], y = [], h = [];
      for (let i = 0; i < o.n; i++) { x.push(a[i * 3] / 8); y.push(a[i * 3 + 1] / 8); h.push(a[i * 3 + 2] / 10000); }
      return { lap: o.lap, dt: o.dt, x, y, h, trace: o.trace };
    } catch (e) { return null; }
  },
};
