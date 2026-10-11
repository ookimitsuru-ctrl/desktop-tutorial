'use strict';
// ============================================================
//  art_car.js  自車: smart roadster-coupé BRABUS (黒) の後ろ姿をドット絵で生成
//   オーナーの実車写真を参考に (上から順に):
//   - ルーフのアクションカメラ, つや消しの黒いルーフと後端のグレーのフィン
//   - 大きなガラスハッチ: 上段は車内が透ける濃いガラス,
//     中央を黒いウイングが横切り, その中に赤いハイマウントストップランプ
//   - 下段のガラスは左右のテールランプの間まで下がり, エンジンフードのルーバーが透ける
//   - テールランプはガラスの両脇: クローム枠に 赤・ベージュ・赤 の三連丸
//   - ガラスのすぐ下の黒い帯に smart ロゴ / BRABUS / 小さなエンブレム
//   - 大きく丸く張り出したリアフェンダー, ナンバーのくぼみ (ナンバーはやや左)
//   - 左右の大きなダイヤ柄メッシュ, やや左寄りの 2 本出しマフラー
//   - 楕円の黒いドアミラー, 太いタイヤと銀のホイール
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
  var BEIGE = pal(['#5a4026', '#9c7850', '#d6b488', '#f6e6cc']); // 中央のクリアレンズ
  var PLATE = C('#f2f2ea'), PLATE_D = C('#c4c4b6'), PLATE_G = C('#1a5a30');
  var MESH = pal(['#020204', '#101218', '#5e6470', '#9aa0aa']);
  var OUT = C('#000000');
  var SHADOW = G.rgba(0, 0, 0, 105);

  // 真後ろからの実車写真で測った比率 (幅 84px に対して高さ約 57px)
  var W = 104, H = 72, CX = 52, GROUND = 68;

  // 縦方向のレイアウト
  var ROOF_Y = 12;      // ルーフ上端
  var WING_Y = 20;      // 黒いウイング (ハイマウントストップランプ) : ガラスの上から 4 割
  var GLASS_BOT = 30;   // 下段ガラスの下端 (テールランプの間)
  var BADGE_Y = 33;     // smart ロゴの行 (ランプの下半分の高さ)
  var LAMP_Y = 31.8;    // テールランプの中心
  var REC_Y = 37;       // ナンバーのくぼみ上端
  var MESH_Y = 50;      // メッシュグリル上端

  function interp(tbl) {
    var o = {};
    for (var i = 0; i < tbl.length - 1; i++) {
      var a = tbl[i], b = tbl[i + 1];
      for (var y = a[0]; y < b[0]; y++) o[y] = a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    o[tbl[tbl.length - 1][0]] = tbl[tbl.length - 1][1];
    return o;
  }
  // ボディ外形の半幅 (Cピラー根元〜バンパー下端)
  var BODY_ROWS = interp([[20, 32], [24, 33.5], [26, 35], [28, 36.5], [30, 38.5], [32, 40], [35, 41.3], [38, 42], [52, 42],
    [55, 41.2], [58, 39.5], [60, 37.5], [61, 35.5], [62, 32.5]]);
  // ガラスの半幅: 上段 (ルーフ〜ウイング) は下ほど広く, ランプの上端でランプの間の幅まで絞られる
  var GLASS_ROWS = interp([[ROOF_Y + 1, 21.5], [ROOF_Y + 2, 24], [ROOF_Y + 4, 26.3], [17, 27.6], [WING_Y + 1, 29.6], [25, 29], [27, 23], [28, 17.5], [GLASS_BOT, 16]]);

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
    // ガラスの奥行き (上ほど前方)
    function gdep(y) { return G.clamp(0.95 - 0.95 * (y - ROOF_Y) / (GLASS_BOT - ROOF_Y), 0, 1); }

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
      var lo = X(s > 0 ? 26.5 : -41, 0.05), hi = X(s > 0 ? 41 : -26.5, 0.05);
      if (s === sd) { if (s > 0) hi += at * 1.3; else lo -= at * 1.3; }
      var x0 = Math.round(lo), w = Math.round(hi - lo) + 1;
      p.rrect(x0, 52, w, GROUND - 52, 3, 0, function (x, y, i, j) {
        var c = TIRE[1];
        if (((j + wheelFrame * 2) & 3) === 0) c = TIRE[2];
        if (i === 0 || i === w - 1) c = TIRE[0];
        if ((s > 0 && i === 1) || (s < 0 && i === w - 2)) c = TIRE[3];
        if (j >= GROUND - 52 - 2) c = TIRE[0];
        // 曲がる側は銀のホイールが見える
        if (s === sd && ((s > 0 && i >= w - 3 && i < w - 1) || (s < 0 && i <= 2 && i > 0)) && j > 2 && j < 11) c = CHR[2];
        return c;
      });
    });

    // ---- マフラーの下地 + 2 本出しマフラー (やや左寄り) ----
    var gl = X(-34, 0), gr = X(34, 0);
    p.poly([[gl, 58], [gr, 58], [gr - 4, 64], [gl + 4, 64]], MESH[0]);
    [-6.2, -1.4].forEach(function (ox) {
      var ex = X(ox, 0);
      p.disc(ex, 63.5, 2.6, 0, function (x, y, nx, ny) { return ny < -0.2 ? CHR[3] : (nx > 0.3 ? CHR[1] : CHR[2]); });
      p.disc(ex, 63.7, 1.4, TIRE[0]);
    });

    // ---- ボディ (Cピラー根元〜バンパー) ----
    for (var yy = 20; yy <= 62; yy++) {
      var hw = BODY_ROWS[yy];
      var dep = gdep(Math.min(yy, GLASS_BOT)) * 0.4;
      var l = X(-hw, dep), r = X(hw, dep);
      var ext = 0;
      if (at && yy >= 26 && yy <= 60) ext = at * 2.6 * Math.min(1, (yy - 25) / 3);
      if (sd > 0) r += ext; else l -= ext;
      for (var x = Math.round(l); x <= Math.round(r) - 1; x++) {
        var u = (x + 0.5 - X(0, dep)) / hw;
        var side = (sd > 0 && u > 1) || (sd < 0 && u < -1);
        var lv;
        if (yy <= 25) lv = 3.4; else if (yy <= 29) lv = 3.0; else if (yy <= 40) lv = 2.4; else if (yy <= 54) lv = 2.1; else lv = 1.4;
        var au = Math.abs(u);
        // 丸いヒップの陰影と空の映り込み
        if (au > 0.8) lv -= (au - 0.8) * 7;
        if (au > 0.68 && au < 0.84 && yy >= 30 && yy <= 48) lv += (u < 0 ? 2.4 : 1.6) * (1 - Math.abs(yy - 38) / 11);
        if (yy === 55 || yy === 56) lv += 1.0;   // バンパーの角の照り
        if (side) lv = yy < 34 ? 2.8 : (yy < 52 ? 1.8 : 1);
        p.set(x, yy, shade(lv, x, yy));
      }
    }
    // フェンダーの鋭いハイライト (写真の反射)
    p.line(X(-37, 0), 33, X(-36, 0), 46, BODY[6]);
    p.line(X(-36, 0), 33, X(-35, 0), 45, BODY[5]);
    p.line(X(36, 0), 33, X(37, 0), 46, BODY[6]);
    p.line(X(35, 0), 34, X(36, 0), 45, BODY[5]);

    // ---- 左右の大きなダイヤ柄メッシュ (バンパーに埋め込み, 内側が少し下がる) ----
    sym(function (s) {
      var pts = [[X(s * 28, 0), MESH_Y - 0.5], [X(s * 3.5, 0), MESH_Y + 1.5], [X(s * 3.5, 0), MESH_Y + 8.5], [X(s * 26, 0), MESH_Y + 6.5]];
      p.poly(pts, 0, function (x, y) {
        var dia = ((x + y) & 3) === 0 || ((x - y + 400) & 3) === 0;
        return dia ? (y < MESH_Y + 3 ? MESH[3] : MESH[2]) : MESH[1];
      });
    });

    // ---- くぼみの上の折れ線 (光を拾う) ----
    p.hline(X(-30, 0), X(30, 0) - 1, REC_Y - 1, BODY[3]);
    p.hline(X(-26, 0), X(-8, 0), REC_Y - 1, BODY[4]);
    // ---- ナンバーのくぼみ + ナンバープレート (くぼみの上寄り, やや左) ----
    var rl = Math.round(X(-27, 0)), rw = Math.round(X(27, 0)) - rl;
    p.rrect(rl, REC_Y, rw, 12, 4, 0, function (x, y, i, j) { return j === 0 ? BODY[0] : (j === 11 ? BODY[3] : (j < 3 ? BODY[1] : BODY[2])); });
    var pw = 19, ph = 9, px0 = Math.round(X(-11.5, 0)), py0 = REC_Y + 1;
    p.rect(px0, py0, pw, ph, PLATE);
    p.hline(px0, px0 + pw - 1, py0 + ph - 1, PLATE_D);
    p.set(px0 + 1, py0 + 1, CHR[1]); p.set(px0 + pw - 2, py0 + 1, CHR[1]);       // ボルト
    p.hline(px0 + 4, px0 + 7, py0 + 1, PLATE_G); p.hline(px0 + 9, px0 + 11, py0 + 1, PLATE_G);
    p.set(px0 + 2, py0 + 4, PLATE_G); p.set(px0 + 2, py0 + 5, PLATE_G);
    for (var d = 0; d < 4; d++) {
      var dx = px0 + 4 + d * 3 + (d >= 2 ? 1 : 0);
      p.vline(dx, py0 + 3, py0 + 7, PLATE_G); p.vline(dx + 1, py0 + 3, py0 + 7, PLATE_G);
    }
    p.set(px0 + 10, py0 + 5, PLATE_G);

    // ---- サイドミラー (楕円の黒) ----
    sym(function (s) {
      var stx = X(s * 30, 0.55);
      p.rect(Math.round(s < 0 ? stx - 3 : stx), 22, 4, 2, BODY[1]);
      var mx = X(s * 34.5, 0.55), w = 8, x0 = Math.round(mx - w / 2);
      p.rrect(x0, 19, w, 6, 3, 0, function (x, y, i, j) {
        if (j < 2) return BODY[4];
        if ((s < 0 && i === 1 && j < 5) || (s > 0 && i === w - 2 && j < 5)) return BODY[5];
        return j < 5 ? BODY[2] : BODY[1];
      });
    });

    // ---- ルーフとピラー (ガラスの外枠) ----
    var poly = [], y2;
    function gx(y, s) { return X(s * GLASS_ROWS[y], gdep(y)); }
    function frameW(y) { return y <= ROOF_Y ? 19 : GLASS_ROWS[y] + 2.2; }   // 丸いルーフの角
    for (y2 = ROOF_Y; y2 <= WING_Y + 2; y2++) poly.push([X(-frameW(y2), gdep(y2)), y2]);
    for (y2 = WING_Y + 2; y2 >= ROOF_Y; y2--) poly.push([X(frameW(y2), gdep(y2)), y2]);
    p.poly(poly, 0, function (x, y) {
      if (y <= ROOF_Y + 1) return y === ROOF_Y ? BODY[3] : BODY[2];   // つや消しのルーフ
      return x > X(0, gdep(y)) ? BODY[1] : BODY[3];
    });
    // ルーフ後端の明るいグレーのフィン
    sym(function (s) {
      var nx = Math.round(X(s * 14.5, 0.95));
      p.rrect(nx - 2, ROOF_Y - 2, 5, 3, 1, CHR[2]);
      p.hline(nx - 1, nx + 1, ROOF_Y - 2, CHR[3]);
      p.set(nx + (s > 0 ? 2 : -2), ROOF_Y, CHR[1]);
    });

    // ---- ガラスハッチ ----
    poly = [];
    for (y2 = ROOF_Y + 1; y2 <= GLASS_BOT; y2++) poly.push([gx(y2, -1), y2]);
    for (y2 = GLASS_BOT; y2 >= ROOF_Y + 1; y2--) poly.push([gx(y2, 1), y2]);
    p.poly(poly, 0, function (x, y) {
      var cl = gx(y, -1), cr = gx(y, 1), u = (x + 0.5 - cl) / (cr - cl);
      if (y < WING_Y) {
        // 上段: 濃いガラス越しの車内 + 空の映り込み
        var lv = 1.3 + (WING_Y - y) * 0.2 - Math.abs(u - 0.45) * 0.8, li = Math.floor(lv);
        if (G.dither(x, y, lv - li)) li++;
        var c = GLS[G.clamp(li, 0, 5)];
        var dg = u * 30 + (y - ROOF_Y) * 1.6;
        if (dg > 19 && dg < 21.5) c = GLS[5];
        else if (dg > 23 && dg < 24) c = GLS[4];
        // 座席の背もたれのシルエット
        if (y >= WING_Y - 4 && ((u > 0.18 && u < 0.42) || (u > 0.58 && u < 0.82))) c = GLS[0];
        return c;
      }
      if (y <= WING_Y + 2) return 0;  // ウイングは後で描く
      // 下段: ランプの間のガラス越しにエンジンフードのルーバー
      var c2 = ((y - WING_Y) & 1) ? LOUVER[1] : LOUVER[0];
      if (((y - WING_Y) & 1) && Math.round(x - X(0, 0)) % 6 === 0) c2 = LOUVER[0];
      if (y === WING_Y + 3) c2 = GLS[2];
      if (u < 0.08 || u > 0.92) c2 = GLS[1];
      if (u > 0.12 && u < 0.17 && y < GLASS_BOT - 1) c2 = GLS[3];   // 映り込み
      if (y === GLASS_BOT) c2 = GLS[0];
      return c2;
    });
    // ---- 黒いウイング + 赤いハイマウントストップランプ ----
    for (y2 = WING_Y; y2 <= WING_Y + 2; y2++) {
      var ww = GLASS_ROWS[WING_Y - 1] + 2 - (y2 - WING_Y) * 1.2;
      p.hline(X(-ww, gdep(y2)), X(ww, gdep(y2)) - 1, y2, y2 === WING_Y ? BODY[4] : (y2 === WING_Y + 1 ? BODY[2] : BODY[1]));
    }
    var hb = brake ? LAMP_ON : LAMP_OFF;
    p.hline(X(-10, gdep(WING_Y + 1)), X(10, gdep(WING_Y + 1)) - 1, WING_Y + 1, hb[1]);
    p.hline(X(-9, gdep(WING_Y + 1)), X(9, gdep(WING_Y + 1)) - 1, WING_Y + 1, brake ? hb[3] : hb[2]);
    if (brake) p.hline(X(-8, gdep(WING_Y)), X(8, gdep(WING_Y)) - 1, WING_Y, hb[1]);

    // ---- テールランプ (下段ガラスの両脇, クローム枠に 赤・ベージュ・赤) ----
    sym(function (s) {
      // 内側ほど少し下がる (ガラスの縁に沿う)
      var lamps = [[s * 33.5, 'red', -1.0], [s * 27, 'beige', -0.4], [s * 20.5, 'red', 0.3]];
      lamps.forEach(function (L) { p.disc(X(L[0], 0), LAMP_Y + L[2] + 0.2, 4.3, CHR[1]); });
      lamps.forEach(function (L) { p.disc(X(L[0], 0), LAMP_Y + L[2], 3.9, 0, function (x, y, nx, ny) { return ny < -0.3 ? CHR[3] : CHR[2]; }); });
      lamps.forEach(function (L) {
        var cx = X(L[0], 0), cy = LAMP_Y + L[2] + 0.4, rr = 3.3;
        var ramp = L[1] === 'beige' ? BEIGE : (brake ? LAMP_ON : LAMP_OFF);
        p.disc(cx, cy, rr, 0, function (x, y, nx, ny) {
          return G.shadeRamp(ramp, nx, ny, x, y, -0.5, -0.8, (brake && L[1] === 'red') ? 0.3 : 0);
        });
        p.set(Math.round(cx - 1.3), Math.round(cy - 1.6), ramp[3]);
      });
    });

    // ---- ガラス下の黒い帯: 小さなエンブレム / smart ロゴ / BRABUS ----
    var lx = Math.round(X(-3, 0));
    p.hline(lx, lx + 5, BADGE_Y, CHR[2]);
    p.set(lx + 1, BADGE_Y + 1, CHR[1]); p.set(lx + 3, BADGE_Y + 1, CHR[1]); p.set(lx + 5, BADGE_Y + 1, CHR[1]);
    var bx = Math.round(X(9, 0));
    p.hline(bx, bx + 3, BADGE_Y + 1, CHR[3]); p.hline(bx, bx + 3, BADGE_Y + 2, CHR[0]);
    var kx = Math.round(X(-13, 0));
    p.hline(kx, kx + 1, BADGE_Y, CHR[1]);

    // ---- ルーフのアクションカメラ (吸盤マウント) ----
    var cmx = Math.round(X(-3, 1.0));
    p.rect(cmx - 2, ROOF_Y - 1, 5, 1, BODY[3]);         // 吸盤
    p.vline(cmx, ROOF_Y - 5, ROOF_Y - 2, BODY[4]);       // アーム
    p.rect(cmx - 2, ROOF_Y - 9, 5, 4, BODY[1]);          // カメラ本体
    p.set(cmx - 1, ROOF_Y - 9, BODY[5]); p.set(cmx + 2, ROOF_Y - 8, BODY[0]);

    // ---- 輪郭 ----
    var sh = [];
    for (var q = 0; q < p.d.length; q++) if (p.d[q] === SHADOW) { sh.push(q); p.d[q] = 0; }
    p.outline(OUT, false);
    for (q = 0; q < sh.length; q++) if (!G.ca(p.d[sh[q]])) p.d[sh[q]] = SHADOW;

    // ---- ブレーキグロー ----
    if (brake) {
      sym(function (s) {
        [[33.5, -1.0], [20.5, 0.3]].forEach(function (lp) {
          var cx = X(s * lp[0], 0), cy = LAMP_Y + lp[1] + 0.4;
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
