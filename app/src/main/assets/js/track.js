'use strict';
// ============================================================
//  track.js  コース (セグメント列) の生成
//  夏 → 秋 → 冬 → 春 を 1 本の道でつなぎ、
//  チェックポイントを越えると次の季節へ景色がブレンドされる
// ============================================================
(function () {
  var SEG = 200, RUMBLE = 3;
  var BLEND_SEGS = 160;   // 季節の切り替わりにかけるセグメント数
  var PAL_STEPS = 10;

  var T = G.Track = {
    SEG: SEG, RUMBLE: RUMBLE,
    segments: [], length: 0,
    seasonStart: [], seasonEnd: [], checkpoints: [], goalIndex: 0, startIndex: 0
  };

  // ---------- コース定義 ----------
  //  [enter, hold, leave, curve, hill, zone]
  //  curve: 正=右, 負=左  hill: セグメント長単位の高低差
  var COURSE = [
    // ===== 夏: 海沿いの道 =====
    [
      [0, 140, 0, 0, 0, 'start'],
      [60, 120, 60, 0, 0, 'beach'],
      [50, 120, 50, -3, 20, 'beach'],
      [50, 100, 50, 4, -20, 'beach'],
      [40, 90, 40, 0, 35, 'cliff'],
      [50, 140, 50, -5, -35, 'cliff'],
      [40, 110, 40, 3, 0, 'town'],
      [50, 100, 50, -3, 15, 'sunflower'],
      [50, 150, 50, 6, 0, 'sunflower'],
      [40, 90, 40, -2, -15, 'palms'],
      [30, 70, 30, -4, 0, 'beach'],
      [30, 70, 30, 4, 10, 'beach'],
      [30, 70, 30, -4, -10, 'beach'],
      [50, 200, 50, 0, 25, 'palms'],
      [50, 100, 50, 4, -25, 'palms'],
      [60, 140, 60, -3, 0, 'town'],
      [0, 160, 0, 0, 0, 'beach']
    ],
    // ===== 秋: 紅葉の峠 =====
    [
      [0, 120, 0, 0, 0, 'rice'],
      [50, 120, 50, 2, 20, 'rice'],
      [50, 120, 50, -4, 30, 'ginkgo'],
      [40, 100, 40, 5, 20, 'momiji'],
      [40, 100, 40, -5, -10, 'momiji'],
      [30, 60, 30, 6, 0, 'momiji'],
      [30, 60, 30, -6, 0, 'momiji'],
      [50, 120, 50, 0, -40, 'shrine'],
      [50, 150, 50, 3, 0, 'rice'],
      [50, 100, 50, -3, 25, 'kaki'],
      [40, 120, 40, 4, -15, 'ginkgo'],
      [40, 80, 40, -6, 10, 'momiji'],
      [40, 80, 40, 6, -20, 'momiji'],
      [50, 160, 50, 0, 0, 'shrine'],
      [50, 100, 50, -2, 0, 'rice'],
      [0, 160, 0, 0, 0, 'rice']
    ],
    // ===== 冬: 雪の谷 =====
    [
      [0, 120, 0, 0, 0, 'field'],
      [50, 120, 50, -3, 25, 'forest'],
      [50, 120, 50, 4, 25, 'forest'],
      [40, 140, 40, 0, -20, 'lake'],
      [50, 120, 50, -5, 0, 'lake'],
      [40, 80, 40, 5, 30, 'snowwall'],
      [40, 80, 40, -5, -10, 'snowwall'],
      [50, 120, 50, 3, -40, 'village'],
      [50, 140, 50, -2, 0, 'field'],
      [40, 100, 40, 6, 20, 'forest'],
      [40, 100, 40, -6, -20, 'forest'],
      [50, 180, 50, 0, 0, 'village'],
      [50, 100, 50, 3, 15, 'field'],
      [0, 160, 0, 0, -15, 'field']
    ],
    // ===== 春: 桜の道 (最後は花吹雪のゴール) =====
    [
      [0, 120, 0, 0, 0, 'nanohana'],
      [50, 120, 50, 3, 15, 'nanohana'],
      [50, 140, 50, -4, -15, 'sakura'],
      [40, 100, 40, 5, 25, 'castle'],
      [40, 100, 40, -3, 0, 'castle'],
      [50, 120, 50, 0, -25, 'tulip'],
      [40, 100, 40, 4, 0, 'sakura'],
      [30, 70, 30, -5, 10, 'sakura'],
      [30, 70, 30, 5, -10, 'sakura'],
      [50, 140, 50, -2, 20, 'nanohana'],
      [50, 120, 50, 3, -20, 'koinobori'],
      [50, 150, 50, -3, 0, 'sakura'],
      [0, 260, 0, 0, 0, 'final'],
      [0, 420, 0, 0, 0, 'finale']   // ゴール後のエンディング区間
    ]
  ];

  // 地面のゾーン設定: gl/gr = 左右の地面, sl/sr = 路肩幅 (道幅比)
  var ZONES = {
    start: { gl: 'sand', gr: 'grass', sl: 0.3, sr: 0.2 },
    beach: { gl: 'sea', gr: 'grass', sl: 0.9, sr: 0.18 },
    cliff: { gl: 'sea', gr: 'rock', sl: 0.25, sr: 0.12 },
    town: { gl: 'sand', gr: 'sand', sl: 0.2, sr: 0.2 },
    sunflower: { gl: 'grass', gr: 'field', sl: 0.15, sr: 0.15 },
    palms: { gl: 'grass', gr: 'grass', sl: 0.25, sr: 0.25 },
    rice: { gl: 'field', gr: 'field', sl: 0.12, sr: 0.12 },
    ginkgo: { gl: 'grass', gr: 'grass', sl: 0.15, sr: 0.15 },
    momiji: { gl: 'leaves', gr: 'forest', sl: 0.12, sr: 0.12 },
    shrine: { gl: 'leaves', gr: 'leaves', sl: 0.2, sr: 0.2 },
    kaki: { gl: 'grass', gr: 'field', sl: 0.12, sr: 0.12 },
    field: { gl: 'snow', gr: 'field', sl: 0.15, sr: 0.15 },
    forest: { gl: 'snow', gr: 'snow', sl: 0.15, sr: 0.15 },
    lake: { gl: 'ice', gr: 'snow', sl: 0.35, sr: 0.15 },
    snowwall: { gl: 'snow', gr: 'snow', sl: 0.1, sr: 0.1 },
    village: { gl: 'snow', gr: 'field', sl: 0.2, sr: 0.2 },
    nanohana: { gl: 'field', gr: 'field', sl: 0.12, sr: 0.12 },
    sakura: { gl: 'grass', gr: 'grass', sl: 0.2, sr: 0.2 },
    castle: { gl: 'grass', gr: 'sand', sl: 0.15, sr: 0.3 },
    tulip: { gl: 'grass', gr: 'grass', sl: 0.15, sr: 0.15 },
    koinobori: { gl: 'grass', gr: 'field', sl: 0.15, sr: 0.15 },
    final: { gl: 'petals', gr: 'petals', sl: 0.3, sr: 0.3 },
    finale: { gl: 'petals', gr: 'petals', sl: 0.3, sr: 0.3 }
  };
  T.ZONES = ZONES;

  function lastY() { var s = T.segments; return s.length ? s[s.length - 1].p2.world.y : 0; }

  function addSegment(curve, y, season, zone) {
    var n = T.segments.length;
    var z = ZONES[zone] || ZONES.palms;
    T.segments.push({
      index: n,
      p1: { world: { y: lastY(), z: n * SEG }, cz: 0, scale: 0, sx: 0, sy: 0, sw: 0 },
      p2: { world: { y: y, z: (n + 1) * SEG }, cz: 0, scale: 0, sx: 0, sy: 0, sw: 0 },
      curve: curve, season: season, zone: zone,
      gl: z.gl, gr: z.gr, sl: z.sl, sr: z.sr,
      sprites: [], cars: [], pal: null, clip: 0, fogLv: 0, visible: false
    });
  }

  function addRoad(enter, hold, leave, curve, hill, season, zone) {
    var startY = lastY(), endY = startY + hill * SEG, total = enter + hold + leave, n;
    for (n = 0; n < enter; n++) addSegment(G.easeIn(0, curve, n / enter), G.easeInOut(startY, endY, n / total), season, zone);
    for (n = 0; n < hold; n++) addSegment(curve, G.easeInOut(startY, endY, (enter + n) / total), season, zone);
    for (n = 0; n < leave; n++) addSegment(G.easeInOut(curve, 0, n / leave), G.easeInOut(startY, endY, (enter + hold + n) / total), season, zone);
  }

  T.build = function () {
    T.segments = [];
    T.seasonStart = []; T.seasonEnd = []; T.checkpoints = [];
    for (var s = 0; s < COURSE.length; s++) {
      T.seasonStart[s] = T.segments.length;
      COURSE[s].forEach(function (r) { addRoad(r[0], r[1], r[2], r[3], r[4], s, r[5]); });
      T.seasonEnd[s] = T.segments.length;
    }
    T.length = T.segments.length * SEG;
    // スタート/チェックポイント/ゴール位置
    T.startIndex = 40;
    for (s = 0; s < 3; s++) T.checkpoints.push(T.seasonEnd[s] - 8);
    var lastSeason = COURSE.length - 1, fin = 0;
    for (var i = T.seasonStart[lastSeason]; i < T.segments.length; i++) if (T.segments[i].zone === 'finale') { fin = i; break; }
    T.goalIndex = fin;

    // ---- パレット (季節の切り替わりはブレンド) ----
    var pals = G.SEASONS.map(function (se) { return se.pal; });
    var base = pals.map(function (p) { return G.makeRuntimePalette(p, null, 0); });
    var blends = [null];
    for (s = 1; s < pals.length; s++) {
      var arr = [];
      for (var k = 0; k <= PAL_STEPS; k++) arr.push(G.makeRuntimePalette(pals[s - 1], pals[s], k / PAL_STEPS));
      blends.push(arr);
    }
    T.segments.forEach(function (seg) {
      var s = seg.season;
      seg.blend = 1; // 0..1 (前の季節 -> この季節)
      if (s > 0) {
        var from = T.checkpoints[s - 1];
        var d = seg.index - from;
        if (d < BLEND_SEGS) {
          seg.blend = G.clamp(d / BLEND_SEGS, 0, 1);
          seg.pal = blends[s][Math.round(seg.blend * PAL_STEPS)];
          return;
        }
      }
      seg.pal = base[s];
    });
    // チェックポイント手前 (前の季節の終端) から次の季節へブレンド開始
    for (s = 0; s < T.checkpoints.length; s++) {
      for (i = T.checkpoints[s]; i < T.seasonEnd[s]; i++) {
        var sg = T.segments[i];
        sg.blend = 0; sg.pal = blends[s + 1][0];
        sg.nextSeason = s + 1;
      }
    }
    if (G.placeScenery) G.placeScenery(T);
  };

  T.findSegment = function (z) {
    var i = Math.floor(z / SEG);
    if (i < 0) i = 0;
    if (i >= T.segments.length) i = T.segments.length - 1;
    return T.segments[i];
  };
  // 位置 z における「季節インデックス + ブレンド」(背景用)
  T.seasonAt = function (z) {
    var seg = T.findSegment(z);
    var s = seg.season, b = seg.blend;
    if (seg.nextSeason !== undefined) { s = seg.nextSeason; b = 0; }
    var frac = (z / SEG) - Math.floor(z / SEG);
    if (s > 0 && b < 1) b = G.clamp(b + frac / BLEND_SEGS, 0, 1);
    return { season: s, blend: b };
  };
  T.BLEND_SEGS = BLEND_SEGS;
})();
