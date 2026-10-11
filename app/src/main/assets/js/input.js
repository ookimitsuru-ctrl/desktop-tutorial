'use strict';
// ============================================================
//  input.js  タッチ操作: 右に小型ハンドル / 左にブレーキとアクセル
//            (アクセルは押すと加速, 離すとエンジンブレーキで軽く減速)
//            キーボード: ←→ / A D でハンドル, ↑ / W でアクセル, ↓ / S / Space でブレーキ
// ============================================================
(function () {
  var I = G.Input = {
    steer: 0,          // -1..1
    wheel: 0,          // ハンドル角 (deg)
    MAX_DEG: 110,      // フルロック角
    brake: false, accel: false,
    taps: [],          // メニュー用タップ
    steerId: null,
    pedals: {},        // 左側を押している指: pointerId -> x
    lastAng: 0, holdAng: 0,
    keyL: false, keyR: false, keyB: false, keyA: false,
    active: false      // タッチ操作中か (ガイド表示用)
  };

  // 画面上の配置 (内部解像度座標) — hud.js と共有
  I.layout = function () {
    var W = G.R.W, H = G.R.H;
    return {
      wheel: { x: W - 46, y: H - 48, r: 30 },
      brake: { x: 8, y: H - 58, w: 40, h: 50 },     // 左: ブレーキ (幅広)
      accel: { x: 54, y: H - 70, w: 30, h: 62 },    // その右: アクセル (縦長)
      pedalSplitX: 51,                               // これより左はブレーキ, 右はアクセル
      steerZoneX: W * 0.52,
      pedalZoneX: W * 0.42
    };
  };

  function toLocal(e) {
    var r = G.R.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) / r.width * G.R.W,
      y: (e.clientY - r.top) / r.height * G.R.H
    };
  }
  function angOf(p) {
    var L = I.layout();
    return Math.atan2(p.y - L.wheel.y, p.x - L.wheel.x) * 180 / Math.PI;
  }

  function down(e) {
    if (G.Audio) G.Audio.unlock();
    var p = toLocal(e);
    I.taps.push(p);
    var L = I.layout();
    if (p.x >= L.steerZoneX && I.steerId === null) {
      I.steerId = e.pointerId;
      I.lastAng = angOf(p);
      I.lastPos = p;
      I.active = true;
    } else if (p.x <= L.pedalZoneX) {
      I.pedals[e.pointerId] = p.x;
      updatePedals();
      I.active = true;
    }
    try { G.R.canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    e.preventDefault();
  }
  // 左側の指の位置でブレーキ/アクセルを決める (指を滑らせて踏みかえ可)
  function updatePedals() {
    var split = I.layout().pedalSplitX, b = false, a = false;
    for (var id in I.pedals) { if (I.pedals[id] < split) b = true; else a = true; }
    I.brake = b; I.accelTouch = a;
  }
  function move(e) {
    if (I.pedals[e.pointerId] !== undefined) {
      I.pedals[e.pointerId] = toLocal(e).x;
      updatePedals();
      e.preventDefault();
      return;
    }
    if (e.pointerId !== I.steerId) return;
    var p = toLocal(e), L = I.layout();
    var dist = Math.hypot(p.x - L.wheel.x, p.y - L.wheel.y);
    if (dist > 7) {
      var a = angOf(p), d = a - I.lastAng;
      while (d > 180) d -= 360;
      while (d < -180) d += 360;
      I.wheel += d;
      I.lastAng = a;
    } else {
      // 中心付近は横移動で回す
      I.wheel += (p.x - I.lastPos.x) * 4;
      I.lastAng = angOf(p);
    }
    I.lastPos = p;
    I.wheel = G.clamp(I.wheel, -I.MAX_DEG, I.MAX_DEG);
    e.preventDefault();
  }
  function up(e) {
    if (e.pointerId === I.steerId) I.steerId = null;
    if (I.pedals[e.pointerId] !== undefined) { delete I.pedals[e.pointerId]; updatePedals(); }
  }
  I.releaseAll = function () { I.steerId = null; I.pedals = {}; I.brake = false; I.accelTouch = false; };

  function key(e, on) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') I.keyL = on;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') I.keyR = on;
    else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === ' ') I.keyB = on;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') I.keyA = on;
    else return;
    if (on && G.Audio) G.Audio.unlock();
    e.preventDefault();
  }

  I.init = function () {
    var cv = G.R.canvas;
    cv.addEventListener('pointerdown', down, { passive: false });
    cv.addEventListener('pointermove', move, { passive: false });
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener('lostpointercapture', up);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { I.taps.push({ x: G.R.W / 2, y: G.R.H / 2, key: true }); }
      key(e, true);
    });
    window.addEventListener('keyup', function (e) { key(e, false); });
    cv.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  I.update = function (dt) {
    // キーボードはハンドルを目標角へ回す
    if (I.keyL || I.keyR) {
      var target = (I.keyR ? I.MAX_DEG : 0) - (I.keyL ? I.MAX_DEG : 0);
      var sp = 420 * dt;
      I.wheel += G.clamp(target - I.wheel, -sp, sp);
    } else if (I.steerId === null) {
      // 手を離すとセンターへ戻る
      var back = 520 * dt;
      I.wheel = Math.abs(I.wheel) <= back ? 0 : I.wheel - G.sign(I.wheel) * back;
    }
    var s = I.wheel / I.MAX_DEG;
    I.steer = G.sign(s) * Math.min(1, Math.abs(s) * 1.05);
    I.braking = I.brake || I.keyB;
    I.accel = (I.accelTouch || I.keyA) && !I.braking;
  };
  I.consumeTap = function () { return I.taps.length ? I.taps.shift() : null; };
  I.clearTaps = function () { I.taps.length = 0; };
  I.reset = function () { I.wheel = 0; I.steer = 0; };
})();
