// 架空サーキット (オリジナル版) のコース中心線を生成する
//   node tools/build-original.mjs [プレビュー出力先ディレクトリ]
//   → src/variants/original/data/courses.js
//
// 実在のサーキットの図面やデータは使わない。「直線」と「緩和曲線つきの円弧」を順に並べ、曲率を積分して中心線を作る。
// 旋回角の合計は必ず ±360° になるよう最後のコーナーで合わせ、位置のずれは指定した 2 本の直線の長さで解いて閉じる。
// 形の性格だけを既存コースから借りている:
//   bayside  … インディの性格 (高速の左回りオーバル、バンク付きのターン) を、ホームベース形の 5 ターンに変形
//   mistral  … 手描きのレイアウト図 (低速〜中速のコーナーが続くテクニカルコース) をなぞって作る
//   horizon  … 富士の性格 (長いメインストレート) を、高速・中速コーナー主体のコースに再構成
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const D2R = Math.PI / 180, STEP = 0.25;

// 要素: ['s', 長さ, 調整用?] / ['c', 旋回角(度, 右回り+), 半径, 緩和曲線の長さ, 名前, 番号]
//       ['m', [[旋回角, 半径], ...], 緩和曲線の長さ, 名前, 番号] … 複数の半径を緩和曲線でつないだ 1 つのコーナー
//         (2 つの半径を持つ複合コーナーや、左右に切り返す S 字。旋回角の符号が違えば切り返しになる)
//   旋回角に 'auto' を指定したコーナーは、合計が ±360° になるよう角度を決める (1 つだけ)
const COURSES = {
  bayside: {
    name: 'ベイサイド・スーパースピードウェイ', dir: -1, width: 17, cornerWidth: 18,
    elements: [
      ['s', 300],
      ['c', -90, 190, 80, 'ターン1', 1],
      ['s', 200],
      ['c', -45, 280, 60, 'ターン2', 2],
      ['s', 330, 'adj'],
      ['c', 'auto', 185, 80, 'ターン3', 3],
      ['s', 330, 'adj'],
      ['c', -45, 280, 60, 'ターン4', 4],
      ['s', 260],
      ['c', -90, 190, 80, 'ターン5', 5],
      ['s', 500],
    ],
  },
  mistral: {
    // 手描きのレイアウト図の線をそのままなぞった曲線 (tools/data/mistral-trace.json、写真のピクセル座標 × scale [m])
    // 手描きの揺れをならし (smooth = ガウス平滑の幅 [m])、角のない曲線のまま中心線にする。コーナーは曲率から自動で区切る
    name: 'ミストラル・テクニカルパーク', dir: 1, width: 12, cornerWidth: 13.5, scale: 0.68, smooth: 14, spiral: 55,
    trace: 'tools/data/mistral-trace.json', start: [1060, 1170],
  },
  horizon: {
    name: 'ホライゾン・ハイスピードサーキット', dir: 1, width: 15, cornerWidth: 17,
    elements: [
      ['s', 600],
      ['c', 100, 85, 45, '1コーナー', 1],
      ['s', 200],
      ['c', -35, 260, 60, '2コーナー', 2],
      ['s', 150],
      ['c', 70, 170, 55, '3コーナー', 3],
      ['s', 650, 'adj'],
      ['c', 55, 220, 60, '4コーナー', 4],
      ['s', 200],
      ['c', -40, 140, 45, '5コーナー', 5],
      ['s', 120],
      ['c', 90, 65, 40, '6コーナー', 6],
      ['s', 250, 'adj'],
      ['c', 45, 300, 70, '7コーナー', 7],
      ['s', 250],
      ['c', -60, 110, 45, '8コーナー', 8],
      ['s', 120],
      ['c', 70, 90, 40, '9コーナー', 9],
      ['s', 80],
      ['c', 'auto', 110, 45, '最終コーナー', 10],
      ['s', 800],
    ],
  },
};

