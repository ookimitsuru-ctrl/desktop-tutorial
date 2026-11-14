// 入力: プレイヤーが操作するのは アクセル・ブレーキ・シフト だけ。ステアリングは端末(自動操舵)が行う。
//  ・左下: 1本の横スライドパッド。中央より左がアクセル、右がブレーキ (中央から離れるほど強い)
//  ・右下: パドルシフト。左が DOWN、右が UP

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);

export const PEDAL_DEAD = 0.05;   // 中央のニュートラル幅 (パッド幅に対する片側の割合)
export const PEDAL_EDGE = 0.04;   // 端の余白 (ここまで動かせば100%)

// 画面レイアウト (CSS px)。HUD と共有する。
export function computeLayout(w, h, cfg = {}, safe = { l: 0, r: 0, t: 0, b: 0 }) {
  const m = Math.max(8, Math.round(h * 0.022));
  const ml = m + safe.l, mr = m + safe.r, mb = m + safe.b, mt = m + safe.t;
  const padW = clamp(w * 0.40, 230, 430), padH = clamp(h * 0.21, 62, 96);
  const padY = h - mb - padH;
  const pedal = { x: ml, y: padY, w: padW, h: padH };
  const gap = Math.max(8, w * 0.012);
  const pw = clamp(w * 0.145, 92, 160), ph = clamp(h * 0.3, 84, 132);
  const shiftUp = { x: w - mr - pw, y: h - mb - ph, w: pw, h: ph };
  const shiftDown = { x: w - mr - pw * 2 - gap, y: h - mb - ph, w: pw, h: ph };
  const bs = clamp(h * 0.105, 34, 46);
  const L = {
    w, h, m, safe, pedal, shiftUp, shiftDown,
    // タッチ判定域 (パッドは上下・外側へ広げる)
    pedalZone: { x: 0, y: padY - padH * 0.45, w: ml + padW + 16, h: h - padY + padH * 0.45 },
    pause: { x: ml, y: mt, w: bs, h: bs },
    pit: { x: ml + bs + 8, y: mt, w: bs * 1.7, h: bs },
    reset: { x: ml + bs * 2.7 + 16, y: mt, w: bs * 1.5, h: bs },
    tyreBtns: [], retry: { x: ml + bs + 8, y: mt, w: bs * 1.7, h: bs }, trRow: [],
    centre: { x: pedal.x + padW + 10, w: shiftDown.x - (pedal.x + padW) - 20 },
  };
  for (let k = 0; k < 4; k++) L.tyreBtns.push({ x: ml + k * (bs + 6), y: mt + bs + 8, w: bs, h: bs });
  { const tw = clamp(w * 0.105, 74, 104); for (let k = 0; k < 3; k++) L.trRow.push({ x: ml + k * (tw + 6), y: mt + bs + 8, w: tw, h: bs * 0.82 }); }
  return L;
}
const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

export class Input {
  constructor(el, cfg) {
    this.el = el; this.cfg = cfg; this.layout = null;
    this.throttle = 0; this.brake = 0;
    this.pedal = 0;                 // -1 (アクセル全開) 〜 0 〜 +1 (フルブレーキ)。表示用
    this.pointers = new Map();
    this.keys = new Set();
    this.kThr = 0; this.kBrk = 0;
    this.onShift = null; this.onButton = null;
    this.enabled = true; this.showPit = false; this.showTyres = false; this.showReset = true; this.showRetry = false; this.showTrain = false;
    this.flash = { up: 0, down: 0 };
    this.pedalPtr = null; this.gpPrev = {};
    this.bind();
  }

