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
    [eng.o1, eng.o2, eng.lfo, eng.turbo, eng.skid, eng.rumble, eng.wind].forEach(function (n) { n.start(); });
  }

  A.engineOn = function (on) { A.engineActive = on; };

  var lastRpm = 0;
  A.update = function (dt, Game, P) {
    if (!eng || !ctx || ctx.state !== 'running') return;
    var t = ctx.currentTime, k = 0.06;
    var sp = P.speed / G.MAX_SPEED;
    var racing = Game.state === 'race' || Game.state === 'countdown' || Game.state === 'goal' || Game.state === 'timeup';
    var rpm = P.rpm;
    if (Game.state === 'countdown') { A._rev = G.clamp((A._rev || 0) + (P.throttle ? dt * 2.5 : -dt * 1.5), 0, 1); rpm = 0.28 + A._rev * 0.65; } // 空ぶかし
    if (P.crash) rpm = 0.25;
    var f = 30 + rpm * 112;
    eng.o1.frequency.setTargetAtTime(f, t, k);
    eng.o2.frequency.setTargetAtTime(f * 0.5, t, k);
    eng.lfo.frequency.setTargetAtTime(f * 0.5, t, k);
    eng.filter.frequency.setTargetAtTime(260 + rpm * 1500 + sp * 400, t, k);
    var vol = racing && A.engineActive ? (0.06 + rpm * 0.05) * (P.throttle ? 1.15 : 0.85) : (Game.state === 'title' ? 0.03 : 0.0);
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
    if (G.Music && G.Music.fm) G.Music.fm(patch, 440 * Math.pow(2, (m - 69) / 12), t, dur, vol, sfxBus);
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
    goal: function (t) {
      var seq = [[72, 0, 0.1], [72, 0.12, 0.1], [72, 0.24, 0.12], [77, 0.4, 0.26], [81, 0.7, 0.26], [84, 1.0, 0.18], [81, 1.2, 0.18], [84, 1.4, 0.8]];
      seq.forEach(function (n) { fmJ('brass', n[0], t + n[1], n[2], 0.34); fmJ('brass', n[0] - 5, t + n[1], n[2], 0.16); });
      fmJ('bass', 41, t + 0.4, 0.6, 0.45); fmJ('bass', 48, t + 1.4, 0.8, 0.45);
    },
    timeup: function (t) { [76, 72, 67, 60].forEach(function (m, i) { fmJ('brass', m, t + i * 0.18, 0.24, 0.32); }); fmJ('bass', 36, t + 0.54, 0.6, 0.45); },
    crash: function (t) {
      noise(t, 0.9, 0.7, 'lowpass', 3000, 120);
      tone('sine', 120, t, 0.5, 0.6, 35);
      noise(t + 0.25, 0.4, 0.3, 'bandpass', 2500, 800);
    },
    hit: function (t) { noise(t, 0.4, 0.55, 'lowpass', 2500, 200); tone('sine', 140, t, 0.3, 0.5, 50); },
    bump: function (t) { tone('sine', 110, t, 0.18, 0.45, 50); noise(t, 0.12, 0.25, 'lowpass', 1500); },
    blowoff: function (t) { noise(t, 0.35, 0.12, 'highpass', 2500, 6000); },
    select: function (t) { tone('square', 988, t, 0.06, 0.15); tone('square', 1319, t + 0.06, 0.1, 0.15); }
  };
  A.sfx = function (name) {
    if (!ctx || !A.ready || ctx.state !== 'running') return;
    var fn = SFX[name];
    if (fn) fn(ctx.currentTime + 0.01);
  };
  A.tone = function () { return tone.apply(null, arguments); };
})();
