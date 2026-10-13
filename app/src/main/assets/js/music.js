'use strict';
// ============================================================
//  music.js  BGM の再生
//   曲 (タイトル: フュージョン / 夏: ハードロック / 秋: ボサノバ / 冬: ジャズ / 春: テクノ /
//   ゴール後: ファンファーレからビクトリーの曲) はすべて band.js の生演奏風の曲。
//   band.js で書き出したループをここで鳴らし, 曲の切り替えはクロスフェードする。
//   チェックポイントとタイムアップのジングルだけは FM 音源風の音色 (発振器どうしの周波数変調)
// ============================================================
(function () {
  var M = G.Music = { current: null, pending: null };

  // ---------------- FM 音源 (ジングル用) ----------------
  //  mods: 変調器 [{ r: 周波数比, i: 変調指数, s: 持続時の指数の割合, d: 減衰の時定数(秒) }]
  //  a: アタック, dl/sl: ディケイとサスティン, rel: リリース, chorus: 2 本目のキャリアのずれ
  var PATCH = {
    brass: { mods: [{ r: 1, i: 2.6, s: 0.45, d: 0.12 }], a: 0.012, dl: 0.25, sl: 0.78, rel: 0.08, chorus: 0.004 },
    bass: { mods: [{ r: 1, i: 3.2, s: 0.22, d: 0.06 }, { r: 0.5, i: 0.8, s: 0.3, d: 0.1 }], a: 0.004, dl: 0.15, sl: 0.62, rel: 0.04 }
  };
  function fmNote(ctx, dest, name, f, t, dur, vol) {
    var P = PATCH[name] || PATCH.brass;
    var cg = ctx.createGain(); cg.connect(dest);
    var nCar = P.chorus ? 2 : 1, cars = [];
    for (var k = 0; k < nCar; k++) {
      var o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * (k ? 1 + P.chorus : 1), t);
      o.connect(cg); cars.push(o);
    }
    var amp = vol / (nCar === 2 ? 1.6 : 1);
    cg.gain.setValueAtTime(0, t);
    cg.gain.linearRampToValueAtTime(amp, t + P.a);
    cg.gain.setTargetAtTime(amp * P.sl, t + P.a, P.dl / 3);
    var rs = Math.max(t + P.a + 0.01, t + dur - 0.01);
    cg.gain.setTargetAtTime(0, rs, P.rel / 3);
    var end = rs + P.rel * 2.5;
    P.mods.forEach(function (m) {
      var mo = ctx.createOscillator(), mg = ctx.createGain();
      var fmod = f * m.r, dev = m.i * fmod;
      mo.frequency.setValueAtTime(fmod, t);
      mg.gain.setValueAtTime(dev, t);
      mg.gain.setTargetAtTime(dev * m.s, t + 0.002, m.d);
      mo.connect(mg);
      cars.forEach(function (o) { mg.connect(o.frequency); });
      mo.start(t); mo.stop(end);
    });
    cars.forEach(function (o) { o.start(t); o.stop(end); });
  }
  M.fm = function (name, f, t, dur, vol, dest) { if (G.Audio && G.Audio.ctx) fmNote(G.Audio.ctx, dest, name, f, t, dur, vol); };
  M.fmCtx = function (octx, dest, name, f, t, dur, vol) { fmNote(octx, dest, name, f, t, dur, vol); };

  // オフライン描画 (動画用): 曲 key を t0〜t1 秒に配置して dest へ
  M.renderOffline = function (octx, dest, key, t0, t1) { G.Band.compose(octx, dest, key, t0, t1); return G.Band.barDur(key); };
  M.songBar = function (key) { return G.Band.barDur(key); };

  // ---------------- 曲の再生 (band.js で書き出したループ) ----------------
  var bus = null, band = null, bandWant = null;
  function setup() {
    if (bus) return;
    bus = G.Audio.ctx.createGain(); bus.gain.value = 1; bus.connect(G.Audio.musicBus);
  }
  function stopBand(fade) {
    if (!band) return;
    var ctx = G.Audio.ctx, b = band, now = ctx.currentTime;
    band = null;
    b.g.gain.cancelScheduledValues(now);
    b.g.gain.setValueAtTime(b.g.gain.value, now);
    b.g.gain.linearRampToValueAtTime(0, now + fade);
    b.src.stop(now + fade + 0.05);
  }
  function startBand(key) {
    var ctx = G.Audio.ctx;
    bandWant = key;
    G.Band.loop(key).then(function (buf) {
      if (bandWant !== key || M.current !== key) return;   // 書き出し中に別の曲へ変わった
      var s = ctx.createBufferSource(), g = ctx.createGain(), now = ctx.currentTime;
      s.buffer = buf; s.loop = true;
      s.loopStart = buf.loopStart || 0; s.loopEnd = buf.duration;   // 前奏のある曲は本編だけを繰り返す
      s.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(1, now + 0.04);
      s.start(now + 0.02);
      band = { src: s, g: g };
    });
  }
  // 曲は先に書き出しておく (書き出しは音を出す許可がなくてもできるので, 読み込み後すぐ始める)
  var prefetched = false;
  function prefetch() {
    if (prefetched || !G.Band || !window.OfflineAudioContext) return;
    prefetched = true;
    ['title', 'summer', 'victory', 'autumn', 'winter', 'spring'].reduce(function (p, k) {
      return p.then(function () { return G.Band.loop(k); });
    }, Promise.resolve()).catch(function () { /* ignore */ });
  }

  function start(key) {
    var A = G.Audio;
    if (!A || !A.ready) { M.pending = key; return; }
    setup();
    var now = A.ctx.currentTime;
    stopBand(key ? 0.6 : 0.8);
    bandWant = null;
    bus.gain.cancelScheduledValues(now);
    bus.gain.setValueAtTime(bus.gain.value, now);
    if (!key) { bus.gain.setTargetAtTime(0, now, 0.2); return; }
    bus.gain.linearRampToValueAtTime(1, now + 0.2);
    startBand(key);
  }

  M.play = function (key) {
    if (key === M.current) return;
    M.current = key;
    start(key);
  };
  M.onReady = function () { prefetch(); if (M.current) start(M.current); };
  window.addEventListener('load', function () { setTimeout(prefetch, 300); });
})();
