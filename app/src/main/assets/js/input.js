'use strict';
// ============================================================
//  input.js  タッチ操作: 右にアナログスティック / 左にブレーキとアクセル
//            (アクセルは押すと加速, 離すとエンジンブレーキで軽く減速)
//            キーボード: ←→ / A D でハンドル, ↑ / W でアクセル, ↓ / S / Space でブレーキ
// ============================================================
(function () {
  var I = G.Input = {
    steer: 0,          // -1..1
    stickX: 0, stickY: 0,   // スティックの倒れ具合 (-1..1, 見た目用に縦も持つ)
    origin: null,      // スティックの中心 (触っている間)
    brake: false, accel: false,
    taps: [],          // メニュー用タップ
    steerId: null,
    pedals: {},        // 左側を押している指: pointerId -> x
    keyL: false, keyR: false, keyB: false, keyA: false, keySteer: 0,
    direct: null,      // 自動操縦 (デモ映像など) がハンドル量を直接入れる時
    active: false      // タッチ操作中か (ガイド表示用)
  };
  var DEAD = 0.08;     // 中央の遊び

  // 画面上の配置 (内部解像度座標) — hud.js と共有
  I.layout = function () {
    var W = G.R.W, H = G.R.H;
    return {
      stick: { x: W - 48, y: H - 50, r: 26 },       // 右: スティック (r = 倒しきる距離)
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

  // 指の位置からスティックの倒れ具合を決める
  function setStick(p) {
    var r = I.layout().stick.r, dx = p.x - I.origin.x, dy = p.y - I.origin.y, d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    I.stickX = dx / r; I.stickY = dy / r;
  }

  function down(e) {
    if (G.Audio) G.Audio.unlock();
    var p = toLocal(e);
    I.taps.push(p);
    var L = I.layout();
    if (p.x >= L.steerZoneX && I.steerId === null) {
      I.steerId = e.pointerId;
      // スティックの上を押したらそこが中心。右半分の別の場所なら, 押した所に出てくる
      var s = L.stick, near = Math.hypot(p.x - s.x, p.y - s.y) <= s.r * 1.3;
      I.origin = near ? { x: s.x, y: s.y } : { x: p.x, y: p.y };
      setStick(p);
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
    setStick(toLocal(e));
    e.preventDefault();
  }
  function releaseStick() { I.steerId = null; I.origin = null; I.stickX = 0; I.stickY = 0; }
  function up(e) {
    if (e.pointerId === I.steerId) releaseStick();
    if (I.pedals[e.pointerId] !== undefined) { delete I.pedals[e.pointerId]; updatePedals(); }
  }
  I.releaseAll = function () { releaseStick(); I.pedals = {}; I.brake = false; I.accelTouch = false; };

  function key(e, on) {
    var k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') I.keyL = on;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') I.keyR = on;
    else if (k === 'ArrowDown' || k === 's' || k === 'S' || k === ' ') I.keyB = on;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') I.keyA = on;
    else return;
    if (on && G.Audio) G.Audio.unlock();
    if (on) I.lastKey = k;
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
    var s;
    if (I.direct !== null) {
      s = I.direct;
      I.stickX = s;
    } else if (I.keyL || I.keyR) {
      // キーボードは押している間だけ, なめらかに倒していく
      var target = (I.keyR ? 1 : 0) - (I.keyL ? 1 : 0);
      I.keySteer += G.clamp(target - I.keySteer, -4 * dt, 4 * dt);
      s = I.keySteer;
    } else {
      I.keySteer = 0;
      // スティック: 中央の遊びを除いて, 小さく倒した時は細かく効くようにする
      var a = Math.abs(I.stickX);
      var f = a <= DEAD ? 0 : (a - DEAD) / (1 - DEAD);
      s = G.sign(I.stickX) * (0.45 * f + 0.55 * f * f);
    }
    I.steer = G.clamp(s, -1, 1);
    I.braking = I.brake || I.keyB;
    I.accel = (I.accelTouch || I.keyA) && !I.braking;
  };
  I.consumeTap = function () { return I.taps.length ? I.taps.shift() : null; };
  I.clearTaps = function () { I.taps.length = 0; };
  I.reset = function () { I.stickX = 0; I.stickY = 0; I.steer = 0; I.keySteer = 0; };
})();
