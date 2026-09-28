/**
 * meter.js — 表盘绘制
 *
 * 关键设计：**自动量程**。指针接近 0 时刻度自动从 ±50 缩到 ±20 再到 ±5 音分，
 * 让人眼能分辨 0.5 音分以内的差异（普通调音器固定 ±50，
 * 在 2 音分内的指针位移只有屏宽的 2%，根本读不出来）。
 * 量程切换用平滑过渡，避免指针跳变。
 */

const RANGES = [50, 20, 5];          // 可选量程（音分）
const RANGE_ENTER = [18, 6, 1.6];    // 进入更细量程的阈值
const RANGE_EXIT = [26, 9, 2.6];     // 退回更粗量程的阈值（滞回，防抖）

export class Meter {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rangeIdx = 0;
    this.displayRange = RANGES[0];
    this.displayCents = 0;
    this.needle = 0;
    this.hasSignal = false;
    this.inTune = false;
    this.confidence = 0;
    this.tolerance = 2;
    this.dpr = 1;
    this.w = 0; this.h = 0;
    this._resize();
    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', this._onResize);
  }

  _resize() {
    const c = this.canvas;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const cssW = c.clientWidth || c.parentElement.clientWidth || 340;
    const cssH = Math.max(96, Math.min(150, cssW * 0.36));
    c.width = Math.round(cssW * dpr);
    c.height = Math.round(cssH * dpr);
    c.style.height = cssH + 'px';
    this.dpr = dpr;
    this.w = cssW;
    this.h = cssH;
  }

  setTolerance(t) { this.tolerance = t; }

  /** 选择量程（带滞回） */
  _updateRange(absCents, hasSignal) {
    if (!hasSignal) return;
    let idx = this.rangeIdx;
    if (idx < RANGES.length - 1 && absCents < RANGE_ENTER[idx]) idx++;
    else if (idx > 0 && absCents > RANGE_EXIT[idx - 1]) idx--;
    this.rangeIdx = idx;
  }

  /**
   * @param {object} s { cents, hasSignal, inTune, confidence, tolerance }
   */
  update(s) {
    this.hasSignal = s.hasSignal;
    this.inTune = s.inTune;
    this.confidence = s.confidence ?? 0;
    if (s.tolerance) this.tolerance = s.tolerance;

    const target = s.hasSignal ? Math.max(-120, Math.min(120, s.cents)) : 0;
    this._updateRange(Math.abs(target), s.hasSignal);

    const targetRange = RANGES[this.rangeIdx];
    // 量程平滑过渡
    this.displayRange += (targetRange - this.displayRange) * 0.18;
    // 指针平滑：有信号时快跟（低延迟手感），无信号时缓慢归零
    const k = s.hasSignal ? 0.34 : 0.10;
    this.displayCents += (target - this.displayCents) * k;

    this._draw();
  }

  _draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;
    const W = this.w, H = this.h;
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const R = this.displayRange;
    const padX = 14;
    const axisY = H * 0.62;
    const usable = W - padX * 2;
    const cx = padX + usable / 2;
    const xOf = c => cx + (c / R) * (usable / 2);

    const ok = this.inTune && this.hasSignal;
    const colOk = '#34d67f';
    const colFlat = '#ff9f43';
    const colSharp = '#6ea8ff';
    const colLine = '#232b37';
    const colTxt = '#626e80';

    // ---- 中央合格区 ----
    const tol = Math.min(this.tolerance, R);
    const x0 = xOf(-tol), x1 = xOf(tol);
    ctx.fillStyle = ok ? 'rgba(52,214,127,.22)' : 'rgba(52,214,127,.09)';
    roundRect(ctx, x0, axisY - 17, Math.max(2, x1 - x0), 34, 7);
    ctx.fill();
    if (ok) {
      ctx.shadowColor = 'rgba(52,214,127,.7)';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(52,214,127,.85)';
      ctx.lineWidth = 1.4;
      roundRect(ctx, x0, axisY - 17, Math.max(2, x1 - x0), 34, 7);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // ---- 刻度 ----
    const step = R > 30 ? 10 : R > 12 ? 5 : R > 6 ? 2 : 1;
    const sub = step / 5;
    ctx.lineWidth = 1;
    for (let c = -R; c <= R + 1e-9; c += sub) {
      const isMajor = Math.abs(c % step) < 1e-6 || Math.abs(c % step - step) < 1e-6;
      const x = xOf(c);
      if (x < padX - 1 || x > W - padX + 1) continue;
      ctx.strokeStyle = isMajor ? '#39434f' : colLine;
      const hgt = isMajor ? 11 : 6;
      ctx.beginPath();
      ctx.moveTo(x, axisY - 17 - hgt);
      ctx.lineTo(x, axisY - 17);
      ctx.moveTo(x, axisY + 17);
      ctx.lineTo(x, axisY + 17 + hgt);
      ctx.stroke();
      if (isMajor && Math.abs(c) > 1e-6) {
        ctx.fillStyle = colTxt;
        ctx.font = '10px ' + monoFont();
        ctx.textAlign = 'center';
        ctx.fillText(String(Math.round(Math.abs(c))), x, axisY - 33);
      }
    }
    // 中轴线
    ctx.strokeStyle = ok ? 'rgba(52,214,127,.55)' : '#39434f';
    ctx.beginPath();
    ctx.moveTo(xOf(0), axisY - 17);
    ctx.lineTo(xOf(0), axisY + 17);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // ---- 量程标签 ----
    ctx.fillStyle = '#4a5666';
    ctx.font = '10px ' + monoFont();
    ctx.textAlign = 'left';
    ctx.fillText(`±${R > 12 ? R : R.toFixed(0)} 音分`, padX, H - 6);
    ctx.textAlign = 'right';
    ctx.fillText(this.hasSignal ? `置信 ${(this.confidence * 100).toFixed(0)}%` : '无信号', W - padX, H - 6);
    ctx.textAlign = 'left';
    ctx.fillText('低', padX, axisY + 4);
    ctx.textAlign = 'right';
    ctx.fillText('高', W - padX, axisY + 4);

    // ---- 指针 ----
    if (!this.hasSignal) {
      ctx.globalAlpha = .3;
    }
    const c = Math.max(-R * 1.02, Math.min(R * 1.02, this.displayCents));
    const x = xOf(c);
    const needleCol = ok ? colOk : (c < 0 ? colFlat : colSharp);

    // 轨迹余晖
    ctx.strokeStyle = needleCol;
    ctx.globalAlpha *= 0.35;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xOf(0), axisY);
    ctx.lineTo(x, axisY);
    ctx.stroke();
    ctx.globalAlpha = this.hasSignal ? 1 : .3;

    // 指针主体
    ctx.shadowColor = needleCol;
    ctx.shadowBlur = ok ? 18 : 9;
    ctx.fillStyle = needleCol;
    ctx.beginPath();
    ctx.moveTo(x, axisY - 24);
    ctx.lineTo(x - 6.5, axisY - 34);
    ctx.lineTo(x + 6.5, axisY - 34);
    ctx.closePath();
    ctx.fill();
    roundRect(ctx, x - 2, axisY - 24, 4, 48, 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, axisY + 24);
    ctx.lineTo(x - 6.5, axisY + 34);
    ctx.lineTo(x + 6.5, axisY + 34);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // 中心圆点
    ctx.fillStyle = '#0b0e13';
    ctx.beginPath(); ctx.arc(x, axisY, 4.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = needleCol; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(x, axisY, 4.2, 0, Math.PI * 2); ctx.stroke();

    ctx.globalAlpha = 1;
  }
}

function monoFont() {
  return '"SF Mono","JetBrains Mono",Menlo,Consolas,monospace';
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

export default Meter;
