'use strict';
// ============================================================
//  scenery.js  ゾーンごとに沿道スプライトを配置
//  offset: 道路中心からの位置 (±1 = 路面の端, 負=左)
// ============================================================
(function () {
  G.placeScenery = function (T) {
    var segs = T.segments, r = G.rng(20261011);
    function rnd(a, b) { return a + r() * (b - a); }
    function pick(a) { return a[Math.floor(r() * a.length)]; }
    function add(i, key, offset, o) {
      var s = segs[i];
      if (!s || !G.SPR[key]) return;
      var sp = { key: key, offset: offset };
      if (o) for (var k in o) sp[k] = o[k];
      s.sprites.push(sp);
    }
    function both(i, keyFn, a, b) { add(i, keyFn(), -rnd(a, b)); add(i, keyFn(), rnd(a, b)); }

    var RULES = {
      start: function (i, k) {
        if (k % 7 === 0 && k < 90) { add(i, 'crowd', -1.55); add(i, 'crowd', 1.55); }
        if (k % 5 === 2) { add(i, pick(['palm1', 'palm2', 'palm3']), -2.6); add(i, pick(['palm1', 'palm2', 'palm3']), 2.6); }
        if (k % 9 === 4) add(i, pick(['parasolR', 'parasolB', 'parasolY']), -1.9);
      },
      beach: function (i, k) {
        if (k % 6 === 0) add(i, pick(['palm1', 'palm2', 'palm3']), rnd(1.3, 1.7));
        if (k % 9 === 3) add(i, pick(['palm1', 'palm2', 'palm3']), rnd(2.3, 3.4));
        if (k % 5 === 1) add(i, pick(['parasolR', 'parasolB', 'parasolY', 'parasolR']), -rnd(1.25, 1.75));
        if (k % 31 === 7) add(i, 'surf', -1.9);
        if (k % 23 === 11) add(i, pick(['yachtR', 'yachtB']), -rnd(3.5, 8));
        if (k % 41 === 20) add(i, 'rockS', -rnd(2.0, 2.4));
      },
      cliff: function (i, k) {
        if (k % 5 === 0) add(i, pick(['rock', 'rockS']), rnd(1.3, 1.9));
        if (k % 11 === 3) add(i, pick(['palm1', 'palm2']), rnd(2.2, 3.0));
        if (k % 13 === 6) add(i, 'rockS', -rnd(1.3, 1.6));
        if (k % 29 === 9) add(i, pick(['yachtR', 'yachtB']), -rnd(4, 9));
      },
      town: function (i, k) {
        if (k % 16 === 0) add(i, 'hut', 1.7);
        if (k % 16 === 8) add(i, 'hut', -1.7, { flip: true });
        if (k % 4 === 2) add(i, pick(['parasolR', 'parasolB', 'parasolY']), (k % 8 < 4 ? -1 : 1) * rnd(1.25, 1.4));
        if (k % 7 === 5) both(i, function () { return pick(['palm1', 'palm2', 'palm3']); }, 2.5, 3.2);
        if (k % 23 === 13) add(i, 'surf', rnd(1.3, 1.45));
      },
      sunflower: function (i, k) {
        if (k % 2 === 0) add(i, 'sunflower', rnd(1.25, 1.5));
        if (k % 3 === 1) add(i, 'sunflower', rnd(1.8, 3.2));
        if (k % 8 === 0) add(i, pick(['palm1', 'palm2', 'palm3']), -rnd(1.3, 1.6));
        if (k % 12 === 6) add(i, 'sunflower', -rnd(1.3, 2.0));
      },
      palms: function (i, k) {
        if (k % 4 === 0) add(i, pick(['palm1', 'palm2', 'palm3']), (k % 8 ? -1 : 1) * rnd(1.3, 1.45));
        if (k % 4 === 2) add(i, pick(['palm1', 'palm2', 'palm3']), (k % 8 === 2 ? 1 : -1) * rnd(1.3, 1.45));
        if (k % 10 === 5) both(i, function () { return pick(['palm1', 'palm2', 'palm3']); }, 2.4, 3.5);
      },
      // ---- 秋 ----
      rice: function (i, k) {
        if (k % 3 === 0) add(i, 'higanbana', (k % 6 ? -1 : 1) * rnd(1.2, 1.35));
        if (k % 14 === 4) add(i, 'hasa', (k % 28 < 14 ? -1 : 1) * rnd(1.9, 2.6));
        if (k % 26 === 9) add(i, 'scarecrow', (k % 52 < 26 ? 1 : -1) * rnd(1.6, 2.4));
        if (k % 11 === 7) add(i, pick(['kaki', 'momiji2']), (k % 22 < 11 ? 1 : -1) * rnd(2.6, 3.6));
      },
      ginkgo: function (i, k) {
        if (k % 4 === 0) { add(i, 'ginkgo', -rnd(1.28, 1.4)); add(i, 'ginkgo', rnd(1.28, 1.4)); }
        if (k % 6 === 3) add(i, 'higanbana', (k % 12 < 6 ? -1 : 1) * 1.2);
        if (k % 9 === 2) both(i, function () { return pick(['momiji1', 'momiji2', 'ginkgo']); }, 2.3, 3.2);
      },
      momiji: function (i, k) {
        if (k % 3 === 0) add(i, pick(['momiji1', 'momiji2', 'momiji3']), -rnd(1.28, 1.8));
        if (k % 3 === 1) add(i, pick(['momiji1', 'momiji2', 'momiji3', 'ginkgo']), rnd(1.28, 1.8));
        if (k % 5 === 2) both(i, function () { return pick(['momiji1', 'momiji2', 'momiji3']); }, 2.0, 3.4);
        if (k % 37 === 17) add(i, 'lantern', (k % 74 < 37 ? 1 : -1) * 1.22);
      },
      shrine: function (i, k) {
        if (k % 36 === 0) add(i, 'torii', (k % 72 ? -1 : 1) * 1.75);
        if (k % 6 === 3) { add(i, 'lantern', -1.24); add(i, 'lantern', 1.24); }
        if (k % 4 === 1) both(i, function () { return pick(['momiji1', 'momiji3', 'momiji2']); }, 2.1, 3.0);
      },
      kaki: function (i, k) {
        if (k % 7 === 0) add(i, 'kaki', (k % 14 ? -1 : 1) * rnd(1.35, 1.9));
        if (k % 17 === 5) add(i, 'hasa', (k % 34 < 17 ? 1 : -1) * rnd(2.0, 2.6));
        if (k % 29 === 13) add(i, 'scarecrow', (k % 58 < 29 ? -1 : 1) * rnd(1.5, 2.0));
        if (k % 4 === 2) add(i, 'higanbana', (k % 8 < 4 ? 1 : -1) * 1.2);
      },
      // ---- 冬 ----
      field: function (i, k) {
        if (k % 3 === 0) add(i, 'snowbank', (k % 6 ? -1 : 1) * rnd(1.2, 1.35));
        if (k % 27 === 8) add(i, 'snowman', (k % 54 < 27 ? 1 : -1) * rnd(1.5, 2.0));
        if (k % 33 === 20) add(i, 'kamakura', (k % 66 < 33 ? -1 : 1) * rnd(1.8, 2.4));
        if (k % 9 === 4) both(i, function () { return pick(['bare', 'sugi2']); }, 2.4, 3.6);
        if (k % 12 === 6) add(i, 'lamp', (k % 24 < 12 ? -1 : 1) * 1.2);
      },
      forest: function (i, k) {
        if (k % 2 === 0) add(i, pick(['sugi1', 'sugi2']), -rnd(1.28, 2.0));
        if (k % 2 === 1) add(i, pick(['sugi1', 'sugi2']), rnd(1.28, 2.0));
        if (k % 4 === 1) both(i, function () { return pick(['sugi1', 'sugi2', 'bare']); }, 2.2, 3.4);
        if (k % 5 === 3) add(i, 'snowbank', (k % 10 < 5 ? 1 : -1) * 1.18);
      },
      lake: function (i, k) {
        if (k % 10 === 0) add(i, 'lamp', -1.2);
        if (k % 3 === 1) add(i, pick(['sugi1', 'sugi2', 'bare']), rnd(1.3, 2.2));
        if (k % 4 === 3) add(i, 'snowbank', rnd(1.2, 1.3));
        if (k % 21 === 9) add(i, 'bare', -rnd(1.7, 1.9));
      },
      snowwall: function (i, k) {
        if (k % 2 === 0) { add(i, 'snowbank', -rnd(1.15, 1.22)); add(i, 'snowbank', rnd(1.15, 1.22)); }
        if (k % 2 === 1) { add(i, 'snowbank', -rnd(1.4, 1.6), { zoom: 1.4 }); add(i, 'snowbank', rnd(1.4, 1.6), { zoom: 1.4 }); }
        if (k % 14 === 7) add(i, 'lamp', (k % 28 < 14 ? 1 : -1) * 1.18);
        if (k % 5 === 2) both(i, function () { return 'sugi1'; }, 2.2, 3.0);
      },
      village: function (i, k) {
        if (k % 20 === 0) add(i, 'gassho', (k % 40 ? -1 : 1) * rnd(1.7, 2.0));
        if (k % 8 === 4) { add(i, 'lamp', -1.2); add(i, 'lamp', 1.2); }
        if (k % 31 === 15) add(i, 'kamakura', (k % 62 < 31 ? 1 : -1) * 1.6);
        if (k % 23 === 11) add(i, 'snowman', (k % 46 < 23 ? -1 : 1) * 1.45);
        if (k % 6 === 2) both(i, function () { return pick(['sugi1', 'sugi2']); }, 2.6, 3.6);
        if (k % 3 === 1) add(i, 'snowbank', (k % 6 < 3 ? -1 : 1) * 1.3);
      },
      // ---- 春 ----
      nanohana: function (i, k) {
        if (k % 2 === 0) add(i, 'nanohana', -rnd(1.22, 1.6));
        if (k % 2 === 1) add(i, 'nanohana', rnd(1.22, 1.6));
        if (k % 3 === 1) both(i, function () { return 'nanohana'; }, 1.9, 3.4);
        if (k % 13 === 6) add(i, pick(['sakura1', 'sakura2']), (k % 26 < 13 ? 1 : -1) * rnd(2.4, 3.2));
      },
      sakura: function (i, k) {
        if (k % 4 === 0) { add(i, pick(['sakura1', 'sakura2']), -rnd(1.3, 1.45)); add(i, pick(['sakura1', 'sakura2']), rnd(1.3, 1.45)); }
        if (k % 9 === 5) add(i, 'shidare', (k % 18 < 9 ? -1 : 1) * rnd(2.0, 2.6));
        if (k % 7 === 3) both(i, function () { return pick(['sakura1', 'sakura2']); }, 2.4, 3.4);
      },
      castle: function (i, k) {
        if (k % 5 === 0) add(i, pick(['sakura1', 'sakura2']), -rnd(1.3, 1.6));
        if (k % 6 === 3) add(i, 'lantern', 1.24);
        if (k % 6 === 0) add(i, 'shidare', rnd(1.9, 2.4));
        if (k % 8 === 4) both(i, function () { return pick(['sakura1', 'sakura2']); }, 2.6, 3.4);
      },
      tulip: function (i, k) {
        if (k % 2 === 0) add(i, 'tulip', (k % 4 ? -1 : 1) * rnd(1.2, 1.5));
        if (k % 3 === 0) both(i, function () { return 'tulip'; }, 1.7, 2.8);
        if (k % 17 === 8) add(i, 'koinobori', (k % 34 < 17 ? 1 : -1) * rnd(1.7, 2.2));
        if (k % 11 === 2) both(i, function () { return pick(['sakura1', 'sakura2']); }, 3.0, 3.6);
      },
      koinobori: function (i, k) {
        if (k % 12 === 0) add(i, 'koinobori', (k % 24 ? -1 : 1) * rnd(1.5, 1.9));
        if (k % 2 === 1) add(i, 'nanohana', (k % 4 < 2 ? 1 : -1) * rnd(1.22, 1.6));
        if (k % 6 === 2) both(i, function () { return pick(['sakura1', 'sakura2', 'nanohana']); }, 2.2, 3.2);
      },
      final: function (i, k) {
        if (k % 2 === 0) { add(i, pick(['sakura1', 'sakura2', 'sakura1']), -rnd(1.28, 1.4)); add(i, pick(['sakura1', 'sakura2', 'sakura1']), rnd(1.28, 1.4)); }
        if (k % 4 === 1) both(i, function () { return pick(['shidare', 'sakura1']); }, 1.9, 2.8);
        if (k > 200 && k % 6 === 0) { add(i, 'crowd', -1.75); add(i, 'crowd', 1.75); }
      },
      finale: function (i, k) {
        if (k % 2 === 0) { add(i, pick(['sakura1', 'sakura2']), -rnd(1.28, 1.4)); add(i, pick(['sakura1', 'sakura2']), rnd(1.28, 1.4)); }
        if (k % 3 === 1) both(i, function () { return pick(['shidare', 'sakura1', 'sakura2']); }, 1.9, 3.0);
        if (k < 40 && k % 5 === 0) { add(i, 'crowd', -1.75); add(i, 'crowd', 1.75); }
      }
    };

    // ゾーンごとに先頭からの番号 k を数えて配置
    var zoneStart = 0, prevZone = null;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (s.zone !== prevZone) { zoneStart = i; prevZone = s.zone; }
      var rule = RULES[s.zone];
      if (rule) rule(i, i - zoneStart);
    }

    // ---- ゲート ----
    var gIdx = [T.startIndex];
    add(T.startIndex, 'gate_start', 0);
    T.checkpoints.forEach(function (c) { add(c, 'gate_cp', 0); gIdx.push(c); });
    add(T.goalIndex, 'gate_goal', 0);
    gIdx.push(T.goalIndex);
    // ゲート付近の路肩スプライトは取り除く (柱と重ならないように)
    gIdx.forEach(function (g) {
      for (var j = g - 2; j <= g + 2; j++) {
        if (!segs[j]) continue;
        segs[j].sprites = segs[j].sprites.filter(function (sp) { return /gate/.test(sp.key) || Math.abs(sp.offset) > 1.8; });
      }
    });

    // ---- 看板 ----
    var boards = { 0: ['board_summer', 'board_smart'], 1: ['board_autumn', 'board_smart'], 2: ['board_winter', 'board_smart'], 3: ['board_spring', 'board_smart'] };
    for (var se = 0; se < 4; se++) {
      var a = T.seasonStart[se] + 200, b = (se < 3 ? T.checkpoints[se] : T.goalIndex) - 200;
      boards[se].forEach(function (key, n) {
        var at = Math.round(a + (b - a) * (0.3 + n * 0.4));
        add(at, key, n ? -1.6 : 1.6);
      });
    }
    if (G.SPR.board_spring) add(T.goalIndex - 120, 'board_spring', 1.6);

    // ---- カーブ警告の矢印標識 ----
    for (i = 1; i < segs.length; i++) {
      var c = segs[i].curve, pc = segs[i - 1].curve;
      if (Math.abs(c) >= 3.5 && Math.abs(pc) < 3.5) {
        for (var n2 = -10; n2 < 50; n2 += 6) {
          var sg = segs[i + n2];
          if (!sg) continue;
          // カーブの外側に、曲がる向きの矢印
          add(i + n2, c > 0 ? 'chevR' : 'chevL', c > 0 ? -1.3 : 1.3);
        }
      }
    }
  };
})();
