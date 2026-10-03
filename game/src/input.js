// 入力: タッチ(左=移動/ロール, 右=照準+ロックオン)、マウス、キーボード
import { clamp } from './util.js';
import { G } from './state.js';

export class Input {
  constructor(canvas, gfx) {
    this.canvas = canvas; this.gfx = gfx;
    this.touches = new Map();
    this.keys = {};
    this.ui = null; // UIハンドラ: {hit(x,y)->id|null, press(id,x,y), release(id)}
    this.mouse = { x: 0, y: 0, down: false, active: false };
    // フレーム出力
    this.moveX = 0; this.moveY = 0;
    this.aimDX = 0; this.aimDY = 0;
    this.aimAbs = null;
    this.fire = false;
    this.fireTap = false;
    this.rollDir = 0; // -1,+1 で発火
    this.flow = false; this.pause = false; this.back = false;
    this.anyPress = false; this.taps = []; // UI用タップ座標
    this.sens = 1.5;
    this._bind();
  }

  hud(e) {
    const r = this.canvas.getBoundingClientRect();
    const a = this.gfx.aspect;
    return [((e.clientX - r.left) / r.width * 2 - 1) * a, 1 - ((e.clientY - r.top) / r.height) * 2];
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => this._down(e));
    c.addEventListener('pointermove', (e) => this._move(e));
    const up = (e) => this._up(e);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space') this._keyRoll = true;
      if (e.code === 'KeyF' || e.code === 'KeyQ') this.flow = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pause = true;
      if (e.code === 'Enter') { this.taps.push([0, 0, 'enter']); }
      this.anyPress = true;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.touches.clear(); this.keys = {}; this.mouse.down = false; });
  }

  _down(e) {
    e.preventDefault();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const [x, y] = this.hud(e);
    this.anyPress = true;
    if (e.pointerType === 'mouse') {
      this.mouse.x = x; this.mouse.y = y; this.mouse.active = true;
      if (this.ui) {
        const id = this.ui.hit(x, y);
        if (id) { this.ui.press(id, x, y); this.mouse.ui = id; this.taps.push([x, y]); return; }
      }
      this.taps.push([x, y]);
      this.mouse.down = true; this.mouse.t0 = performance.now();
      return;
    }
    this.mouse.active = false;
    const t = { id: e.pointerId, x, y, sx: x, sy: y, ax: x, ay: y, t0: performance.now(), role: null, hist: [[performance.now(), x, y]], moved: 0 };
    this.taps.push([x, y]);
    if (this.ui) {
      const id = this.ui.hit(x, y);
      if (id) { t.role = 'ui'; t.uiId = id; this.ui.press(id, x, y); this.touches.set(e.pointerId, t); return; }
    }
    const a = this.gfx.aspect;
    const left = G.settings.lefty ? x > 0 : x < 0; // 左利きレイアウトでは左右を入れ替え
    const hasMove = [...this.touches.values()].some((q) => q.role === 'move');
    const hasAim = [...this.touches.values()].some((q) => q.role === 'aim');
    if (left) {
      if (!hasMove) t.role = 'move';
      else {
        t.role = 'tap';
      }
    } else if (!hasAim) t.role = 'aim';
    else t.role = 'tap';
    this.touches.set(e.pointerId, t);
    if (t.role === 'aim') { this._aimDown = true; }
  }

  _move(e) {
    const [x, y] = this.hud(e);
    if (e.pointerType === 'mouse') { this.mouse.x = x; this.mouse.y = y; this.mouse.active = true; return; }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    const now = performance.now();
    t.hist.push([now, x, y]);
    while (t.hist.length > 2 && now - t.hist[0][0] > 170) t.hist.shift();
    if (t.role === 'aim') {
      t.dx = (t.dx || 0) + (x - t.x); t.dy = (t.dy || 0) + (y - t.y);
      t.moved += Math.abs(x - t.x) + Math.abs(y - t.y);
    } else if (t.role === 'move') {
      t.moved += Math.abs(x - t.x) + Math.abs(y - t.y);
      // フローティングスティック
      const R = 0.25;
      let vx = x - t.ax, vy = y - t.ay;
      const l = Math.hypot(vx, vy);
      if (l > R * 1.5) { t.ax += vx / l * (l - R * 1.5); t.ay += vy / l * (l - R * 1.5); }
    }
    t.x = x; t.y = y;
  }

  _up(e) {
    if (e.pointerType === 'mouse') {
      if (this.mouse.ui && this.ui) { this.ui.release(this.mouse.ui); this.mouse.ui = null; }
      if (this.mouse.down && performance.now() - this.mouse.t0 < 170) this.fireTap = true;
      this.mouse.down = false; return;
    }
    const t = this.touches.get(e.pointerId);
    if (!t) return;
    if (t.role === 'ui' && this.ui) this.ui.release(t.uiId);
    if (t.role === 'aim' && performance.now() - t.t0 < 170 && t.moved < 0.08) this.fireTap = true;
    this.touches.delete(e.pointerId);
  }

  // フレームごとに呼ぶ。出力を ctrl として読む
  poll(dt) {
    this.aimDX = 0; this.aimDY = 0; this.aimAbs = null;
    let mx = 0, my = 0, fire = false;
    let hasMove = false;
    for (const t of this.touches.values()) {
      if (t.role === 'move') {
        const R = 0.25;
        let vx = (t.x - t.ax) / R, vy = (t.y - t.ay) / R;
        const l = Math.hypot(vx, vy);
        if (l > 1e-4) {
          const m = Math.min(1, l);
          const k = Math.pow(m, 1.3) / l; // 弱い入力は緩やかに
          vx *= k; vy *= k;
        }
        mx = vx; my = vy;
        hasMove = true;
      } else if (t.role === 'aim') {
        const sens = this.sens * [0.75, 1, 1.4][G.settings.aim === undefined ? 1 : G.settings.aim];
        this.aimDX += (t.dx || 0) * sens; this.aimDY += (t.dy || 0) * sens;
        t.dx = 0; t.dy = 0;
        fire = true;
      }
    }
    // キーボード
    const k = this.keys;
    let kx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    let ky = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; hasMove = true; }
    if (this._keyRoll) { this.rollDir = kx !== 0 ? kx : (this._lastRollDir = -(this._lastRollDir || -1)); this._keyRoll = false; }
    // マウス
    if (this.mouse.active && this.touches.size === 0) {
      this.aimAbs = [this.mouse.x, this.mouse.y];
      if (this.mouse.down) fire = true;
    }
    this.moveX = mx; this.moveY = my;
    this.fire = fire;
    const out = {
      moveX: mx, moveY: my, aimDX: this.aimDX, aimDY: this.aimDY, aimAbs: this.aimAbs, fire,
      fireTap: this.fireTap, roll: this.rollDir, flow: this.flow, pause: this.pause, hasMove,
    };
    this.fireTap = false; this.rollDir = 0; this.flow = false; this.pause = false;
    return out;
  }

  takeTaps() { const t = this.taps; this.taps = []; return t; }
  takeAnyPress() { const a = this.anyPress; this.anyPress = false; return a; }
  reset() { this.touches.clear(); this.keys = {}; this.mouse.down = false; this.taps.length = 0; }
}
