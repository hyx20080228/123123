/**
 * _jsdom_env.mjs — 无浏览器环境下的 DOM/音频桩，供 UI 测试使用
 *
 * 提供 setupEnv()：加载 index.html、装好 canvas 2D 与 WebAudio 桩、
 * 可选地把【合成信号注入麦克风链路】，然后真正 import app.js 跑初始化。
 * 注入信号后，整条 tick 主循环（采集→检测→平滑→UI）都会被真实执行。
 *
 * 依赖：jsdom（可用 JSDOM_PATH 指定安装位置）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'node:module';
import { plucked } from './_synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const req = createRequire(import.meta.url);

function loadJSDOM() {
  try { return req('jsdom'); }
  catch { return req(process.env.JSDOM_PATH || '/tmp/smoke/node_modules/jsdom'); }
}

// ---------------------------------------------------------------- canvas 2D 桩
export function fakeCtx() {
  const store = {};
  return new Proxy(store, {
    get(t, prop) {
      if (prop in t) return t[prop];
      if (typeof prop !== 'string') return undefined;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop() {} });
      }
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      return () => undefined;
    },
    set(t, prop, v) { t[prop] = v; return true; },
  });
}

// ---------------------------------------------------------------- WebAudio 桩
class P {
  constructor(v = 0) { this.value = v; }
  setValueAtTime(v) { this.value = v; return this; }
  linearRampToValueAtTime(v) { this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.value = v; return this; }
}
class N { connect(d) { return d; } disconnect() {} start() {} stop() {} }

/** 信号源：循环播放一段合成信号，游标按请求长度前进 */
class FakeInput {
  constructor() { this.buf = null; this.cursor = 0; this.sr = 48000; }
  set(cfg) {
    if (!cfg) { this.buf = null; return; }
    this.sr = cfg.sr || 48000;
    this.buf = plucked({ sr: this.sr, dur: cfg.dur || 6, ...cfg });
    this.cursor = 0;
  }
  /** 写入 arr（Float32Array）；无信号时写静音 */
  read(arr) {
    if (!this.buf) { arr.fill(0); return; }
    const n = this.buf.length;
    for (let i = 0; i < arr.length; i++) {
      arr[i] = this.buf[(this.cursor + i) % n];
    }
    this.cursor = (this.cursor + arr.length) % n;
  }
}

export function makeStubAudioCtx(input) {
  class StubCtx {
    constructor() {
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.state = 'running';
      this.destination = new N();
    }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
    createGain() { const n = new N(); n.gain = new P(1); return n; }
    createOscillator() { const n = new N(); n.frequency = new P(440); n.type = 'sine'; return n; }
    createBufferSource() { const n = new N(); n.buffer = null; n.onended = null; return n; }
    createBiquadFilter() { const n = new N(); n.frequency = new P(1000); n.Q = new P(1); n.type = 'lowpass'; return n; }
    createBuffer(ch, len, sr) {
      const data = new Float32Array(len);
      return {
        getChannelData: () => data,
        copyToChannel: d => data.set(d.subarray(0, Math.min(len, d.length))),
        length: len, sampleRate: sr, numberOfChannels: ch, duration: len / sr,
      };
    }
    createMediaStreamSource() { return new N(); }
    createAnalyser() {
      const n = new N();
      n.fftSize = 8192; n.smoothingTimeConstant = 0;
      n.minDecibels = -120; n.maxDecibels = -10;
      n.getFloatTimeDomainData = arr => input.read(arr);
      n.getFloatFrequencyData = arr => arr.fill(-120);
      return n;
    }
  }
  return StubCtx;
}

/** 假 getUserMedia（返回一条"已关闭所有系统处理"的麦克风轨） */
export function installFakeMic(window, input) {
  const track = {
    label: 'Fake Mic (test)',
    readyState: 'live',
    muted: false,
    getSettings: () => ({
      sampleRate: 48000, channelCount: 1,
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
    }),
    getCapabilities: () => ({ sampleRate: { min: 8000, max: 48000 } }),
    getConstraints: () => ({}),
    applyConstraints: async () => {},
    addEventListener() {}, removeEventListener() {}, stop() {},
  };
  const stream = { getAudioTracks: () => [track], getVideoTracks: () => [], getTracks: () => [track], active: true };
  if (!window.navigator.mediaDevices) {
    Object.defineProperty(window.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => stream, enumerateDevices: async () => [] },
      configurable: true,
    });
  } else {
    window.navigator.mediaDevices.getUserMedia = async () => stream;
  }
  window.MediaStream = class {};
}

