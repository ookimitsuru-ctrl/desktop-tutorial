'use strict';
// ============================================================
//  art_car.js  自車: smart roadster-coupé BRABUS (黒) の後ろ姿をドット絵で生成
//   オーナーの実車写真を参考に:
//   - 艶のある黒いボディ, 大きく張り出した丸いリアフェンダー
//   - 大きなガラスハッチ (上段は空の映り込み, 下段は車内が透ける)
//     と, その境目の赤いハイマウントストップランプ
//   - クロームの枠に 赤・アンバー・赤 の三連丸テールランプ
//   - 黒いパネルに smart ロゴと BRABUS エンブレム
//   - ナンバーのくぼみ, 左右のハニカムメッシュ, センター 2 本出しマフラー
//   - 楕円の黒いドアミラー, ルーフのアクションカメラ
//  turn(-2..2) ごとに奥行きずらしで曲がっている姿を作る
// ============================================================
(function () {
  var C = G.col;
  function pal(a) { return a.map(function (h) { return C(h); }); }
  // 黒ボディ: 暗→明 (明るい側は空の映り込み)
  var BODY = pal(['#020307', '#090b13', '#11141f', '#1b2030', '#2a3248', '#4a5a7c', '#93a7c8']);
  var GLS = pal(['#04060c', '#0a101c', '#141e31', '#22324e', '#4a6590', '#90acd6']);
  var LOUVER = pal(['#151922', '#323844', '#4e5664']);        // ガラス越しのエンジンフードのルーバー
  var CHR = pal(['#4c525e', '#8c95a4', '#c6ccd6', '#eef2f6']);  // クローム
  var TIRE = pal(['#08080b', '#15151b', '#23232b', '#34343e']);
  var LAMP_OFF = pal(['#4a0810', '#951620', '#d02c38', '#ff8088']);
  var LAMP_ON = pal(['#c01020', '#ff3434', '#ff9c84', '#fff4e8']);
  var AMB = pal(['#5a4026', '#9c7850', '#d6b488', '#f6e6cc']);
  var PLATE = C('#f2f2ea'), PLATE_D = C('#c4c4b6'), PLATE_G = C('#1a5a30');
  var MESH = pal(['#020204', '#101218', '#5e6470', '#9aa0aa']);
  var OUT = C('#000000');
  var SHADOW = G.rgba(0, 0, 0, 105);

  var W = 104, H = 64, CX = 52, GROUND = 60;

  // ボディ後面の行ごとの半幅 (ショルダー〜バンパー下端)
  var BODY_ROWS = {};
  (function () {
    var tbl = [[24, 31], [25, 34], [26, 36.5], [27, 38.5], [28, 40], [29, 41], [31, 41.8], [43, 42], [45, 41.5],
      [46, 41], [47, 40], [48, 38.5], [49, 36.5], [50, 34]];
    for (var i = 0; i < tbl.length - 1; i++) {
      var a = tbl[i], b = tbl[i + 1];
      for (var y = a[0]; y < b[0]; y++) BODY_ROWS[y] = a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    BODY_ROWS[50] = 34;
  })();

  function drawCar(t, wheelFrame, brake) {
    var p = new G.PX(W, H);
    var at = Math.abs(t), sd = G.sign(t);
    var KD = 3.2; // 奥行き 1.0 あたりの横ずれ(px)
    function X(x, depth) { return CX + x * (1 - 0.02 * at) + t * KD * (depth || 0) - t * 1.2; }
    function sym(fn) { fn(-1); fn(1); }
    function shade(lv, x, y) { // 小数レベル -> ディザ付きの色
      var li = Math.floor(lv), f = lv - li;
      if (f > 0.3 && f < 0.7 && G.dither(x, y, f)) li++; else if (f >= 0.7) li++;
      return BODY[G.clamp(li, 0, BODY.length - 1)];
    }

    // ---- 影 ----
    p.ellipse(CX + t * 1.2, GROUND - 1, 47, 4.2, SHADOW);

    // ---- 前輪 (曲がっている時に外側から見える) ----
    if (at > 0) {
      var fx = X(sd * 38, 1.0), fw = 2 + at * 1.5;
      for (var y = GROUND - 13; y < GROUND - 1; y++) {
        for (var i = 0; i < fw; i++) {
          var c = i >= fw - 1 ? CHR[1] : TIRE[1];   // 外側にホイールのリムが少し光る
          if (((y + wheelFrame * 2) & 3) === 0 && i > 0 && i < fw - 1) c = TIRE[3];
          p.set(Math.round(fx + sd * i), y, c);
        }
      }
    }

    // ---- 後輪 (太いタイヤ) ----
    sym(function (s) {
      var lo = X(s > 0 ? 28 : -42, 0.05), hi = X(s > 0 ? 42 : -28, 0.05);
      if (s === sd) { if (s > 0) hi += at * 1.3; else lo -= at * 1.3; }
      var x0 = Math.round(lo), w = Math.round(hi - lo) + 1;
      p.rrect(x0, 43, w, GROUND - 43, 3, 0, function (x, y, i, j) {
        var c = TIRE[1];
        if (((j + wheelFrame * 2) & 3) === 0) c = TIRE[2];
        if (i === 0 || i === w - 1) c = TIRE[0];
        if ((s > 0 && i === 1) || (s < 0 && i === w - 2)) c = TIRE[3];
        if (j >= GROUND - 43 - 2) c = TIRE[0];
        // 曲がる側はリムのクロームが見える
        if (s === sd && ((s > 0 && i === w - 2) || (s < 0 && i === 1)) && j > 4 && j < 12) c = CHR[2];
        return c;
      });
    });

    // ---- ボディ後面 (ショルダー〜バンパー) ----
    for (var yy = 24; yy <= 50; yy++) {
      var hw = BODY_ROWS[yy];
      var l = X(-hw, 0), r = X(hw, 0);
      var ext = 0;
      if (at && yy >= 26 && yy <= 48) ext = at * 2.6 * Math.min(1, (yy - 25) / 3);
      if (sd > 0) r += ext; else l -= ext;
      for (var x = Math.round(l); x <= Math.round(r) - 1; x++) {
        var u = (x + 0.5 - X(0, 0)) / hw;
        var side = (sd > 0 && u > 1) || (sd < 0 && u < -1);
        var lv;
        if (yy <= 25) lv = 4.4; else if (yy <= 27) lv = 3.6; else if (yy <= 36) lv = 2.4; else if (yy <= 44) lv = 2.1; else lv = 1.4;
        var au = Math.abs(u);
        // 丸いヒップの陰影と空の映り込み
        if (au > 0.8) lv -= (au - 0.8) * 7;
        if (au > 0.62 && au < 0.8 && yy >= 27 && yy <= 40) lv += (u < 0 ? 2.4 : 1.6) * (1 - Math.abs(yy - 32) / 9);
        if (yy === 44 || yy === 45) lv += 1.0;   // バンパーの角の照り
        if (side) lv = yy < 30 ? 2.8 : (yy < 42 ? 1.8 : 1);
        p.set(x, yy, shade(lv, x, yy));
      }
    }
    // フェンダーの鋭いハイライト (写真の反射)
    p.line(X(-36, 0), 28, X(-34, 0), 36, BODY[6]);
    p.line(X(-35, 0), 28, X(-33, 0), 35, BODY[5]);
    p.line(X(34, 0), 28, X(36, 0), 36, BODY[6]);
    p.line(X(33, 0), 29, X(35, 0), 35, BODY[5]);
    p.hline(X(-30, 0), X(-12, 0), 35, BODY[4]);   // ランプ下の折れ線
    p.hline(X(12, 0), X(30, 0), 35, BODY[3]);

    // ---- 下部: 左右の大きなダイヤ柄メッシュ + 2 本出しマフラー (やや左寄り) ----
    var gl = X(-34, 0), gr = X(34, 0);
    p.poly([[gl, 50], [gr, 50], [gr - 3, 56], [gl + 3, 56]], MESH[0]);
    sym(function (s) {
      // 内側が少し下がった台形
      var pts = [[X(s * 29, 0), 45.5], [X(s * 3.5, 0), 47.5], [X(s * 3.5, 0), 54.5], [X(s * 27, 0), 52.5]];
      p.poly(pts, 0, function (x, y) {
        var dia = ((x + y) & 3) === 0 || ((x - y + 400) & 3) === 0;
        return dia ? (y < 51 ? MESH[3] : MESH[2]) : MESH[1];
      });
    });
    [-6.2, -1.4].forEach(function (ox) {
      var ex = X(ox, 0);
      p.disc(ex, 57, 2.6, 0, function (x, y, nx, ny) { return ny < -0.2 ? CHR[3] : (nx > 0.3 ? CHR[1] : CHR[2]); });
      p.disc(ex, 57.2, 1.4, TIRE[0]);
    });

    // ---- ナンバーのくぼみ + ナンバープレート ----
    var rl = Math.round(X(-25, 0)), rw = Math.round(X(25, 0)) - rl;
    p.rrect(rl, 35, rw, 10, 3, 0, function (x, y, i, j) { return j === 0 ? BODY[0] : (j === 9 ? BODY[3] : BODY[1]); });
    var pw = 18, px0 = Math.round(X(-12, 0));
    p.rect(px0, 36, pw, 8, PLATE);
    p.hline(px0, px0 + pw - 1, 43, PLATE_D);
    p.set(px0 + 1, 37, CHR[1]); p.set(px0 + pw - 2, 37, CHR[1]);       // ボルト
    p.hline(px0 + 4, px0 + 7, 37, PLATE_G); p.hline(px0 + 9, px0 + 11, 37, PLATE_G);
    p.set(px0 + 2, 40, PLATE_G); p.set(px0 + 2, 41, PLATE_G);
    for (var d = 0; d < 4; d++) {
      var dx = px0 + 4 + d * 3 + (d >= 2 ? 1 : 0);
      p.vline(dx, 39, 42, PLATE_G); p.vline(dx + 1, 39, 42, PLATE_G);
    }
    p.set(px0 + 10, 40, PLATE_G);

    // ---- テールランプ (クローム枠に 赤・アンバー・赤) ----
    var ly = 30.5;
    sym(function (s) {
      var lamps = [[s * 33.2, 'red', -1.0], [s * 26.6, 'amb', -0.5], [s * 20, 'red', 0]];
      // 細いクロームの枠 (外側がガラスの縁に沿って少し上がる)
      lamps.forEach(function (L) { p.disc(X(L[0], 0), ly + 0.6 + L[2], 4.3, CHR[1]); });
      lamps.forEach(function (L) { p.disc(X(L[0], 0), ly + 0.4 + L[2], 3.9, 0, function (x, y, nx, ny) { return ny < -0.3 ? CHR[3] : CHR[2]; }); });
      lamps.forEach(function (L) {
        var cx = X(L[0], 0), cy = ly + 0.8 + L[2], rr = 3.3;
        var ramp = L[1] === 'amb' ? AMB : (brake ? LAMP_ON : LAMP_OFF);
        p.disc(cx, cy, rr, 0, function (x, y, nx, ny) {
          return G.shadeRamp(ramp, nx, ny, x, y, -0.5, -0.8, (brake && L[1] === 'red') ? 0.3 : 0);
        });
        p.set(Math.round(cx - 1.3), Math.round(cy - 1.6), ramp[3]);
      });
    });
    // 中央の黒いパネル: smart ロゴ / BRABUS エンブレム / 左の小さなエンブレム
    var lx = Math.round(X(-3, 0));
    p.hline(lx, lx + 5, 31, CHR[2]); p.set(lx + 1, 32, CHR[1]); p.set(lx + 3, 32, CHR[1]); p.set(lx + 5, 32, CHR[1]);
    var bx = Math.round(X(9, 0));
    p.hline(bx, bx + 3, 32, CHR[3]); p.hline(bx, bx + 3, 33, CHR[0]);
    var kx = Math.round(X(-12, 0));
    p.hline(kx, kx + 1, 32, CHR[1]);

    // ---- サイドミラー (楕円の黒) ----
    sym(function (s) {
      var stx = X(s * 30, 0.6);
      p.rect(Math.round(s < 0 ? stx - 4 : stx), 23, 5, 2, BODY[1]);
      var mx = X(s * 37, 0.6), w = 9, x0 = Math.round(mx - w / 2);
      p.rrect(x0, 18, w, 7, 3, 0, function (x, y, i, j) {
        if (j < 2) return BODY[4];
        if ((s < 0 && i === 1 && j < 5) || (s > 0 && i === w - 2 && j < 5)) return BODY[5];
        return j < 5 ? BODY[2] : BODY[1];
      });
    });

    // ---- ガラスハッチ + 黒いピラー ----
    var topY = 11, baseY = 27, midY = 20;
    function gx(y, s) {
      var tt = (y - topY) / (baseY - topY);
      var hw = 19.5 + 9 * Math.pow(tt, 0.85);
      var dep = 0.95 - 0.85 * tt;
      return X(s * hw, dep);
    }
    var poly = [], y2;
    for (y2 = topY; y2 <= baseY; y2++) poly.push([gx(y2, -1) - 3.4, y2]);
    for (y2 = baseY; y2 >= topY; y2--) poly.push([gx(y2, 1) + 3.4, y2]);
    p.poly(poly, 0, function (x, y) {
      var right = x > gx(y, 1) - 1;
      if (y <= topY) return BODY[2];
      return right ? BODY[1] : BODY[3];
    });
    // ルーフ後端のシルバーの突起
    sym(function (s) {
      var nx = Math.round(X(s * 18, 0.95));
      p.rrect(nx - 2, topY - 2, 5, 3, 1, CHR[2]);
      p.hline(nx - 1, nx + 1, topY - 2, CHR[3]);
      p.set(nx + (s > 0 ? 2 : -2), topY, CHR[1]);
    });
    // ガラス
    poly = [];
    for (y2 = topY + 1; y2 <= baseY - 1; y2++) poly.push([gx(y2, -1), y2]);
    for (y2 = baseY - 1; y2 >= topY + 1; y2--) poly.push([gx(y2, 1), y2]);
    p.poly(poly, 0, function (x, y) {
      var cl = gx(y, -1), cr = gx(y, 1), u = (x + 0.5 - cl) / (cr - cl);
      if (y === midY - 1) return BODY[3];
      if (y === midY) return BODY[2];
      if (y === midY + 1) return BODY[1];
      if (y < midY) {
        // 上段: 空の映り込み (上ほど明るい)
        var lv = 1.6 + (midY - y) * 0.22 - Math.abs(u - 0.45) * 0.8, li = Math.floor(lv);
        if (G.dither(x, y, lv - li)) li++;
        var c = GLS[G.clamp(li, 0, 5)];
        var dg = u * 30 + (y - topY) * 1.6;
        if (dg > 19 && dg < 21.5) c = GLS[5];
        else if (dg > 23 && dg < 24) c = GLS[4];
        return c;
      }
      // 下段: ガラス越しにエンジンフードのルーバー
      var c2 = GLS[1];
      if (u > 0.16 && u < 0.84 && y >= midY + 2) {
        c2 = ((y - midY) & 1) ? LOUVER[1] : LOUVER[0];
        if (((y - midY) & 1) && Math.round(x - X(0, 0)) % 7 === 0) c2 = LOUVER[0];
        if (y === midY + 2) c2 = LOUVER[2];
      }
      if (u > 0.08 && u < 0.13 && y < baseY - 1) c2 = GLS[3];
      return c2;
    });
    // ハイマウントストップランプ (ガラスの境目の赤いバー)
    var hb = brake ? LAMP_ON : LAMP_OFF;
    p.hline(X(-11, 0.4), X(11, 0.4) - 1, midY, hb[1]);
    p.hline(X(-10, 0.4), X(10, 0.4) - 1, midY, brake ? hb[3] : hb[2]);
    if (brake) p.hline(X(-9, 0.4), X(9, 0.4) - 1, midY + 1, hb[1]);

    // ---- ルーフのアクションカメラ (吸盤マウント) ----
    var cmx = Math.round(X(-3, 1.0));
    p.rect(cmx - 2, topY - 1, 5, 1, BODY[3]);         // 吸盤
    p.vline(cmx, topY - 5, topY - 2, BODY[4]);         // アーム
    p.rect(cmx - 2, topY - 9, 5, 4, BODY[1]);          // カメラ本体
    p.set(cmx - 1, topY - 9, BODY[5]); p.set(cmx + 2, topY - 8, BODY[0]);

    // ---- 輪郭 ----
    var sh = [];
    for (var q = 0; q < p.d.length; q++) if (p.d[q] === SHADOW) { sh.push(q); p.d[q] = 0; }
    p.outline(OUT, false);
    for (q = 0; q < sh.length; q++) if (!G.ca(p.d[sh[q]])) p.d[sh[q]] = SHADOW;

    // ---- ブレーキグロー ----
    if (brake) {
      sym(function (s) {
        [[33.2, -1], [20, 0]].forEach(function (lp) {
          var cx = X(s * lp[0], 0), cy = ly + 0.8 + lp[1];
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