  bind() {
    const el = this.el;
    const pos = ev => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    el.addEventListener('pointerdown', ev => {
      if (!this.enabled || !this.layout) return;
      ev.preventDefault();
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* 無視 */ }
      const p = pos(ev), L = this.layout;
      let role = null;
      if (inRect(L.pause, p.x, p.y, 8)) { this.onButton?.('pause'); return; }
      if (this.showPit && inRect(L.pit, p.x, p.y, 4)) { this.onButton?.('pit'); return; }
      if (this.showReset && inRect(L.reset, p.x, p.y, 4)) { this.onButton?.('reset'); return; }
      if (this.showRetry && inRect(L.retry, p.x, p.y, 4)) { this.onButton?.('retry'); return; }
      if (this.showTrain) for (let k = 0; k < 3; k++) if (inRect(L.trRow[k], p.x, p.y, 3)) { this.onButton?.('tr' + k); return; }
      if (this.showTyres) for (let k = 0; k < 4; k++) if (inRect(L.tyreBtns[k], p.x, p.y, 3)) { this.onButton?.('tyre' + k); return; }
      if (inRect(L.shiftUp, p.x, p.y, 6)) { role = 'up'; this.flash.up = 0.18; this.onShift?.(1); }
      else if (inRect(L.shiftDown, p.x, p.y, 6)) { role = 'down'; this.flash.down = 0.18; this.onShift?.(-1); }
      else if (inRect(L.pedalZone, p.x, p.y)) role = 'pedal';
      if (!role) return;
      if (role === 'pedal') for (const [id, q] of this.pointers) if (q.role === 'pedal') this.pointers.delete(id);
      this.pointers.set(ev.pointerId, { role, x: p.x, y: p.y });
    }, { passive: false });
    el.addEventListener('pointermove', ev => {
      const q = this.pointers.get(ev.pointerId); if (!q) return;
      ev.preventDefault(); const p = pos(ev); q.x = p.x; q.y = p.y;
    }, { passive: false });
    const up = ev => { this.pointers.delete(ev.pointerId); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', ev => ev.preventDefault());

    window.addEventListener('keydown', ev => {
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) ev.preventDefault();
      if (ev.repeat) return;
      this.keys.add(k);
      if (!this.enabled) { if (k === 'Escape' || k === 'p') this.onButton?.('pause'); return; }
      if (k === 'ArrowRight' || k === 'x' || k === 'e') { this.flash.up = 0.18; this.onShift?.(1); }
      else if (k === 'ArrowLeft' || k === 'z' || k === 'q') { this.flash.down = 0.18; this.onShift?.(-1); }
      else if (k === 'Escape' || k === 'p') this.onButton?.('pause');
      else if (k === 'r') this.onButton?.(this.showRetry ? 'retry' : 'reset');
      else if (k === 'i') this.onButton?.('pit');
      else if (k === 'c') this.onButton?.('camera');
      else if (k >= '1' && k <= '4') this.onButton?.('tyre' + (Number(k) - 1));
    });
    window.addEventListener('keyup', ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; this.keys.delete(k); });
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });
  }
  reset() { this.pointers.clear(); this.throttle = this.brake = 0; this.pedal = 0; this.kThr = this.kBrk = 0; }

  // パッド上の x 座標 → -1..+1 (左=アクセル側が負)
  pedalFromX(x) {
    const r = this.layout.pedal;
    const t = (x - r.x) / r.w - 0.5;                      // -0.5 .. +0.5
    const a = Math.abs(t), span = 0.5 - PEDAL_DEAD - PEDAL_EDGE;
    const v = sat((a - PEDAL_DEAD) / span);
    return t < 0 ? -v : v;
  }

  update(dt) {
    const cfg = this.cfg, L = this.layout;
    this.flash.up = Math.max(0, this.flash.up - dt); this.flash.down = Math.max(0, this.flash.down - dt);
    if (!L) return;
    let pp = null;
    for (const q of this.pointers.values()) if (q.role === 'pedal') pp = q;
    const hold = cfg.pedalRelease === 'hold';
    if (pp) this.pedal = this.pedalFromX(pp.x) * (cfg.pedalSwap ? -1 : 1);
    else if (!hold) this.pedal = 0;
    let thr = this.pedal < 0 ? -this.pedal : 0, brk = this.pedal > 0 ? this.pedal : 0;

    // キーボード (PC): ↑ アクセル / ↓ ブレーキ
    const K = this.keys;
    const kUp = K.has('ArrowUp') || K.has('w'), kDn = K.has('ArrowDown') || K.has('s') || K.has(' ');
    this.kThr = clamp(this.kThr + (kUp ? dt * 4.5 : -dt * 7), 0, 1);
    this.kBrk = clamp(this.kBrk + (kDn ? dt * 5 : -dt * 8), 0, 1);
    thr = Math.max(thr, this.kThr); brk = Math.max(brk, this.kBrk);

    // ゲームパッド: RT アクセル / LT ブレーキ / RB・A アップ / LB・X ダウン
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gps) {
      if (!gp || !gp.connected) continue;
      const b = i => (gp.buttons[i] ? gp.buttons[i].value : 0), pr = i => (gp.buttons[i] ? gp.buttons[i].pressed : false);
      thr = Math.max(thr, b(7)); brk = Math.max(brk, b(6));
      const edge = (i, fn) => { const now = pr(i); if (now && !this.gpPrev[i]) fn(); this.gpPrev[i] = now; };
      edge(5, () => { this.flash.up = 0.18; this.onShift?.(1); }); edge(0, () => { this.flash.up = 0.18; this.onShift?.(1); });
      edge(4, () => { this.flash.down = 0.18; this.onShift?.(-1); }); edge(2, () => { this.flash.down = 0.18; this.onShift?.(-1); });
      edge(9, () => this.onButton?.('pause'));
      break;
    }
    if (brk > 0.02 && thr > 0 && !pp) { /* キー同時押しはそのまま両方 */ }
    this.throttle = thr; this.brake = brk;
    if (!pp) this.pedal = brk > 0 ? brk : -thr;
    this.pedalPtr = pp;
  }
}
