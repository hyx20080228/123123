/**
 * harmonic.js — 谐波分析与两级精修（调音精度的关键）
 *
 * YIN 给出的是周期的粗估计，实测系统性偏差 1~5 音分（抛物线插值对
 * 非纯音信号有已知偏差）。真实乐器含丰富谐波，谐波对齐能提供远高于
 * 单周期的分辨率：f 偏 1 音分时第 8 次谐波偏 8 音分，在频谱上非常显眼。
 *
 * 本模块提供三件事：
 *
 *  A) 谱底（spectral floor）：dB 谱的滑动最小值滤波，窗宽 ∝ f。
 *     窗宽恰好落在相邻谐波的"谷底"上，因此 floor(k·f) ≈ 谷值，
 *     而 floor((k+0.5)·f) ≈ 峰值 —— 这正是判别八度的物理依据。
 *
 *  B) 峰值显著度 peakiness(f)：谐波高出谱底的分贝数（加权平均），
 *     外加"基频处必须真的有峰"的硬性检查。用来在 YIN 的多个候选
 *     （T、2T、3T…）里选出真正的基本周期，天然完成八度纠错。
 *
 *  C) 两级频率精修：
 *     第 1 级  1 音分网格搜索最大化 peakiness → 收敛到 ±2 音分
 *     第 2 级  谐波峰质心 + 加权最小二乘 → 亚 0.5 音分精度
 *              （第 k 次谐波的定位误差被 1/k 缩小，高次谐波贡献最大精度）
 */

// ---------------------------------------------------------------------------
// 频谱封装
// ---------------------------------------------------------------------------

export class Spectrum {
  /**
   * @param {Float64Array|Float32Array} mag 幅度谱（长度 fftSize/2+1）
   * @param {number} sampleRate
   * @param {number} fftSize
   */
  constructor(mag, sampleRate, fftSize) {
    this.mag = mag;
    this.nBins = mag.length;
    this.binHz = sampleRate / fftSize;
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;

    this.db = new Float64Array(this.nBins);
    for (let i = 0; i < this.nBins; i++) {
      this.db[i] = 20 * Math.log10(Math.max(mag[i], 1e-10));
    }
    this._floorCache = new Map();
  }

  /** 可用的最高分析频率（留出插值余量） */
  get maxFreq() { return (this.nBins - 3) * this.binHz; }

  /** 谱中位数（dB）—— 作为"噪声/背景"基线，衡量各谐波突出程度 */
  medianDb() {
    if (this._median !== undefined) return this._median;
    const s = [];
    for (let i = 4; i < this.nBins - 2; i += 7) s.push(this.db[i]);
    s.sort((a, b) => a - b);
    this._median = s.length ? s[s.length >> 1] : -120;
    return this._median;
  }

  /** 连续频率处的 dB 值（抛物线插值） */
  dbAt(freq) {
    const x = freq / this.binHz;
    const i = Math.floor(x);
    if (i < 1 || i >= this.nBins - 1) return -Infinity;
    const frac = x - i;
    const a = this.db[i - 1], b = this.db[i], c = this.db[i + 1];
    return b + 0.5 * (c - a) * frac + 0.5 * (a - 2 * b + c) * frac * frac;
  }

  /** 连续频率处的线性幅度（抛物线插值） */
  magAt(freq) {
    const x = freq / this.binHz;
    const i = Math.floor(x);
    if (i < 1 || i >= this.nBins - 1) return 0;
    const frac = x - i;
    const a = this.mag[i - 1], b = this.mag[i], c = this.mag[i + 1];
    const v = b + 0.5 * (c - a) * frac + 0.5 * (a - 2 * b + c) * frac * frac;
    return Math.max(v, 0);
  }

