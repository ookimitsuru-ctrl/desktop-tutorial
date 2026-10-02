// HUD / コックピット / メニュー描画 (すべてベクターライン)
import { G } from './state.js';
import { drawText, textWidth } from './font.js';
import { TAU, PI, clamp, sat, lerp, fmtScore, easeOut } from './util.js';
import { bossRatio } from './bosses.js';

export const C = {
  cyan: [0.2, 0.9, 1], amber: [1, 0.75, 0.2], green: [0.3, 1, 0.5], red: [1, 0.25, 0.2], white: [1, 1, 1], pink: [1, 0.3, 0.7],
  dim: [0.12, 0.42, 0.62], violet: [0.65, 0.4, 1],
};
const _p = [0, 0, 0];

// ---------- プリミティブ ----------
export function circle(g, cx, cy, r, n, col, a = 1, w = 2, start = 0, arc = TAU, dash = 0) {
  let px = cx + Math.cos(start) * r, py = cy + Math.sin(start) * r;
  for (let i = 1; i <= n; i++) {
    const t = start + (i / n) * arc;
    const x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
    if (!dash || i % dash !== 0) g.line2(px, py, x, y, col[0], col[1], col[2], w, a);
    px = x; py = y;
  }
}
export function rect(g, cx, cy, hw, hh, col, a = 1, w = 2) {
  g.line2(cx - hw, cy - hh, cx + hw, cy - hh, col[0], col[1], col[2], w, a);
  g.line2(cx + hw, cy - hh, cx + hw, cy + hh, col[0], col[1], col[2], w, a);
  g.line2(cx + hw, cy + hh, cx - hw, cy + hh, col[0], col[1], col[2], w, a);
  g.line2(cx - hw, cy + hh, cx - hw, cy - hh, col[0], col[1], col[2], w, a);
}
export function brackets(g, cx, cy, hw, hh, len, col, a = 1, w = 2) {
  const s = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sy] of s) {
    const x = cx + sx * hw, y = cy + sy * hh;
    g.line2(x, y, x - sx * len, y, col[0], col[1], col[2], w, a);
    g.line2(x, y, x, y - sy * len, col[0], col[1], col[2], w, a);
  }
}
// 面取りした矩形
function chamfer(g, cx, cy, hw, hh, c, col, a, w) {
  const p = [[cx - hw + c, cy - hh], [cx + hw - c, cy - hh], [cx + hw, cy - hh + c], [cx + hw, cy + hh - c], [cx + hw - c, cy + hh], [cx - hw + c, cy + hh], [cx - hw, cy + hh - c], [cx - hw, cy - hh + c]];
  for (let i = 0; i < 8; i++) { const q = p[(i + 1) % 8]; g.line2(p[i][0], p[i][1], q[0], q[1], col[0], col[1], col[2], w, a); }
}

// ボタン (登録して当たり判定に使う)
export function button(g, id, label, cx, cy, hw, hh, o = {}) {
  const col = o.col || C.cyan;
  const pressed = G.pressed[id];
  const dim = o.dim ? 0.35 : 1;
  const pulse = o.pulse ? 0.65 + 0.35 * Math.sin(G.time * 8) : 1;
  const a = (pressed ? 1 : 0.8) * dim * pulse;
  chamfer(g, cx, cy, hw, hh, Math.min(hh, 0.04), col, a, pressed ? 3.4 : 2.2);
  if (pressed) { g.line2(cx - hw, cy, cx + hw, cy, col[0], col[1], col[2], 6, 0.3); }
  if (label) drawText(g, label, cx, cy, o.size || Math.min(0.06, hh * 1.1), col[0], col[1], col[2], pressed ? 3 : 2.2, a, 'c');
  if (!o.dim && !o.noHit) G.buttons.push({ id, x: cx, y: cy, hw: hw + 0.02, hh: hh + 0.02 });
}

export function hitButton(x, y) {
  for (let i = G.buttons.length - 1; i >= 0; i--) {
    const b = G.buttons[i];
    if (Math.abs(x - b.x) <= b.hw && Math.abs(y - b.y) <= b.hh) return b.id;
  }
  return null;
}

