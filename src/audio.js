// サウンド (すべて Web Audio API による合成。音声ファイルは使用しない)
// 3.5L NA V10 の高回転サウンドを、点火周波数 (回転数/60×5) を基音とする倍音合成で表現する。

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const NOISE_LEVEL = 0.55;   // エンジンのノイズ層の基準量 (低・中回転でこの値)
const ROUGH = { pitch: 0.04, level: 0.8, noise: 0.9 };   // 低回転のバラツキの幅 (音程 ±2%・音量 ±40%・ノイズ量 ±45%)
// 高回転では歪みを外す (歪んだ経路から歪みのない経路へなめらかに切り替える)。歪みのない経路の音量合わせの係数
const ENGINE_CLEAN_K = 2.8, MASTER_CLEAN_K = 1.5;
const SOFT_DRIVE = 2.4;   // 高回転の経路に残す歪みの強さ (0 に近いほど歪みなし)。尖ったピークを丸めて音量を稼ぐ
const smooth01 = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
const highBand = rpm => smooth01((rpm - 11000) / 1500);   // 高回転帯 (11,500rpm〜) の重み 0〜1

export class GameAudio {
  constructor() { this.ctx = null; this.ready = false; this.volume = 0.8; this.others = []; this.muted = false; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    const master = this.master = ctx.createGain(); master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    // 全体の音をわずかに歪ませる (ソフトクリップ。小さい音はほぼそのまま、大きい音ほど丸く潰れる)
    const sat = this.sat = ctx.createWaveShaper(); sat.oversample = '2x';
    const sc = new Float32Array(2048); for (let i = 0; i < 2048; i++) { const x = i / 1023.5 - 1; sc[i] = Math.tanh(x * 1.9) / Math.tanh(1.9) * 0.96 + x * 0.04; }
    sat.curve = sc;
    // 歪みあり (sat) と歪みなし (clean) の 2 経路。自車が高回転のときは歪みなしへ寄せる (update)
    const satG = this.satG = ctx.createGain(), cleanG = this.cleanG = ctx.createGain(); cleanG.gain.value = 0;
    master.connect(sat); sat.connect(satG); satG.connect(comp);
    master.connect(cleanG); cleanG.connect(comp);
    // 最後にピークだけを抑えるリミッター (音量を一瞬下げるだけで波形は歪ませない)。高回転のシフトダウンなどで出力が 1 を超えて音割れしないように
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.12;
    const trim = ctx.createGain(); trim.gain.value = 0.86;   // リミッターの自動補正 (約 +1.3dB) を打ち消して元の音量に
    comp.connect(lim); lim.connect(trim); trim.connect(ctx.destination);
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
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), o4 = ctx.createOscillator();
    o1.setPeriodicWave(wA); o2.setPeriodicWave(wB); o3.setPeriodicWave(wC); o4.setPeriodicWave(wA);
    const g1 = ctx.createGain(), g2 = ctx.createGain(), g3 = ctx.createGain(), g4 = ctx.createGain();
    g1.gain.value = 0.5; g2.gain.value = 0.3; g3.gain.value = 0.35; g4.gain.value = 0;
    const mix = ctx.createGain(); mix.gain.value = 1;
    // o4: 基音をわずかにずらした波。o1 とのうなりで低〜中回転の「濁り」を作る (高回転では音量を 0 にして澄ませる)
    o1.connect(g1); o2.connect(g2); o3.connect(g3); o4.connect(g4); g1.connect(mix); g2.connect(mix); g3.connect(mix); g4.connect(mix);
    const sh = ctx.createWaveShaper();
    const curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * 3.5 + 0.12) * 0.8 - 0.07; }
    sh.curve = curve; sh.oversample = main ? '2x' : 'none';
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2000; lp.Q.value = 0.8;
    const pk = ctx.createBiquadFilter(); pk.type = 'peaking'; pk.frequency.value = 1300; pk.Q.value = 1.2; pk.gain.value = 5;
    const out = ctx.createGain(); out.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    // ノイズ層: 回転帯ごとに量を変える (setEngine)。燃焼の荒れ・排気のざらつきを、点火周波数に追従する帯域ノイズで表す
    const ns = ctx.createBufferSource(); ns.buffer = this.noiseBuf; ns.loop = true;
    const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500; nf.Q.value = 0.9;
    const ng = ctx.createGain(); ng.gain.value = 0;
    ns.connect(nf); nf.connect(ng); ng.connect(mix);
    // 歪みあり (sh) と歪みなし の 2 経路を回転数で切り替える (setEngine): 高回転では歪みを外す
    const shG = ctx.createGain(), cleanG = ctx.createGain(); cleanG.gain.value = 0;
    // 高回転の経路: ごく弱いソフトサチュレーション (入力を半分にしてから tanh で丸める。小さい音はほぼそのまま)
    const pre = ctx.createGain(); pre.gain.value = 0.5;
    const soft = ctx.createWaveShaper(); soft.oversample = main ? '2x' : 'none';
    { const c = new Float32Array(1024), A = SOFT_DRIVE; for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = Math.tanh(A * x) / Math.tanh(A); } soft.curve = c; }
    mix.connect(sh); sh.connect(shG); shG.connect(lp);
    mix.connect(pre); pre.connect(soft); soft.connect(cleanG); cleanG.connect(lp);
    lp.connect(pk); pk.connect(out);
    if (pan) { out.connect(pan); pan.connect(this.master); } else out.connect(this.master);
    o1.start(); o2.start(); o3.start(); o4.start(); ns.start(0, Math.random() * 1.5);
    return { o1, o2, o3, o4, lp, pk, out, pan, mix, g1, g2, g3, g4, nf, ng, shG, cleanG };
  }
  setEngine(e, rpm, load, gain, pan = 0) {
    const t = this.ctx.currentTime, f = clamp(rpm, 1500, 14500) / 60 * 5; // V10: 1回転で5回点火
    // エンジンを回転数で 4 つの帯に分けて扱う (帯の境目はなめらかにつなぐ)
    //   低回転 (〜5,000) / 中回転 (5,000〜9,000) / 中高回転 (9,000〜11,500) / 高回転 (11,500〜)
    const sm = v => { v = clamp(v, 0, 1); return v * v * (3 - 2 * v); };
    const a1 = sm((rpm - 4500) / 2500), a2 = sm((rpm - 8000) / 2000), a3 = sm((rpm - 11000) / 1500);
    const wLow = 1 - a1, wMid = a1 * (1 - a2), wMidHi = a2 * (1 - a3), wHigh = a3;
    // 低回転のバラツキ: 燃焼が不揃いな荒れた音にするため、音程・音量・ノイズ量を毎フレームわずかにランダムに揺らす
    //   低回転ほど強く、中回転は少し、中高回転から上は揺らさない
    const rough = wLow + wMid * 0.35;
    const jf = 1 + (Math.random() - 0.5) * ROUGH.pitch * rough, ja = 1 + (Math.random() - 0.5) * ROUGH.level * rough, jn = 1 + (Math.random() - 0.5) * ROUGH.noise * rough;
    const tj = rough > 0.05 ? 0.012 : 0.02;   // 揺らすときは追従を速く
    // 濁り: 低〜中回転 (約9,000rpm まで) で強く、11,000rpm 以上では 0 (高回転は澄んだ高音)
    const x = clamp((rpm - 8500) / 3000, 0, 1), murk = 1 - x * x * (3 - 2 * x);
    e.o1.frequency.setTargetAtTime(f * jf, t, tj);
    e.o2.frequency.setTargetAtTime(f * 0.5 * jf, t, tj);
    e.o3.frequency.setTargetAtTime(f * 0.2 * jf, t, tj);
    e.o4.frequency.setTargetAtTime(f * jf * (1 + 0.011 + 0.006 * (1 - murk)), t, tj); // 約1%ずれ → うなり
    e.g4.gain.setTargetAtTime(0.30 * murk, t, 0.05);
    e.g2.gain.setTargetAtTime(0.30 + 0.12 * murk, t, 0.05);   // 1/2 次を足して太く
    e.g3.gain.setTargetAtTime(0.35 + 0.12 * murk, t, 0.05);
    e.lp.frequency.setTargetAtTime((900 + load * 4200 + rpm * 0.16) * (1 - 0.30 * murk), t, 0.04); // 高域を少し丸める
    e.pk.gain.setTargetAtTime(5 - 2.5 * murk, t, 0.06);
    e.mix.gain.setTargetAtTime(0.55 + load * 0.75, t, 0.03);
    // ノイズ量: 低・中回転はしっかり、中高回転は軽く、高回転はなし (これまでの澄んだ音のまま)
    const nz = wLow * 2.3 + wMid * 1.4 + wMidHi * 0.4 + wHigh * 0;
    e.ng._target = nz * NOISE_LEVEL;   // (音量の測定用に目標値を保持)
    e.ng.gain.setTargetAtTime(nz * NOISE_LEVEL * jn, t, rough > 0.05 ? 0.02 : 0.05);
    e.nf.frequency.setTargetAtTime(clamp(f * (wLow * 2.0 + wMid * 2.4 + wMidHi * 3.2 + wHigh * 3.2), 350, 4200), t, 0.06);   // 低回転は低めの帯域のごろつき、上がるほどざらざら
    e.shG.gain.setTargetAtTime(Math.cos(wHigh * Math.PI / 2), t, 0.05);
    e.cleanG.gain.setTargetAtTime(Math.sin(wHigh * Math.PI / 2) * ENGINE_CLEAN_K, t, 0.05);
    e.out.gain.setTargetAtTime(gain * ja, t, rough > 0.05 ? 0.01 : 0.05);   // 音量の揺らぎは歪みの後段で (前段だと歪みで潰れて消える)
    if (e.pan) e.pan.pan.setTargetAtTime(clamp(pan, -1, 1), t, 0.08);
  }
  setVolume(v) { this.volume = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); }
  setMuted(m) { this.muted = m; if (this.master) this.master.gain.setTargetAtTime(m ? 0 : this.volume, this.ctx.currentTime, 0.08); }

  // 毎フレーム呼ぶ
  update(session, cam) {
    if (!this.ready || !session) return;
    const pl = session.player, c = pl.car, t = this.ctx.currentTime;
    const dt = clamp(t - (this.lastT ?? t), 0, 0.1); this.lastT = t;
    const cut = c.limiter && Math.floor(t * 28) % 2 === 0 ? 0.35 : 1;
    // 音量は「アクセル開度」だけでなく回転数にも連動させる:
    //   アクセルを戻しても音は一気に消えず、エンジンブレーキで回転が落ちていくのに合わせて下がる。
    const rf = clamp((c.rpm - 3000) / 9500, 0, 1);
    const target = pl.pit ? 0.25 : Math.max(clamp(c.throttle, 0, 1), 0.15 + 0.5 * rf);
    this.loadSm = (this.loadSm ?? target) + (target - (this.loadSm ?? target)) * (1 - Math.exp(-dt / (target > (this.loadSm ?? 0) ? 0.04 : 0.28)));
    // シフトダウン: 回転が跳ね上がるので、音も一瞬持ち上げる (ブリッピングの吹け上がり)
    const down = c.shiftT > 0 && c.nextGear < c.gear;
    if (down && !this.prevDown) this.dnT = 1;
    this.prevDown = down; this.dnT = Math.max(0, (this.dnT || 0) - dt / 0.4);
    const upShifting = c.shiftT > 0 && c.nextGear >= c.gear;   // アップシフトの切れ目だけは一瞬音を引く
    const load = clamp(this.loadSm + 0.35 * this.dnT, 0, 1.15) * (upShifting ? 0.25 : 1);
    this.setEngine(this.player, c.rpm, load, (0.16 + 0.26 * load) * cut * (1 + 0.25 * this.dnT));
    { const hw = pl.pit ? 0 : highBand(c.rpm); this.satG.gain.setTargetAtTime(1 - hw, t, 0.05); this.cleanG.gain.setTargetAtTime(hw * MASTER_CLEAN_K, t, 0.05); }
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
