/**
 * tone.js — 参考音发声 + 节拍器
 *
 * 参考音用 Karplus–Strong 物理拨弦模型离线渲染，音色接近真实吉他，
 * 比纯正弦更容易用耳朵判断"拍频"是否消失（人耳对拍频极敏感，
 * 这是调音老手的传统方法）。
 */

import { AudioEngine } from './audio.js';

// ---------------------------------------------------------------------------
// Karplus–Strong 拨弦合成
// ---------------------------------------------------------------------------

/**
 * @param {number} freq 目标频率 Hz
 * @param {number} dur  时长（秒）
 * @param {number} sampleRate
 * @param {object} o { brightness 0~1, damping, pick }
 * @returns {Float32Array}
 */
export function pluckBuffer(freq, dur, sampleRate, o = {}) {
  const brightness = o.brightness ?? 0.42;
  const damp = o.damping ?? 0.996;
  const N = Math.max(2, Math.round(sampleRate / freq));
  const total = Math.floor(dur * sampleRate);
  const out = new Float32Array(total);

  // 初始噪声激励（用带一点低通的白噪，模拟拨片接触）
  const buf = new Float32Array(N);
  let lp = 0;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    lp = lp * 0.35 + w * 0.65;
    buf[i] = lp;
  }

  const blend = 0.5 * (1 - brightness); // 越大越闷
  let idx = 0;
  let last = buf[N - 1];
  const decayPerCycle = Math.pow(damp, 440 / Math.max(freq, 20)); // 高频衰减更快，更真实
  for (let i = 0; i < total; i++) {
    const cur = buf[idx];
    const next = buf[(idx + 1) % N];
    const v = (1 - blend) * cur + blend * 0.5 * (cur + next);
    buf[idx] = v * decayPerCycle;
    out[i] = v;
    last = cur;
    idx = (idx + 1) % N;
  }
  // 归一化
  let peak = 0;
  for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(out[i]));
  if (peak > 0) {
    const g = 0.9 / peak;
    for (let i = 0; i < total; i++) out[i] *= g;
  }
  void last;
  return out;
}

// ---------------------------------------------------------------------------
// 播放器
// ---------------------------------------------------------------------------

export class TonePlayer {
  constructor() {
    this.volume = 0.8;
    this.duration = 2.2;
    this.active = new Set();
    this.cache = new Map();
  }

  _ctx() { return AudioEngine.ensurePlaybackContext(); }

  setVolume(v) { this.volume = Math.min(1, Math.max(0, v)); }
  setDuration(d) { this.duration = d; this.cache.clear(); }

  _buffer(freq, dur) {
    const ctx = this._ctx();
    const key = `${freq.toFixed(3)}|${dur.toFixed(2)}|${ctx.sampleRate}`;
    let b = this.cache.get(key);
    if (!b) {
      const data = pluckBuffer(freq, dur, ctx.sampleRate);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data, 0);
      if (this.cache.size > 40) this.cache.clear();
      this.cache.set(key, b);
    }
    return b;
  }

  /** 播放单音，返回可 stop 的句柄 */
  play(freq, opts = {}) {
    const ctx = this._ctx();
    const dur = opts.duration ?? this.duration;
    const buf = this._buffer(freq, dur);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const vol = (opts.volume ?? 1) * this.volume;
    const t = ctx.currentTime + (opts.delay ?? 0);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.008);
    gain.gain.setValueAtTime(vol, t + Math.max(0.02, dur - 0.25));
    gain.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    src.connect(gain).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.05);

    const handle = { src, gain, stop: () => { try { src.stop(); } catch (e) {} } };
    this.active.add(handle);
    src.onended = () => this.active.delete(handle);
    return handle;
  }

  /**
   * 扫弦（琶音式依次发声，模拟真实拨弦顺序）
   * @param {number[]} freqs 从低到高
   * @param {object} o { strumMs 扫弦总时长, down 是否向下扫 }
   */
  strum(freqs, o = {}) {
    const strumMs = o.strumMs ?? 55;
    const list = o.down === false ? freqs.slice().reverse() : freqs;
    list.forEach((f, i) => {
      this.play(f, {
        delay: (i * strumMs) / 1000,
        volume: 0.85 + 0.15 * Math.random() * 0.3,
        duration: (o.duration ?? 3.0) + i * 0.02,
      });
    });
  }

  stopAll() {
    this.active.forEach(h => h.stop());
    this.active.clear();
  }

  /** 正弦参考音（做拍频对比时用，纯音更容易听到 beat） */
  playSine(freq, dur = 3, vol = 0.35) {
    const ctx = this._ctx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol * this.volume, t + 0.02);
    g.gain.setValueAtTime(vol * this.volume, t + dur - 0.15);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t); osc.stop(t + dur + 0.05);
    return { stop: () => { try { osc.stop(); } catch (e) {} } };
  }
}