// ---------- コックピットフレーム ----------
export function drawCockpit(g, t) {
  const A = g.aspect;
  const sx = -G.pvx * 0.0016 + G.shakeX * 0.5, sy = G.pvy * 0.0012 + G.shakeY * 0.5 - 0.004;
  const rot = G.camRoll * 0.18 * 0 + 0;
  const c = C.dim;
  const L = (x0, y0, x1, y1, k = 1, w = 2) => g.line2(x0 + sx, y0 + sy, x1 + sx, y1 + sy, c[0], c[1], c[2], w, k);
  const hit = G.invuln > 0 && G.shield > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
  // ダッシュボード
  const yTop = -0.80;
  L(-A, yTop, -A * 0.66, yTop, 0.9); L(-A * 0.66, yTop, -A * 0.54, -0.9, 0.9); L(-A * 0.54, -0.9, A * 0.54, -0.9, 0.9);
  L(A * 0.54, -0.9, A * 0.66, yTop, 0.9); L(A * 0.66, yTop, A, yTop, 0.9);
  L(-A, yTop - 0.04, -A * 0.68, yTop - 0.04, 0.4, 1.2); L(A * 0.68, yTop - 0.04, A, yTop - 0.04, 0.4, 1.2);
  L(-A * 0.5, -0.95, A * 0.5, -0.95, 0.4, 1.2);
  // Aピラー
  L(-A * 1.0, yTop, -A * 0.84, 1.05, 0.8); L(-A * 0.985, yTop - 0.01, -A * 0.82, 1.05, 0.35, 1.2);
  L(A * 1.0, yTop, A * 0.84, 1.05, 0.8); L(A * 0.985, yTop - 0.01, A * 0.82, 1.05, 0.35, 1.2);
  // 上部フレーム
  L(-A * 0.84, 0.97, -A * 0.12, 0.97, 0.8); L(A * 0.12, 0.97, A * 0.84, 0.97, 0.8);
  L(-A * 0.12, 0.97, -A * 0.06, 1.05, 0.8); L(A * 0.12, 0.97, A * 0.06, 1.05, 0.8);
  // ブレース
  L(-A * 0.93, -0.28, -A * 0.78, -0.28, 0.5, 1.4); L(A * 0.93, -0.28, A * 0.78, -0.28, 0.5, 1.4);
  L(-A * 0.96, 0.4, -A * 0.84, 0.4, 0.4, 1.2); L(A * 0.96, 0.4, A * 0.84, 0.4, 0.4, 1.2);
  // 機首の砲身 (発射時にマズルフラッシュ)
  for (const sgn of [-1, 1]) {
    const m = G.muzzle[sgn > 0 ? 1 : 0];
    const bx = A * 0.27 * sgn, by = -0.9;
    const tx = A * 0.17 * sgn, ty = -0.66;
    L(bx - 0.035 * sgn, by, tx - 0.012 * sgn, ty, 0.8, 1.6); L(bx + 0.035 * sgn, by, tx + 0.012 * sgn, ty, 0.8, 1.6);
    L(tx - 0.012 * sgn, ty, tx + 0.012 * sgn, ty, 0.9, 1.6);
    L(bx - 0.02 * sgn, by + 0.05, bx + 0.02 * sgn, by + 0.05, 0.4, 1.2);
    if (m > 0.02) {
      g.line2(tx + sx, ty + sy, tx + sx + (G.ret.dx - tx) * 0.18, ty + sy + (G.ret.dy - ty) * 0.18, 0.5, 1, 1, 6 * m, m);
      g.dot2(tx + sx, ty + sy, 0.7, 1, 1, 16 * m, m);
    }
  }
  G.muzzle[0] *= 0.82; G.muzzle[1] *= 0.82;
  // ランプ
  const blink = 0.5 + 0.5 * Math.sin(t * 3);
  g.dot2(-A * 0.95 + sx, yTop + 0.03 + sy, 1, 0.3, 0.2, 6, 0.4 + blink * 0.6);
  g.dot2(A * 0.95 + sx, yTop + 0.03 + sy, 0.2, 1, 0.5, 6, 0.4 + (1 - blink) * 0.6);
  if (hit > 0) for (let i = 0; i < 4; i++) g.line2(-A, -1 + i * 0.5, A, -1 + i * 0.5, 1, 0.1, 0.05, 2, 0.1 * hit);
}

