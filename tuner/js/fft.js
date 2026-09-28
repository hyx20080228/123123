/**
 * fft.js — 轻量原地迭代 FFT（radix-2，Cooley–Tukey）
 *
 * 复数以交错数组存放：re = data[2i], im = data[2i+1]
 * 用途：
 *   1) 计算自相关（通过功率谱 + IFFT），比 O(n²) 直接卷积快一个量级；
 *   2) 谐波精修（Harmonic Refinement）时读取幅度谱。
 */

const FFT = (() => {
  const cache = new Map(); // size -> { cos, sin, rev }

  function tables(size) {
    let t = cache.get(size);
    if (t) return t;
    const half = size >> 1;
    const cos = new Float64Array(half);
    const sin = new Float64Array(half);
    for (let i = 0; i < half; i++) {
      const a = (-2 * Math.PI * i) / size;
      cos[i] = Math.cos(a);
      sin[i] = Math.sin(a);
    }
    // 位反转表
    const bits = Math.log2(size) | 0;
    const rev = new Uint32Array(size);
    for (let i = 0; i < size; i++) {
      let x = i, r = 0;
      for (let b = 0; b < bits; b++) { r = (r << 1) | (x & 1); x >>= 1; }
      rev[i] = r;
    }
    t = { cos, sin, rev, half, bits };
    cache.set(size, t);
    return t;
  }

  /**
   * 原地 FFT / IFFT
   * @param {Float64Array} data 长度 2*size 的交错复数
   * @param {boolean} inverse true 时做逆变换（不含 1/N 归一化，调用方自行处理）
   */
  function transform(data, inverse = false) {
    const size = data.length >> 1;
    const { cos, sin, rev } = tables(size);

    for (let i = 0; i < size; i++) {
      const j = rev[i];
      if (j > i) {
        let tr = data[2 * i]; data[2 * i] = data[2 * j]; data[2 * j] = tr;
        let ti = data[2 * i + 1]; data[2 * i + 1] = data[2 * j + 1]; data[2 * j + 1] = ti;
      }
    }

    for (let len = 2; len <= size; len <<= 1) {
      const half = len >> 1;
      const step = size / len;
      for (let i = 0; i < size; i += len) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          let wr = cos[k], wi = sin[k];
          if (inverse) wi = -wi;
          const a = i + j, b = a + half;
          const br = data[2 * b], bi = data[2 * b + 1];
          const tr = wr * br - wi * bi;
          const ti = wr * bi + wi * br;
          data[2 * b] = data[2 * a] - tr;
          data[2 * b + 1] = data[2 * a + 1] - ti;
          data[2 * a] += tr;
          data[2 * a + 1] += ti;
        }
      }
    }
  }

  /** 实数 FFT，返回长度 2*(size/2+1) 的交错复数谱 */
  function real(input, out) {
    const n = input.length;
    for (let i = 0; i < n; i++) { out[2 * i] = input[i]; out[2 * i + 1] = 0; }
    transform(out, false);
    return out;
  }

  /**
   * 实序列自相关：r[k] = Σ x[i]·x[i+k]
   * 用 FFT 功率谱 + IFFT 实现，结果写入 acf（长度 >= n）
   */
  function autocorr(input, acf, scratch) {
    const n = input.length;
    const size = scratch.length >> 1;
    for (let i = 0; i < size; i++) {
      scratch[2 * i] = i < n ? input[i] : 0;
      scratch[2 * i + 1] = 0;
    }
    transform(scratch, false);
    // 功率谱 |X|²
    for (let i = 0; i < size; i++) {
      const re = scratch[2 * i], im = scratch[2 * i + 1];
      scratch[2 * i] = re * re + im * im;
      scratch[2 * i + 1] = 0;
    }
    transform(scratch, true);
    const inv = 1 / size;
    for (let k = 0; k < acf.length; k++) acf[k] = scratch[2 * k] * inv;
    return acf;
  }

  /** 幅度谱（长度 size/2+1） */
  function magnitude(spec, mag) {
    const bins = spec.length >> 1;
    for (let i = 0; i < bins; i++) {
      mag[i] = Math.hypot(spec[2 * i], spec[2 * i + 1]);
    }
    return mag;
  }

  /**
   * 理想（砖墙）零相位低通：FFT → 高频置零 → IFFT
   *
   * 为什么调音必须做这一步：ρ(τ) 精修用 12 点 Lagrange 插值自相关。
   * 自相关里含有 cos(2π·f_k·τ/sr) 分量，当某个谐波 f_k 接近 Nyquist 时，
   * 该分量在 τ 域接近每 2 个采样点一个周期，Lagrange 插值误差急剧增大，
   * 会把 ρ 的峰位拉偏（实测 C7=2093Hz 时偏差 −2.3 音分，
   * 低通到 6kHz 后降到 −0.33 音分）。低通同时还能压制手机麦克风的高频嘶声。
   */
  function lowpass(input, out, cutoffHz, sampleRate, scratch) {
    const n = input.length;
    const size = scratch.length >> 1;
    for (let i = 0; i < size; i++) {
      scratch[2 * i] = i < n ? input[i] : 0;
      scratch[2 * i + 1] = 0;
    }
    transform(scratch, false);
    const kCut = Math.max(1, Math.floor((cutoffHz * size) / sampleRate));
    const half = size >> 1;
    for (let k = kCut + 1; k <= half; k++) { scratch[2 * k] = 0; scratch[2 * k + 1] = 0; }
    transform(scratch, true);
    const inv = 1 / size;
    for (let i = 0; i < n; i++) out[i] = scratch[2 * i] * inv;
    return out;
  }

  function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }

  return { transform, real, autocorr, magnitude, lowpass, nextPow2, tables };
})();

export default FFT;
