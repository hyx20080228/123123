/**
 * detector.js — 高精度基频检测器（调音核心）
 *
 * 频率估计链路（每一步都有 tests/test_accuracy.py 的实测数据支撑）：
 *
 *  ① 抗混叠低通（6 kHz 砖墙，零相位）
 *     自相关里含 cos(2πf_kτ/sr) 分量，谐波接近 Nyquist 时 12 点 Lagrange
 *     插值误差剧增，会把 ρ 峰拉偏（实测 C7 偏差 −2.3 → −0.11 音分）。
 *
 *  ② CMNDF 找谷 → 周期候选集
 *     CMNDF 对"找谷/判周期性"极鲁棒，但谷位偏向短周期（实测 +3~4 音分），
 *     所以它【只】用来定候选，不用来定频率。
 *
 *  ③ 抛物线插值给出 τ₀，再在 τ₀ 附近最大化归一化相关系数 ρ(τ)
 *     ρ = 2·acf(τ)/(E₁+E₂)，分母恰好抵消 d(τ) 的项数递减趋势，对周期【无偏】。
 *     分数滞后处用 12 点 Lagrange 插值自相关。
 *     实测：完全谐波信号上全音域 MAE = 0.034 音分。
 *
 *  ④ 最短周期规则：在 ρ 接近最优的候选里取滞后最小者 → 杜绝八度上跳
 *
 *  ⑤ 琴弦刚度（非谐性）补偿
 *     真实弦 fk = k·f₁·√(1+B·k²)，自相关估计的是各谐波的加权折中，
 *     一阶展开给出  f_ac ≈ f₁·(1 + B·k_eff²/2)，其中
 *     k_eff² = ΣA_k²k⁴ / ΣA_k²k²，B 由各谐波峰位线性回归 y=p_k/k 对 x=k²/2 得到。
 *     实测把低音缠弦的 +4.8 音分物理偏差压到 +0.7 音分。
 *
 * 频谱只用于 ③ 的置信度、⑤ 的补偿与哼声判别；【不直接决定频率】。
 */

import FFT from '../fft.js';
import { yinCandidates, rhoAt, LAG_INTERP_TAPS } from './yin.js';
import { Spectrum } from './harmonic.js';

export const NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
export const PRECISION = { FAST: 'fast', PRECISE: 'precise' };

/** 市电基频。中国大陆 50 Hz，部分设备/地区 60 Hz */
const HUM_BASE = [50, 60];
/** 只检查低次谐波：工频高次谐波能量很弱，放宽会误伤真实音高 */
const HUM_HARMONICS = 3;
/** 判定为哼声的频率容差（音分）。D3=146.83 距 150Hz 有 37 音分，8 音分内不会误伤 */
const HUM_TOLERANCE_CENTS = 8;

export default class PitchDetector {
  /**
   * @param {object} opts
   *   sampleRate   实际采样率（AudioContext 提供）
   *   minFreq      可检测最低频率。5 弦贝斯 B0 = 30.87 Hz
   *   maxFreq      可检测最高频率
   *   compensateInharmonicity  琴弦刚度补偿（默认开）
   */
  constructor(opts = {}) {
    this.sampleRate = opts.sampleRate || 48000;
    this.minFreq = opts.minFreq ?? 30;
    this.maxFreq = opts.maxFreq ?? 1400;
    this.threshold = opts.threshold ?? 0.15;
    /** 判定"有信号"的最低 ρ */
    this.rhoGate = opts.rhoGate ?? 0.5;
    /** 判定"有信号"的最低 RMS（约 −66 dBFS） */
    this.rmsGate = opts.rmsGate ?? 0.0005;
    this.rejectHum = opts.rejectHum ?? true;
    this.compensateInharmonicity = opts.compensateInharmonicity ?? true;
    /** 补偿量安全上限（音分），防止拟合异常时把读数带跑 */
    this.maxCompensationCents = opts.maxCompensationCents ?? 25;
    /** 分析前低通截止频率 */
    this.lowpassHz = opts.lowpassHz ??
      Math.min(0.22 * this.sampleRate, Math.max(6000, 2.5 * this.maxFreq));
    /** 上一帧频率，用于跨帧一致性 */
    this.prevFreq = null;
    /** B 的滑动估计（同一根弦上 B 是物理常数，平滑后更稳） */
    this._bSmooth = null;

    // 窗口至少要容纳最低频的 2.2 个周期，否则 CMNDF 形不成完整的谷
    const need = Math.ceil((this.sampleRate / this.minFreq) * 2.2) + LAG_INTERP_TAPS + 4;
    const precise = FFT.nextPow2(Math.max(opts.preciseSize ?? 4096, need));
    const fast = FFT.nextPow2(Math.max(opts.fastSize ?? 2048, Math.min(need, precise)));
    this.sizes = { [PRECISION.PRECISE]: precise, [PRECISION.FAST]: fast };
    this.precision = precise === fast ? PRECISION.PRECISE : PRECISION.FAST;

    this._buffers = new Map();
    this._winCache = new Map();
    this.lastResult = null;
  }

