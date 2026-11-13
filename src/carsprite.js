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
  g.strokeStyle = '#2a2d31'; g.lineWidth = 0.045;
  const arm = (x1, y1, x2, y2) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.moveTo(x1, -y1); g.lineTo(x2, -y2); g.stroke(); };
  arm(1.95, 0.2, CAR.a, 0.68); arm(1.3, 0.26, CAR.a, 0.68); arm(1.62, 0.22, 1.62, 0.7);
  arm(-0.85, 0.3, -CAR.b, 0.6); arm(-1.55, 0.2, -CAR.b, 0.6); arm(-1.23, 0.25, -1.23, 0.62);

  // --- フロア / アンダートレイ ---
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(1.15, 0.3); g.lineTo(0.95, 0.76); g.lineTo(-0.95, 0.76); g.lineTo(-1.45, 0.42); g.lineTo(-1.7, 0.3);
  g.lineTo(-1.7, -0.3); g.lineTo(-1.45, -0.42); g.lineTo(-0.95, -0.76); g.lineTo(0.95, -0.76); g.lineTo(1.15, -0.3); g.closePath(); g.fill();

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
    g.moveTo(0.92, sgn * 0.36); g.lineTo(0.98, sgn * 0.7); g.quadraticCurveTo(0.2, sgn * 0.76, -0.75, sgn * 0.7);
    g.quadraticCurveTo(-1.15, sgn * 0.62, -1.4, sgn * 0.3); g.lineTo(-0.9, sgn * 0.28); g.closePath();
  };
  for (const sg of [1, -1]) {
    g.fillStyle = c1; pod(sg); g.fill();
    // ラジエター吸気口
    g.fillStyle = '#0c0d0f'; g.beginPath(); g.moveTo(0.99, sg * 0.4); g.lineTo(0.99, sg * 0.68); g.lineTo(0.84, sg * 0.66); g.lineTo(0.84, sg * 0.42); g.closePath(); g.fill();
    // ストライプ
    g.fillStyle = c2; g.beginPath(); g.moveTo(0.6, sg * 0.56); g.lineTo(-0.7, sg * 0.56); g.lineTo(-0.82, sg * 0.69); g.lineTo(0.55, sg * 0.725); g.closePath(); g.fill();
    g.fillStyle = c3; g.fillRect(-0.6, sg > 0 ? 0.5 : -0.54, 1.1, 0.04);
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
    g.beginPath(); g.moveTo(2.44, 0.1); g.lineTo(2.44, 0.7); g.lineTo(2.02, 0.7); g.lineTo(2.08, 0.12); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(2.44, -0.1); g.lineTo(2.44, -0.7); g.lineTo(2.02, -0.7); g.lineTo(2.08, -0.12); g.closePath(); g.fill();
    g.fillStyle = shade(c2, 0.2); g.fillRect(2.28, 0.12, 0.14, 0.56); g.fillRect(2.28, -0.68, 0.14, 0.56);
    g.fillStyle = c1; g.fillRect(1.98, 0.68, 0.5, 0.055); g.fillRect(1.98, -0.735, 0.5, 0.055); // 翼端板
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
  [CAR.a, -0.84, 0.64, 0.30, 1], [CAR.a, 0.84, 0.64, 0.30, 1],
  [-CAR.b, -0.80, 0.68, 0.44, 0], [-CAR.b, 0.80, 0.68, 0.44, 0],
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

// メニュー等で使う大きめの静止画 (横向き)
export function drawCarShowcase(canvas, team, number) {
  const g = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  g.clearRect(0, 0, W, H);
  const sc = Math.min(W / 5.2, H / 2.6);
  g.save(); g.translate(W / 2, H / 2); g.scale(sc, sc);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0.05, 0.1, 2.35, 0.95, 0, 0, 6.3); g.fill();
  drawCar(g, { x: 0, y: 0, yaw: 0, delta: 0, dmgF: 0, dmgR: 0 }, team, { number });
  g.restore();
}