// ---------- ゲージ ----------
function segBar(g, x0, x1, y, h, ratio, colFn, n = 22, rev = false) {
  const step = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const on = (rev ? 1 - f : f) <= ratio + 1e-6;
    const col = colFn(f);
    const x = x0 + step * (i + 0.5);
    const a = on ? 1 : 0.1;
    g.line2(x, y - h / 2, x, y + h / 2, col[0], col[1], col[2], 3.6, a);
  }
}

export function drawGauges(g, t) {
  const A = g.aspect;
  const sx = -G.pvx * 0.0016 + G.shakeX * 0.5, sy = G.pvy * 0.0012 + G.shakeY * 0.5;
  // シールド
  const sh = clamp(G.shield / 100, 0, 1);
  const warn = sh < 0.3 ? (0.55 + 0.45 * Math.sin(t * 12)) : 1;
  const sc = sh > 0.5 ? C.green : sh > 0.25 ? C.amber : C.red;
  const xL0 = -A * 0.88 + sx, xL1 = -A * 0.58 + sx, y = -0.885 + sy;
  segBar(g, xL0, xL1, y, 0.05, sh, (f) => (f > 0.5 ? C.green : f > 0.25 ? C.amber : C.red), 20);
  drawText(g, 'SHIELD', xL0, y + 0.075, 0.04, sc[0], sc[1], sc[2], 1.8, 0.85 * warn, 'l');
  drawText(g, String(Math.ceil(G.shield)), xL1, y + 0.075, 0.04, sc[0], sc[1], sc[2], 1.8, 0.85 * warn, 'r');
  // フロー
  const fl = clamp(G.flow / 100, 0, 1);
  const fc = G.od > 0 ? C.cyan : fl >= 1 ? C.pink : C.cyan;
  const xR0 = A * 0.58 + sx, xR1 = A * 0.88 + sx;
  segBar(g, xR0, xR1, y, 0.05, fl, (f) => [lerp(0.2, 1, f), lerp(0.9, 0.3, f), 1], 20);
  drawText(g, G.od > 0 ? 'OVERDRIVE' : 'FLOW', xR0, y + 0.075, 0.04, fc[0], fc[1], fc[2], 1.8, 0.9, 'l');
  drawText(g, String(Math.round(G.flow)), xR1, y + 0.075, 0.04, fc[0], fc[1], fc[2], 1.8, 0.9, 'r');
  // 中央: ステージ名
  if (G.stage) drawText(g, G.stage.sub, sx, -0.915 + sy, 0.04, C.dim[0] * 1.6, C.dim[1] * 1.6, C.dim[2] * 1.6, 1.6, 0.9, 'c');
}

