'use strict';
// ============================================================
//  art_scenery.js  沿道のスプライト (季節ごと) をドット絵で生成
//  G.SPR[key] = { img, zoom, hit }  zoom: 自車位置での拡大率, hit: 当たり幅(割合)
// ============================================================
(function () {
  var C = G.col;
  function pal(a) { return a.map(function (h) { return C(h); }); }
  var SPR = G.SPR = {};

  function reg(key, px, zoom, hit, extra) {
    var d = { img: px.toCanvas(), zoom: zoom, hit: hit || 0 };
    if (extra) for (var k in extra) d[k] = extra[k];
    SPR[key] = d;
    return d;
  }
  function regFrames(key, pxs, zoom, hit, anim) {
    var fr = pxs.map(function (p) { return p.toCanvas(); });
    SPR[key] = { img: fr[0], frames: fr, anim: anim, zoom: zoom, hit: hit || 0 };
  }
  function pxFromCanvas(cv) {
    var p = new G.PX(cv.width, cv.height);
    var id = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
    p.d.set(new Uint32Array(id.data.buffer));
    return p;
  }
  G.pxFromCanvas = pxFromCanvas;

  // ---------- 共通パーツ ----------
  // 樹冠: 陰影付きの球を楕円内にたくさん置く
  function canopy(p, cx, cy, rx, ry, ramp, seed, o) {
    o = o || {};
    var r = G.rng(seed), blobs = [];
    var n = o.n || Math.round(rx * ry / 12) + 4;
    for (var i = 0; i < n; i++) {
      var a = r() * Math.PI * 2, d = Math.sqrt(r());
      var bx = cx + Math.cos(a) * d * rx * 0.86, by = cy + Math.sin(a) * d * ry * 0.86;
      if (o.flatBottom && by > cy + ry * 0.45) by = cy + ry * 0.45 - r() * 3;
      blobs.push({ x: bx, y: by, r: (o.rmin || 3) + r() * (o.rvar || 4) });
    }
    blobs.sort(function (a, b) { return a.y - b.y; });
    blobs.forEach(function (b) {
      var gx = (b.x - cx) / rx, gy = (b.y - cy) / ry;
      var bias = -(gx * 0.22 + gy * 0.32) + (o.bias || 0);
      p.disc(b.x, b.y, b.r, 0, function (x, y, nx, ny) { return G.shadeRamp(ramp, nx, ny, x, y, -0.6, -0.8, bias); });
    });
  }
  // 小さな点描 (花・実・花びら)
  function speckle(p, cx, cy, rx, ry, cols, count, seed, onlyOpaque) {
    var r = G.rng(seed);
    for (var i = 0; i < count; i++) {
      var a = r() * Math.PI * 2, d = Math.sqrt(r());
      var x = Math.round(cx + Math.cos(a) * d * rx), y = Math.round(cy + Math.sin(a) * d * ry);
      if (onlyOpaque && !G.ca(p.get(x, y))) continue;
      p.set(x, y, cols[Math.floor(r() * cols.length)]);
    }
  }
  function trunk(p, x, ytop, ybot, wTop, wBot, cols, seed) {
    var r = G.rng(seed || 1);
    for (var y = ytop; y <= ybot; y++) {
      var t = (y - ytop) / Math.max(1, ybot - ytop), w = wTop + (wBot - wTop) * t;
      var x0 = Math.round(x - w / 2), x1 = Math.round(x + w / 2) - 1;
      for (var xx = x0; xx <= x1; xx++) {
        var c = cols[1];
        if (xx === x0) c = cols[2];
        else if (xx >= x1 - Math.max(0, Math.floor(w / 3) - 1)) c = cols[0];
        if (r() < 0.12) c = cols[0];
        p.set(xx, y, c);
      }
    }
  }
  function branch(p, x0, y0, x1, y1, r0, col) {
    p.thick(x0, y0, x1, y1, r0, col);
  }
  function shadowEllipse(p, cx, cy, rx, ry, a) {
    p.ellipse(cx, cy, rx, ry, 0, function (x, y) { return G.ca(p.get(x, y)) ? 0 : G.rgba(0, 0, 0, a || 70); });
  }
  function blitCanvas(p, cv, x, y) { p.blit(pxFromCanvas(cv), Math.round(x), Math.round(y)); }

  // =========================================================
  //  夏
  // =========================================================
  function palm(seed, h, lean) {
    var W = 96, H = h + 30, p = new G.PX(W, H), r = G.rng(seed);
    var bx = W / 2, by = H - 2;
    var TR = pal(['#5a3a1c', '#7c5428', '#a07438', '#c49a58']);
    // 幹 (弓なり)
    var pts = [];
    for (var i = 0; i <= h; i++) {
      var t = i / h;
      pts.push([bx + lean * Math.pow(t, 1.8) * 22, by - i]);
    }
    for (i = 0; i < pts.length; i++) {
      var w = 5.5 - 2.5 * (i / pts.length);
      var cx = pts[i][0], y = pts[i][1];
      for (var xx = Math.round(cx - w / 2); xx < Math.round(cx + w / 2); xx++) {
        var u = (xx - (cx - w / 2)) / w;
        var c = u < 0.3 ? TR[3] : (u < 0.7 ? TR[2] : TR[1]);
        if ((i % 4) === 0) c = TR[0];
        else if ((i % 4) === 1 && u < 0.5) c = TR[2];
        p.set(xx, y, c);
      }
    }
    var top = pts[pts.length - 1];
    // 葉
    var LF = pal(['#1c5a24', '#2a7c2c', '#3ea23a', '#6ccc4a', '#a8e870']);
    var fronds = 9;
    for (var f = 0; f < fronds; f++) {
      var ang = -Math.PI / 2 + (f / (fronds - 1) - 0.5) * Math.PI * 1.55 + (r() - 0.5) * 0.25;
      var len = 26 + r() * 12;
      var droop = 0.9 + r() * 0.5;
      var prev = null;
      for (var s = 0; s <= len; s++) {
        var tt = s / len;
        var fx = top[0] + Math.cos(ang) * s;
        var fy = top[1] + Math.sin(ang) * s * 0.55 + droop * tt * tt * len * 0.8;
        var thick = 2.3 * (1 - tt * 0.7);
        var col = tt < 0.15 ? LF[1] : (Math.sin(ang) < -0.3 ? LF[3] : LF[2]);
        p.disc(fx, fy, thick, col);
        // 小葉
        if (s % 2 === 0 && tt > 0.12) {
          var ll = 6 * (1 - tt * 0.6);
          var nx = -Math.sin(ang), ny = Math.cos(ang);
          p.line(fx, fy, fx + nx * ll * 0.5, fy + ll * 0.9, LF[1]);
          p.line(fx, fy, fx - nx * ll * 0.5, fy + ll * 0.9, LF[2]);
        }
        if (prev) p.set(Math.round(fx), Math.round(fy - thick + 0.5), LF[4]);
        prev = [fx, fy];
      }
    }
    // ヤシの実
    p.disc(top[0] - 2, top[1] + 4, 2.4, C('#5a3a18')); p.disc(top[0] + 2, top[1] + 5, 2.4, C('#6a4820'));
    p.set(Math.round(top[0] - 3), Math.round(top[1] + 3), C('#a07440'));
    p.outline(C('#0c2a10'));
    shadowEllipse(p, bx, by, 16, 2.2, 60);
    return p.trim();
  }

  function parasol(c1, c2) {
    var W = 44, H = 44, p = new G.PX(W, H);
    var cx = W / 2, top = 6;
    shadowEllipse(p, cx + 4, H - 3, 18, 3, 70);
    p.vline(cx, top, H - 3, C('#d8d0c0')); p.vline(cx + 1, top + 4, H - 3, C('#9a9080'));
    // 傘 (ストライプ)
    p.poly([[cx, top - 2], [cx + 20, top + 12], [cx - 20, top + 12]], 0, function (x, y) {
      var a = Math.atan2(y - (top - 2), x - cx);
      var band = Math.floor((a + Math.PI) / (Math.PI / 10)) % 2;
      var c = band ? c1 : c2;
      if (y > top + 9) c = G.darken(c, 0.25);
      else if (x < cx - 6 && y < top + 6) c = G.lighten(c, 0.2);
      return c;
    });
    // 縁の波
    for (var x = cx - 19; x <= cx + 19; x += 4) p.disc(x + 1, top + 12, 2, G.darken(c2, 0.15));
    p.outline(C('#3a2a2a'));
    // ビーチチェア
    p.rect(cx - 16, H - 9, 12, 2, C('#f0f0f0'));
    p.line(cx - 16, H - 9, cx - 19, H - 15, C('#f0f0f0'));
    p.vline(cx - 15, H - 8, H - 4, C('#a0a0a0')); p.vline(cx - 6, H - 8, H - 4, C('#a0a0a0'));
    return p;
  }

  function sunflowers(seed) {
    var W = 70, H = 46, p = new G.PX(W, H), r = G.rng(seed);
    var ST = C('#3a7a2a'), LV = pal(['#1e5a1e', '#2f7a28', '#46a032']);
    var flowers = [];
    for (var i = 0; i < 9; i++) flowers.push({ x: 6 + r() * (W - 12), y: 6 + r() * 16, s: 4 + r() * 2.5 });
    flowers.sort(function (a, b) { return a.y - b.y; });
    flowers.forEach(function (f) {
      p.vline(Math.round(f.x), Math.round(f.y), H - 1, ST);
      p.ellipse(f.x - 4, f.y + 14, 4, 2, LV[2]); p.ellipse(f.x + 4, f.y + 20, 4, 2, LV[1]);
    });
    // 葉の茂み
    canopy(p, W / 2, H - 9, W / 2 - 2, 9, LV.concat([C('#64c040')]), seed + 5, { rmin: 2, rvar: 3 });
    flowers.forEach(function (f) {
      p.disc(f.x, f.y, f.s + 2, 0, function (x, y, nx, ny) {
        var a = Math.atan2(ny, nx), pet = Math.cos(a * 8) > 0.2;
        return pet ? (ny < 0 ? C('#ffe040') : C('#f0b818')) : C('#e09810');
      });
      p.disc(f.x, f.y, f.s * 0.62, 0, function (x, y, nx, ny) { return (nx + ny < -0.3) ? C('#8a4a14') : C('#5a2a0c'); });
    });
    p.outline(C('#173a14'));
    return p;
  }

  function beachHut() {
    var W = 92, H = 62, p = new G.PX(W, H);
    var WD = pal(['#6a4628', '#8a5e34', '#b07c48', '#d0a068']);
    shadowEllipse(p, W / 2 + 6, H - 3, 44, 4, 60);
    // 柱と壁
    p.rect(8, 26, 76, 32, WD[2]);
    for (var x = 8; x < 84; x += 5) p.vline(x, 26, 57, WD[1]);
    p.rect(14, 34, 64, 18, C('#3a2a20')); // 開口部 (中は暗い)
    p.rect(14, 46, 64, 6, WD[3]);          // カウンター
    p.hline(14, 77, 46, C('#f0e0c0'));
    // よしず屋根
    p.poly([[2, 26], [90, 26], [80, 12], [12, 12]], 0, function (xx, y) {
      return (xx + y) % 3 === 0 ? C('#a88a50') : (y < 16 ? C('#e0c888') : C('#c8ac6c'));
    });
    p.hline(2, 89, 26, C('#7a6034'));
    // のれん (青)
    for (x = 16; x < 76; x += 10) p.rect(x, 34, 8, 6, C('#2050b0'));
    p.hline(14, 77, 34, C('#18408c'));
    // 「氷」の旗
    p.vline(86, 6, 58, C('#c0c0c0'));
    p.rect(68, 6, 18, 22, C('#ffffff'));
    p.rect(68, 6, 18, 3, C('#2a6ad8')); p.rect(68, 25, 18, 3, C('#2a6ad8'));
    var kan = G.Font.renderJP('氷', { size: 14, color: '#e02828' });
    blitCanvas(p, kan, 77 - kan.width / 2, 10);
    // 浮き輪
    p.disc(24, 30, 4.5, C('#ff6040')); p.disc(24, 30, 2, 0, function () { return C('#3a2a20'); });
    p.set(22, 27, C('#ffffff')); p.set(26, 33, C('#ffffff'));
    p.outline(C('#2a1a10'));
    return p;
  }

  function surfRack() {
    var W = 40, H = 54, p = new G.PX(W, H);
    shadowEllipse(p, W / 2 + 3, H - 2, 16, 2.5, 60);
    var boards = [['#ff6a3a', '#ffe0a0'], ['#30b0e8', '#ffffff'], ['#f8d030', '#e04040'], ['#58d070', '#ffffff']];
    boards.forEach(function (b, i) {
      var cx = 7 + i * 8.5, top = 4 + (i % 2) * 5;
      p.ellipse(cx, top + 22, 3.6, 22, 0, function (x, y, nx) { return nx < -0.3 ? G.lighten(C(b[0]), 0.25) : C(b[0]); });
      p.vline(Math.round(cx), top + 2, top + 42, C(b[1]));
    });
    p.rect(2, 40, W - 4, 3, C('#8a6038')); p.vline(4, 40, H - 2, C('#6a4628')); p.vline(W - 5, 40, H - 2, C('#6a4628'));
    p.outline(C('#202028'));
    return p;
  }

  function rock(seed, big) {
    var W = big ? 70 : 44, H = big ? 46 : 28, p = new G.PX(W, H);
    var RK = pal(['#4a4038', '#6a5c4c', '#8a7a64', '#ac9a80', '#cbb89a']);
    canopy(p, W / 2, H * 0.6, W * 0.45, H * 0.45, RK, seed, { rmin: 5, rvar: 7, n: big ? 16 : 9, flatBottom: true });
    p.outline(C('#2a221c'));
    return p;
  }

  function yacht(col) {
    var W = 40, H = 50, p = new G.PX(W, H);
    p.poly([[4, 38], [36, 38], [31, 45], [9, 45]], C('#f4f4f4'));
    p.hline(5, 35, 41, C(col));
    p.vline(20, 4, 38, C('#d0c8b8'));
    p.poly([[21, 5], [36, 35], [21, 35]], 0, function (x, y) { return x > 30 ? C('#dfe6ee') : C('#ffffff'); });
    p.poly([[19, 9], [19, 35], [6, 35]], 0, function () { return C(col); });
    p.outline(C('#1a2a40'));
    // 波しぶき
    for (var i = 0; i < 8; i++) p.set(4 + i * 4, 46, C('#e8f4ff'));
    return p;
  }

  // =========================================================
  //  秋
  // =========================================================
  function leafTree(seed, ramp, trunkCols, w, h, o) {
    o = o || {};
    var W = w + 8, H = h + 6, p = new G.PX(W, H);
    var cx = W / 2, by = H - 3;
    var crownY = by - h * (o.trunkFrac || 0.32) - (h * (1 - (o.trunkFrac || 0.32))) * 0.5;
    trunk(p, cx, crownY, by, o.tw0 || 3, o.tw1 || 6, trunkCols, seed);
    var r = G.rng(seed + 9);
    for (var b = 0; b < 4; b++) {
      var ang = -Math.PI / 2 + (r() - 0.5) * 1.9, len = h * 0.22;
      branch(p, cx, crownY + h * 0.18, cx + Math.cos(ang) * len, crownY + h * 0.18 + Math.sin(ang) * len, 1.1, trunkCols[0]);
    }
    canopy(p, cx, crownY, w / 2, (h * (1 - (o.trunkFrac || 0.32))) / 2 + 2, ramp, seed, { rmin: o.rmin || 3, rvar: o.rvar || 4.5 });
    if (o.speck) speckle(p, cx, crownY, w / 2, h * 0.3, o.speck, o.speckN || 40, seed + 3, true);
    p.outline(o.outline || G.darken(ramp[0], 0.45));
    shadowEllipse(p, cx + 2, by, w * 0.32, 2.5, 60);
    return p;
  }

  function ginkgo(seed) {
    var W = 54, H = 104, p = new G.PX(W, H), cx = W / 2, by = H - 3;
    var RP = pal(['#7a4a08', '#b88010', '#e8b420', '#ffd84a', '#fff0a0']);
    trunk(p, cx, 30, by, 3, 6, pal(['#3a2a1a', '#5a4430', '#7a6248']), seed);
    // 円錐形の樹冠
    var r = G.rng(seed);
    for (var i = 0; i < 70; i++) {
      var t = r(), y = 6 + t * 70, hw = 4 + t * 20;
      var x = cx + (r() * 2 - 1) * hw;
      p.disc(x, y, 3 + r() * 3.5, 0, function (xx, yy, nx, ny) {
        return G.shadeRamp(RP, nx, ny, xx, yy, -0.6, -0.8, -((x - cx) / 24) * 0.25 + 0.05);
      });
    }
    p.outline(C('#4a2e06'));
    // 落ち葉
    for (i = 0; i < 26; i++) p.set(Math.round(cx + (r() * 2 - 1) * 24), by - Math.floor(r() * 3), RP[2 + (i % 2)]);
    shadowEllipse(p, cx + 2, by, 18, 2.5, 50);
    return p;
  }

  function kakiTree(seed) {
    var p = leafTree(seed, pal(['#3a3a14', '#5a5a1c', '#7c7424', '#9c8a30']), pal(['#2a1c14', '#4a3424', '#6a4e38']), 62, 78, { rmin: 2.5, rvar: 3.5 });
    var r = G.rng(seed + 7);
    for (var i = 0; i < 22; i++) {
      var x = 8 + r() * 54, y = 10 + r() * 40;
      if (!G.ca(p.get(x, y))) continue;
      p.disc(x, y, 2, C('#ff7a10')); p.set(Math.round(x - 1), Math.round(y - 1), C('#ffc060'));
    }
    return p;
  }

  function torii() {
    var W = 74, H = 76, p = new G.PX(W, H);
    var RD = pal(['#7a1410', '#b82418', '#e03a24', '#ff6a48']), BK = C('#1a1418');
    shadowEllipse(p, W / 2 + 3, H - 3, 32, 3, 60);
    // 柱
    [16, W - 17].forEach(function (x) {
      p.rect(x - 3, 16, 7, H - 20, RD[1]);
      p.vline(x - 3, 16, H - 5, RD[2]); p.vline(x + 3, 16, H - 5, RD[0]);
      p.rect(x - 4, H - 9, 9, 6, BK);
    });
    // 笠木 (反り)
    p.poly([[0, 6], [W, 6], [W - 4, 12], [4, 12]], BK);
    for (var x = 0; x < W; x++) { var lift = Math.round(Math.pow(Math.abs(x - W / 2) / (W / 2), 3) * 4); p.vline(x, 4 - lift, 6, BK); }
    p.rect(4, 12, W - 8, 4, RD[2]); p.hline(4, W - 5, 12, RD[3]);
    // 貫
    p.rect(8, 24, W - 16, 4, RD[1]); p.hline(8, W - 9, 24, RD[3]);
    // 額束
    p.rect(W / 2 - 4, 15, 8, 10, BK); p.rect(W / 2 - 3, 16, 6, 8, C('#d8b048'));
    p.outline(C('#120808'));
    return p;
  }

  function stoneLantern() {
    var W = 22, H = 40, p = new G.PX(W, H), cx = W / 2;
    var ST = pal(['#4a4a50', '#6c6c72', '#8e8e94', '#b0b0b4']);
    shadowEllipse(p, cx + 2, H - 2, 10, 2, 60);
    p.rect(cx - 6, H - 6, 12, 4, ST[1]); p.hline(cx - 6, cx + 5, H - 6, ST[3]);
    p.rect(cx - 2, H - 20, 4, 14, ST[2]); p.vline(cx + 1, H - 20, H - 7, ST[0]);
    p.rect(cx - 6, H - 23, 12, 3, ST[2]);
    p.rect(cx - 5, H - 30, 10, 7, ST[1]); p.rect(cx - 2, H - 29, 4, 4, C('#ffd060')); // 火袋
    p.poly([[cx - 10, H - 30], [cx + 10, H - 30], [cx + 4, H - 35], [cx - 4, H - 35]], ST[2]);
    p.hline(cx - 10, cx + 9, H - 30, ST[3]);
    p.disc(cx, H - 36, 2, ST[2]);
    p.outline(C('#202024'));
    return p;
  }

  function scarecrow() {
    var W = 30, H = 46, p = new G.PX(W, H), cx = W / 2;
    shadowEllipse(p, cx + 2, H - 2, 9, 2, 60);
    p.vline(cx, 10, H - 2, C('#7a5a34'));
    p.hline(3, W - 4, 17, C('#7a5a34'));
    p.rect(cx - 6, 16, 12, 14, C('#4a64b0')); // 着物
    p.rect(cx - 6, 22, 12, 2, C('#e8c030'));
    p.rect(3, 15, 6, 4, C('#4a64b0')); p.rect(W - 9, 15, 6, 4, C('#4a64b0'));
    p.disc(cx, 10, 4.5, C('#f0e6cc')); // 顔
    p.set(cx - 2, 10, C('#202020')); p.set(cx + 1, 10, C('#202020')); p.hline(cx - 1, cx, 12, C('#c04040'));
    p.poly([[cx - 10, 7], [cx + 10, 7], [cx, 0]], C('#d8b860')); // 笠
    p.hline(cx - 10, cx + 9, 7, C('#a88a40'));
    p.outline(C('#2a1a10'));
    return p;
  }

  function higanbana(seed) {
    var W = 56, H = 24, p = new G.PX(W, H), r = G.rng(seed);
    for (var i = 0; i < 14; i++) {
      var x = 4 + r() * (W - 8), y = 5 + r() * 9;
      p.vline(Math.round(x), Math.round(y), H - 1, C('#3a7a2a'));
      for (var k = 0; k < 7; k++) {
        var a = -Math.PI / 2 + (k - 3) * 0.45;
        p.line(x, y, x + Math.cos(a) * 4.5, y + Math.sin(a) * 3.5 + 1, k % 2 ? C('#e01828') : C('#ff3a3a'));
      }
      p.set(Math.round(x), Math.round(y), C('#ff8080'));
    }
    p.outline(C('#3a0a0a'));
    return p;
  }

  function hasa() { // はさがけ (稲架)
    var W = 80, H = 40, p = new G.PX(W, H);
    shadowEllipse(p, W / 2 + 3, H - 2, 38, 2.5, 50);
    [6, W / 2, W - 7].forEach(function (x) { p.line(x - 4, H - 2, x, 8, C('#6a4a2c')); p.line(x + 4, H - 2, x, 8, C('#6a4a2c')); });
    p.hline(2, W - 3, 10, C('#6a4a2c'));
    for (var x = 4; x < W - 4; x += 3) {
      p.vline(x, 11, 30, C('#d8b048')); p.vline(x + 1, 11, 28, C('#b8902c'));
      p.set(x, 31, C('#a07a28'));
    }
    p.outline(C('#3a2610'));
    return p;
  }

  // =========================================================
  //  冬
  // =========================================================
  function snowCedar(seed, h) {
    var W = Math.round(h * 0.52) + 6, H = h + 6, p = new G.PX(W, H), cx = W / 2, by = H - 3;
    var GR = pal(['#0e2a2a', '#164036', '#1e5442', '#2a6a52']);
    var SN = pal(['#a8b8dc', '#d4def4', '#f4f8ff', '#ffffff']);
    trunk(p, cx, by - 10, by, 3, 4, pal(['#2a1c18', '#4a3428', '#6a4a38']), seed);
    var tiers = 6, r = G.rng(seed);
    for (var t = 0; t < tiers; t++) {
      var tt = t / (tiers - 1);
      var ty = 3 + tt * (h - 16), tw = 5 + tt * (W / 2 - 4), th = (h - 16) / tiers + 7;
      p.poly([[cx, ty], [cx + tw, ty + th], [cx - tw, ty + th]], 0, function (x, y) {
        var u = (x - cx) / tw, v = (y - ty) / th;
        var c = u < -0.2 ? GR[3] : (u < 0.3 ? GR[2] : GR[1]);
        // 雪の積もり (上面)
        var snowLine = 0.45 + Math.sin(x * 1.3 + t) * 0.12;
        if (v < snowLine && Math.abs(u) < 0.95) c = u < 0 ? SN[3] : (u < 0.4 ? SN[2] : SN[1]);
        return c;
      });
      // 垂れ下がる雪
      for (var k = 0; k < 4; k++) p.set(Math.round(cx + (r() * 2 - 1) * tw * 0.8), Math.round(ty + th * 0.5 + r() * 3), SN[2]);
    }
    p.outline(C('#08181c'));
    shadowEllipse(p, cx + 3, by, W * 0.35, 2.5, 50);
    return p;
  }

  function bareTree(seed) {
    var W = 64, H = 84, p = new G.PX(W, H), cx = W / 2, by = H - 3, r = G.rng(seed);
    var TR = C('#3a2a2a'), SN = C('#f4f8ff');
    trunk(p, cx, 40, by, 3, 6, pal(['#241818', '#3a2a28', '#5a4440']), seed);
    function br(x, y, ang, len, w, d) {
      var x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      p.thick(x, y, x2, y2, w, TR);
      // 雪
      p.line(x, y - w, x2, y2 - w, SN);
      if (d > 0) {
        br(x2, y2, ang - 0.4 - r() * 0.3, len * 0.7, Math.max(0.5, w * 0.7), d - 1);
        br(x2, y2, ang + 0.4 + r() * 0.3, len * 0.7, Math.max(0.5, w * 0.7), d - 1);
      }
    }
    br(cx, 44, -Math.PI / 2 - 0.5, 16, 1.6, 3);
    br(cx, 44, -Math.PI / 2 + 0.5, 16, 1.6, 3);
    br(cx, 50, -Math.PI / 2, 14, 1.5, 3);
    p.outline(C('#14100e'));
    shadowEllipse(p, cx + 3, by, 16, 2, 50);
    return p;
  }

  function snowman() {
    var W = 30, H = 42, p = new G.PX(W, H), cx = W / 2;
    var SN = pal(['#9aa8d0', '#c4d0ec', '#e8eefc', '#ffffff']);
    shadowEllipse(p, cx + 3, H - 2, 12, 2.5, 60);
    p.disc(cx, H - 12, 10, 0, function (x, y, nx, ny) { return G.shadeRamp(SN, nx, ny, x, y, -0.6, -0.8, 0.1); });
    p.disc(cx, H - 28, 7, 0, function (x, y, nx, ny) { return G.shadeRamp(SN, nx, ny, x, y, -0.6, -0.8, 0.1); });
    // バケツ
    p.rect(cx - 5, H - 40, 10, 6, C('#3a6ad0')); p.hline(cx - 6, cx + 5, H - 35, C('#2a4aa0'));
    p.set(cx - 3, H - 29, C('#202020')); p.set(cx + 2, H - 29, C('#202020'));
    p.hline(cx, cx + 3, H - 27, C('#ff8020')); // にんじん
    // マフラー
    p.rect(cx - 6, H - 22, 12, 2, C('#e02838')); p.rect(cx + 3, H - 21, 2, 5, C('#e02838'));
    p.set(cx, H - 15, C('#303030')); p.set(cx, H - 11, C('#303030'));
    p.line(cx - 8, H - 18, cx - 13, H - 24, C('#5a3a20')); p.line(cx + 8, H - 18, cx + 13, H - 24, C('#5a3a20'));
    p.outline(C('#3a4870'));
    return p;
  }

  function kamakura() {
    var W = 48, H = 34, p = new G.PX(W, H), cx = W / 2;
    var SN = pal(['#8a98c4', '#b8c6e8', '#e2eafc', '#ffffff']);
    shadowEllipse(p, cx + 3, H - 2, 22, 3, 60);
    p.ellipse(cx, H - 3, 21, 26, 0, function (x, y, nx, ny) {
      if (y > H - 3) return 0;
      return G.shadeRamp(SN, nx, ny, x, y, -0.6, -0.8, 0.1);
    });
    // 入口 (中の灯り)
    p.ellipse(cx + 2, H - 3, 8, 12, 0, function (x, y, nx, ny) {
      if (y > H - 3) return 0;
      return ny < -0.4 ? C('#ff9a30') : (G.dither(x, y, 0.5) ? C('#ffc860') : C('#ffb040'));
    });
    p.outline(C('#3a4870'));
    return p;
  }

  function snowBank(seed) {
    var W = 60, H = 22, p = new G.PX(W, H);
    canopy(p, W / 2, H * 0.62, W * 0.47, H * 0.45, pal(['#a0b0d8', '#c8d4ee', '#e8eefc', '#ffffff']), seed, { rmin: 5, rvar: 6, flatBottom: true });
    p.outline(C('#7a88b4'));
    return p;
  }

  function streetLamp() {
    var W = 26, H = 72, p = new G.PX(W, H);
    p.vline(6, 8, H - 2, C('#3a3a44')); p.vline(7, 8, H - 2, C('#5a5a66'));
    p.line(7, 8, 16, 4, C('#4a4a56')); p.rect(13, 4, 8, 3, C('#3a3a44'));
    p.rect(14, 7, 6, 2, C('#fff4c0'));
    p.rect(3, H - 4, 8, 3, C('#2a2a32'));
    p.outline(C('#16161c'));
    // 光の輪
    p.ellipse(17, 14, 9, 7, 0, function (x, y, nx, ny, d) { return (!G.ca(p.get(x, y)) && d < 1 && G.dither(x, y, (1 - d) * 0.5)) ? G.rgba(255, 230, 150, 160) : 0; });
    // 雪
    p.hline(13, 20, 3, C('#ffffff'));
    return p;
  }

  function gassho() {
    var W = 84, H = 70, p = new G.PX(W, H), cx = W / 2;
    shadowEllipse(p, cx + 4, H - 3, 40, 3, 60);
    // 壁
    p.rect(10, 40, 64, 27, C('#5a3e2c'));
    for (var x = 10; x < 74; x += 8) p.vline(x, 40, 66, C('#3e2a1e'));
    p.hline(10, 73, 52, C('#3e2a1e'));
    // 窓の灯り
    [[16, 44], [34, 44], [52, 44], [26, 56], [56, 56]].forEach(function (w) { p.rect(w[0], w[1], 6, 5, C('#ffcc60')); p.hline(w[0], w[0] + 5, w[1], C('#fff0b0')); });
    // 茅葺屋根 + 雪
    p.poly([[cx, 2], [W - 2, 42], [2, 42]], 0, function (xx, y) {
      var v = (y - 2) / 40;
      if (v < 0.75 + Math.sin(xx * 0.9) * 0.05) return xx < cx ? C('#ffffff') : C('#dfe6f6');
      return xx < cx ? C('#8a6a40') : C('#6a5030');
    });
    p.rect(cx - 5, 18, 10, 8, C('#3e2a1e')); p.rect(cx - 3, 20, 6, 4, C('#ffcc60'));
    p.outline(C('#1e140e'));
    return p;
  }

  // =========================================================
  //  春
  // =========================================================
  function sakura(seed, w, h, o) {
    o = o || {};
    var W = w + 10, H = h + 6, p = new G.PX(W, H), cx = W / 2, by = H - 3;
    var TR = pal(['#2a1a1a', '#4a3030', '#6a4848']);
    var crownY = by - h * 0.62;
    trunk(p, cx, crownY + 6, by, 4, 8, TR, seed);
    var r = G.rng(seed + 1);
    // 枝 (横に広がる)
    for (var b = 0; b < 6; b++) {
      var dir = b % 2 ? 1 : -1, len = w * (0.25 + r() * 0.2);
      var y0 = crownY + 10 + r() * 10;
      branch(p, cx, y0 + 6, cx + dir * len, y0 - 4 - r() * 10, 1.3, TR[0]);
    }
    var ramp = pal(['#c25c8a', '#e88ab0', '#ffb4cc', '#ffd6e4', '#fff2f6']);
    canopy(p, cx, crownY, w / 2, h * 0.36, ramp, seed, { rmin: 3, rvar: 5, bias: 0.08 });
    // 枝が花の間から見える
    for (b = 0; b < 5; b++) {
      var bx = cx + (r() * 2 - 1) * w * 0.35, byy = crownY + (r() * 2 - 1) * h * 0.18;
      if (G.ca(p.get(bx, byy))) p.line(bx, byy, bx + (r() * 2 - 1) * 5, byy + 3, TR[1]);
    }
    speckle(p, cx, crownY, w / 2, h * 0.34, pal(['#ffffff', '#fff0f6', '#ffe0ec']), Math.round(w * h / 40), seed + 2, true);
    p.outline(C('#6a2a48'));
    // 根元の花びら
    for (var i = 0; i < 20; i++) p.set(Math.round(cx + (r() * 2 - 1) * w * 0.4), by - Math.floor(r() * 2), ramp[2 + (i % 2)]);
    shadowEllipse(p, cx + 3, by, w * 0.35, 2.5, 50);
    return p;
  }

  function shidare(seed) {
    var W = 76, H = 96, p = new G.PX(W, H), cx = W / 2, by = H - 3, r = G.rng(seed);
    var TR = pal(['#2a1a1a', '#4a3030', '#6a4848']);
    trunk(p, cx, 22, by, 4, 8, TR, seed);
    // 垂れる枝
    for (var k = 0; k < 26; k++) {
      var sx = cx + (r() * 2 - 1) * 10, sy = 18 + r() * 8;
      var dir = (r() * 2 - 1);
      var len = 40 + r() * 34;
      for (var s = 0; s < len; s++) {
        var t = s / len;
        var x = sx + dir * (30 * Math.sin(t * Math.PI * 0.6)), y = sy - 8 * Math.sin(t * Math.PI) + t * len * 0.75;
        if (y > by - 4) break;
        p.set(Math.round(x), Math.round(y), TR[0]);
        if (r() < 0.75) p.disc(x + (r() - 0.5) * 3, y + (r() - 0.5) * 2, 1.3 + r(), r() < 0.5 ? C('#ffb8d0') : C('#ffd8e6'));
      }
    }
    canopy(p, cx, 22, 18, 10, pal(['#c25c8a', '#e88ab0', '#ffb4cc', '#ffd6e4', '#fff2f6']), seed, { rmin: 3, rvar: 3 });
    p.outline(C('#6a2a48'));
    shadowEllipse(p, cx + 3, by, 26, 2.5, 50);
    return p;
  }

  function flowerPatch(seed, cols, leaf, w, h) {
    var p = new G.PX(w, h), r = G.rng(seed);
    canopy(p, w / 2, h * 0.7, w * 0.48, h * 0.32, leaf, seed, { rmin: 2, rvar: 3, flatBottom: true });
    // 花房 (上が明るい小さな塊)
    for (var i = 0; i < w * h / 14; i++) {
      var x = Math.round(3 + r() * (w - 6)), y = Math.round(2 + Math.pow(r(), 0.8) * (h * 0.72));
      p.disc(x, y, 1.6 + r() * 1.2, 0, function (xx, yy, nx, ny) { return ny < -0.2 ? cols[1] : (nx > 0.3 ? cols[2] : cols[0]); });
    }
    p.outline(G.darken(leaf[0], 0.2));
    return p;
  }

  function tulips(seed) {
    var W = 56, H = 26, p = new G.PX(W, H), r = G.rng(seed);
    var cols = ['#ff3040', '#ffd020', '#ff70b0', '#ffffff', '#ff8020'];
    for (var i = 0; i < 18; i++) {
      var x = 3 + r() * (W - 6), y = 4 + r() * 8;
      p.vline(Math.round(x), Math.round(y + 3), H - 1, C('#3a8a30'));
      p.ellipse(x - 2, y + 9, 1.5, 3, C('#4aa03a'));
      var c = C(cols[Math.floor(r() * cols.length)]);
      p.rect(Math.round(x) - 1, Math.round(y), 3, 4, c);
      p.set(Math.round(x) - 1, Math.round(y) - 1, c); p.set(Math.round(x) + 1, Math.round(y) - 1, c);
      p.set(Math.round(x) - 1, Math.round(y), G.lighten(c, 0.35));
    }
    p.outline(C('#1e3a18'));
    return p;
  }

  function koinobori(frame) {
    var W = 56, H = 96, p = new G.PX(W, H);
    p.vline(6, 4, H - 2, C('#c8b890')); p.vline(7, 4, H - 2, C('#8a7a58'));
    p.disc(6.5, 4, 2.5, C('#ffd040'));
    // 吹き流し + 鯉 3匹
    var fish = [['#f8f8f8', '#3a6ad8', '#e83030'], ['#1a1a2a', '#3a3a5a', '#e8c040'], ['#e83a3a', '#ff7a6a', '#f0f0f0'], ['#3a7ae0', '#6aa8ff', '#ffffff']];
    fish.forEach(function (f, i) {
      var y0 = 10 + i * 13, len = i === 0 ? 40 : 44 - i * 4;
      for (var x = 0; x < len; x++) {
        var t = x / len;
        var wave = Math.sin(t * 6 + frame * 2.2 + i) * 1.6 * t;
        var hh = i === 0 ? 4 : 5 - t * 1.5;
        for (var y = -hh; y <= hh; y++) {
          var c = C(f[0]);
          if (i === 0) c = C(['#ffffff', '#3a6ad8', '#ffe040', '#e83030', '#38b048'][Math.floor((y + hh) / (hh * 2 + 1) * 5)]);
          else {
            if (y < -hh * 0.3) c = C(f[1]);
            if (((x + Math.round(y)) % 5) === 0) c = G.darken(c, 0.15); // うろこ
            if (x > 3 && x < 7 && Math.abs(y) < 2) c = C(f[2]); // 目
            if (x === 5 && y === 0) c = C('#101010');
          }
          p.set(8 + x, Math.round(y0 + y + wave), c);
        }
      }
    });
    p.outline(C('#202028'));
    return p;
  }

  // =========================================================
  //  共通: ゲート / 標識 / 看板
  // =========================================================
  function gate(kind) {
    var W = 320, H = 150, p = new G.PX(W, H);
    var MET = pal(['#2a2e3a', '#4a5262', '#7a8496', '#aeb8c8', '#e0e6ee']);
    // トラス柱
    [[8, 30], [W - 30, 30]].forEach(function (c) {
      var x0 = c[0], wd = 22;
      p.rect(x0, 30, wd, H - 32, 0);
      for (var y = 30; y < H - 2; y++) {
        p.set(x0, y, MET[3]); p.set(x0 + 1, y, MET[2]); p.set(x0 + wd - 1, y, MET[1]); p.set(x0 + wd - 2, y, MET[1]);
      }
      for (y = 30; y < H - 6; y += 12) {
        p.line(x0 + 1, y, x0 + wd - 2, y + 12, MET[2]); p.line(x0 + wd - 2, y, x0 + 1, y + 12, MET[1]);
        p.hline(x0, x0 + wd - 1, y, MET[3]);
      }
      p.rect(x0 - 3, H - 6, wd + 6, 5, MET[1]);
    });
    // バナー
    var bx = 4, by = 6, bw = W - 8, bh = 34;
    var bg = kind === 'goal' ? ['#ff6aa8', '#ff9ac4'] : (kind === 'start' ? ['#1a3ab0', '#2e5ae0'] : ['#e8a810', '#ffcc30']);
    p.rect(bx, by, bw, bh, C(bg[0]));
    p.rect(bx + 3, by + 3, bw - 6, bh - 6, C(bg[1]));
    p.hline(bx, bx + bw - 1, by, C('#ffffff')); p.hline(bx, bx + bw - 1, by + bh - 1, G.darken(C(bg[0]), 0.4));
    // 両端のチェッカーフラッグ
    [bx + 4, bx + bw - 30].forEach(function (fx) {
      for (var yy = 0; yy < 6; yy++) for (var xx = 0; xx < 6; xx++) p.rect(fx + xx * 4, by + 5 + yy * 4, 4, 4, ((xx + yy) & 1) ? C('#101010') : C('#ffffff'));
    });
    var label = kind === 'goal' ? 'GOAL' : (kind === 'start' ? 'START' : 'CHECK POINT');
    var txt = G.Font.render(label, { scale: 3, bold: true, color: kind === 'cp' ? '#c02020' : '#ffffff', outline: kind === 'cp' ? '#ffffff' : '#101828' });
    blitCanvas(p, txt, W / 2 - txt.width / 2, by + bh / 2 - txt.height / 2);
    if (kind === 'goal') {
      // 桜の飾り
      var ramp = pal(['#c25c8a', '#e88ab0', '#ffb4cc', '#ffd6e4', '#fff2f6']);
      canopy(p, 30, 40, 26, 12, ramp, 5, { rmin: 3, rvar: 4 });
      canopy(p, W - 30, 40, 26, 12, ramp, 6, { rmin: 3, rvar: 4 });
      canopy(p, W / 2, 4, 60, 6, ramp, 7, { rmin: 2, rvar: 3 });
    }
    if (kind === 'start') {
      // シグナル用の台
      p.rect(W / 2 - 40, by + bh, 80, 14, MET[0]);
      p.hline(W / 2 - 40, W / 2 + 39, by + bh, MET[2]);
    }
    p.outline(C('#101018'));
    return p;
  }
  // スタートシグナル (frame: 0..4  点灯数 / 4=緑)
  function startGateFrames() {
    var base = gate('start');
    var frames = [];
    for (var f = 0; f <= 4; f++) {
      var p = base.clone(), W = p.w, by = 40;
      for (var i = 0; i < 4; i++) {
        var lx = W / 2 - 30 + i * 20, on = f === 4 ? true : i < f;
        var col = f === 4 ? (on ? C('#40ff60') : C('#104018')) : (on ? C('#ff3030') : C('#401010'));
        p.disc(lx, by + 7, 5, C('#101010'));
        p.disc(lx, by + 7, 4, col);
        if (on) p.set(lx - 1, by + 5, C('#ffffff'));
      }
      frames.push(p.toCanvas());
    }
    return frames;
  }

  function chevron(dir) {
    var W = 44, H = 40, p = new G.PX(W, H);
    p.rect(8, 22, 3, H - 23, C('#8a8a90')); p.rect(W - 11, 22, 3, H - 23, C('#8a8a90'));
    p.rect(1, 2, W - 2, 22, C('#ffd020'));
    p.rect(1, 2, W - 2, 2, C('#fff080'));
    for (var k = 0; k < 3; k++) {
      var x0 = 8 + k * 11;
      for (var y = 0; y < 14; y++) {
        var off = Math.abs(y - 7);
        var x = dir < 0 ? x0 + off : x0 + 7 - off;
        p.rect(x, 6 + y, 4, 1, C('#101010'));
      }
    }
    p.outline(C('#202020'));
    return p;
  }

  function billboard(text, sub, cols, seed) {
    var t1 = G.Font.render(text, { scale: 2, bold: true, color: cols[2], outline: cols[3] });
    var W = Math.max(110, t1.width + 18), H = 70, p = new G.PX(W, H);
    p.rect(14, 40, 4, H - 41, C('#5a5a64')); p.rect(W - 18, 40, 4, H - 41, C('#5a5a64'));
    p.vline(15, 40, H - 2, C('#7a7a84')); p.vline(W - 17, 40, H - 2, C('#7a7a84'));
    p.rect(2, 2, W - 4, 40, C(cols[0]));
    // 斜めの帯
    p.poly([[2, 32], [W - 2, 22], [W - 2, 42], [2, 42]], C(cols[1]));
    p.rect(2, 2, W - 4, 2, G.lighten(C(cols[0]), 0.3));
    blitCanvas(p, t1, W / 2 - t1.width / 2, 7);
    if (sub) { var t2 = G.Font.render(sub, { color: cols[4] || cols[3] }); blitCanvas(p, t2, W / 2 - t2.width / 2, 31); }
    p.outline(C('#18181e'));
    return p;
  }

  // 観客 (スタート地点)
  function crowd(seed) {
    var W = 96, H = 44, p = new G.PX(W, H), r = G.rng(seed);
    var shirts = ['#ff4040', '#40a0ff', '#ffd040', '#ffffff', '#40d070', '#ff80c0', '#a060ff', '#ff9020'];
    var skins = ['#f6d0a8', '#e8b888', '#d8a070'], hairs = ['#201818', '#3a2418', '#6a4020', '#181820'];
    // 柵
    for (var row = 0; row < 2; row++) {
      var n = row ? 11 : 12;
      for (var i = 0; i < n; i++) {
        var x = Math.round(5 + i * 7.6 + (row ? 4 : 0) + r() * 2), y = 12 + row * 12;
        var sc = C(shirts[Math.floor(r() * shirts.length)]), sk = C(skins[Math.floor(r() * 3)]), hr = C(hairs[Math.floor(r() * 4)]);
        p.rect(x - 2, y + 9, 5, 4, C(r() < 0.5 ? '#2a3a6a' : '#3a3a40')); // ズボン
        p.rect(x - 3, y + 2, 7, 8, sc);                                   // 服
        p.vline(x - 3, y + 2, y + 9, G.lighten(sc, 0.25));
        p.vline(x + 3, y + 3, y + 9, G.darken(sc, 0.25));
        p.disc(x + 0.5, y - 1, 2.6, sk);                                  // 顔
        p.hline(x - 2, x + 2, y - 3, hr); p.hline(x - 1, x + 1, y - 4, hr);
        var pose = r();
        if (pose < 0.35) { p.vline(x - 4, y - 5, y + 2, sc); p.set(x - 4, y - 6, sk); p.vline(x + 4, y - 5, y + 2, sc); p.set(x + 4, y - 6, sk); } // 両手を上げる
        else if (pose < 0.6) { // 旗を振る
          p.vline(x + 4, y - 9, y + 3, C('#c8c0b0'));
          var fc = r() < 0.5 ? ['#ffffff', '#e02020'] : ['#101010', '#ffffff'];
          for (var fy = 0; fy < 4; fy++) for (var fx = 0; fx < 6; fx++) p.set(x + 5 + fx, y - 9 + fy, C(((fx + fy) & 1) ? fc[0] : fc[1]));
        }
      }
    }
    // 手すり
    p.rect(0, H - 8, W, 2, C('#e8e8f0')); p.rect(0, H - 6, W, 6, C('#3a6ad8'));
    for (var k = 4; k < W; k += 12) p.rect(k, H - 6, 2, 6, C('#e8e8f0'));
    p.outline(C('#18101a'));
    return p;
  }

  // =========================================================
  //  登録
  // =========================================================
  G.buildScenery = function () {
    // 夏
    reg('palm1', palm(1, 92, 1), 2.1, 0.12);
    reg('palm2', palm(2, 80, -1), 2.1, 0.12);
    reg('palm3', palm(3, 100, 0.6), 2.1, 0.12);
    reg('parasolR', parasol(C('#ff3a3a'), C('#ffffff')), 1.6, 0);
    reg('parasolB', parasol(C('#2a7af0'), C('#ffffff')), 1.6, 0);
    reg('parasolY', parasol(C('#ffc020'), C('#ff6a20')), 1.6, 0);
    reg('sunflower', sunflowers(4), 1.7, 0);
    reg('hut', beachHut(), 2.0, 0.85);
    reg('surf', surfRack(), 1.7, 0.6);
    reg('rock', rock(5, true), 2.0, 0.7);
    reg('rockS', rock(6, false), 1.8, 0.6);
    reg('yachtR', yacht('#e83030'), 2.2, 0);
    reg('yachtB', yacht('#2a6ae0'), 2.2, 0);
    reg('board_summer', billboard('SHIKI DRIVE', 'SEASIDE LINE', ['#1a7ae8', '#ffd030', '#ffffff', '#102a60'], 1), 2.2, 0.5);
    reg('board_smart', billboard('ROADSTER', 'COUPE  2 SEATER', ['#d82030', '#202028', '#ffffff', '#3a0a10', '#ffd040'], 2), 2.2, 0.5);
    // 秋
    var momijiR = pal(['#4a0c0a', '#8a1a12', '#c8301c', '#ee5a2c', '#ff9a52']);
    var momijiO = pal(['#5a2008', '#9a4410', '#d8701c', '#f6a03a', '#ffd070']);
    var TRB = pal(['#2a1a14', '#4a3226', '#6a4c3a']);
    reg('momiji1', leafTree(11, momijiR, TRB, 66, 82, { speck: pal(['#ffb070', '#ffd8a0']), speckN: 30 }), 2.0, 0.15);
    reg('momiji2', leafTree(12, momijiO, TRB, 60, 76, { speck: pal(['#ffe090']), speckN: 26 }), 2.0, 0.15);
    reg('momiji3', leafTree(13, pal(['#4a0a14', '#86142a', '#c02434', '#e84a4a', '#ff8a7a']), TRB, 54, 70), 2.0, 0.15);
    reg('ginkgo', ginkgo(14), 2.1, 0.12);
    reg('kaki', kakiTree(15), 2.0, 0.15);
    reg('torii', torii(), 2.2, 0.2);
    reg('lantern', stoneLantern(), 1.7, 0.7);
    reg('scarecrow', scarecrow(), 1.6, 0.4);
    reg('higanbana', higanbana(16), 1.2, 0);
    reg('hasa', hasa(), 1.8, 0.8);
    reg('board_autumn', billboard('MAPLE PASS', 'AUTUMN LEAVES', ['#c84a18', '#3a1a10', '#ffe0a0', '#3a1008', '#ffb060'], 3), 2.2, 0.5);
    // 冬
    reg('sugi1', snowCedar(21, 100), 2.1, 0.15);
    reg('sugi2', snowCedar(22, 76), 2.1, 0.15);
    reg('bare', bareTree(23), 2.0, 0.12);
    reg('snowman', snowman(), 1.6, 0.6);
    reg('kamakura', kamakura(), 1.9, 0.8);
    reg('snowbank', snowBank(24), 2.0, 0);
    reg('lamp', streetLamp(), 2.0, 0.15);
    reg('gassho', gassho(), 2.3, 0.85);
    reg('board_winter', billboard('SNOW VALLEY', 'DRIVE SAFELY', ['#2a4ab0', '#e8f0ff', '#ffffff', '#0a1a50'], 4), 2.2, 0.5);
    // 春
    reg('sakura1', sakura(31, 84, 86), 2.1, 0.12);
    reg('sakura2', sakura(32, 66, 70), 2.1, 0.12);
    reg('shidare', shidare(33), 2.1, 0.12);
    reg('nanohana', flowerPatch(34, pal(['#ffe030', '#fff060', '#f0c818']), pal(['#2a6a20', '#3a8a2a', '#52a838', '#6cc048']), 64, 26), 1.6, 0);
    reg('tulip', tulips(35), 1.6, 0);
    regFrames('koinobori', [koinobori(0), koinobori(1), koinobori(2)], 2.0, 0.1, 5);
    reg('board_spring', billboard('SAKURA ROAD', 'GOAL IS NEAR!', ['#ff7ab0', '#fff0f6', '#ffffff', '#7a1a48', '#c02a70'], 5), 2.2, 0.5);
    // 共通
    var sg = startGateFrames();
    SPR.gate_start = { img: sg[0], frames: sg, zoom: 2.05, hit: 0, frameFn: function () { return G.startLightFrame ? G.startLightFrame() : 0; } };
    reg('gate_cp', gate('cp'), 2.05, 0);
    reg('gate_goal', gate('goal'), 2.05, 0);
    reg('chevL', chevron(-1), 1.6, 0.6);
    reg('chevR', chevron(1), 1.6, 0.6);
    reg('crowd', crowd(41), 1.8, 0.9);
  };
})();
