/**
 * filter.js — 卡尔曼平滑 + 中值滤波
 *
 * 调音表指针若直接跟随每帧估计值会剧烈抖动，无法读数。
 * 这里在"对数频率（音分）域"做一维卡尔曼滤波：
 *   状态 = [音分, 音分/秒]
 * 这样慢速拧弦钮时指针平滑跟随，静止时读数迅速收敛（方差变小）。
 *
 * 另外带鲁棒门限：偏离预测超过 gate 音分的观测视为跳变（八度错、杂音），
 * 先降权，连续多次才接受（避免指针乱飞）。
 */

export class CentKalman {
  constructor({ qPos = 0.6, qVel = 22, rBase = 5.5, gate = 55 } = {}) {
    this.qPos = qPos;     // 位置过程噪声（音分²/帧）
    this.qVel = qVel;     // 速度过程噪声
    this.rBase = rBase;   // 观测噪声基准（音分²）
    this.gate = gate;     // 跳变门限（音分）
    this.reset();
  }

  reset(cent = null) {
    this.x = cent === null ? 0 : cent;
    this.v = 0;
    this.p = cent === null ? 1e4 : 25;
    this.pv = 1e3;
    this.initialized = cent !== null;
    this.outliers = 0;
    this.conf = 0;
  }

  /**
   * @param {number} cent 观测到的相对目标音的音分偏差
   * @param {number} dt 帧间隔（秒）
   * @param {number} confidence 0~1，YIN 清晰度
   */
  update(cent, dt, confidence = 1) {
    if (!this.initialized) { this.reset(cent); return this.x; }
    dt = Math.min(Math.max(dt, 0.005), 0.25);

    // 预测
    this.x += this.v * dt;
    this.p += (this.pv * dt * dt) + this.qPos * dt * 60;
    this.pv += this.qVel * dt * 60;

    // 观测噪声随置信度变化
    const c = Math.min(Math.max(confidence, 0.02), 1);
    let R = this.rBase / c;

    // 鲁棒门限
    const innov = cent - this.x;
    const S = this.p + R;
    if (Math.abs(innov) > this.gate) {
      this.outliers++;
      if (this.outliers < 4) {
        R *= 60; // 强烈降权但不完全丢弃（弦音起始瞬间常有滑音）
      } else {
        this.reset(cent); // 确认是新的音，直接重锁
        return this.x;
      }
    } else {
      this.outliers = Math.max(0, this.outliers - 1);
    }

    const K = this.p / (this.p + R);
    const Kv = (this.pv * dt) / (this.p + R);
    this.x += K * innov;
    this.v += Kv * innov;
    this.p = (1 - K) * this.p;
    this.pv = Math.max(this.pv * (1 - K * 0.6), 1e-2);
    this.conf = c;
    return this.x;
  }

  /** 收敛标准差（音分），用于显示"读数稳定度" */
  get sigma() { return Math.sqrt(Math.max(this.p, 0)); }
}

/** 环形中值滤波，用于剔除单帧野值 */
export class MedianFilter {
  constructor(size = 5) {
    this.size = size;
    this.buf = [];
  }
  reset() { this.buf = []; }
  push(v) {
    this.buf.push(v);
    if (this.buf.length > this.size) this.buf.shift();
    const s = this.buf.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
}

/** 指数滑动平均 */
export class EMA {
  constructor(alpha = 0.25) { this.alpha = alpha; this.value = null; }
  reset() { this.value = null; }
  push(v) {
    this.value = this.value === null ? v : this.value + this.alpha * (v - this.value);
    return this.value;
  }
}

export default { CentKalman, MedianFilter, EMA };
