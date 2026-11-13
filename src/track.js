// コースモデル: 中心線・幅員・縁石・ランオフ・バリア・高低差・立体交差・ピットレーン
// 座標系: x=東, y=南 (画面と同じ y 下向き)。角度は時計回りが正。横位置 d は進行方向右が正。
// 1ユニット = 1m。
import { SUZUKA_POINTS, SUZUKA_LENGTH } from './data/suzuka.js';

export const DS = 2; // サンプル間隔の目標[m]

// 高低差キーポイント [コントロールラインからの距離m, 高さm] (最低点=2コーナー付近, 最高点=スプーン)
const ELEVATION_KEYS = [
  [0, 8], [200, 4.5], [400, 1.2], [540, 0], [700, 1.2], [820, 3.5], [1000, 9], [1250, 16],
  [1450, 22], [1850, 33], [2030, 34], [2180, 32], [2275, 30], [2500, 31], [2650, 33],
  [3000, 38.5], [3350, 46.5], [3500, 51], [3650, 52], [3800, 49], [4200, 43], [4648, 37],
  [4780, 34.5], [5100, 30], [5300, 22.5], [5537, 13.5],
];

// コーナー名 (距離はコントロールライン基準)
export const SECTIONS = [
  { name: '1コーナー', from: 360, to: 480, no: 1 },
  { name: '2コーナー', from: 500, to: 680, no: 2 },
  { name: 'S字', from: 780, to: 1200, no: 3 },
  { name: '逆バンク', from: 1200, to: 1390, no: 6 },
  { name: 'ダンロップ', from: 1410, to: 1900, no: 7 },
  { name: 'デグナー1', from: 1980, to: 2080, no: 8 },
  { name: 'デグナー2', from: 2120, to: 2230, no: 9 },
  { name: '立体交差', from: 2240, to: 2310, no: 0 },
  { name: '110R', from: 2430, to: 2570, no: 10 },
  { name: 'ヘアピン', from: 2590, to: 2740, no: 11 },
  { name: '200R', from: 2800, to: 3400, no: 12 },
  { name: 'スプーン', from: 3480, to: 3840, no: 13 },
  { name: '西ストレート', from: 3860, to: 4640, no: 0 },
  { name: '130R', from: 4660, to: 4900, no: 15 },
  { name: 'シケイン', from: 5060, to: 5210, no: 16 },
  { name: '最終コーナー', from: 5220, to: 5510, no: 18 },
  { name: 'メインストレート', from: 5520, to: 5807, no: 0 },
  { name: 'メインストレート', from: 0, to: 350, no: 0 },
];

export const SECTOR_SPLITS = [1950, 3950]; // セクター1終了, セクター2終了 [m]

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => clamp(v, 0, 1);
const smooth = t => { t = sat(t); return t * t * (3 - 2 * t); };

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function smoothArr(a, r, passes = 1) {
  const n = a.length; let src = a;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(n);
    let acc = 0; const w = 2 * r + 1;
    for (let k = -r; k <= r; k++) acc += src[(k + n * 8) % n];
    for (let i = 0; i < n; i++) {
      out[i] = acc / w;
      acc += src[(i + r + 1) % n] - src[(i - r + n * 8) % n];
    }
    src = out;
  }
  return src;
}