  /**
   * dB 谱的滑动最小值（谱底），半窗宽 W bins，按候选频率 f 缓存
   * 取 W ≈ 0.4·f/binHz，使窗刚好跨过半个谐波间距 → 命中谷底
   */
  floorSeries(f) {
    const key = Math.round(f * 100);
    let hit = this._floorCache.get(key);
    if (hit) return hit;

    let W = Math.round(0.4 * f / this.binHz);
    W = Math.max(1, Math.min(W, Math.floor(this.nBins / 4)));
    const n = this.nBins;
    const floor = new Float64Array(n);

    // 单调队列 O(n) 滑动最小值
    const deque = new Int32Array(n);
    let head = 0, tail = 0;
    for (let i = 0; i < n; i++) {
      while (tail > head && deque[tail - 1] >= i - W) tail--;
      while (tail > head && this.db[deque[tail - 1]] >= this.db[i]) tail--;
      deque[tail++] = i;
      floor[i] = this.db[deque[head]];
    }
    if (this._floorCache.size > 24) this._floorCache.clear();
    this._floorCache.set(key, floor);
    return floor;
  }

  /** 谱底在连续频率处的值（线性插值即可） */
  floorAt(freq, f) {
    const fl = this.floorSeries(f);
    const x = freq / this.binHz;
    const i = Math.floor(x);
    if (i < 0 || i >= fl.length - 1) return -Infinity;
    const frac = x - i;
    return fl[i] * (1 - frac) + fl[i + 1] * frac;
  }
}

export function makeSpectrumInterpolator(mag, sampleRate, fftSize) {
  return new Spectrum(mag, sampleRate, fftSize);
}

// ---------------------------------------------------------------------------
// B) 峰值显著度
// ---------------------------------------------------------------------------

const HARM_W = [0, 1.0, 0.85, 0.72, 0.62, 0.54, 0.47, 0.41, 0.36, 0.32, 0.28, 0.25, 0.22];

/**
 * 谐波峰值显著度（dB，加权平均）
 * @returns {number} 越大越像"以 f 为基频的谐波列"；无有效谐波时 -Infinity
 */
export function harmonicScore(f, spec, nHarm = 8) {
  if (!isFinite(f) || f <= 0) return -Infinity;
  const fmax = spec.maxFreq;
  const used = Math.min(nHarm, Math.max(2, Math.floor(fmax / f)));

  let acc = 0, wSum = 0;
  for (let k = 1; k <= used; k++) {
    const fk = f * k;
    const w = HARM_W[k] ?? 0.2;
    const p = spec.dbAt(fk) - spec.floorAt(fk, f);
    if (!isFinite(p)) continue;
    acc += w * p;
    wSum += w;
  }
  return wSum > 0 ? acc / wSum : -Infinity;
}

/**
 * 候选综合得分：显著度 + YIN 清晰度 + 八度防护
 *
 * 八度防护的物理依据：若真实基频是 f，则候选 2f 的"第 1 次谐波"落在
 * h1 与 h2 之间的谷底，peakiness 很低；而候选 f 的 h1 就在真峰上。
 * 因此对"基频处没有明显峰"的候选施加与缺口成正比的惩罚。
 */
export function candidateScore(f, spec, clarity, opts = {}) {
  const { nHarm = 8, clarityWeight = 5.0, baseGate = 3.0 } = opts;
  const s = harmonicScore(f, spec, nHarm);
  if (!isFinite(s)) return -Infinity;

  const h1 = spec.dbAt(f) - spec.floorAt(f, f);
  const basePenalty = isFinite(h1) ? baseGate * Math.max(0, 1 - Math.max(h1, 0) / 6) : 0;

  return s + clarityWeight * Math.max(clarity, 0) - basePenalty;
}

// ---------------------------------------------------------------------------
// C) 两级精修
// ---------------------------------------------------------------------------

