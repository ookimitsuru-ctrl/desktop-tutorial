// サウンド (すべて Web Audio API による合成。音声ファイルは使用しない)
// 3.5L NA V10 の高回転サウンドを、点火周波数 (回転数/60×5) を基音とする倍音合成で表現する。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class GameAudio {
  constructor() { this.ctx = null; this.ready = false; this.volume = 0.8; this.others = []; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    const master = this.master = ctx.createGain(); master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(ctx.destination);
    // ノイズバッファ
    const nb = this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.player = this.makeEngine(true);
    for (let k = 0; k < 3; k++) this.others.push(this.makeEngine(false));
    // タイヤスキール
    this.squeal = this.makeNoise('bandpass', 1150, 5);
    this.wind = this.makeNoise('lowpass', 500, 0.6);
    this.rumble = this.makeNoise('lowpass', 150, 1.2);
    this.rainN = this.makeNoise('highpass', 3200, 0.5);
    this.ready = true;
  }
  makeNoise(type, freq, q) {
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(this.master); src.start();
    return { src, f, g };
  }
  makeEngine(main) {
    const ctx = this.ctx;
    // 倍音構成の異なる波形を 3 本重ねる
    const mk = (harm) => { const n = harm.length; const re = new Float32Array(n + 1), im = new Float32Array(n + 1); for (let i = 0; i < n; i++) im[i + 1] = harm[i]; return ctx.createPeriodicWave(re, im, { disableNormalization: false }); };
    const wA = mk([1, 0.62, 0.48, 0.3, 0.26, 0.15, 0.12, 0.08, 0.06, 0.04]);       // 点火基音
    const wB = mk([1, 0.3, 0.55, 0.2, 0.3, 0.1, 0.12]);                             // 1/2 次 (うなり)
    const wC = mk([0.6, 1, 0.5, 0.7, 0.3, 0.35, 0.2, 0.2, 0.1, 0.12, 0.06, 0.08]);  // クランク次数 (低音の荒さ)
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator();
    o1.setPeriodicWave(wA); o2.setPeriodicWave(wB); o3.setPeriodicWave(wC);
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.3; g3.gain.value = 0.35;
    const mix = ctx.createGain(); mix.gain.value = 1;
    o1.connect(g1); o2.connect(g2); o3.connect(g3); g1.connect(mix); g2.connect(mix); g3.connect(mix);
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 2.6) * 0.85; }
    sh.curve = curve; sh.oversample = main ? '2x' : 'none';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 0.8;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1300; pk.Q.value = 1.2; pk.gain.value = 5;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    mix.connect(sh); sh.connect(lp); lp.connect(pk); pk.connect(out);
    if (pan) { out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    o1.start(); o2.start(); o3.start();
    return { o1, o2, o3, lp, out, pan, mix, g1, g2, g3 };
  }
  setEngine(e, rpm, load, gain, pan = 0) {
    const t = this.ctx.currentTime, f = clamp(rpm, 1500, 14500) / 60 * 5; // V10: 1回転で5回点火
    e.o1.frequency.setTargetAtTime(f, t, 0.02);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    e.o3.frequency.setTargetAtTime(f * 0.2, t, 0.02);
    e.lp.frequency.setTargetAtTime(900 + load * 4200 + rpm * 0.16, t, 0.04);
    e.mix.gain.setTargetAtTime(0.55 + load * 0.75, t, 0.03);
    e.out.gain.setTargetAtTime(gain, t, 0.05);
    if (e.pan) e.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.08);
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.08); }

  // 毎フレーム呼ぶ
  update(session, cam) {
    if (!this.ready || !session) return;
    const pl = session.player, c = pl.car, t = this.ctx.currentTime;
    const load = pl.pit ? 0.25 : clamp(c.throttle, 0, 1);
    const cut = c.limiter && Math.floor(t * 28) % 2 === 0 ? 0.35 : 1;
    this.setEngine(this.player, c.rpm, load * (c.shiftT > 0 ? 0.25 : 1), (0.16 + 0.26 * load) * cut);
    // 近い他車 3 台
    const near = [];
    for (const e of session.entries) {
      if (e === pl || e.out) continue;
      const dx = e.car.x - c.x, dy = e.car.y - c.y, d2 = dx * dx + dy * dy;
      if (d2 < 150 * 150) near.push({ e, d2, dx, dy });
    }
    near.sort((a, b) => a.d2 - b.d2);
    for (let k = 0; k < this.others.length; k++) {
      const n = near[k], o = this.others[k];
      if (!n) { o.out.gain.setTargetAtTime(0, t, 0.1); continue; }
      const d = Math.sqrt(n.d2), g = 0.2 / (1 + d * d / 500);
      // ドップラー (接近/離反の相対速度)
      const oc = n.e.car, rel = ((oc.vx * Math.cos(oc.yaw) - c.vx * Math.cos(c.yaw)) * n.dx + (oc.vx * Math.sin(oc.yaw) - c.vx * Math.sin(c.yaw)) * n.dy) / (d + 1);
      const dop = 1 - clamp(rel / 340, -0.25, 0.25);
      const rot = cam ? cam.rot : 0, sx = Math.cos(rot) * n.dx - Math.sin(rot) * n.dy;
      this.setEngine(o, oc.rpm * dop, clamp(oc.throttle, 0, 1), g, sx / 40);
    }
    // タイヤスキール
    const slip = Math.max(Math.abs(c.saF) - 0.1, Math.abs(c.saR) - 0.09, Math.abs(c.kR) - 0.14, Math.abs(c.kF) - 0.14, 0);
    const onRoad = c.offCount < 3 && !pl.pit;
    const sq = onRoad ? clamp(slip * 4, 0, 1) * clamp(c.speed / 12, 0, 1) * (1 - session.wet * 0.75) : 0;
    this.squeal.g.gain.setTargetAtTime(sq * 0.22, t, 0.05);
    this.squeal.f.frequency.setTargetAtTime(950 + c.speed * 6 + slip * 300, t, 0.06);
    // 風切り
    this.wind.g.gain.setTargetAtTime(clamp(c.speed / 90, 0, 1) ** 2 * 0.2, t, 0.1);
    this.wind.f.frequency.setTargetAtTime(350 + c.speed * 9, t, 0.1);
    // 縁石・ダート
    let rough = 0; for (let k = 0; k < 4; k++) rough += c.surf[k] === 1 ? 0.3 : c.surf[k] >= 2 ? 0.25 : 0;
    this.rumble.g.gain.setTargetAtTime(pl.pit ? 0 : clamp(rough * c.speed / 30, 0, 1) * 0.5, t, 0.04);
    this.rumble.f.frequency.setTargetAtTime(90 + c.speed * 3.5, t, 0.05);
    // 雨
    this.rainN.g.gain.setTargetAtTime(session.rain * 0.05 + session.wet * clamp(c.speed / 80, 0, 1) * 0.07, t, 0.3);
  }
  silence() {
    if (!this.ready) return; const t = this.ctx.currentTime;
    for (const e of [this.player, ...this.others]) e.out.gain.setTargetAtTime(0, t, 0.08);
    for (const n of [this.squeal, this.wind, this.rumble, this.rainN]) n.g.gain.setTargetAtTime(0, t, 0.08);
  }
  // 効果音
  blip(freq, dur = 0.12, vol = 0.2, type = 'sine') {
    if (!this.ready) return; const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  noiseBurst(dur, vol, freq, type = 'lowpass') {
    if (!this.ready) return; const ctx = this.ctx, t = ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loopStart = Math.random(); s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.02);
  }
  shift() { this.noiseBurst(0.06, 0.25, 2400, 'bandpass'); this.blip(140, 0.05, 0.12, 'square'); }
  denied() { this.blip(180, 0.14, 0.14, 'sawtooth'); }
  crash(v) { this.noiseBurst(0.35 + Math.min(0.5, v * 0.03), Math.min(0.9, 0.25 + v * 0.05), 700); this.blip(70, 0.25, Math.min(0.5, 0.15 + v * 0.03), 'triangle'); }
  light() { this.blip(520, 0.16, 0.2, 'square'); }
  go() { this.blip(1040, 0.5, 0.24, 'square'); }
  good() { this.blip(880, 0.1, 0.16); setTimeout(() => this.blip(1320, 0.18, 0.16), 90); }
  best() { this.blip(880, 0.09, 0.16); setTimeout(() => this.blip(1175, 0.09, 0.16), 80); setTimeout(() => this.blip(1568, 0.25, 0.18), 160); }
  bad() { this.blip(300, 0.2, 0.14, 'triangle'); }
  click() { this.blip(660, 0.05, 0.1, 'triangle'); }
}
