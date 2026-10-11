'use strict';
// ============================================================
//  art_car.js  自車: smart roadster-coupé (後ろ姿) のドット絵を生成
//   - 大きなガラスのファストバック (斜めガラス + 不透明パネル + 垂直ガラス)
//   - シルバーのトライディオン (ロールバー/Bピラー)
//   - シルバーのスポイラー枠 + ハイマウントストップランプ
//   - 三連丸型テールランプ / センター出しマフラー / 太い後輪
//  turn(-2..2) ごとに奥行きずらしで曲がっている姿を作る
// ============================================================
(function () {
  var C = G.col;
  function pal(a) { return a.map(function (h) { return C(h); }); }
  var BODY = pal(['#3a0610', '#6a0c18', '#a0121e', '#d0202c', '#ee4450', '#ff8c88']);
  var SIL = pal(['#2a303c', '#565f70', '#8a94a6', '#b8c0d0', '#e2e6ee', '#ffffff']);
  var BLK = pal(['#07070b', '#121219', '#1e1e28', '#2e2e3c', '#444456']);
  var GLS = pal(['#091024', '#111c38', '#1a2c58', '#284478', '#4a6ca8', '#90b4e4']);
  var TIRE = pal(['#0a0a0e', '#18181e', '#26262e', '#383842']);
  var LAMP_OFF = pal(['#3e0810', '#7c1220', '#b8243a', '#e8707c']);
  var LAMP_ON = pal(['#b01828', '#ff3a3a', '#ffa088', '#fff6e8']);
  var AMB = pal(['#5a2808', '#b86010', '#f8a030', '#ffe0a0']);
  var PLATE = C('#f2f2e6'), PLATE_D = C('#c4c4b4'), PLATE_G = C('#1d7038');
  var OUT = C('#140810');
  var SHADOW = G.rgba(0, 0, 0, 100);

  var W = 104, H = 64, CX = 52, GROUND = 60;

  // ボディ (後面) の行ごとの半幅
  var BODY_ROWS = {};
  (function () {
    var tbl = [[24, 30], [25, 34], [26, 37], [27, 39], [28, 40.5], [29, 41.5], [30, 42], [38, 42], [39, 41.5],
      [40, 41], [41, 40.5], [42, 40], [43, 39], [44, 38], [45, 36.5], [46, 35], [47, 33]];
    for (var i = 0; i < tbl.length - 1; i++) {
      var a = tbl[i], b = tbl[i + 1];
      for (var y = a[0]; y < b[0]; y++) BODY_ROWS[y] = a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    BODY_ROWS[47] = 33;
  })();

  function drawCar(t, wheelFrame, brake) {
    var p = new G.PX(W, H);
    var at = Math.abs(t), sd = G.sign(t);
    var KD = 3.2; // 奥行き 1.0 あたりの横ずれ(px)
    function X(x, depth) { return CX + x * (1 - 0.02 * at) + t * KD * (depth || 0) - t * 1.2; }
    function sym(fn) { fn(-1); fn(1); }

    // ---- 影 ----
    p.ellipse(CX + t * 1.2, GROUND - 1, 46, 4.2, SHADOW);

    // ---- 前輪 (曲がっている時に外側から見える) ----
    if (at > 0) {
      var fx = X(sd * 37.5, 1.0), fw = 2 + at * 1.5;
      for (var y = GROUND - 14; y < GROUND - 1; y++) {
        for (var i = 0; i < fw; i++) {
          var c = i >= fw - 1 ? TIRE[2] : TIRE[1];
          if (((y + wheelFrame * 2) & 3) === 0 && i > 0) c = TIRE[3];
          p.set(Math.round(fx + sd * i), y, c);
        }
      }
    }

    // ---- 後輪 ----
    sym(function (s) {
      var lo = X(s > 0 ? 28 : -41, 0.05), hi = X(s > 0 ? 41 : -28, 0.05);
      if (s === sd) { if (s > 0) hi += at * 1.3; else lo -= at * 1.3; }
      var x0 = Math.round(lo), w = Math.round(hi - lo) + 1;
      p.rrect(x0, 40, w, GROUND - 40, 3, 0, function (x, y, i, j) {
        var c = TIRE[1];
        if (((j + wheelFrame * 2) & 3) === 0) c = TIRE[2];
        if (i === 0 || i === w - 1) c = TIRE[0];
        if ((s > 0 && i === 1) || (s < 0 && i === w - 2)) c = TIRE[3];
        if (j >= GROUND - 40 - 2) c = TIRE[0];
        return c;
      });
    });

    // ---- 下部ディフューザー (黒) ----
    var dl = X(-30, 0), dr = X(30, 0);
    p.poly([[dl, 46], [dr, 46], [dr - 2, 54], [dl + 2, 54]], BLK[1]);
    for (var k = -3; k <= 3; k++) if (k) p.vline(Math.round(X(k * 7, 0)), 49, 53, BLK[3]);
    p.hline(dl + 1, dr - 2, 47, BLK[2]);
    // センター出しマフラー
    p.ellipse(X(0, 0), 51, 4.4, 2.7, SIL[3]);
    p.ellipse(X(0, 0), 51, 3.1, 1.6, BLK[0]);
    p.set(Math.round(X(-2, 0)), 49, SIL[5]); p.set(Math.round(X(-1, 0)), 49, SIL[4]);

    // ---- ボディ後面 ----
    for (var yy = 24; yy <= 47; yy++) {
      var hw = BODY_ROWS[yy];
      var l = X(-hw, 0), r = X(hw, 0);
      // 曲がる側に側面が少し見える
      var ext = 0;
      if (at && yy >= 26 && yy <= 45) ext = at * 2.6 * Math.min(1, (yy - 25) / 3);
      if (sd > 0) r += ext; else l -= ext;
      for (var x = Math.round(l); x <= Math.round(r) - 1; x++) {
        var u = (x + 0.5 - X(0, 0)) / hw; // -1..1 (後面)
        var side = (sd > 0 && u > 1) || (sd < 0 && u < -1);
        var lv;
        if (yy <= 25) lv = 4.6; else if (yy <= 28) lv = 4; else if (yy <= 37) lv = 3; else if (yy <= 43) lv = 2.4; else lv = 1.5;
        if (yy === 29) lv = 3.5;
        // 端の丸み
        var au = Math.abs(u);
        if (au > 0.84) lv -= (au - 0.84) * 9;
        if (u < -0.3 && u > -0.75 && yy >= 26 && yy <= 31) lv += 0.6; // 左フェンダー上の照り
        if (side) lv = yy < 30 ? 2.6 : (yy < 40 ? 2 : 1.2);
        var li = Math.floor(lv), f = lv - li;
        if (f > 0.25 && f < 0.75 && G.dither(x, yy, f)) li++; else if (f >= 0.75) li++;
        p.set(x, yy, BODY[G.clamp(li, 0, 5)]);
      }
    }
    // フェンダーのスペキュラー
    p.hline(X(-31, 0), X(-26, 0), 26, BODY[5]);
    p.hline(X(25, 0), X(28, 0), 26, BODY[4]);
    // バンパー上のプレスライン
    p.hline(X(-39, 0), X(39, 0) - 1, 43, BODY[1]);
    p.hline(X(-37, 0), X(37, 0) - 1, 44, BODY[3]);

    // ---- テールランプ (黒いハウジングに三連丸) ----
    sym(function (s) {
      var hx = X(s * 28.5, 0), hy = 33;
      p.rrect(Math.round(hx - 11), hy - 4, 23, 9, 4, BLK[1]);
      p.hline(Math.round(hx - 9), Math.round(hx + 9), hy - 4, BLK[3]);
      [[s * 36, 'red'], [s * 28.5, 'red'], [s * 21, 'amb']].forEach(function (L) {
        var cx = X(L[0], 0), cy = hy + 0.5, rr = 3.1;
        var ramp = L[1] === 'amb' ? AMB : (brake ? LAMP_ON : LAMP_OFF);
        p.disc(cx, cy, rr, 0, function (x, y, nx, ny) {
          return G.shadeRamp(ramp, nx, ny, x, y, -0.5, -0.8, (brake && L[1] === 'red') ? 0.3 : 0);
        });
        p.set(Math.round(cx - 1.2), Math.round(cy - 1.6), ramp[3]);
      });
    });
    // smart ロゴ (銀の c + 黄色の矢印)
    var lx = Math.round(X(-1, 0)), ly = 33;
    p.rect(lx - 2, ly - 2, 7, 5, BODY[2]);
    p.set(lx, ly - 2, SIL[4]); p.set(lx + 1, ly - 2, SIL[3]);
    p.set(lx - 1, ly - 1, SIL[4]); p.set(lx - 1, ly, SIL[4]);
    p.set(lx, ly + 1, SIL[3]); p.set(lx + 1, ly + 1, SIL[2]);
    p.set(lx + 2, ly - 1, C('#ffd030')); p.set(lx + 2, ly, C('#ffc020')); p.set(lx + 3, ly - 1, C('#ffb000'));

    // ---- ナンバープレート ----
    var pw = 18, px0 = Math.round(X(-9, 0));
    p.rect(px0 - 1, 37, pw + 2, 8, BLK[1]);
    p.rect(px0, 37, pw, 7, PLATE);
    p.hline(px0, px0 + pw - 1, 43, PLATE_D);
    p.hline(px0 + 2, px0 + 5, 38, PLATE_G); p.hline(px0 + 9, px0 + 11, 38, PLATE_G);
    for (var d = 0; d < 4; d++) {
      var dx = px0 + 2 + d * 4;
      p.vline(dx, 40, 42, PLATE_G); p.vline(dx + 2, 40, 42, PLATE_G); p.set(dx + 1, 40, PLATE_G); p.set(dx + 1, 42, PLATE_G);
    }

    // ---- サイドミラー ----
    sym(function (s) {
      var stx = X(s * 27, 0.6);
      p.rect(Math.round(s < 0 ? stx - 4 : stx), 19, 5, 2, BLK[2]);
      var mx = X(s * 33.5, 0.6), w = 8, x0 = Math.round(mx - w / 2);
      p.rrect(x0, 14, w, 6, 2, 0, function (x, y, i, j) {
        var c = j < 2 ? BODY[4] : (j < 4 ? BODY[3] : BODY[1]);
        if ((s < 0 && i === 0) || (s > 0 && i === w - 1)) c = BODY[1];
        return c;
      });
      p.hline(x0 + 1, x0 + w - 2, 19, BLK[1]);
    });

    // ---- ガラスキャノピー + トライディオン ----
    var topY = 4, baseY = 24, midY = 15;
    function gx(y, s) {
      var tt = (y - topY) / (baseY - topY);
      var hw = 16 + 9.5 * Math.sin(tt * Math.PI / 2);
      var dep = 0.95 - 0.85 * tt;
      return X(s * hw, dep);
    }
    var poly = [], y2;
    for (y2 = topY; y2 <= baseY; y2++) poly.push([gx(y2, -1) - 2.4, y2]);
    for (y2 = baseY; y2 >= topY; y2--) poly.push([gx(y2, 1) + 2.4, y2]);
    p.poly(poly, 0, function (x, y) {
      var right = x > gx(y, 1) - 1;
      if (y <= topY + 1) return right ? SIL[3] : SIL[4];
      return right ? SIL[2] : SIL[3];
    });
    // ルーフ
    p.hline(gx(topY, -1) - 1, gx(topY, 1) + 1, topY - 1, SIL[2]);
    p.hline(gx(topY, -1) + 1, gx(topY, 1) - 1, topY - 2, SIL[1]);
    // ガラス
    poly = [];
    for (y2 = topY + 1; y2 <= baseY; y2++) poly.push([gx(y2, -1), y2]);
    for (y2 = baseY; y2 >= topY + 1; y2--) poly.push([gx(y2, 1), y2]);
    p.poly(poly, 0, function (x, y) {
      var cl = gx(y, -1), cr = gx(y, 1), u = (x + 0.5 - cl) / (cr - cl);
      if (y === midY) return BLK[3];
      if (y === midY + 1 || y === midY + 2) return BLK[1];
      var c;
      if (y < midY) {
        var lv = 1.3 + (midY - y) * 0.13, li = Math.floor(lv);
        if (G.dither(x, y, lv - li)) li++;
        c = GLS[li];
        var dg = u * 30 + (y - topY) * 1.5;
        if (dg > 19 && dg < 22) c = GLS[4];
        else if (dg > 23 && dg < 24.5) c = GLS[3];
      } else {
        var lv2 = 2.2 - (y - midY - 3) * 0.18, li2 = Math.floor(lv2);
        if (G.dither(x, y, lv2 - li2)) li2++;
        c = GLS[G.clamp(li2, 0, 5)];
        if (u > 0.1 && u < 0.17) c = GLS[4];
        if (u > 0.2 && u < 0.23) c = GLS[3];
      }
      return c;
    });
    // 乗員 (右ハンドル: 右が運転席)
    function head(hx, hair, hairHi, long) {
      var cx = X(hx, 0.9);
      p.ellipse(cx, 10.5, 3.7, 3.6, 0, function (x, y, nx, ny) {
        if (y >= midY) return 0;
        return (ny < -0.3 && nx < 0.1) ? hairHi : hair;
      });
      if (long) { p.rect(Math.round(cx - 3.7), 11, 2, 4, hair); p.rect(Math.round(cx + 1.7), 11, 2, 4, hair); }
      p.hline(cx - 5.5, cx + 5.5, midY - 1, BLK[0]);
    }
    head(8.5, C('#18121a'), C('#342834'), false);
    head(-8.5, C('#4c2a1a'), C('#7a4a2c'), true);

    // ---- スポイラー枠 + ハイマウントストップランプ ----
    var sx0 = Math.round(X(-27.5, 0.02)), sw = Math.round(X(27.5, 0.02)) - sx0;
    p.rrect(sx0, baseY, sw, 3, 1, 0, function (x, y, i, j) { return [SIL[4], SIL[3], SIL[1]][j]; });
    var hb = brake ? LAMP_ON : LAMP_OFF;
    p.hline(X(-6, 0.02), X(6, 0.02) - 1, baseY + 1, hb[1]);
    p.hline(X(-4, 0.02), X(4, 0.02) - 1, baseY + 1, brake ? hb[3] : hb[2]);

    // ---- 輪郭 ----
    var sh = [];
    for (var q = 0; q < p.d.length; q++) if (p.d[q] === SHADOW) { sh.push(q); p.d[q] = 0; }
    p.outline(OUT, false);
    for (q = 0; q < sh.length; q++) if (!G.ca(p.d[sh[q]])) p.d[sh[q]] = SHADOW;

    // ---- ブレーキグロー ----
    if (brake) {
      sym(function (s) {
        [36, 28.5].forEach(function (lp) {
          var cx = X(s * lp, 0), cy = 33.5;
          p.disc(cx, cy, 6, 0, function (x, y, nx, ny, dd) {
            var o = p.get(x, y);
            if (G.ca(o) && o !== SHADOW) return 0;
            return dd > 0.6 ? 0 : G.rgba(255, 80, 60, 80);
          });
        });
      });
    }
    return p;
  }

  G.buildPlayerCar = function () {
    var frames = {};
    for (var t = -2; t <= 2; t++) {
      frames[t] = [];
      for (var wf = 0; wf < 2; wf++) frames[t][wf] = [drawCar(t, wf, false).toCanvas(), drawCar(t, wf, true).toCanvas()];
    }
    return { frames: frames, w: W, h: H, groundY: GROUND };
  };
  G.drawCarPX = drawCar;
})();
