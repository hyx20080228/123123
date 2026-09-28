/**
 * yin.js — 基频检测：CMNDF 候选 + ρ(τ) 分数滞后精修
 *
 * 三个相关量各有系统性偏差，必须分清用途：
 *
 *   d(τ)   = Σ_{j=0}^{N-1-τ} (x[j] − x[j+τ])²
 *            → 项数随 τ 减少，d 单调趋势向下 ⇒ 极小值偏向【长周期】（低八度）
 *
 *   d'(τ)  = CMNDF = d(τ) / ((1/τ)·Σ_{j<τ} d(j))
 *            → 分母是 τ 的增函数，把谷往小 τ 推 ⇒ 极小值偏向【短周期】
 *            实测偏差：偏高 3~4 音分（本仓库 tests/ 的基准数据）
 *            但它对"找谷/判周期性"极其鲁棒 → 只用于【候选检测】
 *
 *   ρ(τ)   = (2·Σx[j]x[j+τ]) / (Σx[j]² + Σx[j+τ]²)   归一化相关系数
 *            → 无量纲、无长度趋势，在真实周期处取极大值，【无偏】
 *            用作【分数滞后精修】的目标函数
 *
 * 分数滞后处 ρ 的分子需要非整数延迟的自相关，用 12 点 Lagrange 插值
 * （自相关是带限信号，插值精度远高于抛物线）。
 */

export const LAG_INTERP_TAPS = 12;

/**
 * 差分函数（精确版，含能量前缀和）
 * d(τ) = E[N−τ] + (E[N] − E[τ]) − 2·acf(τ)
 */
export function computeDifference(x, acf, d, maxLag, prefixEnergy) {
  const n = x.length;
  const E = prefixEnergy;
  E[0] = 0;
  for (let i = 0; i < n; i++) E[i + 1] = E[i] + x[i] * x[i];
  for (let tau = 0; tau <= maxLag; tau++) {
    const v = E[n - tau] + (E[n] - E[tau]) - 2 * acf[tau];
    d[tau] = v > 0 ? v : 0;
  }
  return d;
}

export function cmndf(d, c, maxLag, minLag = 2) {
  for (let tau = 0; tau < minLag; tau++) c[tau] = 1;
  let running = 0;
  for (let tau = minLag; tau <= maxLag; tau++) {
    running += d[tau];
    c[tau] = running > 0 ? (d[tau] * tau) / running : 1;
  }
  return c;
}

export function parabolicMin(y, i) {
  const a = y[i - 1], b = y[i], c = y[i + 1];
  const denom = a - 2 * b + c;
  if (Math.abs(denom) < 1e-12) return i;
  const delta = (0.5 * (a - c)) / denom;
  return Math.abs(delta) <= 1 ? i + delta : i;
}

/** 12 点 Lagrange 插值权重（等间距，节点偏移 -5..+6） */
const TAPS = LAG_INTERP_TAPS;
const HALF = TAPS / 2;

function lagrangeWeights(frac) {
  // 节点位置：i = -HALF+1 .. HALF 相对整数点；这里用 -5..6
  const w = new Float64Array(TAPS);
  let sum = 0;
  for (let i = 0; i < TAPS; i++) {
    const xi = i - (HALF - 1);          // -5 .. 6
    let p = 1;
    for (let j = 0; j < TAPS; j++) {
      if (j === i) continue;
      const xj = j - (HALF - 1);
      p *= (frac - xj) / (xi - xj);
    }
    w[i] = p;
    sum += p;
  }
  // 归一化（消除浮点误差累积）
  for (let i = 0; i < TAPS; i++) w[i] /= sum;
  return w;
}

const weightCache = new Map();
function cachedWeights(q) {
  // frac 量化到 1/1024，命中率极高
  const key = q | 0;
  let w = weightCache.get(key);
  if (!w) {
    w = lagrangeWeights(key / 1024);
    if (weightCache.size > 1100) weightCache.clear();
    weightCache.set(key, w);
  }
  return w;
}

/**
 * 归一化相关系数 ρ(τ)，τ 可为非整数
 * @param {Float64Array} acf 整数滞后自相关（长度 > τ+HALF）
 * @param {Float64Array} E   能量前缀和（长度 N+1）
 * @param {number} n 信号长度
 * @param {number} tau 滞后（可非整数）
 */
export function rhoAt(acf, E, n, tau) {
  const i = Math.floor(tau);
  if (i < HALF || i + HALF + 1 >= acf.length) return -1;
  const w = cachedWeights(Math.round((tau - i) * 1024));
  let s = 0;
  for (let k = 0; k < TAPS; k++) s += w[k] * acf[i - (HALF - 1) + k];

  // 能量项在 τ 上平滑单调递减，线性插值足够（注意 E1(τ)=E[n−τ] 的插值方向）
  const e1a = E[n - i], e1b = E[n - i - 1];
  const e2a = E[n] - E[i], e2b = E[n] - E[i + 1];
  const fr = tau - i;
  const denom = (e1a + (e1b - e1a) * fr) + (e2a + (e2b - e2a) * fr);
  if (denom <= 1e-12) return -1;
  return (2 * s) / denom;
}

/**
 * 在 τ0 附近最大化归一化相关系数 ρ(τ)。
 *
 * ρ 的分母 E1(τ)+E2(τ) ≈ 2(N−τ)·P 恰好抵消 d(τ) 的"项数随 τ 递减"趋势，
 * 因此 ρ 对周期【无偏】—— 这与 CMNDF（偏向短周期，实测 +3~4 音分）和
 * 原始 d(τ)（偏向长周期）都不同，是三者中唯一可直接用于精修的量。
 *
 * 搜索范围默认 ±2%（约 ±34 音分），只需覆盖 CMNDF 抛物线插值的残差。
 */
