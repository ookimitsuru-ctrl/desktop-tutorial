'use strict';
// ============================================================
//  art_bg.js  背景 (空・雲・遠景の山・近景の丘) を季節ごとにドット絵で生成
//  カーブに合わせて多重スクロール, 季節の境目ではクロスフェード
// ============================================================
(function () {
  var C = G.col;
  var LW = 1024;           // 背景レイヤーの横幅 (ループ)
  var BG = G.BG = { offs: 0, shift: 0, layers: [], skies: [] };

  function pal(a) { return a.map(function (h) { return C(h); }); }

  // ---------- 空 (ディザ付きの段階グラデーション) ----------
  function skyColorAt(stops, t) {
    for (var i = 0; i < stops.length - 1; i++) {
      if (t <= stops[i + 1][0]) {
        var a = stops[i], b = stops[i + 1];
        return G.mix(C(a[1]), C(b[1]), (t - a[0]) / (b[0] - a[0]));
      }
    }
    return C(stops[stops.length - 1][1]);
  }
  function makeSky(season, W, H) {
    var HOR = G.R.HOR, hh = HOR + 24;
    var p = new G.PX(W, hh);
    var stops = season.pal.sky, N = 14, bands = [];
    for (var i = 0; i < N; i++) bands.push(skyColorAt(stops, i / (N - 1)));
    for (var y = 0; y < hh; y++) {
      var t = G.clamp(y / HOR, 0, 1) * (N - 1), b = Math.floor(t), f = t - b;
      for (var x = 0; x < W; x++) {
        var bi = (b < N - 1 && G.dither(x, y, f)) ? b + 1 : b;
        p.d[y * W + x] = bands[bi];
      }
    }
    var r = G.rng(7 + season.key.length);
    if (season.key === 'summer') {
      // 真夏の太陽
      var sx = Math.round(W * 0.2), sy = 26;
      p.disc(sx, sy, 22, 0, function (x, y, nx, ny, d) {
        var a = 1 - Math.sqrt(d);
        return G.dither(x, y, a * 0.7) ? C('#d8f2ff') : 0;
      });
      p.disc(sx, sy, 13, 0, function (x, y, nx, ny, d) { return G.dither(x, y, 1 - d * 0.6) ? C('#fffbe8') : C('#e8f8ff'); });
      p.disc(sx, sy, 9, C('#ffffff'));
    } else if (season.key === 'winter') {
      // 星空と月
      for (i = 0; i < W * 0.35; i++) {
        var stx = Math.floor(r() * W), sty = Math.floor(Math.pow(r(), 1.6) * HOR * 0.75);
        var bright = r();
        p.set(stx, sty, bright > 0.8 ? C('#ffffff') : (bright > 0.4 ? C('#c8d4ff') : C('#8890c8')));
        if (bright > 0.97) { p.set(stx - 1, sty, C('#8890c8')); p.set(stx + 1, sty, C('#8890c8')); p.set(stx, sty - 1, C('#8890c8')); p.set(stx, sty + 1, C('#8890c8')); }
      }
      var mx = Math.round(W * 0.8), my = 24;
      p.disc(mx, my, 16, 0, function (x, y, nx, ny, d) { return G.dither(x, y, (1 - Math.sqrt(d)) * 0.55) ? C('#4a5090') : 0; });
      p.disc(mx, my, 8.5, 0, function (x, y, nx, ny) {
        var dx2 = nx + 0.55, dd = dx2 * dx2 + ny * ny;
        if (dd < 0.75) return 0;  // 三日月
        return ny < -0.3 ? C('#fffbe0') : C('#f4eec8');
      });
    }
    return p.toCanvas();
  }

  // ---------- 雲 ----------
  // 球の集まりで積雲を作る (平らな底)
  function cumulus(p, cx, by, w, h, ramp, seed, opt) {
    opt = opt || {};
    var r = G.rng(seed), balls = [];
    var n = Math.round(w * h / 90) + 6;
    for (var i = 0; i < n; i++) {
      var u = r() * 2 - 1;
      var env = Math.sqrt(Math.max(0, 1 - u * u)); // ドーム状の包絡
      var rad = (opt.rmin || 5) + r() * (opt.rvar || 9) * (0.5 + env * 0.6);
      var y = by - rad * 0.6 - r() * Math.max(0, h * env - rad * 1.2);
      balls.push([cx + u * w * 0.5, y, rad]);
    }
    balls.sort(function (a, b) { return a[1] - b[1]; });
    for (i = 0; i < balls.length; i++) {
      var B = balls[i];
      p.disc(B[0], B[1], B[2], 0, function (x, y, nx, ny) {
        if (y > by) return 0;
        var c = G.shadeRamp(ramp, nx, ny, x, y, -0.55, -0.85, 0.15);
        // 底に近いほど暗く
        if (by - y < 4 && G.dither(x, y, 0.5)) c = ramp[Math.max(0, ramp.indexOf(c) - 1)];
        return c;
      });
    }
  }
  // 横に伸びた筋雲
  function streak(p, cx, cy, w, h, ramp, seed) {
    var r = G.rng(seed);
    for (var i = 0; i < 9; i++) {
      var x = cx + (r() - 0.5) * w * 0.8, y = cy + (r() - 0.5) * h;
      var rx = w * (0.15 + r() * 0.25), ry = h * (0.25 + r() * 0.3);
      p.ellipse(x, y, rx, ry, 0, function (xx, yy, nx, ny) {
        return G.shadeRamp(ramp, nx * 0.4, ny, xx, yy, 0, 0.9, 0.1);
      });
    }
  }

  // ---------- 山並み ----------
  function ridgeLayer(p, opt) {
    var f = G.fbmLoop(opt.seed, opt.period || 8, 5);
    var base = p.h;
    var heights = [];
    for (var x = 0; x < LW; x++) {
      var v = f(x / LW * (opt.period || 8));
      v = Math.pow(v, opt.pow || 1.4);
      heights.push(opt.min + v * (opt.max - opt.min));
    }
    if (opt.peaks) opt.peaks.forEach(function (pk) {
      for (var x2 = 0; x2 < LW; x2++) {
        var d = Math.abs(((x2 - pk.x + LW * 1.5) % LW) - LW / 2);
        var hgt = pk.concave ? pk.h * Math.pow(Math.max(0, 1 - d / pk.w), pk.concave) : pk.h * Math.max(0, 1 - Math.pow(d / pk.w, pk.pow || 1.15));
        if (pk.flat) hgt = Math.min(hgt, pk.h - pk.flat);
        heights[x2] = Math.max(heights[x2], hgt + (pk.base || 0));
      }
    });
    var sn = G.fbmLoop(opt.seed + 7, 64, 3);
    for (x = 0; x < LW; x++) {
      var top = Math.round(base - heights[x]);
      var slope = heights[(x + 1) % LW] - heights[(x + LW - 1) % LW];
      var snowLine = opt.snow ? opt.snow + (sn(x / LW * 64) - 0.5) * (opt.snowVar || 6) + ((x * 13) % 3) : 0;
      for (var y = Math.max(0, top); y < base; y++) {
        var depth = (y - top) / Math.max(1, base - top);
        var lit = slope > 0.05 ? 1 : (slope < -0.05 ? -1 : 0); // 左から光
        var c;
        var hAbs = base - y;
        if (opt.snow && hAbs > snowLine) {
          c = lit > 0 ? opt.snowCols[1] : (lit < 0 ? opt.snowCols[0] : (G.dither(x, y, 0.5) ? opt.snowCols[1] : opt.snowCols[0]));
        } else {
          var ci = lit > 0 ? 2 : (lit < 0 ? 0 : 1);
          c = opt.cols[ci];
        }
        // 下ほど霞む
        if (opt.haze) {
          var hz = G.clamp((depth - opt.hazeStart) / (1 - opt.hazeStart), 0, 1);
          if (G.dither(x, y, hz * 0.8)) c = opt.haze;
        }
        p.d[y * LW + x] = c;
      }
      if (top >= 0 && top < base && opt.rim) p.d[top * LW + x] = opt.rim;
    }
  }

  // ---------- 樹木の帯 (丸い樹冠の連なり) ----------
  function treeBand(p, opt) {
    var r = G.rng(opt.seed);
    var base = p.h;
    var f = G.fbmLoop(opt.seed + 3, 6, 3);
    // 地面のうねり
    var ground = [];
    for (var x = 0; x < LW; x++) ground.push(opt.gmin + f(x / LW * 6) * (opt.gmax - opt.gmin));
    var n = opt.count;
    var blobs = [];
    for (var i = 0; i < n; i++) {
      var bx = r() * LW;
      var gy = base - ground[Math.floor(bx) % LW];
      var rad = opt.rmin + r() * opt.rvar;
      var ramp = opt.ramps[Math.floor(r() * opt.ramps.length)];
      blobs.push({ x: bx, y: gy - rad * (0.3 + r() * 0.6), r: rad, ramp: ramp });
    }
    blobs.sort(function (a, b) { return a.y - b.y; });
    blobs.forEach(function (b) {
      for (var k = -1; k <= 1; k++) {
        p.ellipse(b.x + k * LW, b.y, b.r * 1.15, b.r, 0, function (xx, yy, nx, ny) {
          if (xx < 0 || xx >= LW) return 0;
          return G.shadeRamp(b.ramp, nx, ny, xx, yy, -0.6, -0.7, 0.05);
        });
      }
    });
    // 地面
    for (x = 0; x < LW; x++) {
      for (var y = Math.round(base - ground[x]); y < base; y++) p.d[y * LW + x] = opt.groundCol;
    }
  }

  function conifers(p, opt) {
    var r = G.rng(opt.seed), base = p.h;
    var trees = [];
    for (var i = 0; i < opt.count; i++) trees.push({ x: r() * LW, h: opt.hmin + r() * opt.hvar, d: r() });
    trees.sort(function (a, b) { return a.d - b.d; });
    trees.forEach(function (t) {
      var w = t.h * 0.42;
      var col = t.d < 0.5 ? opt.cols[0] : opt.cols[1];
      for (var k = -1; k <= 1; k++) {
        var cx = t.x + k * LW, top = base - t.h - opt.lift * t.d;
        p.poly([[cx, top], [cx + w / 2, base], [cx - w / 2, base]], 0, function (xx, yy) {
          if (xx < 0 || xx >= LW) return 0;
          var rel = (yy - top) / t.h;
          // 雪
          if (opt.snow && (rel < 0.18 || ((Math.floor(rel * 7) % 2 === 0) && (xx - cx) < -w * 0.05 * (1 - rel) * 4 && rel < 0.8))) return xx < cx ? opt.snow[1] : opt.snow[0];
          return xx < cx ? G.lighten(col, 0.08) : col;
        });
      }
    });
    for (var x = 0; x < LW; x++) for (var y = base - opt.groundH; y < base; y++) p.d[y * LW + x] = opt.groundCol;
  }

  // ---------- シルエット建物 ----------
  function pagoda(p, cx, base, s, col, colHi) {
    for (var lvl = 0; lvl < 5; lvl++) {
      var y = base - 6 * s - lvl * 7 * s, w = (16 - lvl * 2) * s;
      p.poly([[cx - w, y], [cx + w, y], [cx + w * 0.6, y - 2 * s], [cx - w * 0.6, y - 2 * s]], col);
      p.rect(Math.round(cx - w * 0.45), Math.round(y), Math.round(w * 0.9), Math.round(5 * s), col);
      p.hline(cx - w, cx + w, y, colHi);
    }
    p.rect(Math.round(cx - 0.5 * s), Math.round(base - 46 * s), Math.max(1, Math.round(s)), Math.round(10 * s), col);
    p.rect(Math.round(cx - 6 * s), Math.round(base - 6 * s), Math.round(12 * s), Math.round(6 * s), col);
  }
  function castle(p, cx, base, col) {
    var W1 = C('#f4f2ee'), W2 = C('#d6d4d8'), RF = C('#4a5878'), RF2 = C('#6a7898'), ST = C('#8a8478');
    // 石垣
    p.poly([[cx - 26, base], [cx + 26, base], [cx + 20, base - 10], [cx - 20, base - 10]], ST);
    var tiers = [[20, 9], [15, 8], [10, 7]];
    var y = base - 10;
    tiers.forEach(function (t, i) {
      p.rect(cx - t[0] + 2, y - t[1], (t[0] - 2) * 2, t[1], i % 2 ? W2 : W1);
      for (var wx = cx - t[0] + 5; wx < cx + t[0] - 4; wx += 4) p.set(wx, y - t[1] + 3, C('#5a5a6a'));
      y -= t[1];
      p.poly([[cx - t[0] - 2, y + 2], [cx + t[0] + 2, y + 2], [cx + t[0] - 3, y - 2], [cx - t[0] + 3, y - 2]], RF);
      p.hline(cx - t[0] - 2, cx + t[0] + 1, y + 2, RF2);
      // 破風
      p.poly([[cx - 4, y - 2], [cx + 4, y - 2], [cx, y - 5]], RF);
      y -= 2;
    });
    p.rect(cx - 3, y - 4, 6, 2, RF);
    p.set(cx - 3, y - 5, C('#e8c050')); p.set(cx + 2, y - 5, C('#e8c050')); // 金のしゃちほこ
  }
  function lighthouse(p, cx, base) {
    p.poly([[cx - 4, base], [cx + 4, base], [cx + 2, base - 22], [cx - 2, base - 22]], C('#f4f4f4'));
    for (var y = base - 18; y < base; y += 8) p.hline(cx - 4, cx + 4, y, C('#d84040'));
    p.rect(cx - 3, base - 27, 6, 5, C('#e8e8e8'));
    p.rect(cx - 2, base - 26, 4, 3, C('#ffe060'));
    p.poly([[cx - 4, base - 27], [cx + 4, base - 27], [cx, base - 31]], C('#d84040'));
  }

  // ---------- 季節ごとのレイヤー生成 ----------
  function buildSummer() {
    var L = {};
    // 小さな雲
    var cl = new G.PX(LW, 70), cramp = pal(['#9cc8f0', '#c4e0fa', '#e8f4ff', '#ffffff']);
    var r = G.rng(11);
    for (var i = 0; i < 7; i++) cumulus(cl, r() * LW, 22 + r() * 30, 26 + r() * 30, 10 + r() * 8, cramp, 100 + i, { rmin: 3, rvar: 5 });
    L.clouds = { cv: cl.toCanvas(), par: 0.8, y: 6 };
    // 入道雲 (遠景)
    var far = new G.PX(LW, 100), bramp = pal(['#8aa8d8', '#a8c4ec', '#cfe2fa', '#eef6ff', '#ffffff']);
    cumulus(far, 180, 99, 150, 92, bramp, 21, { rmin: 7, rvar: 14 });
    cumulus(far, 330, 99, 90, 50, bramp, 22, { rmin: 6, rvar: 10 });
    cumulus(far, 610, 99, 190, 80, bramp, 23, { rmin: 8, rvar: 14 });
    cumulus(far, 860, 99, 120, 64, bramp, 24, { rmin: 6, rvar: 12 });
    L.far = { cv: far.toCanvas(), par: 1.0, y: 0 };
    // 近景: 島影と岬
    var near = new G.PX(LW, 40);
    ridgeLayer(near, {
      seed: 5, period: 6, min: -10, max: 22, pow: 2.2,
      cols: pal(['#3c7a8c', '#4a8c9c', '#5a9caa']), haze: C('#9ccfe6'), hazeStart: 0.3, rim: C('#6aacb8'),
      peaks: [{ x: 300, w: 40, h: 22 }, { x: 760, w: 80, h: 16 }]
    });
    lighthouse(near, 300, 40 - 18);
    L.near = { cv: near.toCanvas(), par: 1.3, y: 0 };
    return L;
  }

  function buildAutumn() {
    var L = {};
    var cl = new G.PX(LW, 60), sramp = pal(['#9a4a6a', '#d06a6a', '#f29a7a', '#ffd0a0']);
    var r = G.rng(31);
    for (var i = 0; i < 9; i++) streak(cl, r() * LW, 14 + r() * 36, 60 + r() * 70, 6 + r() * 5, sramp, 300 + i);
    L.clouds = { cv: cl.toCanvas(), par: 0.8, y: 8 };
    var far = new G.PX(LW, 80);
    // 夕日
    far.disc(520, 62, 20, 0, function (x, y, nx, ny, d) { return G.dither(x, y, 1 - Math.sqrt(d)) ? C('#ffd890') : 0; });
    far.disc(520, 62, 13, 0, function (x, y, nx, ny) { return ny < -0.3 ? C('#fff4c8') : (ny < 0.3 ? C('#ffe08a') : C('#ffc060')); });
    ridgeLayer(far, {
      seed: 41, period: 7, min: 12, max: 52, pow: 1.3,
      cols: pal(['#4a3266', '#5a3c74', '#6e4a84']), haze: C('#c27280'), hazeStart: 0.35, rim: C('#8a5c90')
    });
    L.far = { cv: far.toCanvas(), par: 1.0, y: 0 };
    var near = new G.PX(LW, 46);
    var ramps = [pal(['#5a1a14', '#9a2a1c', '#d24a24', '#f2763a']), pal(['#6a3a0a', '#b06814', '#e69a24', '#ffc84a']),
      pal(['#5a2a10', '#8a4418', '#c06424', '#e28a3a']), pal(['#2a3a1a', '#4a5a24', '#6a7a30', '#8a9440'])];
    treeBand(near, { seed: 51, count: 300, rmin: 4, rvar: 6, gmin: 3, gmax: 14, ramps: ramps, groundCol: C('#9a5a2a') });
    pagoda(near, 700, 24, 0.55, C('#2a1820'), C('#5a3a3a'));
    L.near = { cv: near.toCanvas(), par: 1.3, y: 0 };
    return L;
  }

  function buildWinter() {
    var L = {};
    var far = new G.PX(LW, 96);
    ridgeLayer(far, {
      seed: 61, period: 9, min: 8, max: 40, pow: 1.4,
      cols: pal(['#3a3c78', '#4c4e8a', '#60629c']), haze: C('#9a92c0'), hazeStart: 0.45, rim: C('#d8d8f4'),
      snow: 44, snowVar: 26, snowCols: pal(['#a8acdc', '#f2f4ff']),
      peaks: [{ x: 420, w: 170, h: 86, concave: 1.6, flat: 3 }]
    });
    L.far = { cv: far.toCanvas(), par: 1.0, y: 0 };
    var near = new G.PX(LW, 50);
    conifers(near, {
      seed: 71, count: 210, hmin: 12, hvar: 26, lift: 6,
      cols: pal(['#1e3448', '#284256']), snow: pal(['#d8e2f4', '#ffffff']), groundH: 5, groundCol: C('#d4dcf0')
    });
    // 村の灯り
    var r = G.rng(72);
    for (var i = 0; i < 26; i++) {
      var lx = Math.floor(r() * LW), ly = 50 - 3 - Math.floor(r() * 3);
      near.set(lx, ly, C('#ffd870')); if (r() > 0.5) near.set(lx + 1, ly, C('#ffb040'));
    }
    L.near = { cv: near.toCanvas(), par: 1.3, y: 0 };
    return L;
  }

  function buildSpring() {
    var L = {};
    var cl = new G.PX(LW, 70), cramp = pal(['#b4cff0', '#d4e6fa', '#f0f6ff', '#ffffff']);
    var r = G.rng(81);
    for (var i = 0; i < 8; i++) cumulus(cl, r() * LW, 26 + r() * 34, 30 + r() * 40, 8 + r() * 8, cramp, 800 + i, { rmin: 3, rvar: 6 });
    L.clouds = { cv: cl.toCanvas(), par: 0.8, y: 4 };
    var far = new G.PX(LW, 70);
    ridgeLayer(far, {
      seed: 91, period: 6, min: 8, max: 40, pow: 1.5,
      cols: pal(['#7486c0', '#8494cc', '#96a6d8']), haze: C('#d8d4ec'), hazeStart: 0.25, rim: C('#b0bce4')
    });
    L.far = { cv: far.toCanvas(), par: 1.0, y: 0 };
    var near = new G.PX(LW, 56);
    var ramps = [pal(['#c46a96', '#e892b8', '#ffb8d2', '#ffe0ec']), pal(['#d07aa0', '#f4a2c4', '#ffc8dc', '#fff0f6']),
      pal(['#3a7a3a', '#4c9644', '#68b250', '#8ccc64']), pal(['#c46a96', '#e892b8', '#ffb8d2', '#ffe0ec'])];
    treeBand(near, { seed: 95, count: 260, rmin: 4, rvar: 6, gmin: 3, gmax: 14, ramps: ramps, groundCol: C('#6ab452') });
    castle(near, 560, 56 - 18, 0);
    L.near = { cv: near.toCanvas(), par: 1.3, y: 0 };
    return L;
  }

  BG.build = function () {
    BG.layers = [buildSummer(), buildAutumn(), buildWinter(), buildSpring()];
  };
  BG.resize = function (W, H) {
    if (!BG.layers.length) BG.build();
    BG.skies = G.SEASONS.map(function (s) { return makeSky(s, W, H); });
  };

  BG.update = function (dt, P, seg) {
    if (!seg) return;
    // カーブで車の向きが変わった角度 (ラジアン)。道路の描画では 1 セグメント進むごとに
    // 向きが curve / SEG ずつ変わるので, 背景もその角度ぶんだけ (焦点距離 F を掛けて) 横に動かす
    var SEG = G.Track.SEG;
    BG.offs += seg.curve * (P.speed * dt / SEG) / SEG;
    // 少し先の勾配を見てカメラを傾ける
    var T = G.Track, a = T.segments[seg.index + 4] || seg, b = T.segments[seg.index + 24] || seg;
    var slope = (b.p1.world.y - a.p1.world.y) / (Math.max(1, b.index - a.index) * T.SEG);
    var target = G.clamp(slope * 55, -14, 14);
    G.R.pitch += (target - G.R.pitch) * Math.min(1, dt * 2.5);
    BG.shift = 0;
  };

  function drawLayer(ctx, L, alpha) {
    if (!L) return;
    var W = G.R.W, HOR = G.R.HOR;
    // par: 地平線の彼方 (=1) に対する視差。雲は少し遅く, 手前の山は少し速い
    var x = -Math.round(((BG.offs * G.R.F * L.par) % LW + LW) % LW);
    var y = Math.round(HOR + G.R.pitch + 3 - L.cv.height + (L.y || 0));
    if (alpha < 1) ctx.globalAlpha = alpha;
    for (var xx = x; xx < W; xx += LW) ctx.drawImage(L.cv, xx, y);
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  function drawSky(ctx, s, alpha) {
    if (alpha < 1) ctx.globalAlpha = alpha;
    var sk = BG.skies[s], y = Math.round(G.R.pitch * 0.5) - 8;
    if (y > 0) ctx.drawImage(sk, 0, 0, sk.width, 1, 0, 0, sk.width, y);
    ctx.drawImage(sk, 0, y);
    if (alpha < 1) ctx.globalAlpha = 1;
  }
  function drawLayers(ctx, s, alpha) {
    var L = BG.layers[s];
    drawLayer(ctx, L.clouds, alpha);
    drawLayer(ctx, L.far, alpha);
    drawLayer(ctx, L.near, alpha);
  }

  // sa = { season, blend }
  BG.draw = function (ctx, sa, P, seg) {
    var W = G.R.W, H = G.R.H, HOR = G.R.HOR;
    var s = sa.season, mix = s > 0 && sa.blend < 1, a = Math.round(sa.blend * 8) / 8;
    if (mix) { drawSky(ctx, s - 1, 1); drawSky(ctx, s, a); } else drawSky(ctx, s, 1);
    // 地平線より下の下地: 霞んだ遠くの大地
    var top = Math.round(HOR + G.R.pitch) + 1;
    var gnd = seg.pal.grounds[seg.gr] || seg.pal.grounds.grass;
    for (var y = top; y < H; y += 2) {
      var lv = Math.max(5, 13 - Math.floor((y - top) / 4));
      ctx.fillStyle = G.css(gnd[((y - top) >> 3) & 1][lv]);
      ctx.fillRect(0, y, W, 2);
    }
    if (mix) { drawLayers(ctx, s - 1, 1); drawLayers(ctx, s, a); } else drawLayers(ctx, s, 1);
  };
})();
