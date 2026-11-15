// OK-90 (1990年前後のF1を参考にした架空マシン) のトップビュー描画
// スプライトは車体中心(重心)を原点、ノーズを +x 方向として生成する。
import { CAR } from './physics.js';

export const SPR_SCALE = 34;          // px / m
const SW = 5.4, SH = 2.9;             // スプライトが覆う範囲 [m]
const cache = new Map();

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f >= 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// team: {c1,c2,c3}, opts: {noFront, noRear, ghost, number}
export function carSprite(team, opts = {}) {
  const key = `${team.c1}${team.c2}${team.c3}|${opts.noFront ? 1 : 0}${opts.noRear ? 1 : 0}${opts.ghost ? 1 : 0}|${opts.number || ''}`;
  let s = cache.get(key);
  if (s) return s;
  const cv = makeCanvas(Math.round(SW * SPR_SCALE), Math.round(SH * SPR_SCALE));
  const g = cv.getContext('2d');
  g.translate(cv.width / 2, cv.height / 2);
  g.scale(SPR_SCALE, SPR_SCALE);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const { c1, c2, c3 } = team;
  const dark = '#15171a';

  // --- サスペンションアーム ---
  g.strokeStyle = '#2f3338'; g.lineWidth = 0.065;
  const arm = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.moveTo(x1, -y1); g.lineTo(x2, -y2); g.stroke(); };
  arm(1.95, 0.2, CAR.a, 0.9); arm(1.3, 0.26, CAR.a, 0.9); arm(1.62, 0.22, 1.62, 0.88);
  arm(-0.85, 0.3, -CAR.b, 0.86); arm(-1.55, 0.2, -CAR.b, 0.86); arm(-1.23, 0.25, -1.23, 0.84);

  // --- フロア / アンダートレイ ---
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(1.15, 0.3); g.lineTo(0.95, 0.58); g.lineTo(-0.95, 0.6); g.lineTo(-1.45, 0.42); g.lineTo(-1.7, 0.3);
  g.lineTo(-1.7, -0.3); g.lineTo(-1.45, -0.42); g.lineTo(-0.95, -0.6); g.lineTo(0.95, -0.58); g.lineTo(1.15, -0.3); g.closePath(); g.fill();

  // --- リアウイング ---
  if (!opts.noRear) {
    g.fillStyle = shade(c2, -0.15);
    g.fillRect(-2.14, -0.5, 0.56, 1.0);
    g.fillStyle = c2; g.fillRect(-2.1, -0.47, 0.2, 0.94);
    g.fillStyle = shade(c2, 0.18); g.fillRect(-1.86, -0.47, 0.22, 0.94);
    g.fillStyle = c1; g.fillRect(-2.16, -0.53, 0.6, 0.06); g.fillRect(-2.16, 0.47, 0.6, 0.06); // 翼端板
    g.fillStyle = c3; g.fillRect(-1.99, -0.3, 0.1, 0.6);
  } else {
    g.fillStyle = '#333'; g.fillRect(-1.75, -0.08, 0.2, 0.16);
  }

  // --- サイドポンツーン (細長い) ---
  const pod = sgn => {
    g.beginPath();
    g.moveTo(0.95, sgn * 0.34); g.lineTo(1.0, sgn * 0.7); g.quadraticCurveTo(0.3, sgn * 0.75, -0.45, sgn * 0.72);
    g.quadraticCurveTo(-0.9, sgn * 0.64, -1.5, sgn * 0.22); g.lineTo(-0.9, sgn * 0.28); g.closePath();
  };
  for (const sg of [1, -1]) {
    g.fillStyle = c1; pod(sg); g.fill();
    // ラジエター吸気口
    g.fillStyle = '#0c0d0f'; g.beginPath(); g.moveTo(1.0, sg * 0.36); g.lineTo(1.0, sg * 0.69); g.lineTo(0.86, sg * 0.68); g.lineTo(0.86, sg * 0.38); g.closePath(); g.fill();
    // ストライプ
    g.fillStyle = c2; g.beginPath(); g.moveTo(0.6, sg * 0.57); g.lineTo(-0.45, sg * 0.55); g.lineTo(-0.58, sg * 0.67); g.lineTo(0.55, sg * 0.71); g.closePath(); g.fill();
    g.fillStyle = c3; g.fillRect(-0.42, sg > 0 ? 0.49 : -0.53, 0.98, 0.04);
  }

  // --- モノコック / ノーズ (低いノーズ) ---
  g.fillStyle = c1;
  g.beginPath();
  g.moveTo(2.38, 0.07); g.quadraticCurveTo(1.6, 0.19, 1.05, 0.33); g.lineTo(0.2, 0.4); g.lineTo(-0.5, 0.36);
  g.quadraticCurveTo(-1.2, 0.3, -1.72, 0.17); g.lineTo(-1.72, -0.17); g.quadraticCurveTo(-1.2, -0.3, -0.5, -0.36);
  g.lineTo(0.2, -0.4); g.lineTo(1.05, -0.33); g.quadraticCurveTo(1.6, -0.19, 2.38, -0.07); g.closePath(); g.fill();
  // ノーズ上面のハイライト
  const grd = g.createLinearGradient(0, -0.4, 0, 0.4);
  grd.addColorStop(0, 'rgba(0,0,0,0.22)'); grd.addColorStop(0.42, 'rgba(255,255,255,0.20)'); grd.addColorStop(0.58, 'rgba(255,255,255,0.12)'); grd.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grd; g.fill();
  // ノーズのセカンドカラー
  g.fillStyle = c2;
  g.beginPath(); g.moveTo(2.38, 0.07); g.quadraticCurveTo(2.0, 0.13, 1.75, 0.17); g.lineTo(1.75, -0.17); g.quadraticCurveTo(2.0, -0.13, 2.38, -0.07); g.closePath(); g.fill();
  g.fillStyle = c3; g.fillRect(1.66, -0.19, 0.07, 0.38);
  // ゼッケン
  if (opts.number != null) {
    g.save(); g.translate(1.36, 0); g.rotate(Math.PI / 2);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, 0.15, 0, 6.3); g.fill();
    g.fillStyle = '#111'; g.font = 'bold 0.2px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(String(opts.number), 0, 0.012); g.restore();
  }

  // --- エンジンカバー ---
  g.fillStyle = shade(c1, -0.12);
  g.beginPath(); g.moveTo(-0.15, 0.2); g.quadraticCurveTo(-0.9, 0.24, -1.68, 0.1); g.lineTo(-1.68, -0.1); g.quadraticCurveTo(-0.9, -0.24, -0.15, -0.2); g.closePath(); g.fill();
  g.fillStyle = c2; g.beginPath(); g.moveTo(-0.3, 0.07); g.lineTo(-1.6, 0.04); g.lineTo(-1.6, -0.04); g.lineTo(-0.3, -0.07); g.closePath(); g.fill();
  // エアインテーク
  g.fillStyle = '#0b0b0c'; g.beginPath(); g.ellipse(-0.14, 0, 0.1, 0.16, 0, 0, 6.3); g.fill();
  g.fillStyle = shade(c1, 0.15); g.beginPath(); g.ellipse(-0.22, 0, 0.08, 0.17, 0, 0, 6.3); g.fill();

  // --- コックピット ---
  g.fillStyle = '#0d0e10';
  g.beginPath(); g.ellipse(0.38, 0, 0.42, 0.24, 0, 0, 6.3); g.fill();
  // ステアリングとヘルメット
  g.fillStyle = '#2b2b2b'; g.fillRect(0.6, -0.13, 0.05, 0.26);
  g.fillStyle = opts.helmet || c3; g.beginPath(); g.arc(0.25, 0, 0.15, 0, 6.3); g.fill();
  g.fillStyle = c2; g.fillRect(0.18, -0.15, 0.06, 0.3);
  g.fillStyle = 'rgba(20,24,30,0.9)'; g.beginPath(); g.arc(0.3, 0, 0.13, -0.9, 0.9); g.fill();
  // 風防
  g.strokeStyle = 'rgba(190,220,255,0.55)'; g.lineWidth = 0.035; g.beginPath(); g.arc(0.5, 0, 0.3, -0.75, 0.75); g.stroke();
  // ミラー
  g.fillStyle = c1; g.fillRect(0.68, 0.36, 0.1, 0.12); g.fillRect(0.68, -0.48, 0.1, 0.12);

  // --- フロントウイング (幅広) ---
  if (!opts.noFront) {
    g.fillStyle = shade(c2, -0.1);
    g.beginPath(); g.moveTo(2.44, 0.1); g.lineTo(2.44, 0.67); g.lineTo(2.02, 0.67); g.lineTo(2.08, 0.12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2.44, -0.1); g.lineTo(2.44, -0.67); g.lineTo(2.02, -0.67); g.lineTo(2.08, -0.12); g.closePath(); g.fill();
    g.fillStyle = shade(c2, 0.2); g.fillRect(2.28, 0.12, 0.14, 0.54); g.fillRect(2.28, -0.66, 0.14, 0.54);
    g.fillStyle = c1; g.fillRect(1.98, 0.67, 0.5, 0.055); g.fillRect(1.98, -0.725, 0.5, 0.055); // 翼端板
  }

  if (opts.ghost) {
    g.globalCompositeOperation = 'source-in'; g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(120,220,255,0.55)'; g.fillRect(0, 0, cv.width, cv.height);
  }
  s = { cv, w: SW, h: SH };
  cache.set(key, s);
  return s;
}