export function refineLag(acf, E, n, tau0, opts = {}) {
  const rel = opts.range ?? 0.02;
  const tol = opts.tol ?? 1e-4;
  const lo0 = Math.max(HALF + 1, tau0 * (1 - rel));
  const hi0 = Math.min(acf.length - HALF - 3, tau0 * (1 + rel));
  if (hi0 - lo0 < 0.2) return { lag: tau0, rho: rhoAt(acf, E, n, tau0) };

  const step = 0.25;
  let bestTau = tau0, bestRho = -Infinity;
  for (let t = lo0; t <= hi0; t += step) {
    const r = rhoAt(acf, E, n, t);
    if (r > bestRho) { bestRho = r; bestTau = t; }
  }
  let lo = Math.max(lo0, bestTau - step * 2);
  let hi = Math.min(hi0, bestTau + step * 2);
  const PHI = (Math.sqrt(5) - 1) / 2;
  let c = hi - PHI * (hi - lo);
  let d = lo + PHI * (hi - lo);
  let fc = rhoAt(acf, E, n, c);
  let fd = rhoAt(acf, E, n, d);
  let guard = 0;
  while (hi - lo > tol && guard++ < 60) {
    if (fc > fd) { hi = d; d = c; fd = fc; c = hi - PHI * (hi - lo); fc = rhoAt(acf, E, n, c); }
    else { lo = c; c = d; fc = fd; d = lo + PHI * (hi - lo); fd = rhoAt(acf, E, n, d); }
  }
  const lag = 0.5 * (lo + hi);
  const rho = rhoAt(acf, E, n, lag);
  return { lag, rho: rho > bestRho ? rho : bestRho };
}

export function evaluateRho(acf, E, n, tau) {
  return rhoAt(acf, E, n, Math.round(tau));
}

/**
 * 完整的候选检测 + 精修
 * @returns {{candidates:Array, best:object|null, cmndf:Float64Array}}
 *   candidates 已按 ρ 降序；每个含 { lag, freq, rho, clarity, depth }
 */
export function yinCandidates(x, opts = {}) {
  const {
    minFreq = 38,
    maxFreq = 1400,
    sampleRate = 48000,
    threshold = 0.15,
    maxCandidates = 8,
    FFT,
    refine = true,
  } = opts;

  const n = x.length;
  const maxLag = Math.min(n - HALF - 3, Math.ceil(sampleRate / minFreq));
  const minLag = Math.max(HALF + 1, Math.floor(sampleRate / maxFreq));
  if (maxLag <= minLag + 2) return { candidates: [], best: null, maxLag, minLag };

  const size = 1 << Math.ceil(Math.log2(2 * n));
  const scratch = new Float64Array(2 * size);
  const acf = new Float64Array(maxLag + TAPS + 2);
  const d = new Float64Array(maxLag + 1);
  const c = new Float64Array(maxLag + 1);
  const E = new Float64Array(n + 1);

  FFT.autocorr(x, acf, scratch);
  computeDifference(x, acf, d, maxLag, E);
  cmndf(d, c, maxLag, minLag);

  // 找 CMNDF 谷
  const valleys = [];
  for (let tau = minLag + 1; tau < maxLag; tau++) {
    if (c[tau] < c[tau - 1] && c[tau] <= c[tau + 1]) {
      valleys.push({ tau, depth: c[tau], clarity: 1 - c[tau] });
    }
  }
  if (!valleys.length) return { candidates: [], best: null, cmndf: c, maxLag, minLag };
  valleys.sort((a, b) => a.depth - b.depth);

  // YIN 绝对阈值：优先取最短的、深度达标的谷（这是防止八度错误的关键）
  const qualified = valleys.filter(v => v.depth < threshold);
  const primary = qualified.length ? qualified.sort((a, b) => a.tau - b.tau)[0] : valleys[0];

  const pool = valleys.slice(0, maxCandidates);
  if (!pool.some(v => v.tau === primary.tau)) pool.push(primary);

  const candidates = [];
  for (const v of pool) {
    // 粗估计：CMNDF 谷 + 抛物线插值
    const p0 = parabolicMin(c, v.tau);
    // 精修：最大化 ρ(τ)（对周期无偏）
    const r = refine ? refineLag(acf, E, n, p0, {}) : { lag: p0, rho: rhoAt(acf, E, n, v.tau) };
    const lag = r.lag, rho = r.rho;
    if (lag < minLag || lag > maxLag) continue;
    candidates.push({
      lag,
      freq: sampleRate / lag,
      rho,
      clarity: 1 - c[v.tau],
      depth: c[v.tau],
      tau: v.tau,
      isPrimary: v.tau === primary.tau,
    });
  }

  // 排序策略：ρ 优先，但强烈偏好"最短周期"以杜绝八度上跳
  candidates.sort((a, b) => b.rho - a.rho);
  const topRho = candidates.length ? candidates[0].rho : -1;
  // 最短周期规则：在所有 ρ 与最优相差 < 0.04 的候选中，取滞后最小者
  const close = candidates.filter(cd => cd.rho >= topRho - 0.04);
  close.sort((a, b) => a.lag - b.lag);
  const best = close[0] || candidates[0] || null;

  return { candidates, best, primary, cmndf: c, maxLag, minLag };
}

export default { yinCandidates, computeDifference, cmndf, parabolicMin, rhoAt, refineLag, evaluateRho };