// ---------- メインHUD ----------
export function drawHud(g, t, dt) {
  const A = g.aspect;
  const AL = -A + G.safeL, AR = A - G.safeR;
  G.scoreShown += (G.score - G.scoreShown) * Math.min(1, 9 * dt);
  // スコア
  drawText(g, fmtScore(G.scoreShown), AL + 0.1, 0.9, 0.075, 0.5, 1, 1, 2.4, 1, 'l');
  drawText(g, 'SCORE', AL + 0.1, 0.8, 0.036, C.dim[0] * 1.8, C.dim[1] * 1.8, C.dim[2] * 1.8, 1.6, 0.9, 'l');
  // チェイン
  if (G.chain >= 2) {
    const k = 1 + Math.min(G.chain, 40) * 0.1;
    const pulse = 1 + 0.15 * sat(1 - (G.chainT - 1.9) * 8);
    drawText(g, 'CHAIN ' + G.chain, AL + 0.1, 0.72, 0.045 * pulse, 1, 0.8, 0.2, 2, 0.95, 'l');
    drawText(g, 'x' + k.toFixed(1), AL + 0.1, 0.65, 0.036, 1, 0.8, 0.2, 1.6, 0.8, 'l');
    // チェインタイマー
    g.line2(AL + 0.1, 0.61, AL + 0.1 + 0.34 * sat(G.chainT / 2.2), 0.61, 1, 0.8, 0.2, 2, 0.7);
  }
  // ロック数
  const ml = G.od > 0 ? 16 : 8;
  drawText(g, 'LOCK ' + String(G.locks.length).padStart(2, '0') + '/' + String(ml).padStart(2, '0'), AR - 0.1, 0.9, 0.05, G.locks.length ? 1 : C.dim[0] * 1.8, G.locks.length ? 0.75 : C.dim[1] * 1.8, G.locks.length ? 0.2 : C.dim[2] * 1.8, 2, 1, 'r');
  drawText(g, 'HI ' + fmtScore(Math.max(G.save.hi, G.score)), AR - 0.1, 0.8, 0.036, C.dim[0] * 1.8, C.dim[1] * 1.8, C.dim[2] * 1.8, 1.6, 0.9, 'r');

  // ボスバー
  if (G.boss && G.boss.alive && G.boss.t > 2) {
    const r = bossRatio(G.boss);
    const x0 = -0.62, x1 = 0.62, y = 0.82;
    rect(g, 0, y, 0.64, 0.025, C.red, 0.8, 1.8);
    const col = r > 0.4 ? C.red : C.amber;
    g.line2(x0, y, x0 + (x1 - x0) * r, y, col[0], col[1], col[2], 12, 0.9);
    drawText(g, G.boss.name, 0, y + 0.07, 0.045, 1, 0.5, 0.4, 2, 0.95, 'c');
  }

  // 速度線 (オーバードライブ)
  if (G.od > 0) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU + t * 0.1, r0 = 0.9 + ((i * 37) % 10) * 0.05 + Math.sin(t * 20 + i) * 0.05, r1 = r0 + 0.5;
      g.line2(Math.cos(a) * r0 * A * 0.8, Math.sin(a) * r0 * 0.9, Math.cos(a) * r1 * A * 0.8, Math.sin(a) * r1 * 0.9, 0.2, 0.7, 1, 2, 0.35);
    }
  }
}

// ---------- ロックオン & レティクル ----------
export function drawReticle(g, t) {
  const R = G.ret, A = g.aspect;
  const od = G.od > 0;
  const locking = G.locking;
  const n = G.locks.length;
  const col = n > 0 ? C.amber : od ? C.pink : C.cyan;
  const x = R.dx, y = R.dy;
  const lockR = od ? 0.17 : 0.13;
  // 内側
  const r0 = 0.032 + (G.laserT > 0.0 && G.laserT > 0.05 ? 0.004 : 0);
  circle(g, x, y, r0, 16, col, 1, 2.2);
  g.dot2(x, y, col[0], col[1], col[2], 5, 1);
  for (let i = 0; i < 4; i++) {
    const a = i * PI / 2 + PI / 4;
    g.line2(x + Math.cos(a) * (r0 + 0.012), y + Math.sin(a) * (r0 + 0.012), x + Math.cos(a) * (r0 + 0.04), y + Math.sin(a) * (r0 + 0.04), col[0], col[1], col[2], 2.2, 0.9);
  }
  // ロック範囲リング
  const k = locking ? 1 : 0.25;
  if (locking) {
    // ビート収束リング: 次のビートで照準リングに重なる → そのタイミングで指を離すと ON BEAT
    const ph = G.audio.beatPhase();
    if (G.audio.running) {
      const rb = lockR * (1 + (1 - ph) * (1 - ph) * 1.1);
      const near = ph > 0.9 || ph < 0.1;
      circle(g, x, y, rb, 32, near ? C.pink : col, near ? 1 : 0.55, near ? 3.2 : 1.8);
    }
    const rr = lockR * (1 + 0.04 * Math.sin(t * 16));
    circle(g, x, y, rr, 36, col, 0.9, 2, t * 1.5, TAU, 3);
    circle(g, x, y, rr * 0.82, 24, col, 0.35, 1.4, -t * 2.2, TAU, 2);
  } else if (G.lockCd <= 0) {
    circle(g, x, y, lockR, 36, col, 0.2, 1.4, t * 0.4, TAU, 2);
  } else {
    circle(g, x, y, lockR * (1 - G.lockCd * 1.2), 28, C.dim, 0.5, 1.6);
  }
}

