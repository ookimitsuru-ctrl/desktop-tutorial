import { PITCH } from '../config.js';

// 手続き生成サウンド（音声ファイルなし）: 観客の歓声（ゴール前のみ）、審判の笛、キック音、ポスト、ネット、
// メニューBGM。Web Audio API で合成する。

function noiseBuffer(ctx, seconds, type = 'pink') {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') {
        d[i] = w;
        continue;
      }
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // ループのつなぎ目を滑らかに
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[len - fade + i] * (1 - k);
    }
  }
  return buf;
}

function impulse(ctx, seconds, decay) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.sfxVol = 0.8;
    this.musicVol = 0.6;
    this.musicOn = false;
    this.inMatch = false;
  }

  /** 最初のタップで呼ぶ（自動再生制限の解除） */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = this.sfxVol;
    this.sfx.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVol * 0.5;
    this.music.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = impulse(ctx, 2.6, 2.8);
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    this.reverb.connect(rv).connect(this.sfx);
    this.pink = noiseBuffer(ctx, 6, 'pink');
    this.white = noiseBuffer(ctx, 2, 'white');
    this.buildCrowd();
    if (this.pendingRain) this.setRain(true);
  }

  setVolumes(sfx, music) {
    this.sfxVol = sfx;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    this.music.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
  }

  suspend() {
    this.ctx?.suspend();
  }

  resume() {
    this.ctx?.resume();
  }

  /** 雨音 */
  setRain(on) {
    if (!this.ctx) {
      this.pendingRain = on;
      return;
    }
    const ctx = this.ctx;
    if (on && !this.rainNode) {
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.09, ctx.currentTime, 1.5);
      src.connect(hp).connect(lp).connect(g).connect(this.sfx);
      src.start();
      this.rainNode = { src, g };
    } else if (!on && this.rainNode) {
      const r = this.rainNode;
      this.rainNode = null;
      r.g.gain.setTargetAtTime(0, ctx.currentTime, 0.5);
      setTimeout(() => r.src.stop(), 3000);
    }
  }

  // ------------------------------------------------------------ 観客

  buildCrowd() {
    const ctx = this.ctx;
    const mk = (type, freq, q, gain) => {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.loop = true;
      src.loopStart = Math.random() * 2;
      src.playbackRate.value = 0.9 + Math.random() * 0.2;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.sfx);
      src.start(0, Math.random() * 4);
      return { src, f, g, base: gain };
    };
    this.crowdLayers = [mk('lowpass', 420, 0.5, 0.55), mk('bandpass', 900, 0.6, 0.35), mk('bandpass', 2300, 0.9, 0.12)];
    this.crowdLevel = 0;
  }

  /**
   * 毎フレーム: 観客の声。ふだんは鳴らさず、ボールがゴール前にあるときだけ歓声が上がる
   * @param {number} level 0〜1（ゴール前の度合い）
   */
  updateCrowd(dt, level) {
    if (!this.ctx) return;
    // 上がるときは速く、引くときはゆっくり
    const k = level > this.crowdLevel ? 2.5 : 1.0;
    this.crowdLevel += (level - this.crowdLevel) * Math.min(1, dt * k);
    const t = this.ctx.currentTime;
    for (const [i, L] of this.crowdLayers.entries()) {
      const wobble = 1 + Math.sin(t * (0.3 + i * 0.17)) * 0.08;
      L.g.gain.setTargetAtTime(L.base * this.crowdLevel * wobble * (i === 2 ? 0.5 + this.crowdLevel : 1), t, 0.1);
      L.f.frequency.setTargetAtTime((i === 0 ? 380 : i === 1 ? 850 : 2100) * (1 + this.crowdLevel * 0.35), t, 0.2);
    }
  }

  /** 歓声のうねり（ゴール・決定機） */
  roar(strength = 1, dur = 4) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [freq, q, g0] of [
      [500, 0.5, 0.9],
      [1200, 0.8, 0.6],
      [2600, 1.2, 0.25],
    ]) {
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      src.playbackRate.value = 1 + Math.random() * 0.1;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(g0 * strength, t + 0.35);
      g.gain.setTargetAtTime(g0 * strength * 0.6, t + 1, 0.8);
      g.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.25);
      src.connect(f).connect(g).connect(this.sfx);
      src.start(t, Math.random() * 3);
      src.stop(t + dur + 2);
    }
  }

  /** 惜しい！（ため息） */
  groan() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.pink;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(380, t + 1.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.7, t + 0.15);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random() * 3);
    src.stop(t + 2);
  }

  // ------------------------------------------------------------ 効果音

  whistle(kind = 'short') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const blast = (t, dur, vol = 0.35) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 2950;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 26;
      const lg = ctx.createGain();
      lg.gain.value = 140;
      lfo.connect(lg).connect(o.frequency);
      const n = ctx.createBufferSource();
      n.buffer = this.white;
      const nf = ctx.createBiquadFilter();
      nf.type = 'bandpass';
      nf.frequency.value = 3000;
      nf.Q.value = 6;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.02);
      g.gain.setValueAtTime(vol, t + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + dur);
      const ng = ctx.createGain();
      ng.gain.value = 0.25;
      o.connect(g);
      n.connect(nf).connect(ng).connect(g);
      g.connect(this.sfx);
      g.connect(this.reverb);
      o.start(t);
      lfo.start(t);
      n.start(t, Math.random());
      o.stop(t + dur + 0.05);
      lfo.stop(t + dur + 0.05);
      n.stop(t + dur + 0.05);
    };
    const t = ctx.currentTime + 0.01;
    if (kind === 'start' || kind === 'goal') blast(t, 0.55);
    else if (kind === 'half') {
      blast(t, 0.35);
      blast(t + 0.5, 0.9);
    } else if (kind === 'end') {
      blast(t, 0.4);
      blast(t + 0.55, 0.4);
      blast(t + 1.1, 1.2);
    } else if (kind === 'foul') {
      blast(t, 0.28, 0.4);
    } else blast(t, 0.3);
  }

  kick(power = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180 + power * 60, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = ctx.createGain();
    const v = 0.25 + power * 0.5;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const nf = ctx.createBiquadFilter();
    nf.type = 'highpass';
    nf.frequency.value = 1800;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(v * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
    o.connect(g).connect(this.sfx);
    n.connect(nf).connect(ng).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.2);
    n.start(t, Math.random());
    n.stop(t + 0.05);
  }

  thud(v = 0.3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.4, v), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.12);
  }

  post() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [f, d, v] of [
      [523, 1.2, 0.25],
      [1347, 0.8, 0.18],
      [2290, 0.5, 0.12],
      [3410, 0.3, 0.07],
    ]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + d);
      o.connect(g);
      g.connect(this.sfx);
      g.connect(this.reverb);
      o.start(t);
      o.stop(t + d);
    }
    this.thud(0.4);
  }

  net() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.35);
    f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random());
    n.stop(t + 0.45);
  }

  ui(kind = 'tap') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = kind === 'back' ? 'triangle' : 'sine';
    const f0 = kind === 'ok' ? 660 : kind === 'back' ? 520 : 880;
    const f1 = kind === 'ok' ? 1320 : kind === 'back' ? 330 : 990;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + 0.14);
  }

  // ------------------------------------------------------------ BGM

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    this.musicT = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0;
    this.musicGain.gain.linearRampToValueAtTime(1, this.ctx.currentTime + 1.5);
    this.musicGain.connect(this.music);
    this.musicTimer = setInterval(() => this.schedule(), 50);
  }

  stopMusic() {
    if (!this.musicOn) return;
    this.musicOn = false;
    clearInterval(this.musicTimer);
    const g = this.musicGain;
    g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.4);
    setTimeout(() => g.disconnect(), 2500);
  }

  schedule() {
    const ctx = this.ctx;
    const bpm = 118;
    const s16 = 60 / bpm / 4;
    // I - V - vi - IV (D major)
    const chords = [
      [62, 66, 69],
      [57, 61, 64],
      [59, 62, 66],
      [55, 59, 62],
    ];
    const roots = [38, 33, 35, 31];
    const lead = [74, 76, 78, 81, 78, 76, 74, 73, 71, 73, 74, 76, 74, 71, 69, 71];
    while (this.musicT < ctx.currentTime + 0.2) {
      const t = this.musicT;
      const st = this.step % 64;
      const bar = Math.floor(st / 16);
      const beat = st % 16;
      // キック/スネア/ハイハット
      if (beat % 4 === 0) this.mKick(t);
      if (beat === 4 || beat === 12) this.mSnare(t);
      if (beat % 2 === 0) this.mHat(t, beat % 4 === 2 ? 0.08 : 0.04);
      // ベース
      if (beat % 2 === 0) this.mBass(t, roots[bar] + (beat === 6 || beat === 14 ? 12 : 0), s16 * 1.8);
      // パッド
      if (beat === 0) for (const n of chords[bar]) this.mPad(t, n, s16 * 16);
      // リード（後半の小節で）
      if (this.step % 128 >= 64 && beat % 4 === 0) {
        const n = lead[(Math.floor(this.step / 4) % lead.length)];
        this.mLead(t, n, s16 * 3.5);
      }
      // アルペジオ
      if (beat % 2 === 1) {
        const ch = chords[bar];
        this.mArp(t, ch[(beat >> 1) % 3] + 12, s16 * 0.9);
      }
      this.musicT += s16;
      this.step++;
    }
  }

  mKick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + 0.32);
  }

  mSnare(t) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1800;
    f.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    n.connect(f).connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    n.start(t, Math.random());
    n.stop(t + 0.2);
  }

  mHat(t, v) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    n.connect(f).connect(g).connect(this.musicGain);
    n.start(t, Math.random());
    n.stop(t + 0.06);
  }

  mBass(t, note, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = NOTE(note);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(200, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur);
  }

  mPad(t, note, dur) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.3);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.linearRampToValueAtTime(0, t + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    f.connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    for (const det of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = NOTE(note);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur);
    }
  }

  mLead(t, note, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = NOTE(note);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 4;
    vib.connect(vg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.06, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(f).connect(g);
    g.connect(this.musicGain);
    g.connect(this.reverb);
    o.start(t);
    vib.start(t);
    o.stop(t + dur);
    vib.stop(t + dur);
  }

  mArp(t, note, dur) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = NOTE(note);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.06, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.musicGain);
    o.start(t);
    o.stop(t + dur);
  }

  /** 試合イベントに応じた音 */
  onMatchEvent(e) {
    switch (e.type) {
      case 'whistle':
        this.whistle(e.kind);
        break;
      case 'kick':
        this.kick(e.power ?? 0.5);
        break;
      case 'header':
      case 'chest':
      case 'block':
        this.thud(0.25);
        break;
      case 'tackle':
        if (e.success) this.thud(0.3);
        break;
      case 'post':
        this.post();
        this.roar(0.5, 2);
        break;
      case 'net':
        this.net();
        break;
      case 'goal':
        this.roar(1.3, 7);
        break;
      case 'save':
        this.roar(0.45, 2.2);
        break;
      case 'nearmiss':
        this.groan();
        break;
      case 'shot': {
        // ゴール前からのシュートだけ沸く
        const p = e.player;
        if (p && Math.hypot(p.team.dir * PITCH.HL - p.x, p.z) < 22) this.roar(0.25, 1.4);
        break;
      }
      default:
        break;
    }
  }
}
