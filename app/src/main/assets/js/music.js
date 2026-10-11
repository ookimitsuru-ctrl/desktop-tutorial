'use strict';
// ============================================================
//  music.js  FM 音源風 BGM シーケンサ (アーケード/メガドライブの YM 系の音色を
//             WebAudio の発振器どうしで周波数変調して作る)
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
      bass: 'R - - - - - - - F - - - O - - -', arp: 'bell', drums: 'k . . . h . . . s . . . h . . h'
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
      bass: 'R - - - - - - - F - - - - - - -', arp: 'koto', drums: null
    }
  };

  // ---------------- コンパイル ----------------
  function compile(song) {
    var bars = song.lead.length, steps = bars * 16;
    var ev = { lead: [], arp: [], bass: [], drum: [], pad: [] };
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
      // パッド: コードごとに白玉 (中音域にまとめる)
      syms.forEach(function (sym, k) {
        var chd = chord(sym), seg = 16 / syms.length;
        var notes = chd.iv.slice(0, 3).map(function (x) { var n = 55 + ((chd.root + x - 7 + 24) % 12); return n; });
        ev.pad.push({ s: b * 16 + k * seg, d: seg, ms: notes });
      });
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
  Object.keys(SONGS).forEach(function (k) { COMPILED[k] = compile(SONGS[k]); COMPILED[k].key = k; });

  // ---------------- FM 音源 ----------------
  //  mods: 変調器 [{ r: 周波数比, i: 変調指数, s: 持続時の指数の割合, d: 減衰の時定数(秒) }]
  //  a: アタック, dl/sl: ディケイとサスティン, rel: リリース, perc: 打鍵系の減衰時間, chorus: 2 本目のキャリアのずれ
  var PATCH = {
    brass:   { mods: [{ r: 1, i: 2.6, s: 0.45, d: 0.12 }], a: 0.012, dl: 0.25, sl: 0.78, rel: 0.08, chorus: 0.004 },
    synlead: { mods: [{ r: 2, i: 1.4, s: 0.55, d: 0.2 }, { r: 1, i: 0.6, s: 0.6, d: 0.3 }], a: 0.01, dl: 0.3, sl: 0.72, rel: 0.07, chorus: 0.003 },
    flute:   { mods: [{ r: 1, i: 0.8, s: 0.45, d: 0.08 }], a: 0.035, dl: 0.3, sl: 0.85, rel: 0.09, chorus: 0.002 },
    epiano:  { mods: [{ r: 1, i: 1.8, s: 0.15, d: 0.25 }, { r: 14, i: 0.45, s: 0, d: 0.03 }], a: 0.003, perc: 0.7 },
    bass:    { mods: [{ r: 1, i: 3.2, s: 0.22, d: 0.06 }, { r: 0.5, i: 0.8, s: 0.3, d: 0.1 }], a: 0.004, dl: 0.15, sl: 0.62, rel: 0.04 },
    bell:    { mods: [{ r: 3.5, i: 2.4, s: 0.08, d: 0.45 }], a: 0.003, perc: 1.6 },
    koto:    { mods: [{ r: 3, i: 2.0, s: 0, d: 0.07 }, { r: 1, i: 0.5, s: 0.2, d: 0.2 }], a: 0.002, perc: 0.9 },
    marimba: { mods: [{ r: 4, i: 1.4, s: 0, d: 0.04 }], a: 0.002, perc: 0.35 },
    strings: { mods: [{ r: 1, i: 0.9, s: 0.9, d: 0.4 }], a: 0.28, dl: 0.4, sl: 0.9, rel: 0.3, chorus: 0.006 }
  };
  // 曲ごとの音色
  var VOICING = {
    title:  { lead: 'brass', arp: 'epiano', pad: 'strings' },
    summer: { lead: 'brass', arp: 'epiano', pad: 'strings' },
    autumn: { lead: 'synlead', arp: 'epiano', pad: 'strings' },
    winter: { lead: 'bell', arp: 'bell', pad: 'strings' },
    spring: { lead: 'flute', arp: 'marimba', pad: 'strings' },
    ending: { lead: 'koto', arp: 'koto', pad: 'strings' }
  };

  function fmNote(ctx, dest, name, f, t, dur, vol) {
    var P = PATCH[name] || PATCH.brass;
    var cg = ctx.createGain(); cg.connect(dest);
    var nCar = P.chorus ? 2 : 1, cars = [], end;
    for (var k = 0; k < nCar; k++) {
      var o = ctx.createOscillator();
      o.frequency.setValueAtTime(f * (k ? 1 + P.chorus : 1), t);
      o.connect(cg); cars.push(o);
    }
    var amp = vol / (nCar === 2 ? 1.6 : 1);
    cg.gain.setValueAtTime(0, t);
    if (P.perc) {
      var pd = Math.min(P.perc, Math.max(0.22, dur * 3));
      cg.gain.linearRampToValueAtTime(amp, t + P.a);
      cg.gain.setTargetAtTime(0, t + P.a, pd / 3);
      end = t + pd * 1.3 + 0.05;
    } else {
      cg.gain.linearRampToValueAtTime(amp, t + P.a);
      cg.gain.setTargetAtTime(amp * P.sl, t + P.a, P.dl / 3);
      var rs = Math.max(t + P.a + 0.01, t + dur - 0.01);
      cg.gain.setTargetAtTime(0, rs, P.rel / 3);
      end = rs + P.rel * 2.5;
    }
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
    // 長い音にはビブラート
    if (!P.perc && dur > 0.35) {
      var l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = 5.5; lg.gain.value = f * 0.006;
      l.connect(lg);
      cars.forEach(function (o) { lg.connect(o.frequency); });
      l.start(t + 0.25); l.stop(end);
    }
    cars.forEach(function (o) { o.start(t); o.stop(end); });
  }
  // 効果音 (ジングル) からも使う
  M.fm = function (name, f, t, dur, vol, dest) { if (G.Audio && G.Audio.ctx) fmNote(G.Audio.ctx, dest, name, f, t, dur, vol); };

  var bus = null, chGain = {};
  function setup() {
    var A = G.Audio, ctx = A.ctx;
    if (bus) return;
    bus = ctx.createGain(); bus.gain.value = 1; bus.connect(A.musicBus);
    ['lead', 'arp', 'bass', 'drum', 'pad'].forEach(function (k) { chGain[k] = ctx.createGain(); chGain[k].connect(bus); });
    chGain.lead.gain.value = 0.13; chGain.arp.gain.value = 0.05; chGain.bass.gain.value = 0.2;
    chGain.drum.gain.value = 0.15; chGain.pad.gain.value = 0.032;
    // リードとパッドに薄いエコー (FM 音源らしい広がり)
    var dl = ctx.createDelay(1); dl.delayTime.value = 0.27;
    var fb = ctx.createGain(); fb.gain.value = 0.3;
    var wet = ctx.createGain(); wet.gain.value = 0.32;
    chGain.lead.connect(dl); chGain.pad.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(bus);
  }

  function drum(ctx, k, t) {
    var A = G.Audio, dest = chGain.drum;
    if (k === 'k') {
      // FM 風キック: ピッチが落ちるサイン + アタックのクリック
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
      g.gain.setValueAtTime(1.1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.22);
      var c = A.noiseSrc(), cf = ctx.createBiquadFilter(), cgn = ctx.createGain();
      cf.type = 'highpass'; cf.frequency.value = 3000;
      cgn.gain.setValueAtTime(0.25, t); cgn.gain.exponentialRampToValueAtTime(0.001, t + 0.012);
      c.connect(cf); cf.connect(cgn); cgn.connect(dest); c.start(t, Math.random()); c.stop(t + 0.02);
    } else {
      var s = A.noiseSrc(), f = ctx.createBiquadFilter(), g2 = ctx.createGain();
      var dur = k === 's' ? 0.16 : (k === 'o' ? 0.16 : 0.035);
      f.type = k === 's' ? 'bandpass' : 'highpass';
      f.frequency.value = k === 's' ? 2200 : 7500;
      g2.gain.setValueAtTime(k === 's' ? 0.7 : 0.3, t); g2.gain.exponentialRampToValueAtTime(0.001, t + dur);
      s.connect(f); f.connect(g2); g2.connect(dest); s.start(t, Math.random()); s.stop(t + dur + 0.02);
      if (k === 's') {
        // 金属的な FM スネアの胴鳴り
        var car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), g3 = ctx.createGain();
        car.frequency.setValueAtTime(190, t); mod.frequency.setValueAtTime(190 * 1.47, t);
        mg.gain.setValueAtTime(600, t); mg.gain.exponentialRampToValueAtTime(20, t + 0.08);
        mod.connect(mg); mg.connect(car.frequency);
        g3.gain.setValueAtTime(0.55, t); g3.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
        car.connect(g3); g3.connect(dest);
        car.start(t); mod.start(t); car.stop(t + 0.13); mod.stop(t + 0.13);
      }
    }
  }

  var play = null; // { c: compiled, step, next }
  var timer = null;
  function schedule() {
    var A = G.Audio, ctx = A.ctx;
    if (!play || !ctx || ctx.state !== 'running') return;
    var c = play.c, sd = c.stepDur, v = VOICING[c.key];
    while (play.next < ctx.currentTime + 0.15) {
      var st = play.step % c.steps, t = play.next;
      c.ev.lead.forEach(function (e) { if (e.s === st) fmNote(ctx, chGain.lead, v.lead, hz(e.m), t, e.d * sd, 0.9); });
      c.ev.arp.forEach(function (e) { if (e.s === st) fmNote(ctx, chGain.arp, v.arp, hz(e.m), t, e.d * sd, 0.9); });
      c.ev.bass.forEach(function (e) { if (e.s === st) fmNote(ctx, chGain.bass, 'bass', hz(e.m), t, e.d * sd, 1.0); });
      c.ev.pad.forEach(function (e) {
        if (e.s === st) e.ms.forEach(function (m) { fmNote(ctx, chGain.pad, v.pad, hz(m), t, e.d * sd, 0.7); });
      });
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
