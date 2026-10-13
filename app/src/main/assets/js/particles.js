'use strict';
// ============================================================
//  particles.js  天候 (落ち葉・雪・桜の花びら・花吹雪) と 車の煙/砂ぼこり/火花
// ============================================================
(function () {
  var FX = G.FX = { weather: [], puffs: [], storm: 0, stormTarget: 0, wind: 0, t: 0 };
  var C = G.col;
  var MAXW = 600;

  // 季節ごとの天候: [密度, 種類]
  var WEATHER = [
    { n: 0, kind: null },
    { n: 60, kind: 'leaf' },
    { n: 190, kind: 'snow' },
    { n: 80, kind: 'petal' }
  ];
  var LEAF = ['#e8401c', '#f07a1c', '#ffb428', '#c02818', '#ffd040'].map(function (h) { return G.css(h); });
  var LEAF_D = ['#9a2010', '#a84a10', '#c07a10', '#801808', '#b08a10'].map(function (h) { return G.css(h); });
  var PETAL = ['#ffc4dc', '#ff9cc4', '#ffe4ef', '#ff7eb2', '#ffffff'].map(function (h) { return G.css(h); });
  var PETAL_D = ['#e0709e', '#c85486', '#f0a4c4', '#b8406e', '#f0b8d0'].map(function (h) { return G.css(h); });
  var SNOW = ['#ffffff', '#e8eeff', '#d0dcf8'].map(function (h) { return G.css(h); });

  // mode 'far': 視界内の奥に出現 (走行で近づいてくる) / 'any': 視界内のどこか
  // mode 'edge': 画面の上か風上の端から吹き込む (停車中)
  function spawn(p, kind, mode) {
    p.kind = kind;
    p.z = mode === 'far' ? 3.5 + Math.random() * 6.5 : 0.5 + Math.pow(Math.random(), FX.storm > 0.3 ? 2.2 : 1.4) * 9;
    p.x = (Math.random() * 2 - 1) * p.z * 1.05;
    p.y = (Math.random() * 1.0 - 0.45) * p.z;
    if (mode === 'edge') {
      p.z = 0.5 + Math.pow(Math.random(), FX.storm > 0.3 ? 2.0 : 1.3) * 7;
      if (Math.random() < 0.55 && Math.abs(FX.wind) > 0.3) { p.x = -G.sign(FX.wind) * p.z * 1.04; p.y = (Math.random() * 0.9 - 0.4) * p.z; }
      else { p.y = -p.z * 0.4 - Math.random() * 0.15; p.x = (Math.random() * 2.2 - 1.1) * p.z; }
    }
    p.vy = kind === 'snow' ? 0.5 + Math.random() * 0.5 : (kind === 'leaf' ? 0.35 + Math.random() * 0.4 : 0.25 + Math.random() * 0.35);
    p.ph = Math.random() * 6.28;
    p.fr = 2 + Math.random() * 4;
    p.c = Math.floor(Math.random() * 5);
    p.alive = true;
  }

  FX.setStorm = function (v) { FX.stormTarget = v; };

  FX.reset = function () { FX.weather.length = 0; FX.puffs.length = 0; FX.storm = 0; FX.stormTarget = 0; FX.fw.rockets.length = 0; FX.fw.sparks.length = 0; };

  FX.burst = function (type, x, y, n) {
    for (var i = 0; i < n; i++) {
      FX.puffs.push({
        type: type, x: x + (Math.random() - 0.5) * 50, y: y - Math.random() * 10,
        vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 40, life: 0, max: 0.6 + Math.random() * 0.6, r: 3 + Math.random() * 4
      });
    }
  };

  FX.update = function (dt, Game, P) {
    FX.t += dt;
    updateFireworks(dt, Game);
    var T = G.Track;
    var sa = T.seasonAt(P.z + G.R.playerZ);
    var seg = P.seg || T.segments[0];
    // 終盤ほど花びらを増やす → ゴールで花吹雪
    var zone = seg.zone;
    if (zone === 'final') {
      var k = (seg.index - (T.goalIndex - 260)) / 260;
      FX.stormTarget = Math.max(FX.stormTarget, G.clamp(k, 0, 1) * 0.55);
    }
    if (zone !== 'final' && zone !== 'finale' && Game.state !== 'goal' && Game.state !== 'ending') FX.stormTarget = 0;
    FX.storm += (FX.stormTarget - FX.storm) * Math.min(1, dt * 0.8);

    var cur = WEATHER[sa.season], prev = sa.season > 0 ? WEATHER[sa.season - 1] : cur;
    var target = Math.round(cur.n * sa.blend + prev.n * (1 - sa.blend) + FX.storm * 540);
    if (Game.state === 'title') target = Math.round(target * 0.6);
    target = Math.min(MAXW, target);
    var w = FX.weather;
    while (w.length < target) {
      var p = {};
      var kind = Math.random() < sa.blend ? cur.kind : prev.kind;
      if (FX.storm > 0.05) kind = 'petal';
      if (!kind) break;
      spawn(p, kind, 'any');
      w.push(p);
    }
    if (w.length > target) w.length = Math.max(target, w.length - 3);

    var sp = P.speed / G.MAX_SPEED;
    FX.wind = Math.sin(FX.t * 0.35) * 0.6 + FX.storm * (3.2 + Math.sin(FX.t * 0.9) * 1.2);
    var curve = seg.curve || 0;
    for (var i = 0; i < w.length; i++) {
      var q = w[i];
      q.z -= dt * (sp * 9 + (q.kind === 'petal' ? FX.storm * 0.5 : 0) + 0.1);
      q.y += q.vy * dt * (q.kind === 'snow' ? 1 : 0.8 + FX.storm * 0.6);
      q.x += (Math.sin(FX.t * q.fr * 0.5 + q.ph) * (q.kind === 'snow' ? 0.4 : 1.1) + FX.wind) * dt - curve * sp * dt * 0.6;
      if (q.kind === 'petal' && FX.storm > 0) q.y += Math.sin(FX.t * 1.7 + q.ph) * FX.storm * dt * 1.5;
      if (q.z < 0.35 || q.y / q.z > 0.62 || Math.abs(q.x / q.z) > 1.25) {
        var kind2 = Math.random() < sa.blend ? cur.kind : prev.kind;
        if (FX.storm > 0.05) kind2 = 'petal';
        if (!kind2) { w.splice(i, 1); i--; continue; }
        spawn(q, kind2, sp > 0.25 ? 'far' : 'edge');
      }
    }

    // 煙 / 砂ぼこり
    if (Game.carScreen && P.speed > 300) {
      var cs = Game.carScreen, tw = G.CAR_TIRE_X;
      if (P.skid > 0.3 && Math.random() < P.skid * 0.9) {
        FX.puffs.push({ type: 'smoke', x: cs.x + (Math.random() < 0.5 ? -tw : tw), y: cs.y - 4, vx: (Math.random() - 0.5) * 30, vy: -10 - Math.random() * 20, life: 0, max: 0.5 + Math.random() * 0.3, r: 2 + Math.random() * 2 });
      }
      if (P.offroad && Math.random() < 0.8) {
        var col = seg.pal.grounds[Math.abs(P.x) > 0 && P.x < 0 ? seg.gl : seg.gr] || seg.pal.grounds.grass;
        FX.puffs.push({ type: 'dust', col: G.css(col[0][3]), x: cs.x + (Math.random() * 2 - 1) * (tw + 2), y: cs.y - 3, vx: (Math.random() - 0.5) * 60, vy: -20 - Math.random() * 30, life: 0, max: 0.4 + Math.random() * 0.3, r: 2 + Math.random() * 3 });
      }
    }
    // 木や岩を擦っている側から火花
    if (Game.carScreen && P.scrape) {
      var cs2 = Game.carScreen, side = -P.scrape, ns = 2 + Math.floor(Math.random() * (2 + sp * 5));
      for (var s2 = 0; s2 < ns; s2++) {
        FX.puffs.push({ type: 'spark', x: cs2.x + side * (G.CAR_BODY_W / 2 - 2 - Math.random() * 4), y: cs2.y - 4 - Math.random() * 18,
          vx: side * (30 + Math.random() * 130), vy: -40 - Math.random() * 110, life: 0, max: 0.2 + Math.random() * 0.3, r: 0 });
      }
    }
    for (i = FX.puffs.length - 1; i >= 0; i--) {
      var f = FX.puffs[i];
      f.px = f.x; f.py = f.y;
      f.life += dt; f.x += f.vx * dt; f.y += f.vy * dt;
      if (f.type === 'spark') { f.vy += 420 * dt; } else { f.vy += 30 * dt; f.r += dt * 8; }
      if (f.life > f.max) FX.puffs.splice(i, 1);
    }
    if (FX.puffs.length > 120) FX.puffs.splice(0, FX.puffs.length - 120);
  };

  // ---------- 花火 (ゴールしたら空に打ち上げる) ----------
  //  昼の空でも目立つよう, 濃い色の 2px の火花に暗い縁と短い尾をつける
  var FW_COLS = [['#ff2a8a', '#ffd0e6', '#5a0028'], ['#ffb000', '#fff4c0', '#5a3000'], ['#00b0ff', '#d8f6ff', '#00305a'],
    ['#30e040', '#e0ffe0', '#004010'], ['#ff5000', '#ffe0c8', '#501000'], ['#a040ff', '#f0e0ff', '#2a0050']];
  var fw = FX.fw = { rockets: [], sparks: [], next: 0.3 };
  function launch() {
    var R = G.R, y0 = R.HOR + R.pitch + 2, ty = 12 + Math.random() * 46;
    var side = Math.random() < 0.5 ? 0.06 + Math.random() * 0.28 : 0.66 + Math.random() * 0.28;   // 文字を避けて左右に
    fw.rockets.push({ x: R.W * side, y: y0, vx: (Math.random() - 0.5) * 12, vy: -Math.sqrt(2 * 80 * Math.max(10, y0 - ty)), col: FW_COLS[Math.floor(Math.random() * FW_COLS.length)] });
  }
  function burst(r) {
    var willow = Math.random() < 0.22, filled = !willow && Math.random() < 0.5, n = (filled ? 70 : 44) + Math.floor(Math.random() * 20), sp = 62 + Math.random() * 26;
    for (var i = 0; i < n; i++) {
      // 輪 / 中まで詰まった菊 / しだれ柳
      var a = i / n * Math.PI * 2 + Math.random() * 0.1, s = sp * (willow ? 0.9 + Math.random() * 0.2 : (filled ? 0.25 + Math.sqrt(Math.random()) * 0.8 : 0.8 + Math.random() * 0.25));
      fw.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: willow ? 2.2 : 1.5 + Math.random() * 0.3, max: willow ? 2.2 : 1.8,
        col: willow ? ['#ffa020', '#fff0b0', '#4a2400'] : r.col, g: willow ? 30 : 20 });
    }
    // 内側の輪 (別の色)
    if (!willow && !filled) {
      var c2 = FW_COLS[(FW_COLS.indexOf(r.col) + 2) % FW_COLS.length];
      for (i = 0; i < 18; i++) {
        var a2 = i / 18 * Math.PI * 2;
        fw.sparks.push({ x: r.x, y: r.y, vx: Math.cos(a2) * sp * 0.45, vy: Math.sin(a2) * sp * 0.45, life: 1.2, max: 1.2, col: c2, g: 16 });
      }
    }
    fw.flash = { x: r.x, y: r.y, t: 0.12 };
    if (fw.sparks.length > 800) fw.sparks.splice(0, fw.sparks.length - 800);
    if (G.Audio) G.Audio.sfx('firework');
  }
  function updateFireworks(dt, Game) {
    if (Game.state === 'goal' || Game.state === 'ending') {
      fw.next -= dt;
      if (fw.next <= 0) { launch(); if (Math.random() < 0.3) launch(); fw.next = 0.4 + Math.random() * 0.45; }
    } else fw.next = 0.3;
    if (fw.flash) { fw.flash.t -= dt; if (fw.flash.t <= 0) fw.flash = null; }
    for (var i = fw.rockets.length - 1; i >= 0; i--) {
      var r = fw.rockets[i];
      r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 80 * dt;
      if (r.vy > -10) { burst(r); fw.rockets.splice(i, 1); }
    }
    for (i = fw.sparks.length - 1; i >= 0; i--) {
      var s = fw.sparks[i], k = Math.max(0, 1 - 1.6 * dt);
      s.vx *= k; s.vy = s.vy * k + s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
      if (s.life <= 0) fw.sparks.splice(i, 1);
    }
  }
  FX.drawFireworks = function (ctx) {
    if (!fw.rockets.length && !fw.sparks.length) return;
    var blink = Math.floor((G.time || 0) * 20) & 1;
    if (fw.flash) {   // 開いた瞬間の光
      var f = fw.flash, rr = Math.round(6 + (0.12 - f.t) * 60);
      ctx.fillStyle = 'rgba(255,255,240,' + (f.t * 5).toFixed(2) + ')';
      ctx.fillRect(Math.round(f.x - rr), Math.round(f.y - rr / 2), rr * 2, rr); ctx.fillRect(Math.round(f.x - rr / 2), Math.round(f.y - rr), rr, rr * 2);
    }
    fw.rockets.forEach(function (r) {
      ctx.fillStyle = '#ff9020'; ctx.fillRect(Math.round(r.x), Math.round(r.y) + 2, 1, 4);
      ctx.fillStyle = '#fffbe0'; ctx.fillRect(Math.round(r.x) - 1, Math.round(r.y) - 1, 2, 3);
    });
    fw.sparks.forEach(function (s) {
      var a = s.life / s.max;
      if (a < 0.28 && ((Math.round(s.x * 7 + s.y * 3) & 1) ^ blink)) return;   // 消える前はチラチラ
      var x = Math.round(s.x), y = Math.round(s.y), tx = Math.round(s.x - s.vx * 0.05), ty = Math.round(s.y - s.vy * 0.05);
      ctx.fillStyle = s.col[0]; ctx.fillRect(tx, ty, 1, 1);                 // 尾
      if (a > 0.35) { ctx.fillStyle = s.col[2]; ctx.fillRect(x - 1, y - 1, 4, 4); }   // 暗い縁
      ctx.fillStyle = a > 0.75 ? s.col[1] : s.col[0];
      ctx.fillRect(x, y, a > 0.35 ? 2 : 1, a > 0.35 ? 2 : 1);
    });
  };

  // 車の後ろの煙 (車より奥)
  FX.drawBehind = function (ctx) {
    for (var i = 0; i < FX.puffs.length; i++) {
      var f = FX.puffs[i], a = 1 - f.life / f.max;
      if (f.type === 'smoke') ctx.fillStyle = 'rgba(235,235,240,' + (a * 0.75).toFixed(2) + ')';
      else if (f.type === 'dust') { ctx.globalAlpha = a * 0.85; ctx.fillStyle = f.col; }
      else continue;
      var r = Math.round(f.r);
      ctx.fillRect(Math.round(f.x - r), Math.round(f.y - r), r * 2, r * 2);
      ctx.fillRect(Math.round(f.x - r - 1), Math.round(f.y - r + 1), r * 2 + 2, r * 2 - 2);
      ctx.globalAlpha = 1;
    }
  };

  // 火花 (車より手前): 前のフレームの位置から線を引いて尾をつける
  function drawSparks(ctx) {
    for (var i = 0; i < FX.puffs.length; i++) {
      var f = FX.puffs[i];
      if (f.type !== 'spark' || f.px === undefined) continue;
      var a = 1 - f.life / f.max;
      // 尾は速度の向きに 3 フレーム分
      var tx = f.x - f.vx * 0.045, ty = f.y - f.vy * 0.045;
      ctx.fillStyle = a > 0.5 ? '#ffb020' : '#e05010';
      var n = Math.max(1, Math.round(Math.max(Math.abs(f.x - tx), Math.abs(f.y - ty))));
      for (var k = 0; k < n; k++) ctx.fillRect(Math.round(tx + (f.x - tx) * k / n), Math.round(ty + (f.y - ty) * k / n), 1, 1);
      ctx.fillStyle = a > 0.4 ? '#fffbe0' : '#ffd040';
      ctx.fillRect(Math.round(f.x), Math.round(f.y), a > 0.6 ? 2 : 1, a > 0.6 ? 2 : 1);
    }
  }

  // 天候 (最前面)
  FX.drawFront = function (ctx, Game, P, sa, nearOnly) {
    if (!nearOnly) drawSparks(ctx);
    var W = G.R.W, H = G.R.H, cx = W / 2, cy = H * 0.42, fs = W * 0.5;
    var w = FX.weather, t = FX.t;
    for (var i = 0; i < w.length; i++) {
      var q = w[i];
      if (nearOnly && q.z > 1.3) continue;
      var sx = cx + q.x / q.z * fs, sy = cy + q.y / q.z * fs;
      if (sx < -12 || sx > W + 12 || sy < -12 || sy > H + 12) continue;
      var x = Math.round(sx), y = Math.round(sy);
      if (q.kind === 'snow') {
        var s = 3.2 / q.z;
        ctx.fillStyle = SNOW[q.c % 3];
        if (s < 1.2) ctx.fillRect(x, y, 1, 1);
        else if (s < 2.6) ctx.fillRect(x, y, 2, 2);
        else {
          var r = Math.min(3, Math.round(s * 0.6));
          ctx.fillRect(x - r + 1, y - r, r * 2 - 1, r * 2 + 1);
          ctx.fillRect(x - r, y - r + 1, r * 2 + 1, r * 2 - 1);
        }
      } else {
        // 花びら / 落ち葉: ひらひら回転 (横長⇔縦長, 表⇔裏)
        var leaf = q.kind === 'leaf';
        var sz = Math.max(1, Math.round((leaf ? 5.2 : 4.6) / q.z));
        if (sz > 10) sz = 10;
        var flip = Math.sin(t * q.fr + q.ph), turn = Math.cos(t * q.fr * 0.7 + q.ph);
        var light = leaf ? LEAF[q.c] : PETAL[q.c], dark = leaf ? LEAF_D[q.c] : PETAL_D[q.c];
        var a = Math.max(1, Math.round(sz * (0.35 + Math.abs(flip) * 0.75))), b = Math.max(1, Math.round(sz * 0.6));
        var pw = turn > 0 ? a : b, ph = turn > 0 ? b : a;
        if (sz <= 2) { ctx.fillStyle = flip > 0 ? light : dark; ctx.fillRect(x, y, pw, ph); continue; }
        // 縁取り (背景が桜でも見えるように)
        ctx.fillStyle = dark;
        ctx.fillRect(x - 1, y, pw + 2, ph);
        ctx.fillRect(x, y - 1, pw, ph + 2);
        ctx.fillStyle = flip > 0 ? light : PETAL[2];
        if (leaf) ctx.fillStyle = flip > 0 ? light : dark;
        ctx.fillRect(x, y, pw, ph);
        if (sz >= 4 && !leaf) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, Math.max(1, pw >> 1), 1); }
        if (leaf && sz >= 4) { ctx.fillStyle = dark; ctx.fillRect(x + (pw >> 1), y, 1, ph); }
      }
    }
  };
})();
