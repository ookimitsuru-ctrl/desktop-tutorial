// 入力: 横スライドパッド(アクセル/ブレーキ)・パドルシフト・ステアリング(傾き / 親指シーソー / キーボード / ゲームパッド)
// 画面上にハンドル型の操作は置かない。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sat = v => (v < 0 ? 0 : v > 1 ? 1 : v);

// 画面レイアウト (CSS px)。HUD と共有する。
export function computeLayout(w, h, cfg = {}, safe = { l: 0, r: 0, t: 0, b: 0 }) {
  const m = Math.max(8, Math.round(h * 0.022));
  const ml = m + safe.l, mr = m + safe.r, mb = m + safe.b, mt = m + safe.t;
  const padW = clamp(w * 0.31, 170, 340), padH = clamp(h * 0.19, 56, 86);
  const padY = h - mb - padH;
  const brake = { x: ml, y: padY, w: padW, h: padH };
  const accel = { x: w - mr - padW, y: padY, w: padW, h: padH };
  const pw = clamp(padW * 0.5, 92, 150), ph = clamp(h * 0.2, 56, 84), gap = Math.max(8, h * 0.025);
  const padL = { x: ml, y: padY - gap - ph, w: pw, h: ph };
  const padR = { x: w - mr - pw, y: padY - gap - ph, w: pw, h: ph };
  const cross = (cfg.paddleLayout || 'cross') === 'cross';
  const bs = clamp(h * 0.105, 34, 46);
  const L = {
    w, h, m, safe, brake, accel,
    shiftUp: cross ? padL : padR, shiftDown: cross ? padR : padL,
    // タッチ判定域 (パッドは下端・外側まで広げる)
    brakeZone: { x: 0, y: padY - gap / 2, w: ml + padW + 14, h: h - padY + gap / 2 },
    accelZone: { x: accel.x - 14, y: padY - gap / 2, w: w - accel.x + 14, h: h - padY + gap / 2 },
    pause: { x: ml, y: mt, w: bs, h: bs },
    pit: { x: ml + bs + 8, y: mt, w: bs * 1.7, h: bs },
    reset: { x: ml + bs * 2.7 + 16, y: mt, w: bs * 1.5, h: bs },
    tyreBtns: [],
    centre: { x: brake.x + padW + 10, w: accel.x - (brake.x + padW) - 20 },
  };
  for (let k = 0; k < 4; k++) L.tyreBtns.push({ x: ml + k * (bs + 6), y: mt + bs + 8, w: bs, h: bs });
  return L;
}
const inRect = (r, x, y, pad = 0) => x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

export class Input {
  constructor(el, cfg) {
    this.el = el; this.cfg = cfg; this.layout = null;
    this.throttle = 0; this.brake = 0; this.steer = 0;
    this.rawThrottle = 0; this.rawBrake = 0;
    this.pointers = new Map();
    this.keys = new Set();
    this.kThr = 0; this.kBrk = 0; this.kSteer = 0;
    this.tilt = { ok: false, raw: 0, zero: 0, filt: 0, events: 0, lastT: 0 };
    this.thumb = { steer: 0 };
    this.onShift = null; this.onButton = null;
    this.enabled = true; this.showPit = false; this.showTyres = false; this.showReset = true;
    this.flash = { up: 0, down: 0 };
    this.touchSeen = false;
    this.steerSource = 'none';
    this.gpPrev = {};
    this.bind();
  }

