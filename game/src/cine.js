// エンディング映像: 自機が母艦 (巨大戦艦) の横を駆け抜け、旋回してこちらへ向かってきて THE END。
// 時刻は曲 (music/ending.py) と同期: 22.0 秒 = 曲の 8 小節目の頭 (全奏) = 自機が画面いっぱいに迫る瞬間
import { G, vib } from './state.js';
import { M } from './models.js';
import { initWorld } from './world.js';
import { drawText } from './font.js';
import { clamp, damp, lerp, sat, TAU, PI, easeOut } from './util.js';

export const CINE_END = 22.0;   // 自機が迫り切る (THE END)
export const CINE_CARD = 25.0;  // 戦績を表示

// 母艦: 全長 ≈ 630 (z 30〜660)。ゆっくり前進する
const SHIP_S = 6, SHIP0 = [75, -25, 330], SHIP_V = 4, HERO_S = 2.6;
// 自機の通過点 [時刻, x, y, z] (エルミート補間、接線は前後の点から求めるので速度が途切れない)
const KF = [
  [-1.0, -7, 6, -165],
  [0.0, -6, 6, -60],
  [1.5, -4, 5, 80],        // 艦尾のエンジンを越えて
  [4.5, -2, 4, 360],       // 船腹すれすれを駆け抜ける (ここで勝利のロール)
  [7.0, -3, 6, 600],
  [7.9, -5, 14, 700],      // 艦首を越えて
  [8.6, -6, 22, 770],      // 艦首の前で左へ大きく一回転 (中心 (-96, 30, 770)・半径 90)
  [10.3, -96, 34, 860],
  [12.0, -186, 42, 770],
  [13.7, -96, 36, 680],
  [15.4, -8, 30, 770],
  [17.5, -14, 28, 860],    // こちらへ (母艦を背に)
  [19.5, -22, 27, 920],
  [21.0, -27, 26, 942],
  [22.0, -29, 25.5, 948],  // 目の前 (カメラ C2 の 12 前方)
  [23.0, -31, 27, 972],
  [24.0, -33, 30, 1010],
];
// カット割り: 0〜7 秒は自機を追うチェイスカメラ、7 秒からは艦首の前方に置いた固定カメラ C2 (母艦の方を向く)
const CUT = 7.0, C2 = [-30, 25, 960];
// 遠景の星 (カメラ中心の天球)
const SKY = [];
for (let i = 0; i < 260; i++) {
  const u = Math.random() * 2 - 1, a = Math.random() * TAU, r = Math.sqrt(1 - u * u);
  SKY.push([r * Math.cos(a), u, r * Math.sin(a), 0.3 + Math.random() * 0.7]);
}

function hermite(t, out) {
  let i = 0;
  while (i < KF.length - 2 && t > KF[i + 1][0]) i++;
  const a = KF[i], b = KF[i + 1];
  const pa = KF[Math.max(0, i - 1)], nb = KF[Math.min(KF.length - 1, i + 2)];
  const h = b[0] - a[0], u = clamp((t - a[0]) / h, 0, 1);
  const u2 = u * u, u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
  for (let k = 1; k <= 3; k++) {
    const ma = (b[k] - pa[k]) / (b[0] - pa[0] || 1) * h;
    const mb = (nb[k] - a[k]) / (nb[0] - a[0] || 1) * h;
    out[k - 1] = h00 * a[k] + h10 * ma + h01 * b[k] + h11 * mb;
  }
  return out;
}

const _p = [0, 0, 0], _q = [0, 0, 0], _r = [0, 0, 0];

export function startCine() {
  G.cine = { t: 0, trail: [], yaw: 0, pitch: 0, roll: 0, yr: 0, cy: 0.2, cp: 0, passed: false, passed2: false, ended: false };
  initWorld('home');
  G.V = 9; G.VS = 0; G.hyper = 0; G.warp = 0; G.warpOut = 0;
  G.flash = [1, 1, 1, 1];               // ワープアウトの白から明ける
  G.gfx.clearTrails();
  G.audio.playEnding();
}

// 映像を飛ばして THE END へ
export function skipCine() {
  const c = G.cine;
  if (!c || c.t >= CINE_END) return;
  c.t = CINE_END - 0.05; c.trail.length = 0;
}

