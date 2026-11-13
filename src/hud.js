// HUD 描画 (画面座標 / CSS px)
import { fmtTime } from './race.js';
import { TYRES, CAR, tyreGripFactor } from './physics.js';
import { SECTIONS } from './track.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const FONT = '"Roboto Condensed","DIN Alternate","Helvetica Neue","Hiragino Sans","Noto Sans JP",system-ui,sans-serif';
const TYRE_IDS = ['soft', 'medium', 'hard', 'rain'];
const MODE_NAME = { free: 'フリー走行', ta: 'タイムアタック', quali: '予選', race: '決勝' };

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
}
function panel(ctx, x, y, w, h, r = 8, a = 0.55) { rr(ctx, x, y, w, h, r); ctx.fillStyle = `rgba(8,12,22,${a})`; ctx.fill(); }
function text(ctx, s, x, y, size, col = '#fff', align = 'left', weight = '700', italic = false) {
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${FONT}`; ctx.textAlign = align; ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function tempColor(ty, t) {
  const d = t - ty.opt;
  if (d < -35) return '#4aa3ff'; if (d < -18) return '#6fd0e8'; if (d < 14) return '#4be07a'; if (d < 30) return '#f2c230'; return '#ff5040';
}

export class Hud {
  constructor() {
    this.msgs = []; this.secFlash = [null, null, null]; this.lapFlash = null;
    this.t = 0; this.cornerName = ''; this.cornerT = 0; this.lastSection = null;
  }
  message(textStr, color = '#fff', dur = 2.4, big = false) {
    this.msgs.push({ text: textStr, color, t: 0, dur, big });
    if (this.msgs.length > 3) this.msgs.shift();
  }
  reset() { this.msgs.length = 0; this.secFlash = [null, null, null]; this.lapFlash = null; this.cornerName = ''; this.lastSection = null; }

  draw(ctx, L, S, input, cfg, R, dt) {
    this.t += dt;
    const w = L.w, h = L.h, pl = S.player, c = pl.car;
    ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    const small = h < 400;
    const u = clamp(h / 400, 0.82, 1.5); // スケール係数

    // ================= 操作パッド =================
    this.drawPad(ctx, L.brake, input.brake, '#ff4a3d', 'BRAKE', (cfg.pedalDir || 'out') === 'out' ? -1 : 1, input.brakePtr, c.lockedF && c.speed > 4 ? 'LOCK' : null, u);
    this.drawPad(ctx, L.accel, input.throttle, '#35d07f', 'ACCEL', (cfg.pedalDir || 'out') === 'out' ? 1 : -1, input.accelPtr, c.kR > 0.3 && c.speed > 2 ? 'SPIN' : null, u);
    this.drawPaddle(ctx, L.shiftUp, '▲', 'UP', input.flash.up, false, u);
    this.drawPaddle(ctx, L.shiftDown, '▼', 'DOWN', input.flash.down, c.shiftDenied > 0, u);

    // ================= 中央下: タコメーター =================
    this.drawCluster(ctx, L, S, c, input, cfg, u);

    // ================= 左上: ボタン類と順位 =================
    this.drawButton(ctx, L.pause, 'II', false, u);
    let lx = L.pause.x + L.pause.w + 8;
    if (input.showPit) {
      const on = pl.pitRequest || !!pl.pit;
      rr(ctx, L.pit.x, L.pit.y, L.pit.w, L.pit.h, 8); ctx.fillStyle = on ? 'rgba(255,170,30,0.92)' : 'rgba(8,12,22,0.6)'; ctx.fill();
      ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.textBaseline = 'middle';
      text(ctx, 'PIT', L.pit.x + L.pit.w * 0.36, L.pit.y + L.pit.h / 2 + 1, 15 * u, on ? '#111' : '#fff', 'center', '800');
      const nt = TYRES[pl.nextTyre];
      ctx.beginPath(); ctx.arc(L.pit.x + L.pit.w * 0.76, L.pit.y + L.pit.h / 2, L.pit.h * 0.3, 0, 6.3); ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = nt.color; ctx.lineWidth = 3; ctx.stroke();
      text(ctx, nt.short, L.pit.x + L.pit.w * 0.76, L.pit.y + L.pit.h / 2 + 1, 12 * u, '#fff', 'center', '800');
      ctx.textBaseline = 'alphabetic';
      lx = L.pit.x + L.pit.w + 8;
      if (input.showTyres) {
        L.tyreBtns.forEach((b, k) => {
          const ty = TYRES[TYRE_IDS[k]], sel = pl.nextTyre === ty.id;
          rr(ctx, b.x, b.y, b.w, b.h, 8); ctx.fillStyle = sel ? 'rgba(255,255,255,0.92)' : 'rgba(8,12,22,0.7)'; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x + b.w / 2, b.y + b.h / 2, b.h * 0.33, 0, 6.3); ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = ty.color; ctx.lineWidth = 3.5; ctx.stroke();
          ctx.textBaseline = 'middle'; text(ctx, ty.short, b.x + b.w / 2, b.y + b.h / 2 + 1, 13 * u, '#fff', 'center', '800'); ctx.textBaseline = 'alphabetic';
        });
        text(ctx, '次に履くタイヤ', L.tyreBtns[3].x + L.tyreBtns[3].w + 8, L.tyreBtns[0].y + L.tyreBtns[0].h * 0.62, 11 * u, 'rgba(255,255,255,0.85)', 'left', '600');
      }
    }
    if (input.showReset) {
      this.drawButton(ctx, L.reset, '復帰', false, u, 12);
      lx = L.reset.x + L.reset.w + 8;
    }
    // 順位 / 周回
    {
      const bx = lx + 2, by = L.pause.y, bh = L.pause.h;
      let s1, s2;
      if (S.mode === 'race') { s1 = `P${pl.pos}`; s2 = `/${S.entries.length}`; }
      else { s1 = MODE_NAME[S.mode]; s2 = ''; }
      ctx.font = `italic 800 ${22 * u}px ${FONT}`; const w1 = ctx.measureText(s1).width;
      ctx.font = `700 ${12 * u}px ${FONT}`; const w2 = ctx.measureText(s2).width;
      const lapStr = S.mode === 'race' ? `LAP ${Math.min(Math.max(pl.lap, 1), S.laps)}/${S.laps}` : S.mode === 'quali' ? `LAP ${Math.max(0, Math.min(pl.lap, S.laps))}/${S.laps}` : `LAP ${Math.max(0, pl.lap)}`;
      ctx.font = `700 ${13 * u}px ${FONT}`; const w3 = ctx.measureText(lapStr).width;
      const pw = w1 + w2 + w3 + 34;
      panel(ctx, bx, by, pw, bh, 8);
      ctx.textBaseline = 'middle';
      text(ctx, s1, bx + 10, by + bh / 2 + 1, (S.mode === 'race' ? 22 : 14) * u, S.mode === 'race' ? '#ffb347' : '#fff', 'left', '800', true);
      ctx.font = `italic 800 ${(S.mode === 'race' ? 22 : 14) * u}px ${FONT}`; const ww = ctx.measureText(s1).width;
      text(ctx, s2, bx + 12 + ww, by + bh / 2 + 4, 12 * u, 'rgba(255,255,255,0.7)');
      text(ctx, lapStr, bx + pw - 10, by + bh / 2 + 1, 13 * u, '#fff', 'right');
      ctx.textBaseline = 'alphabetic';
    }

    // ================= 上中央: タイム =================
    this.drawTiming(ctx, L, S, pl, u);

    // ================= 右上: ミニマップ =================
    this.drawMinimap(ctx, L, S, R, u);

    // ================= 決勝: 順位表 =================
    if (S.mode === 'race' && cfg.showBoard !== false) this.drawBoard(ctx, L, S, pl, u);

    // ================= コーナー名 =================
    const sec = S.T.sectionAt(c.s);
    if (sec && sec.name !== this.lastSection) { this.lastSection = sec.name; this.cornerName = sec.name; this.cornerT = 2.6; }
    if (!sec) this.lastSection = null;
    if (this.cornerT > 0 && S.state === 'green') {
      this.cornerT -= dt; const a = sat(this.cornerT / 0.5) * sat((2.6 - this.cornerT) / 0.25);
      ctx.globalAlpha = a * 0.95;
      const cy = h * 0.27;
      ctx.font = `italic 800 ${17 * u}px ${FONT}`; const tw = ctx.measureText(this.cornerName).width;
      rr(ctx, w / 2 - tw / 2 - 14, cy - 15 * u, tw + 28, 24 * u, 12 * u); ctx.fillStyle = 'rgba(8,12,22,0.55)'; ctx.fill();
      text(ctx, this.cornerName, w / 2, cy + 3 * u, 17 * u, '#fff', 'center', '800', true);
      ctx.globalAlpha = 1;
    }

    // ================= スタートシグナル / カウントダウン =================
    if (S.state === 'lights' || (S.lightsOut && S.state === 'green' && S.stateT < 1.6) || S.state === 'grid') {
      const n = S.state === 'lights' ? S.lights : 0, r = 15 * u, gap = 10 * u, tw = 5 * r * 2 + 4 * gap;
      const x0 = w / 2 - tw / 2, y0 = h * 0.33;
      panel(ctx, x0 - 14, y0 - r - 12, tw + 28, r * 2 + 24, 14, 0.82);
      for (let k = 0; k < 5; k++) {
        const go = S.lightsOut && S.state === 'green';
        ctx.beginPath(); ctx.arc(x0 + r + k * (2 * r + gap), y0, r, 0, 6.3);
        ctx.fillStyle = go ? '#27f06a' : k < n ? '#ff2516' : '#2a0b08'; ctx.fill();
        if (k < n || go) { ctx.shadowColor = go ? '#27f06a' : '#ff2516'; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0; }
      }
      if (S.state === 'grid') text(ctx, 'グリッドにつけ', w / 2, y0 + r + 34 * u, 15 * u, '#fff', 'center');
    }
    if (S.state === 'countdown') {
      const n = Math.max(1, 3 - Math.floor(S.stateT));
      const f = S.stateT % 1;
      ctx.globalAlpha = 1 - f * 0.6;
      text(ctx, String(n), w / 2, h * 0.42, (70 + 30 * (1 - f)) * u, '#fff', 'center', '800', true);
      ctx.globalAlpha = 1;
      text(ctx, 'ローリングスタート — コントロールライン通過で計測開始', w / 2, h * 0.5, 13 * u, 'rgba(255,255,255,0.85)', 'center', '600');
    }

    // ================= 警告表示 =================
    let warn = null, wcol = '#ff5040';
    if (pl.pit) {
      warn = pl.pit.state === 'service' ? `ピット作業中  ${Math.max(0, pl.pit.timer).toFixed(1)}s` : pl.pit.state === 'in' ? 'ピットイン (自動走行)' : 'ピットアウト (自動走行)'; wcol = '#ffb347';
    } else if (Math.abs(c.relH) > 2.0 && c.speed > 3 && S.state === 'green') warn = '逆走しています';
    else if (c.retired) warn = 'マシン破損 — リタイア';
    else if (c.fuel <= 0) warn = '燃料切れ';
    else if (pl.pitRequest) { warn = 'ピットイン予約中 — 最終コーナーで右側のピットレーンへ'; wcol = '#ffb347'; }
    else if (!pl.lapValid && S.mode !== 'race' && pl.lap >= 1) { warn = 'このラップは無効 (コースアウト)'; wcol = '#ffd23a'; }
    else if (S.mode === 'race' && S.leaderFinished && !pl.finished) { warn = 'ファイナルラップ'; wcol = '#fff'; }
    if (warn) {
      const y = h * 0.2;
      ctx.font = `800 ${14 * u}px ${FONT}`; const tw = ctx.measureText(warn).width;
      rr(ctx, w / 2 - tw / 2 - 14, y - 16 * u, tw + 28, 24 * u, 6); ctx.fillStyle = 'rgba(8,12,22,0.72)'; ctx.fill();
      text(ctx, warn, w / 2, y + 1 * u, 14 * u, wcol, 'center', '800');
    }

    // ================= メッセージ =================
    let my = h * 0.38;
    for (let i = this.msgs.length - 1; i >= 0; i--) {
      const m = this.msgs[i]; m.t += dt;
      if (m.t > m.dur) { this.msgs.splice(i, 1); continue; }
      const a = sat(m.t / 0.15) * sat((m.dur - m.t) / 0.4);
      ctx.globalAlpha = a;
      const sz = (m.big ? 34 : 20) * u;
      ctx.font = `italic 800 ${sz}px ${FONT}`; const tw = ctx.measureText(m.text).width;
      rr(ctx, w / 2 - tw / 2 - 18, my - sz * 0.95, tw + 36, sz * 1.4, 8); ctx.fillStyle = 'rgba(8,12,22,0.7)'; ctx.fill();
      text(ctx, m.text, w / 2, my, sz, m.color, 'center', '800', true);
      ctx.globalAlpha = 1; my += sz * 1.6;
    }
  }

  drawButton(ctx, r, label, on, u, size = 15) {
    rr(ctx, r.x, r.y, r.w, r.h, 8); ctx.fillStyle = on ? 'rgba(255,170,30,0.9)' : 'rgba(8,12,22,0.6)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textBaseline = 'middle'; text(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, size * u, '#fff', 'center', '800'); ctx.textBaseline = 'alphabetic';
  }

  drawPad(ctx, r, v, col, label, dir, ptr, alert, u) {
    // 軌道
    rr(ctx, r.x, r.y, r.w, r.h, 14); ctx.fillStyle = 'rgba(8,12,22,0.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.5; ctx.stroke();
    // 塗り
    const inner = { x: r.x + r.w * 0.07, w: r.w * 0.86 };
    ctx.save(); rr(ctx, r.x + 3, r.y + 3, r.w - 6, r.h - 6, 11); ctx.clip();
    const fw = r.w * 0.07 + inner.w * v;
    const g = ctx.createLinearGradient(dir > 0 ? r.x : r.x + r.w, 0, dir > 0 ? r.x + r.w : r.x, 0);
    g.addColorStop(0, col + '55'); g.addColorStop(1, col);
    ctx.fillStyle = g; ctx.globalAlpha = 0.25 + 0.6 * v;
    if (v > 0.001) { if (dir > 0) ctx.fillRect(r.x, r.y, fw, r.h); else ctx.fillRect(r.x + r.w - fw, r.y, fw, r.h); }
    ctx.globalAlpha = 1;
    // 目盛り
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { const t = k / 4, x = dir > 0 ? inner.x + inner.w * t : inner.x + inner.w * (1 - t); const hh = k % 2 === 0 ? r.h * 0.3 : r.h * 0.18; ctx.beginPath(); ctx.moveTo(x, r.y + r.h - 4); ctx.lineTo(x, r.y + r.h - 4 - hh); ctx.stroke(); }
    ctx.restore();
    // つまみ
    const kx = dir > 0 ? inner.x + inner.w * v : inner.x + inner.w * (1 - v);
    if (ptr || v > 0.001) { rr(ctx, kx - 5, r.y + 5, 10, r.h - 10, 5); ctx.fillStyle = '#fff'; ctx.globalAlpha = ptr ? 0.95 : 0.6; ctx.fill(); ctx.globalAlpha = 1; }
    // ラベル
    const tx = dir > 0 ? r.x + 12 : r.x + r.w - 12, al = dir > 0 ? 'left' : 'right';
    text(ctx, label, tx, r.y + 18 * u, 11 * u, 'rgba(255,255,255,0.75)', al, '800', true);
    text(ctx, `${Math.round(v * 100)}`, dir > 0 ? r.x + r.w - 12 : r.x + 12, r.y + 24 * u, 20 * u, '#fff', dir > 0 ? 'right' : 'left', '800', true);
    // 増加方向の矢印
    text(ctx, dir > 0 ? '▶▶' : '◀◀', r.x + r.w / 2, r.y + r.h * 0.6, 12 * u, 'rgba(255,255,255,0.25)', 'center');
    if (alert && Math.floor(this.t * 8) % 2 === 0) {
      rr(ctx, r.x + r.w / 2 - 30 * u, r.y - 22 * u, 60 * u, 18 * u, 4); ctx.fillStyle = alert === 'LOCK' ? '#ff4a3d' : '#ffb020'; ctx.fill();
      text(ctx, alert, r.x + r.w / 2, r.y - 8.5 * u, 12 * u, '#111', 'center', '800');
    }
  }
  drawPaddle(ctx, r, sym, label, flash, denied, u) {
    rr(ctx, r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = denied ? 'rgba(255,60,40,0.75)' : flash > 0 ? 'rgba(255,255,255,0.85)' : 'rgba(8,12,22,0.5)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1.5; ctx.stroke();
    const col = flash > 0 && !denied ? '#111' : '#fff';
    ctx.textBaseline = 'middle';
    text(ctx, sym, r.x + r.w / 2, r.y + r.h * 0.42, 22 * u, col, 'center', '800');
    text(ctx, label, r.x + r.w / 2, r.y + r.h * 0.78, 11 * u, col, 'center', '800', true);
    ctx.textBaseline = 'alphabetic';
  }

  drawCluster(ctx, L, S, c, input, cfg, u) {
    const pl = S.player;
    const cw = clamp(L.centre.w, 150, 330), cx = L.w / 2, x0 = cx - cw / 2;
    const ch = clamp(L.h * 0.25, 84, 118), y0 = L.h - L.m - L.safe.b - ch;
    panel(ctx, x0, y0, cw, ch, 12, 0.6);
    // ステアリング入力バー
    {
      const bw = cw - 24, bx = x0 + 12, by = y0 - 9;
      rr(ctx, bx, by, bw, 5, 2.5); ctx.fillStyle = 'rgba(8,12,22,0.6)'; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(cx - 0.5, by - 2, 1, 9);
      const sx = cx + input.steer * bw / 2;
      ctx.fillStyle = '#ffb347'; ctx.fillRect(Math.min(cx, sx), by, Math.abs(sx - cx), 5);
      rr(ctx, sx - 3, by - 3, 6, 11, 2); ctx.fillStyle = '#fff'; ctx.fill();
    }
    // シフトランプ (回転数)
    const n = 14, lw2 = (cw - 24 - (n - 1) * 3) / n, rpm = c.rpm;
    const lo = 6500, hi = 13300;
    const lit = Math.round(sat((rpm - lo) / (hi - lo)) * n);
    const flashAll = rpm > 13150 && Math.floor(this.t * 12) % 2 === 0;
    for (let k = 0; k < n; k++) {
      const on = k < lit;
      const col = k < 6 ? '#35d07f' : k < 10 ? '#f2c230' : '#ff4030';
      rr(ctx, x0 + 12 + k * (lw2 + 3), y0 + 8, lw2, 9 * u, 2);
      ctx.fillStyle = flashAll ? '#58a8ff' : on ? col : 'rgba(255,255,255,0.12)'; ctx.fill();
    }
    // ギア
    const gy = y0 + ch * 0.74;
    const gtxt = c.gear === 0 ? 'R' : String(c.shiftT > 0 ? c.nextGear || 'R' : c.gear);
    text(ctx, gtxt, cx, gy + 4 * u, 46 * u, c.limiter ? '#ff5040' : '#fff', 'center', '800', true);
    text(ctx, 'GEAR', cx, y0 + ch - 7, 9 * u, 'rgba(255,255,255,0.6)', 'center', '700');
    // 速度
    const kmh = Math.round(Math.abs(c.speed) * 3.6);
    text(ctx, String(kmh), x0 + cw * 0.3, gy, 28 * u, '#fff', 'right', '800', true);
    text(ctx, 'km/h', x0 + cw * 0.3 + 3, gy, 9 * u, 'rgba(255,255,255,0.65)', 'left', '700');
    text(ctx, `${Math.round(rpm / 10) * 10}`, x0 + cw * 0.3, y0 + ch - 8, 12 * u, 'rgba(255,255,255,0.85)', 'right', '700');
    text(ctx, 'rpm', x0 + cw * 0.3 + 3, y0 + ch - 8, 9 * u, 'rgba(255,255,255,0.6)', 'left', '700');
    // タイヤ・燃料 (右側)
    const rx = x0 + cw * 0.66, ty = c.tyre;
    const tw = (cw * 0.34 - 14);
    const bar = (label, wear, temp, y) => {
      text(ctx, label, rx, y + 8 * u, 9 * u, 'rgba(255,255,255,0.7)', 'left', '700');
      const bx = rx + 12 * u, bw = tw - 12 * u - 26 * u;
      rr(ctx, bx, y, bw, 9 * u, 2); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      rr(ctx, bx, y, Math.max(2, bw * (1 - wear)), 9 * u, 2); ctx.fillStyle = tempColor(ty, temp); ctx.fill();
      text(ctx, `${Math.round((1 - wear) * 100)}`, rx + tw, y + 8.5 * u, 10 * u, wear > 0.72 ? '#ff5040' : '#fff', 'right', '700');
    };
    const y1 = y0 + 24 * u + 4;
    ctx.beginPath(); ctx.arc(rx - 12 * u, y1 + 12 * u, 9 * u, 0, 6.3); ctx.fillStyle = '#111'; ctx.fill(); ctx.strokeStyle = ty.color; ctx.lineWidth = 3; ctx.stroke();
    ctx.textBaseline = 'middle'; text(ctx, ty.short, rx - 12 * u, y1 + 12.5 * u, 10 * u, '#fff', 'center', '800'); ctx.textBaseline = 'alphabetic';
    bar('F', c.wearF, c.tempF, y1); bar('R', c.wearR, c.tempR, y1 + 14 * u);
    // 燃料
    const fy = y1 + 30 * u;
    const cap = S.mode === 'race' ? S.laps * CAR.fuelPerLap * 1.04 + 4 : 40;
    text(ctx, '燃', rx - 16 * u, fy + 8 * u, 9 * u, 'rgba(255,255,255,0.7)', 'left', '700');
    rr(ctx, rx, fy, tw - 34 * u, 8 * u, 2); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
    const ff = sat(c.fuel / cap);
    rr(ctx, rx, fy, Math.max(2, (tw - 34 * u) * ff), 8 * u, 2); ctx.fillStyle = c.fuel < CAR.fuelPerLap * 1.2 ? '#ff5040' : '#7fb6ff'; ctx.fill();
    text(ctx, `${(c.fuel / CAR.fuelPerLap).toFixed(1)}周`, rx + tw, fy + 8 * u, 10 * u, '#fff', 'right', '700');
    // ダメージ
    const dmg = c.dmgF + c.dmgR + c.dmgS;
    if (dmg > 0.03) {
      const parts = []; if (c.dmgF > 0.03) parts.push(`前${Math.round(c.dmgF * 100)}`); if (c.dmgR > 0.03) parts.push(`後${Math.round(c.dmgR * 100)}`); if (c.dmgS > 0.03) parts.push(`足${Math.round(c.dmgS * 100)}`);
      text(ctx, '破損 ' + parts.join(' '), rx - 16 * u, y0 + ch - 7, 9.5 * u, '#ff7a5a', 'left', '700');
    } else if (c.draft > 0.15) {
      text(ctx, 'スリップストリーム', rx - 16 * u, y0 + ch - 7, 9.5 * u, '#7fd6ff', 'left', '700');
    } else {
      const wetTxt = S.wet < 0.05 ? 'DRY' : S.wet < 0.45 ? `DAMP ${Math.round(S.wet * 100)}%` : `WET ${Math.round(S.wet * 100)}%`;
      text(ctx, (S.rain > 0.1 ? '雨 ' : '') + '路面 ' + wetTxt, rx - 16 * u, y0 + ch - 7, 9.5 * u, S.wet < 0.05 ? 'rgba(255,255,255,0.7)' : '#7fd6ff', 'left', '700');
    }
    // アシスト表示
    if (c.assistTC || c.autoShift) text(ctx, (c.assistTC ? 'ASSIST ' : '') + (c.autoShift ? 'AT' : ''), x0 + 12, y0 + 30 * u, 8.5 * u, '#ffd23a', 'left', '700');
  }

  drawTiming(ctx, L, S, pl, u) {
    const w = L.w, cx = w / 2, y0 = L.pause.y;
    const pw = clamp(w * 0.3, 200, 290), ph = 58 * u;
    panel(ctx, cx - pw / 2, y0, pw, ph, 10, 0.58);
    const now = S.mode === 'race' ? S.raceTime : S.time;
    const running = pl.lap >= 1 && S.state === 'green' && !pl.finished;
    let cur = running ? now - pl.lapStart : null;
    // ラップ完了直後は確定タイムを表示
    if (this.lapFlash && this.t - this.lapFlash.t0 < 3.2) cur = this.lapFlash.time;
    const flashCol = this.lapFlash && this.t - this.lapFlash.t0 < 3.2 ? this.lapFlash.col : '#fff';
    text(ctx, cur == null ? '-:--.---' : fmtTime(cur), cx - pw / 2 + 12, y0 + 25 * u, 23 * u, flashCol, 'left', '800', true);
    // デルタ
    if (S.delta != null && running && !(this.lapFlash && this.t - this.lapFlash.t0 < 3.2)) {
      const d = S.delta, col = d <= 0 ? '#3fe07f' : '#ff5a4a';
      text(ctx, (d >= 0 ? '+' : '−') + Math.abs(d).toFixed(2), cx + pw / 2 - 12, y0 + 24 * u, 17 * u, col, 'right', '800', true);
    } else if (S.mode === 'race') {
      text(ctx, fmtTime(S.raceTime).slice(0, -2), cx + pw / 2 - 12, y0 + 22 * u, 12 * u, 'rgba(255,255,255,0.7)', 'right', '700');
    }
    text(ctx, `LAST ${fmtTime(pl.lastLap)}`, cx - pw / 2 + 12, y0 + 40 * u, 10.5 * u, pl.lastLap != null && pl.lastValid === false ? '#ffd23a' : 'rgba(255,255,255,0.85)', 'left', '700');
    text(ctx, `BEST ${fmtTime(pl.bestLap)}`, cx + pw / 2 - 12, y0 + 40 * u, 10.5 * u, '#d7a6ff', 'right', '700');
    // セクター
    const sw = (pw - 24 - 8) / 3;
    for (let k = 0; k < 3; k++) {
      const x = cx - pw / 2 + 12 + k * (sw + 4), y = y0 + 45 * u;
      const f = this.secFlash[k];
      let col = 'rgba(255,255,255,0.14)', label = `S${k + 1}`;
      const tcur = pl.curSec[k];
      if (tcur != null) { col = f ? f.col : '#f2c230'; label = tcur.toFixed(2); }
      else if (f && this.t - f.t0 < 4) { col = f.col; label = f.time.toFixed(2); }
      else if (pl.sector === k && running) col = 'rgba(255,255,255,0.4)';
      rr(ctx, x, y, sw, 9 * u, 2); ctx.fillStyle = col; ctx.fill();
      text(ctx, label, x + sw / 2, y + 7.6 * u, 8.5 * u, tcur != null || (f && this.t - f.t0 < 4) ? '#111' : 'rgba(255,255,255,0.8)', 'center', '800');
    }
  }

  drawMinimap(ctx, L, S, R, u) {
    const mm = R.minimap; if (!mm) return;
    const mw = clamp(L.w * 0.2, 130, 210), sc = mw / mm.W, mh = mm.H * sc;
    const x0 = L.w - L.m - L.safe.r - mw, y0 = L.pause.y;
    panel(ctx, x0 - 4, y0 - 2, mw + 8, mh + 4, 8, 0.4);
    ctx.drawImage(mm.c, x0, y0, mw, mh);
    const pl = S.player;
    for (const e of S.entries) {
      if (e.out || e === pl) continue;
      const x = x0 + mm.mx(e.car.x) * sc, y = y0 + mm.my(e.car.y) * sc;
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, 6.3); ctx.fillStyle = e.team.c1; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 0.8; ctx.stroke();
    }
    if (S.ghostPose) { const x = x0 + mm.mx(S.ghostPose.x) * sc, y = y0 + mm.my(S.ghostPose.y) * sc; ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.3); ctx.fillStyle = 'rgba(120,220,255,0.9)'; ctx.fill(); }
    const px = x0 + mm.mx(pl.car.x) * sc, py = y0 + mm.my(pl.car.y) * sc;
    ctx.beginPath(); ctx.arc(px, py, 4.4, 0, 6.3); ctx.fillStyle = '#ff7a1a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.stroke();
    this.mapBottom = y0 + mh + 6;
    this.mapX = x0; this.mapW = mw;
  }

  drawBoard(ctx, L, S, pl, u) {
    const order = S.order, n = order.length; if (n < 2) return;
    const rows = Math.min(L.h < 380 ? 3 : 5, n);
    let start = clamp(pl.pos - 1 - Math.floor(rows / 2), 0, n - rows);
    const rh = 15 * u, bw = this.mapW + 8, x0 = this.mapX - 4, y0 = this.mapBottom + 2;
    if (y0 + rows * rh > L.shiftUp.y - 6 && L.shiftUp.x > L.w / 2) return; // パドルに被るなら省略
    if (y0 + rows * rh > L.shiftDown.y - 6 && L.shiftDown.x > L.w / 2) return;
    panel(ctx, x0, y0, bw, rows * rh + 6, 8, 0.5);
    for (let k = 0; k < rows; k++) {
      const e = order[start + k], y = y0 + 3 + k * rh;
      if (e === pl) { rr(ctx, x0 + 2, y, bw - 4, rh, 4); ctx.fillStyle = 'rgba(255,140,30,0.35)'; ctx.fill(); }
      text(ctx, String(e.pos), x0 + 20 * u, y + rh * 0.75, 11 * u, '#fff', 'right', '800');
      ctx.fillStyle = e.team.c1; ctx.fillRect(x0 + 24 * u, y + 3, 3, rh - 6);
      text(ctx, e.d.short, x0 + 31 * u, y + rh * 0.75, 11 * u, e.retired ? 'rgba(255,255,255,0.4)' : '#fff', 'left', '700');
      let g = '';
      if (e.retired) g = 'OUT'; else if (e.pit) g = 'PIT';
      else if (e !== pl) { const dd = e.dist - pl.dist; const laps = Math.abs(dd) / S.T.length; g = laps >= 1 ? `${dd > 0 ? '+' : '-'}${Math.floor(laps)}L` : `${dd > 0 ? '-' : '+'}${(Math.abs(dd) / Math.max(20, (Math.abs(e.car.speed) + pl.car.speed) / 2)).toFixed(1)}`; }
      text(ctx, g, x0 + bw - 6, y + rh * 0.75, 10 * u, e.pit ? '#ffb347' : 'rgba(255,255,255,0.8)', 'right', '700');
    }
  }
}
