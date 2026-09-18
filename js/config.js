/* 星の箱庭 — 定数・漂流物・できごとの定義 */
window.Hakoniwa = window.Hakoniwa || {};
(function (H) {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  H.util = { TAU: TAU, clamp: clamp, rand: rand, randInt: randInt, lerp: lerp, pick: pick };

  /* ---- 保存 ---- */
  H.SAVE_KEY = 'hoshino-hakoniwa-v1';
  H.SAVE_INTERVAL = 5;

  /* ---- 星 ---- */
  H.START_MASS = 1000;      // 基準質量(t)
  H.BASE_RADIUS = 4.0;      // 基準質量のときの半径(m)
  H.ROTATION_PERIOD = 78;   // 自転一周 = 一日(秒)
  H.AXIAL_TILT = -0.24;     // 地軸の傾き(rad)
  H.MAX_MARKS = 260;        // これより古い痕は埋もれて消える

  /* ---- 疑似重力(見た目優先, px単位) ---- */
  H.GM_BASE = 2.05e6;
  H.GM_EXP = 0.30;          // 重くなると引力もすこし強くなる
  H.DRAG = 0.055;           // 軌道がゆっくり落ちてくるための抵抗
  H.HAND_RADIUS = 300;      // 「引力の手」の届く範囲(px)
  H.HAND_STRENGTH = 4.5e6;

  /* ---- 漂流物 ---- */
  H.SPAWN_INTERVAL = [0.55, 1.2];
  H.MAX_DEBRIS = 280;
  H.DEBRIS_TYPES = [
    { id: 'meteor', label: '隕石', full: '隕石', weight: 32, material: 'rock',
      mass: [24, 88], size: [3.6, 7.4], color: '#b2836a', glow: '#ffb26b' },
    { id: 'dust', label: 'チリ', full: '彗星のチリ', weight: 42, material: 'ice',
      mass: [0.7, 2.4], size: [1.1, 2.3], color: '#d5ecff', glow: '#8ed6ff', burst: [7, 15] },
    { id: 'wreck', label: '漂流物', full: '宇宙船の漂流物', weight: 20, material: 'metal',
      mass: [34, 140], size: [4.2, 9.0], color: '#9eb1c4', glow: '#dcefff' },
    { id: 'seed', label: '星の種', full: '星の種', weight: 7, material: 'life',
      mass: [3, 8], size: [2.2, 3.4], color: '#cdf5a3', glow: '#a4ef73' }
  ];

  /* ---- できごと(解放条件つき) ---- */
  H.MILESTONES = [
    { id: 'crust', r: 4.7, title: '地殻ができた',
      log: '降りつもった塵がかたまって、歩ける地面になった。' },
    { id: 'volcano', r: 6.2, title: '火山ができた',
      log: '地の底の熱が噴きだした。ふたつは生きていて、ひとつは冷えている。' },
    { id: 'air', r: 8.2, title: 'うすい大気', need: { ice: 0.10 },
      log: '氷がとけて、星のまわりにうすい空ができた。風が吹く。' },
    { id: 'sea', r: 10.8, title: '手のひらの海', need: { ice: 0.12 },
      log: 'くぼ地に水がたまって、手のひらほどの海になった。' },
    { id: 'sprout', r: 13.2, title: 'はじめての木', need: { life: 3 },
      log: '芽が出た。根を張って、崩れやすい地面をつなぎとめている。' },
    { id: 'rose', r: 16.5, title: 'はじめての花', need: { life: 6 },
      log: 'どこからか種がとんできて、花がひらいた。' },
    { id: 'lamp', r: 20.0, title: '街灯がともる', need: { metal: 0.12 },
      log: '漂流物を組み立てて街灯を立てた。日が暮れるたび、ひとりでに灯る。' },
    { id: 'house', r: 24.0, title: '小さな家', need: { metal: 0.16 },
      log: '船の外板で小屋を建てた。屋根はすこしだけ傾いている。' },
    { id: 'bench', r: 28.5, title: '見晴らしの椅子',
      log: '腰かける場所をつくった。ここからだと、降ってくるものがよく見える。' },
    { id: 'keeper', r: 34.5, title: '住人がやってきた',
      log: '小さな船が不時着した。降りてきた人は、ここで暮らすことにしたらしい。' },
    { id: 'named', r: 42.0, title: '星に名前がついた',
      log: '遠くの望遠鏡からも見えるようになった。標柱を立てて、名前を彫る。' }
  ];

  H.needText = function (need, world) {
    var out = [];
    var f = H.fractions(world);
    if (need.ice != null) out.push('氷 ' + Math.round(f.ice * 100) + '/' + Math.round(need.ice * 100) + '%');
    if (need.metal != null) out.push('金属 ' + Math.round(f.metal * 100) + '/' + Math.round(need.metal * 100) + '%');
    if (need.life != null) out.push('星の種 あと ' + Math.max(0, Math.ceil((need.life - world.life) / 5.5)));
    return out.join(' ・ ');
  };
})(window.Hakoniwa);
