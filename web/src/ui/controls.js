import { h } from './dom.js';
import { haptic } from '../platform.js';

// タッチ操作: 左半分どこでも出現する仮想スティック + 右側のアクションボタン。
// キーボード（WASD/矢印 + J/K/L/I + Shift）とゲームパッドにも対応。

const LABELS = {
  attack: { shoot: ['シュート', 'SHOOT'], pass: ['パス', 'PASS'], through: ['スルー', 'THROUGH'], lob: ['ロブ', 'LOB'], sprint: ['ダッシュ', 'SPRINT'] },
  defend: { shoot: ['スライ<br>ディング', 'TACKLE'], pass: ['切替', 'SWITCH'], through: ['プレス', 'PRESS'], lob: ['—', ''], sprint: ['ダッシュ', 'SPRINT'] },
  setpiece: { shoot: ['シュート', 'SHOOT'], pass: ['パス', 'PASS'], through: ['スルー', 'THROUGH'], lob: ['クロス', 'CROSS'], sprint: ['ダッシュ', 'SPRINT'] },
  kickoff: { shoot: ['キック<br>オフ', 'KICK OFF'], pass: ['パス', 'PASS'], through: ['—', ''], lob: ['—', ''], sprint: ['—', ''] },
  penalty: { shoot: ['シュート', 'SHOOT'], pass: ['—', ''], through: ['—', ''], lob: ['—', ''], sprint: ['—', ''] },
  keeper: { shoot: ['ダイブ', 'DIVE'], pass: ['—', ''], through: ['—', ''], lob: ['—', ''], sprint: ['—', ''] },
};

const LAYOUT = {
  shoot: { size: 86, right: 22, bottom: 24, c: 'rgba(220, 40, 60, 0.6)' },
  pass: { size: 70, right: 122, bottom: 14, c: 'rgba(30, 150, 90, 0.6)' },
  through: { size: 58, right: 118, bottom: 100, c: 'rgba(30, 90, 200, 0.6)' },
  lob: { size: 58, right: 30, bottom: 126, c: 'rgba(230, 160, 20, 0.6)' },
  sprint: { size: 58, right: 210, bottom: 18, c: 'rgba(120, 120, 140, 0.55)' },
};

const KEYMAP = { KeyJ: 'pass', KeyK: 'shoot', KeyL: 'through', KeyI: 'lob', Space: 'shoot', ShiftLeft: 'sprint', ShiftRight: 'sprint' };