  setPrecision(p) { if (this.sizes[p]) this.precision = p; }
  get windowSize() { return this.sizes[this.precision]; }
  get windowMs() { return (this.windowSize / this.sampleRate) * 1000; }
  resetTracking() { this.prevFreq = null; this._bSmooth = null; }

  _bufs(size) {
    let b = this._buffers.get(size);
    if (!b) {
      // 频谱做 2 倍零填充：不增加真实分辨率，但显著改善抛物线插值的峰位精度
      // （临界采样时 scalloping 误差可达 ±0.15 bin，零填充后降到 ±0.02 bin）
      const specSize = FFT.nextPow2(size * 2);
      b = {
        x: new Float64Array(size),
        xf: new Float64Array(size),
        lp: new Float64Array(2 * FFT.nextPow2(size)),
        spec: new Float64Array(2 * specSize),
        mag: new Float64Array(specSize / 2 + 1),
        specSize,
      };
      this._buffers.set(size, b);
    }
    return b;
  }

  _window(size) {
    let w = this._winCache.get(size);
    if (!w) {
      w = new Float64Array(size);
      for (let i = 0; i < size; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
      this._winCache.set(size, w);
    }
    return w;
  }

  static rms(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    return Math.sqrt(s / x.length);
  }

  /**
   * 分析一帧
   * @param {Float32Array|Float64Array} input 时域样本
   * @param {object} o { window, hintFreq, track }
   *   hintFreq  期望频率（选弦模式），可显著提高抗干扰能力
   *   track     是否使用/更新跨帧跟踪（默认 true）
   */
  detect(input, o = {}) {
    const size = o.window || this.windowSize;
    const track = o.track !== false;
    if (!input || input.length < Math.floor(size * 0.8)) return null;

    const b = this._bufs(size);
    const x = b.x;
    const start = Math.max(0, input.length - size);
    let mean = 0;
    for (let i = 0; i < size; i++) {
      const v = input[start + i] || 0;
      x[i] = v; mean += v;
    }
    mean /= size;
    let energy = 0;
    for (let i = 0; i < size; i++) { x[i] -= mean; energy += x[i] * x[i]; }
    const rms = Math.sqrt(energy / size);
    if (rms < this.rmsGate) return null;

    // ① 抗混叠低通
    let sig = x;
    if (this.lowpassHz > 0 && this.lowpassHz < this.sampleRate * 0.45) {
      FFT.lowpass(x, b.xf, this.lowpassHz, this.sampleRate, b.lp);
      sig = b.xf;
    }

    // ②③④ YIN 候选 + ρ 精修 + 最短周期规则
    const yin = yinCandidates(sig, {
      minFreq: this.minFreq,
      maxFreq: this.maxFreq,
      sampleRate: this.sampleRate,
      threshold: this.threshold,
      maxCandidates: 8,
      FFT,
    });
    if (!yin.candidates.length) return null;

    // 频谱（置信度 / 哼声判别 / 非谐性补偿）
    const ws = b.spec, win = this._window(size);
    for (let i = 0; i < b.specSize; i++) {
      ws[2 * i] = i < size ? sig[i] * win[i] : 0;
      ws[2 * i + 1] = 0;
    }
    FFT.transform(ws, false);
    FFT.magnitude(ws, b.mag);
    const spec = new Spectrum(b.mag, this.sampleRate, b.specSize);
    const medianDb = spec.medianDb();

    const scored = [];
    for (const cand of yin.candidates) {
      const f = this.sampleRate / cand.lag;
      if (f < this.minFreq || f > this.maxFreq) continue;
      let penalty = 0;
      const hum = this._humCents(f);
      if (hum !== null) {
        // 工频哼声几乎是纯音：用"2/3 次谐波是否明显"来区分它和真实乐音
        const pure = this._isPureTone(spec, f, medianDb);
        penalty += pure ? 0.5 : 0.08;
      }
      if (o.hintFreq) {
        const dd = Math.abs(1200 * Math.log2(f / o.hintFreq));
        if (dd > 90) penalty += Math.min(0.6, (dd - 90) / 300);
      }
      scored.push({
        freq: f, lag: cand.lag, rho: cand.rho - penalty, rawRho: cand.rho,
        clarity: cand.clarity, depth: cand.depth, isPrimary: cand.isPrimary,
        hum, penalty,
      });
    }
    if (!scored.length) return null;

    let chosen = this._choose(scored, o.hintFreq, track);
    if (!chosen) return null;

    // 纯音哼声门限：若胜出的候选是工频纯音（无谐波结构），它不可能是拨弦，
    // 直接判为无信号。真实乐音的 2/3 次谐波很强，不会触发。
    if (this.rejectHum && chosen.hum !== null && this._isPureTone(spec, chosen.freq, medianDb)) {
      const alt = scored.filter(c => c.hum === null && c.rawRho > 0.5).sort(this._cmp)[0];
      if (!alt) return null;
      chosen = alt;
    }

    // ⑤ 非谐性补偿
    const harmonics = this._harmonicPeaks(spec, chosen.freq, medianDb);
    let freq = chosen.freq;
    let comp = null;
    if (this.compensateInharmonicity) {
      comp = this._fitInharmonicity(harmonics, chosen.freq);
      if (comp) freq = comp.f1;
    }

    const confidence = this._confidence(chosen, harmonics, rms);
    const result = {
      freq,
      rawFreq: chosen.freq,
      rho: chosen.rawRho,
      clarity: chosen.clarity,
      confidence,
      rms,
      rmsDb: 20 * Math.log10(Math.max(rms, 1e-9)),
      harmonics,
      medianDb,
      compensation: comp,
      candidates: scored.slice(0, 5),
      windowMs: this.windowMs,
      windowSize: size,
      precision: this.precision,
      lowpassHz: this.lowpassHz,
      isHum: chosen.hum !== null,
      t: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
    };
    this.lastResult = result;
    if (track) this.prevFreq = result.freq;
    return result;
  }

  // ------------------------------------------------------------------ 候选选择

  _cmp(a, b) { return b.rho - a.rho; }

  /**
   * 选择最终候选：
   *   - hintFreq（选弦模式）：期望音 ±80 音分内取 ρ 最高者
   *   - prevFreq（连续跟踪）：优先取与上一帧一致（±35 音分）且 ρ 达标者，避免指针乱跳
   *   - 否则：最短周期规则
   */
  _choose(scored, hintFreq, track) {
    const sorted = scored.slice().sort(this._cmp);
    const bestRho = sorted[0].rho;

    if (hintFreq) {
      const near = scored.filter(c => Math.abs(1200 * Math.log2(c.freq / hintFreq)) < 80);
      if (near.length) {
        near.sort(this._cmp);
        if (near[0].rho > bestRho - 0.25) return near[0];
      }
    }
    if (track && this.prevFreq) {
      const tr = scored.filter(c =>
        Math.abs(1200 * Math.log2(c.freq / this.prevFreq)) < 35 && c.rho > bestRho - 0.12);
      if (tr.length) { tr.sort(this._cmp); return tr[0]; }
    }
    const close = scored.filter(c => c.rho >= bestRho - 0.04);
    close.sort((a, b) => a.lag - b.lag);
    return close[0] || sorted[0];
  }

  // ------------------------------------------------------------------ 频谱工具

  /** 距离工频及其低次谐波的音分数；不在容差内返回 null */
  _humCents(f) {
    if (!this.rejectHum) return null;
    for (const base of HUM_BASE) {
      for (let k = 1; k <= HUM_HARMONICS; k++) {
        const c = 1200 * Math.log2(f / (base * k));
        if (Math.abs(c) < HUM_TOLERANCE_CENTS) return c;
      }
    }
    return null;
  }

  /**
   * 是否近似纯音（工频哼声的特征）：2、3 次谐波比基频弱 18 dB 以上。
   * 必须用【相对基频】的判据：空谱上中位数极低，用绝对阈值会把窗函数的
   * 旁瓣误当成"有谐波"。真实拨弦的 h2 通常只比 h1 弱 6~14 dB，
   * 而纯正弦/哼声的 h2 只剩窗旁瓣（−25 dB 以下）。
   */
  _isPureTone(spec, f, medianDb) {
    const h1 = this._peakDbAt(spec, f, medianDb);
    if (h1 < medianDb + 6) return false;      // 基频本身都不明显，谈不上纯音
    for (const k of [2, 3]) {
      const fk = f * k;
      if (fk > spec.maxFreq) continue;
      if (this._peakDbAt(spec, fk, medianDb) > h1 - 18) return false;
    }
    return true;
  }

  /** f 附近 ±1 bin 的最大谱峰强度（dB，相对谱中位数） */
  _peakDbAt(spec, f, medianDb) {
    const i = Math.round(f / spec.binHz);
    let mx = 0;
    for (let j = Math.max(1, i - 1); j <= Math.min(spec.nBins - 2, i + 1); j++) {
      if (spec.mag[j] > mx) mx = spec.mag[j];
    }
    return 20 * Math.log10(Math.max(mx, 1e-10)) - medianDb;
  }

  /**
   * 测量各次谐波的峰位与幅度
   * 峰位用 3 点抛物线插值（对数域），幅度取窗内最大
   */
  _harmonicPeaks(spec, f, medianDb) {
    const out = [];
    const fmax = Math.min(spec.maxFreq, this.lowpassHz > 0 ? this.lowpassHz : spec.maxFreq);
    const maxK = Math.min(14, Math.floor(fmax / f));
    for (let k = 1; k <= maxK; k++) {
      const fk = f * k;
      const cb = fk / spec.binHz;
      const lo = Math.max(1, Math.floor(cb - 1.5));
      const hi = Math.min(spec.nBins - 2, Math.ceil(cb + 1.5));
      if (hi <= lo) continue;
      let iMax = lo, mx = -1;
      for (let j = lo; j <= hi; j++) if (spec.mag[j] > mx) { mx = spec.mag[j]; iMax = j; }
      if (iMax < 1 || iMax >= spec.nBins - 1) continue;
      const a = spec.db[iMax - 1], bb = spec.db[iMax], c = spec.db[iMax + 1];
      const den = a - 2 * bb + c;
      let delta = 0;
      if (Math.abs(den) > 1e-9) delta = Math.max(-1, Math.min(1, (0.5 * (a - c)) / den));
      const pk = (iMax + delta) * spec.binHz;
      const devCents = 1200 * Math.log2(pk / fk);
      // 峰位太靠近 DC（bin<4）会被直流泄漏拉偏，不参与拟合；
      // |dev|<150 音分已足以确认锁定的是本谐波（相邻谐波至少差 1200/k 音分）
      const usable = Math.abs(devCents) < 150 && (pk / spec.binHz) >= 4 && mx > 0;
      out.push({
        k, freq: fk, peakFreq: pk, amp: mx,
        db: 20 * Math.log10(Math.max(mx, 1e-10)) - medianDb,
        devCents, usable,
      });
    }
    return out;
  }

  /**
   * 拟合非谐性系数 B 并补偿
   *   模型：p_k = k·f₁·√(1+B·k²) ≈ k·f₁·(1 + B·k²/2)
   *   令 y = p_k/k, x = k²/2 → y = f₁ + (f₁B/2)·x，加权线性回归（权重 A_k²·k²）
   *   自相关估计的偏移：f_ac ≈ f₁·(1 + B·k_eff²/2)，k_eff² = ΣA²k⁴/ΣA²k²
   * @returns {null|{B:number, kEff:number, f1:number, cents:number}}
   */
  _fitInharmonicity(harmonics, fAc) {
    const pts = harmonics.filter(h => h.usable && h.db > 0);
    if (pts.length < 4) return null;

    let sw = 0, swx = 0, swy = 0, swxx = 0, swxy = 0;
    let s2 = 0, s4 = 0;
    for (const h of pts) {
      const x = (h.k * h.k) / 2;
      const y = h.peakFreq / h.k;
      const w = h.amp * h.amp * h.k * h.k;     // A_k²·k²
      sw += w; swx += w * x; swy += w * y; swxx += w * x * x; swxy += w * x * y;
      s2 += h.amp * h.amp * h.k * h.k;
      s4 += h.amp * h.amp * h.k * h.k * h.k * h.k;
    }
    const det = sw * swxx - swx * swx;
    if (Math.abs(det) < 1e-18 || sw <= 0) return null;
    const slope = (sw * swxy - swx * swy) / det;
    const intercept = (swy - slope * swx) / sw;
    if (intercept <= 0) return null;

    const B = slope / intercept;
    // B 必须在物理合理范围：琴弦 1e-6 ~ 5e-3（钢琴低音弦可达 1e-2，但这里限幅）
    if (!(B > 1e-7 && B < 5e-3)) return null;

    const kEff2 = s2 > 0 ? s4 / s2 : 0;
    if (!(kEff2 > 0.5 && kEff2 < 100)) return null;

    // B 是弦的物理常数，做滑动平滑，避免逐帧抖动
    const Bs = this._bSmooth === null ? B : this._bSmooth * 0.85 + B * 0.15;
    this._bSmooth = Bs;

    let cents = 1200 * Math.log2(1 + (Bs * kEff2) / 2);
    if (!isFinite(cents)) return null;
    cents = Math.max(-this.maxCompensationCents, Math.min(this.maxCompensationCents, cents));
    const f1 = fAc / Math.pow(2, cents / 1200);
    if (f1 < this.minFreq * 0.98 || f1 > this.maxFreq * 1.02) return null;

    return { B: Bs, Braw: B, kEff: Math.sqrt(kEff2), f1, cents, nHarm: pts.length };
  }

  _confidence(cand, harmonics, rms) {
    const rhoPart = Math.min(1, Math.max(0, (cand.rawRho - 0.35) / 0.6));
    const strong = harmonics.filter(h => h.db > 3).length;
    const harmPart = Math.min(1, strong / Math.min(4, Math.max(1, harmonics.length)));
    const levelPart = Math.min(1, Math.max(0, (20 * Math.log10(Math.max(rms, 1e-9)) + 60) / 34));
    return Math.min(1, Math.max(0, 0.62 * rhoPart + 0.26 * harmPart + 0.12 * levelPart));
  }

  // ------------------------------------------------------------------ 音名换算

  static noteFromFreq(freq, a4 = 440, useFlats = false) {
    const midiFloat = 69 + 12 * Math.log2(freq / a4);
    const midi = Math.round(midiFloat);
    const cents = Math.round((midiFloat - midi) * 1000) / 10;
    const names = useFlats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
    const name = names[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    return { midi, midiFloat, name, octave, cents, label: `${name}${octave}` };
  }

  static freqFromMidi(midi, a4 = 440) {
    return a4 * Math.pow(2, (midi - 69) / 12);
  }
}

export { rhoAt };
