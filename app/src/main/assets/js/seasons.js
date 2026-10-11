'use strict';
// ============================================================
//  seasons.js  季節ごとのパレット・名称
//  コース順: 夏 → 秋 → 冬 → 春 (ゴールは花吹雪)
// ============================================================
(function () {
  G.SEASONS = [
    {
      key: 'summer', name: 'SUMMER', jp: '夏', title: 'SEASIDE LINE',
      color: '#2f8cff',
      pal: {
        sky: [[0, '#1646c8'], [0.45, '#2f7ee8'], [0.8, '#74c2fa'], [1, '#c4ecff']],
        fog: '#b8e2fa',
        road: ['#8c8e98', '#84868f'],
        rumble: ['#e8323c', '#f6f6f6'],
        line: '#fafafa',
        shoulder: ['#f2dfa2', '#e8d290'],
        grounds: {
          grass: ['#56c43e', '#4ab636'],
          sand: ['#f6e3a6', '#eed696'],
          sea: ['#1a6fd6', '#1764c6'],
          field: ['#62c63c', '#58b834'],
          rock: ['#b4a488', '#a89878']
        }
      }
    },
    {
      key: 'autumn', name: 'AUTUMN', jp: '秋', title: 'MAPLE PASS',
      color: '#ff7a2a',
      pal: {
        sky: [[0, '#2a1a58'], [0.35, '#6a3478'], [0.7, '#e2704c'], [1, '#ffc274']],
        fog: '#f2aa6c',
        road: ['#726874', '#6a606c'],
        rumble: ['#f2ece0', '#c8302a'],
        line: '#f4ecdc',
        shoulder: ['#946c3c', '#886236'],
        grounds: {
          grass: ['#b88e2a', '#ac8224'],
          field: ['#e2b232', '#d6a62a'],
          leaves: ['#d2582a', '#c44e22'],
          forest: ['#9c4a22', '#90421e'],
          sand: ['#c8a060', '#bc9658']
        }
      }
    },
    {
      key: 'winter', name: 'WINTER', jp: '冬', title: 'SNOW VALLEY',
      color: '#cfe4ff',
      pal: {
        sky: [[0, '#0c1032'], [0.4, '#28306c'], [0.75, '#6c64a6'], [1, '#d6b6d2']],
        fog: '#b4aed0',
        road: ['#5c6274', '#565c6e'],
        rumble: ['#f2f4fa', '#3456c4'],
        line: '#e8f0ff',
        shoulder: ['#dfe6f4', '#d2dbee'],
        grounds: {
          snow: ['#eef2fc', '#e0e8f8'],
          ice: ['#9ccaee', '#90c0e8'],
          field: ['#d4ddf0', '#c8d2ea'],
          grass: ['#e6ecf8', '#d8e2f4']
        }
      }
    },
    {
      key: 'spring', name: 'SPRING', jp: '春', title: 'SAKURA ROAD',
      color: '#ff8cc0',
      pal: {
        sky: [[0, '#4686e0'], [0.45, '#74aef0'], [0.8, '#b6d8f6'], [1, '#f4e6f2']],
        fog: '#f2e2ee',
        road: ['#94929c', '#8c8a94'],
        rumble: ['#ff8ab6', '#fafafa'],
        line: '#ffffff',
        shoulder: ['#ffd2e2', '#f8c4d8'],
        grounds: {
          grass: ['#7ad25a', '#6ec64e'],
          field: ['#f6de3a', '#eacf2e'],
          petals: ['#ffc6dc', '#f8b8d2'],
          sand: ['#e8d4a8', '#dec89c']
        }
      }
    }
  ];

  // パレット (16進文字列) -> 霧レベル展開済みの Uint32 テーブル
  var FOG_LEVELS = 16;
  G.FOG_LEVELS = FOG_LEVELS;
  function fogRamp(c, fog) {
    var a = new Uint32Array(FOG_LEVELS);
    for (var i = 0; i < FOG_LEVELS; i++) a[i] = G.mix(c, fog, i / (FOG_LEVELS - 1));
    return a;
  }
  // 2 つのパレットを t でブレンドした実行時パレット
  G.makeRuntimePalette = function (pa, pb, t) {
    function m(x, y) { return pb ? G.mix(G.col(x), G.col(y), t) : G.col(x); }
    var fog = m(pa.fog, pb ? pb.fog : 0);
    function pair(k) { return [fogRamp(m(pa[k][0], pb ? pb[k][0] : 0), fog), fogRamp(m(pa[k][1], pb ? pb[k][1] : 0), fog)]; }
    var out = {
      fog: fog,
      road: pair('road'), rumble: pair('rumble'), shoulder: pair('shoulder'),
      line: fogRamp(m(pa.line, pb ? pb.line : 0), fog),
      grounds: {}
    };
    // 地面: 同名がなければ grass を代用
    var keys = {};
    Object.keys(pa.grounds).forEach(function (k) { keys[k] = 1; });
    if (pb) Object.keys(pb.grounds).forEach(function (k) { keys[k] = 1; });
    Object.keys(keys).forEach(function (k) {
      var ga = pa.grounds[k] || pa.grounds.grass, gb = pb ? (pb.grounds[k] || pb.grounds.grass) : null;
      out.grounds[k] = [fogRamp(m(ga[0], gb ? gb[0] : 0), fog), fogRamp(m(ga[1], gb ? gb[1] : 0), fog)];
    });
    return out;
  };
})();