export function drawLocks(g, t) {
  const A = g.aspect;
  const seen = new Set();
  const R = G.ret;
  for (let i = 0; i < G.locks.length; i++) {
    const l = G.locks[i], tg = l.tg;
    if (!tg.alive) continue;
    if (!g.project(tg.x, tg.y, tg.z, _p)) continue;
    if (seen.has(tg)) continue;
    seen.add(tg);
    const cnt = G.locks.filter((q) => q.tg === tg).length;
    const hx = _p[0], hy = _p[1];
    const rad = clamp(tg.r / (tg.z * g.tanH) * 1.5, 0.035, 0.22);
    const k = 1 + 1.6 * Math.pow(1 - sat(l.t * 7), 2);
    const rot = t * 2;
    // 回転する菱形ブラケット
    const s = rad * k;
    const pts = [[0, s], [s, 0], [0, -s], [-s, 0]];
    const col = C.amber;
    for (let j = 0; j < 4; j++) {
      const a = pts[j], b = pts[(j + 1) % 4];
      // 角だけ描く
      g.line2(hx + a[0], hy + a[1], hx + a[0] + (b[0] - a[0]) * 0.38, hy + a[1] + (b[1] - a[1]) * 0.38, col[0], col[1], col[2], 2.6, 1);
      g.line2(hx + b[0], hy + b[1], hx + b[0] + (a[0] - b[0]) * 0.38, hy + b[1] + (a[1] - b[1]) * 0.38, col[0], col[1], col[2], 2.6, 1);
    }
    g.line2(hx - s * 0.3, hy, hx + s * 0.3, hy, col[0], col[1], col[2], 2, 0.8);
    g.line2(hx, hy - s * 0.3, hx, hy + s * 0.3, col[0], col[1], col[2], 2, 0.8);
    drawText(g, cnt > 1 ? 'x' + cnt : String(i + 1), hx + s + 0.015, hy + s, 0.038, col[0], col[1], col[2], 1.8, 0.9, 'l');
    g.line2(R.dx, R.dy, hx, hy, col[0], col[1], col[2], 1.2, 0.18);
  }
}

// ---------- バナー ----------
export function drawBanner(g, t, dt) {
  const b = G.banner;
  if (!b) return;
  b.t += dt;
  const u = b.t / b.dur;
  if (u >= 1) { G.banner = null; return; }
  const a = Math.min(1, b.t / 0.25) * Math.min(1, (b.dur - b.t) / 0.4);
  const col = b.col || C.cyan;
  const e = easeOut(b.t / 0.4);
  const y = b.y !== undefined ? b.y : 0.42;
  const A = g.aspect;
  drawText(g, b.text, 0, y, 0.15 * (1.15 - 0.15 * e), col[0], col[1], col[2], 3.2, a, 'c');
  if (b.sub) drawText(g, b.sub, 0, y - 0.15, 0.06, col[0], col[1], col[2], 2, a * 0.9, 'c');
  const wl = (0.15 + 0.55 * e) * A * 0.6;
  g.line2(-wl, y + 0.12, wl, y + 0.12, col[0], col[1], col[2], 2, a * 0.5);
  g.line2(-wl, y - 0.22, wl, y - 0.22, col[0], col[1], col[2], 2, a * 0.5);
}

