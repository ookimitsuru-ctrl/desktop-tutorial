// Minimal synthesized SFX (no external assets) via WebAudio.
class Sfx {
  constructor() {
    this.ctx = null;
  }
  _ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  _tone(freq, duration, type = "square", gainStart = 0.12) {
    try {
      const ctx = this._ensure();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(gainStart, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      /* audio unavailable, ignore */
    }
  }

  _noise(duration, gainStart = 0.15) {
    try {
      const ctx = this._ensure();
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(gainStart, ctx.currentTime);
      src.connect(gain).connect(ctx.destination);
      src.start();
    } catch (e) {
      /* ignore */
    }
  }

  shot() { this._tone(880, 0.06, "square", 0.06); }
  missile() { this._tone(320, 0.22, "sawtooth", 0.08); }
  saber() { this._tone(1400, 0.12, "sine", 0.1); this._noise(0.08, 0.08); }
  dash() { this._tone(200, 0.15, "sine", 0.07); }
  hit() { this._noise(0.1, 0.16); }
  explode() { this._noise(0.4, 0.22); this._tone(90, 0.4, "sawtooth", 0.1); }
  countdown() { this._tone(660, 0.12, "square", 0.1); }
  fight() { this._tone(1200, 0.3, "square", 0.14); }
}

export const sfx = new Sfx();