// ---------------------------------------------------------------- 装配
/**
 * @param {object} [opt]
 * @param {object} [opt.signal] 注入的合成信号参数（见 _synth.plucked），不传则静音
 */
export async function setupEnv({ signal = null } = {}) {
  const { JSDOM } = loadJSDOM();
  const html = readFileSync(path.join(here, '..', 'index.html'), 'utf8');

  const dom = new JSDOM(html, {
    url: 'http://localhost:8099/tuner/index.html',
    pretendToBeVisual: true,      // 提供 requestAnimationFrame
    runScripts: 'outside-only',
  });
  const { window } = dom;

  window.HTMLCanvasElement.prototype.getContext = function () {
    this._ctx ||= fakeCtx();
    return this._ctx;
  };
  for (const [p, v] of [['clientWidth', 360], ['clientHeight', 130]]) {
    Object.defineProperty(window.HTMLCanvasElement.prototype, p, { get: () => v, configurable: true });
  }

  const input = new FakeInput();
  input.set(signal);

  window.AudioContext = makeStubAudioCtx(input);
  window.webkitAudioContext = window.AudioContext;
  window.navigator.vibrate = () => true;
  installFakeMic(window, input);
  // 屏幕常亮（jsdom 无此 API，桩掉以便 app.js 的调用链被执行）
  window.navigator.wakeLock = { request: async () => ({ released: false, addEventListener() {}, release: async () => {} }) };

  const g = globalThis;
  g.window = window;
  g.document = window.document;
  try { Object.defineProperty(g, 'navigator', { value: window.navigator, configurable: true }); }
  catch { g.navigator = window.navigator; }
  g.location = window.location;
  g.localStorage = window.localStorage;
  g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  g.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  g.Event = window.Event;
  g.CustomEvent = window.CustomEvent;
  g.HTMLElement = window.HTMLElement;
  g.getComputedStyle = window.getComputedStyle.bind(window);

  const errors = [];
  window.addEventListener('error', e => errors.push(`window.onerror: ${e.message}`));
  process.on('uncaughtException', e => errors.push(`uncaught: ${e.message}`));
  process.on('unhandledRejection', e => errors.push(`unhandledRejection: ${e && e.message}`));
  const origErr = console.error;
  console.error = (...a) => { errors.push(`console.error: ${a[0]}`); origErr(...a); };

  await new Promise(r => setTimeout(r, 60));                 // 等 jsdom load
  await import(path.join(here, '..', 'js', 'app.js') + `?t=${Date.now()}`);
  await new Promise(r => setTimeout(r, 40));

  return {
    window,
    document: window.document,
    input,
    errors,
    $: s => window.document.querySelector(s),
    $$: s => [...window.document.querySelectorAll(s)],
    click: el => el.dispatchEvent(new window.Event('click', { bubbles: true })),
    setRange: async (el, v) => {
      el.value = String(v);
      el.dispatchEvent(new window.Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 20));
    },
    setSignal: cfg => input.set(cfg),
    wait: ms => new Promise(r => setTimeout(r, ms)),
  };
}

// ---------------------------------------------------------------- 断言工具
export function makeAssert() {
  let pass = 0, fail = 0;
  const ok = (label, cond, extra = '') => {
    if (cond) { pass++; console.log(`  ✓ ${label}${extra ? '  ' + extra : ''}`); }
    else { fail++; console.log(`  ✗ ${label}${extra ? '  ' + extra : ''}`); }
  };
  const summary = title => {
    console.log('='.repeat(88));
    console.log(`  ${title}：通过 ${pass} / ${pass + fail}`);
    console.log('='.repeat(88));
    return fail;
  };
  return { ok, summary };
}