export function updateCine(dt) {
  const c = G.cine;
  if (!c) return;
  c.t += dt;
  const t = c.t;
  // 自機
  const ft = Math.min(t, 23.5);
  hermite(ft, _p); hermite(ft + 0.02, _q);
  const vx = (_q[0] - _p[0]) / 0.02, vy = (_q[1] - _p[1]) / 0.02, vz = (_q[2] - _p[2]) / 0.02;
  const sp = Math.hypot(vx, vy, vz) || 1;
  const yaw = Math.atan2(vx, vz), pitch = -Math.asin(clamp(vy / sp, -1, 1));
  let dy = yaw - c.yaw; dy = ((dy + PI) % TAU + TAU) % TAU - PI;
  const yr = dy / Math.max(dt, 1e-3);
  c.yr = damp(c.yr, yr, 4, dt);
  c.yaw = yaw; c.pitch = pitch;
  // 旋回でバンク (+x が機体の右。左旋回 = ヨー減少 = 左翼が下がる = ロールは正)。船腹の通過中に勝利のロールを 1 回
  const bank = -clamp(c.yr * 0.75, -1.25, 1.25);
  const vroll = t > 3.4 && t < 4.8 ? easeOut((t - 3.4) / 1.4) * TAU : (t >= 4.8 ? TAU : 0);
  c.roll = bank + vroll;
  c.x = _p[0]; c.y = _p[1]; c.z = _p[2];
  // 航跡 (エンジン位置)
  const tr = c.trail;
  tr.push(c.x - Math.sin(yaw) * 3.5 * HERO_S, c.y + Math.sin(pitch) * 3.5 * HERO_S, c.z - Math.cos(yaw) * 3.5 * HERO_S);
  if (tr.length > 3 * 110) tr.splice(0, 3);
  // 母艦
  c.sx = SHIP0[0]; c.sy = SHIP0[1]; c.sz = SHIP0[2] + SHIP_V * t;
  // 通過音
  if (!c.passed && t > CUT + 0.6) { c.passed = true; G.audio.flyby(0.6, 0.8, 2.2); }
  if (!c.passed2 && t > CINE_END - 0.35) { c.passed2 = true; G.audio.flyby(0, 1, 3); }
  if (!c.ended && t >= CINE_END) {
    c.ended = true;
    G.flash = [1, 1, 1, 1]; G.trauma = 0.6; vib(120);
  }
  // カメラ
  const g = G.gfx;
  const sh = G.trauma * G.trauma;
  let cx, cyy, cz, croll = 0, fov = 0.95;
  if (t < CUT) {
    // チェイス: 自機の左後ろ上。船体が右側を流れていく
    cx = c.x - 7; cyy = c.y + 4.5; cz = c.z - 24;
    const fx = c.x + Math.sin(yaw) * 30, fy = c.y + 1, fz = c.z + Math.cos(yaw) * 30;
    c.cy = Math.atan2(fx - cx, fz - cz); c.cp = Math.atan2(fy - cyy, Math.hypot(fx - cx, fz - cz));
    croll = bank * 0.25;
  } else {
    if (!c.cut) { c.cut = true; g.clearTrails(); c.cy = 1e9; }
    cx = C2[0] - 0.25 * (t - CUT); cyy = C2[1] + 0.1 * (t - CUT); cz = C2[2];
    const tyaw = Math.atan2(c.x - cx, c.z - cz), tpit = Math.atan2(c.y - cyy, Math.hypot(c.x - cx, c.z - cz));
    if (c.cy > 1e8) { c.cy = tyaw; c.cp = tpit; }
    let d = tyaw - c.cy; d = ((d + PI) % TAU + TAU) % TAU - PI;   // 振り向きは近い側へ
    const k = t > CINE_END ? 0.5 : 3.0;
    fov = lerp(0.68, 0.95, sat((t - 18.5) / 3.5));   // 望遠で母艦と旋回を大きく → 接近に合わせて広角へ
    c.cy += d * (1 - Math.exp(-k * dt)); c.cp = damp(c.cp, tpit, k, dt);
  }
  g.setCamera(cx + sh * Math.sin(t * 47) * 0.8, cyy + sh * Math.sin(t * 53) * 0.6, cz, c.cy, c.cp, croll + Math.sin(t * 0.3) * 0.02, fov);
  g.bendX = 0; g.bendY = 0;
  g.fogNear = 500; g.fogFar = 1700;
}