/** 第 1 级：1 音分网格搜索，最大化 harmonicScore */
export function refineStage1(f0, spec, opts = {}) {
  const { rangeCents = 60, stepCents = 1.0, nHarm = 8 } = opts;
  const centsToRatio = c => Math.pow(2, c / 1200);
  let bestF = f0, bestS = -Infinity;
  for (let c = -rangeCents; c <= rangeCents + 1e-9; c += stepCents) {
    const f = f0 * centsToRatio(c);
    const s = harmonicScore(f, spec, nHarm);
    if (s > bestS) { bestS = s; bestF = f; }
  }
  // 在最优点附近做 0.1 音分细化
  for (let c = -stepCents; c <= stepCents + 1e-9; c += 0.1) {
    const f = bestF * centsToRatio(c);
    const s = harmonicScore(f, spec, nHarm);
    if (s > bestS) { bestS = s; bestF = f; }
  }
  return { freq: bestF, score: bestS };
}

/**
 * 第 2 级：谐波峰质心 + 加权最小二乘
 *
 * 对第 k 次谐波，在 k·f 附近 ±win 个 bin 内计算幅度加权质心 pk（Hz），
 * 即该谐波峰的真实位置。然后解  min Σ w_k (pk − k·f)² ，得
 *      f = Σ w_k·k·pk / Σ w_k·k²
 * 高次谐波对 f 的敏感度是 k 倍，因此其定位误差被 1/k 缩小 ——
 * 这是本调音器能达到亚音分精度的根本原因。
 */
export function refineStage2(f, spec, opts = {}) {
  const { nHarm = 8, iterations = 3, winBins = 1.15, minDb = -12 } = opts;
  let cur = f;
  const fmax = spec.maxFreq;

  for (let it = 0; it < iterations; it++) {
    let num = 0, den = 0, valid = 0;
    const used = Math.min(nHarm, Math.floor(fmax / cur));
    for (let k = 1; k <= used; k++) {
      const fk = cur * k;
      const strength = spec.dbAt(fk) - spec.floorAt(fk, cur);
      if (!isFinite(strength) || strength < minDb) continue;

      // 幅度加权质心
      const centerBin = fk / spec.binHz;
      const lo = Math.max(1, Math.floor(centerBin - winBins));
      const hi = Math.min(spec.nBins - 2, Math.ceil(centerBin + winBins));
      let sw = 0, swx = 0;
      for (let i = lo; i <= hi; i++) {
        const w = Math.max(spec.mag[i], 0);
        sw += w; swx += w * i;
      }
      if (sw <= 0) continue;
      const pk = (swx / sw) * spec.binHz;
      // 偏离过大说明质心被邻近谐波带跑，丢弃
      if (Math.abs(1200 * Math.log2(pk / fk)) > 90) continue;

      const w = k * Math.min(strength, 30);   // 高次谐波 + 强峰 权重更大
      num += w * k * pk;
      den += w * k * k;
      valid++;
    }
    if (den <= 0 || valid < 2) break;
    const next = num / den;
    if (!isFinite(next) || next <= 0) break;
    // 限制单步跳变，避免发散
    const shiftCents = 1200 * Math.log2(next / cur);
    if (Math.abs(shiftCents) > 80) break;
    cur = next;
    if (Math.abs(shiftCents) < 0.005) break;
  }
  return cur;
}

/** 完整精修：两级串联 */
export function refine(f0, spec, opts = {}) {
  const nHarm = opts.nHarm ?? 8;
  const s1 = refineStage1(f0, spec, {
    rangeCents: opts.rangeCents ?? 60,
    stepCents: opts.stepCents ?? 1.0,
    nHarm,
  });
  const f2 = refineStage2(s1.freq, spec, { nHarm });
  // 若第 2 级跑飞（超过 ±60 音分）则回退到第 1 级结果
  const drift = Math.abs(1200 * Math.log2(f2 / s1.freq));
  const freq = drift > 60 ? s1.freq : f2;
  return { freq, score: harmonicScore(freq, spec, nHarm), stage1: s1.freq, drift };
}

// 兼容旧接口名
export const refineHarmonic = refine;

export default {
  Spectrum,
  makeSpectrumInterpolator,
  harmonicScore,
  candidateScore,
  refineStage1,
  refineStage2,
  refine,
  refineHarmonic,
};