// 1 要素ぶんの曲率を、距離 u (0〜長さ) の関数として返す
function profile(el) {
  if (el[0] === 's') return { len: el[1], k: () => 0 };
  if (el[0] === 'm') {
    // 曲率の折れ点: 0 → k1 (一定 L1) → k2 (一定 L2) … → 0。区間ごとの旋回角が指定どおりになるよう Li = |θi|Ri − rp
    const [, arcs, rp] = el, knots = [[0, 0]]; let u = 0;
    for (const [ang, R] of arcs) {
      const k = Math.sign(ang) / R, L = Math.abs(ang) * D2R * R - rp;
      if (L < 0) throw new Error(`緩和曲線が長すぎる: ${JSON.stringify(arcs)}`);
      u += rp; knots.push([u, k]); u += L; knots.push([u, k]);
    }
    u += rp; knots.push([u, 0]);
    return { len: u, k: x => { for (let i = 1; i < knots.length; i++) if (x <= knots[i][0]) { const [a, ka] = knots[i - 1], [b, kb] = knots[i]; return b > a ? ka + (kb - ka) * (x - a) / (b - a) : kb; } return 0; } };
  }
  const [, ang, R, rp] = el, th = Math.abs(ang) * D2R, sg = Math.sign(ang);
  if (th * R < rp) throw new Error(`緩和曲線が長すぎる: ${el}`);
  const len = th * R + rp;   // 台形の曲率分布 (立ち上がり rp, 一定区間, 戻り rp) で旋回角が th になる
  return { len, k: u => sg / R * Math.min(1, u / rp, (len - u) / rp, 1) };
}

function integrate(els) {
  let x = 0, y = 0, h = 0, s = 0; const pts = [[0, 0, 0, 0]], marks = [];
  for (const el of els) {
    const pr = profile(el), n = Math.max(1, Math.round(pr.len / STEP)), d = pr.len / n, s0 = s;
    for (let i = 0; i < n; i++) {
      const k = pr.k((i + 0.5) * d);
      h += k * d / 2; x += Math.cos(h) * d; y += Math.sin(h) * d; h += k * d / 2; s += d;
      pts.push([x, y, s, k]);
    }
    marks.push({ el, from: s0, to: s });
  }
  return { pts, marks, x, y, h, len: s };
}

