'use strict';
// ============================================================
//  art_traffic.js  他車 (後ろ姿) のドット絵を生成
//  軽自動車・セダン・タクシー・トラック・バス・軽トラ など, 季節で入れ替え
// ============================================================
(function () {
  var C = G.col;
  function pal(a) { return a.map(function (h) { return C(h); }); }
  function ramp(hex) { // 単色から 5 段階の陰影
    var c = C(hex);
    return [G.darken(c, 0.62), G.darken(c, 0.38), G.darken(c, 0.12), c, G.lighten(c, 0.35)];
  }
  var GLS = pal(['#0c1428', '#18284a', '#24406e', '#3c5e94', '#8eb0dc']);
  var TIRE = pal(['#0a0a0e', '#18181e', '#2a2a32']);
  var OUT = C('#121016');

  function vehicle(o) {
    var bw = o.bw, cx0 = Math.ceil(bw / 2) + 3;
    var totalH = 10 + o.bh + (o.ch || 0) + 6;
    var W = bw + 6, H = totalH + (o.extraTop || 0) + (o.snow ? 6 : 0), p = new G.PX(W, H);
    var g = H - 3, cx = W / 2;
    var R = ramp(o.color);
    // 影
    p.ellipse(cx, g, bw / 2 + 3, 3.2, G.rgba(0, 0, 0, 90));
    // タイヤ
    var tw = o.tireW || Math.round(bw * 0.15);
    [[cx - bw / 2 + 2, 1], [cx + bw / 2 - 2 - tw, -1]].forEach(function (t) {
      p.rrect(Math.round(t[0]), g - 13, tw, 13, 2, 0, function (x, y, i, j) {
        if (j >= 11) return TIRE[0];
        return (i === 0 || i === tw - 1) ? TIRE[0] : (j % 3 === 0 ? TIRE[2] : TIRE[1]);
      });
    });
    // 下回り
    p.rect(Math.round(cx - bw / 2 + 4), g - 12, bw - 8, 4, C('#202028'));
    // ボディ下部
    var by0 = g - 9 - o.bh, by1 = g - 9;
    p.rrect(Math.round(cx - bw / 2), by0, bw, o.bh, o.round || 3, 0, function (x, y, i, j) {
      var v = j / o.bh, lv = v < 0.12 ? 4 : (v < 0.55 ? 3 : (v < 0.85 ? 2 : 1));
      if (i < 2) lv = Math.min(4, lv + 1);
      if (i >= bw - 2) lv = Math.max(0, lv - 1);
      return R[lv];
    });
    // バンパー
    var bumpH = o.bumpH || 5;
    p.rect(Math.round(cx - bw / 2 + 1), by1 - bumpH, bw - 2, bumpH, o.bumper ? C(o.bumper) : R[1]);
    p.hline(cx - bw / 2 + 1, cx + bw / 2 - 2, by1 - bumpH, o.bumper ? G.lighten(C(o.bumper), 0.3) : R[2]);
    // ナンバー
    var plW = 16, plY = by1 - bumpH - 8;
    if (o.plateLow) plY = by1 - bumpH + 0;
    p.rect(Math.round(cx - plW / 2) - 1, plY - 1, plW + 2, 8, C('#1a1a20'));
    p.rect(Math.round(cx - plW / 2), plY, plW, 6, C(o.kei ? '#f4e040' : '#f2f2e6'));
    var pc = C(o.kei ? '#202020' : '#1d7038');
    for (var d = 0; d < 4; d++) { p.vline(Math.round(cx - 6 + d * 4), plY + 2, plY + 4, pc); p.vline(Math.round(cx - 5 + d * 4), plY + 2, plY + 4, pc); }
    // テールランプ
    var ly = o.lightY !== undefined ? by0 + o.lightY : by0 + 3, lh = o.lightH || 7, lw = o.lightW || 8;
    [cx - bw / 2 + 2, cx + bw / 2 - 2 - lw].forEach(function (lx) {
      p.rect(Math.round(lx), ly, lw, lh, C('#9a1020'));
      p.rect(Math.round(lx) + 1, ly + 1, lw - 2, Math.max(1, lh - 3), C('#e8303c'));
      p.set(Math.round(lx) + 1, ly + 1, C('#ffb0a0'));
      if (lh > 6) p.rect(Math.round(lx) + 1, ly + lh - 2, lw - 2, 1, C('#ff9a20'));
    });
    // キャビン
    if (o.ch) {
      var cy1 = by0, cy0 = by0 - o.ch, ins = o.inset || 8, side = o.side || 3;
      var poly = [[cx - bw / 2 + side, cy1 + 1], [cx + bw / 2 - side, cy1 + 1], [cx + bw / 2 - ins, cy0], [cx - bw / 2 + ins, cy0]];
      p.poly(poly, 0, function (x, y) { return y < cy0 + 2 ? R[4] : (x < cx - bw / 2 + ins + 2 ? R[3] : R[2]); });
      // リアガラス
      var gi = (o.glassInset || 4);
      p.poly([[cx - bw / 2 + side + gi, cy1 - 1], [cx + bw / 2 - side - gi, cy1 - 1], [cx + bw / 2 - ins - gi + 1, cy0 + 3], [cx - bw / 2 + ins + gi - 1, cy0 + 3]], 0, function (x, y) {
        var t = (y - cy0) / o.ch;
        var c = GLS[t < 0.3 ? 2 : 1];
        var dg = (x - cx) + (y - cy0) * 1.2;
        if (dg > 4 && dg < 8) c = GLS[3];
        if (dg > 9 && dg < 10) c = GLS[2];
        return c;
      });
      // 乗員の頭
      if (o.heads !== false) {
        p.disc(cx + bw * 0.16, cy0 + o.ch * 0.55, 3.2, 0, function (x, y) { return y < cy1 - 1 ? C('#0a0e1a') : 0; });
        if (o.heads === 2) p.disc(cx - bw * 0.16, cy0 + o.ch * 0.58, 3.2, 0, function (x, y) { return y < cy1 - 1 ? C('#0a0e1a') : 0; });
      }
      // ハイマウント
      p.hline(cx - 4, cx + 3, cy0 + 1, C('#e8303c'));
    }
    if (o.deco) o.deco(p, { cx: cx, g: g, bw: bw, by0: by0, by1: by1, R: R, top: by0 - (o.ch || 0) });
    p.outline(OUT);
    if (o.snow) {
      // 屋根に雪
      var top = by0 - (o.ch || 0) - (o.snowOn || 0);
      var ins2 = o.ch ? (o.inset || 8) : 2;
      var x0s = Math.round(cx - bw / 2 + ins2 - 1), x1s = Math.round(cx + bw / 2 - ins2);
      for (var x = x0s; x <= x1s; x++) {
        var e = Math.min(x - x0s, x1s - x);
        var hh = Math.min(4, 1 + e) - ((x * 7) % 5 === 0 ? 1 : 0);
        for (var y = 0; y < hh; y++) p.set(x, top - 1 - y, y === hh - 1 ? C('#ffffff') : (y === 0 ? C('#c8d4ec') : C('#e8eefa')));
      }
      p.outline(C('#7a88b0'));
    }
    return p.trim();
  }

  var DEFS = {
    kei: function (col, snow) { return vehicle({ bw: 74, bh: 30, ch: 36, inset: 5, side: 2, color: col, kei: true, lightH: 14, lightW: 6, lightY: 2, bumper: '#3a3a44', snow: snow, heads: 1 }); },
    sedan: function (col, snow) { return vehicle({ bw: 86, bh: 24, ch: 22, inset: 13, side: 4, color: col, lightH: 6, lightW: 14, bumper: col, snow: snow, heads: 2 }); },
    taxi: function (col, snow) {
      return vehicle({
        bw: 86, bh: 24, ch: 22, inset: 13, side: 4, color: col, lightH: 6, lightW: 14, snow: snow, extraTop: 6, heads: 1,
        deco: function (p, k) { // 行灯
          p.rrect(Math.round(k.cx - 7), k.top - 6, 14, 6, 2, C('#ffe680'));
          p.hline(k.cx - 5, k.cx + 4, k.top - 4, C('#c04020'));
        }
      });
    },
    van: function (col, snow, boards) {
      return vehicle({
        bw: 84, bh: 30, ch: 34, inset: 6, side: 3, color: col, lightH: 16, lightW: 6, lightY: 1, bumper: '#3a3a44', snow: snow, extraTop: boards || snow === 'ski' ? 6 : 0, heads: 2,
        deco: function (p, k) {
          if (boards) {
            p.rect(Math.round(k.cx - 34), k.top - 2, 68, 2, C('#303038'));
            [['#ff6a3a', -24], ['#30b0e8', 0], ['#f8d030', 24]].forEach(function (b) { p.rrect(Math.round(k.cx + b[1] - 10), k.top - 6, 20, 4, 2, C(b[0])); });
          }
        }
      });
    },
    truck: function (col, snow) {
      return vehicle({
        bw: 112, bh: 92, ch: 0, color: col, round: 1, lightH: 7, lightW: 14, lightY: 80, bumper: '#2a2a32', bumpH: 6, snow: snow, plateLow: true,
        deco: function (p, k) {
          // 荷台の扉
          p.vline(Math.round(k.cx), k.by0 + 2, k.by1 - 8, k.R[1]);
          p.vline(Math.round(k.cx) + 1, k.by0 + 2, k.by1 - 8, k.R[4]);
          [k.cx - 20, k.cx + 18].forEach(function (x) { p.rect(Math.round(x), k.by0 + 30, 3, 26, C('#8890a0')); p.vline(Math.round(x), k.by0 + 30, k.by0 + 55, C('#c8d0dc')); });
          p.hline(k.cx - k.bw / 2 + 2, k.cx + k.bw / 2 - 3, k.by0 + 3, k.R[4]);
          p.rect(Math.round(k.cx - k.bw / 2 + 2), k.by1 - 22, k.bw - 4, 2, C('#e8b020'));
        }
      });
    },
    bus: function (col, snow) {
      return vehicle({
        bw: 122, bh: 104, ch: 0, color: col, round: 4, lightH: 22, lightW: 7, lightY: 60, bumper: '#2a2a32', bumpH: 8, snow: snow, plateLow: true,
        deco: function (p, k) {
          // 後部窓と行先表示
          p.rect(Math.round(k.cx - 46), k.by0 + 8, 92, 34, GLS[1]);
          p.rect(Math.round(k.cx - 46), k.by0 + 8, 92, 3, GLS[3]);
          p.rect(Math.round(k.cx - 26), k.by0 + 2, 52, 5, C('#101010'));
          p.hline(k.cx - 22, k.cx + 18, k.by0 + 4, C('#ffb020'));
          // ストライプ
          p.rect(Math.round(k.cx - k.bw / 2 + 1), k.by0 + 48, k.bw - 2, 5, C('#ffffff'));
          p.rect(Math.round(k.cx - k.bw / 2 + 1), k.by0 + 53, k.bw - 2, 3, C('#2a6ad8'));
          // エンジングリル
          for (var y = k.by0 + 62; y < k.by0 + 82; y += 3) p.hline(k.cx - 30, k.cx + 29, y, k.R[1]);
        }
      });
    },
    keitora: function (col, snow, cargo) {
      return vehicle({
        bw: 74, bh: 24, ch: 0, color: col, lightH: 6, lightW: 8, lightY: 14, kei: true, bumper: '#3a3a44', extraTop: 30, snow: false,
        deco: function (p, k) {
          // キャブ (前方, 少し上に見える)
          var cy = k.by0 - 26;
          p.rrect(Math.round(k.cx - 32), cy, 64, 26, 3, 0, function (x, y, i, j) { return j < 3 ? k.R[4] : k.R[2]; });
          p.rect(Math.round(k.cx - 26), cy + 4, 52, 14, GLS[1]);
          p.disc(k.cx + 10, cy + 12, 3.5, C('#0a0e1a'));
          if (snow) for (var x = k.cx - 30; x < k.cx + 30; x++) p.set(Math.round(x), cy - 1, C('#ffffff'));
          // 荷台のあおり
          p.rect(Math.round(k.cx - 36), k.by0, 72, 3, k.R[4]);
          // 荷物
          var r = G.rng(3);
          for (var i = 0; i < 9; i++) {
            var bx = k.cx - 28 + (i % 5) * 14 + (i >= 5 ? 7 : 0), byy = k.by0 - 4 - (i >= 5 ? 7 : 0);
            if (cargo === 'suika') {
              p.disc(bx, byy, 6, 0, function (xx, yy, nx, ny) { return (Math.floor((nx + 1) * 4) % 2) ? C('#1e6a24') : C('#3c9a34'); });
            } else if (cargo === 'kabocha') {
              p.disc(bx, byy, 6, 0, function (xx, yy, nx, ny) { return nx < -0.3 ? C('#ffb040') : (Math.abs(nx) < 0.15 ? C('#c86010') : C('#f08a20')); });
              p.set(Math.round(bx), Math.round(byy - 6), C('#3a6a20'));
            } else if (cargo === 'hay') {
              p.rect(Math.round(bx - 6), Math.round(byy - 5), 12, 10, C('#d8b048')); p.hline(bx - 6, bx + 5, byy, C('#a07a28'));
            } else {
              p.rect(Math.round(bx - 6), Math.round(byy - 5), 12, 10, C('#c8a070')); p.hline(bx - 6, bx + 5, byy - 5, C('#e0c090'));
            }
          }
        }
      });
    },
    beetle: function (col, snow) {
      return vehicle({
        bw: 76, bh: 22, ch: 24, inset: 16, side: 5, color: col, round: 7, lightH: 9, lightW: 7, lightY: 2, bumper: '#c8c8d0', snow: snow, heads: 2,
        deco: function (p, k) {
          for (var y = k.by0 + 2; y < k.by0 + 7; y += 2) p.hline(k.cx - 8, k.cx + 7, y, k.R[1]);
        }
      });
    }
  };

  // 季節ごとの交通 (重み付き)
  var SETS = [
    [['kei', '#f4f4f4'], ['kei', '#9ad8f0'], ['sedan', '#e8e8f0'], ['sedan', '#3060d0'], ['van', '#ffffff', 0, 1], ['van', '#f0d040', 0, 1],
      ['keitora', '#f4f4f4', 0, 'suika'], ['beetle', '#ffd030'], ['bus', '#f0f0f0'], ['truck', '#e8ecf2'], ['taxi', '#2a2a30']],
    [['kei', '#e8d8b0'], ['sedan', '#6a3a20'], ['sedan', '#2a5a3a'], ['sedan', '#c0c4cc'], ['keitora', '#f4f4f4', 0, 'kabocha'], ['keitora', '#4a7ad0', 0, 'hay'],
      ['beetle', '#e07020'], ['truck', '#d0c8b0'], ['bus', '#e8a020'], ['taxi', '#f2d23a']],
    [['kei', '#e0e8f4', 1], ['sedan', '#2a2a3a', 1], ['sedan', '#a01a1a', 1], ['van', '#3a5a3a', 1], ['van', '#d8dce4', 1], ['truck', '#e8ecf2', 1],
      ['bus', '#3a6ad0', 1], ['taxi', '#2a2a30', 1], ['beetle', '#30a0a0', 1], ['keitora', '#f4f4f4', 1, 'box']],
    [['kei', '#ffd6e6'], ['kei', '#f8f4e0'], ['sedan', '#f4f4f8'], ['sedan', '#8a3a6a'], ['beetle', '#a8e0c8'], ['beetle', '#ff9ac0'],
      ['van', '#ffffff', 0, 0], ['bus', '#ff7aa8'], ['taxi', '#f2d23a'], ['keitora', '#f4f4f4', 0, 'box'], ['truck', '#f0e6ee']]
  ];

  G.TRAFFIC = [];
  G.TRAFFIC_BY_SEASON = [];
  G.buildTraffic = function () {
    G.TRAFFIC = []; G.TRAFFIC_BY_SEASON = [];
    SETS.forEach(function (set, s) {
      var arr = [];
      set.forEach(function (d) {
        var px = DEFS[d[0]](d[1], !!d[2], d[3]);
        var def = { img: px.toCanvas(), zoom: 1, kind: d[0] };
        arr.push(def); G.TRAFFIC.push(def);
      });
      G.TRAFFIC_BY_SEASON.push(arr);
    });
  };
  G.TRAFFIC_COUNT = 9;
  G.pickTraffic = function (season) {
    var arr = G.TRAFFIC_BY_SEASON[season] || G.TRAFFIC_BY_SEASON[0];
    var d = arr[Math.floor(Math.random() * arr.length)];
    // 大型車は少なめ
    if ((d.kind === 'bus' || d.kind === 'truck') && Math.random() < 0.5) d = arr[Math.floor(Math.random() * arr.length)];
    return d;
  };
})();
