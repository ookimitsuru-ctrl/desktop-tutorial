'use strict';
// ============================================================
//  audio.js  効果音・エンジン音 (WebAudio で全部合成)
// ============================================================
(function () {
  var A = G.Audio = { ctx: null, muted: false, ready: false, engineActive: false };
  try { A.muted = localStorage.getItem('shiki_muted') === '1'; } catch (e) { /* ignore */ }

  var ctx, master, sfxBus, noiseBuf, eng = null;

  function makeNoise() {
    var len = ctx.sampleRate * 2, b = ctx.createBuffer(1, len, ctx.sampleRate), d = b.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function noiseSrc() {
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf; s.loop = true;
    return s;
  }
  A.noiseSrc = function () { return noiseSrc(); };

  A.unlock = function () {
    if (ctx) { if (ctx.state === 'suspended' && !A.paused) ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = A.ctx = new AC(); } catch (e) { return; }
    master = ctx.createGain();
    master.gain.value = A.muted ? 0 : 0.85;
    // 軽いコンプで音割れ防止
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    A.musicBus = ctx.createGain(); A.musicBus.gain.value = 0.42; A.musicBus.connect(master);
    noiseBuf = makeNoise();
    buildEngine();
    A.ready = true;
    if (G.Music) G.Music.onReady();
  };

  A.setMuted = function (m) {
    A.muted = m;
    try { localStorage.setItem('shiki_muted', m ? '1' : '0'); } catch (e) { /* ignore */ }
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05);
  };
  A.suspend = function (on) {
    A.paused = on;
    if (!ctx) return;
    if (on) ctx.suspend(); else ctx.resume();
  };

  // ---------- エンジン (3気筒ターボ風) ----------
  //  音の高さは回転数 (P.rpm = rpm / 7000) に比例。アイドル 900rpm で約 29Hz, 6300rpm で約 106Hz
  function buildEngine() {
    eng = {};
    eng.out = ctx.createGain(); eng.out.gain.value = 0; eng.out.connect(master);
    eng.filter = ctx.createBiquadFilter(); eng.filter.type = 'lowpass'; eng.filter.frequency.value = 600; eng.filter.Q.value = 2.5;
    eng.am = ctx.createGain(); eng.am.gain.value = 0.6;
    eng.filter.connect(eng.am); eng.am.connect(eng.out);
    eng.o1 = ctx.createOscillator(); eng.o1.type = 'sawtooth';
    eng.o2 = ctx.createOscillator(); eng.o2.type = 'square';
    var g2 = ctx.createGain(); g2.gain.value = 0.5;
    eng.o1.connect(eng.filter); eng.o2.connect(g2); g2.connect(eng.filter);
    // 3気筒のバラつき (AM)
    eng.lfo = ctx.createOscillator(); eng.lfo.type = 'triangle';
    eng.lfoG = ctx.createGain(); eng.lfoG.gain.value = 0.35;
    eng.lfo.connect(eng.lfoG); eng.lfoG.connect(eng.am.gain);
    // ターボの笛
    eng.turbo = ctx.createOscillator(); eng.turbo.type = 'sine';
    eng.turboG = ctx.createGain(); eng.turboG.gain.value = 0;
    eng.turbo.connect(eng.turboG); eng.turboG.connect(master);
    // スキール / 砂利 / 風
    eng.skid = noiseSrc();
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
    eng.skidG = ctx.createGain(); eng.skidG.gain.value = 0;
    eng.skid.connect(bp); bp.connect(eng.skidG); eng.skidG.connect(master);
    eng.rumble = noiseSrc();
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    eng.rumbleG = ctx.createGain(); eng.rumbleG.gain.value = 0;
    eng.rumble.connect(lp); lp.connect(eng.rumbleG); eng.rumbleG.connect(master);
    eng.wind = noiseSrc();
    var wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 700; wf.Q.value = 0.6;
    eng.windG = ctx.createGain(); eng.windG.gain.value = 0;
    eng.wind.connect(wf); wf.connect(eng.windG); eng.windG.connect(master);
    // 木や岩を擦る音 「ガガガ」: 砂利っぽいノイズと低いうなりを矩形波で刻む
    eng.scr = noiseSrc();
    var sbp = ctx.createBiquadFilter(); sbp.type = 'bandpass'; sbp.frequency.value = 1300; sbp.Q.value = 0.9;
    eng.scrGrind = ctx.createOscillator(); eng.scrGrind.type = 'sawtooth'; eng.scrGrind.frequency.value = 62;
    var slp = ctx.createBiquadFilter(); slp.type = 'lowpass'; slp.frequency.value = 420;
    var sgr = ctx.createGain(); sgr.gain.value = 0.55;
    eng.scrAM = ctx.createGain(); eng.scrAM.gain.value = 0.5;
    eng.scrLfo = ctx.createOscillator(); eng.scrLfo.type = 'square'; eng.scrLfo.frequency.value = 22;
    var slg = ctx.createGain(); slg.gain.value = 0.5;
    eng.scrLfo.connect(slg); slg.connect(eng.scrAM.gain);
    eng.scrG = ctx.createGain(); eng.scrG.gain.value = 0;
    eng.scr.connect(sbp); sbp.connect(eng.scrAM);
    eng.scrGrind.connect(slp); slp.connect(sgr); sgr.connect(eng.scrAM);
    eng.scrAM.connect(eng.scrG); eng.scrG.connect(master);
    [eng.o1, eng.o2, eng.lfo, eng.turbo, eng.skid, eng.rumble, eng.wind, eng.scr, eng.scrGrind, eng.scrLfo].forEach(function (n) { n.start(); });
  }

  A.engineOn = function (on) { A.engineActive = on; };

  var lastRpm = 0;
  A.update = function (dt, Game, P) {
    if (!eng || !ctx || ctx.state !== 'running') return;
    var t = ctx.currentTime, k = 0.06;
    var sp = P.speed / G.MAX_SPEED;
    var racing = Game.state === 'race' || Game.state === 'countdown' || Game.state === 'goal' || Game.state === 'timeup';
    var rpm = P.rpm;   // 空ぶかしやシフトの上下は game.js 側で回転数に入っている
    var f = 16 + rpm * 100;
    eng.o1.frequency.setTargetAtTime(f, t, k);
    eng.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    eng.lfo.frequency.setTargetAtTime(f * 0.5, t, k);
    eng.filter.frequency.setTargetAtTime(200 + rpm * 1150 + sp * 300, t, k);
    var vol = racing && A.engineActive ? (0.07 + rpm * 0.06) * (P.throttle ? 1.15 : 0.85) : (Game.state === 'title' ? 0.03 : 0.0);
    if (Game.state === 'ending' || Game.state === 'gameover') vol = 0;
    eng.out.gain.setTargetAtTime(vol, t, 0.1);
    var accel = P.throttle && racing;
    eng.turbo.frequency.setTargetAtTime(1600 + rpm * 2400, t, 0.1);
    eng.turboG.gain.setTargetAtTime(accel && sp > 0.1 ? 0.004 + rpm * 0.006 : 0, t, 0.15);
    // ブローオフ (ブレーキ時)
    if (P.braking && !A._blow && sp > 0.5) { A._blow = true; A.sfx('blowoff'); }
    if (!P.braking) A._blow = false;
    lastRpm = rpm;
    eng.skidG.gain.setTargetAtTime(racing ? P.skid * 0.09 : 0, t, 0.05);
    eng.rumbleG.gain.setTargetAtTime(racing && P.offroad && sp > 0.05 ? 0.35 * Math.min(1, sp * 2) : 0, t, 0.05);
    eng.windG.gain.setTargetAtTime(racing ? sp * sp * 0.05 : 0, t, 0.2);
    eng.scrG.gain.setTargetAtTime(racing && P.scrape ? 0.16 + sp * 0.22 : 0, t, P.scrape ? 0.01 : 0.05);
    eng.scrLfo.frequency.setTargetAtTime(15 + sp * 20, t, 0.05);
    eng.scrGrind.frequency.setTargetAtTime(48 + sp * 40, t, 0.05);
  };

  // ---------- 効果音 ----------
  function tone(type, freq, start, dur, vol, slideTo) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, start);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(start); o.stop(start + dur + 0.05);
  }
  function noise(start, dur, vol, type, freq, freqTo) {
    var s = noiseSrc(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq || 2000, start);
    if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, start + dur);
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f); f.connect(g); g.connect(sfxBus);
    s.start(start, Math.random()); s.stop(start + dur + 0.05);
  }
  function fmJ(patch, m, t, dur, vol) {
    if (G.Music && G.Music.fmCtx) G.Music.fmCtx(ctx, sfxBus, patch, 440 * Math.pow(2, (m - 69) / 12), t, dur, vol);
  }
  // 拍手と指笛 (ゴールのお祝い): 短いノイズを共鳴フィルタに通した「パチ」を大勢分重ねて作る
  var applause = [];
  function applauseBuf(c) {
    for (var i = 0; i < applause.length; i++) if (applause[i].c === c) return applause[i].b;
    var sr = c.sampleRate, dur = 5.5, n = Math.floor(sr * dur), ch = [new Float32Array(n), new Float32Array(n)];
    var sd = 777; function r() { sd = (sd * 16807) % 2147483647; return sd / 2147483647; }
    function env(t) { return t < 0.5 ? t / 0.5 : (t < 3.2 ? 1 : Math.max(0, 1 - (t - 3.2) / 2.3)); }
    var len = Math.floor(sr * 0.012), dk = sr * 0.0025;
    for (var k = 0; k < dur * 150; k++) {
      var t0 = r() * dur;
      if (r() > env(t0)) continue;
      var fc = 900 + r() * 2300, q = 3 + r() * 4, w = 2 * Math.PI * fc / sr, al = Math.sin(w) / (2 * q), cw = Math.cos(w);
      var b0 = al / (1 + al), a1 = -2 * cw / (1 + al), a2 = (1 - al) / (1 + al), x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      var g = 0.4 + r() * 0.6, pan = r(), st = Math.floor(t0 * sr);
      for (var j = 0; j < len && st + j < n; j++) {
        var x = (r() * 2 - 1) * Math.exp(-j / dk), y = b0 * x - b0 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        ch[0][st + j] += y * g * (1 - pan); ch[1][st + j] += y * g * pan;
      }
    }
    // 指笛 2 回
    [[0.6, 2300, 3100, 0.25], [1.5, 2500, 3300, 0.75]].forEach(function (w2) {
      var s0 = Math.floor(w2[0] * sr), wl = Math.floor(sr * 0.45), ph = 0;
      for (var j = 0; j < wl; j++) {
        var u = j / wl, f = w2[1] + (w2[2] - w2[1]) * Math.min(1, u * 1.6) + Math.sin(j / sr * 2 * Math.PI * 7) * 60;
        ph += 2 * Math.PI * f / sr;
        var a = Math.sin(ph) * 0.12 * Math.min(1, u * 8) * Math.min(1, (1 - u) * 5);
        ch[0][s0 + j] += a * (1 - w2[3]); ch[1][s0 + j] += a * w2[3];
      }
    });
    var peak = 0;
    for (i = 0; i < n; i++) peak = Math.max(peak, Math.abs(ch[0][i]), Math.abs(ch[1][i]));
    var b = c.createBuffer(2, n, sr);
    for (var q2 = 0; q2 < 2; q2++) { var d = b.getChannelData(q2); for (i = 0; i < n; i++) d[i] = ch[q2][i] * 0.8 / (peak || 1); }
    applause.push({ c: c, b: b });
    if (applause.length > 3) applause.shift();
    return b;
  }
  var SFX = {
    beep: function (t) { tone('square', 440, t, 0.22, 0.25); },
    go: function (t) { tone('square', 880, t, 0.6, 0.28); tone('square', 1760, t, 0.3, 0.08); },
    tick: function (t) { tone('square', 1320, t, 0.05, 0.12); },
    // ジングルは BGM と同じ FM 音色 (ブラス + FM ベース)
    checkpoint: function (t) {
      [72, 76, 79, 84, 88, 91].forEach(function (m, i) { fmJ('brass', m, t + i * 0.07, 0.22, 0.32); });
      fmJ('bass', 48, t, 0.5, 0.45); fmJ('bass', 60, t + 0.42, 0.3, 0.35);
    },
    // ゴール: 拍手と指笛 (ファンファーレはビクトリーの曲の前奏)
    goal: function (t) {
      var s = ctx.createBufferSource(), g = ctx.createGain();
      s.buffer = applauseBuf(ctx); s.connect(g); g.connect(sfxBus);
      g.gain.setValueAtTime(0.55, t); s.start(t + 0.15);
    },
    // 花火: ドーンと低い音のあとにパチパチ
    firework: function (t) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(36, t + 0.4);
      g.gain.setValueAtTime(0.5, t); g.gain.setTargetAtTime(0.0001, t, 0.16);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.9);
      noise(t, 0.5, 0.35, 'lowpass', 600, 120);
      for (var k = 0; k < 12; k++) noise(t + 0.22 + Math.random() * 0.75, 0.012, 0.05 + Math.random() * 0.1, 'highpass', 2500 + Math.random() * 3000);
    },
    timeup: function (t) { [76, 72, 67, 60].forEach(function (m, i) { fmJ('brass', m, t + i * 0.18, 0.24, 0.32); }); fmJ('bass', 36, t + 0.54, 0.6, 0.45); },
    // 木や岩に当たった瞬間 (この後は擦る音が続く)
    scrape: function (t) {
      noise(t, 0.3, 0.55, 'bandpass', 2400, 500);
      noise(t, 0.12, 0.45, 'lowpass', 1500);
      tone('square', 92, t, 0.16, 0.22, 46);
    },
    hit: function (t) { noise(t, 0.4, 0.55, 'lowpass', 2500, 200); tone('sine', 140, t, 0.3, 0.5, 50); },
    bump: function (t) { tone('sine', 110, t, 0.18, 0.45, 50); noise(t, 0.12, 0.25, 'lowpass', 1500); },
    blowoff: function (t) { noise(t, 0.35, 0.12, 'highpass', 2500, 6000); },
    select: function (t) { tone('square', 988, t, 0.06, 0.15); tone('square', 1319, t + 0.06, 0.1, 0.15); }
  };
  // 動画用: 効果音 name を別のコンテキスト (OfflineAudioContext) の dest へ t 秒に鳴らす
  var offNoise = [];
  A.renderSfx = function (octx, dest, name, t) {
    var fn = SFX[name];
    if (!fn) return;
    var saved = [ctx, sfxBus, noiseBuf], nb = null;
    for (var i = 0; i < offNoise.length; i++) if (offNoise[i].c === octx) nb = offNoise[i].b;
    if (!nb) {
      nb = octx.createBuffer(1, octx.sampleRate * 2, octx.sampleRate);
      var d = nb.getChannelData(0); for (i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      offNoise.push({ c: octx, b: nb }); if (offNoise.length > 3) offNoise.shift();
    }
    ctx = octx; sfxBus = dest; noiseBuf = nb;
    try { fn(t); } finally { ctx = saved[0]; sfxBus = saved[1]; noiseBuf = saved[2]; }
  };
  A.sfx = function (name) {
    if (!ctx || !A.ready || ctx.state !== 'running') return;
    var fn = SFX[name];
    if (fn) fn(ctx.currentTime + 0.01);
  };
  A.tone = function () { return tone.apply(null, arguments); };
})();
