/* 星の箱庭 — 起動・入力・保存 */
(function (H) {
  'use strict';

  var canvas = document.getElementById('sky');
  var stage = document.getElementById('stage');
  var renderer = H.createRenderer(canvas);
  var world = null;
  var speed = 1;
  var input = { active: false, x: 0, y: 0 };
  var saveTimer = 0;
  var uiTimer = 0;
  var last = 0;

  function load() {
    try {
      var raw = localStorage.getItem(H.SAVE_KEY);
      if (raw) return H.deserialize(JSON.parse(raw));
    } catch (e) { /* 保存が読めなくても新しい星から始める */ }
    return null;
  }

  function save() {
    try {
      localStorage.setItem(H.SAVE_KEY, JSON.stringify(H.serialize(world)));
    } catch (e) { /* 保存できない環境では黙って続ける */ }
  }

  /* パネルで隠れていない縦の帯を測る(携帯だと上下にパネルが積まれるため) */
  function measure() {
    var rect = canvas.getBoundingClientRect();
    var top = 0, bottom = rect.height;
    if (window.innerWidth <= 760) {
      var ps = document.querySelector('.panel-star');
      var pl = document.querySelector('.panel-log');
      if (ps) top = ps.getBoundingClientRect().bottom - rect.top;
      if (pl) bottom = pl.getBoundingClientRect().top - rect.top;
      if (bottom - top < 140) { top = 0; bottom = rect.height; }
    }
    var cy = (top + bottom) / 2;
    return {
      w: rect.width, h: rect.height,
      cx: rect.width / 2,
      cy: Math.min(Math.max(cy, rect.height * 0.15), rect.height * 0.85),
      band: Math.max(150, bottom - top)
    };
  }

  function fitCanvas() {
    renderer.resize();
    world.bounds = measure();
    world.pixelRadius = H.pixelRadiusOf(world.radius, world.bounds);
  }

  function pointerPos(ev) {
    var rect = canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left - rect.width / 2, y: ev.clientY - rect.top - rect.height / 2 };
  }

  function bindInput() {
    stage.addEventListener('pointerdown', function (ev) {
      if (ev.target.closest('.panel, .dock')) return;
      var p = pointerPos(ev);
      input.active = true; input.x = p.x; input.y = p.y;
      if (stage.setPointerCapture) { try { stage.setPointerCapture(ev.pointerId); } catch (e) {} }
      document.body.classList.add('is-pulling');
    });
    stage.addEventListener('pointermove', function (ev) {
      if (!input.active) return;
      var p = pointerPos(ev);
      input.x = p.x; input.y = p.y;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (name) {
      stage.addEventListener(name, function () {
        input.active = false;
        document.body.classList.remove('is-pulling');
      });
    });
    window.addEventListener('keydown', function (ev) {
      if (ev.code === 'Space' && !/input|textarea/i.test(ev.target.tagName)) {
        ev.preventDefault();
        var btn = document.querySelector('#speedGroup button[data-speed="' + (speed === 0 ? 1 : 0) + '"]');
        if (btn) btn.click();
      }
    });
    window.addEventListener('resize', fitCanvas);
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) save();
    });
  }

  function frame(now) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;

    var remaining = dt * speed;
    var guard = 0;
    while (remaining > 0.0005 && guard++ < 16) {
      var stepDt = Math.min(remaining, 1 / 45);
      H.step(world, stepDt, input);
      remaining -= stepDt;
    }

    renderer.draw(world, now / 1000, input);

    uiTimer -= dt;
    if (uiTimer <= 0) { uiTimer = 0.2; H.ui.sync(world); world.bounds = measure(); }
    saveTimer -= dt;
    if (saveTimer <= 0) { saveTimer = H.SAVE_INTERVAL; save(); }
  }

  var handlers = {
    onChange: save,
    onSpeed: function (v) { speed = v; },
    onReset: function () {
      world = H.createWorld();
      H.addLog(world, 'はじまり', 'また最初の一粒から。前の星のことは、日誌にだけ残っている。');
      fitCanvas();
      H.seed(world, 8);
      H.ui.attach(world);
      save();
    }
  };

  function boot(hotData) {
    world = (hotData && hotData.world ? H.deserialize(hotData.world) : null) || load() || H.createWorld();
    if (world.fresh && world.log.length === 0) {
      H.addLog(world, 'はじまり', '拾ってきた小さな岩のかけら。ここから、ひとつの星を育てる。');
    }
    fitCanvas();
    H.seed(world, 8);
    H.ui.init(world, handlers);
    bindInput();
    last = performance.now();
    requestAnimationFrame(frame);
  }

  /* 公開中のページが更新されても、育てた星は持ち越す */
  if (window.claude && window.claude.hot) {
    if (window.claude.hot.snapshot) {
      window.claude.hot.snapshot(function () { return { world: H.serialize(world) }; });
    }
    if (window.claude.hot.ready) window.claude.hot.ready(boot);
    else boot(window.claude.hot.data || {});
  } else {
    boot(null);
  }
})(window.Hakoniwa);
