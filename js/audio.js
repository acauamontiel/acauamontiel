// Som sintetizado com WebAudio: motor (dente de serra filtrado), batidas e efeitos.
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engine = null;
  }

  /** Precisa ser chamado a partir de um gesto do usuário. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // Motor: dois osciladores (fundamental + oitava) → filtro passa-baixa → ganho.
    const osc1 = ctx.createOscillator(); osc1.type = 'sawtooth';
    const osc2 = ctx.createOscillator(); osc2.type = 'square';
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600; filter.Q.value = 2;
    const g1 = ctx.createGain(); g1.gain.value = 0.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.12;
    const eg = ctx.createGain(); eg.gain.value = 0;
    osc1.connect(g1).connect(filter);
    osc2.connect(g2).connect(filter);
    filter.connect(eg).connect(this.master);
    osc1.start(); osc2.start();
    this.engine = { osc1, osc2, filter, gain: eg };
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  /** rpm em [0,1], throttle em [0,1]. */
  engineUpdate(rpm, throttle, running) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 55 + rpm * 165;
    this.engine.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 2.01, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(400 + rpm * 1400 + throttle * 600, t, 0.08);
    this.engine.gain.gain.setTargetAtTime(running ? 0.18 + rpm * 0.12 + throttle * 0.08 : 0, t, 0.1);
  }

  noise(duration, volume, freq = 800, q = 0.7, type = 'lowpass') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * duration);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = volume;
    src.connect(f).connect(g).connect(this.master);
    src.start();
  }

  tone(freq, duration, volume, type = 'square', slide = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + duration);
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + duration);
  }

  crash() { this.noise(0.6, 0.9, 500, 0.5); this.tone(90, 0.5, 0.5, 'sawtooth', -60); }
  pothole() { this.noise(0.18, 0.6, 220, 0.8); this.tone(60, 0.25, 0.4, 'sine', -30); }
  moto(combo) { this.noise(0.25, 0.5, 2500, 0.5, 'highpass'); this.tone(660 + combo * 60, 0.12, 0.35, 'square'); setTimeout(() => this.tone(990 + combo * 80, 0.18, 0.3, 'square'), 90); }
  curb() { this.noise(0.08, 0.25, 900, 0.8); }
  start() { this.tone(440, 0.1, 0.3); setTimeout(() => this.tone(660, 0.1, 0.3), 120); setTimeout(() => this.tone(880, 0.25, 0.35), 240); }
  gameOver() { this.tone(300, 0.4, 0.4, 'sawtooth', -200); setTimeout(() => this.tone(200, 0.6, 0.4, 'sawtooth', -150), 300); }
}