// ---------------------------------------------------------------------------
// 节拍器
// ---------------------------------------------------------------------------

export class Metronome {
  constructor() {
    this.bpm = 90;
    this.beatsPerBar = 4;
    this.subdivision = 1;         // 1=四分, 2=八分, 3=三连音, 4=十六分
    this.accentFreq = 1750;
    this.normalFreq = 1150;
    this.playing = false;
    this.volume = 0.7;
    this._timer = null;
    this._nextTime = 0;
    this._tick = 0;
    this.onBeat = null;           // 回调 (beatIndex, time) => {}
    this._scheduled = [];
  }

  _ctx() { return AudioEngine.ensurePlaybackContext(); }

  get tickInterval() {
    const perBeat = 60 / this.bpm;
    if (this.subdivision === 3) return perBeat / 3;
    return perBeat / this.subdivision;
  }

  set({ bpm, beatsPerBar, subdivision, volume }) {
    if (bpm !== undefined) this.bpm = Math.min(300, Math.max(20, Math.round(bpm)));
    if (beatsPerBar !== undefined) this.beatsPerBar = Math.min(12, Math.max(1, beatsPerBar));
    if (subdivision !== undefined) this.subdivision = subdivision;
    if (volume !== undefined) this.volume = volume;
  }

  start() {
    if (this.playing) return;
    const ctx = this._ctx();
    this.playing = true;
    this._tick = 0;
    this._nextTime = ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), 25);
    this._schedule();
  }

  stop() {
    this.playing = false;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _schedule() {
    const ctx = this._ctx();
    const ahead = 0.12;
    while (this._nextTime < ctx.currentTime + ahead) {
      this._emit(this._tick, this._nextTime);
      this._nextTime += this.tickInterval;
      this._tick++;
    }
  }

  _emit(tick, time) {
    const ticksPerBar = this.beatsPerBar * this.subdivision;
    const inBar = tick % ticksPerBar;
    const isBarStart = inBar === 0;
    const isBeat = inBar % this.subdivision === 0;

    const freq = isBarStart ? this.accentFreq : isBeat ? this.normalFreq : this.normalFreq * 0.78;
    const gain = (isBarStart ? 1 : isBeat ? 0.72 : 0.4) * this.volume;

    const ctx = this._ctx();
    // 短促"木质"咔哒：正弦 + 快速衰减 + 一点点噪声瞬态
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.6, time);
    osc.frequency.exponentialRampToValueAtTime(freq, time + 0.012);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(gain, time + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0005, time + (isBeat ? 0.075 : 0.045));
    osc.connect(g).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.12);

    // 噪声瞬态
    const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.02), ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / nd.length, 6);
    const ns = ctx.createBufferSource();
    ns.buffer = nb;
    const ng = ctx.createGain();
    ng.gain.value = gain * 0.18;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq * 1.4; bp.Q.value = 1.2;
    ns.connect(bp).connect(ng).connect(ctx.destination);
    ns.start(time);

    if (this.onBeat) {
      const delay = Math.max(0, (time - ctx.currentTime) * 1000);
      const id = setTimeout(() => this.onBeat({ tick, inBar, isBarStart, isBeat }), delay);
      this._scheduled.push(id);
      if (this._scheduled.length > 40) { clearTimeout(this._scheduled.shift()); }
    }
  }
}
