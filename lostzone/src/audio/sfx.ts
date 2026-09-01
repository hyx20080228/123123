// ============ WebAudio 程序化音效（无外部素材） ============
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  private osc(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), gn = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(gn); gn.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, freq = 1200, q = 1, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const flt = this.ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = q;
    const gn = this.ctx.createGain(); gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(flt); flt.connect(gn); gn.connect(this.master);
    src.start(t);
  }

  shot(heavy = false) { this.ensure(); this.noise(heavy ? 0.14 : 0.09, heavy ? .5 : .38, heavy ? 700 : 1500, 0.8); this.osc('square', heavy ? 160 : 230, 60, heavy ? .12 : .08, .18); }
  melee() { this.ensure(); this.noise(0.1, 0.3, 2400, 2); this.osc('sine', 500, 180, 0.09, 0.15); }
  hit() { this.ensure(); this.osc('square', 320, 90, 0.08, 0.2); }
  hurt() { this.ensure(); this.osc('sawtooth', 200, 70, 0.2, 0.22); }
  pickup() { this.ensure(); this.osc('sine', 620, 1240, 0.12, 0.2); this.osc('sine', 930, 1860, 0.14, 0.12, 0.06); }
  chime() { this.ensure(); this.osc('sine', 880, 880, 0.5, 0.2); this.osc('sine', 1320, 1320, 0.6, 0.12, 0.12); this.osc('sine', 1760, 1760, 0.8, 0.08, 0.25); }
  unlock() { this.ensure(); this.osc('square', 320, 480, 0.1, 0.16); this.osc('square', 480, 720, 0.12, 0.14, 0.1); }
  deny() { this.ensure(); this.osc('square', 180, 120, 0.16, 0.18); }
  dog() { this.ensure(); this.osc('sawtooth', 190, 90, 0.22, 0.14); this.osc('sawtooth', 150, 70, 0.22, 0.1, 0.16); }
  dogDie() { this.ensure(); this.noise(0.3, 0.3, 900, 1); this.osc('sawtooth', 240, 50, 0.3, 0.16); }
  extract() { this.ensure(); this.osc('sine', 440, 880, 0.6, 0.2); this.osc('sine', 660, 1320, 0.7, 0.12, 0.2); }
  event() { this.ensure(); this.osc('sine', 196, 196, 1.6, 0.25); this.osc('sine', 392, 392, 1.8, 0.1, 0.1); this.osc('sine', 98, 98, 2.2, 0.2, 0.4); }
  roar() { this.ensure(); this.noise(0.5, 0.35, 400, 0.6); this.osc('sawtooth', 120, 40, 0.6, 0.25); }
  page() { this.ensure(); this.noise(0.18, 0.14, 3200, 4); }
  click() { this.ensure(); this.osc('sine', 700, 500, 0.05, 0.1); }
}
export const sfx = new Sfx();
