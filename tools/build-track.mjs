// コース中心線データの変換スクリプト
//   node tools/build-track.mjs <Suzuka.csv>
// 入力: TUMFTM racetrack-database の Suzuka.csv (x_m, y_m, w_tr_right_m, w_tr_left_m / 5m間隔)
// 出力: src/data/suzuka.js  (スタートライン起点・画面座標系(y下向き)・全長5807mに正規化)
import fs from 'fs';
const src = process.argv[2];
if (!src) { console.error('usage: node tools/build-track.mjs Suzuka.csv'); process.exit(1); }
const rows = fs.readFileSync(src, 'utf8').trim().split('\n').filter(l => !l.startsWith('#')).map(l => l.split(',').map(Number));
const n = rows.length;
const OFFICIAL_LENGTH = 5807;
const START_OFFSET = 270; // 元データ起点(最終コーナー出口)からコントロールラインまでの距離[m]

let L = 0; const cum = [0];
for (let i = 0; i < n; i++) { const a = rows[i], b = rows[(i + 1) % n]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); cum.push(L); }
const scale = OFFICIAL_LENGTH / L;

// スタートラインに最も近い点から並べ直す
let i0 = 0; while (cum[i0 + 1] < START_OFFSET) i0++;
const out = [];
const ox = rows[i0][0], oy = rows[i0][1];
for (let k = 0; k < n; k++) {
  const r = rows[(i0 + k) % n];
  // y を反転して画面座標系へ (北が上)。左右の幅は進行方向基準なのでそのまま。
  out.push([(r[0] - ox) * scale, -(r[1] - oy) * scale, r[2], r[3]].map(v => Math.round(v * 100) / 100));
}
const js = `// 鈴鹿サーキット コース中心線データ (自動生成: tools/build-track.mjs)
// 出典: TUMFTM racetrack-database (https://github.com/TUMFTM/racetrack-database) LGPL-3.0
//       中心線は OpenStreetMap (© OpenStreetMap contributors, ODbL) 由来、幅員は衛星画像から抽出されたもの。
// 形式: [x, y, 右側幅, 左側幅] 単位m。x=東, y=南(画面下向き)。点間隔 約5m、時計回り、先頭がコントロールライン。
export const SUZUKA_LENGTH = ${OFFICIAL_LENGTH};
export const SUZUKA_POINTS = ${JSON.stringify(out)};
`;
fs.writeFileSync(new URL('../src/data/suzuka.js', import.meta.url), js);
console.log('points', n, 'raw length', L.toFixed(1), 'scale', scale.toFixed(5), 'start index', i0);
