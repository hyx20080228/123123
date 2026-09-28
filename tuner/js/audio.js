/**
 * audio.js — 音频引擎
 *
 * ⚠️ 针对小米/Redmi（HyperOS / MIUI）的关键适配：
 *   系统默认会对麦克风做「降噪 + 自动增益(AGC)」处理。降噪会削掉弦音的谐波，
 *   AGC 会随音量改变频谱包络 —— 两者都会让基频估计产生数音分的系统性偏差。
 *   因此必须显式关闭：echoCancellation / noiseSuppression / autoGainControl。
 *   并在 supportedConstraints 允许时申请 48 kHz、无声道处理。
 */

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.analyser = null;
    this.source = null;
    this.inputBuffer = null;
    this.running = false;
    this.diagnostics = { requested: {}, granted: {}, sampleRate: 0, trackLabel: '', warnings: [] };
  }

  /** 浏览器实际支持的约束项 */
  static supportedConstraints() {
    try {
      return navigator.mediaDevices.getSupportedConstraints() || {};
    } catch (e) {
      return {};
    }
  }

  /** 48 kHz 优先，Android Chrome 通常直接给 48000 */
  _ctxOptions() {
    const opts = { latencyHint: 'interactive' };
    try { opts.sampleRate = 48000; } catch (e) { /* ignore */ }
    return opts;
  }

  _buildConstraints() {
    const sc = AudioEngine.supportedConstraints();
    const audio = {
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    };
    // 这些非标准约束只有部分内核认识，不认识时 Chrome 会忽略而不是报错
    if (sc.voiceIsolation !== undefined) audio.voiceIsolation = { ideal: false };
    if (sc.audioHwNoiseSuppression !== undefined) audio.audioHwNoiseSuppression = { ideal: false };
    return { audio, video: false };
  }

  async start() {
    if (this.running) return this;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('当前浏览器不支持 getUserMedia。请用 Chrome / Edge 打开，并确认地址是 https 或 localhost。');
    }

    const constraints = this._buildConstraints();
    this.diagnostics.requested = constraints.audio;

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e1) {
      // 部分机型对非标约束报错，降级重试
      if (e1 && (e1.name === 'OverconstrainedError' || e1.name === 'ConstraintNotSatisfiedError')) {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false,
            channelCount: 1,
          },
          video: false,
        });
        this.diagnostics.warnings.push('完整约束不被支持，已降级为基础约束（系统降噪可能仍在生效）');
      } else {
        throw e1;
      }
    }

    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    const settings = track ? track.getSettings() : {};
    const caps = track && track.getCapabilities ? track.getCapabilities() : {};
    this.diagnostics.granted = settings;
    this.diagnostics.capabilities = caps;
    this.diagnostics.trackLabel = track ? track.label : '';

    // 尽力在 track 层面再关一次处理
    try {
      if (track.applyConstraints) {
        const adv = { advanced: [{ echoCancellation: false, noiseSuppression: false, autoGainControl: false }] };
        await track.applyConstraints(adv);
      }
    } catch (e) { /* 忽略 */ }

    const after = track ? track.getSettings() : {};
    this.diagnostics.warnings.length = 0;
    if (after.echoCancellation === true) this.diagnostics.warnings.push('回声消除仍然开启');
    if (after.noiseSuppression === true) this.diagnostics.warnings.push('系统降噪仍然开启（会削弱谐波，影响精度）');
    if (after.autoGainControl === true) this.diagnostics.warnings.push('自动增益仍然开启（会让读数漂移）');
    if (after.sampleRate && after.sampleRate < 44100) this.diagnostics.warnings.push(`采样率仅 ${after.sampleRate} Hz`);

    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx(this._ctxOptions());
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    this.diagnostics.sampleRate = this.ctx.sampleRate;

    this.source = this.ctx.createMediaStreamSource(stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 8192;              // float 时域缓冲上限
    this.analyser.smoothingTimeConstant = 0;   // 必须为 0，任何平滑都会毁掉精度
    this.analyser.minDecibels = -120;
    this.analyser.maxDecibels = -10;
    this.source.connect(this.analyser);
    // 注意：不连到 destination，避免扬声器回灌形成反馈

    this.inputBuffer = new Float32Array(this.analyser.fftSize);
    this.running = true;
    return this;
  }

  /** 读取当前时域样本，返回裁剪到 n 点的数组 */
  read(n) {
    if (!this.analyser) return null;
    const buf = this.inputBuffer;
    this.analyser.getFloatTimeDomainData(buf);
    if (n >= buf.length) return buf;
    return buf.subarray(buf.length - n, buf.length);
  }

  /** 读取完整缓冲（长度 = fftSize） */
  readAll() {
    if (!this.analyser) return null;
    this.analyser.getFloatTimeDomainData(this.inputBuffer);
    return this.inputBuffer;
  }

  /** 环境底噪电平（dB），用于噪声门限自动标定 */
  ambientDb() {
    const buf = this.inputBuffer;
    let s = 0;
    for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
    const rms = Math.sqrt(s / buf.length);
    return 20 * Math.log10(Math.max(rms, 1e-7));
  }

  async stop() {
    this.running = false;
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.source) { try { this.source.disconnect(); } catch (e) {} }
    if (this.ctx && this.ctx.state !== 'closed') { try { await this.ctx.close(); } catch (e) {} }
    this.stream = null; this.analyser = null; this.source = null; this.ctx = null;
  }

  /** 供参考音/节拍器复用的 AudioContext（独立于麦克风上下文，避免干扰） */
  static ensurePlaybackContext() {
    if (!AudioEngine._playCtx || AudioEngine._playCtx.state === 'closed') {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      AudioEngine._playCtx = new Ctx({ latencyHint: 'interactive' });
    }
    if (AudioEngine._playCtx.state === 'suspended') AudioEngine._playCtx.resume();
    return AudioEngine._playCtx;
  }

  /** 是否安全上下文（getUserMedia 前提） */
  static isSecure() {
    return window.isSecureContext === true ||
      location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  }
}

export default AudioEngine;
