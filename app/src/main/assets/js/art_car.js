'use strict';
// ============================================================
//  art_car.js  自車: smart roadster-coupé (赤) の後ろ姿をドット絵で生成
//   真後ろからの実車写真で比率を測って構成 (上から順に):
//   - 黒いルーフと後端のグレーのフィン
//   - 大きなガラスハッチ: 上段は車内 (ヘッドレスト) が透ける濃いガラス,
//     中央を黒いウイングが横切り, その中に赤いハイマウントストップランプ
//   - 下段のガラスは左右のテールランプの間まで下がる
//   - テールランプはガラスの下の角: クローム枠に 赤・ベージュ・赤 の三連丸
//   - ランプの間に smart ロゴと roadster coupé のエンブレム
//   - 丸く張り出したリアフェンダー, グレーのバンパーインサートとナンバー
//   - 下部は黒いハニカムメッシュ, 中央にマフラー 1 本
//  turn(-2..2) ごとに奥行きずらしで曲がっている姿を作る
//
//  形は「設計座標」(写真から測った値: 車幅 84, 地面 y=68) で持ち, 描くときに縮める。
//  大きさは他車に合わせる: 他車の普通車 (セダン) が 86px なので, 自車は軽自動車と同じ 74px 前後
// ============================================================
(function () {
  var C = G.col;
  function pal(a) { return a.map(function (h) { return C(h); }); }
  // 赤いボディ: 暗→明
  var BODY = pal(['#2a0408', '#560a12', '#8a111b', '#bb1d27', '#e0353d', '#ff6b64', '#ffb6aa']);
  var BLK = pal(['#030306', '#0b0c12', '#15171f', '#22252f', '#353a48', '#5a6274']);   // ルーフ・ピラー・ウイング
  var GLS = pal(['#04060c', '#0a101c', '#141e31', '#22324e', '#4a6590', '#90acd6']);
  var GREY = pal(['#4a4c50', '#6e7176', '#8f9297', '#adb0b4', '#cbcdd0']);   // バンパーインサート
  var CHR = pal(['#4c525e', '#8c95a4', '#c6ccd6', '#eef2f6']);
  var TIRE = pal(['#08080b', '#15151b', '#23232b', '#34343e']);
  var LAMP_OFF = pal(['#4a0810', '#951620', '#d02c38', '#ff8088']);
  var LAMP_ON = pal(['#c01020', '#ff3434', '#ff9c84', '#fff4e8']);
  var BEIGE = pal(['#5a4026', '#9c7850', '#d6b488', '#f6e6cc']);   // 中央のクリアレンズ
  var PLATE = C('#f2f2ea'), PLATE_D = C('#c4c4b6'), PLATE_G = C('#1a5a30');
  var MESH = pal(['#020204', '#0e1015', '#262a32']);
  var OUT = C('#120306');
  var SHADOW = G.rgba(0, 0, 0, 105);

  // 縮尺: 設計座標 1 あたりの px。横は写真の比率より 12% ワイド
  var K = 0.78, WIDE = 1.12, SX = K * WIDE;
  var W = 92, H = 56, CX = W / 2, GROUND = 53;
  function Y(yd) { return GROUND - (68 - yd) * K; }        // 設計 y → 画面 y
  function YD(y) { return 68 - (GROUND - y) / K; }         // 画面 y → 設計 y
  // 車体の幅 (当たり判定用) と後輪の中心
  G.CAR_BODY_W = 2 * 42 * SX;
  G.CAR_TIRE_X = 33.5 * SX;

  // 画面の行 (上から)
  var ROOF_Y = 9;       // ルーフ上端
  var WING_Y = 16;      // 黒いウイング (ハイマウントストップランプ) 2 行
  var GLASS_BOT = 23;   // 下段ガラスの下端 (テールランプの間)
  var LAMP_Y = 24.7;    // テールランプの中心
  var BADGE_Y = 26;     // smart ロゴの行
  var INS_Y = 30;       // グレーのインサート上端
  var INS_B = 43;       // インサート下端
  var TIRE_Y = 41;      // 後輪の上端
  var MESH_Y = 44;      // 下のメッシュ

  // 設計 y に対する半幅の表 (区間で直線補間, 範囲外は端の値)
  function interp(tbl) {
    return function (y) {
      if (y <= tbl[0][0]) return tbl[0][1];
      for (var i = 0; i < tbl.length - 1; i++) {
        var a = tbl[i], b = tbl[i + 1];
        if (y <= b[0]) return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
      }
      return tbl[tbl.length - 1][1];
    };
  }
  // ボディ外形の半幅 (Cピラー根元〜バンパー下端)
  var BODY_HW = interp([[20, 32], [24, 33.5], [26, 35], [28, 36.5], [30, 38.5], [32, 40], [35, 41.3], [38, 42], [52, 42],
    [55, 41.2], [58, 39.5], [60, 37.5], [61, 35.5], [62, 32.5]]);
  // ガラスの半幅: 上段 (ルーフ〜ウイング) は下ほど広く, ランプの上端でランプの間の幅まで絞られる
  var GLASS_HW = interp([[13, 21.5], [14, 24], [16, 26.3], [17, 27.6], [21, 29.6], [25, 29], [27, 23], [28, 17.5], [30, 16]]);

  function drawCar(t, wheelFrame, brake) {
    var p = new G.PX(W, H);
    var at = Math.abs(t), sd = G.sign(t);
    var KD = 3.2 * K; // 奥行き 1.0 あたりの横ずれ(px)
    function X(x, depth) { return CX + x * SX * (1 - 0.02 * at) + t * KD * (depth || 0) - t * 1.2 * K; }
    function sym(fn) { fn(-1); fn(1); }
    function shade(lv, x, y) {
      var li = Math.floor(lv), f = lv - li;
      if (f > 0.3 && f < 0.7 && G.dither(x, y, f)) li++; else if (f >= 0.7) li++;
      return BODY[G.clamp(li, 0, BODY.length - 1)];
    }
    function gdep(yd) { return G.clamp(0.95 - 0.95 * (yd - 12) / 18, 0, 1); }   // ルーフほど奥

    // ---- 影 ----
    p.ellipse(CX + t * 1.2 * K, GROUND - 1, 47 * SX, 3.4, SHADOW);

    // ---- 前輪 (曲がっている時に外側から見える) ----
    if (at > 0) {
      var fx = X(sd * 38, 1.0), fw = 2 + at;
      for (var y = GROUND - 10; y < GROUND - 1; y++) {
        for (var i = 0; i < fw; i++) {
          var c = i >= fw - 1 ? CHR[1] : TIRE[1];
          if (((y + wheelFrame * 2) & 3) === 0 && i > 0 && i < fw - 1) c = TIRE[3];
          p.set(Math.round(fx + sd * i), y, c);
        }
      }
    }

    // ---- 後輪 (太いタイヤ) ----
    sym(function (s) {
      var lo = X(s > 0 ? 26.5 : -41, 0.05), hi = X(s > 0 ? 41 : -26.5, 0.05);
      if (s === sd) { if (s > 0) hi += at; else lo -= at; }
      var x0 = Math.round(lo), w = Math.round(hi - lo) + 1, h = GROUND - TIRE_Y;
      p.rrect(x0, TIRE_Y, w, h, 2, 0, function (x, y, i, j) {
        var c = TIRE[1];
        if (((j + wheelFrame * 2) & 3) === 0) c = TIRE[2];
        if (i === 0 || i === w - 1) c = TIRE[0];
        if ((s > 0 && i === 1) || (s < 0 && i === w - 2)) c = TIRE[3];
        if (j >= h - 2) c = TIRE[0];
        if (s === sd && ((s > 0 && i >= w - 3 && i < w - 1) || (s < 0 && i <= 2 && i > 0)) && j > 1 && j < 9) c = CHR[2];
        return c;
      });
    });

    // ---- 下部の黒いエリア + 中央のマフラー ----
    p.poly([[X(-33, 0), MESH_Y], [X(33, 0), MESH_Y], [X(29, 0), MESH_Y + 5], [X(-29, 0), MESH_Y + 5]], MESH[0]);
    var ex = X(0, 0), ey = MESH_Y + 4.6;
    p.ellipse(ex, ey, 1.9, 1.3, CHR[2]);
    p.set(Math.round(ex) - 1, Math.floor(ey) - 1, CHR[3]);
    p.ellipse(ex, ey + 0.2, 0.9, 0.7, TIRE[0]);

    // ---- ボディ (Cピラー根元〜バンパー) ----
    for (var yy = Math.round(Y(20)); yy <= Math.round(Y(62)); yy++) {
      var yd = YD(yy), hw = BODY_HW(yd);
      var dep = gdep(Math.min(yd, 30)) * 0.4;
      var l = X(-hw, dep), r = X(hw, dep);
      var ext = 0;
      if (at && yd >= 26 && yd <= 60) ext = at * 2.0 * Math.min(1, (yd - 25) / 3);
      if (sd > 0) r += ext; else l -= ext;
      for (var x = Math.round(l); x <= Math.round(r) - 1; x++) {
        var u = (x + 0.5 - X(0, dep)) / (hw * SX);
        var side = (sd > 0 && u > 1) || (sd < 0 && u < -1);
        var lv;
        if (yd <= 25) lv = 4.2; else if (yd <= 29) lv = 3.8; else if (yd <= 40) lv = 3.2; else if (yd <= 54) lv = 2.8; else lv = 2.0;
        var au = Math.abs(u);
        // 丸いヒップの陰影と映り込み
        if (au > 0.8) lv -= (au - 0.8) * 8;
        if (au > 0.68 && au < 0.84 && yd >= 30 && yd <= 48) lv += (u < 0 ? 2.0 : 1.3) * (1 - Math.abs(yd - 38) / 11);
        if (yy === INS_Y - 1) lv += 0.8;   // インサート上の面の照り
        if (yd >= 59) lv -= 0.8;           // 下端の影
        if (side) lv = yd < 34 ? 3.2 : (yd < 52 ? 2.2 : 1.4);
        p.set(x, yy, shade(lv, x, yy));
      }
    }
    // フェンダーの鋭いハイライト
    p.line(X(-37, 0), Y(33), X(-36, 0), Y(46), BODY[6]);
    p.line(X(36.5, 0), Y(33), X(37.5, 0), Y(46), BODY[5]);

    // ---- グレーのバンパーインサート (角の丸い大きな板) ----
    var il = Math.round(X(-28.5, 0)), iw = Math.round(X(28.5, 0)) - il, ih = INS_B - INS_Y;
    p.rrect(il, INS_Y, iw, ih, 3, 0, function (x, y, i, j) {
      var c;
      if (j === 0) return GREY[4];
      if (j === ih - 1) return GREY[0];
      c = j < 2 ? GREY[3] : (j < ih - 3 ? GREY[2] : GREY[1]);
      if (i < 1) c = GREY[3];
      if (i >= iw - 1) c = GREY[1];
      return c;
    });
    // ナンバーが付く中央のくぼみ
    var rl = Math.round(X(-17, 0)), rw2 = Math.round(X(17, 0)) - rl;
    p.rrect(rl, INS_Y + 2, rw2, 6, 2, 0, function (x, y, i, j) { return j === 0 ? GREY[0] : (j === 5 ? GREY[3] : GREY[1]); });
    // 下のハニカムメッシュ (インサートの下)
    sym(function (s) {
      var a = Math.round(X(s * 2.5, 0)), b = Math.round(X(s * 22, 0));
      var lo = Math.min(a, b), hi = Math.max(a, b);
      for (var my = MESH_Y; my <= MESH_Y + 3; my++) for (var mx = lo; mx <= hi; mx++) {
        p.set(mx, my, ((mx + (my & 1)) & 1) ? MESH[2] : MESH[1]);
      }
    });

    // ---- ナンバープレート (中央, インサートの上端にかかる) ----
    var pw = 15, ph = 7, px0 = Math.round(X(0, 0) - pw / 2), py0 = INS_Y - 1;
    p.rect(px0 - 1, py0 - 1, pw + 2, ph + 2, GREY[0]);
    p.rect(px0, py0, pw, ph, PLATE);
    p.hline(px0, px0 + pw - 1, py0 + ph - 1, PLATE_D);
    p.hline(px0 + 4, px0 + 6, py0 + 1, PLATE_G); p.hline(px0 + 8, px0 + 10, py0 + 1, PLATE_G);
    [2, 5, 9, 12].forEach(function (dx) { p.rect(px0 + dx, py0 + 3, 2, 3, PLATE_G); });
    p.hline(px0 + 7, px0 + 8, py0 + 4, PLATE_G);

    // ---- サイドミラー (ボディ色の小さな楕円) ----
    sym(function (s) {
      var stx = X(s * 30, 0.55);
      p.rect(Math.round(s < 0 ? stx - 2 : stx), 17, 3, 2, BLK[1]);
      var mx = X(s * 34.5, 0.55), w = 6, x0 = Math.round(mx - w / 2);
      p.rrect(x0, 14, w, 5, 2, 0, function (x, y, i, j) {
        if (j < 1) return BODY[5];
        if ((s < 0 && i === 1 && j < 4) || (s > 0 && i === w - 2 && j < 4)) return BODY[6];
        return j < 4 ? BODY[3] : BODY[2];
      });
    });

    // ---- 黒いルーフとピラー (ガラスの外枠) ----
    var poly = [], y2;
    function gx(y, s) { var d = YD(y); return X(s * GLASS_HW(d), gdep(d)); }
    function frameW(y) { return y <= ROOF_Y ? 19 : GLASS_HW(YD(y)) + 2.4; }
    for (y2 = ROOF_Y; y2 <= WING_Y + 2; y2++) poly.push([X(-frameW(y2), gdep(YD(y2))), y2]);
    for (y2 = WING_Y + 2; y2 >= ROOF_Y; y2--) poly.push([X(frameW(y2), gdep(YD(y2))), y2]);
    p.poly(poly, 0, function (x, y) {
      if (y <= ROOF_Y + 1) return y === ROOF_Y ? BLK[4] : BLK[3];
      return x > X(0, gdep(YD(y))) ? BLK[1] : BLK[3];
    });
    // ルーフ後端のグレーのフィン
    sym(function (s) {
      var nx = Math.round(X(s * 14.5, 0.95));
      p.rrect(nx - 2, ROOF_Y - 2, 4, 3, 1, GREY[3]);
      p.hline(nx - 1, nx, ROOF_Y - 2, GREY[4]);
    });

    // ---- ガラスハッチ ----
    poly = [];
    for (y2 = ROOF_Y + 1; y2 <= GLASS_BOT; y2++) poly.push([gx(y2, -1), y2]);
    for (y2 = GLASS_BOT; y2 >= ROOF_Y + 1; y2--) poly.push([gx(y2, 1), y2]);
    p.poly(poly, 0, function (x, y) {
      var cl = gx(y, -1), cr = gx(y, 1), u = (x + 0.5 - cl) / (cr - cl);
      if (y < WING_Y) {
        var lv = 1.3 + (WING_Y - y) * 0.26 - Math.abs(u - 0.45) * 0.8, li = Math.floor(lv);
        if (G.dither(x, y, lv - li)) li++;
        var c = GLS[G.clamp(li, 0, 5)];
        var dg = u * 24 + (y - ROOF_Y) * 1.6;
        if (dg > 15 && dg < 17.2) c = GLS[5];
        else if (dg > 18.6 && dg < 19.6) c = GLS[4];
        // ヘッドレストのシルエット
        if (y >= WING_Y - 4 && ((u > 0.2 && u < 0.4) || (u > 0.6 && u < 0.8))) c = GLS[0];
        return c;
      }
      if (y <= WING_Y + 1) return 0;
      // 下段: ランプの間のガラス (空の映り込み)
      var c2 = GLS[1];
      if (y >= WING_Y + 3 && y <= WING_Y + 4 && u > 0.12 && u < 0.88) c2 = (G.dither(x, y, 0.5) ? GLS[4] : GLS[3]);
      if (y === WING_Y + 4 && u > 0.2 && u < 0.8) c2 = GLS[5];
      if (y === GLASS_BOT) c2 = GLS[0];
      return c2;
    });
    // ---- 黒いウイング + 赤いハイマウントストップランプ ----
    for (y2 = WING_Y; y2 <= WING_Y + 1; y2++) {
      var ww = GLASS_HW(19) + 2 - (y2 - WING_Y) * 1.2, wd = gdep(YD(y2));
      p.hline(X(-ww, wd), X(ww, wd) - 1, y2, y2 === WING_Y ? BLK[4] : BLK[2]);
    }
    var hb = brake ? LAMP_ON : LAMP_OFF, hd = gdep(YD(WING_Y + 1));
    p.hline(X(-8, hd), X(8, hd) - 1, WING_Y + 1, hb[1]);
    p.hline(X(-6.5, hd), X(6.5, hd) - 1, WING_Y + 1, brake ? hb[3] : hb[2]);
    if (brake) p.hline(X(-6, gdep(YD(WING_Y))), X(6, gdep(YD(WING_Y))) - 1, WING_Y, hb[1]);

    // ---- テールランプ (ガラスの下の角, クローム枠に 赤・ベージュ・赤) ----
    sym(function (s) {
      var lamps = [[s * 33.5, 'red', -0.8], [s * 27, 'beige', -0.3], [s * 20.5, 'red', 0.2]];
      lamps.forEach(function (L) { p.disc(X(L[0], 0), LAMP_Y + L[2] + 0.2, 3.4, CHR[1]); });
      lamps.forEach(function (L) { p.disc(X(L[0], 0), LAMP_Y + L[2], 3.0, 0, function (x, y, nx, ny) { return ny < -0.3 ? CHR[3] : CHR[2]; }); });
      lamps.forEach(function (L) {
        var cx = X(L[0], 0), cy = LAMP_Y + L[2] + 0.3, rr = 2.5;
        var ramp = L[1] === 'beige' ? BEIGE : (brake ? LAMP_ON : LAMP_OFF);
        p.disc(cx, cy, rr, 0, function (x, y, nx, ny) {
          return G.shadeRamp(ramp, nx, ny, x, y, -0.5, -0.8, (brake && L[1] === 'red') ? 0.3 : 0);
        });
        p.set(Math.round(cx - 1), Math.round(cy - 1.2), ramp[3]);
      });
    });

    // ---- ランプの間: smart ロゴ / roadster coupé のエンブレム ----
    var lx = Math.round(X(-2.5, 0));
    p.hline(lx, lx + 4, BADGE_Y, CHR[3]);
    p.set(lx + 1, BADGE_Y + 1, CHR[2]); p.set(lx + 3, BADGE_Y + 1, CHR[2]);
    var bx = Math.round(X(8.5, 0));
    p.hline(bx, bx + 3, BADGE_Y + 1, CHR[2]); p.set(bx + 1, BADGE_Y, CHR[2]);

    // ---- 輪郭 ----
    var sh = [];
    for (var q = 0; q < p.d.length; q++) if (p.d[q] === SHADOW) { sh.push(q); p.d[q] = 0; }
    p.outline(OUT, false);
    for (q = 0; q < sh.length; q++) if (!G.ca(p.d[sh[q]])) p.d[sh[q]] = SHADOW;

    // ---- ブレーキグロー ----
    if (brake) {
      sym(function (s) {
        [[33.5, -0.8], [20.5, 0.2]].forEach(function (lp) {
          var cx = X(s * lp[0], 0), cy = LAMP_Y + lp[1] + 0.3;
          p.disc(cx, cy, 4.8, 0, function (x, y, nx, ny, dd) {
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
