// WebAudio による手続き型サウンド。外部ファイル不要。
//  - レイヤー式シーケンサー (強度で楽器が増える)
//  - ロックオン音・ミサイル発射音は 16 分音符に量子化され、プレイヤーの攻撃が演奏になる
import { rng, clamp } from './util.js';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 3, 5, 7, 10];
// 収録BGM (music/*.py で生成)。ファイル構成は music/export_game.py 参照
//   stage1: メロディックメタル 160BPM E マイナー (1面・3面)
//   stage2: テクノ 140BPM F マイナー (2面)
const TRACKS = {
  stage1: { bpm: 160, loopStart: 9.0, loopEnd: 111.0, gain: 0.36, root: 40 },
  stage2: { bpm: 140, loopStart: 16.714286, loopEnd: 123.0, gain: 0.36, root: 41 },
};
const STAGE_TRACK = { 1: 'stage1', 2: 'stage2', 3: 'stage1' };

const SONGS = [
  // title
  { bpm: 116, root: 40, prog: [0, 3, -2, -5], seed: 77, drums: 1 },
  // stage 1
  { bpm: 138, root: 45, prog: [0, -4, 3, -2], seed: 11, drums: 1 },
  // stage 2
  { bpm: 146, root: 50, prog: [0, 0, -4, -2], seed: 23, drums: 1 },
  // stage 3
  { bpm: 152, root: 52, prog: [0, 3, -2, -4], seed: 37, drums: 1 },
];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVol = 0.7; this.sfxVol = 0.9;
    this.song = null; this.running = false;
    this.step = 0; this.nextTime = 0; this.timeScale = 1; this.targetScale = 1;
    this.intensity = 0; this.layerGain = [];
    this.stepQueue = []; this.polled = 0;
    this.last = {}; // SFXレート制限
    this.timer = null;
    this.slowT = 0;
    this.beats = [];
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC({ latencyHint: 'interactive' }));
    this.master = ctx.createGain(); this.master.gain.value = 1.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.18;
    this.master.connect(comp); comp.connect(ctx.destination);

    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this.musicVol;
    this.musicFilter = ctx.createBiquadFilter(); this.musicFilter.type = 'lowpass'; this.musicFilter.frequency.value = 18000; this.musicFilter.Q.value = 0.5;
    this.musicBus.connect(this.musicFilter); this.musicFilter.connect(this.master);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = this.sfxVol; this.sfxBus.connect(this.master);

    // リバーブ
    const len = (ctx.sampleRate * 2.0) | 0;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver(); this.reverb.buffer = ir;
    this.revGain = ctx.createGain(); this.revGain.gain.value = 0.34;
    this.reverb.connect(this.revGain); this.revGain.connect(this.master);
    this.revSend = ctx.createGain(); this.revSend.gain.value = 1; this.revSend.connect(this.reverb);

    // エコー
    this.echo = ctx.createDelay(1.0); this.echo.delayTime.value = 0.3;
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const efl = ctx.createBiquadFilter(); efl.type = 'lowpass'; efl.frequency.value = 3200;
    this.echo.connect(efl); efl.connect(fb); fb.connect(this.echo);
    this.echoOut = ctx.createGain(); this.echoOut.gain.value = 0.5; efl.connect(this.echoOut); this.echoOut.connect(this.musicBus);
    this.echoIn = ctx.createGain(); this.echoIn.connect(this.echo);

    // レイヤー
    for (let i = 0; i < 4; i++) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.musicBus);
      g.connect(this.revSend);
      this.layerGain.push(g);
    }

    // ノイズバッファ
    const nl = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;

    this.timer = setInterval(() => this._tick(), 25);
    this.tracks = {}; this.trackLoading = {};
    this._loadTrack('stage1');
  }

  resume() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume();
  }
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }

  setVolumes(music, sfx) {
    this.musicVol = music; this.sfxVol = sfx;
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(music, this.ctx.currentTime, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
  }

  // ---------- 基本ユーティリティ ----------
  _now() { return this.ctx.currentTime; }
  _osc(type, freq, t, dur, vol, dest, opts = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (opts.f2) o.frequency.exponentialRampToValueAtTime(Math.max(1, opts.f2), t + (opts.fd || dur));
    if (opts.detune) o.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.a || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (opts.lp) {
      const f = ctx.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(opts.lp, t);
      if (opts.lp2) f.frequency.exponentialRampToValueAtTime(opts.lp2, t + dur);
      f.Q.value = opts.q || 1;
      o.connect(f); node = f;
    }
    node.connect(g);
    let out = g;
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(opts.pan, -1, 1); g.connect(p); out = p;
    }
    out.connect(dest);
    if (opts.rev) { const s = ctx.createGain(); s.gain.value = opts.rev; out.connect(s); s.connect(this.revSend); }
    if (opts.echo) { const s = ctx.createGain(); s.gain.value = opts.echo; out.connect(s); s.connect(this.echoIn); }
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  _noise(t, dur, vol, dest, opts = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf;
    s.loopStart = 0; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = opts.type || 'lowpass';
    f.frequency.setValueAtTime(opts.f || 2000, t);
    if (opts.f2) f.frequency.exponentialRampToValueAtTime(opts.f2, t + dur);
    f.Q.value = opts.q || 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (opts.a || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g);
    let out = g;
    if (opts.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(opts.pan, -1, 1); g.connect(p); out = p;
    }
    out.connect(dest);
    if (opts.rev) { const r = ctx.createGain(); r.gain.value = opts.rev; out.connect(r); r.connect(this.revSend); }
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  _rl(key, ms) { // レート制限
    const n = performance.now();
    if (this.last[key] && n - this.last[key] < ms) return false;
    this.last[key] = n; return true;
  }

  // ---------- 音楽 ----------
  // base64 で同梱された BGM をデコード (曲ごとに一度だけ)
  _loadTrack(name) {
    const b64 = window.__BGM && window.__BGM[name];
    if (!b64 || this.tracks[name] || this.trackLoading[name]) return;
    this.trackLoading[name] = true;
    try {
      const bin = atob(b64);
      const u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      this.ctx.decodeAudioData(u.buffer, (buf) => {
        this.tracks[name] = buf; this.trackLoading[name] = false;
        if (this.pendingTrack === name) this._startTrack(name);
      }, (e) => { this.trackLoading[name] = false; console.warn('BGM decode failed', name, e); });
    } catch (e) { this.trackLoading[name] = false; console.warn('BGM load failed', name, e); }
  }
  _startTrack(name) {
    this.pendingTrack = null;
    const ctx = this.ctx, cfg = TRACKS[name], buf = this.tracks[name];
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    src.loopStart = cfg.loopStart; src.loopEnd = Math.min(cfg.loopEnd, buf.duration);
    const g = ctx.createGain(); g.gain.value = cfg.gain;
    src.connect(g); g.connect(this.musicBus);
    const t0 = ctx.currentTime + 0.05;
    src.start(t0);
    this.trackSrc = src; this.trackGain = g;
    this.step = 0; this.nextTime = t0;  // ビートグリッドは再生開始時刻から 16 分音符刻み
  }
  _stopTrack() {
    this.pendingTrack = null;
    if (!this.trackSrc) return;
    const t = this.ctx.currentTime;
    this.trackGain.gain.setTargetAtTime(0, t, 0.08);
    try { this.trackSrc.stop(t + 0.5); } catch (_) { /* noop */ }
    this.trackSrc = null; this.trackGain = null;
  }

  startMusic(idx) {
    if (!this.ctx) return;
    this._stopTrack();
    const name = STAGE_TRACK[idx];
    if (name && window.__BGM && window.__BGM[name]) {
      // 収録BGMモード: シーケンサーは鳴らさず、ビートグリッドだけ刻む
      const cfg = TRACKS[name];
      this.mode = 'track'; this.cur = cfg;
      this.song = { bpm: cfg.bpm, root: cfg.root, prog: [0, 0, 0, 0] };
      this.songIdx = idx;
      this.running = true;
      this.stepQueue.length = 0; this.beats.length = 0;
      this.nextTime = Infinity;
      for (const g of this.layerGain) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      this.intensity = 0;
      if (this.tracks[name]) this._startTrack(name); else { this.pendingTrack = name; this._loadTrack(name); }
      const next = STAGE_TRACK[idx + 1];  // 次の面の曲を先読み
      if (next) this._loadTrack(next);
      return;
    }
    this.mode = 'seq';
    const sg = SONGS[idx] || SONGS[1];
    this.song = sg; this.songIdx = idx;
    this.rnd = rng(sg.seed);
    // パターン生成
    const r = rng(sg.seed * 3 + 1);
    this.arpPat = []; this.leadPat = []; this.bassPat = [];
    for (let b = 0; b < 4; b++) {
      const arp = [], lead = [], bass = [];
      for (let i = 0; i < 16; i++) {
        arp.push(i % 2 === 0 || r() < 0.55 ? ((r() * 5) | 0) + (r() < 0.25 ? 5 : 0) : -1);
        lead.push(i % 4 === 0 && r() < 0.8 ? ((r() * 5) | 0) + 5 + (r() < 0.3 ? 5 : 0) : (r() < 0.12 ? ((r() * 5) | 0) + 5 : -1));
        bass.push(i % 4 === 0 ? 0 : (i % 2 === 0 && r() < 0.6 ? (r() < 0.3 ? 7 : 0) : (r() < 0.18 ? 12 : -1)));
      }
      this.arpPat.push(arp); this.leadPat.push(lead); this.bassPat.push(bass);
    }
    this.step = 0; this.nextTime = this.ctx.currentTime + 0.08; this.running = true;
    this.stepQueue.length = 0; this.beats.length = 0;
    this.echo.delayTime.value = (60 / sg.bpm) * 0.75;
    this.intensity = 0;
    this.setIntensity(sg.drums ? 1 : 0, true);
  }
  stopMusic() {
    this.running = false;
    if (!this.ctx) return;
    this._stopTrack();
    for (const g of this.layerGain) g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2);
  }
  setIntensity(n, immediate) {
    this.intensity = n;
    if (!this.ctx || this.mode === 'track') return;
    const t = this.ctx.currentTime;
    const levels = [1, n >= 1 ? 1 : 0, n >= 2 ? 1 : 0, n >= 3 ? 1 : 0];
    for (let i = 0; i < 4; i++) this.layerGain[i].gain.setTargetAtTime(levels[i] * (i === 0 ? 0.7 : 0.8), t, immediate ? 0.01 : 0.35);
  }
  setTimeScale(s) { this.targetScale = s; }
  get stepDur() {
    if (this.mode === 'track') return 60 / this.cur.bpm / 4;
    return 60 / (this.song ? this.song.bpm : 130) / 4 / this.timeScale;
  }

  _tick() {
    if (!this.ctx || this.ctx.state !== 'running') return;
    // タイムスケール追従 (ふわっと減速)
    this.timeScale += (this.targetScale - this.timeScale) * 0.12;
    if (this.musicFilter) {
      const f = 400 + 17600 * Math.pow(clamp((this.timeScale - 0.35) / 0.65, 0, 1), 2.2);
      this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    }
    if (!this.running) return;
    const ahead = 0.18;
    if (this.mode === 'track') {
      while (this.nextTime < this.ctx.currentTime + ahead) {
        this.stepQueue.push(this.nextTime);
        if (this.stepQueue.length > 48) this.stepQueue.shift();
        if (this.step % 4 === 0) this.beats.push(this.nextTime);
        this.nextTime += this.stepDur;
        this.step++;
      }
      return;
    }
    while (this.nextTime < this.ctx.currentTime + ahead) {
      this._playStep(this.step, this.nextTime);
      this.stepQueue.push(this.nextTime);
      if (this.stepQueue.length > 48) this.stepQueue.shift();
      this.nextTime += this.stepDur;
      this.step++;
    }
  }

  // 前回の問い合わせ以降に通過した16分音符の数
  // 通過した (look 秒先までに来る) 16 分音符の数。時刻は polled に入る
  pollSteps(look = 0) {
    this.polled = this.polled || [];
    this.polled.length = 0;
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime + look;
    let n = 0;
    while (this.stepQueue.length && this.stepQueue[0] <= now) { this.polled.push(this.stepQueue.shift()); n++; }
    return n;
  }
  // 次のステップ時刻 (量子化用)
  nextStepTime() {
    if (!this.ctx) return 0;
    const now = this.ctx.currentTime;
    for (let i = 0; i < this.stepQueue.length; i++) if (this.stepQueue[i] > now + 0.01) return this.stepQueue[i];
    return now + 0.02;
  }
  chordRoot() {
    const sg = this.song || SONGS[1];
    const bar = ((this.step >> 4) + 0) & 3;
    return sg.root + sg.prog[bar];
  }

  // 出力レイテンシ: 「今聞こえている音」は latency 秒前にスケジュールされたもの
  get lat() {
    const c = this.ctx;
    return Math.min(0.14, (c && (c.outputLatency || c.baseLatency)) || 0.04);
  }

  // 直近のビートからの減衰パルス (0..1)。画面演出の同期用
  beatPulse() {
    if (!this.ctx || !this.running) return 0;
    const now = this.ctx.currentTime - this.lat;
    const b = this.beats;
    while (b.length > 2 && b[1] <= now) b.shift();
    if (!b.length || b[0] > now) return 0;
    const ph = (now - b[0]) / (this.stepDur * 4);
    return Math.exp(-ph * 4.5);
  }

  // 最寄りのビートまでの秒数 (ビート同期リリース判定用)
  beatOffset() {
    if (!this.ctx || !this.running || !this.beats.length) return 1;
    const now = this.ctx.currentTime - this.lat;
    let best = 1;
    for (const b of this.beats) best = Math.min(best, Math.abs(b - now));
    return best;
  }
  // ビート位相 0..1 (直近ビート→次ビート)
  beatPhase() {
    if (!this.ctx || !this.running) return 0;
    const now = this.ctx.currentTime - this.lat;
    let last = -1;
    for (const b of this.beats) if (b <= now) last = b;
    if (last < 0) return 0;
    return Math.min(1, (now - last) / (this.stepDur * 4));
  }
  perfect() {
    if (!this.ctx) return; const t = this._now();
    [0, 7, 12, 19].forEach((iv, i) => this._osc('sine', mtof(84 + iv), t + i * 0.025, 0.35, 0.09, this.sfxBus, { rev: 0.5, echo: 0.3 }));
    this._noise(t, 0.05, 0.12, this.sfxBus, { type: 'highpass', f: 6000 });
  }

  _playStep(step, t) {
    const sg = this.song, ctx = this.ctx;
    const s16 = step & 15, bar = (step >> 4) & 3;
    if (s16 % 4 === 0) this.beats.push(t);
    const root = sg.root + sg.prog[bar];
    const L = this.layerGain;
    const dur = this.stepDur;
    // L0: パッド + ベース
    if (s16 === 0) {
      for (const iv of [0, 7, 12, 15]) {
        this._osc('sawtooth', mtof(root + 24 + iv), t, dur * 16 * 1.02, 0.03, L[0], { a: 0.5, lp: 1600, lp2: 700, detune: (iv - 7) * 3, rev: 0.45 });
      }
    }
    const bn = this.bassPat[bar][s16];
    if (bn >= 0) this._osc('sawtooth', mtof(root + bn + 12), t, dur * 1.7, 0.15, L[0], { lp: 1800, lp2: 260, q: 5, a: 0.004 });
    if (s16 === 0 && this.intensity >= 0) this._osc('sine', mtof(root), t, dur * 3.5, 0.1, L[0], { a: 0.01 });
    // L1: ドラム
    if (s16 % 4 === 0) {
      this._osc('sine', 160, t, 0.22, 0.55, L[1], { f2: 42, fd: 0.14, a: 0.002 });
      this._noise(t, 0.02, 0.1, L[1], { type: 'highpass', f: 2500 });
    }
    if (s16 === 4 || s16 === 12) this._noise(t, 0.16, 0.22, L[1], { type: 'bandpass', f: 1900, q: 0.8, rev: 0.25 });
    if (s16 % 2 === 0) this._noise(t, s16 % 4 === 2 ? 0.08 : 0.035, s16 % 4 === 2 ? 0.11 : 0.07, L[1], { type: 'highpass', f: 7000 });
    // L2: アルペジオ
    const an = this.arpPat[bar][s16];
    if (an >= 0) {
      const m = root + 24 + PENTA[an % 5] + (an >= 5 ? 12 : 0);
      this._osc('square', mtof(m), t, dur * 1.3, 0.045, L[2], { lp: 3800, lp2: 600, q: 2, echo: 0.55, rev: 0.25 });
      this._osc('sawtooth', mtof(m) * 1.004, t, dur * 1.1, 0.025, L[2], { lp: 3000, lp2: 500 });
    }
    if (s16 === 0 || s16 === 10) this._osc('sine', 110, t, 0.1, 0.0, L[2]);
    // L3: リード + 16分ハット
    const ln = this.leadPat[bar][s16];
    if (ln >= 0) {
      const m = root + 24 + PENTA[ln % 5] + (ln >= 5 ? 12 : 0);
      this._osc('sawtooth', mtof(m), t, dur * 2.6, 0.06, L[3], { lp: 2600, lp2: 900, q: 3, a: 0.01, echo: 0.5, rev: 0.35 });
      this._osc('square', mtof(m) * 0.5, t, dur * 2.2, 0.04, L[3], { lp: 1500, a: 0.01 });
    }
    if (s16 % 2 === 1) this._noise(t, 0.03, 0.04, L[3], { type: 'highpass', f: 9000 });
    if (s16 === 14) this._noise(t, 0.12, 0.1, L[3], { type: 'bandpass', f: 4000, q: 0.5 });
  }

  // ---------- SFX ----------
  out(pan) { return this.sfxBus; }

  uiClick() { if (!this.ctx) return; const t = this._now(); this._osc('triangle', 880, t, 0.08, 0.2, this.sfxBus, { f2: 1320, rev: 0.2 }); }
  uiStart() {
    if (!this.ctx) return; const t = this._now();
    this._osc('sawtooth', 110, t, 0.9, 0.25, this.sfxBus, { f2: 880, lp: 600, lp2: 6000, a: 0.05, rev: 0.5 });
    this._noise(t, 0.9, 0.2, this.sfxBus, { type: 'bandpass', f: 300, f2: 5000, q: 1.2, a: 0.4, rev: 0.4 });
  }
  laser(pan = 0) {
    if (!this.ctx || !this._rl('laser', 55)) return;
    const t = this._now();
    this._osc('sawtooth', 1500, t, 0.09, 0.07, this.sfxBus, { f2: 260, lp: 4000, pan, a: 0.001 });
    this._osc('square', 700, t, 0.05, 0.03, this.sfxBus, { f2: 150, pan });
  }
  // ロック音: 次の16分音符に量子化してペンタトニックで鳴らす
  lockNote(i) {
    if (!this.ctx) return;
    const t = this.running ? this.nextStepTime() : this._now() + 0.01;
    const root = this.song ? this.chordRoot() : 57;
    const m = root + 36 + PENTA[i % 5] + 12 * Math.floor(i / 5);
    this._osc('triangle', mtof(m), t, 0.22, 0.14, this.sfxBus, { a: 0.003, rev: 0.4, echo: 0.3 });
    this._osc('sine', mtof(m + 12), t, 0.12, 0.06, this.sfxBus, { rev: 0.3 });
    this._noise(t, 0.015, 0.05, this.sfxBus, { type: 'highpass', f: 6000 });
  }
  missileNote(i, pan = 0, when = 0) {
    if (!this.ctx) return;
    const t = Math.max(this._now() + 0.003, when || 0); // 拍の時刻に予約して鳴らす
    const root = this.song ? this.chordRoot() : 57;
    const m = root + 24 + PENTA[(i * 2) % 5] + 12 * Math.floor((i * 2) / 5);
    this._osc('sawtooth', mtof(m) * 2, t, 0.2, 0.07, this.sfxBus, { f2: mtof(m) * 0.5, lp: 3200, pan, rev: 0.3, echo: 0.2 });
    this._noise(t, 0.12, 0.08, this.sfxBus, { type: 'bandpass', f: 2500, f2: 600, pan });
  }
  lockFail() { if (!this.ctx || !this._rl('lf', 120)) return; this._osc('square', 180, this._now(), 0.1, 0.08, this.sfxBus, { f2: 90 }); }
  explode(size = 1, pan = 0) {
    if (!this.ctx || !this._rl('ex' + (size > 2 ? 'b' : ''), size > 2 ? 30 : 45)) return;
    const t = this._now();
    const d = 0.25 + size * 0.35;
    this._noise(t, d, 0.32 + size * 0.06, this.sfxBus, { type: 'lowpass', f: 3800, f2: 140, pan, rev: 0.25 + size * 0.1 });
    this._osc('sine', 130, t, d * 0.8, 0.5, this.sfxBus, { f2: 32, fd: d * 0.7, pan });
    if (size > 1.5) this._noise(t + 0.05, d * 1.4, 0.22, this.sfxBus, { type: 'lowpass', f: 1200, f2: 60, pan, rev: 0.5 });
  }
  hit() {
    if (!this.ctx) return; const t = this._now();
    this._osc('sawtooth', 120, t, 0.5, 0.35, this.sfxBus, { f2: 38, lp: 700, q: 5, rev: 0.3 });
    this._noise(t, 0.45, 0.45, this.sfxBus, { type: 'lowpass', f: 5000, f2: 200, rev: 0.4 });
  }
  graze() {
    if (!this.ctx || !this._rl('gz', 70)) return;
    const t = this._now();
    this._osc('sine', 2200, t, 0.12, 0.09, this.sfxBus, { f2: 4200, rev: 0.4 });
  }
  roll() {
    if (!this.ctx) return; const t = this._now();
    this._noise(t, 0.55, 0.28, this.sfxBus, { type: 'bandpass', f: 300, f2: 3200, q: 1.5, a: 0.2, rev: 0.3 });
    this._osc('sine', 300, t, 0.45, 0.1, this.sfxBus, { f2: 900, a: 0.1 });
  }
  reflect(pan = 0) {
    if (!this.ctx || !this._rl('rf', 50)) return; const t = this._now();
    this._osc('sine', 1318, t, 0.4, 0.14, this.sfxBus, { pan, rev: 0.5 });
    this._osc('sine', 1976, t, 0.35, 0.1, this.sfxBus, { pan, rev: 0.5 });
    this._osc('sine', 2637, t, 0.3, 0.07, this.sfxBus, { pan });
    this._noise(t, 0.04, 0.2, this.sfxBus, { type: 'highpass', f: 4000, pan });
  }
  warn() {
    if (!this.ctx) return; const t = this._now();
    for (let i = 0; i < 4; i++) this._osc('square', i % 2 ? 440 : 660, t + i * 0.28, 0.24, 0.1, this.sfxBus, { lp: 1800, rev: 0.3 });
  }
  overdrive(on) {
    if (!this.ctx) return; const t = this._now();
    if (on) {
      this._osc('sawtooth', 70, t, 0.9, 0.3, this.sfxBus, { f2: 1400, lp: 500, lp2: 8000, a: 0.1, rev: 0.6 });
      this._osc('sine', 90, t + 0.6, 0.8, 0.5, this.sfxBus, { f2: 28, rev: 0.4 });
      this._noise(t, 0.8, 0.25, this.sfxBus, { type: 'highpass', f: 500, f2: 6000, a: 0.5, rev: 0.4 });
    } else {
      this._osc('sawtooth', 900, t, 0.7, 0.18, this.sfxBus, { f2: 60, lp: 3000, lp2: 300, rev: 0.4 });
    }
  }
  pickup() {
    if (!this.ctx) return; const t = this._now();
    [0, 4, 7, 12].forEach((iv, i) => this._osc('triangle', mtof(72 + iv), t + i * 0.06, 0.25, 0.15, this.sfxBus, { rev: 0.4 }));
  }
  boom() { // ボス登場の低音
    if (!this.ctx) return; const t = this._now();
    this._osc('sawtooth', 55, t, 2.0, 0.35, this.sfxBus, { f2: 38, lp: 300, lp2: 120, a: 0.3, rev: 0.7 });
    this._osc('sawtooth', 58, t, 2.0, 0.3, this.sfxBus, { f2: 40, lp: 300, lp2: 120, a: 0.3 });
    this._noise(t, 1.8, 0.3, this.sfxBus, { type: 'lowpass', f: 400, f2: 60, a: 0.5, rev: 0.6 });
  }
  clear() {
    if (!this.ctx) return; const t = this._now();
    [0, 4, 7, 12, 16, 19, 24].forEach((iv, i) => {
      this._osc('triangle', mtof(60 + iv), t + i * 0.1, 0.5, 0.16, this.sfxBus, { rev: 0.6, echo: 0.4 });
      this._osc('square', mtof(48 + iv), t + i * 0.1, 0.3, 0.05, this.sfxBus, { lp: 1500 });
    });
  }
  gameOver() {
    if (!this.ctx) return; const t = this._now();
    [0, -2, -5, -9, -12].forEach((iv, i) => this._osc('sawtooth', mtof(60 + iv), t + i * 0.35, 0.8, 0.14, this.sfxBus, { lp: 1200, lp2: 200, rev: 0.7 }));
  }
  // オープニング: 起動音 → 2秒のライザー → 3.2秒でロゴ着地の衝撃音
  opening() {
    if (!this.ctx) return;
    const t = this._now();
    this.opBus = this.ctx.createGain(); this.opBus.connect(this.sfxBus);
    const B = this.opBus;
    this._osc('sine', 880, t, 0.12, 0.12, B, { f2: 1760, rev: 0.4 });
    this._osc('sine', 1320, t + 0.35, 0.1, 0.08, B, { rev: 0.4 });
    this._osc('sine', 1760, t + 0.7, 0.1, 0.08, B, { rev: 0.4 });
    this._osc('sawtooth', 55, t + 1.2, 2.0, 0.22, B, { f2: 220, fd: 2.0, lp: 200, lp2: 5000, a: 1.6, rev: 0.4 });
    this._osc('sawtooth', 110.6, t + 1.2, 2.0, 0.12, B, { f2: 440, fd: 2.0, lp: 300, lp2: 6000, a: 1.6 });
    this._noise(t + 1.2, 2.0, 0.22, B, { type: 'bandpass', f: 300, f2: 7000, q: 1.2, a: 1.8, rev: 0.4 });
  }

  // ロゴ着地の衝撃音 (OPのスキップ時も同じ音)
  slam() {
    if (!this.ctx) return;
    const s = this._now();
    this._osc('sine', 120, s, 1.6, 0.8, this.sfxBus, { f2: 30, fd: 1.2, a: 0.002 });
    this._noise(s, 1.4, 0.45, this.sfxBus, { type: 'lowpass', f: 6000, f2: 120, rev: 0.6 });
    for (const m of [40, 52, 55, 59, 64]) this._osc('sawtooth', mtof(m), s, 2.4, 0.07, this.sfxBus, { lp: 4000, lp2: 500, rev: 0.7, echo: 0.3 });
  }
  cancelOpening() {
    if (this.opBus) { this.opBus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03); this.opBus = null; }
  }

  tick() { if (!this.ctx || !this._rl('tk', 40)) return; this._osc('square', 1500, this._now(), 0.025, 0.05, this.sfxBus); }

  // エンジン常時音は廃止 (互換用の空実装)
  setEngine() {}

  // 敵機が真横を通過する音 (ドップラー風: 高→低)。closeness 0..1, pan -1..1, size 0.5..3
  flyby(pan, closeness, size = 1) {
    if (!this.ctx || !this._rl('fb', 70)) return;
    const t = this._now();
    const v = (0.12 + 0.3 * closeness) * Math.min(1.6, 0.7 + size * 0.3);
    const f0 = 1500 + 600 * (1 - size * 0.2), f1 = 220 + 80 * size;
    this._noise(t, 0.55 + size * 0.1, v, this.sfxBus, { type: 'bandpass', f: f0, f2: f1, q: 1.4, a: 0.12, pan, rev: 0.2 });
    this._osc('sawtooth', 340 + 60 * size, t, 0.6, v * 0.35, this.sfxBus, { f2: 95, fd: 0.55, lp: 1400, lp2: 300, a: 0.1, pan });
  }

  // 敵弾が脇を通り過ぎる音 (短いヒュッ)
  bulletPass(pan, closeness) {
    if (!this.ctx || !this._rl('bp', 55)) return;
    const t = this._now();
    const v = 0.05 + 0.13 * closeness;
    this._noise(t, 0.22, v, this.sfxBus, { type: 'bandpass', f: 4200, f2: 900, q: 2.2, a: 0.04, pan });
    this._osc('sine', 1700, t, 0.2, v * 0.5, this.sfxBus, { f2: 520, a: 0.03, pan });
  }

  // ボス出現時の警報サイレン (約3.2秒)
  bossWarning() {
    if (!this.ctx) return;
    const t = this._now();
    for (let i = 0; i < 4; i++) {
      const t0 = t + i * 0.8;
      this._osc('sawtooth', 420, t0, 0.78, 0.2, this.sfxBus, { f2: 980, fd: 0.38, lp: 2200, lp2: 1800, a: 0.03, rev: 0.35 });
      this._osc('square', 210, t0, 0.78, 0.1, this.sfxBus, { f2: 490, fd: 0.38, lp: 1200, a: 0.03 });
      this._osc('sine', 62, t0, 0.5, 0.35, this.sfxBus, { f2: 44, a: 0.01 });
    }
  }
}
