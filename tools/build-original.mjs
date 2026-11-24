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
    // 手描きのレイアウト図をなぞった多角形 (画像のピクセル座標 × scale [m])。各頂点の角を半径 R の緩和曲線つき円弧で丸める
    // 頂点: [x, y, 半径, 緩和曲線の長さ, 名前, 番号]  先頭の頂点から次の頂点までがメインストレート
    name: 'ミストラル・テクニカルパーク', dir: 1, width: 12, cornerWidth: 13.5, line: 0.2, scale: 0.75,
    poly: [
      [1500, 1110, 200, 40, '最終コーナー', 18],
      [375, 1150, 40, 25, '1コーナー', 1],
      [380, 1000, 60, 25, '2コーナー', 2],
      [510, 912, 35, 22, '3コーナー', 3],
      [790, 1040, 40, 22, '4コーナー', 4],
      [1065, 830, 30, 20, '5コーナー', 5],
      [875, 560, 60, 25, '6コーナー', 6],
      [600, 575, 25, 18, '7コーナー', 7],
      [580, 752, 25, 18, '8コーナー', 8],
      [72, 755, 45, 25, '9コーナー', 9],
      [325, 172, 70, 30, '10コーナー', 10],
      [1022, 172, 45, 25, '11コーナー', 11],
      [1125, 745, 40, 20, 'ヘアピン入口', 12],
      [1300, 715, 40, 20, 'ヘアピン出口', 13],
      [1180, 182, 30, 20, '14コーナー', 14],
      [1440, 200, 120, 40, '15コーナー', 15],
      [1745, 520, 120, 40, '16コーナー', 16],
      [1735, 960, 100, 40, '17コーナー', 17],
    ],
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

function build(id, C) {
  const els = (C.poly ? polyToElements(C) : C.elements).map(e => e.slice());
  // 旋回角の合計を ±360° に合わせる
  const auto = els.find(e => e[0] === 'c' && e[1] === 'auto');
  const angOf = e => (e[0] === 'c' ? e[1] : e[0] === 'm' ? e[1].reduce((a, x) => a + x[0], 0) : 0);
  const fixed = els.filter(e => e !== auto).reduce((a, e) => a + angOf(e), 0);
  if (auto) auto[1] = C.dir * 360 - fixed;
  // 位置のずれ: 'adj' の直線 2 本の長さを連立方程式で調整して閉じる
  const adj = els.map((e, i) => (e[0] === 's' && e[2] === 'adj' ? i : -1)).filter(i => i >= 0);
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
  const L = r.len, gap = Math.hypot(r.x, r.y);
  // 約 5m 間隔で出力 (幅はコーナーで少し広げ、なめらかにつなぐ)
  const every = Math.round(5 / STEP), out = [];
  const N = r.pts.length - 1;
  for (let i = 0; i < N; i += every) {
    let kk = 0; for (let j = -40; j <= 40; j++) kk = Math.max(kk, Math.abs(r.pts[(i + j * 2 + N) % N][3]));
    const cw = Math.min(1, kk * 120), w = C.width + (C.cornerWidth - C.width) * cw;
    out.push([+r.pts[i][0].toFixed(2), +r.pts[i][1].toFixed(2), +(w / 2).toFixed(2), +(w / 2).toFixed(2)]);
  }
  const corners = r.marks.filter(m => m.el[0] === 'c' || m.el[0] === 'm').map(m => m.el[0] === 'c'
    ? { name: m.el[4], no: m.el[5], angle: Math.round(m.el[1]), radius: m.el[2], from: Math.round(m.from), to: Math.round(m.to) }
    : { name: m.el[3], no: m.el[4], angle: Math.round(angOf(m.el)), radius: Math.min(...m.el[1].map(x => x[1])), radii: m.el[1].map(x => x[1]), from: Math.round(m.from), to: Math.round(m.to) });
  const straights = r.marks.filter(m => m.el[0] === 's').map(m => ({ from: Math.round(m.from), to: Math.round(m.to) }));
  // 自分自身と近づきすぎていないか (コース上で 300m 以上離れた点どうしの最短距離)
  let minSep = 1e9, at = null;
  for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
    const ds = Math.min(j - i, out.length - (j - i)) * 5; if (ds < 300) continue;
    const dd = Math.hypot(out[i][0] - out[j][0], out[i][1] - out[j][1]); if (dd < minSep) { minSep = dd; at = [i * 5, j * 5]; }
  }
  console.log(`${id}: 全長 ${L.toFixed(1)}m  閉合誤差 ${gap.toFixed(3)}m  点数 ${out.length}  自己間隔の最小 ${minSep.toFixed(0)}m (s=${at})  調整直線 ${adj.map(i => els[i][1].toFixed(0)).join(', ')}  自動コーナー ${auto ? auto[1].toFixed(1) + '°' : '-'}`);
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
