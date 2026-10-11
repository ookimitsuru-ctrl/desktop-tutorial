'use strict';
// ============================================================
//  music.js  チップチューン風 BGM シーケンサ
//  曲はオリジナル (エンディングは日本古謡「さくらさくら」の編曲)
//  記法: 1 小節 = 16 ステップ (16分音符)
//    音名+オクターブ = 発音,  '-' = 伸ばす,  '.' = 休符
// ============================================================
(function () {
  var M = G.Music = { current: null, pending: null };
  var NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
  function midi(tok) {
    var m = /^([A-G][#b]?)(-?\d)$/.exec(tok);
    return m ? 12 * (+m[2] + 1) + NOTE[m[1]] : null;
  }
  function hz(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  var QUAL = {
    '': [0, 4, 7], 'm': [0, 3, 7], '7': [0, 4, 7, 10], 'maj7': [0, 4, 7, 11], 'm7': [0, 3, 7, 10],
    'sus4': [0, 5, 7], '7sus4': [0, 5, 7, 10], 'add9': [0, 4, 7, 14], 'm7b5': [0, 3, 6, 10], 'dim': [0, 3, 6],
    '6': [0, 4, 7, 9], 'm6': [0, 3, 7, 9], 'm9': [0, 3, 7, 10, 14], '9': [0, 4, 7, 10, 14], 'maj9': [0, 4, 7, 11, 14]
  };
  function chord(sym) {
    var bass = null, s = sym;
    if (s.indexOf('/') > 0) { bass = s.split('/')[1]; s = s.split('/')[0]; }
    var m = /^([A-G][#b]?)(.*)$/.exec(s);
    var root = NOTE[m[1]], iv = QUAL[m[2]] || QUAL[''];
    return { root: root, iv: iv, bass: bass ? NOTE[bass] : root };
  }

  // ---------------- 曲データ ----------------
  var SONGS = {
    title: {
      bpm: 150,
      chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm7', 'G7'],
      lead: [
        'E5 - G5 - C6 - - - B5 - G5 - E5 - - -', 'A5 - - - C6 - - - E6 - - - C6 - - -',
        'F5 - A5 - C6 - - - A5 - F5 - C5 - - -', 'D5 - - - G5 - - - B5 - - - D6 - - -',
        'E6 - - - D6 - C6 - D6 - E6 - G6 - - -', 'E6 - - - C6 - - - A5 - - - C6 - - -',
        'D6 - - - C6 - A5 - F5 - - - A5 - - -', 'G5 - - - - - - - B5 - - - D6 - - -'
      ],
      bass: 'R - . R O . R . R - . F O . F R', arp: 'up8', drums: 'k . h . s . h k . k h . s . h h'
    },
    summer: {
      bpm: 148,
      chords: ['Fmaj7', 'Em7 A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'Am7', 'Gm7', 'C7sus4 C7',
        'Fmaj7', 'Em7 A7', 'Dm7', 'Cm7 F7', 'Bbmaj7', 'Am7', 'Gm7', 'C7'],
      lead: [
        'A5 - - - C6 - - A5 - - G5 - F5 - - -', 'G5 - - E5 - - G5 - A5 - - - . . . .',
        'F5 - - D5 - - F5 - A5 - - G5 - - F5 -', 'Eb5 - - D5 - - C5 - Eb5 - F5 - G5 - A5 -',
        'D6 - - - C6 - - A5 - - Bb5 - A5 - G5 -', 'E5 - - - G5 - - A5 - - - - C6 - - -',
        'Bb5 - - A5 - - G5 - F5 - - G5 - - A5 -', 'G5 - - - - - - - E5 - F5 - G5 - Bb5 -',
        'C6 - - A5 - - C6 - D6 - C6 - A5 - - -', 'G5 - - E5 - - C#6 - - - A5 - - - . .',
        'D6 - - C6 - - A5 - - - F5 - A5 - C6 -', 'Eb6 - - - D6 - C6 - A5 - - - F5 - - -',
        'F5 - G5 - A5 - D6 - - - C6 - Bb5 - A5 -', 'G5 - - - E5 - - - C5 - D5 - E5 - G5 -',
        'F5 - - - G5 - - - A5 - - - Bb5 - C6 -', '- - - - . . . . C6 - Bb5 - A5 - G5 -'
      ],
      bass: 'R - . R O . R . R - . F O . F R', arp: 'up16', drums: 'k . h . s . h k . k h . s . h h'
    },
    autumn: {
      bpm: 112,
      chords: ['Am9', 'Dm9', 'G7', 'Cmaj7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7',
        'Am9', 'Dm9', 'G7', 'Cmaj7', 'Fmaj7', 'Bm7b5', 'E7', 'Am7'],
      lead: [
        'E5 - - - D5 - C5 - B4 - C5 - D5 - - -', 'F5 - - - E5 - D5 - A4 - - - C5 - D5 -',
        'B4 - - - D5 - F5 - - - E5 - D5 - - -', 'E5 - - - - - - - G5 - - - E5 - - -',
        'A5 - - - G5 - F5 - E5 - - - C5 - - -', 'D5 - - - F5 - - - A5 - - - G5 - F5 -',
        'G#5 - - - - - - - B5 - - - G#5 - E5 -', 'A5 - - - - - - - - - - - . . . .',
        'C6 - - - B5 - A5 - G5 - A5 - B5 - - -', 'A5 - - - G5 - F5 - D5 - - - F5 - A5 -',
        'G5 - - - F5 - D5 - B4 - - - D5 - G5 -', 'E5 - - - - - - - C5 - D5 - E5 - G5 -',
        'A5 - - - C6 - - - A5 - G5 - F5 - - -', 'F5 - - - D5 - - - B4 - D5 - F5 - - -',
        'E5 - - - G#5 - - - B5 - - - D6 - - -', 'C6 - - - B5 - - - A5 - - - - - . .'
      ],
      bass: 'R - . . F - . R O - . . F - R .', arp: 'up8', drums: 'k . h . s . h . . k h . s . h o'
    },
    winter: {
      bpm: 96,
      chords: ['Dm', 'Bb', 'C', 'Am', 'Gm', 'Bb', 'A7sus4', 'A7',
        'Dm', 'Bb', 'C', 'Am', 'Gm', 'Bb', 'A7sus4', 'A7'],
      lead: [
        'A5 - - - - - - - D6 - - - C6 - A5 -', 'Bb5 - - - - - - - F5 - - - G5 - A5 -',
        'G5 - - - - - - - E5 - - - C5 - E5 -', 'A5 - - - - - - - - - - - . . . .',
        'Bb5 - - - A5 - - - G5 - - - D5 - - -', 'F5 - - - G5 - - - A5 - - - Bb5 - - -',
        'A5 - - - - - - - D6 - - - - - - -', 'C#6 - - - - - - - . . . . . . . .',
        'D6 - - - E6 - F6 - E6 - - - D6 - A5 -', 'D6 - - - C6 - Bb5 - - - - - F5 - - -',
        'E5 - - - G5 - C6 - - - - - Bb5 - A5 -', 'A5 - - - E5 - - - C5 - - - E5 - - -',
        'D5 - - - G5 - - - Bb5 - - - A5 - G5 -', 'F5 - - - D5 - - - F5 - - - Bb5 - - -',
        'A5 - - - - - - - G5 - - - F5 - E5 -', 'E5 - - - - - - - C#5 - - - - - . .'
      ],
      bass: 'R - - - - - - - F - - - O - - -', arp: 'bell', drums: 'k . . . h . . . s . . . h . . h', leadType: 'bell'
    },
    spring: {
      bpm: 136,
      chords: ['Dmaj7', 'Bm7', 'Gmaj7', 'A7', 'Dmaj7', 'F#m7', 'Gmaj7', 'Asus4 A',
        'Dmaj7', 'Bm7', 'Gmaj7', 'A7', 'Dmaj7', 'F#m7', 'Gmaj7', 'Asus4 A'],
      lead: [
        'F#5 - - - A5 - - - B5 - A5 - F#5 - E5 -', 'D5 - - - F#5 - - - E5 - - - D5 - B4 -',
        'B4 - - - D5 - E5 - F#5 - - - A5 - - -', 'E5 - - - - - - - A5 - B5 - A5 - E5 -',
        'F#5 - - - A5 - - - D6 - - - B5 - A5 -', 'A5 - - - F#5 - E5 - E5 - - - F#5 - A5 -',
        'B5 - - - A5 - B5 - D6 - - - B5 - - -', 'A5 - - - - - - - E5 - F#5 - A5 - - -',
        'D6 - - - B5 - A5 - B5 - - - A5 - F#5 -', 'E5 - - - D5 - E5 - F#5 - - - A5 - - -',
        'B5 - - - - - A5 - B5 - D6 - E6 - - -', 'C#6 - - - - - - - A5 - - - E5 - - -',
        'F#5 - E5 - D5 - - - F#5 - A5 - D6 - - -', 'C#6 - - - A5 - - - F#5 - - - E5 - - -',
        'D5 - - - E5 - F#5 - G5 - - - B5 - - -', 'A5 - - - - - - - - - - - . . . .'
      ],
      bass: 'R - . R . . F - R - . R O - F .', arp: 'up16', drums: 'k . h . s . h . k k h . s . h h'
    },
    // 日本古謡「さくらさくら」(パブリックドメイン) の編曲
    ending: {
      bpm: 84,
      chords: ['Am', 'Am', 'Am', 'Fmaj7', 'Am', 'E', 'Am', 'Fmaj7', 'Am', 'E', 'Am', 'Am', 'Dm', 'E'],
      lead: [
        'A5 - - - A5 - - - B5 - - - - - - -', 'A5 - - - A5 - - - B5 - - - - - - -',
        'A5 - - - B5 - - - C6 - - - B5 - - -', 'A5 - - - B5 - A5 - F5 - - - - - - -',
        'E5 - - - C5 - - - E5 - - - F5 - - -', 'E5 - - - E5 - C5 - B4 - - - - - - -',
        'A5 - - - B5 - - - C6 - - - B5 - - -', 'A5 - - - B5 - A5 - F5 - - - - - - -',
        'E5 - - - C5 - - - E5 - - - F5 - - -', 'E5 - - - E5 - C5 - B4 - - - - - - -',
        'A5 - - - A5 - - - B5 - - - - - - -', 'A5 - - - A5 - - - B5 - - - - - - -',
        'E5 - - - F5 - - - B5 - A5 - F5 - - -', 'E5 - - - - - - - - - - - . . . .'
      ],
      bass: 'R - - - - - - - F - - - - - - -', arp: 'koto', drums: null, leadType: 'bell'
    }
  };

  // ---------------- コンパイル ----------------
  function compile(song) {
    var bars = song.lead.length, steps = bars * 16;
    var ev = { lead: [], arp: [], bass: [], drum: [] };
    // メロディ
    var all = song.lead.join(' ').split(/\s+/);
    for (var i = 0; i < all.length; i++) {
      var m = midi(all[i]);
      if (m === null) continue;
      var d = 1;
      while (i + d < all.length && all[i + d] === '-') d++;
      ev.lead.push({ s: i, d: d, m: m });
    }
    // コード由来の伴奏
    var bp = song.bass.split(/\s+/);
    for (var b = 0; b < bars; b++) {
      var syms = song.chords[b % song.chords.length].split(' ');
      for (var st = 0; st < 16; st++) {
        var ch = chord(syms[Math.min(syms.length - 1, Math.floor(st / (16 / syms.length)))]);
        var step = b * 16 + st;
        // ベース
        var tok = bp[st];
        if (tok && tok !== '.' && tok !== '-') {
          var base = 36 + ch.bass;
          if (base > 45) base -= 12;
          var note = tok === 'R' ? base : (tok === 'O' ? base + 12 : base + 7);
          var dd = 1; while (st + dd < 16 && bp[st + dd] === '-') dd++;
          ev.bass.push({ s: step, d: dd, m: note });
        }
        // アルペジオ
        var tones = ch.iv.map(function (x) { return 60 + ch.root + x; }).map(function (n) { return n > 74 ? n - 12 : n; });
        if (song.arp === 'up16') ev.arp.push({ s: step, d: 1, m: tones[st % tones.length] + 12 });
        else if (song.arp === 'up8' && st % 2 === 0) ev.arp.push({ s: step, d: 2, m: tones[(st / 2) % tones.length] + 12 });
        else if (song.arp === 'bell' && st % 4 === 0) ev.arp.push({ s: step, d: 4, m: tones[(st / 4) % tones.length] + 24 });
        else if (song.arp === 'koto' && st % 2 === 0) {
          var kt = [0, 1, 2, 1, 2, 3, 2, 1];
          ev.arp.push({ s: step, d: 2, m: tones[kt[(st / 2) % 8] % tones.length] });
        }
      }
      if (song.drums) {
        var dp = song.drums.split(/\s+/);
        for (st = 0; st < 16; st++) if (dp[st] && dp[st] !== '.') ev.drum.push({ s: b * 16 + st, k: dp[st] });
      }
    }
    return { song: song, ev: ev, steps: steps, stepDur: 60 / song.bpm / 4 };
  }
  var COMPILED = {};
  Object.keys(SONGS).forEach(function (k) { COMPILED[k] = compile(SONGS[k]); });

  // ---------------- 再生 ----------------
  var waves = {};
  function pulse(ctx, duty) {
    var n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (var i = 1; i < n; i++) re[i] = 2 / (i * Math.PI) * Math.sin(i * Math.PI * duty);
    return ctx.createPeriodicWave(re, im);
  }
  var bus = null, chGain = {};
  function setup() {
    var A = G.Audio, ctx = A.ctx;
    if (bus) return;
    waves.p25 = pulse(ctx, 0.25); waves.p125 = pulse(ctx, 0.125); waves.p50 = pulse(ctx, 0.5);
    bus = ctx.createGain(); bus.gain.value = 1; bus.connect(A.musicBus);
    ['lead', 'arp', 'bass', 'drum'].forEach(function (k) { chGain[k] = ctx.createGain(); chGain[k].connect(bus); });
    chGain.lead.gain.value = 0.17; chGain.arp.gain.value = 0.06; chGain.bass.gain.value = 0.22; chGain.drum.gain.value = 0.2;
    // リードに薄いエコー
    var dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
    var fb = ctx.createGain(); fb.gain.value = 0.28;
    var wet = ctx.createGain(); wet.gain.value = 0.35;
    chGain.lead.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(bus);
  }

  function voice(ctx, dest, wave, type, f, t, dur, vol, env) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.connect(g); g.connect(dest);
    o.start(t);
    g.gain.setValueAtTime(0, t);
    if (env === 'bell') {
      g.gain.linearRampToValueAtTime(vol, t + 0.005);
      g.gain.exponentialRampToValueAtTime(vol * 0.25, t + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.3, dur + 0.25));
      o.stop(t + Math.max(0.3, dur + 0.25) + 0.05);
    } else {
      g.gain.linearRampToValueAtTime(vol, t + 0.006);
      g.gain.setTargetAtTime(vol * 0.6, t + 0.02, 0.08);
      g.gain.setTargetAtTime(0, t + dur * 0.92, 0.025);
      o.stop(t + dur + 0.15);
    }
    // ビブラート (長い音)
    if (dur > 0.35 && env !== 'bell') {
      var l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.5; lg.gain.value = f * 0.006;
      l.connect(lg); lg.connect(o.frequency);
      l.start(t + 0.2); l.stop(t + dur + 0.15);
    }
  }
  function drum(ctx, k, t) {
    var A = G.Audio, dest = chGain.drum;
    if (k === 'k') {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(1.0, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.2);
    } else {
      var s = A.noiseSrc(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
      var dur = k === 's' ? 0.14 : (k === 'o' ? 0.16 : 0.035);
      f.type = k === 's' ? 'bandpass' : 'highpass';
      f.frequency.value = k === 's' ? 1800 : 7000;
      g2.gain.setValueAtTime(k === 's' ? 0.8 : 0.32, t); g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g2); g2.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.02);
      if (k === 's') {
        var o2 = ctx.createOscillator(), g3 = ctx.createGain();
        o2.type = 'triangle'; o2.frequency.setValueAtTime(200, t); o2.frequency.exponentialRampToValueAtTime(120, t + 0.08);
        g3.gain.setValueAtTime(0.5, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o2.connect(g3); g3.connect(dest); o2.start(t); o2.stop(t + 0.12);
      }
    }
  }

  var play = null; // { c: compiled, step, next }
  var timer = null;
  function schedule() {
    var A = G.Audio, ctx = A.ctx;
    if (!play || !ctx || ctx.state !== 'running') return;
    var c = play.c, sd = c.stepDur;
    while (play.next < ctx.currentTime + 0.15) {
      var st = play.step % c.steps, t = play.next;
      var lt = c.song.leadType;
      c.ev.lead.forEach(function (e) { if (e.s === st) voice(ctx, chGain.lead, lt === 'bell' ? waves.p125 : waves.p25, null, hz(e.m), t, e.d * sd, lt === 'bell' ? 0.9 : 0.7, lt); });
      c.ev.arp.forEach(function (e) { if (e.s === st) voice(ctx, chGain.arp, waves.p125, null, hz(e.m), t, e.d * sd, 0.8, 'bell'); });
      c.ev.bass.forEach(function (e) { if (e.s === st) voice(ctx, chGain.bass, null, 'triangle', hz(e.m), t, e.d * sd, 1.0); });
      c.ev.drum.forEach(function (e) { if (e.s === st) drum(ctx, e.k, t); });
      play.step++;
      play.next += sd;
    }
  }

  function start(key) {
    var A = G.Audio;
    if (!A || !A.ready) { M.pending = key; return; }
    setup();
    var ctx = A.ctx;
    bus.gain.cancelScheduledValues(ctx.currentTime);
    if (!key) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      var old = play;
      setTimeout(function () { if (play === old) play = null; }, 900);
      return;
    }
    bus.gain.setValueAtTime(0, ctx.currentTime);
    bus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.4);
    play = { c: COMPILED[key], step: 0, next: ctx.currentTime + 0.12 };
    if (!timer) timer = setInterval(schedule, 40);
  }

  M.play = function (key) {
    if (key === M.current) return;
    M.current = key;
    start(key);
  };
  M.onReady = function () { if (M.current) start(M.current); };
})();
