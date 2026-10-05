// エンディング映像: 自機が母艦 (巨大戦艦) の横を駆け抜け、旋回し、加速してカメラの脇を通り過ぎて THE END。
// 時刻は曲 (music/ending.py) と同期: 22.0 秒 = 曲の 8 小節目の頭 (全奏) = 自機がカメラの脇を通り過ぎる瞬間
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
  [-1.0, -60, 8, -165],
  [0.0, -60, 7, -60],
  [1.5, -60, 6, 90],
  [4.5, -60, 5, 380],  // 船腹から 75 離れて並走 (機体が見えるように)。ここで勝利のロール
  [6.0, -60, 6.5, 505],
  [7.0, -60.0, 8.0, 590.0],  // 艦首の脇で左へ一回転しながら急上昇 (中心 (-135, 590)・半径 75) → 母艦のはるか上空へ
  [7.925, -82.0, 17.4, 643.0],
  [8.85, -135.0, 44.2, 665.0],
  [9.775, -188.0, 84.2, 643.0],
  [10.7, -210.0, 131.5, 590.0],
  [11.625, -188.0, 178.8, 537.0],
  [12.55, -135.0, 218.8, 515.0],
  [13.475, -82.0, 245.6, 537.0],
  [14.4, -60.0, 255.0, 590.0],  // 旋回を終えて加速 (画面上で母艦と重ならない高度のまま)
  [15.6, -61.7, 256.3, 667.1],
  [16.8, -68.0, 257.8, 756.6],
  [18.0, -80.2, 259.7, 858.2],
  [19.2, -99.9, 262.0, 971.5],
  [20.2, -122.9, 264.2, 1074.5],
  [21.0, -146.3, 266.2, 1162.1],
  [21.6, -166.8, 267.9, 1230.8],
  [22.0, -182.0, 269.0, 1278.0],  // カメラ C2 のすぐ上を高速で通り過ぎる = THE END
  [22.6, -206.2, 270.8, 1351.1],
  [23.2, -231.4, 272.6, 1427.1],
  [24.0, -266.5, 275.2, 1533.2],
];
// カット割り: 0〜6.6 秒は自機を追うチェイスカメラ、以降は艦首の前方のカメラ C2 (母艦の方を向く望遠、9 秒から後退)
const CUT = 6.6, C2 = [-190, 262, 1290], C2D = [-0.1746, 0.0200, 0.9844];  // C2D: 後退する向き (接近経路に沿う)
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
    // チェイス: 自機の右後ろ (自機と船体の間) から。自機は画面左、船体は右側を流れていく
    cx = c.x + 9; cyy = c.y + 3.5; cz = c.z - 24;
    const fx = c.x + Math.sin(yaw) * 30, fy = c.y + 1, fz = c.z + Math.cos(yaw) * 30;
    c.cy = Math.atan2(fx - cx, fz - cz); c.cp = Math.atan2(fy - cyy, Math.hypot(fx - cx, fz - cz));
    croll = bank * 0.25;
  } else {
    if (!c.cut) { c.cut = true; g.clearTrails(); c.cy = 1e9; }
    // 旋回は近くから撮り、その後カメラは後退し続ける → 加速した自機が追いついて脇を抜ける
    const u = sat((t - 9) / 13);
    const back = 420 * (1 - Math.pow(u, 1.6));
    cx = C2[0] - C2D[0] * back; cyy = C2[1] - C2D[1] * back + 0.1 * (t - CUT); cz = C2[2] - C2D[2] * back;
    const tyaw = Math.atan2(c.x - cx, c.z - cz), tpit = Math.atan2(c.y - cyy, Math.hypot(c.x - cx, c.z - cz)) + lerp(-0.1, 0.06, sat((t - 19) / 2.5));  // 旋回中は少し見下ろして下に母艦を入れ、迫ってくる時は見上げて母艦を画面外へ
    if (c.cy > 1e8) { c.cy = tyaw; c.cp = tpit; }
    let d = tyaw - c.cy; d = ((d + PI) % TAU + TAU) % TAU - PI;   // 振り向きは近い側へ
    const k = t > CINE_END ? 0 : 3.0;   // 通り過ぎた後は振り返らない
    fov = lerp(0.62, 0.86, sat((t - 17.5) / 4.3) ** 2);   // 望遠で母艦と旋回を大きく → 加速して迫るのに合わせて広角へ
    c.cy += d * (1 - Math.exp(-k * dt)); c.cp = damp(c.cp, tpit, k, dt);
  }
  g.setCamera(cx + sh * Math.sin(t * 47) * 0.8, cyy + sh * Math.sin(t * 53) * 0.6, cz, c.cy, c.cp, croll + Math.sin(t * 0.3) * 0.02, fov);
  g.bendX = 0; g.bendY = 0;
  g.fogNear = t < CUT ? 500 : 850; g.fogFar = t < CUT ? 1700 : 2100;
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