export function buildTrack() {
  const raw = SUZUKA_POINTS, m = raw.length;
  // --- 1) 高密度補間して弧長を測る ---
  const SUB = 10;
  const fx = [], fy = [], fwr = [], fwl = [], fs = [0];
  for (let i = 0; i < m; i++) {
    const p0 = raw[(i - 1 + m) % m], p1 = raw[i], p2 = raw[(i + 1) % m], p3 = raw[(i + 2) % m];
    for (let k = 0; k < SUB; k++) {
      const t = k / SUB;
      fx.push(catmull(p0[0], p1[0], p2[0], p3[0], t));
      fy.push(catmull(p0[1], p1[1], p2[1], p3[1], t));
      fwr.push(p1[2] + (p2[2] - p1[2]) * t);
      fwl.push(p1[3] + (p2[3] - p1[3]) * t);
    }
  }
  const fn = fx.length;
  for (let i = 0; i < fn; i++) {
    const j = (i + 1) % fn;
    fs.push(fs[i] + Math.hypot(fx[j] - fx[i], fy[j] - fy[i]));
  }
  const rawLen = fs[fn];
  const k = SUZUKA_LENGTH / rawLen; // 全長を公式値へ厳密に合わせる
  const N = Math.round(SUZUKA_LENGTH / DS);
  const ds = SUZUKA_LENGTH / N;
  const T = {
    N, ds, length: SUZUKA_LENGTH,
    x: new Float32Array(N), y: new Float32Array(N), hdg: new Float32Array(N), curv: new Float32Array(N),
    wl: new Float32Array(N), wr: new Float32Array(N), z: new Float32Array(N), slope: new Float32Array(N),
    kerbL: new Float32Array(N), kerbR: new Float32Array(N),
    wallL: new Float32Array(N), wallR: new Float32Array(N),
    gravL: new Uint8Array(N), gravR: new Uint8Array(N), tyreL: new Uint8Array(N), tyreR: new Uint8Array(N),
    nx: new Float32Array(N), ny: new Float32Array(N), tx: new Float32Array(N), ty: new Float32Array(N),
  };
  // --- 2) 等間隔リサンプル ---
  let j = 0;
  for (let i = 0; i < N; i++) {
    const target = (i * ds) / k;
    while (fs[j + 1] < target) j++;
    const t = (target - fs[j]) / (fs[j + 1] - fs[j]);
    const j2 = (j + 1) % fn;
    T.x[i] = (fx[j] + (fx[j2] - fx[j]) * t) * k;
    T.y[i] = (fy[j] + (fy[j2] - fy[j]) * t) * k;
    // 幅員: 公称 10〜16m に合わせて下限を設ける
    T.wr[i] = fwr[j] + (fwr[j2] - fwr[j]) * t;
    T.wl[i] = fwl[j] + (fwl[j2] - fwl[j]) * t;
  }
  // OSM由来の折れ(局所的な曲率ノイズ)を均す。コーナー形状はほぼ変えない程度の弱い平滑化。
  // 高速コーナーほど広い窓で均す (低速コーナーの形は保つ)。
  {
    let sx = smoothArr(T.x, 3, 2), sy = smoothArr(T.y, 3, 2);
    const kap = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 3 + N) % N, b = (i + 3) % N;
      const ax = sx[i] - sx[a], ay = sy[i] - sy[a], bx = sx[b] - sx[i], by = sy[b] - sy[i];
      kap[i] = Math.abs(2 * (ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(sx[b] - sx[a], sy[b] - sy[a]) + 1e-9));
    }
    const kS = smoothArr(kap, 6, 2);
    let hw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let km = 0; for (let q = -14; q <= 14; q++) km = Math.max(km, kS[(i + q + N) % N]);
      hw[i] = clamp(0.2 / (km + 1e-4) / 2, 3, 10); // 窓の半幅[サンプル] ≒ 局所半径の20%
    }
    hw = smoothArr(hw, 8, 2);
    for (let pass = 0; pass < 2; pass++) {
      const ox2 = new Float32Array(N), oy2 = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const h = hw[i], hi2 = Math.floor(h), fr = h - hi2;
        let ax = 0, ay = 0, w = 0;
        for (let q = -hi2 - 1; q <= hi2 + 1; q++) {
          const ww = Math.abs(q) > hi2 ? fr : 1; if (ww <= 0) continue;
          const j = (i + q + N) % N; ax += T.x[j] * ww; ay += T.y[j] * ww; w += ww;
        }
        ox2[i] = ax / w; oy2[i] = ay / w;
      }
      T.x.set(ox2); T.y.set(oy2);
    }
    // 移動平均はコーナーを内側へ縮める (ずれ ≒ κσ²/2 ×パス数) ので、そのぶん外側へ戻す
    {
      const kx = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = (i - 3 + N) % N, b = (i + 3) % N;
        const ax = T.x[i] - T.x[a], ay = T.y[i] - T.y[a], bx = T.x[b] - T.x[i], by = T.y[b] - T.y[i];
        kx[i] = 2 * (ax * by - ay * bx) / (Math.hypot(ax, ay) * Math.hypot(bx, by) * Math.hypot(T.x[b] - T.x[a], T.y[b] - T.y[a]) + 1e-9);
      }
      const ks = smoothArr(kx, 3, 1);
      const nx2 = new Float32Array(N), ny2 = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = (i - 1 + N) % N, b = (i + 1) % N, tx = T.x[b] - T.x[a], ty = T.y[b] - T.y[a], l = Math.hypot(tx, ty);
        const h = hw[i], sig2 = (h * (h + 1) / 3 + 4) * ds * ds; // 可変窓 + 最初の固定窓(±3,2パス)ぶん
        const push = -ks[i] * sig2 * 0.8; // 右法線方向 (κ>0=右コーナーなら左へ)
        nx2[i] = T.x[i] + (-ty / l) * push; ny2[i] = T.y[i] + (tx / l) * push;
      }
      T.x.set(smoothArr(nx2, 1, 1)); T.y.set(smoothArr(ny2, 1, 1));
    }
    let len = 0; for (let i = 0; i < N; i++) { const q = (i + 1) % N; len += Math.hypot(T.x[q] - T.x[i], T.y[q] - T.y[i]); }
    const f = SUZUKA_LENGTH / len; // 残った僅かな誤差を補正して全長を公式値に一致させる
    for (let i = 0; i < N; i++) { T.x[i] *= f; T.y[i] *= f; }
    T.lengthFix = f;
  }
  // 原点をコントロールラインに
  const ox = T.x[0], oy = T.y[0];
  for (let i = 0; i < N; i++) { T.x[i] -= ox; T.y[i] -= oy; }
  {
    const wr = smoothArr(T.wr, 6, 2), wl = smoothArr(T.wl, 6, 2);
    for (let i = 0; i < N; i++) {
      const tot = clamp((wr[i] + wl[i]) * 1.05, 10, 16);
      const ratio = wr[i] / (wr[i] + wl[i]);
      T.wr[i] = tot * ratio; T.wl[i] = tot * (1 - ratio);
    }
  }
  // --- 3) 方位・曲率 ---
  let prev = 0;
  const hd = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let h = Math.atan2(T.y[b] - T.y[a], T.x[b] - T.x[a]);
    if (i > 0) { while (h - prev > Math.PI) h -= TAU; while (h - prev < -Math.PI) h += TAU; }
    hd[i] = h; prev = h;
  }
  const totalTurn = hd[N - 1] - hd[0];
  const wrapTurn = Math.round(totalTurn / TAU) * TAU; // 時計回り1周 = +2π
  const cv = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = (i - 1 + N) % N, b = (i + 1) % N;
    let d = hd[b] - hd[a];
    if (b < a || i === 0 || i === N - 1) { d = hd[b] - hd[a]; if (i === 0) d = hd[1] - (hd[N - 1] - wrapTurn); if (i === N - 1) d = (hd[0] + wrapTurn) - hd[N - 2]; }
    cv[i] = d / (2 * ds);
  }
  const cvs = smoothArr(cv, 3, 2);
  for (let i = 0; i < N; i++) {
    T.hdg[i] = hd[i]; T.curv[i] = cvs[i];
    T.tx[i] = Math.cos(hd[i]); T.ty[i] = Math.sin(hd[i]);
    T.nx[i] = -T.ty[i]; T.ny[i] = T.tx[i]; // 右向き法線
  }
  T.turnTotal = wrapTurn;

  // --- 4) 高低差 ---
  {
    const K = ELEVATION_KEYS, kn = K.length;
    const zr = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const s = i * ds; let a = kn - 1;
      for (let q = 0; q < kn; q++) if (K[q][0] <= s) a = q;
      const p1 = K[a], p2 = K[(a + 1) % kn], p0 = K[(a - 1 + kn) % kn], p3 = K[(a + 2) % kn];
      const s1 = p1[0], s2 = p2[0] + (a + 1 >= kn ? SUZUKA_LENGTH : 0);
      const t = (s - s1) / (s2 - s1);
      zr[i] = catmull(p0[1], p1[1], p2[1], p3[1], t);
    }
    const zs = smoothArr(zr, 20, 2);
    let mn = 1e9, mx = -1e9;
    for (let i = 0; i < N; i++) { mn = Math.min(mn, zs[i]); mx = Math.max(mx, zs[i]); }
    const sc = 52 / (mx - mn); // 高低差 約52m
    for (let i = 0; i < N; i++) T.z[i] = (zs[i] - mn) * sc;
    for (let i = 0; i < N; i++) T.slope[i] = (T.z[(i + 1) % N] - T.z[(i - 1 + N) % N]) / (2 * ds);
    T.zMin = 0; T.zMax = 52;
  }

  // --- 5) 立体交差の検出 ---
  T.cross = null;
  outer:
  for (let a = 0; a < N; a++) {
    for (let b = a + 100; b < N; b++) {
      const dx = T.x[a] - T.x[b], dy = T.y[a] - T.y[b];
      if (dx * dx + dy * dy < 2.2) { T.cross = { lo: a, hi: b }; break outer; }
    }
  }
  if (T.cross) {
    // より正確に
    let best = 1e9, ba = 0, bb = 0;
    for (let a = T.cross.lo - 4; a <= T.cross.lo + 8; a++) for (let b = T.cross.hi - 8; b <= T.cross.hi + 8; b++) {
      const dx = T.x[a] - T.x[b], dy = T.y[a] - T.y[b], d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; ba = a; bb = b; }
    }
    T.cross = { lo: ba, hi: bb, sLo: ba * ds, sHi: bb * ds, x: T.x[bb], y: T.y[bb], half: 24 };
  }
  const idxDist = (a, b) => { let d = Math.abs(a - b); return Math.min(d, N - d); };
  const nearCross = i => T.cross && (idxDist(i, T.cross.lo) * ds < 60 || idxDist(i, T.cross.hi) * ds < 60);

  // --- 6) 縁石 ---
  {
    const absk = new Float32Array(N);
    for (let i = 0; i < N; i++) absk[i] = T.curv[i];
    for (let i = 0; i < N; i++) {
      // 前後を見て最大曲率(符号付き)を取る
      let kin = 0, kout = 0;
      for (let q = -8; q <= 8; q++) { const c = absk[(i + q + N) % N]; if (Math.abs(c) > Math.abs(kin)) kin = c; }
      for (let q = -45; q <= 14; q++) { const c = absk[(i + q + N) % N]; if (Math.abs(c) > Math.abs(kout)) kout = c; }
      const KW = 1.7;
      if (Math.abs(kin) > 1 / 380) { if (kin > 0) T.kerbR[i] = KW; else T.kerbL[i] = KW; } // イン側
      if (Math.abs(kout) > 1 / 230) { if (kout > 0) T.kerbL[i] = KW; else T.kerbR[i] = KW; } // アウト側(立ち上がり)
    }
  }

  // --- 7) ランオフとバリア ---
  // 空間ハッシュ
  const CELL = 40;
  const grid = new Map();
  const key = (cx, cy) => cx * 100003 + cy;
  for (let i = 0; i < N; i++) {
    const kx = Math.floor(T.x[i] / CELL), ky = Math.floor(T.y[i] / CELL), kk = key(kx, ky);
    let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(i);
  }
  T._grid = grid; T._cell = CELL;
  const clearance = (px, py, self, sepSamples) => {
    // 他区間のアスファルト端までの距離
    let best = 1e9;
    const kx = Math.floor(px / CELL), ky = Math.floor(py / CELL);
    for (let gx = kx - 2; gx <= kx + 2; gx++) for (let gy = ky - 2; gy <= ky + 2; gy++) {
      const a = grid.get(key(gx, gy)); if (!a) continue;
      for (const q of a) {
        if (idxDist(q, self) < sepSamples) continue;
        if (nearCross(q) && nearCross(self)) continue;
        const d = Math.hypot(T.x[q] - px, T.y[q] - py) - Math.max(T.wl[q], T.wr[q]);
        if (d < best) best = d;
      }
    }
    return best;
  };
  const runL = new Float32Array(N), runR = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let kc = 0;
    for (let q = -40; q <= 65; q += 2) { const c = T.curv[(i + q + N) % N]; if (Math.abs(c) > Math.abs(kc)) kc = c; }
    const depth = 11 + 40 * sat(Math.abs(kc) * 105 - 0.12);
    let rl = 9, rr = 9;
    if (kc > 1 / 900) rl = depth; else if (kc < -1 / 900) rr = depth; // 外側が深い
    // 他区間との干渉でクリップ
    for (const side of [-1, 1]) {
      const want = side < 0 ? rl : rr, w = side < 0 ? T.wl[i] : T.wr[i];
      let t = 1.5;
      for (; t < want; t += 1) {
        const px = T.x[i] + T.nx[i] * side * (w + t), py = T.y[i] + T.ny[i] * side * (w + t);
        if (clearance(px, py, i, 70) < t + 2.5) break;
      }
      t = Math.min(t, want);
      if (side < 0) rl = t; else rr = t;
    }
    if (nearCross(i)) { rl = Math.min(rl, 1.6); rr = Math.min(rr, 1.6); }
    runL[i] = rl; runR[i] = rr;
  }
  // ピットレーン区間の定義 (距離m)
  const P = T.pit = {
    sEntry: 5222, sEntryEnd: 5330, sExitStart: 262, sExit: 372,
    speedLimit: 80 / 3.6,
  };
  const inRange = (s, a, b) => (a <= b ? s >= a && s <= b : s >= a || s <= b);
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    if (inRange(s, P.sEntry - 30, P.sExit + 20)) runR[i] = Math.min(runR[i], 1.4); // ピットウォール
    if (inRange(s, 5560, 330)) runL[i] = Math.min(runL[i], 6); // グランドスタンド側
  }
  {
    const sl = smoothArr(runL, 5, 2), sr = smoothArr(runR, 5, 2);
    for (let i = 0; i < N; i++) {
      const rl = Math.max(1.4, Math.min(sl[i], runL[i] + 3)), rr = Math.max(1.4, Math.min(sr[i], runR[i] + 3));
      T.wallL[i] = T.wl[i] + rl; T.wallR[i] = T.wr[i] + rr;
      T.gravL[i] = rl > 17 ? 1 : 0; T.gravR[i] = rr > 17 ? 1 : 0;
      T.tyreL[i] = rl > 13 ? 1 : 0; T.tyreR[i] = rr > 13 ? 1 : 0;
    }
  }
  T.gravelStart = 3.2; // 縁石の外の芝の幅[m]

  // --- 8) ピットレーン経路 (トラック座標 s,d で定義) ---
  {
    const laneOff = 9.5; // ピットウォールからレーン中心まで
    P.dAt = (s) => {
      // レーン中心の横位置(右+)。入口/出口でコースへ滑らかに合流
      const i = Math.round(s / ds) % N;
      const base = T.wr[i];
      const lane = base + 1.4 + laneOff;
      const onTrack = base - 2.6;
      let u;
      if (inRange(s, P.sEntry, P.sEntryEnd)) u = smooth((s - P.sEntry) / (P.sEntryEnd - P.sEntry));
      else if (inRange(s, P.sExitStart, P.sExit)) u = 1 - smooth((s - P.sExitStart) / (P.sExit - P.sExitStart));
      else u = 1;
      return onTrack + (lane - onTrack) * u;
    };
    P.length = (T.length - P.sEntry) + P.sExit;
    P.boxOffset = 5.2; // レーン中心からピットボックス中心まで
    P.boxS = []; // チームごとの停止位置 s
    for (let t = 0; t < 10; t++) P.boxS.push((5560 + t * 21) % T.length);
    P.contains = s => inRange(s, P.sEntry, P.sExit);
  }

  // --- 9) 描画用チャンク境界 ---
  T.CH = 12;
  T.chunks = [];
  for (let c = 0; c * T.CH < N; c++) {
    const a = c * T.CH, b = Math.min(N, a + T.CH);
    let cx = 0, cy = 0;
    for (let i = a; i < b; i++) { cx += T.x[i]; cy += T.y[i]; }
    cx /= (b - a); cy /= (b - a);
    let r = 0;
    for (let i = a; i <= b; i++) { const q = i % N; r = Math.max(r, Math.hypot(T.x[q] - cx, T.y[q] - cy) + Math.max(T.wallL[q], T.wallR[q]) + 4); }
    T.chunks.push({ a, b, cx, cy, r });
  }
  let mnx = 1e9, mxx = -1e9, mny = 1e9, mxy = -1e9;
  for (let i = 0; i < N; i++) { mnx = Math.min(mnx, T.x[i]); mxx = Math.max(mxx, T.x[i]); mny = Math.min(mny, T.y[i]); mxy = Math.max(mxy, T.y[i]); }
  T.bbox = { minX: mnx, maxX: mxx, minY: mny, maxY: mxy };

  attachQueries(T);
  return T;
}