export class Controls {
  constructor(parent) {
    this.state = { x: 0, y: 0, mag: 0, sprint: false };
    this.listeners = { down: [], up: [] };
    this.mode = 'attack';
    this.held = {};
    this.keys = new Set();
    this.joyPointer = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.root = h('div.controls');
    this.joy = h('div.joy.idle', {}, h('div.knob'));
    this.knob = this.joy.firstChild;
    this.root.append(this.joy);
    this.buttons = {};
    for (const [name, L] of Object.entries(LAYOUT)) {
      const ring =
        name === 'shoot'
          ? '<svg class="ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.15)" stroke-width="6"/><circle class="pw" cx="50" cy="50" r="46" fill="none" stroke="#ffd84a" stroke-width="6" stroke-linecap="round" stroke-dasharray="289" stroke-dashoffset="289"/></svg>'
          : '';
      const b = h('div.abtn', {
        style: { width: `${L.size}px`, height: `${L.size}px`, right: `calc(var(--safe-r) + ${L.right - 14}px)`, bottom: `${L.bottom}px`, '--c': L.c },
        html: `<span class="lb"></span>${ring}`,
      });
      b.dataset.name = name;
      this.buttons[name] = b;
      this.root.append(b);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture?.(e.pointerId);
        this.press(name);
      });
      const up = (e) => {
        e.stopPropagation();
        this.release(name);
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
    }
    this.pw = this.buttons.shoot.querySelector('.pw');
    this.root.addEventListener('pointerdown', (e) => this.joyStart(e));
    this.root.addEventListener('pointermove', (e) => this.joyMove(e));
    this.root.addEventListener('pointerup', (e) => this.joyEnd(e));
    this.root.addEventListener('pointercancel', (e) => this.joyEnd(e));
    this.onKey = (e) => this.key(e);
    addEventListener('keydown', this.onKey);
    addEventListener('keyup', this.onKey);
    parent.append(this.root);
    this.setMode('attack');
    this.placeIdleJoy();
  }

  on(type, fn) {
    this.listeners[type].push(fn);
  }

  placeIdleJoy() {
    this.joy.style.left = `calc(var(--safe-l) + 96px)`;
    this.joy.style.top = `calc(100% - 104px)`;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    const L = LABELS[mode] || LABELS.attack;
    for (const [name, b] of Object.entries(this.buttons)) {
      const [ja, en] = L[name];
      b.querySelector('.lb').innerHTML = `${ja}${en ? `<small>${en}</small>` : ''}`;
      b.style.opacity = ja === '—' ? '0.25' : '1';
    }
  }

  setVisible(v) {
    this.root.style.display = v ? '' : 'none';
    if (!v) this.reset();
  }

  reset() {
    this.state.x = 0;
    this.state.y = 0;
    this.state.mag = 0;
    this.joyPointer = null;
    this.knob.style.transform = '';
    this.joy.classList.add('idle');
    this.placeIdleJoy();
    for (const k of Object.keys(this.held)) delete this.held[k];
    this.pw.style.strokeDashoffset = '289';
  }

  press(name) {
    if (this.held[name]) return;
    this.held[name] = performance.now();
    this.buttons[name].classList.add('down');
    if (name === 'sprint') this.state.sprint = true;
    haptic(8);
    for (const fn of this.listeners.down) fn(name);
  }

  release(name) {
    const t0 = this.held[name];
    if (!t0) return;
    delete this.held[name];
    this.buttons[name].classList.remove('down');
    if (name === 'sprint') this.state.sprint = false;
    const hold = (performance.now() - t0) / 1000;
    if (name === 'shoot') this.pw.style.strokeDashoffset = '289';
    for (const fn of this.listeners.up) fn(name, hold);
  }

  /** シュートボタンを押している時間からパワー(0..1) */
  get shotPower() {
    const t0 = this.held.shoot;
    if (!t0) return 0;
    return Math.min(1, (performance.now() - t0) / 1000 / 0.85);
  }

  joyStart(e) {
    if (this.joyPointer !== null) return;
    const w = innerWidth;
    if (e.clientX > w * 0.5 || e.clientY < 60) return;
    this.joyPointer = e.pointerId;
    this.root.setPointerCapture?.(e.pointerId);
    this.joyOrigin.x = e.clientX;
    this.joyOrigin.y = e.clientY;
    this.joy.style.left = `${e.clientX}px`;
    this.joy.style.top = `${e.clientY}px`;
    this.joy.classList.remove('idle');
    this.joyMove(e);
  }

  joyMove(e) {
    if (e.pointerId !== this.joyPointer) return;
    const R = 52;
    let dx = e.clientX - this.joyOrigin.x;
    let dy = e.clientY - this.joyOrigin.y;
    const d = Math.hypot(dx, dy);
    // 指が大きく離れたらベースを追従させる
    if (d > R * 1.6) {
      const k = (d - R * 1.6) / d;
      this.joyOrigin.x += dx * k;
      this.joyOrigin.y += dy * k;
      this.joy.style.left = `${this.joyOrigin.x}px`;
      this.joy.style.top = `${this.joyOrigin.y}px`;
      dx = e.clientX - this.joyOrigin.x;
      dy = e.clientY - this.joyOrigin.y;
    }
    const dd = Math.hypot(dx, dy);
    const cl = Math.min(dd, R);
    const nx = dd > 0 ? dx / dd : 0;
    const ny = dd > 0 ? dy / dd : 0;
    this.knob.style.transform = `translate(${nx * cl}px, ${ny * cl}px)`;
    const mag = dd < 6 ? 0 : Math.min(1, (dd - 6) / (R - 6));
    this.state.x = nx;
    this.state.y = -ny;
    this.state.mag = mag;
  }

  joyEnd(e) {
    if (e.pointerId !== this.joyPointer) return;
    this.joyPointer = null;
    this.state.mag = 0;
    this.knob.style.transform = '';
    this.joy.classList.add('idle');
    this.placeIdleJoy();
  }

  key(e) {
    if (e.repeat) return;
    const down = e.type === 'keydown';
    const k = e.code;
    const act = KEYMAP[k];
    if (act) {
      e.preventDefault();
      if (down) this.press(act);
      else this.release(act);
      return;
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) {
      e.preventDefault();
      if (down) this.keys.add(k);
      else this.keys.delete(k);
    }
  }

  /** 毎フレーム: キーボードとゲームパッドの入力を合成 */
  poll() {
    if (this.testInput) {
      Object.assign(this.state, this.testInput);
      return;
    }
    if (this.root.style.display === 'none') return;
    if (this.keys.size) {
      let x = 0;
      let y = 0;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      const l = Math.hypot(x, y);
      this.state.x = l ? x / l : 0;
      this.state.y = l ? y / l : 0;
      this.state.mag = l ? 1 : 0;
    } else if (this.joyPointer === null && !this.padActive) {
      this.state.mag = 0;
    }
    // ゲームパッド
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.padActive = false;
    for (const gp of pads) {
      if (!gp) continue;
      const ax = gp.axes[0] || 0;
      const ay = gp.axes[1] || 0;
      const l = Math.hypot(ax, ay);
      if (l > 0.18) {
        this.padActive = true;
        this.state.x = ax / l;
        this.state.y = -ay / l;
        this.state.mag = Math.min(1, (l - 0.18) / 0.75);
      } else if (this.joyPointer === null && !this.keys.size) this.state.mag = 0;
      const map = { 0: 'pass', 1: 'shoot', 2: 'through', 3: 'lob', 5: 'sprint', 7: 'sprint' };
      for (const [i, name] of Object.entries(map)) {
        const pressed = gp.buttons[i]?.pressed;
        const was = this.padHeld?.[i];
        if (pressed && !was) this.press(name);
        if (!pressed && was) this.release(name);
        this.padHeld = this.padHeld || {};
        this.padHeld[i] = pressed;
      }
      break;
    }
    if (this.held.shoot) this.pw.style.strokeDashoffset = `${289 * (1 - this.shotPower)}`;
  }

  destroy() {
    removeEventListener('keydown', this.onKey);
    removeEventListener('keyup', this.onKey);
    this.root.remove();
  }
}
