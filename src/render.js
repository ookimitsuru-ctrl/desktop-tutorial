// ワールド描画: コース・周辺施設・車両・エフェクト・天候
import { drawCar, WHEELS } from './carsprite.js';
import { TEAMS } from './race.js';
import { CAR } from './physics.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mixColor(c1, c2, t) {
  const a = parseInt(c1.slice(1), 16), b = parseInt(c2.slice(1), 16);
  const r = lerp((a >> 16) & 255, (b >> 16) & 255, t), g = lerp((a >> 8) & 255, (b >> 8) & 255, t), bl = lerp(a & 255, b & 255, t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export class Renderer {
  constructor(canvas, T, line) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    this.T = T; this.line = line;
    this.dpr = 1; this.w = 0; this.h = 0;
    this.cam = { x: 0, y: 0, ang: 0, scale: 4, init: false, shake: 0 };
    this.skids = []; this.skidHead = 0; this.SKID_MAX = 1400;
    this.parts = []; this.PART_MAX = 420;
    this.lastWheel = new Map();
    this.time = 0;
    this.buildStatic();
    this.buildSprites();
    this.assist = null;
  }

  resize(w, h, dpr) {
    this.w = w; this.h = h; this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
  }

  // ---------------------------------------------------------------- 静的ジオメトリ
  buildStatic() {
    const T = this.T, N = T.N, L = this.line;
    const X = (i, d) => T.x[i] + T.nx[i] * d, Y = (i, d) => T.y[i] + T.ny[i] * d;
    const cr = T.cross;
    for (const ch of T.chunks) {
      const { a, b } = ch;
      const P = { asphalt: new Path2D(), lineL: new Path2D(), lineR: new Path2D(), kerbA: new Path2D(), kerbB: new Path2D(), gravel: new Path2D(), wall: new Path2D(), tyre: new Path2D(), rubber: new Path2D(), verge: new Path2D(), deck: new Path2D() };
      for (let q = a; q <= b; q++) { const i = q % N; q === a ? P.asphalt.moveTo(X(i, -T.wl[i]), Y(i, -T.wl[i])) : P.asphalt.lineTo(X(i, -T.wl[i]), Y(i, -T.wl[i])); }
      for (let q = b; q >= a; q--) { const i = q % N; P.asphalt.lineTo(X(i, T.wr[i]), Y(i, T.wr[i])); }
      P.asphalt.closePath();
      for (let q = a; q <= b; q++) {
        const i = q % N;
        const l = -(T.wl[i] - 0.22), r = T.wr[i] - 0.22;
        q === a ? P.lineL.moveTo(X(i, l), Y(i, l)) : P.lineL.lineTo(X(i, l), Y(i, l));
        q === a ? P.lineR.moveTo(X(i, r), Y(i, r)) : P.lineR.lineTo(X(i, r), Y(i, r));
        q === a ? P.rubber.moveTo(L.x[i], L.y[i]) : P.rubber.lineTo(L.x[i], L.y[i]);
      }
      for (let q = a; q < b; q++) {
        const i = q % N, j = (q + 1) % N;
        const quad = (path, d1i, d2i, d1j, d2j) => { path.moveTo(X(i, d1i), Y(i, d1i)); path.lineTo(X(j, d1j), Y(j, d1j)); path.lineTo(X(j, d2j), Y(j, d2j)); path.lineTo(X(i, d2i), Y(i, d2i)); path.closePath(); };
        const kp = (q & 1) ? P.kerbA : P.kerbB;
        if (T.kerbL[i] > 0 && T.kerbL[j] > 0) quad(kp, -T.wl[i], -(T.wl[i] + T.kerbL[i]), -T.wl[j], -(T.wl[j] + T.kerbL[j]));
        if (T.kerbR[i] > 0 && T.kerbR[j] > 0) quad(kp, T.wr[i], T.wr[i] + T.kerbR[i], T.wr[j], T.wr[j] + T.kerbR[j]);
        const gs = T.gravelStart;
        if (T.gravL[i] && T.gravL[j]) quad(P.gravel, -(T.wl[i] + T.kerbL[i] + gs), -(T.wallL[i] - 0.7), -(T.wl[j] + T.kerbL[j] + gs), -(T.wallL[j] - 0.7));
        if (T.gravR[i] && T.gravR[j]) quad(P.gravel, T.wr[i] + T.kerbR[i] + gs, T.wallR[i] - 0.7, T.wr[j] + T.kerbR[j] + gs, T.wallR[j] - 0.7);
        // バリア
        const seg = (path, di, dj) => { path.moveTo(X(i, di), Y(i, di)); path.lineTo(X(j, dj), Y(j, dj)); };
        seg(T.tyreL[i] ? P.tyre : P.wall, -T.wallL[i], -T.wallL[j]);
        seg(T.tyreR[i] ? P.tyre : P.wall, T.wallR[i], T.wallR[j]);
        quad(P.deck, -(T.wallL[i] + 0.9), T.wallR[i] + 0.9, -(T.wallL[j] + 0.9), T.wallR[j] + 0.9);
      }
      ch.P = P;
      // 立体交差の上段
      const mid = (a + b) / 2;
      ch.bridge = !!cr && Math.abs(mid - cr.hi) * T.ds < 34;
    }
    // レーシングラインの外側に出ない装飾類
    this.buildMarkings();
    this.buildScenery();
    this.buildMinimap();
  }

  PT(s, d) { const o = { x: 0, y: 0, h: 0 }; this.T.pos(s, d, o); return o; }

  stripPath(s0, s1, dA, dB, step = 4) {
    // s0→s1 (前進方向, 周回またぎ可) の帯ポリゴン。dA/dB は s の関数でも定数でも可
    const T = this.T, p = new Path2D();
    let len = s1 - s0; if (len < 0) len += T.length;
    const n = Math.max(2, Math.ceil(len / step));
    const fa = typeof dA === 'function' ? dA : () => dA, fb = typeof dB === 'function' ? dB : () => dB;
    const o = { x: 0, y: 0, h: 0 };
    for (let k = 0; k <= n; k++) { const s = T.wrapS(s0 + len * k / n); T.pos(s, fa(s), o); k ? p.lineTo(o.x, o.y) : p.moveTo(o.x, o.y); }
    for (let k = n; k >= 0; k--) { const s = T.wrapS(s0 + len * k / n); T.pos(s, fb(s), o); p.lineTo(o.x, o.y); }
    p.closePath();
    return p;
  }
  linePath(s0, s1, dA, step = 4) {
    const T = this.T, p = new Path2D();
    let len = s1 - s0; if (len < 0) len += T.length;
    const n = Math.max(2, Math.ceil(len / step));
    const fa = typeof dA === 'function' ? dA : () => dA;
    const o = { x: 0, y: 0, h: 0 };
    for (let k = 0; k <= n; k++) { const s = T.wrapS(s0 + len * k / n); T.pos(s, fa(s), o); k ? p.lineTo(o.x, o.y) : p.moveTo(o.x, o.y); }
    return p;
  }

  buildMarkings() {
    const T = this.T, P = T.pit, M = this.mark = {};
    const wr = s => T.wr[T.idx(s)], wl = s => T.wl[T.idx(s)];
    // ピットレーン
    M.pitLane = this.stripPath(P.sEntry, P.sExit, s => P.dAt(s) - 3.4, s => P.dAt(s) + 3.4, 3);
    M.pitLineA = this.linePath(P.sEntry + 20, P.sExit - 20, s => P.dAt(s) - 3.2, 3);
    M.pitLineB = this.linePath(P.sEntryEnd, P.sExitStart, s => P.dAt(s) + 3.2, 3);
    M.pitApron = this.stripPath(5540, 250, s => wr(s) + 1.4 + 9.5 + 3.4, s => wr(s) + 1.4 + 9.5 + 9.2, 6);
    M.pitWall = this.linePath(P.sEntryEnd - 30, P.sExitStart + 12, s => wr(s) + 1.4, 4);
    M.garage = this.stripPath(5548, 236, s => wr(s) + 20.3, s => wr(s) + 36, 6);
    M.garageRoof = this.stripPath(5548, 236, s => wr(s) + 22.5, s => wr(s) + 34.5, 6);
    M.paddock = this.stripPath(5520, 262, s => wr(s) + 36, s => wr(s) + 78, 8);
    M.boxes = [];
    for (let t = 0; t < TEAMS.length; t++) {
      const s = P.boxS[t], d = P.dAt(s) + P.boxOffset;
      M.boxes.push({ team: TEAMS[t], rect: this.stripPath(s - 3.2, s + 3.4, d - 1.7, d + 1.7, 2), bar: this.stripPath(s - 3.2, s + 3.4, d + 1.7, d + 2.5, 2), door: this.stripPath(s - 6, s + 6, wr(s) + 20.3, wr(s) + 22.5, 3) });
    }
    // スタートライン (チェッカー)
    const ck = M.checkA = new Path2D(), ck2 = M.checkB = new Path2D();
    const o = { x: 0, y: 0, h: 0 };
    const w0l = wl(0), w0r = wr(0), nsq = Math.round((w0l + w0r) / 0.7);
    for (let r = 0; r < 2; r++) for (let k = 0; k < nsq; k++) {
      const d1 = -w0l + (w0l + w0r) * k / nsq, d2 = -w0l + (w0l + w0r) * (k + 1) / nsq, s1 = -0.7 + r * 0.7, s2 = s1 + 0.7;
      const pth = (k + r) & 1 ? ck : ck2;
      T.pos(s1, d1, o); pth.moveTo(o.x, o.y); T.pos(s2, d1, o); pth.lineTo(o.x, o.y); T.pos(s2, d2, o); pth.lineTo(o.x, o.y); T.pos(s1, d2, o); pth.lineTo(o.x, o.y); pth.closePath();
    }
    // グリッド
    const gp = M.grid = new Path2D();
    for (let k = 0; k < 20; k++) {
      const s = T.length - 9 - k * 8 + 2.5, d = (k % 2 === 0 ? 1 : -1) * 3.3;
      T.pos(s - 1.2, d - 1.25, o); gp.moveTo(o.x, o.y); T.pos(s, d - 1.25, o); gp.lineTo(o.x, o.y); T.pos(s, d + 1.25, o); gp.lineTo(o.x, o.y); T.pos(s - 1.2, d + 1.25, o); gp.lineTo(o.x, o.y);
    }
    // スタートシグナルのガントリー
    M.gantry = this.stripPath(7, 8.2, -(w0l + 3), w0r + 2.2, 1);
    M.gantryLights = []; for (let k = 0; k < 5; k++) { T.pos(7.6, -3.2 + k * 1.6, o); M.gantryLights.push({ x: o.x, y: o.y }); }
    // セクター境界の目印
    M.centerRef = this.PT(0, 0);
    // 距離看板 (ブレーキング目安)
    M.boards = [];
    const brakeFor = [[395, -1], [2612, 1], [5078, -1], [3500, 1], [2010, -1], [4680, 1]];
    for (const [sc, side] of brakeFor) for (const dist of [150, 100, 50]) {
      const s = T.wrapS(sc - dist), i = T.idx(s), d = side < 0 ? -(T.wl[i] + 2.4) : T.wr[i] + 2.4;
      T.pos(s, d, o); M.boards.push({ x: o.x, y: o.y, h: o.h, n: dist });
    }
  }

  buildScenery() {
    const T = this.T, N = T.N, S = this.scenery = [];
    const add = (o) => { S.push(o); };
    const wr = s => T.wr[T.idx(s)], wl = s => T.wl[T.idx(s)], wallL = s => T.wallL[T.idx(s)], wallR = s => T.wallR[T.idx(s)];
    const o = { x: 0, y: 0, h: 0 };
    const stand = (s0, s1, side, gap, depth, col) => {
      const f1 = side < 0 ? s => -(wallL(s) + gap) : s => wallR(s) + gap;
      const f2 = side < 0 ? s => -(wallL(s) + gap + depth) : s => wallR(s) + gap + depth;
      const rows = [];
      const nrow = Math.max(3, Math.round(depth / 2.2));
      for (let r = 1; r < nrow; r++) { const t = r / nrow; rows.push(this.linePath(s0, s1, s => lerp(f1(s), f2(s), t), 6)); }
      let len = s1 - s0; if (len < 0) len += T.length;
      const mid = this.PT(T.wrapS(s0 + len / 2), (f1(s0) + f2(s0)) / 2);
      add({ type: 'stand', x: mid.x, y: mid.y, r: len / 2 + depth + 20, body: this.stripPath(s0, s1, f1, f2, 6), rows, roof: this.stripPath(s0, s1, s => lerp(f1(s), f2(s), 0.62), f2, 6), col });
    };
    stand(5575, 318, -1, 3.5, 26, '#6d7682');        // メイングランドスタンド
    stand(392, 470, -1, 4, 13, '#77808b');           // 1コーナー
    stand(520, 640, -1, 4, 13, '#77808b');           // 2コーナー
    stand(1640, 1820, 1, 4, 11, '#7b8590');          // ダンロップ
    stand(2625, 2700, 1, 4, 12, '#77808b');          // ヘアピン
    stand(3580, 3740, 1, 4, 11, '#7b8590');          // スプーン
    stand(5075, 5190, -1, 4, 12, '#77808b');         // シケイン
    stand(5260, 5440, -1, 4, 14, '#6d7682');         // 最終コーナー
    // 観覧車 (最終コーナー外側の遊園地)
    { const p = this.PT(5380, -(wallL(5380) + 70)); add({ type: 'wheel', x: p.x, y: p.y, r: 60 }); }
    // 遊園地の建物・テント
    const rnd = mulberry(77);
    for (let k = 0; k < 14; k++) {
      const s = 5270 + rnd() * 260, d = -(wallL(s) + 40 + rnd() * 80);
      const p = this.PT(T.wrapS(s), d);
      add({ type: 'tent', x: p.x, y: p.y, r: 14, size: 5 + rnd() * 7, rot: rnd() * 3, col: ['#d94b4b', '#e8b33a', '#3d8fd9', '#f0f0f0', '#58b368'][k % 5] });
    }
    // マーシャルポスト
    for (let s = 150; s < T.length; s += 260) {
      const i = T.idx(s), side = (Math.round(s / 260) & 1) ? 1 : -1;
      if (T.cross && (Math.abs(i - T.cross.lo) < 40 || Math.abs(i - T.cross.hi) < 40)) continue;
      if (s > 5200 || s < 420) continue;
      const d = side < 0 ? -(T.wallL[i] + 2.2) : T.wallR[i] + 2.2;
      T.pos(s, d, o); add({ type: 'post', x: o.x, y: o.y, r: 6, h: o.h });
    }
    // 樹木
    const bb = T.bbox, trees = this.trees = [], G = 120;
    this.treeGrid = new Map();
    const noise = (x, y) => { const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return s - Math.floor(s); };
    const smoothNoise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const a = noise(xi, yi), b = noise(xi + 1, yi), c = noise(xi, yi + 1), d = noise(xi + 1, yi + 1); const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); return lerp(lerp(a, b, u), lerp(c, d, u), v); };
    const loc = {};
    const r2 = mulberry(4242);
    const cell = T._cell, grid = T._grid;
    for (let k = 0; k < 5200; k++) {
      const x = bb.minX - 160 + r2() * (bb.maxX - bb.minX + 320), y = bb.minY - 160 + r2() * (bb.maxY - bb.minY + 320);
      const size = 3.2 + r2() * 3.8, kind = (r2() * 3) | 0;
      if (smoothNoise(x / 140 + 3, y / 140 + 7) < 0.42) continue;
      // コース/施設に近い場所は除外
      let ok = true;
      const kx = Math.floor(x / cell), ky = Math.floor(y / cell);
      for (let gx = kx - 2; gx <= kx + 2 && ok; gx++) for (let gy = ky - 2; gy <= ky + 2 && ok; gy++) {
        const arr = grid.get(gx * 100003 + gy); if (!arr) continue;
        for (const i of arr) {
          const dx = x - T.x[i], dy = y - T.y[i];
          const dd = dx * T.nx[i] + dy * T.ny[i], al = dx * T.tx[i] + dy * T.ty[i];
          if (Math.abs(al) > 3) continue;
          const lim = dd > 0 ? T.wallR[i] : T.wallL[i];
          const s = i * T.ds;
          let extra = 5 + size;
          if (s > 5180 || s < 420) extra = dd > 0 ? 90 : 48;           // ピット/メインスタンド
          if (s > 5200 && s < 5560 && dd < 0) extra = 190;             // 遊園地
          if (Math.abs(dd) < lim + extra) { ok = false; break; }
        }
      }
      if (!ok) continue;
      // スタンドとの重なりを避ける
      for (const sc of S) if (sc.type === 'stand' && Math.hypot(sc.x - x, sc.y - y) < sc.r * 0.55) { ok = false; break; }
      if (!ok) continue;
      const t = { x, y, size, kind };
      trees.push(t);
      const gk = Math.floor(x / G) * 100003 + Math.floor(y / G);
      let a = this.treeGrid.get(gk); if (!a) this.treeGrid.set(gk, a = []); a.push(t);
    }
    this.treeCell = G;
  }

  buildSprites() {
    // 樹木スプライト
    this.treeSpr = [];
    const cols = [['#1f5a2a', '#2f7a36', '#4a9a48'], ['#24522a', '#356f33', '#5c9a4a'], ['#1d4a30', '#2c6a40', '#49905a']];
    for (let k = 0; k < 3; k++) {
      const c = makeCanvas(64, 64), g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(36, 37, 23, 22, 0, 0, TAU); g.fill();
      const rnd = mulberry(100 + k);
      g.fillStyle = cols[k][0]; g.beginPath(); g.arc(30, 30, 23, 0, TAU); g.fill();
      for (let q = 0; q < 9; q++) { g.fillStyle = cols[k][1 + (q % 2)]; g.beginPath(); g.arc(18 + rnd() * 22, 16 + rnd() * 22, 6 + rnd() * 7, 0, TAU); g.fill(); }
      this.treeSpr.push(c);
    }
    // パーティクル
    const soft = (r, gcol, b, a0) => { const c = makeCanvas(32, 32), g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, `rgba(${r},${gcol},${b},${a0})`); gr.addColorStop(1, `rgba(${r},${gcol},${b},0)`); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c; };
    this.partSpr = [soft(235, 235, 235, 0.55), soft(196, 170, 120, 0.6), soft(80, 150, 70, 0.75), soft(215, 230, 245, 0.42), soft(255, 220, 110, 1)];
    // 芝パターン (1px = 0.5m)
    const pc = makeCanvas(128, 128), pg = pc.getContext('2d');
    pg.fillStyle = '#3f8a3c'; pg.fillRect(0, 0, 128, 128);
    const rnd = mulberry(9);
    for (let i = 0; i < 16; i++) { pg.fillStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.05)'; pg.fillRect(0, i * 8, 128, 8); }
    for (let i = 0; i < 900; i++) { pg.fillStyle = rnd() < 0.5 ? 'rgba(20,60,20,0.16)' : 'rgba(170,220,120,0.12)'; pg.fillRect((rnd() * 128) | 0, (rnd() * 128) | 0, 1 + ((rnd() * 2) | 0), 1 + ((rnd() * 2) | 0)); }
    this.grassCanvas = pc; this.grassPattern = null;
    // グラベルパターン
    const gc = makeCanvas(64, 64), gg = gc.getContext('2d');
    gg.fillStyle = '#c9b48a'; gg.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 700; i++) { gg.fillStyle = ['rgba(120,100,70,0.35)', 'rgba(240,225,190,0.4)', 'rgba(160,140,100,0.3)'][i % 3]; gg.fillRect((rnd() * 64) | 0, (rnd() * 64) | 0, 1, 1); }
    this.gravelCanvas = gc; this.gravelPattern = null;
  }

  buildMinimap() {
    const T = this.T, bb = T.bbox;
    const W = 300, pad = 12;
    const sc = (W - pad * 2) / (bb.maxX - bb.minX), H = Math.ceil((bb.maxY - bb.minY) * sc + pad * 2);
    const c = makeCanvas(W, H), g = c.getContext('2d');
    const mx = x => pad + (x - bb.minX) * sc, my = y => pad + (y - bb.minY) * sc;
    const stroke = (col, lw, a, b) => { g.strokeStyle = col; g.lineWidth = lw; g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); for (let q = a; q <= b; q += 2) { const i = q % T.N; q === a ? g.moveTo(mx(T.x[i]), my(T.y[i])) : g.lineTo(mx(T.x[i]), my(T.y[i])); } g.stroke(); };
    stroke('rgba(0,0,0,0.75)', 7, 0, T.N);
    stroke('#f2f2f2', 3.6, 0, T.N);
    if (T.cross) { stroke('rgba(0,0,0,0.75)', 7, T.cross.hi - 14, T.cross.hi + 14); stroke('#f2f2f2', 3.6, T.cross.hi - 16, T.cross.hi + 16); }
    // スタートライン
    g.strokeStyle = '#ff5a2a'; g.lineWidth = 2.5; g.beginPath();
    g.moveTo(mx(T.x[0] - T.nx[0] * 22), my(T.y[0] - T.ny[0] * 22)); g.lineTo(mx(T.x[0] + T.nx[0] * 22), my(T.y[0] + T.ny[0] * 22)); g.stroke();
    this.minimap = { c, W, H, sc, pad, mx, my };
  }

  // 走行ライン表示 (ブレーキング区間を色分け)
  setAssist(profile) {
    const T = this.T, N = T.N, L = this.line;
    if (!profile) { this.assist = null; return; }
    const cat = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      const j = (i + 3) % N;
      const acc = (profile[j] * profile[j] - profile[i] * profile[i]) / (2 * 3 * T.ds);
      cat[i] = acc < -5 ? 2 : acc < 1.2 && profile[i] < 78 ? 1 : 0;
    }
    // 短い区間のちらつきを除去
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) { const a = cat[(i - 2 + N) % N], b = cat[(i + 2) % N]; if (a === b && cat[i] !== a) cat[i] = a; }
    for (const ch of T.chunks) {
      const P = [new Path2D(), new Path2D(), new Path2D()];
      for (let q = ch.a; q < ch.b; q++) { const i = q % N, j = (q + 1) % N; const p = P[cat[i]]; p.moveTo(L.x[i], L.y[i]); p.lineTo(L.x[j], L.y[j]); }
      ch.assist = P;
    }
    this.assist = cat;
  }

  // ---------------------------------------------------------------- エフェクト
  addSkid(x1, y1, x2, y2, a) {
    const s = this.skids;
    if (s.length < this.SKID_MAX) s.push({ x1, y1, x2, y2, a });
    else { const o = s[this.skidHead]; o.x1 = x1; o.y1 = y1; o.x2 = x2; o.y2 = y2; o.a = a; this.skidHead = (this.skidHead + 1) % this.SKID_MAX; }
  }
  addPart(type, x, y, vx, vy, life, size, grow) {
    if (this.parts.length >= this.PART_MAX) this.parts.shift();
    this.parts.push({ type, x, y, vx, vy, life, max: life, size, grow });
  }
  clearEffects() { this.skids.length = 0; this.skidHead = 0; this.parts.length = 0; this.lastWheel.clear(); }

  updateEffects(session, dt) {
    const wet = session.wet;
    const cam = this.cam, R2 = Math.pow(Math.hypot(this.w, this.h) / cam.scale * 0.6 + 30, 2);
    for (const e of session.entries) {
      if (e.out) continue;
      const c = e.car;
      const dx = c.x - cam.x, dy = c.y - cam.y;
      if (dx * dx + dy * dy > R2) { this.lastWheel.delete(c); continue; }
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      let lw = this.lastWheel.get(c);
      if (!lw) { lw = [0, 0, 0, 0, 0, 0, 0, 0, 0]; this.lastWheel.set(c, lw); lw[8] = 0; }
      const v = c.speed;
      const spinR = c.kR > 0.22 && v > 2, slideR = Math.abs(c.saR) > 0.2 && v > 9, lockF = c.lockedF, slideF = Math.abs(c.saF) > 0.3 && v > 9;
      const lockR = c.kR < -0.3 && v > 6;
      for (let k = 0; k < 4; k++) {
        const w = WHEELS[k];
        const wx = c.x + cs * w[0] - sn * w[1], wy = c.y + sn * w[0] + cs * w[1];
        const rear = k >= 2, surf = c.surf[k];
        const mark = surf === 0 && !e.pit && (rear ? (spinR || slideR || lockR) : (lockF || slideF));
        if (mark && lw[8]) {
          const px = lw[k * 2], py = lw[k * 2 + 1];
          if ((px - wx) * (px - wx) + (py - wy) * (py - wy) < 16) this.addSkid(px, py, wx, wy, wet > 0.4 ? 0.12 : (rear && spinR ? 0.5 : 0.36));
        }
        lw[k * 2] = wx; lw[k * 2 + 1] = wy;
        if (e.pit) continue;
        // スモーク
        if (mark && wet < 0.5 && Math.random() < 0.5) this.addPart(0, wx, wy, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0.7 + Math.random() * 0.5, 1.2, 3.2);
        // 芝・グラベル
        if (surf >= 2 && v > 4 && Math.random() < (surf === 3 ? 0.8 : 0.35)) {
          const bx = -cs * v * 0.25, by = -sn * v * 0.25;
          this.addPart(surf === 3 ? 1 : 2, wx, wy, bx + (Math.random() - 0.5) * 4, by + (Math.random() - 0.5) * 4, surf === 3 ? 0.9 : 0.5, surf === 3 ? 1.6 : 0.7, surf === 3 ? 3.5 : 1.2);
        }
        // 水しぶき
        if (rear && wet > 0.15 && v > 14 && Math.random() < wet * sat(v / 50) * 0.9) {
          this.addPart(3, wx - cs * 0.6, wy - sn * 0.6, -cs * v * 0.12 + (Math.random() - 0.5) * 3, -sn * v * 0.12 + (Math.random() - 0.5) * 3, 0.6 + wet * 0.5, 1.4 + v * 0.02, 4 + v * 0.06);
        }
      }
      lw[8] = 1;
      // 火花 (高速時にスキッドプレートが路面を擦る)
      if (c.vx > 66 && !e.pit && Math.random() < 0.10 + 0.25 * sat((c.fuel - 40) / 100)) {
        const bx = c.x - cs * 1.4, by = c.y - sn * 1.4;
        for (let q = 0; q < 2; q++) this.addPart(4, bx + (Math.random() - 0.5) * 0.6, by + (Math.random() - 0.5) * 0.6, -cs * c.vx * 0.15 + (Math.random() - 0.5) * 5, -sn * c.vx * 0.15 + (Math.random() - 0.5) * 5, 0.25 + Math.random() * 0.2, 0.28, -0.3);
      }
      if (c.hit > 3) {
        for (let q = 0; q < Math.min(14, c.hit * 0.8); q++) this.addPart(Math.random() < 0.3 ? 4 : 1, c.x, c.y, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 0.5 + Math.random() * 0.5, 0.8, 2.5);
        if (e.isPlayer) cam.shake = Math.min(1.2, c.hit * 0.08);
      }
    }
    // 更新
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.life -= dt;
      if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.2; p.vy *= 1 - dt * 2.2; p.size += p.grow * dt;
    }
  }

  // ---------------------------------------------------------------- カメラ
  updateCamera(target, cfg, dt, snap) {
    const cam = this.cam, w = this.w, h = this.h;
    const mode = cfg.camera || 'up';
    const v = target.speed || 0;
    const zf = cfg.zoom === 'near' ? 0.78 : cfg.zoom === 'far' ? 1.3 : 1;
    let scale, ax, ay, targetAng;
    const t = sat((v - 8) / 72), tt = t * t * (3 - 2 * t);
    if (mode === 'right') {
      scale = w / (lerp(165, 400, tt) * zf); ax = w * 0.3; ay = h * 0.47; targetAng = target.yaw;
    } else if (mode === 'north') {
      scale = h / (lerp(150, 290, tt) * zf); ax = w * 0.5; ay = h * 0.47; targetAng = null;
    } else {
      scale = h / (lerp(100, 245, tt) * zf); ax = w * 0.5; ay = h * 0.66; targetAng = target.yaw;
    }
    if (!cam.init || snap) {
      cam.x = target.x; cam.y = target.y; cam.scale = scale; cam.ang = targetAng ?? 0; cam.init = true; cam.lx = 0; cam.ly = 0;
    } else {
      cam.scale += (scale - cam.scale) * Math.min(1, dt * 1.8);
      if (targetAng != null) {
        let d = Math.atan2(Math.sin(targetAng - cam.ang), Math.cos(targetAng - cam.ang));
        const step = clamp(d * Math.min(1, dt * 6.5), -dt * 3.2, dt * 3.2);
        cam.ang += step;
      }
      cam.x = target.x; cam.y = target.y;
    }
    // 北固定では進行方向を少し先読み
    if (mode === 'north') {
      const lx = Math.cos(target.yaw) * Math.min(v, 70) * 0.9, ly = Math.sin(target.yaw) * Math.min(v, 70) * 0.9;
      cam.lx += (lx - cam.lx) * Math.min(1, dt * 1.5); cam.ly += (ly - cam.ly) * Math.min(1, dt * 1.5);
    } else { cam.lx = 0; cam.ly = 0; }
    cam.rot = mode === 'right' ? -cam.ang : mode === 'north' ? 0 : -cam.ang - Math.PI / 2;
    cam.ax = ax; cam.ay = ay;
    cam.shake = Math.max(0, cam.shake - dt * 3);
    cam.mode = mode;
  }
  applyWorld(ctx) {
    const cam = this.cam, k = cam.scale * this.dpr;
    const c = Math.cos(cam.rot) * k, s = Math.sin(cam.rot) * k;
    const sx = cam.shake ? (Math.random() - 0.5) * cam.shake * 8 : 0, sy = cam.shake ? (Math.random() - 0.5) * cam.shake * 8 : 0;
    const cx = cam.x + cam.lx, cy = cam.y + cam.ly;
    ctx.setTransform(c, s, -s, c, (cam.ax + sx) * this.dpr - (c * cx - s * cy), (cam.ay + sy) * this.dpr - (s * cx + c * cy));
  }
  worldToScreen(x, y, out) {
    const cam = this.cam, c = Math.cos(cam.rot) * cam.scale, s = Math.sin(cam.rot) * cam.scale;
    const dx = x - cam.x - cam.lx, dy = y - cam.y - cam.ly;
    out.x = cam.ax + c * dx - s * dy; out.y = cam.ay + s * dx + c * dy; return out;
  }

  // ---------------------------------------------------------------- 描画
  render(session, cfg, dt) {
    const ctx = this.ctx, T = this.T, cam = this.cam, dpr = this.dpr;
    this.time += dt;
    const wet = session.wet, rain = session.rain;
    const w = this.w, h = this.h;
    // 視野半径
    const vr = Math.hypot(Math.max(cam.ax, w - cam.ax), Math.max(cam.ay, h - cam.ay)) / cam.scale + 6;
    const vx = cam.x + cam.lx, vy = cam.y + cam.ly;

    // --- 地面 ---
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = mixColor('#3f8a3c', '#2f6a3a', wet * 0.7);
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyWorld(ctx);
    if (!this.grassPattern) {
      this.grassPattern = ctx.createPattern(this.grassCanvas, 'repeat');
      this.gravelPattern = ctx.createPattern(this.gravelCanvas, 'repeat');
      try { this.grassPattern.setTransform(new DOMMatrix().scale(0.5)); this.gravelPattern.setTransform(new DOMMatrix().scale(0.22)); } catch (e) { /* 非対応環境では等倍 */ }
    }
    if (cfg.quality !== 'low') {
      ctx.globalAlpha = 1 - wet * 0.35;
      ctx.fillStyle = this.grassPattern; ctx.fillRect(vx - vr, vy - vr, vr * 2, vr * 2);
      ctx.globalAlpha = 1;
    }

    // 可視チャンクの収集
    const vis = this._vis || (this._vis = []); vis.length = 0;
    for (const ch of T.chunks) { const dx = ch.cx - vx, dy = ch.cy - vy, rr = vr + ch.r; if (dx * dx + dy * dy < rr * rr) vis.push(ch); }
    const merge = (key, bridge) => { const p = new Path2D(); for (const ch of vis) if (ch.bridge === bridge) p.addPath(ch.P[key]); return p; };
    const nearPit = Math.hypot(vx - this.mark.centerRef.x, vy - this.mark.centerRef.y) < 760 + vr;
    const asphaltCol = mixColor('#43464c', '#26292f', wet);
    const lw = 1 / cam.scale; // 1 CSS px

    // --- 周辺施設(地面レベル) ---
    if (nearPit) this.drawPitGround(ctx, wet);

    const drawTrackLayer = (bridge) => {
      // グラベル
      if (!bridge) {
        ctx.fillStyle = cfg.quality === 'low' ? '#c9b48a' : this.gravelPattern; ctx.fill(merge('gravel', false));
        if (wet > 0.05) { ctx.fillStyle = `rgba(70,60,45,${wet * 0.3})`; ctx.fill(merge('gravel', false)); }
      } else {
        // 橋: 影と橋桁
        ctx.save(); ctx.translate(2.2, 3.2); ctx.fillStyle = 'rgba(0,0,0,0.32)'; ctx.fill(merge('deck', true)); ctx.restore();
        ctx.fillStyle = '#8a8f96'; ctx.fill(merge('deck', true));
      }
      ctx.fillStyle = asphaltCol; ctx.fill(merge('asphalt', bridge));
      // ラバーが乗ったレコードライン
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(0,0,0,${0.10 * (1 - wet * 0.7)})`; ctx.lineWidth = 3.4; ctx.stroke(merge('rubber', bridge));
      ctx.strokeStyle = `rgba(0,0,0,${0.10 * (1 - wet * 0.7)})`; ctx.lineWidth = 1.6; ctx.stroke(merge('rubber', bridge));
      // 縁石
      ctx.fillStyle = '#d8382c'; ctx.fill(merge('kerbA', bridge));
      ctx.fillStyle = '#f1f1ee'; ctx.fill(merge('kerbB', bridge));
      // 白線
      ctx.strokeStyle = 'rgba(245,245,240,0.92)'; ctx.lineWidth = Math.max(0.2, lw * 1.1);
      ctx.stroke(merge('lineL', bridge)); ctx.stroke(merge('lineR', bridge));
      // 走行ライン表示
      if (this.assist && cfg.lineAssist) {
        const pa = [new Path2D(), new Path2D(), new Path2D()];
        for (const ch of vis) if (ch.bridge === bridge && ch.assist) { pa[0].addPath(ch.assist[0]); pa[1].addPath(ch.assist[1]); pa[2].addPath(ch.assist[2]); }
        ctx.lineWidth = Math.max(0.45, lw * 2.2);
        ctx.strokeStyle = 'rgba(90,230,150,0.42)'; ctx.stroke(pa[0]);
        ctx.strokeStyle = 'rgba(255,214,60,0.62)'; ctx.stroke(pa[1]);
        ctx.strokeStyle = 'rgba(255,70,60,0.8)'; ctx.stroke(pa[2]);
      }
      // バリア
      ctx.lineCap = 'butt';
      ctx.strokeStyle = '#1b1d20'; ctx.lineWidth = 1.5; ctx.stroke(merge('tyre', bridge));
      ctx.strokeStyle = '#e9e9e9'; ctx.lineWidth = 1.5; ctx.setLineDash([1.6, 1.6]); ctx.stroke(merge('tyre', bridge)); ctx.setLineDash([]);
      ctx.strokeStyle = '#1b1d20'; ctx.lineWidth = 0.5; ctx.stroke(merge('tyre', bridge));
      ctx.strokeStyle = bridge ? '#d9dde2' : '#b9bec6'; ctx.lineWidth = Math.max(0.55, lw * 1.6); ctx.stroke(merge('wall', bridge));
    };
    drawTrackLayer(false);
    if (nearPit) this.drawPitMarkings(ctx, session, wet, lw);
    this.drawBoards(ctx, vx, vy, vr);
    this.drawSkids(ctx, vx, vy, vr);

    // --- 樹木・施設 ---
    this.drawScenery(ctx, vx, vy, vr, wet, cfg);

    // --- 車両 (下段) ---
    const cr = T.cross;
    const onBridge = c => cr && Math.abs(T.sDiff(c.s, cr.sHi)) < 44;
    const cars = session.entries;
    const pl = session.player;
    const drawCars = (upper) => {
      for (const e of cars) {
        if (e.out || e === pl) continue;
        const c = e.car; if (onBridge(c) !== upper) continue;
        const dx = c.x - vx, dy = c.y - vy; if (dx * dx + dy * dy > (vr + 5) * (vr + 5)) continue;
        this.drawOneCar(ctx, e);
      }
      if (session.ghostPose && cfg.ghost !== false && onBridge({ s: pl.car.s }) === upper) {
        const gp = session.ghostPose;
        drawCar(ctx, { x: gp.x, y: gp.y, yaw: gp.h, delta: 0, dmgF: 0, dmgR: 0 }, pl.team, { ghost: true });
      }
      if (!pl.out && onBridge(pl.car) === upper) this.drawOneCar(ctx, pl);
    };
    drawCars(false);
    this.drawParts(ctx, false, cr, onBridge);
    // --- 立体交差の上段 ---
    let anyBridge = false; for (const ch of vis) if (ch.bridge) { anyBridge = true; break; }
    if (anyBridge) {
      const under = cr && Math.abs(T.sDiff(pl.car.s, cr.sLo)) < 26;
      if (under) ctx.globalAlpha = 0.5;
      drawTrackLayer(true);
      ctx.globalAlpha = 1;
      drawCars(true);
    }
    this.drawParts(ctx, true, cr, onBridge);

    // --- 天候 ---
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (wet > 0.02 || rain > 0.02) {
      ctx.fillStyle = `rgba(40,55,75,${0.10 * wet + 0.10 * rain})`; ctx.fillRect(0, 0, w, h);
    }
    if (rain > 0.03 && cfg.quality !== 'low') {
      ctx.strokeStyle = 'rgba(210,225,245,0.34)'; ctx.lineWidth = 1; ctx.beginPath();
      const n = Math.round(rain * 150);
      const slant = -5 - (pl.car.speed || 0) * 0.05;
      for (let i = 0; i < n; i++) { const x = Math.random() * (w + 60) - 20, y = Math.random() * h, len = 12 + Math.random() * 18; ctx.moveTo(x, y); ctx.lineTo(x + slant * len / 20, y + len); }
      ctx.stroke();
    }
  }

  drawOneCar(ctx, e) {
    const c = e.car;
    ctx.save(); ctx.translate(c.x + 0.35, c.y + 0.5); ctx.rotate(c.yaw);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(0.1, 0, 2.3, 0.95, 0, 0, TAU); ctx.fill();
    ctx.restore();
    drawCar(ctx, c, e.team, { number: e.d.no, tyreColor: c.tyre.color });
  }

  drawPitGround(ctx, wet) {
    const M = this.mark;
    ctx.fillStyle = mixColor('#5a5d63', '#3a3d43', wet); ctx.fill(M.paddock);
    ctx.fillStyle = mixColor('#4b4e54', '#2d3036', wet); ctx.fill(M.pitLane); ctx.fill(M.pitApron);
  }
  drawPitMarkings(ctx, session, wet, lw) {
    const M = this.mark;
    // ピットレーン
    ctx.strokeStyle = 'rgba(245,245,240,0.85)'; ctx.lineWidth = Math.max(0.18, lw); ctx.stroke(M.pitLineA);
    ctx.strokeStyle = 'rgba(250,210,60,0.9)'; ctx.stroke(M.pitLineB);
    for (const b of M.boxes) {
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = Math.max(0.14, lw); ctx.stroke(b.rect);
      ctx.fillStyle = b.team.c1; ctx.fill(b.bar);
    }
    ctx.fillStyle = '#d5d8dc'; ctx.fill(M.garage);
    ctx.fillStyle = '#8f959d'; ctx.fill(M.garageRoof);
    for (const b of M.boxes) { ctx.fillStyle = b.team.c1; ctx.fill(b.door); }
    ctx.strokeStyle = '#eceff2'; ctx.lineWidth = 0.9; ctx.lineCap = 'butt'; ctx.stroke(M.pitWall);
    ctx.strokeStyle = '#2b5fb8'; ctx.lineWidth = 0.28; ctx.stroke(M.pitWall);
    // スタートライン・グリッド
    ctx.fillStyle = '#f4f4f4'; ctx.fill(M.checkA); ctx.fillStyle = '#111'; ctx.fill(M.checkB);
    ctx.strokeStyle = 'rgba(245,245,240,0.9)'; ctx.lineWidth = Math.max(0.2, lw); ctx.lineJoin = 'miter'; ctx.stroke(M.grid);
    // シグナル
    ctx.fillStyle = '#1a1c1f'; ctx.fill(M.gantry);
    const on = session.state === 'lights' ? session.lights : 0;
    M.gantryLights.forEach((p, k) => { ctx.fillStyle = k < on ? '#ff2a1a' : (session.lightsOut && session.stateT < 2.5 ? '#2bff6a' : '#3a0d0a'); ctx.beginPath(); ctx.arc(p.x, p.y, 0.55, 0, TAU); ctx.fill(); });
  }
  drawBoards(ctx, vx, vy, vr) {
    for (const b of this.mark.boards) {
      const dx = b.x - vx, dy = b.y - vy; if (dx * dx + dy * dy > vr * vr) continue;
      ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.h + Math.PI / 2);
      ctx.fillStyle = '#f5f5f5'; ctx.fillRect(-1.5, -0.9, 3, 1.8);
      ctx.fillStyle = '#111'; ctx.font = 'bold 1.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(b.n), 0, 0.08);
      ctx.restore();
    }
  }
  drawSkids(ctx, vx, vy, vr) {
    const s = this.skids; if (!s.length) return;
    const p1 = new Path2D(), p2 = new Path2D(), r2 = vr * vr;
    for (let i = 0; i < s.length; i++) {
      const k = s[i]; const dx = k.x1 - vx, dy = k.y1 - vy; if (dx * dx + dy * dy > r2) continue;
      const p = k.a > 0.4 ? p2 : p1; p.moveTo(k.x1, k.y1); p.lineTo(k.x2, k.y2);
    }
    ctx.lineCap = 'round'; ctx.lineWidth = 0.34;
    ctx.strokeStyle = 'rgba(12,12,14,0.3)'; ctx.stroke(p1);
    ctx.strokeStyle = 'rgba(12,12,14,0.5)'; ctx.stroke(p2);
  }
  drawParts(ctx, upper, cr, onBridge) {
    const ps = this.parts; if (!ps.length) return;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      const isUp = cr ? (Math.hypot(p.x - cr.x, p.y - cr.y) < 30 && p.up) : false;
      if (isUp !== upper) continue;
      const a = p.life / p.max; ctx.globalAlpha = p.type === 4 ? Math.min(1, a * 2) : a;
      const sz = Math.max(0.1, p.size);
      ctx.drawImage(this.partSpr[p.type], p.x - sz, p.y - sz, sz * 2, sz * 2);
    }
    ctx.globalAlpha = 1;
  }
  drawScenery(ctx, vx, vy, vr, wet, cfg) {
    const lw = 1 / this.cam.scale;
    for (const o of this.scenery) {
      const dx = o.x - vx, dy = o.y - vy, rr = vr + o.r; if (dx * dx + dy * dy > rr * rr) continue;
      if (o.type === 'stand') {
        ctx.fillStyle = o.col; ctx.fill(o.body);
        ctx.strokeStyle = 'rgba(30,34,40,0.55)'; ctx.lineWidth = 0.5; for (const r of o.rows) ctx.stroke(r);
        // 観客 (色の点描)
        ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.9; ctx.setLineDash([0.7, 1.9]); for (const r of o.rows) ctx.stroke(r);
        ctx.strokeStyle = 'rgba(230,70,60,0.35)'; ctx.setLineDash([0.6, 5.3]); ctx.lineDashOffset = 1.7; for (const r of o.rows) ctx.stroke(r);
        ctx.strokeStyle = 'rgba(60,140,230,0.35)'; ctx.setLineDash([0.6, 7.1]); ctx.lineDashOffset = 3.1; for (const r of o.rows) ctx.stroke(r);
        ctx.setLineDash([]); ctx.lineDashOffset = 0;
        ctx.fillStyle = 'rgba(225,230,236,0.92)'; ctx.fill(o.roof);
        ctx.strokeStyle = 'rgba(40,44,50,0.5)'; ctx.lineWidth = Math.max(0.2, lw); ctx.stroke(o.body);
      } else if (o.type === 'wheel') {
        // 観覧車 (真上から少し傾けた見え方)
        ctx.save(); ctx.translate(o.x, o.y);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(8, 10, 30, 30, 0, 0, TAU); ctx.fill();
        ctx.rotate(this.time * 0.05);
        ctx.strokeStyle = '#e9edf2'; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.arc(0, 0, 28, 0, TAU); ctx.stroke();
        ctx.lineWidth = 0.35; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU);
        for (let k = 0; k < 16; k++) { const a = k * TAU / 16; ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28); }
        ctx.stroke();
        const cols = ['#e5484d', '#f2c230', '#3d8fd9', '#58b368'];
        for (let k = 0; k < 16; k++) { const a = k * TAU / 16; ctx.fillStyle = cols[k % 4]; ctx.beginPath(); ctx.arc(Math.cos(a) * 28, Math.sin(a) * 28, 1.9, 0, TAU); ctx.fill(); }
        ctx.fillStyle = '#c7ccd3'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
        ctx.restore();
      } else if (o.type === 'tent') {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.rot);
        ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(-o.size / 2 + 1, -o.size / 2 + 1.4, o.size, o.size);
        ctx.fillStyle = o.col; ctx.fillRect(-o.size / 2, -o.size / 2, o.size, o.size);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.moveTo(-o.size / 2, -o.size / 2); ctx.lineTo(o.size / 2, o.size / 2); ctx.moveTo(o.size / 2, -o.size / 2); ctx.lineTo(-o.size / 2, o.size / 2); ctx.stroke();
        ctx.restore();
      } else if (o.type === 'post') {
        ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.h);
        ctx.fillStyle = '#f08a24'; ctx.fillRect(-1.3, -1, 2.6, 2); ctx.fillStyle = '#fff'; ctx.fillRect(-1.3, -0.25, 2.6, 0.5);
        ctx.restore();
      }
    }
    if (cfg.quality === 'low') return;
    // 樹木
    const G = this.treeCell, x0 = Math.floor((vx - vr) / G), x1 = Math.floor((vx + vr) / G), y0 = Math.floor((vy - vr) / G), y1 = Math.floor((vy + vr) / G);
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const a = this.treeGrid.get(gx * 100003 + gy); if (!a) continue;
      for (const t of a) { const s = t.size; ctx.drawImage(this.treeSpr[t.kind], t.x - s, t.y - s, s * 2.13, s * 2.13); }
    }
  }
}