// 頂点を並べた多角形を、角を丸めた「直線 + 緩和曲線つき円弧」の要素列に変換する
function polyToElements(C) {
  const sc = C.scale || 1, P = C.poly.map(([x, y, ...r]) => [x * sc, y * sc, ...r]), n = P.length, hd = [], len = [];
  for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; hd.push(Math.atan2(b[1] - a[1], b[0] - a[0])); len.push(Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const turn = i => { let d = hd[i] - hd[(i - 1 + n) % n]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };   // 頂点 i での旋回角
  const tan = i => { const th = Math.abs(turn(i)), [, , R, rp] = P[i]; return R * Math.tan(th / 2) + rp / 2; };     // 頂点から曲がり始めまでの距離 (近似)
  const els = [], straight = i => { const v = len[i] - tan(i) - tan((i + 1) % n); if (v < 5) throw new Error(`辺 ${i} が短すぎる (${v.toFixed(0)}m)`); return v; };
  const s0 = straight(0), before = s0 * C.line;
  els.push(['s', s0 - before]);
  for (let i = 1; i <= n; i++) {
    const k = i % n, [, , R, rp, name, no] = P[k];
    els.push(['c', +(turn(k) / D2R).toFixed(4), R, rp, name, no]);
    if (k !== 0) els.push(['s', straight(k)]);
  }
  els.push(['s', before]);
  // 位置の閉合に使う直線: 長い直線のうち、向きが最も直交に近い 2 本
  const cand = []; let h = 0;
  els.forEach((e, i) => { if (e[0] === 'c') h += e[1] * D2R; else if (i > 0 && i < els.length - 1 && e[1] > 120) cand.push({ i, h }); });
  let best = null; for (const a of cand) for (const b of cand) { const q = Math.abs(Math.sin(a.h - b.h)); if (a.i < b.i && (!best || q > best.q)) best = { q, a: a.i, b: b.i }; }
  els[best.a][2] = 'adj'; els[best.b][2] = 'adj';
  return els;
}

// なぞった曲線 → 一定間隔の点列 (平滑化・コントロールラインを先頭に)・曲率
function fromTrace(C) {
  const raw = JSON.parse(fs.readFileSync(path.join(root, C.trace), 'utf8')).points.map(([x, y]) => [x * C.scale, y * C.scale]);
  const resample = (P, step) => {
    const n = P.length, d = [0]; for (let i = 0; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; d.push(d[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = d[n], m = Math.round(L / step), out = []; let j = 0;
    for (let k = 0; k < m; k++) { const s = k * L / m; while (d[j + 1] < s) j++; const t = (s - d[j]) / (d[j + 1] - d[j]), a = P[j], b = P[(j + 1) % n]; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
    return out;
  };
  const gauss = (P, sig) => {   // 周期境界のガウス平滑 (sig は点の数)
    const n = P.length, r = Math.ceil(sig * 3), w = []; let ws = 0; for (let i = -r; i <= r; i++) { w.push(Math.exp(-0.5 * (i / sig) ** 2)); ws += w[w.length - 1]; }
    return P.map((_, i) => { let x = 0, y = 0; for (let k = -r; k <= r; k++) { const q = P[((i + k) % n + n) % n], ww = w[k + r]; x += q[0] * ww; y += q[1] * ww; } return [x / ws, y / ws]; });
  };
  const ds = 1;
  let P = gauss(resample(raw, ds), C.smooth / ds); P = resample(P, STEP);
  // コントロールライン (start に最も近い点) を先頭に
  const st = [C.start[0] * C.scale, C.start[1] * C.scale]; let i0 = 0, bd = 1e18;
  P.forEach((p, i) => { const d = (p[0] - st[0]) ** 2 + (p[1] - st[1]) ** 2; if (d < bd) { bd = d; i0 = i; } });
  P = P.slice(i0).concat(P.slice(0, i0));
  const n = P.length, h = P.map((p, i) => { const q = P[(i + 1) % n]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
  const k = h.map((_, i) => { let d = h[i] - h[(i - 1 + n) % n]; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d / STEP; });
  const ks = gauss(k.map(v => [v, 0]), 8).map(v => v[0]);
  const x0 = P[0][0], y0 = P[0][1];
  const pts = P.map((p, i) => [p[0] - x0, p[1] - y0, i * STEP, ks[i]]); pts.push([0, 0, n * STEP, ks[0]]);
  // コーナーの区切り: 曲率 1/400 を超える区間 (30m 未満の切れ目はつなぐ、旋回 20° 未満は除く)
  const on = ks.map(v => Math.abs(v) > 1 / 400), segs = [];
  for (let i = 0; i < n; i++) if (on[i] && !on[(i - 1 + n) % n]) { let j = i; while (on[(j + 1) % n] && j - i < n) j++; segs.push([i, j]); }
  const merged = []; for (const sg of segs) { const last = merged[merged.length - 1]; if (last && (sg[0] - last[1]) * STEP < 30 && Math.sign(ks[sg[0]]) === Math.sign(ks[last[1]])) last[1] = sg[1]; else merged.push(sg.slice()); }
  const corners = []; for (const [a, b] of merged) { let ang = 0, kmax = 0; for (let i = a; i <= b; i++) { ang += ks[i % n] * STEP; kmax = Math.max(kmax, Math.abs(ks[i % n])); } if (Math.abs(ang) * 180 / Math.PI < 20) continue; corners.push({ angle: Math.round(ang * 180 / Math.PI), radius: Math.round(1 / kmax), from: Math.round(a * STEP), to: Math.round(b * STEP) }); }
  let no = 0; for (const c of corners) { no++; c.no = no; c.name = Math.abs(c.angle) >= 150 && c.to - c.from < 220 ? 'ヘアピン' : no === corners.length ? '最終コーナー' : `${no}コーナー`; }
  const straights = corners.map((c, i) => ({ from: c.to, to: i + 1 < corners.length ? corners[i + 1].from : Math.round(n * STEP) })); straights.unshift({ from: 0, to: corners[0].from });
  return { pts, len: n * STEP, x: 0, y: 0, corners, straights, minR: Math.round(1 / Math.max(...ks.map(Math.abs))) };
}

// なぞった曲線 → 多角形 (頂点ごとの半径つき)。直線部分の位置と向きは図のまま、コーナーだけ一定半径の円弧に置き換える
//   各直線の中央 6 割を通る直線を引き、隣り合う直線の交点を頂点にする。
//   120° を超えるコーナーは途中の接線でさらに 2 つの頂点に分け、2 つの R を持つ複合コーナーは曲率の谷で分ける。
//   半径は円弧が図の線のコーナーの頂上を通るように決める
function traceToPoly(C, noSplit = new Set()) {
  const r = fromTrace(C), P = r.pts.slice(0, -1), ks = P.map(p => p[3]), n = P.length, cs = r.corners, m = cs.length;
  const pt = i => P[((i % n) + n) % n];
  const tangent = i => { const a = pt(i - 20), b = pt(i + 20); return Math.atan2(b[1] - a[1], b[0] - a[0]); };   // ±5m
  const ang = (u, v) => { let t = 0; for (let i = u; i < v; i++) t += ks[((i % n) + n) % n] * STEP; return t; };
  const straightLine = j => {   // 直線 j: コーナー j-1 の終わり〜コーナー j の始まり
    const a0 = j === 0 ? cs[m - 1].to - n * STEP : cs[j - 1].to, b0 = j === m ? cs[0].from + n * STEP : cs[j].from;
    const u = Math.round((a0 + (b0 - a0) * 0.2) / STEP), v = Math.round((a0 + (b0 - a0) * 0.8) / STEP), A = pt(u), B = pt(v);
    return { x: (A[0] + B[0]) / 2, y: (A[1] + B[1]) / 2, h: Math.atan2(B[1] - A[1], B[0] - A[0]) };
  };
  const lines = [straightLine(0)], vR = [], vName = [];
  cs.forEach((c, ci) => {
    const a = Math.round(c.from / STEP), b = Math.round(c.to / STEP);
    const seg = ks.slice(a, b).map(Math.abs), mx = Math.max(...seg), im = seg.indexOf(mx);
    let cut = -1;
    for (const dir of [-1, 1]) {
      let lo = im, i = im; while (i + dir >= 0 && i + dir < seg.length) { i += dir; if (seg[i] < seg[lo]) lo = i; if (seg[lo] < mx * 0.6 && seg[i] > mx * 0.7) { cut = lo; break; } }
      if (cut >= 0) break;
    }
    let parts = cut > 0 && !noSplit.has(ci) ? [[a, a + cut], [a + cut, b]] : [[a, b]];
    // 120° を超える部分は旋回角の半分の所で分ける (1 つにまとめ直すコーナーは 150° まで分けない)
    parts = parts.flatMap(([u, v]) => { const t = ang(u, v); if (Math.abs(t) * 180 / Math.PI <= (noSplit.has(ci) ? 150 : 120)) return [[u, v]]; let acc = 0, mid = u; for (let i = u; i < v; i++) { acc += ks[i] * STEP; if (Math.abs(acc) >= Math.abs(t) / 2) { mid = i; break; } } return [[u, mid], [mid, v]]; });
    const radius = ([u, v]) => { const sub = ks.slice(u, v).map(Math.abs), pk = Math.max(...sub), top = sub.filter(x => x >= pk * 0.8); return Math.max(25, Math.round(top.length / top.reduce((t, x) => t + x, 0))); };
    parts.forEach((pp, k) => {
      vR.push(radius(pp)); vName.push(ci);
      if (k < parts.length - 1) { const i = pp[1], q = pt(i); lines.push({ x: q[0], y: q[1], h: tangent(i) }); }
    });
    if (ci < m - 1) lines.push(straightLine(ci + 1));
  });
  // 頂点 k = 直線 k-1 と直線 k の交点 (頂点 0 は最後の直線とメインストレート)
  const N = lines.length, inter = (L1, L2) => {
    const d1 = [Math.cos(L1.h), Math.sin(L1.h)], d2 = [Math.cos(L2.h), Math.sin(L2.h)], den = d1[0] * d2[1] - d1[1] * d2[0];
    const t = ((L2.x - L1.x) * d2[1] - (L2.y - L1.y) * d2[0]) / den; return [L1.x + d1[0] * t, L1.y + d1[1] * t];
  };
  // vR / vName は「直線 k と直線 k+1 の間の頂点」の順。頂点 0 (最後の直線→メインストレート) は最後の要素
  const verts = []; for (let k = 0; k < N; k++) { const v = inter(lines[(k - 1 + N) % N], lines[k]), idx = (k - 1 + N) % N; verts.push([v[0], v[1], vR[idx], vName[idx]]); }
  // 名前と番号 (分けた頂点も同じコーナー番号)
  const names = cs.map((c, ci) => { const no = ci + 1, ap = Math.abs(c.angle), rr = Math.min(...verts.filter(v => v[3] === ci).map(v => v[2]));
    return ap >= 150 && rr < 40 ? 'ヘアピン' : no === m ? '最終コーナー' : `${no}コーナー`; });
  const poly = verts.map(([x, y, R, ci]) => [x, y, R, 0, names[ci], ci + 1]);
  // 半径: 円弧が図の線のコーナーの頂上 (頂点に最も近い点) を通るように。距離 d と旋回角 θ から R = d / (1/cos(θ/2) − 1)
  const near = (k) => { const c = cs[poly[k][5] - 1], a = Math.round((c.from - 60) / STEP), b = Math.round((c.to + 60) / STEP); let d = 1e9; for (let i = a; i <= b; i++) { const q = pt(i); d = Math.min(d, Math.hypot(q[0] - poly[k][0], q[1] - poly[k][1])); } return d; };
  for (let k = 0; k < N; k++) {
    const a = poly[(k - 1 + N) % N], b = poly[k], c = poly[(k + 1) % N]; let th = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); while (th > Math.PI) th -= 2 * Math.PI; while (th < -Math.PI) th += 2 * Math.PI;
    poly[k][2] = Math.max(25, Math.round(near(k) / (1 / Math.cos(Math.abs(th) / 2) - 1)));
  }
  // 緩和曲線: 円弧の長さの半分と spiral [m] の小さい方 (円弧部分が必ず残るように)
  for (let k = 0; k < N; k++) {
    const h0 = Math.atan2(poly[k][1] - poly[(k - 1 + N) % N][1], poly[k][0] - poly[(k - 1 + N) % N][0]), h1 = Math.atan2(poly[(k + 1) % N][1] - poly[k][1], poly[(k + 1) % N][0] - poly[k][0]);
    let d = h1 - h0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    poly[k][3] = +Math.min(C.spiral || 25, Math.abs(d) * poly[k][2] * 0.5).toFixed(1);
  }
  // 隣り合うコーナーの円弧が辺に収まらない所 (同じコーナーを分けた頂点どうしなど) は、2 つの半径を同じ比で少し小さくする
  const turnAt = k => { const a = poly[(k - 1 + N) % N], b = poly[k], c = poly[(k + 1) % N]; let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  const tanOf = k => poly[k][2] * Math.tan(turnAt(k) / 2) + poly[k][3] / 2;
  for (let k = 0; k < N; k++) {
    const k2 = (k + 1) % N;
    const len = Math.hypot(poly[k2][0] - poly[k][0], poly[k2][1] - poly[k][1]);
    for (let it = 0; it < 50 && tanOf(k) + tanOf(k2) > len - 6; it++) for (const q of [k, k2]) { poly[q][2] = +(poly[q][2] * 0.97).toFixed(1); poly[q][3] = +Math.min(C.spiral || 25, turnAt(q) * poly[q][2] * 0.5).toFixed(1); }
  }
  // 半径 30m 未満になった複合コーナーは、分けずに 1 つの円弧で作り直す
  const tight = new Set(poly.filter((v, k) => v[2] < 30 && poly.some((w, j) => j !== k && w[5] === v[5])).map(v => v[5] - 1).filter(ci => !noSplit.has(ci)));
  if (tight.size) return traceToPoly(C, new Set([...noSplit, ...tight]));
  // コントロールライン: メインストレート (頂点 0→1) 上の start の位置
  const st = [0, 0], A = poly[0], B = poly[1];   // fromTrace はコントロールラインを原点にしている
  const e0 = Math.hypot(B[0] - A[0], B[1] - A[1]), proj = ((st[0] - A[0]) * (B[0] - A[0]) + (st[1] - A[1]) * (B[1] - A[1])) / e0;
  const line = (proj - tanOf(0)) / (e0 - tanOf(0) - tanOf(1));   // 直線部分 (両端の円弧を除く) の中での割合
  console.log('  頂点', poly.map(v => `(${v[0].toFixed(0)},${v[1].toFixed(0)}) R${v[2]}`).join(' '));
  return { poly, line };
}

function build(id, C) {
  const els = (C.trace ? polyToElements({ ...C, ...traceToPoly(C), scale: 1 }) : C.poly ? polyToElements(C) : C.elements).map(e => e.slice());
  // 旋回角の合計を ±360° に合わせる
  const auto = els.find(e => e[0] === 'c' && e[1] === 'auto');
  const angOf = e => (e[0] === 'c' ? e[1] : e[0] === 'm' ? e[1].reduce((a, x) => a + x[0], 0) : 0);
  const fixed = els.filter(e => e !== auto).reduce((a, e) => a + angOf(e), 0);
  if (auto) auto[1] = C.dir * 360 - fixed;
  // 位置のずれ: 'adj' の直線 2 本の長さを連立方程式で調整して閉じる
  const adj = els.map((e, i) => (e[0] === 's' && e[2] === 'adj' ? i : -1)).filter(i => i >= 0);
  const adj0 = adj.map(i => els[i][1]);
  for (let it = 0; it < 3; it++) {
    const r = integrate(els);
    if (adj.length !== 2) break;
    const hd = adj.map(i => { let h = 0; for (let j = 0; j < i; j++) h += angOf(els[j]) * D2R; return h; });
    const a = Math.cos(hd[0]), b = Math.cos(hd[1]), c = Math.sin(hd[0]), d = Math.sin(hd[1]), det = a * d - b * c;
    const dl0 = (-r.x * d + r.y * b) / det, dl1 = (-a * r.y + c * r.x) / det;
    els[adj[0]][1] += dl0; els[adj[1]][1] += dl1;
    if (els[adj[0]][1] < 30 || els[adj[1]][1] < 30) throw new Error(`${id}: 調整用の直線が短くなりすぎた (${els[adj[0]][1].toFixed(0)}, ${els[adj[1]][1].toFixed(0)})`);
  }
  const r = integrate(els);
  if (adj.length === 2) console.log(`  調整直線 ${adj0.map(v => v.toFixed(0))} → ${adj.map(i => els[i][1].toFixed(0))}`);
  return finish(id, C, r, adj.map(i => els[i][1]), auto);
}

const angOfEl = e => (e[0] === 'c' ? e[1] : e[0] === 'm' ? e[1].reduce((t, x) => t + x[0], 0) : 0);
function finish(id, C, r, adjLens, auto) {
  const L = r.len, gap = Math.hypot(r.x, r.y);
  // 約 5m 間隔で出力 (幅はコーナーで少し広げ、なめらかにつなぐ)
  const every = Math.round(5 / STEP), out = [];
  const N = r.pts.length - 1;
  for (let i = 0; i < N; i += every) {
    let kk = 0; for (let j = -40; j <= 40; j++) kk = Math.max(kk, Math.abs(r.pts[(i + j * 2 + N) % N][3]));
    const cw = Math.min(1, kk * 120), w = C.width + (C.cornerWidth - C.width) * cw;
    out.push([+r.pts[i][0].toFixed(2), +r.pts[i][1].toFixed(2), +(w / 2).toFixed(2), +(w / 2).toFixed(2)]);
  }
  const corners = r.corners || r.marks.filter(m => m.el[0] === 'c' || m.el[0] === 'm').map(m => m.el[0] === 'c'
    ? { name: m.el[4], no: m.el[5], angle: Math.round(m.el[1]), radius: m.el[2], from: Math.round(m.from), to: Math.round(m.to) }
    : { name: m.el[3], no: m.el[4], angle: Math.round(angOfEl(m.el)), radius: Math.min(...m.el[1].map(x => x[1])), radii: m.el[1].map(x => x[1]), from: Math.round(m.from), to: Math.round(m.to) });
  // 頂点を分けた同じ番号のコーナーは 1 つにまとめる (間の直線もコーナーに含める)
  for (let i = corners.length - 1; i > 0; i--) { const a = corners[i - 1], b = corners[i]; if (a.no === b.no) { a.to = b.to; a.angle += b.angle; a.radii = [...(a.radii || [a.radius]), ...(b.radii || [b.radius])]; a.radius = Math.min(...a.radii); corners.splice(i, 1); } }
  const straights = r.straights || r.marks.filter(m => m.el[0] === 's').map(m => ({ from: Math.round(m.from), to: Math.round(m.to) }));
  // 自分自身と近づきすぎていないか (コース上で 300m 以上離れた点どうしの最短距離)
  let minSep = 1e9, at = null;
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const ds = Math.min(j - i, out.length - (j - i)) * 5; if (ds < 300) continue;
    const dd = Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1]); if (dd < minSep) { minSep = dd; at = [i * 5, j * 5]; }
  }
  console.log(`${id}: 全長 ${L.toFixed(1)}m  閉合誤差 ${gap.toFixed(3)}m  点数 ${out.length}  自己間隔の最小 ${minSep.toFixed(0)}m (s=${at})  調整直線 ${adjLens.map(v => v.toFixed(0)).join(', ') || '-'}${r.minR ? '  最小半径 ' + r.minR + 'm' : ''}  自動コーナー ${auto ? auto[1].toFixed(1) + '°' : '-'}`);
  return { id, name: C.name, dir: C.dir, length: +L.toFixed(1), points: out, corners, straights, minSep: Math.round(minSep) };
}

const res = {}; for (const [id, C] of Object.entries(COURSES)) res[id] = build(id, C);
const dir = path.join(root, 'src/variants/original/data'); fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'courses.js'), `// 架空サーキットの中心線データ (自動生成: tools/build-original.mjs)。実在のサーキットの図面・データは使用していない。
// 形式: points = [x, y, 右側幅, 左側幅] 単位m。x=東, y=南(画面下向き)。点間隔 約5m、先頭がコントロールライン。
// corners / straights はコントロールラインからの距離 [m]
${Object.values(res).map(c => `export const ${c.id.toUpperCase()} = ${JSON.stringify({ length: c.length, dir: c.dir, corners: c.corners, straights: c.straights, points: c.points })};`).join('\n')}
`);
if (process.argv[2]) fs.writeFileSync(path.join(process.argv[2], 'courses-preview.json'), JSON.stringify(res));