// ---------- 操作ボタン ----------
export function drawControls(g, t) {
  const A = g.aspect;
  // ポーズ
  button(g, 'pause', '', 0, 0.9, 0.06, 0.05, { col: C.dim, size: 0.04 });
  g.line2(-0.015, 0.9 - 0.02, -0.015, 0.9 + 0.02, 0.4, 0.8, 1, 3, 0.9);
  g.line2(0.015, 0.9 - 0.02, 0.015, 0.9 + 0.02, 0.4, 0.8, 1, 3, 0.9);
  // ロール
  const rx = G.settings.lefty ? A - G.safeR - 0.24 : -A + G.safeL + 0.24, ry = -0.44;
  const cd = G.rollCd > 0 ? 1 - sat(G.rollCd / 0.9) : 1;
  const ready = cd >= 1;
  const rc = ready ? C.cyan : C.dim;
  circle(g, rx, ry, 0.11, 28, rc, ready ? 0.8 : 0.4, 2.2);
  circle(g, rx, ry, 0.085, 24, rc, 0.4, 1.4, -PI / 2, TAU * cd);
  drawText(g, 'ROLL', rx, ry, 0.038, rc[0], rc[1], rc[2], 2, ready ? 0.95 : 0.5, 'c');
  // ロールは「左画面のフリック / 2本目の指タップ」で発動 (ボタンは表示専用)
  // フロー
  const fy = -0.68;
  if (G.flow >= 100 && G.od <= 0) {
    const pu = 0.6 + 0.4 * Math.sin(t * 9);
    button(g, 'flow', 'FLOW  OVERDRIVE', 0, fy, 0.34, 0.058, { col: C.pink, pulse: true, size: 0.045, noHit: true });
    G.buttons.push({ id: 'flow', x: 0, y: fy - 0.02, hw: 0.8, hh: 0.14 });
    g.line2(-0.34, fy, 0.34, fy, 1, 0.3, 0.8, 8, 0.12 * pu);
  } else if (G.od > 0) {
    const r = G.od / G.odMax;
    rect(g, 0, fy, 0.34, 0.03, C.cyan, 0.7, 1.6);
    g.line2(-0.34, fy, -0.34 + 0.68 * clamp(r, 0, 1), fy, 0.3, 0.9, 1, 12, 0.9);
  }
}

// ---------- チュートリアル ヒント ----------
export function drawHints(g, t) {
  if (G.hintT <= 0) return;
  const A = g.aspect;
  const a = Math.min(1, G.hintT / 1.5) * 0.9;
  const bl = 0.7 + 0.3 * Math.sin(t * 4);
  const mx = G.settings.lefty ? 1 : -1;
  // 移動側
  drawText(g, 'DRAG', mx * A * 0.5, -0.25, 0.05, 0.3, 1, 1, 2, a * bl, 'c');
  drawText(g, 'MOVE', mx * A * 0.5, -0.32, 0.04, 0.3, 1, 1, 1.8, a, 'c');
  drawText(g, 'FLICK = ROLL', mx * A * 0.5, -0.4, 0.035, 0.3, 1, 1, 1.6, a * 0.8, 'c');
  circle(g, mx * A * 0.5, -0.1, 0.07, 20, C.cyan, a * 0.6, 2);
  // 照準側
  drawText(g, 'HOLD  LOCK-ON', -mx * A * 0.5, -0.25, 0.05, 1, 0.75, 0.2, 2, a * bl, 'c');
  drawText(g, 'RELEASE  FIRE', -mx * A * 0.5, -0.32, 0.04, 1, 0.75, 0.2, 1.8, a, 'c');
  drawText(g, 'DRAG TO AIM', -mx * A * 0.5, -0.4, 0.035, 1, 0.75, 0.2, 1.6, a * 0.8, 'c');
  circle(g, -mx * A * 0.5, -0.1, 0.07, 20, C.amber, a * 0.6, 2);
  drawText(g, 'ROLL BLOCKS & REFLECTS SHOTS', 0, -0.52, 0.036, 0.7, 0.9, 1, 1.6, a * 0.8, 'c');
}
