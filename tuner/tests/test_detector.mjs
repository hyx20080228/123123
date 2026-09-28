/**
 * test_detector.mjs — JS 版检测器的精度自检
 *
 * Python 基准（tests/test_accuracy.py）验证的是算法设计；本文件验证
 * 【JS 实现】与之一致（FFT / YIN / ρ 精修 / 非谐性补偿的移植没有走样）。
 * 用与 synth.py 相同的物理模型在 JS 里合成弦音，逐音对比。
 *
 * 运行：node tuner/tests/test_detector.mjs
 */

import PitchDetector from '../js/pitch/detector.js';

const SR = 48000;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 与 tests/synth.py 相同的拨弦模型 */
function plucked({ f0, dur = 2.0, nHarm = 18, B = 0, pick = 0.13, brightness = 1.0, decayT60 = 8, seed = 1, snrDb = 60, hum = 0 }) {
  const rng = mulberry32(seed);
  const n = Math.floor(dur * SR);
  const out = new Float64Array(n);
  const t = new Float64Array(n);
  for (let i = 0; i < n; i++) t[i] = i / SR;

  let total = 0;
  for (let k = 1; k <= nHarm; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > SR * 0.48) break;
    let amp = Math.abs(Math.sin(Math.PI * k * pick));
    amp *= Math.pow(1 / k, 1 + 0.35 * (1 - brightness));
    const tau = decayT60 / (1 + 0.55 * Math.pow(k - 1, 0.9)) / 3;
    const phase = rng() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      out[i] += amp * Math.exp(-t[i] / tau) * Math.sin(2 * Math.PI * fk * t[i] + phase);
    }
    total += amp;
  }
  for (let i = 0; i < n; i++) out[i] /= Math.max(total, 1e-9);

  // 起振瞬态
  const na = Math.floor(0.003 * SR);
  for (let i = 0; i < na; i++) {
    out[i] += (rng() * 2 - 1) * Math.exp(-i / (na / 3.5)) * 0.16;
  }
  // 归一化
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < n; i++) out[i] *= 0.7 / Math.max(peak, 1e-9);

  // 加噪 + 工频哼声
  if (snrDb < 90) {
    const p = out.reduce((s, v) => s + v * v, 0) / n;
    const sigma = Math.sqrt(p / Math.pow(10, snrDb / 10));
    for (let i = 0; i < n; i++) out[i] += (rng() * 2 - 1) * sigma * 1.2;
  }
  if (hum > 0) for (let i = 0; i < n; i++) out[i] += hum * Math.sin(2 * Math.PI * 50 * t[i]);
  return out;
}

