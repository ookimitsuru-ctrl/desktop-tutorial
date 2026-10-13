'use strict';
// ============================================================
//  band.js  季節ごとの BGM (生演奏風, すべてオリジナル)
//   夏: ハードロック (歪んだギターのリフをループ) / 秋: ボサノバ / 冬: ジャズ / 春: テクノ
//   弦 (エレキ・ベース・ナイロン弦・ウッドベース) はカープラス・ストロング法で波形を作り,
//   ギターはアンプ (歪み + キャビネットの EQ) を通す。ドラム・ピアノ・ビブラフォン・フルート・
//   アシッドベースは WebAudio の発振器とフィルタで鳴らす。
//   ゲーム中は 1 曲 (16 小節) を OfflineAudioContext で先に書き出してループ再生する (端末の負荷が軽い)。
//   PV など動画用には同じ譜面を指定のコンテキストへ直接並べる (B.compose)。
// ============================================================
(function () {
  var B = G.Band = {};
  var NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11 };
  function mi(s) { var m = /^([A-G][#b]?)(-?\d)$/.exec(s); return 12 * (+m[2] + 1) + NOTE[m[1]]; }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 音作り専用の乱数 (ゲームの Math.random の順番を変えないように別にする)
  var seed = 20261013;
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }

  // ============================================================
  //  音源の部品
  // ============================================================
  // ---------- 弦 (カープラス・ストロング法) ----------
  //  decay: -60dB までの秒数, bright: 弾いた瞬間の明るさ, pos: 弾く位置 (駒からの割合), len: 波形の長さ
  var KS = {
    egtr: { decay: 4.5, bright: 0.8, pos: 0.12, len: 2.4 },
    ebass: { decay: 2.6, bright: 0.5, pos: 0.18, len: 1.6 },
    nylon: { decay: 2.0, bright: 0.3, pos: 0.2, len: 2.0 },
    upright: { decay: 1.2, bright: 0.2, pos: 0.24, len: 1.3 }
  };
  var ksCache = {};
  function ksBuffer(ctx, type, m) {
    var sr = ctx.sampleRate, key = type + m + '@' + sr;
    if (ksCache[key]) return ksCache[key];
    var o = KS[type], f = hz(m), n = Math.ceil(sr * o.len), y = new Float32Array(n);
    var D = sr / f - 0.5, L = Math.floor(D), fr = D - L;           // 平均化フィルタの半サンプルを除いた遅延
    var g = Math.pow(10, -3 / (f * o.decay));                       // 1 周ごとの減衰
    var lp = 0, P = Math.max(1, Math.round(o.pos * L)), ex = new Float32Array(L + 2), i;
    for (i = 0; i < L + 2; i++) { lp += ((rnd() * 2 - 1) - lp) * o.bright; ex[i] = lp; }
    for (i = 0; i < L + 2; i++) y[i] = ex[i] - (i >= P ? ex[i - P] : 0) * 0.9;   // 弾く位置の櫛形
    for (i = L + 2; i < n; i++) {
      var s1 = 0.5 * (y[i - L] + y[i - L - 1]), s2 = 0.5 * (y[i - L - 1] + y[i - L - 2]);
      y[i] = g * ((1 - fr) * s1 + fr * s2);
    }
    // 直流を除いて, 末尾は短くフェードアウト
    var x1 = 0, y1 = 0, peak = 0, fade = Math.floor(sr * 0.04);
    for (i = 0; i < n; i++) {
      var v = y[i] - x1 + 0.995 * y1; x1 = y[i]; y1 = v;
      if (i > n - fade) v *= (n - i) / fade;
      y[i] = v; if (Math.abs(v) > peak) peak = Math.abs(v);
    }
    var buf = ctx.createBuffer(1, n, sr), d = buf.getChannelData(0), sc = 0.8 / (peak || 1);
    for (i = 0; i < n; i++) d[i] = y[i] * sc;
    ksCache[key] = buf;
    return buf;
  }

  var noiseBufs = [];
  function noiseBuf(ctx) {
    for (var i = 0; i < noiseBufs.length; i++) if (noiseBufs[i].ctx === ctx) return noiseBufs[i].buf;
    var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
    noiseBufs.push({ ctx: ctx, buf: b });
    if (noiseBufs.length > 4) noiseBufs.shift();
    return b;
  }
  // 残響のインパルス応答: 減衰するノイズ (後ろほど暗く)
  function makeIR(ctx, T) {
    var sr = ctx.sampleRate, n = Math.floor(sr * T), pre = Math.floor(sr * 0.012), buf = ctx.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = pre; i < n; i++) {
        var t = (i - pre) / sr, a = 0.85 - 0.6 * (t / T);
        lp += ((rnd() * 2 - 1) - lp) * a;
        d[i] = lp * Math.exp(-6.9 * t / T);
      }
    }
    return buf;
  }
  function curve(k) {
    var n = 2048, c = new Float32Array(n), th = Math.tanh(k);
    for (var i = 0; i < n; i++) { var x = i * 2 / (n - 1) - 1; c[i] = Math.tanh(k * x) / th; }
    return c;
  }
  var waves = [];
  function pwave(ctx, name, amps) {
    for (var i = 0; i < waves.length; i++) if (waves[i].ctx === ctx && waves[i].name === name) return waves[i].w;
    var re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    for (i = 0; i < amps.length; i++) im[i + 1] = amps[i];
    var w = ctx.createPeriodicWave(re, im);
    waves.push({ ctx: ctx, name: name, w: w });
    if (waves.length > 24) waves.shift();
    return w;
  }

  // ---------- ミキサー (曲ごと) ----------
  function biq(ctx, type, f, q, gain) {
    var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f;
    if (q !== undefined) b.Q.value = q;
    if (gain !== undefined) b.gain.value = gain;
    return b;
  }
  function makeRig(ctx, out, song) {
    var R = { ctx: ctx, nb: noiseBuf(ctx), song: song };
    var master = ctx.createGain(), lv = ctx.createGain(); lv.gain.value = song.level;   // 音量は圧縮の後で合わせる
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.2;
    master.connect(comp); comp.connect(lv); lv.connect(out);
    R.dry = master;
    var conv = ctx.createConvolver(); conv.buffer = makeIR(ctx, song.verb);
    R.verb = ctx.createGain(); R.verb.connect(conv);
    var vout = ctx.createGain(); vout.gain.value = 0.7; conv.connect(vout); vout.connect(master);
    // ディレイ (フィードバックに低域通過)
    R.delay = ctx.createGain();
    var dl = ctx.createDelay(2), fb = ctx.createGain(), dlp = biq(ctx, 'lowpass', 3000, 0.5), dw = ctx.createGain();
    dl.delayTime.value = song.delay * 60 / song.bpm; fb.gain.value = 0.36; dw.gain.value = 0.55;
    R.delay.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(dw); dw.connect(master);
    return R;
  }
  // 音を定位させて, 残響とディレイへも送る
  function route(R, node, pan, verb, dly) {
    var p = R.ctx.createStereoPanner(); p.pan.value = pan || 0;
    node.connect(p); p.connect(R.dry);
    if (verb) { var v = R.ctx.createGain(); v.gain.value = verb; p.connect(v); v.connect(R.verb); }
    if (dly) { var d = R.ctx.createGain(); d.gain.value = dly; p.connect(d); d.connect(R.delay); }
  }
  function channel(R, o) {   // o: { pan, verb, delay, level, fx: [nodes...] }
    var inp = R.ctx.createGain(), last = inp;
    (o.fx || []).forEach(function (n) { last.connect(n); last = n; });
    var g = R.ctx.createGain(); g.gain.value = o.level === undefined ? 1 : o.level;
    last.connect(g); route(R, g, o.pan, o.verb, o.delay);
    return inp;
  }
  function noise(R, t, dur, dest, filt, v, a) {
    var s = R.ctx.createBufferSource(); s.buffer = R.nb; s.loop = true;
    var g = R.ctx.createGain(), last = s;
    filt.forEach(function (f) { last.connect(f); last = f; });
    last.connect(g); g.connect(dest);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (a || 0.001));
    g.gain.setTargetAtTime(0, t + (a || 0.001), dur / 4);
    s.start(t, rnd() * 1.5); s.stop(t + dur * 1.6 + 0.05);
    return g;
  }

  // ---------- ドラム ----------
  function kick(R, t, v, kind) {
    var ctx = R.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    var f0 = kind === 'techno' ? 170 : (kind === 'soft' ? 95 : 125), f1 = kind === 'techno' ? 46 : 52, dec = kind === 'techno' ? 0.42 : (kind === 'soft' ? 0.22 : 0.32);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + (kind === 'techno' ? 0.09 : 0.06));
    g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t + 0.01, dec / 3.5);
    o.connect(g); g.connect(R.drums); o.start(t); o.stop(t + dec * 1.6);
    noise(R, t, 0.012, R.drums, [biq(ctx, 'highpass', kind === 'soft' ? 2000 : 3500, 0.7)], v * (kind === 'techno' ? 0.35 : 0.22));
  }
  function snare(R, t, v, kind) {
    var ctx = R.ctx;
    if (kind === 'brush') { noise(R, t, 0.16, R.drums, [biq(ctx, 'bandpass', 3200, 0.5)], v * 0.5, 0.006); return; }
    noise(R, t, kind === 'rock' ? 0.24 : 0.18, R.snareBus || R.drums, [biq(ctx, 'highpass', 900, 0.7), biq(ctx, 'peaking', 2500, 0.8, 4)], v * 0.85);
    var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
    o.frequency.setValueAtTime(205, t); o.frequency.exponentialRampToValueAtTime(165, t + 0.08);
    g.gain.setValueAtTime(v * 0.7, t); g.gain.setTargetAtTime(0, t, 0.03);
    o.connect(g); g.connect(R.snareBus || R.drums); o.start(t); o.stop(t + 0.15);
  }
  function hat(R, t, v, open) {
    noise(R, t, open ? 0.32 : 0.045, R.drums, [biq(R.ctx, 'highpass', 7000, 0.8), biq(R.ctx, 'peaking', 10000, 1, 5)], v * 0.55);
  }
  var METAL = [1, 1.342, 1.2312, 1.6532, 1.9523, 2.1523];
  function cymbal(R, t, v, kind) {   // 'crash' | 'ride'
    var ctx = R.ctx, ride = kind === 'ride', g = ctx.createGain(), dec = ride ? 1.1 : 2.2;
    var bp = biq(ctx, 'bandpass', ride ? 6500 : 8000, ride ? 1.2 : 0.6), hp = biq(ctx, 'highpass', ride ? 3500 : 4500, 0.7);
    METAL.forEach(function (r) {
      var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = (ride ? 330 : 420) * r;
      o.connect(bp); o.start(t); o.stop(t + dec * 1.4);
    });
    bp.connect(hp); hp.connect(g); g.connect(R.drums);
    g.gain.setValueAtTime(v * (ride ? 0.18 : 0.22), t); g.gain.setTargetAtTime(0, t + 0.004, dec / 4);
    if (!ride) noise(R, t, 1.6, R.drums, [biq(ctx, 'highpass', 5000, 0.7)], v * 0.35);
    else {   // カップの「チン」
      var b = ctx.createOscillator(), bg = ctx.createGain(); b.frequency.value = 3100;
      bg.gain.setValueAtTime(v * 0.05, t); bg.gain.setTargetAtTime(0, t, 0.12);
      b.connect(bg); bg.connect(R.drums); b.start(t); b.stop(t + 0.6);
      noise(R, t, 0.35, R.drums, [biq(ctx, 'highpass', 8000, 0.7)], v * 0.12);
    }
  }
  function clap(R, t, v) {
    var ctx = R.ctx;
    [0, 0.011, 0.023].forEach(function (d, i) {
      noise(R, t + d, i === 2 ? 0.16 : 0.012, R.snareBus || R.drums, [biq(ctx, 'bandpass', 1300, 1.1), biq(ctx, 'highpass', 700, 0.7)], v * (i === 2 ? 0.9 : 0.6));
    });
  }
  function shaker(R, t, v) { noise(R, t, 0.06, R.drums, [biq(R.ctx, 'bandpass', 6800, 1.3)], v * 0.5, 0.012); }
  function rim(R, t, v) {
    var ctx = R.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 1750; g.gain.setValueAtTime(v * 0.35, t); g.gain.setTargetAtTime(0, t, 0.008);
    o.connect(g); g.connect(R.drums); o.start(t); o.stop(t + 0.06);
    noise(R, t, 0.02, R.drums, [biq(ctx, 'bandpass', 2600, 2)], v * 0.6);
  }
  function tom(R, t, v, f) {
    var ctx = R.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    g.gain.setValueAtTime(v, t); g.gain.setTargetAtTime(0, t, 0.11);
    o.connect(g); g.connect(R.snareBus || R.drums); o.start(t); o.stop(t + 0.6);
  }

  // ---------- 弦の音を鳴らす ----------
  function pluck(R, type, dest, t, m, dur, v, o) {
    o = o || {};
    var ctx = R.ctx, s = ctx.createBufferSource(), g = ctx.createGain(), last = s;
    s.buffer = ksBuffer(ctx, type, m);
    if (o.cents) s.detune.setValueAtTime(o.cents, t);
    if (o.bend) { s.detune.setValueAtTime((o.cents || 0) - o.bend, t); s.detune.linearRampToValueAtTime(o.cents || 0, t + 0.11); }
    if (o.vib && dur > 0.35) {
      var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.6; lg.gain.value = 0;
      lg.gain.setValueAtTime(0, t + 0.2); lg.gain.linearRampToValueAtTime(o.vib, t + 0.45);
      l.connect(lg); lg.connect(s.detune); l.start(t); l.stop(t + dur + 0.1);
    }
    if (o.lp) { var f = biq(ctx, 'lowpass', o.lp, 0.8); s.connect(f); last = f; }
    last.connect(g); g.connect(dest);
    g.gain.setValueAtTime(v, t);
    if (o.mute) g.gain.setTargetAtTime(0, t + 0.015, o.mute);
    else { g.gain.setValueAtTime(v, t + Math.max(0.01, dur - 0.03)); g.gain.linearRampToValueAtTime(0, t + dur); }
    var len = s.buffer.duration;
    s.start(t); s.stop(t + Math.min(len, o.mute ? 0.4 : dur + 0.02));
  }
  // ギターアンプ: 歪み + キャビネットの EQ
  function guitarAmp(R, o) {
    var ctx = R.ctx, ws = ctx.createWaveShaper(); ws.curve = curve(o.k || 3); ws.oversample = '2x';
    var pre = ctx.createGain(); pre.gain.value = o.drive;
    return channel(R, {
      pan: o.pan, verb: o.verb, delay: o.delay, level: o.level,
      fx: [biq(ctx, 'highpass', 110, 0.7), pre, ws, biq(ctx, 'peaking', 650, 1, -5), biq(ctx, 'peaking', 2300, 0.9, 5),
        biq(ctx, 'lowpass', 5200, 0.7), biq(ctx, 'lowpass', 4300, 0.6), biq(ctx, 'highpass', 80, 0.7)]
    });
  }

  // ---------- 鍵盤・管 ----------
  function piano(R, dest, t, m, dur, v) {
    var ctx = R.ctx, f = hz(m);
    var o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g1 = ctx.createGain(), g2 = ctx.createGain();
    o1.setPeriodicWave(pwave(ctx, 'pianoB', [1, 0.6, 0.45, 0.3, 0.22, 0.15, 0.1, 0.07, 0.05]));
    o2.setPeriodicWave(pwave(ctx, 'pianoW', [1, 0.35, 0.1]));
    o1.frequency.value = f; o2.frequency.value = f * 1.0009;
    var low = Math.pow(261 / f, 0.35);
    g1.gain.setValueAtTime(v * 0.5, t); g1.gain.setTargetAtTime(0, t + 0.003, 0.16 * low);
    g2.gain.setValueAtTime(v * 0.55, t); g2.gain.setTargetAtTime(0, t + 0.003, 0.9 * low);
    var off = t + Math.max(0.08, dur);
    g1.gain.setTargetAtTime(0, off, 0.04); g2.gain.setTargetAtTime(0, off, 0.06);
    o1.connect(g1); o2.connect(g2); g1.connect(dest); g2.connect(dest);
    o1.start(t); o2.start(t); o1.stop(off + 0.4); o2.stop(off + 0.4);
    noise(R, t, 0.015, dest, [biq(ctx, 'lowpass', 2500, 0.7)], v * 0.08);
  }
  function vibes(R, dest, t, m, dur, v) {
    var ctx = R.ctx, f = hz(m), o = ctx.createOscillator(), o4 = ctx.createOscillator(), g = ctx.createGain(), g4 = ctx.createGain(), am = ctx.createGain();
    o.frequency.value = f; o4.frequency.value = f * 3.98;
    // モーターの揺れ
    var lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5.2; lg.gain.value = 0.22;
    am.gain.value = 0.78; lfo.connect(lg); lg.connect(am.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, 1.1);
    g4.gain.setValueAtTime(v * 0.28, t); g4.gain.setTargetAtTime(0, t, 0.09);
    var off = t + dur + 0.08;
    g.gain.setTargetAtTime(0, off, 0.07);
    o.connect(g); o4.connect(g4); g.connect(am); g4.connect(am); am.connect(dest);
    [o, o4, lfo].forEach(function (x) { x.start(t); x.stop(off + 0.5); });
  }
  function flute(R, dest, t, m, dur, v) {
    var ctx = R.ctx, f = hz(m), o = ctx.createOscillator(), g = ctx.createGain();
    o.setPeriodicWave(pwave(ctx, 'flute', [1, 0.22, 0.09, 0.03]));
    o.frequency.value = f;
    if (dur > 0.4) {
      var l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 5.2;
      lg.gain.setValueAtTime(0, t + 0.25); lg.gain.linearRampToValueAtTime(14, t + 0.55);
      l.connect(lg); lg.connect(o.detune); l.start(t); l.stop(t + dur + 0.2);
    }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.06);
    g.gain.setValueAtTime(v * 0.9, t + Math.max(0.07, dur - 0.08)); g.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.1);
    // 息の音 (吹き始めに強く, あとは薄く)
    var ns = ctx.createBufferSource(), nf = biq(ctx, 'bandpass', f * 2, 3), ng = ctx.createGain();
    ns.buffer = R.nb; ns.loop = true;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(v * 0.14, t + 0.04);
    ng.gain.setTargetAtTime(v * 0.04, t + 0.05, 0.05);
    ng.gain.setValueAtTime(v * 0.04, t + dur); ng.gain.linearRampToValueAtTime(0, t + dur + 0.06);
    ns.connect(nf); nf.connect(ng); ng.connect(dest); ns.start(t, rnd() * 1.5); ns.stop(t + dur + 0.1);
  }
  // ---------- シンセ (テクノ) ----------
  function sawVoice(R, dest, t, f, dur, v, o) {   // o: { det, cut, cutEnd, q, a, rel }
    var ctx = R.ctx, flt = biq(ctx, 'lowpass', o.cut, o.q || 1), g = ctx.createGain();
    (o.det || [0]).forEach(function (c) {
      var s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = f; s.detune.value = c;
      s.connect(flt); s.start(t); s.stop(t + dur + (o.rel || 0.1) * 5);
    });
    flt.frequency.setValueAtTime(o.cut, t);
    if (o.cutEnd) flt.frequency.setTargetAtTime(o.cutEnd, t, o.cutT || 0.08);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + (o.a || 0.004));
    if (o.sus === false) g.gain.setTargetAtTime(0, t + (o.a || 0.004), dur / 3);
    else { g.gain.setValueAtTime(v, t + dur); g.gain.setTargetAtTime(0, t + dur, o.rel || 0.05); }
    flt.connect(g); g.connect(dest);
  }

  // ============================================================
  //  曲
  // ============================================================
  var SONGS = {};
  function pc(root) { return [root, root + 7, root + 12]; }   // パワーコード

  // ---------- 夏: ハードロック (E, 140bpm) ----------
  //  2 小節のリフ: ブリッジミュートの刻み + 単音 + 最後にコードを「ダ・ダーン」
  var E2 = 40, G2 = 43, A2 = 45, Bb2 = 46, B2 = 47, D3 = 50, E3 = 52;
  var RIFF = [
    [[0, 'pm', E2, 1], [1, 'pm', E2, 1], [2, 'n', G2, 1], [3, 'pm', E2, 1], [4, 'n', A2, 1], [5, 'pm', E2, 1], [6, 'n', Bb2, 1], [7, 'n', A2, 1],
      [8, 'n', G2, 2], [10, 'pm', E2, 1], [11, 'pm', E2, 1], [12, 'pc', D3, 1], [13, 'pc', E3, 3]],
    [[0, 'pm', E2, 1], [1, 'pm', E2, 1], [2, 'n', G2, 1], [3, 'pm', E2, 1], [4, 'n', A2, 1], [5, 'pm', E2, 1], [6, 'n', B2, 1], [7, 'n', D3, 1],
      [8, 'n', E3, 2, 200], [10, 'n', D3, 1], [11, 'n', B2, 1], [12, 'pc', G2, 2], [14, 'pc', A2, 2]]
  ];
  // サビ: パワーコードを刻む (C5 → D5 → E5 → E5, 最後は G A B と駆け上がる)
  var CHORUS_ROOTS = [mi('C3'), mi('D3'), E2, E2];
  var CHORUS_HIT = [[0, 'pc', 2], [2, 'pmc', 1], [3, 'pmc', 1], [4, 'pc', 2], [6, 'pmc', 1], [7, 'pmc', 1], [8, 'pc', 4], [12, 'pc', 2], [14, 'pmc', 1], [15, 'pmc', 1]];
  // リードギター (5〜12 小節目): [小節, ステップ, 音, 長さ, チョーキング(セント)]
  var LEAD = [
    [4, 0, 'B4', 6, 200], [4, 6, 'D5', 2], [4, 8, 'E5', 8],
    [5, 0, 'D5', 2], [5, 2, 'B4', 2], [5, 4, 'A4', 4], [5, 8, 'G4', 4], [5, 12, 'E4', 4],
    [6, 0, 'G4', 4], [6, 4, 'A4', 4], [6, 8, 'B4', 2], [6, 10, 'D5', 2], [6, 12, 'E5', 4, 200],
    [7, 0, 'G5', 8], [7, 8, 'E5', 4], [7, 12, 'D5', 4],
    [8, 0, 'E5', 6], [8, 6, 'D5', 2], [8, 8, 'C5', 4], [8, 12, 'D5', 4],
    [9, 0, 'F#5', 6, 200], [9, 6, 'E5', 2], [9, 8, 'D5', 4], [9, 12, 'A4', 4],
    [10, 0, 'G5', 6], [10, 6, 'F#5', 2], [10, 8, 'E5', 4], [10, 12, 'B4', 4],
    [11, 0, 'E5', 8], [11, 8, 'G5', 2], [11, 10, 'A5', 2], [11, 12, 'B5', 4, 200]
  ];
  SONGS.summer = {
    bpm: 140, bars: 16, level: 0.44, verb: 1.1, delay: 0.75,
    setup: function (R) {
      var ctx = R.ctx;
      R.drums = channel(R, { verb: 0.12, level: 0.95 });
      R.snareBus = channel(R, { verb: 0.35, level: 0.95 });
      R.gL = guitarAmp(R, { drive: 22, k: 3, pan: -0.8, level: 0.36, verb: 0.08 });
      R.gR = guitarAmp(R, { drive: 22, k: 3, pan: 0.8, level: 0.36, verb: 0.08 });
      R.lead = guitarAmp(R, { drive: 40, k: 3.5, pan: 0.1, level: 0.3, verb: 0.3, delay: 0.32 });
      var bws = ctx.createWaveShaper(); bws.curve = curve(1.6);
      R.bass = channel(R, { level: 0.75, fx: [biq(ctx, 'lowpass', 1100, 0.7), bws, biq(ctx, 'highpass', 35, 0.7)] });
    },
    bar: function (R, b, at, sd) {
      var riffBar = b < 8 || b >= 12, gtr = [], i;
      if (riffBar) {
        RIFF[b % 2].forEach(function (e) { gtr.push({ s: e[0], k: e[1], ms: e[1] === 'pc' ? pc(e[2]) : [e[2]], len: e[3], bend: e[4] }); });
      } else {
        var root = CHORUS_ROOTS[b - 8];
        CHORUS_HIT.forEach(function (h) {
          if (b === 11 && h[0] >= 8) return;
          gtr.push({ s: h[0], k: h[1], ms: h[1] === 'pmc' ? [root, root + 7] : pc(root), len: h[2] });
        });
        if (b === 11) [[8, G2, 2], [10, A2, 2], [12, B2, 4]].forEach(function (h) { gtr.push({ s: h[0], k: 'pc', ms: pc(h[1]), len: h[2] }); });
      }
      // ギター 2 本 (左右に少しずらして重ねる)
      gtr.forEach(function (e) {
        var dur = e.len * sd, mute = e.k === 'pm' || e.k === 'pmc';
        [[R.gL, 0, -4], [R.gR, 0.007, 5]].forEach(function (G2c) {
          e.ms.forEach(function (m, j) {
            pluck(R, 'egtr', G2c[0], at(e.s) + G2c[1] + j * 0.003, m, dur, mute ? 0.9 : 0.75 / Math.sqrt(e.ms.length),
              { cents: G2c[2], mute: mute ? 0.045 : 0, lp: mute ? 750 : 0, bend: e.bend, vib: e.k === 'n' ? 18 : 0 });
          });
        });
        // ベース: リフの低音を 1 オクターブ下で
        var bm = e.ms[0] - 12;
        if (riffBar && e.k !== 'pc') bm = E2 - 12;
        pluck(R, 'ebass', R.bass, at(e.s), bm, Math.max(dur, sd * 0.9), mute ? 0.75 : 0.85, { mute: mute ? 0.09 : 0 });
      });
      // リード
      LEAD.forEach(function (e) {
        if (e[0] !== b) return;
        pluck(R, 'egtr', R.lead, at(e[1]), mi(e[2]), e[3] * sd, 0.8, { bend: e[4], vib: 28 });
      });
      // ドラム
      var fill = b === 15;
      for (i = 0; i < 16; i += 2) if (!fill || i < 8) hat(R, at(i), i % 4 === 0 ? 0.55 : 0.4, b >= 8 && b < 12 && i % 4 === 2);
      [0, 8, 10].forEach(function (s) { kick(R, at(s), 1.0, 'rock'); });
      if (riffBar && b % 2 === 1) kick(R, at(14), 0.8, 'rock');
      snare(R, at(4), 0.9, 'rock');
      if (!fill) snare(R, at(12), 0.95, 'rock');
      else {
        [12, 13].forEach(function (s) { tom(R, at(s), 0.9, 150); });
        [14, 15].forEach(function (s) { tom(R, at(s), 1.0, 100); });
        [9, 11].forEach(function (s) { snare(R, at(s), 0.6, 'rock'); });
      }
      if (b === 0 || b === 8 || b === 12) cymbal(R, at(0), 1, 'crash');
    }
  };

  // ---------- 秋: ボサノバ (D, 132bpm) ----------
  //  ナイロン弦ギター (親指で低音, 指でコード) + シェイカーとリムのクラーベ + フルートの旋律
  var BOSSA_CH = [   // [コード (指), 低音の根音, 5 度]
    [['F#3', 'A3', 'C#4', 'E4'], 'D2', 'A2'], [['F#3', 'A3', 'C#4', 'E4'], 'D2', 'A2'],
    [['G3', 'B3', 'D4', 'F#4'], 'E2', 'B2'], [['G3', 'C#4', 'F#4'], 'A2', 'E2'],
    [['A3', 'C#4', 'E4'], 'F#2', 'C#3'], [['A3', 'C4', 'D#4'], 'B1', 'F#2'],
    [['G3', 'B3', 'D4', 'F#4'], 'E2', 'B2'], [['G3', 'D4', 'E4'], 'A2', 'E2'],
    [['F#3', 'A3', 'C#4', 'E4'], 'D2', 'A2'], [['G3', 'C4', 'E4'], 'A2', 'D2'],
    [['F#3', 'B3', 'D4'], 'G2', 'D2'], [['Bb3', 'D4', 'E4'], 'G2', 'D2'],
    [['A3', 'C#4', 'E4'], 'F#2', 'C#3'], [['A3', 'C4', 'D#4'], 'B1', 'F#2'],
    [['G3', 'B3', 'D4', 'F#4'], 'E2', 'B2'], [['G3', 'C#4', 'F#4'], 'A2', 'E2']
  ];
  var BOSSA_HITS = [[0, 4, 10, 14], [2, 8, 12]];
  var BOSSA_MEL = [
    [0, 4, 'F#5', 2], [0, 6, 'A5', 2], [0, 8, 'C#6', 6], [0, 14, 'B5', 2],
    [1, 0, 'A5', 8], [1, 8, 'F#5', 4], [1, 12, 'E5', 4],
    [2, 0, 'G5', 6], [2, 6, 'F#5', 2], [2, 8, 'E5', 4], [2, 12, 'D5', 4],
    [3, 0, 'C#5', 8], [3, 8, 'E5', 4], [3, 12, 'F#5', 4],
    [4, 0, 'A5', 6], [4, 6, 'F#5', 2], [4, 8, 'C#6', 8],
    [5, 0, 'C6', 6], [5, 6, 'B5', 2], [5, 8, 'A5', 4], [5, 12, 'F#5', 4],
    [6, 0, 'G5', 6], [6, 6, 'F#5', 2], [6, 8, 'E5', 8],
    [7, 0, 'D5', 4], [7, 4, 'E5', 4], [7, 8, 'C#5', 8],
    [8, 0, 'D5', 2], [8, 2, 'E5', 2], [8, 4, 'F#5', 2], [8, 6, 'A5', 2], [8, 8, 'C#6', 4], [8, 12, 'D6', 4],
    [9, 0, 'C6', 6], [9, 6, 'B5', 2], [9, 8, 'A5', 4], [9, 12, 'F#5', 4],
    [10, 0, 'B5', 8], [10, 8, 'A5', 4], [10, 12, 'F#5', 4],
    [11, 0, 'Bb5', 8], [11, 8, 'G5', 4], [11, 12, 'E5', 4],
    [12, 0, 'A5', 6], [12, 6, 'F#5', 2], [12, 8, 'E5', 4], [12, 12, 'C#5', 4],
    [13, 0, 'D#5', 6], [13, 6, 'F#5', 2], [13, 8, 'A5', 4], [13, 12, 'C6', 4],
    [14, 0, 'B5', 8], [14, 8, 'G5', 4], [14, 12, 'F#5', 4],
    [15, 0, 'E5', 8], [15, 8, 'C#5', 4], [15, 12, 'A4', 4]
  ];
  SONGS.autumn = {
    bpm: 132, bars: 16, level: 0.78, verb: 1.4, delay: 0.75,
    setup: function (R) {
      var ctx = R.ctx;
      R.drums = channel(R, { verb: 0.2, level: 0.8 });
      R.gtr = channel(R, { pan: -0.15, verb: 0.22, level: 0.8, fx: [biq(ctx, 'peaking', 210, 1, 3), biq(ctx, 'lowpass', 5200, 0.7), biq(ctx, 'highpass', 60, 0.7)] });
      R.mel = channel(R, { pan: 0.2, verb: 0.38, delay: 0.12, level: 0.42 });
    },
    bar: function (R, b, at, sd) {
      var ch = BOSSA_CH[b], hits = BOSSA_HITS[b % 2], i;
      // 親指の低音 (1 拍目に根音, 3 拍目に 5 度)
      pluck(R, 'nylon', R.gtr, at(0), mi(ch[1]), sd * 7.5, 0.95, { lp: 1600 });
      pluck(R, 'nylon', R.gtr, at(8), mi(ch[2]), sd * 7.5, 0.85, { lp: 1600 });
      // 指のコード (少し短めに切る)
      hits.forEach(function (s, k) {
        var next = k + 1 < hits.length ? hits[k + 1] : 16 + BOSSA_HITS[(b + 1) % 2][0];
        var dur = Math.min(next - s, 3) * sd, v = 0.42 * (0.9 + rnd() * 0.2);
        ch[0].forEach(function (n, j) { pluck(R, 'nylon', R.gtr, at(s) + j * 0.007, mi(n), dur, v); });
      });
      // パーカッション
      for (i = 0; i < 16; i++) shaker(R, at(i), [0.5, 0.25, 0.4, 0.28][i % 4]);
      (b % 2 === 0 ? [0, 6, 12] : [4, 10]).forEach(function (s) { rim(R, at(s), 0.7); });
      kick(R, at(0), 0.55, 'soft'); kick(R, at(8), 0.45, 'soft');
      hat(R, at(4), 0.22); hat(R, at(12), 0.22);
      // フルート
      BOSSA_MEL.forEach(function (e) { if (e[0] === b) flute(R, R.mel, at(e[1]), mi(e[2]), e[3] * sd * 0.95, 0.5); });
    }
  };

  // ---------- 冬: ジャズ (E♭, 150bpm スウィング) ----------
  //  ウッドベースのウォーキング, ライドシンバル, ピアノのコンピング, ビブラフォンの旋律
  var QUAL = { maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], '7': [0, 4, 7, 10], '7b9': [0, 4, 7, 10] };
  var VOICE = { maj7: [4, 7, 11, 14], m7: [3, 7, 10, 14], '7': [4, 9, 10, 14], '7b9': [4, 7, 10, 13] };
  function jchord(sym) { var m = /^([A-G][b#]?)(.*)$/.exec(sym); return { root: NOTE[m[1]], q: m[2] }; }
  var JAZZ_CH = [
    ['Ebmaj7'], ['Cm7'], ['Fm7'], ['Bb7'], ['Gm7'], ['C7b9'], ['Fm7'], ['Bb7'],
    ['Ebmaj7'], ['Eb7'], ['Abmaj7'], ['Db7'], ['Gm7', 'C7'], ['Fm7', 'Bb7'], ['Ebmaj7', 'C7b9'], ['Fm7', 'Bb7']
  ];
  var COMP = [[[0, 3], [6, 2]], [[2, 2], [10, 3]], [[4, 2], [14, 2]], [[0, 2], [8, 2], [14, 2]]];
  var JAZZ_MEL = [
    [0, 0, 'G5', 4], [0, 4, 'Bb5', 4], [0, 8, 'D6', 6], [0, 14, 'C6', 2],
    [1, 0, 'Bb5', 8], [1, 8, 'G5', 4], [1, 12, 'Eb5', 4],
    [2, 0, 'Ab5', 4], [2, 4, 'C6', 4], [2, 8, 'Eb6', 6], [2, 14, 'D6', 2],
    [3, 0, 'D6', 4], [3, 4, 'C6', 2], [3, 6, 'Bb5', 2], [3, 8, 'Ab5', 4], [3, 12, 'F5', 4],
    [4, 0, 'G5', 6], [4, 6, 'Bb5', 2], [4, 8, 'D6', 8],
    [5, 0, 'Db6', 6], [5, 6, 'C6', 2], [5, 8, 'Bb5', 4], [5, 12, 'G5', 4],
    [6, 0, 'Ab5', 8], [6, 8, 'C6', 4], [6, 12, 'Bb5', 4],
    [7, 0, 'Ab5', 4], [7, 4, 'G5', 4], [7, 8, 'F5', 8],
    [8, 0, 'Eb5', 2], [8, 2, 'G5', 2], [8, 4, 'Bb5', 2], [8, 6, 'D6', 2], [8, 8, 'F6', 4], [8, 12, 'D6', 4],
    [9, 0, 'Db6', 8], [9, 8, 'Bb5', 4], [9, 12, 'G5', 4],
    [10, 0, 'C6', 6], [10, 6, 'Eb6', 2], [10, 8, 'C6', 8],
    [11, 0, 'F5', 4], [11, 4, 'Ab5', 4], [11, 8, 'B5', 8],
    [12, 0, 'Bb5', 4], [12, 4, 'G5', 4], [12, 8, 'E5', 4], [12, 12, 'G5', 4],
    [13, 0, 'Ab5', 4], [13, 4, 'F5', 4], [13, 8, 'D5', 4], [13, 12, 'F5', 4],
    [14, 0, 'G5', 8], [14, 8, 'Bb5', 4], [14, 12, 'G5', 4],
    [15, 0, 'Ab5', 4], [15, 4, 'C6', 4], [15, 8, 'D6', 4], [15, 12, 'Bb5', 4]
  ];
  // ウォーキングベース: 1 拍目は根音, 4 拍目は次の根音へ半音で寄る
  function near(pcls, around) { var m = pcls + 12 * Math.round((around - pcls) / 12); return m; }
  function walkBar(b) {
    var chs = JAZZ_CH[b].map(jchord), nxt = jchord(JAZZ_CH[(b + 1) % 16][0]), out = [];
    var r1 = near(chs[0].root, 38), q1 = QUAL[chs[0].q];
    var nr = near(nxt.root, 38), app = nr + (b % 2 ? 1 : -1);
    if (chs.length === 1) {
      out = [r1, r1 + (b % 2 ? q1[2] : q1[1]), r1 + (b % 2 ? q1[1] + 12 : q1[2]), app];
    } else {
      var r2 = near(chs[1].root, r1);
      out = [r1, r2 + (b % 2 ? -1 : 1), r2, app];
    }
    return out.map(function (m) { while (m < 31) m += 12; while (m > 50) m -= 12; return m; });
  }
  SONGS.winter = {
    bpm: 150, bars: 16, level: 0.79, verb: 1.5, delay: 0.5, swing: 0.6,
    setup: function (R) {
      var ctx = R.ctx;
      R.drums = channel(R, { verb: 0.22, level: 1.15 });
      R.bass = channel(R, { pan: -0.1, verb: 0.1, level: 1.0, fx: [biq(ctx, 'lowpass', 900, 0.7), biq(ctx, 'peaking', 120, 1, 3)] });
      R.piano = channel(R, { pan: -0.3, verb: 0.3, level: 0.5, fx: [biq(ctx, 'lowpass', 5000, 0.7)] });
      R.mel = channel(R, { pan: 0.3, verb: 0.4, delay: 0.08, level: 0.55 });
    },
    bar: function (R, b, at, sd) {
      var chs = JAZZ_CH[b], i;
      walkBar(b).forEach(function (m, k) { pluck(R, 'upright', R.bass, at(k * 4), m, sd * 3.6, 0.9, { lp: 1200 }); });
      // ピアノ (ルートなしのヴォイシング)
      var comp = chs.length === 2 ? [[0, 3], [8, 3]] : COMP[b % 4];
      comp.forEach(function (c) {
        var cc = jchord(chs.length === 2 && c[0] >= 8 ? chs[1] : chs[0]), iv = VOICE[cc.q];
        var base = near(cc.root, 52 - iv[0] + 5);
        if (base + iv[0] < 50) base += 12;
        iv.forEach(function (x, j) { piano(R, R.piano, at(c[0]) + j * 0.004, base + x, c[1] * sd, 0.32); });
      });
      // ライド: チーン チッキ チーン チッキ
      [[0, 0.6], [4, 0.45], [6, 0.32], [8, 0.6], [12, 0.45], [14, 0.32]].forEach(function (h) { cymbal(R, at(h[0]), h[1], 'ride'); });
      hat(R, at(4), 0.3); hat(R, at(12), 0.3);
      for (i = 0; i < 16; i += 4) kick(R, at(i), 0.18, 'soft');
      if (b % 2 === 1) snare(R, at(14), 0.5, 'brush');
      if (b % 4 === 2) snare(R, at(10), 0.4, 'brush');
      if (b === 0) cymbal(R, at(0), 0.5, 'crash');
      JAZZ_MEL.forEach(function (e) { if (e[0] === b) vibes(R, R.mel, at(e[1]), mi(e[2]), e[3] * sd * 0.9, 0.45); });
    }
  };

  // ---------- 春: テクノ (Am, 128bpm) ----------
  //  4 つ打ち, アシッドベース, コードのスタブ, パッド, アルペジオ
  var SCALE = [0, 2, 3, 5, 7, 8, 10];               // A ナチュラルマイナー
  var TECH_ROOT = [0, 5, 2, 6];                     // Am F C G (A マイナーの音階の何番目か)
  var ACID = [[0, 1], [0, 0], [7, 0], [0, 0], null, [0, 0], [6, 0], [0, 2], [7, 1], [0, 0], [4, 0], [0, 0], null, [2, 0], [0, 1], [7, 2]];   // [度数, 1=アクセント 2=スライド]
  function scaleNote(deg, base) { var o = Math.floor(deg / 7), d = ((deg % 7) + 7) % 7; return base + SCALE[d] + 12 * o; }
  var TECH_STAB = { 0: ['A3', 'C4', 'E4'], 5: ['F3', 'A3', 'C4'], 2: ['G3', 'C4', 'E4'], 6: ['G3', 'B3', 'D4'] };
  SONGS.spring = {
    bpm: 128, bars: 16, level: 0.61, verb: 1.6, delay: 0.75,
    setup: function (R) {
      var ctx = R.ctx;
      R.drums = channel(R, { verb: 0.08, level: 0.9 });
      R.snareBus = channel(R, { verb: 0.35, level: 0.8 });
      var ws = ctx.createWaveShaper(); ws.curve = curve(2.2);
      R.acid = channel(R, { delay: 0.14, verb: 0.05, level: 0.32, fx: [ws, biq(ctx, 'highpass', 45, 0.7)] });
      R.stab = channel(R, { verb: 0.35, delay: 0.38, level: 0.22 });
      R.pad = channel(R, { verb: 0.55, level: 0.16 });
      R.arp = channel(R, { pan: 0.25, delay: 0.4, verb: 0.25, level: 0.13 });
    },
    bar: function (R, b, at, sd) {
      var rootDeg = TECH_ROOT[b % 4], base = rootDeg >= 4 ? 21 : 33, i;   // F と G は 1 オクターブ下から
      // アシッドベース: 16 小節かけてフィルタが開いていく
      var open = b < 8 ? 380 + b * 50 : (b < 12 ? 800 + (b - 8) * 380 : 1500);
      var prevF = null;
      ACID.forEach(function (a, s) {
        if (!a) { prevF = null; return; }
        var m = scaleNote(rootDeg + a[0], base), f = hz(m), acc = a[1] === 1, slide = a[1] === 2;
        var t = at(s), dur = sd * (slide ? 1.05 : 0.6);
        var ctx = R.ctx, o = ctx.createOscillator(), flt = biq(ctx, 'lowpass', open, 13), g = ctx.createGain();
        o.type = 'sawtooth';
        if (slide && prevF) { o.frequency.setValueAtTime(prevF, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); } else o.frequency.setValueAtTime(f, t);
        flt.frequency.setValueAtTime(open + (acc ? 1700 : 700), t); flt.frequency.setTargetAtTime(open * 0.6, t, acc ? 0.09 : 0.05);
        g.gain.setValueAtTime(acc ? 0.9 : 0.55, t); g.gain.setValueAtTime(acc ? 0.9 : 0.55, t + dur - 0.01); g.gain.linearRampToValueAtTime(0, t + dur);
        o.connect(flt); flt.connect(g); g.connect(R.acid); o.start(t); o.stop(t + dur + 0.02);
        prevF = f;
      });
      // ドラム
      var build = b === 11;
      for (i = 0; i < 16; i += 4) if (!(build && i === 12)) kick(R, at(i), 1.0, 'techno');
      for (i = 0; i < 16; i++) hat(R, at(i), [0.26, 0.14, 0.3, 0.14][i % 4]);
      if (b >= 2) [2, 6, 10, 14].forEach(function (s) { hat(R, at(s), 0.32, true); });
      if (b >= 4) { clap(R, at(4), 0.8); if (!build) clap(R, at(12), 0.8); }
      if (build) for (i = 12; i < 16; i++) clap(R, at(i), 0.35 + (i - 12) * 0.12);
      if (b === 0 || b === 4 || b === 12) cymbal(R, at(0), 0.8, 'crash');
      // ライザー (12 小節目)
      if (build) {
        var ctx2 = R.ctx, s = ctx2.createBufferSource(); s.buffer = R.nb; s.loop = true;
        var bp = biq(ctx2, 'bandpass', 400, 1.5), g2 = ctx2.createGain(), t0 = at(0), t1 = at(16);
        bp.frequency.setValueAtTime(400, t0); bp.frequency.exponentialRampToValueAtTime(9000, t1);
        g2.gain.setValueAtTime(0, t0); g2.gain.linearRampToValueAtTime(0.35, t1);
        s.connect(bp); bp.connect(g2); g2.connect(R.snareBus); s.start(t0); s.stop(t1 + 0.05);
      }
      // スタブ (5 小節目から)
      var chord = TECH_STAB[rootDeg].map(mi);
      if (b >= 4) [3, 6, 10].forEach(function (s, k) {
        chord.forEach(function (m) { sawVoice(R, R.stab, at(s), hz(m), sd * 1.2, 0.3, { det: [-9, 8], cut: 2800, cutEnd: 700, cutT: 0.07, sus: false }); });
      });
      // パッド (9 小節目から)
      if (b >= 8) chord.forEach(function (m) { sawVoice(R, R.pad, at(0), hz(m - 12), sd * 15.5, 0.28, { det: [-12, 11], cut: 1300, a: 0.5, rel: 0.5 }); });
      // アルペジオ (13 小節目から)
      if (b >= 12) for (i = 0; i < 16; i++) {
        var am = chord[i % 3] + 12 + (i % 6 >= 3 ? 12 : 0);
        sawVoice(R, R.arp, at(i), hz(am), sd * 0.5, 0.35, { cut: 3200, cutEnd: 900, cutT: 0.04, sus: false });
      }
    }
  };

  // ============================================================
  //  鳴らし方
  // ============================================================
  B.has = function (key) { return !!SONGS[key]; };
  B.barDur = function (key) { return 60 / SONGS[key].bpm * 4; };
  B.loopDur = function (key) { return B.barDur(key) * SONGS[key].bars; };

  // 曲 key を t0 秒から並べる準備。play(k) で k 小節目の音を予約する
  function composer(ctx, dest, key, t0) {
    var song = SONGS[key], R = makeRig(ctx, dest, song);
    var sd = 60 / song.bpm / 4, bar = sd * 16;
    song.setup(R);
    return {
      bar: bar, bars: song.bars,
      play: function (k) {
        var tb = t0 + k * bar;
        song.bar(R, k % song.bars, function (s) { return tb + s * sd + (song.swing && s % 4 === 2 ? song.swing * sd : 0); }, sd);
      }
    };
  }
  // 曲 key を ctx の t0〜t1 秒に並べる (dest へ出力)。動画用に全部まとめて予約する
  function compose(ctx, dest, key, t0, t1) {
    var c = composer(ctx, dest, key, t0);
    for (var k = 0; t0 + k * c.bar < t1 - 0.001; k++) c.play(k);
  }
  B.compose = compose;

  // ゲーム用: 1 周 (16 小節) を書き出して, はみ出した残響を頭に重ねた継ぎ目のないループにする
  var loops = {}, LOOP_SR = 32000;
  B.loop = function (key) {
    if (loops[key]) return loops[key];
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var len = B.loopDur(key), tail = 2.5, n = Math.ceil(len * LOOP_SR), m = Math.ceil((len + tail) * LOOP_SR);
    var oc = new OAC(2, m, LOOP_SR), c = composer(oc, oc.destination, key, 0);
    // 予約したまま待っている音も毎回処理されて重くなるので, 1 小節先の分だけを予約しながら書き出す
    c.play(0); c.play(1);
    for (var k = 1; k < c.bars - 1; k++) {
      (function (k) { oc.suspend(k * c.bar).then(function () { c.play(k + 1); oc.resume(); }); })(k);
    }
    loops[key] = oc.startRendering().then(function (buf) {
      var out = oc.createBuffer(2, n, LOOP_SR);
      for (var ch = 0; ch < 2; ch++) {
        var src = buf.getChannelData(ch), dst = out.getChannelData(ch);
        dst.set(src.subarray(0, n));
        for (var i = n; i < m; i++) dst[i - n] += src[i];
      }
      ksCache = {};   // 弦の波形は書き出したら捨てる (メモリ節約)
      return out;
    });
    return loops[key];
  };
})();
