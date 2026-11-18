// インディ (スーパースピードウェイ) の中心線データを生成する。
//   node tools/build-indy.mjs
// コース図 (長方形に近いオーバル・反時計回り・4つの90度ターン) と、全長 4023m / ストレート 1006m から形を決めている:
//   長いストレート 1006m ×2、短いストレート 201m ×2、ターン 402m (半径 約256m) ×4。
//   ターンの入口と出口は曲率を40mかけて滑らかにつなぐ。
import { writeFileSync } from 'fs';
const LENGTH = 4023, R = 256, RAMP = 40, STEP = 0.5;
const turnLen = Math.PI / 2 * R + RAMP;                 // 台形の曲率分布で合計90度
const longS = 1006 - RAMP, shortS = 201 - RAMP;
const START = 0.69;                                     // コントロールラインはフロントストレッチの69%地点 (図の旗の位置)
const segs = [['s', longS * (1 - START)], ['t'], ['s', shortS], ['t'], ['s', longS], ['t'], ['s', shortS], ['t'], ['s', longS * START]];
// 曲率を積分して経路を作る。x=東, y=南。南向きに発進し、左 (東) へ曲がる = 画面上で反時計回り。
let x = 0, y = 0, h = Math.PI / 2; const path = [[0, 0, 0]];
for (const [type, len] of segs) {
  const L = type === 's' ? len : turnLen, n = Math.round(L / STEP), d = L / n;
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) * d;
    const k = type === 's' ? 0 : -Math.min(1, u / RAMP, (L - u) / RAMP) / R;   // 左回りは負
    h += k * d / 2; x += Math.cos(h) * d; y += Math.sin(h) * d; h += k * d / 2;
    path.push([x, y, Math.abs(k) * R]);
  }
}
// 閉合誤差を全体に配分し、全長を合わせる
const n = path.length - 1, ex = path[n][0], ey = path[n][1];
for (let i = 0; i <= n; i++) { path[i][0] -= ex * i / n; path[i][1] -= ey * i / n; }
let tot = 0; for (let i = 1; i <= n; i++) tot += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
const sc = LENGTH / tot;
// 約5m間隔で出力。幅はストレート15m、ターン18m
const out = []; const every = Math.round(5 / STEP);
for (let i = 0; i < n; i += every) { const p = path[i], w = 7.5 + 1.5 * p[2]; out.push([+(p[0] * sc).toFixed(2), +(p[1] * sc).toFixed(2), +w.toFixed(2), +w.toFixed(2)]); }
console.log('閉合誤差', Math.hypot(ex, ey).toFixed(2), 'm  積分長', tot.toFixed(1), 'm  点数', out.length);
writeFileSync(new URL('../src/data/indy.js', import.meta.url), `// インディ (スーパースピードウェイ) コース中心線データ (自動生成: tools/build-indy.mjs)
// 出典: 提供されたコース図の形 (長方形に近いオーバル) と、全長 4023m・ストレート 1006m・ターン4つ から推定したもの。
//       測量データではないため、形状は近似です。
// 形式: [x, y, 右側幅, 左側幅] 単位m。x=東, y=南(画面下向き)。点間隔 約5m、反時計回り、先頭がコントロールライン。
export const INDY_LENGTH = ${LENGTH};
export const INDY_POINTS = ${JSON.stringify(out)};
`);