function attachQueries(T) {
  const { N, ds } = T;
  const wrapI = i => ((i % N) + N) % N;
  T.wrapS = s => ((s % T.length) + T.length) % T.length;
  T.idx = s => wrapI(Math.round(s / ds));

  // (x,y) を (s,d) に変換。hint は前回の小数インデックス。
  T.locate = (x, y, hint, out, win = 14) => {
    let bi = 0, bd = 1e18;
    const h = Math.round(hint);
    for (let q = -win; q <= win; q++) {
      const i = wrapI(h + q);
      const dx = x - T.x[i], dy = y - T.y[i], d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    // 接線方向へ射影
    const dx = x - T.x[bi], dy = y - T.y[bi];
    let along = dx * T.tx[bi] + dy * T.ty[bi];
    let fi = bi + along / ds;
    // 曲率補正つきの横位置
    const i2 = wrapI(Math.floor(fi)), i3 = wrapI(i2 + 1), t = fi - Math.floor(fi);
    const cx = T.x[i2] + (T.x[i3] - T.x[i2]) * t, cy = T.y[i2] + (T.y[i3] - T.y[i2]) * t;
    const nx = T.nx[i2] + (T.nx[i3] - T.nx[i2]) * t, ny = T.ny[i2] + (T.ny[i3] - T.ny[i2]) * t;
    out.fi = ((fi % N) + N) % N;
    out.i = wrapI(Math.round(fi));
    out.s = out.fi * ds;
    out.d = (x - cx) * nx + (y - cy) * ny;
    out.dist2 = bd;
    return out;
  };
  T.locateGlobal = (x, y, out, excludeNear = -1) => {
    let bi = 0, bd = 1e18;
    for (let i = 0; i < N; i += 2) {
      const dx = x - T.x[i], dy = y - T.y[i], d2 = dx * dx + dy * dy;
      if (d2 < bd) { bd = d2; bi = i; }
    }
    return T.locate(x, y, bi, out, 4);
  };
  // (s,d) → ワールド座標
  T.pos = (s, d, out) => {
    const f = T.wrapS(s) / ds, i = Math.floor(f) % N, i2 = (i + 1) % N, t = f - Math.floor(f);
    const nx = T.nx[i] + (T.nx[i2] - T.nx[i]) * t, ny = T.ny[i] + (T.ny[i2] - T.ny[i]) * t;
    out.x = T.x[i] + (T.x[i2] - T.x[i]) * t + nx * d;
    out.y = T.y[i] + (T.y[i2] - T.y[i]) * t + ny * d;
    let h1 = T.hdg[i], h2 = T.hdg[i2]; if (i2 < i) h2 += T.turnTotal;
    out.h = h1 + (h2 - h1) * t;
    return out;
  };
  T.lerp = (arr, fi) => {
    const i = Math.floor(fi) % N, i2 = (i + 1) % N, t = fi - Math.floor(fi);
    return arr[i] + (arr[i2] - arr[i]) * t;
  };
  T.sectionAt = s => {
    for (const c of SECTIONS) if (s >= c.from && s < c.to) return c;
    return null;
  };
  // 路面種別: 0=舗装 1=縁石 2=芝 3=グラベル
  T.surface = (i, d) => {
    if (d >= 0) {
      const w = T.wr[i];
      if (d <= w) return 0;
      const k = T.kerbR[i];
      if (d <= w + k) return 1;
      if (T.gravR[i] && d > w + k + T.gravelStart) return 3;
      return 2;
    }
    const w = T.wl[i], e = -d;
    if (e <= w) return 0;
    const k = T.kerbL[i];
    if (e <= w + k) return 1;
    if (T.gravL[i] && e > w + k + T.gravelStart) return 3;
    return 2;
  };
  // s の符号付き差 (a - b) を [-L/2, L/2] に
  T.sDiff = (a, b) => { let d = a - b; const L = T.length; if (d > L / 2) d -= L; else if (d < -L / 2) d += L; return d; };
  // ピットレーン上の位置
  T.pitPos = (s, out) => {
    const d = T.pit.dAt(T.wrapS(s));
    T.pos(s, d, out);
    const e = 1.5, p2 = { x: 0, y: 0, h: 0 };
    T.pos(s + e, T.pit.dAt(T.wrapS(s + e)), p2);
    out.h = Math.atan2(p2.y - out.y, p2.x - out.x);
    out.d = d;
    return out;
  };
}