// タイヤ位置 [x, y, 長さ, 幅, 操舵するか]
export const WHEELS = [
  [CAR.a, -0.9, 0.68, 0.34, 1], [CAR.a, 0.9, 0.68, 0.34, 1],
  [-CAR.b, -0.86, 0.72, 0.48, 0], [-CAR.b, 0.86, 0.72, 0.48, 0],
];

// ctx はワールド座標系(1=1m)に変換済みであること
export function drawCar(ctx, car, team, opts = {}) {
  const ghost = !!opts.ghost;
  ctx.save();
  ctx.translate(car.x, car.y); ctx.rotate(car.yaw);
  // タイヤ
  const tcol = opts.tyreColor;
  for (let k = 0; k < 4; k++) {
    const w = WHEELS[k];
    ctx.save(); ctx.translate(w[0], w[1]); if (w[4]) ctx.rotate(car.delta || 0);
    ctx.fillStyle = ghost ? 'rgba(120,220,255,0.4)' : '#101113';
    const hl = w[2] / 2, hw = w[3] / 2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-hl, -hw, w[2], w[3], 0.09); else ctx.rect(-hl, -hw, w[2], w[3]);
    ctx.fill();
    if (!ghost) {
      ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(-hl + 0.06, -hw + 0.05, w[2] - 0.12, w[3] * 0.28);
      if (tcol) { ctx.fillStyle = tcol; ctx.fillRect(-0.05, k % 2 ? hw - 0.07 : -hw + 0.02, 0.1, 0.05); }
    }
    ctx.restore();
  }
  const sp = carSprite(team, { noFront: car.dmgF > 0.55, noRear: car.dmgR > 0.65, ghost, number: opts.number });
  ctx.drawImage(sp.cv, -sp.w / 2, -sp.h / 2, sp.w, sp.h);
  ctx.restore();
}