  bind() {
    const el = this.el;
    const pos = ev => { const r = el.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    el.addEventListener('pointerdown', ev => {
      if (!this.enabled || !this.layout) return;
      ev.preventDefault();
      if (ev.pointerType === 'touch') this.touchSeen = true;
      try { el.setPointerCapture(ev.pointerId); } catch (e) { /* 無視 */ }
      const p = pos(ev), L = this.layout;
      let role = null;
      if (inRect(L.pause, p.x, p.y, 8)) { this.onButton?.('pause'); return; }
      if (this.showPit && inRect(L.pit, p.x, p.y, 4)) { this.onButton?.('pit'); return; }
      if (this.showReset && inRect(L.reset, p.x, p.y, 4)) { this.onButton?.('reset'); return; }
      if (this.showTyres) for (let k = 0; k < 4; k++) if (inRect(L.tyreBtns[k], p.x, p.y, 3)) { this.onButton?.('tyre' + k); return; }
      if (inRect(L.shiftUp, p.x, p.y, 8)) { role = 'up'; this.flash.up = 0.18; this.onShift?.(1); }
      else if (inRect(L.shiftDown, p.x, p.y, 8)) { role = 'down'; this.flash.down = 0.18; this.onShift?.(-1); }
      else if (inRect(L.accelZone, p.x, p.y)) role = 'accel';
      else if (inRect(L.brakeZone, p.x, p.y)) role = 'brake';
      if (!role) return;
      // 同じ役割の古い指は外す
      for (const [id, q] of this.pointers) if (q.role === role) this.pointers.delete(id);
      this.pointers.set(ev.pointerId, { role, x: p.x, y: p.y, sx: p.x, sy: p.y });
    }, { passive: false });
    el.addEventListener('pointermove', ev => {
      const q = this.pointers.get(ev.pointerId); if (!q) return;
      ev.preventDefault(); const p = pos(ev); q.x = p.x; q.y = p.y;
    }, { passive: false });
    const up = ev => { this.pointers.delete(ev.pointerId); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', ev => ev.preventDefault());

    window.addEventListener('keydown', ev => {
      if (ev.repeat) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) ev.preventDefault(); return; }
      const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      this.keys.add(k);
      if (!this.enabled) { if (k === 'Escape' || k === 'p') this.onButton?.('pause'); return; }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) ev.preventDefault();
      if (k === 'x' || k === 'e' || k === 'Shift') { this.flash.up = 0.18; this.onShift?.(1); }
      else if (k === 'z' || k === 'q' || k === 'Control') { this.flash.down = 0.18; this.onShift?.(-1); }
      else if (k === 'Escape' || k === 'p') this.onButton?.('pause');
      else if (k === 'r') this.onButton?.('reset');
      else if (k === 'i') this.onButton?.('pit');
      else if (k === 'c') this.onButton?.('camera');
      else if (k >= '1' && k <= '4') this.onButton?.('tyre' + (Number(k) - 1));
    });
    window.addEventListener('keyup', ev => { const k = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key; this.keys.delete(k); });
    window.addEventListener('blur', () => { this.keys.clear(); this.pointers.clear(); });

