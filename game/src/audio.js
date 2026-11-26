// audio.js — all sound is synthesized with WebAudio: an engine drone whose
// pitch follows the throttle, wind noise that grows with airspeed, and short
// chimes for rings, landings and crashes. No audio files, no network.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    // Engine: two detuned sawtooth oscillators through a low-pass filter.
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 62;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'sawtooth';
    this.engineOsc2.frequency.value = 93;
    const g2 = this.ctx.createGain();
    g2.gain.value = 0.4;
    this.engineOsc.connect(filter);
    this.engineOsc2.connect(g2);
    g2.connect(filter);
    filter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();

    // Wind: looped white noise through a band-pass filter.
    const len = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    noise.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) {
      this.ctx.destination.gain = 0;
    }
    if (this.ctx && !muted) {
      this.ctx.destination.gain = 1;
    }
  }

  // Called every frame while flying: engine note and wind follow the plane.
  update(throttle, speed, flying) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const target = flying ? 0.05 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    this.engineOsc.frequency.setTargetAtTime(58 + throttle * 66, t, 0.1);
    this.engineOsc2.frequency.setTargetAtTime(87 + throttle * 99, t, 0.1);
    this.windGain.gain.setTargetAtTime(
      flying ? Math.min(0.16, speed * 0.0016) : 0,
      t,
      0.15,
    );
    this.windFilter.frequency.setTargetAtTime(320 + speed * 9, t, 0.15);
  }

  blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  ringChime() {
    this.blip(880, 0.35, 'sine', 0.22);
    this.blip(1318, 0.45, 'sine', 0.18, 0.07);
  }

  landChime() {
    [523, 659, 784, 1046].forEach((f, i) => this.blip(f, 0.4, 'triangle', 0.2, i * 0.09));
  }

  crashThud() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = this.ctx.sampleRate * 0.5;
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.5;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(t);
    this.blip(70, 0.5, 'sine', 0.4);
  }

  stallBeep() {
    this.blip(1175, 0.09, 'square', 0.07);
  }
}