// タイトル画面の静止画: 左向きの側面図 (1990年頃のF1のプロポーション。単位 m、地面 y=0、上が負)
export function drawCarShowcase(canvas, team, number) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const sc = Math.min(W / 5.1, H / 1.45);
  g.save(); g.translate(W / 2 + 0.12 * sc, H / 2 + 0.56 * sc); g.scale(sc, sc);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const c1 = team.c1, c2 = team.c2, c3 = team.c3, DK = '#15171c';
  const FX = -1.47, RX = 1.43, FR = 0.315, RR = 0.34;      // 前後の車軸と車輪半径
  const path = pts => { g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath(); };
  // 接地の影
  g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(0, 0.015, 2.35, 0.035, 0, 0, 6.3); g.fill();
  // 反対側の後輪 (奥)
  // フロア / ディフューザー
  g.fillStyle = DK; path([[-1.05, -0.05], [1.62, -0.05], [1.85, -0.2], [1.62, -0.11], [-1.05, -0.11]]); g.fill();
  // リヤウイング (翼端板・支柱)
  g.fillStyle = DK; g.fillRect(1.5, -0.52, 0.07, 0.3);
  g.fillStyle = c2; path([[1.5, -0.97], [2.06, -0.97], [2.06, -0.36], [1.94, -0.3], [1.62, -0.3], [1.5, -0.42]]); g.fill();
  g.fillStyle = c3; g.fillRect(1.5, -0.97, 0.56, 0.045);
  // フロントウイング
  g.fillStyle = c3; path([[-2.5, -0.075], [-2.0, -0.115], [-1.98, -0.085], [-2.5, -0.045]]); g.fill();
  g.fillStyle = c2; path([[-2.52, -0.2], [-1.98, -0.2], [-1.98, -0.04], [-2.52, -0.04]]); g.fill();
  g.fillStyle = c3; g.fillRect(-2.52, -0.2, 0.54, 0.03);
  // モノコック〜エンジンカバー
  const body = () => {
    g.beginPath(); g.moveTo(-2.48, -0.13);
    g.bezierCurveTo(-2.3, -0.2, -1.7, -0.36, -1.05, -0.5);     // 低いノーズが緩やかに上がる
    g.lineTo(-0.72, -0.56);                                     // コクピット前縁
    g.lineTo(-0.5, -0.5); g.lineTo(-0.02, -0.5);                // コクピット開口
    g.bezierCurveTo(0.0, -0.78, 0.1, -0.97, 0.3, -0.97);       // ロールフープ / インダクションポッド
    g.bezierCurveTo(0.62, -0.97, 1.05, -0.62, 1.66, -0.4);     // エンジンカバー
    g.lineTo(1.7, -0.2); g.lineTo(1.4, -0.1); g.lineTo(-1.0, -0.1);
    g.bezierCurveTo(-1.6, -0.1, -2.2, -0.1, -2.48, -0.13); g.closePath();
  };
  body(); g.fillStyle = c1; g.fill();
  g.save(); body(); g.clip();
  g.fillStyle = c2; path([[-2.6, -0.1], [1.8, -0.1], [1.8, -0.25], [0.9, -0.2], [-2.6, -0.16]]); g.fill();   // 下縁の帯
  g.fillStyle = c3; path([[-2.6, -0.185], [0.9, -0.225], [1.8, -0.275], [1.8, -0.25], [0.9, -0.2], [-2.6, -0.16]]); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.16)'; path([[-2.5, -0.2], [-1.0, -0.53], [-0.7, -0.57], [-0.7, -0.52], [-2.5, -0.17]]); g.fill();   // 上面のハイライト
  g.fillStyle = 'rgba(0,0,0,0.14)'; path([[0.25, -1.0], [0.6, -1.0], [1.7, -0.42], [1.7, -0.3], [0.5, -0.62]]); g.fill();
  g.restore();
  // インダクションポッドの吸気口
  g.fillStyle = DK; g.beginPath(); g.ellipse(0.1, -0.86, 0.035, 0.075, 0.25, 0, 6.3); g.fill();
  // サイドポンツーン
  g.beginPath(); g.moveTo(-0.58, -0.12); g.lineTo(-0.58, -0.4); g.quadraticCurveTo(-0.5, -0.47, -0.3, -0.47);
  g.bezierCurveTo(0.3, -0.47, 0.75, -0.42, 1.12, -0.3); g.lineTo(1.2, -0.12); g.closePath();
  g.fillStyle = c1; g.fill(); g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 0.014; g.stroke();
  g.fillStyle = DK; path([[-0.58, -0.38], [-0.5, -0.4], [-0.5, -0.16], [-0.58, -0.14]]); g.fill();          // 吸気口
  g.fillStyle = c2; path([[-0.5, -0.12], [1.2, -0.12], [1.16, -0.2], [-0.5, -0.2]]); g.fill();
  g.fillStyle = c3; g.fillRect(-0.5, -0.215, 1.655, 0.02);
  // ゼッケン
  g.fillStyle = c3; g.beginPath(); g.arc(-1.02, -0.33, 0.115, 0, 6.3); g.fill();
  g.fillStyle = c2; g.font = '800 0.17px "Roboto Condensed","Helvetica Neue",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(number), -1.02, -0.32);
  // チーム名 (架空)
  g.fillStyle = c3; g.font = 'italic 800 0.15px "Roboto Condensed","Helvetica Neue",sans-serif'; g.fillText('OK-90', 0.3, -0.325);
  // ドライバー
  g.fillStyle = DK; path([[-0.5, -0.5], [-0.02, -0.5], [-0.03, -0.6], [-0.45, -0.56]]); g.fill();
  g.fillStyle = c3; g.beginPath(); g.arc(-0.2, -0.66, 0.125, 0, 6.3); g.fill();
  g.fillStyle = c1; g.beginPath(); g.arc(-0.2, -0.66, 0.125, Math.PI * 1.05, Math.PI * 1.75); g.lineTo(-0.2, -0.66); g.fill();
  g.fillStyle = DK; path([[-0.33, -0.69], [-0.22, -0.7], [-0.22, -0.63], [-0.325, -0.62]]); g.fill();       // バイザー
  g.strokeStyle = DK; g.lineWidth = 0.02; g.beginPath(); g.moveTo(-0.62, -0.57); g.lineTo(-0.66, -0.66); g.stroke();   // ミラー
  g.fillStyle = c1; g.fillRect(-0.7, -0.7, 0.08, 0.05);
  // サスペンション
  g.strokeStyle = DK; g.lineWidth = 0.022;
  g.beginPath(); g.moveTo(FX, -FR - 0.12); g.lineTo(-1.15, -0.44); g.moveTo(FX, -FR + 0.1); g.lineTo(-1.2, -0.2); g.stroke();
  // 車輪
  const wheel = (x, r) => {
    g.fillStyle = '#17181b'; g.beginPath(); g.arc(x, -r, r, 0, 6.3); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 0.02; g.beginPath(); g.arc(x, -r, r * 0.9, 0, 6.3); g.stroke();
    g.strokeStyle = '#e9c63a'; g.lineWidth = 0.012; g.beginPath(); g.arc(x, -r, r * 0.74, 0, 6.3); g.stroke();   // タイヤのロゴ帯
    g.fillStyle = '#c9ccd2'; g.beginPath(); g.arc(x, -r, r * 0.52, 0, 6.3); g.fill();
    g.fillStyle = '#6d727c'; g.beginPath(); g.arc(x, -r, r * 0.42, 0, 6.3); g.fill();
    g.strokeStyle = '#c9ccd2'; g.lineWidth = 0.03;
    for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - 0.3; g.beginPath(); g.moveTo(x, -r); g.lineTo(x + Math.cos(a) * r * 0.48, -r + Math.sin(a) * r * 0.48); g.stroke(); }
    g.fillStyle = '#2a2d33'; g.beginPath(); g.arc(x, -r, r * 0.13, 0, 6.3); g.fill();
  };
  wheel(FX, FR); wheel(RX, RR);
  g.restore();
}
