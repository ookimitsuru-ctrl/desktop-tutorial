// Unified keyboard + touch input. Exposes a plain state object read each frame.
export class InputController {
  constructor() {
    this.state = {
      moveX: 0, // -1..1 (strafe left/right relative to camera axis)
      moveY: 0, // -1..1 (back/forward relative to camera axis)
      lookX: 0, // right-stick horizontal (camera orbit)
      jump: false,
      dash: false,
      saber: false,
      missile: false,
      shot: false,
    };
    this._pressed = new Set();
    this._bindKeyboard();
    this._bindStick();
    this._bindButtons();
  }

  _bindKeyboard() {
    window.addEventListener("keydown", (e) => this._pressed.add(e.code));
    window.addEventListener("keyup", (e) => this._pressed.delete(e.code));
  }

  _bindStick() {
    const zone = document.getElementById("stick-left");
    const knob = zone.querySelector(".stick-knob");
    let active = false;
    let touchId = null;
    const maxR = 44;

    const setKnob = (dx, dy) => {
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    };

    const start = (id, clientX, clientY) => {
      active = true;
      touchId = id;
      updateFrom(clientX, clientY);
    };
    const updateFrom = (clientX, clientY) => {
      const rect = zone.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = clientX - cx;
      let dy = clientY - cy;
      const r = Math.hypot(dx, dy);
      if (r > maxR) {
        dx = (dx / r) * maxR;
        dy = (dy / r) * maxR;
      }
      setKnob(dx, dy);
      this.state.moveX = dx / maxR;
      this.state.moveY = -dy / maxR;
    };
    const end = () => {
      active = false;
      touchId = null;
      setKnob(0, 0);
      this.state.moveX = 0;
      this.state.moveY = 0;
    };

    zone.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      start(t.identifier, t.clientX, t.clientY);
    }, { passive: false });
    zone.addEventListener("touchmove", (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) updateFrom(t.clientX, t.clientY);
      }
    }, { passive: false });
    zone.addEventListener("touchend", (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === touchId) end();
      }
    });
    zone.addEventListener("touchcancel", end);

    // mouse support (desktop testing)
    zone.addEventListener("mousedown", (e) => start("mouse", e.clientX, e.clientY));
    window.addEventListener("mousemove", (e) => {
      if (active) updateFrom(e.clientX, e.clientY);
    });
    window.addEventListener("mouseup", () => {
      if (active) end();
    });
  }

  _bindButtons() {
    const map = {
      "btn-jump": "jump",
      "btn-dash": "dash",
      "btn-saber": "saber",
      "btn-missile": "missile",
      "btn-shot": "shot",
    };
    for (const [id, key] of Object.entries(map)) {
      const el = document.getElementById(id);
      const on = (e) => {
        e.preventDefault();
        this.state[key] = true;
      };
      const off = (e) => {
        e.preventDefault();
        this.state[key] = false;
      };
      el.addEventListener("touchstart", on, { passive: false });
      el.addEventListener("touchend", off, { passive: false });
      el.addEventListener("touchcancel", off, { passive: false });
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
    }
  }

  // call once per frame to fold keyboard state into the same interface
  poll() {
    const p = this._pressed;
    let kx = 0, ky = 0;
    if (p.has("KeyA") || p.has("ArrowLeft")) kx -= 1;
    if (p.has("KeyD") || p.has("ArrowRight")) kx += 1;
    if (p.has("KeyS") || p.has("ArrowDown")) ky -= 1;
    if (p.has("KeyW") || p.has("ArrowUp")) ky += 1;
    if (kx !== 0 || ky !== 0) {
      this.state.moveX = kx;
      this.state.moveY = ky;
    }
    this.state.jump = this.state.jump || p.has("Space");
    this.state.dash = this.state.dash || p.has("ShiftLeft") || p.has("ShiftRight");
    this.state.shot = this.state.shot || p.has("KeyJ");
    this.state.missile = this.state.missile || p.has("KeyK");
    this.state.saber = this.state.saber || p.has("KeyL");
    return this.state;
  }

  // consume one-shot style buttons manually where needed by caller
  clearFrameKeyboardOnly() {}
}
