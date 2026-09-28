/**
 * _synth.mjs — 共享的测试信号合成（与 tests/synth.py 同一物理模型）
 *
 * 所有 JS 侧测试都用它造信号，保证 Python 基准与 JS 实测面对同样的输入。
 */

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOTE = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};

/** 音名（如 'A#2'）→ 频率（A4=440） */
export function noteFreq(note, a4 = 440) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) throw new Error(`音名格式错误: ${note}`);
  const semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return a4 * Math.pow(2, (midi - 69) / 12);
}

export const centsOf = (a, b) => 1200 * Math.log2(a / b);

/**
 * 拨弦模型：非谐泛音 + 频率相关衰减 + 起振瞬态 + 噪声 + 工频哼声
 * @param {number} f0       基频 Hz
 * @param {number} B        非谐性系数（钢弦 6e-5~2e-4，尼龙 1e-4，贝斯 4e-4）
 * @param {number} sr       采样率
 */
export function plucked({
  f0, sr = 48000, dur = 2.0, nHarm = 18, B = 0, pick = 0.13,
  brightness = 1.0, decayT60 = 8, seed = 1, snrDb = 60, hum = 0,
}) {
  const rng = mulberry32(seed);
  const n = Math.floor(dur * sr);
  const out = new Float64Array(n);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i / sr;

  let total = 0;
  for (let k = 1; k <= nHarm; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > sr * 0.48) break;
    let amp = Math.abs(Math.sin(Math.PI * k * pick));
    amp *= Math.pow(1 / k, 1 + 0.35 * (1 - brightness));
    const tau = decayT60 / (1 + 0.55 * Math.pow(k - 1, 0.9)) / 3;
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) out[i] += amp * Math.exp(-t[i] / tau) * Math.sin(2 * Math.PI * fk * t[i] + phase);
    total += amp;
  }
  for (let i = 0; i < n; i++) out[i] /= Math.max(total, 1e-9);

  const na = Math.floor(0.003 * sr);
  for (let i = 0; i < na; i++) out[i] += (rng() * 2 - 1) * Math.exp(-i / (na / 3.5)) * 0.16;

  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] *= 0.7 / Math.max(peak, 1e-9);

  if (snrDb < 90) {
    const p = out.reduce((s, v) => s + v * v, 0) / n;
    const sigma = Math.sqrt(p / Math.pow(10, snrDb / 10));
    for (let i = 0; i < n; i++) out[i] += (rng() * 2 - 1) * sigma * 1.2;
  }
  if (hum > 0) {
    for (let i = 0; i < n; i++) out[i] += hum * Math.sin(2 * Math.PI * 50 * t[i]);
  }
  return out;
}