    // 傾きセンサー: 重力ベクトルの画面横方向成分からロール角を求める
    this._motion = ev => {
      const g = ev.accelerationIncludingGravity; if (!g || g.x == null) return;
      const mag = Math.hypot(g.x, g.y, g.z); if (mag < 3) return;
      let ang = 0;
      const so = (screen.orientation && typeof screen.orientation.angle === 'number') ? screen.orientation.angle : (typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0);
      // 画面右方向の重力成分 (Android 基準。上向きが正の反力ベクトル)
      let sr;
      if (so === 90) sr = -g.y; else if (so === 270) sr = g.y; else if (so === 180) sr = -g.x; else sr = g.x;
      ang = Math.asin(clamp(-sr / mag, -1, 1)); // 時計回り(右へ傾ける)が正
      if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) ang = -ang; // iOS は符号が逆
      const t = this.tilt; t.raw = ang; t.events++; t.lastT = performance.now();
      if (t.events > 3) t.ok = true;
    };
  }
  // ユーザー操作の中で呼ぶ (iOS は許可が必要)
  async enableTilt() {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        const r = await DeviceMotionEvent.requestPermission(); if (r !== 'granted') return false;
      }
      if (!this._motionOn) { window.addEventListener('devicemotion', this._motion); this._motionOn = true; }
      return true;
    } catch (e) { return false; }
  }
  calibrateTilt() { this.tilt.zero = this.tilt.raw; }
  reset() { this.pointers.clear(); this.throttle = this.brake = this.steer = 0; this.rawThrottle = this.rawBrake = 0; this.kThr = this.kBrk = this.kSteer = 0; this.tilt.filt = 0; }

  pedalFromX(rect, x, outwardRight) {
    let t = (x - rect.x) / rect.w;
    if (!outwardRight) t = 1 - t;
    return sat((t - 0.07) / 0.86);
  }

  update(dt) {
    const cfg = this.cfg, L = this.layout;
    this.flash.up = Math.max(0, this.flash.up - dt); this.flash.down = Math.max(0, this.flash.down - dt);
    if (!L) return;
    const out = (cfg.pedalDir || 'out') === 'out';
    let pa = null, pb = null;
    for (const q of this.pointers.values()) { if (q.role === 'accel') pa = q; else if (q.role === 'brake') pb = q; }
    const hold = cfg.pedalRelease === 'hold';
    // アクセルは右側: 外側=右, ブレーキは左側: 外側=左
    if (pa) this.rawThrottle = this.pedalFromX(L.accel, pa.x, out); else if (!hold) this.rawThrottle = 0;
    if (pb) this.rawBrake = this.pedalFromX(L.brake, pb.x, !out); else if (!hold) this.rawBrake = 0;
    let thr = this.rawThrottle, brk = this.rawBrake;

    // キーボード
    const K = this.keys;
    const kUp = K.has('ArrowUp') || K.has('w'), kDn = K.has('ArrowDown') || K.has('s') || K.has(' ');
    const kL = K.has('ArrowLeft') || K.has('a'), kR = K.has('ArrowRight') || K.has('d');
    this.kThr = clamp(this.kThr + (kUp ? dt * 4.5 : -dt * 7), 0, 1);
    this.kBrk = clamp(this.kBrk + (kDn ? dt * 5 : -dt * 8), 0, 1);
    const ks = (kR ? 1 : 0) - (kL ? 1 : 0);
    if (ks) this.kSteer = clamp(this.kSteer + ks * dt * (Math.sign(this.kSteer) === ks || this.kSteer === 0 ? 2.6 : 6), -1, 1);
    else this.kSteer -= clamp(this.kSteer, -dt * 5, dt * 5);
    thr = Math.max(thr, this.kThr); brk = Math.max(brk, this.kBrk);

    // ステアリング
    let steer = 0, src = 'none';
    const sens = cfg.steerSens ?? 1, dead = (cfg.steerDead ?? 2) * Math.PI / 180;
    const mode = cfg.steerMode || 'tilt';
    const t = this.tilt;
    const tiltLive = t.ok && performance.now() - t.lastT < 1500;
    if (mode === 'tilt' && tiltLive) {
      let a = t.raw - t.zero; if (cfg.tiltInvert) a = -a;
      const range = (26 / sens) * Math.PI / 180;
      let x = Math.abs(a) <= dead ? 0 : (Math.abs(a) - dead) / (range - dead) * Math.sign(a);
      x = clamp(x, -1, 1); x = Math.sign(x) * Math.pow(Math.abs(x), 1.2);
      t.filt += (x - t.filt) * Math.min(1, dt * 22);
      steer = t.filt; src = 'tilt';
    } else if ((mode === 'thumb' || (mode === 'tilt' && !tiltLive)) && (pa || pb)) {
      // 親指シーソー: 両手でハンドルを握っているつもりで、右手を下げ左手を上げると右に切れる
      const range = 60 / sens;
      const dA = pa ? (pa.y - pa.sy) : 0, dB = pb ? (pb.y - pb.sy) : 0;
      let x = pa && pb ? (dA - dB) / (range * 1.4) : pa ? dA / range : -dB / range;
      const dz = 0.06; x = Math.abs(x) < dz ? 0 : (Math.abs(x) - dz) / (1 - dz) * Math.sign(x);
      steer = clamp(x, -1, 1); src = 'thumb';
    }
    if (this.kSteer !== 0 || ks) { steer = this.kSteer; src = 'keys'; }

    // ゲームパッド
    const gps = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of gps) {
      if (!gp || !gp.connected) continue;
      const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.06) { steer = Math.sign(ax) * Math.pow(Math.abs(ax), 1.4); src = 'pad'; }
      const b = i => (gp.buttons[i] ? gp.buttons[i].value : 0), pr = i => (gp.buttons[i] ? gp.buttons[i].pressed : false);
      thr = Math.max(thr, b(7)); brk = Math.max(brk, b(6));
      const edge = (i, fn) => { const now = pr(i); if (now && !this.gpPrev[i]) fn(); this.gpPrev[i] = now; };
      edge(5, () => { this.flash.up = 0.18; this.onShift?.(1); }); edge(0, () => { this.flash.up = 0.18; this.onShift?.(1); });
      edge(4, () => { this.flash.down = 0.18; this.onShift?.(-1); }); edge(2, () => { this.flash.down = 0.18; this.onShift?.(-1); });
      edge(9, () => this.onButton?.('pause'));
      break;
    }
    this.steerSource = src;
    this.throttle = thr; this.brake = brk;
    this.steer = clamp(steer * (cfg.maxLock ?? 1), -1, 1);
    this.accelPtr = pa; this.brakePtr = pb;
  }
}