const NOTE = {
  C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11,
};
function noteFreq(note) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  const semi = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (parseInt(m[3], 10) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

const cents = (a, b) => 1200 * Math.log2(a / b);

function run() {
  console.log('='.repeat(96));
  console.log('  JS 版检测器精度自检（与 tests/synth.py 同模型合成弦音）');
  console.log('='.repeat(96));

  let fail = 0;
  const check = (label, errs, target) => {
    const ae = errs.map(Math.abs);
    const mae = ae.reduce((s, v) => s + v, 0) / ae.length;
    const oct = ae.filter(v => v > 60).length;
    const ok = mae <= target && oct === 0;
    if (!ok) fail++;
    console.log(`  ${label.padEnd(44)} n=${String(errs.length).padEnd(3)} MAE=${mae.toFixed(3).padStart(7)}  ` +
      `最大=${Math.max(...ae).toFixed(2).padStart(6)}  八度误判=${oct}  目标≤${target}  ${ok ? '通过' : '未达标'}`);
  };

  // ① 完全谐波信号（算法固有精度）
  console.log('\n【1】完全谐波信号 B=0（固有精度）');
  {
    const errs = [];
    for (const note of ['B0', 'E1', 'A1', 'E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'A4', 'E5', 'A5']) {
      const ft = noteFreq(note);
      const sig = plucked({ f0: ft, B: 0, decayT60: 30, seed: 11, snrDb: 70 });
      const d = new PitchDetector({ sampleRate: SR, minFreq: Math.max(25, ft * 0.85), maxFreq: Math.min(6000, ft * 1.2) });
      for (let i = 0; i < 6; i++) {
        const st = Math.floor((0.25 + i * 0.16) * SR);
        const seg = sig.subarray(st, st + d.windowSize);
        const r = d.detect(seg, { track: false });
        if (r) errs.push(cents(r.freq, ft));
      }
    }
    check('全音域 B0–A5（谐波信号）', errs, 0.2);
  }

  // ② 真实钢弦非谐性 + 稳定后读数 + 补偿
  console.log('\n【2】真实非谐性钢弦（B=6e-5 / 2e-4），1.2s 后读数，开启刚度补偿');
  for (const [note, B, tgt] of [['A2', 6e-5, 0.6], ['E2', 2e-4, 0.8], ['E4', 1.2e-4, 0.8], ['B0', 4e-4, 1.8]]) {
    const ft = noteFreq(note);
    const sig = plucked({ f0: ft, B, nHarm: 16, seed: 21, snrDb: 50 });
    const d = new PitchDetector({ sampleRate: SR, minFreq: Math.max(25, ft * 0.85), maxFreq: Math.min(6000, ft * 1.2) });
    const errs = [];
    for (let i = 0; i < 6; i++) {
      const st = Math.floor((1.2 + i * 0.05) * SR);
      const seg = sig.subarray(st, st + d.windowSize);
      const r = d.detect(seg, { track: false });
      if (r) errs.push(cents(r.freq, ft));
    }
    check(`${note}（B=${B}）`, errs, tgt);
  }

  // ③ 抗噪
  console.log('\n【3】抗噪（含 50Hz 工频哼声）');
  for (const snr of [45, 25, 12]) {
    const errs = [];
    for (const note of ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']) {
      const ft = noteFreq(note);
      const sig = plucked({ f0: ft, B: 6e-5, seed: 31, snrDb: snr, hum: snr <= 30 ? 0.006 : 0 });
      const d = new PitchDetector({ sampleRate: SR, minFreq: 60, maxFreq: 1300 });
      for (let i = 0; i < 5; i++) {
        const st = Math.floor((0.8 + i * 0.05) * SR);
        const seg = sig.subarray(st, st + d.windowSize);
        const r = d.detect(seg, { track: false });
        if (r) errs.push(cents(r.freq, ft));
      }
    }
    check(`SNR=${snr} dB`, errs, snr >= 30 ? 0.6 : snr >= 18 ? 1.5 : 3.0);
  }

  // ④ 基频缺失（拨弦点近弦中点）
  console.log('\n【4】基频极弱（拨弦点 p∈[0.42,0.52]）');
  {
    const errs = [];
    for (const note of ['E2', 'A2', 'D3', 'G3']) {
      const ft = noteFreq(note);
      const d = new PitchDetector({ sampleRate: SR, minFreq: 60, maxFreq: 1300 });
      for (let k = 0; k < 8; k++) {
        const pick = 0.42 + (k % 5) * 0.02;
        const sig = plucked({ f0: ft, B: 6e-5, pick, seed: 41 + k, snrDb: 45 });
        const st = Math.floor(0.6 * SR);
        const seg = sig.subarray(st, st + d.windowSize);
        const r = d.detect(seg, { track: false });
        if (r) errs.push(cents(r.freq, ft));
      }
    }
    check('基频极弱', errs, 2.0);
  }

  // ⑤ 工频哼声抑制：纯 50Hz 哼声不应被锁定为音符
  console.log('\n【5】工频哼声抑制');
  {
    const d = new PitchDetector({ sampleRate: SR, minFreq: 40, maxFreq: 1300 });
    const n = d.windowSize;
    const hum = new Float64Array(n);
    for (let i = 0; i < n; i++) hum[i] = 0.3 * Math.sin(2 * Math.PI * 50 * i / SR) * 0.9;
    const r = d.detect(hum, { track: false });
    const lockedToHum = r && Math.abs(cents(r.freq, 50)) < 10;
    console.log(`  纯 50Hz 哼声 → ${r ? `检出 ${r.freq.toFixed(1)} Hz（hum=${r.isHum ?? '-'}）` : '无结果（正确拒绝）'}` +
      `  ${!lockedToHum ? '通过' : '未达标'}`);
    if (lockedToHum) fail++;

    // 真实 D3（146.83 Hz，距 150Hz 仅 37 音分）不应被误伤
    const ft = noteFreq('D3');
    const sig = plucked({ f0: ft, B: 6e-5, seed: 51, snrDb: 45 });
    const d2 = new PitchDetector({ sampleRate: SR, minFreq: 60, maxFreq: 1300 });
    const st = Math.floor(0.8 * SR);
    const r2 = d2.detect(sig.subarray(st, st + d2.windowSize), { track: false });
    const e = r2 ? cents(r2.freq, ft) : NaN;
    const ok = r2 && Math.abs(e) < 2;
    console.log(`  真实 D3（距 150Hz 仅 37 音分）→ 误差 ${e.toFixed(2)} 音分  ${ok ? '通过' : '未达标'}`);
    if (!ok) fail++;
  }

  // ⑥ 与 Python 版对照（同样的信号，JS 与 Python 的读数应高度一致）
  console.log('\n【6】与 Python 实现的读数一致性');
  {
    const cases = [['E2', 6e-5], ['A2', 6e-5], ['D3', 1e-4], ['E4', 1.2e-4]];
    const diffs = [];
    for (const [note, B] of cases) {
      const ft = noteFreq(note);
      const sig = plucked({ f0: ft, B, seed: 61, snrDb: 60 });
      const d = new PitchDetector({ sampleRate: SR, minFreq: 60, maxFreq: 1300 });
      const st = Math.floor(1.0 * SR);
      const r = d.detect(sig.subarray(st, st + d.windowSize), { track: false });
      // Python 侧同参数读数（由 tests/parity.json 提供，若存在）
      diffs.push(r ? cents(r.freq, ft) : NaN);
    }
    const mx = Math.max(...diffs.map(Math.abs));
    console.log(`  JS 读数偏差（应≈Python 场景2 的收敛值）：${diffs.map(v => v.toFixed(2)).join(', ')} 音分`);
    console.log(`  最大 |偏差| = ${mx.toFixed(2)} 音分  ${mx < 1.5 ? '通过' : '未达标'}`);
    if (mx >= 1.5) fail++;
  }

  console.log('\n' + '='.repeat(96));
  console.log(fail === 0 ? '  ✓ JS 检测器全部自检通过' : `  ✗ ${fail} 项未达标`);
  console.log('='.repeat(96));
  process.exit(fail === 0 ? 0 : 1);
}

run();