export function drawCineWorld(g, t) {
  const c = G.cine;
  if (!c) return;
  const T = c.t;
  // 遠景の星
  const cm = g.cam;
  for (const q of SKY) {
    const X = cm.x + q[0] * 900, Y = cm.y + q[1] * 900, Z = cm.z + q[2] * 900;
    g.line3(X, Y, Z, X + q[0] * 3, Y + q[1] * 3, Z + q[2] * 3, 0.5 * q[3], 0.6 * q[3], 0.9 * q[3], 1.2);
  }
  // 母艦
  g.mesh(M.battleship, c.sx, c.sy, c.sz, 0, 0, 0, SHIP_S, 0.42, 0.72, 1, 2.0);
  // エンジンの噴射光 (艦尾)
  const pulse = 0.75 + 0.25 * Math.sin(t * 9);
  for (const [x, y, r] of [[-5, 1.6, 2.6], [5, 1.6, 2.6], [0, -2.2, 2.2], [-11, -0.8, 1.8], [11, -0.8, 1.8]]) {
    const X = c.sx + x * SHIP_S, Y = c.sy + y * SHIP_S, Z = c.sz - 55 * SHIP_S;
    g.mesh(M.ring24, X, Y, Z, 0, 0, t * 2, r * SHIP_S * 0.8, 1, 0.55 * pulse, 0.2, 2.4);
    g.mesh(M.ring24, X, Y, Z - 8, 0, 0, -t * 3, r * SHIP_S * 0.55, 1, 0.75, 0.4, 2.0);
    g.line3(X, Y, Z, X, Y, Z - 60 - 20 * pulse, 1, 0.5, 0.15, 3.0);
  }
  // 航行灯 (点滅)
  for (let i = 0; i < 9; i++) {
    const z = c.sz + (-44 + i * 11) * SHIP_S;
    const on = ((t * 2 + i * 0.37) % 1) < 0.25;
    if (!on) continue;
    for (const s of [1, -1]) {
      const X = c.sx + s * 10.2 * SHIP_S * (i > 6 ? 0.7 : 1), Y = c.sy + 0.2 * SHIP_S;
      g.line3(X, Y - 1.2, z, X, Y + 1.2, z, s > 0 ? 0.3 : 1, s > 0 ? 1 : 0.3, 0.4, 3.0);
    }
  }
  // 自機の航跡
  const tr = c.trail, n = tr.length / 3;
  for (let i = 1; i < n; i++) {
    const a = i / n;
    g.line3(tr[(i - 1) * 3], tr[(i - 1) * 3 + 1], tr[(i - 1) * 3 + 2], tr[i * 3], tr[i * 3 + 1], tr[i * 3 + 2], 0.3 * a, 0.85 * a, 1 * a, 1 + 1.8 * a);
  }
  // 自機
  if (T < 23.5) {
    g.mesh(M.hero, c.x, c.y, c.z, c.yaw, c.pitch, c.roll, HERO_S, 0.85, 0.95, 1, 2.3);
    // エンジンの光
    const ex = c.x - Math.sin(c.yaw) * 3.5 * HERO_S, ey = c.y + Math.sin(c.pitch) * 3.5 * HERO_S, ez = c.z - Math.cos(c.yaw) * 3.5 * HERO_S;
    g.mesh(M.octa1, ex, ey, ez, t * 7, t * 5, 0, 0.8 + 0.25 * Math.sin(t * 30), 1, 0.7, 0.3, 2.2);
  }
}

// 画面の文字 (映像中は戦績を出さない)
export function drawCineHud(g, t) {
  const c = G.cine;
  if (!c) return;
  const T = c.t, A = g.aspect;
  // シネマスコープの帯
  for (const y of [0.86, -0.86]) g.line2(-A, y, A, y, 0.25, 0.6, 0.9, 1.4, 0.35);
  if (T > 2.0 && T < 9) {
    const msg = 'MISSION COMPLETE  //  RETURNING TO MOTHERSHIP';
    const n = Math.floor((T - 2.0) * 30);
    const a = T > 8 ? 9 - T : 1;
    drawText(g, msg.slice(0, n), -A + 0.12 + (G.safeL || 0), -0.78, 0.04, 0.4, 0.9, 1, 1.8, 0.85 * a, 'l');
  }
  if (T >= CINE_END) {
    const k = easeOut((T - CINE_END) / 1.2);
    const y = T >= CINE_CARD ? lerp(0.25, 0.7, easeOut((T - CINE_CARD) / 0.8)) : 0.25;
    const s = 0.2 * (1.25 - 0.25 * k) * (T >= CINE_CARD ? lerp(1, 0.55, easeOut((T - CINE_CARD) / 0.8)) : 1);
    drawText(g, 'THE END', 0, y, s, 0.3, 1, 1, 4.2, k, 'c');
    drawText(g, 'THE END', 0.006, y - 0.006, s, 1, 0.3, 0.7, 2.2, 0.35 * k, 'c');
    if (T < CINE_CARD) {
      const a = sat((T - CINE_END - 0.8) * 2);
      drawText(g, 'WIRED', 0, y - 0.22, 0.06, 0.6, 0.85, 1, 2, a * 0.9, 'c');
    }
  }
}
