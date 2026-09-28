/**
 * app.js — 精调 · 高精度调音器 主程序
 *
 * 信号链：麦克风 → AudioEngine（关闭系统降噪/AGC）→ PitchDetector
 *         → CentKalman 平滑 → 稳定度判定 → 表盘/读数
 */

import { AudioEngine } from './audio.js';
import PitchDetector, { PRECISION } from './pitch/detector.js';
import { CentKalman, MedianFilter } from './pitch/filter.js';
import { TonePlayer, Metronome } from './tone.js';
import { Meter } from './meter.js';
import { Store } from './store.js';
import {
  INSTRUMENTS, INSTRUMENT_ORDER, getInstrument, getTuning,
  noteToMidi, noteToFreq, midiToFreq, tuningFrequencies,
} from './music.js';

// ---------------------------------------------------------------------------
// 全局状态
// ---------------------------------------------------------------------------

const store = new Store();
const engine = new AudioEngine();
const tones = new TonePlayer();
const metro = new Metronome();
let meter = null;

const S = {
  detector: null,
  kalman: new CentKalman(),
  median: new MedianFilter(3),
  running: false,
  raf: 0,
  lastFrameT: 0,
  // 音符跟踪
  noteStartT: 0,
  lastFreq: 0,
  noteMidi: null,
  stableMs: 0,
  inTuneSince: 0,
  wasInTune: false,
  jitter: [],
  // 显示节流
  lastDomT: 0,
  lockFlashUntil: 0,
  tunedStrings: new Set(),
  wakeLock: null,
  ambientDb: -100,
  ambientSamples: 0,
};

const $ = id => document.getElementById(id);
const el = {
  instRow: $('inst-row'), tuningRow: $('tuning-row'),
  meterWrap: $('meter-wrap'), meterState: $('meter-state'),
  noteName: $('note-name'), noteOct: $('note-oct'),
  roCents: $('ro-cents'), roFreq: $('ro-freq'), roTarget: $('ro-target'),
  barFlat: $('bar-flat'), barCenter: $('bar-center'), barSharp: $('bar-sharp'),
  qLevel: $('q-level'), qConf: $('q-conf'), qStab: $('q-stab'),
  qualityHint: $('quality-hint'),
  stringGrid: $('string-grid'), stringsTitle: $('strings-title'),
  stringsSection: $('strings-section'),
  btnStart: $('btn-start'), btnStartText: $('btn-start-text'),
  modal: $('modal'), modalTitle: $('modal-title'), modalBody: $('modal-body'),
  toast: $('toast'),
  ambient: $('ambient-v'),
};

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------

let toastTimer = 0;
function toast(msg, ms = 2200) {
  el.toast.textContent = msg;
  el.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, ms);
}

function haptic(pattern) {
  if (!store.get('haptic')) return;
  try { navigator.vibrate?.(pattern); } catch (e) { /* 不支持 */ }
}

function openModal(title, html) {
  el.modalTitle.textContent = title;
  el.modalBody.innerHTML = html;
  el.modal.hidden = false;
}
function closeModal() { el.modal.hidden = true; }

function cents(a, b) { return 1200 * Math.log2(a / b); }
function fmtHz(f) { return f >= 1000 ? f.toFixed(1) : f.toFixed(2); }

function currentInst() { return getInstrument(store.get('instrument')); }
function currentTuning() {
  const inst = currentInst();
  return getTuning(inst.id, store.get('tunings')[inst.id]);
}
function a4() { return store.get('a4'); }

/** 当前调弦的目标弦列表 */
function targets() {
  const inst = currentInst();
  const t = currentTuning();
  return t.notes.map((n, i) => ({
    index: i, note: n, midi: noteToMidi(n),
    freq: noteToFreq(n, a4()),
    label: `${inst.strings - i}`,
  }));
}

// ---------------------------------------------------------------------------
// 检测器构建
// ---------------------------------------------------------------------------

function buildDetector() {
  const inst = currentInst();
  const sr = engine.ctx ? engine.ctx.sampleRate : 48000;
  const t = targets();
  // 频率范围：以调弦实际音域为准，留出滑音/按品余量
  let lo = inst.minFreq, hi = inst.maxFreq;
  if (t.length) {
    lo = Math.min(lo, t[0].freq * 0.72);
    hi = Math.max(hi, t[t.length - 1].freq * 1.35);
  }
  lo = Math.max(24, lo);
  hi = Math.min(4400, hi);

  const d = new PitchDetector({
    sampleRate: sr,
    minFreq: lo,
    maxFreq: hi,
    compensateInharmonicity: store.get('compensateInharmonicity'),
    rejectHum: store.get('rejectHum'),
    rmsGate: Math.pow(10, store.get('gateDb') / 20),
  });
  applyWindowMode(d);
  S.detector = d;
  S.kalman.reset();
  S.median.reset();
  return d;
}

function applyWindowMode(d) {
  const m = store.get('windowMode');
  if (m === 'fast') d.setPrecision(PRECISION.FAST);
  else if (m === 'precise') d.setPrecision(PRECISION.PRECISE);
  // auto：由稳定性动态决定，见 tick()
}

// ---------------------------------------------------------------------------
// 启停
// ---------------------------------------------------------------------------

async function startListening() {
  if (S.running) return;
  if (!AudioEngine.isSecure()) {
    openModal('无法访问麦克风', `
      <p>浏览器只在<b>安全上下文</b>下允许访问麦克风。当前地址：</p>
      <p><code>${location.origin || '(file://)'}</code></p>
      <h4>解决办法</h4>
      <ul>
        <li>用 <code>https://</code> 地址打开（本项目自带 Service Worker，需 HTTPS）</li>
        <li>或在电脑上用 <code>localhost</code> 打开</li>
        <li>直接以 APK 方式安装则不受此限制</li>
      </ul>`);
    return;
  }
  try {
    await engine.start();
  } catch (e) {
    console.error(e);
    openModal('麦克风启动失败', `
      <p class="bad">${escapeHtml(String(e && e.message || e))}</p>
      <h4>请依次检查</h4>
      <ul>
        <li>系统设置 → 应用管理 → 浏览器 → 权限 → <b>麦克风：允许</b></li>
        <li>地址栏左侧图标 → 网站设置 → 麦克风：允许</li>
        <li>是否被其他 App（微信语音、录音机）占用</li>
        <li>小米 HyperOS：设置 → 隐私保护 → 权限管理 → 麦克风</li>
      </ul>`);
    return;
  }

  S.running = true;
  buildDetector();
  el.btnStart.classList.add('on');
  el.btnStartText.textContent = '停止';
  el.meterWrap.classList.add('listening');
  requestWakeLock();
  renderDiagnosticsButton();
  S.lastFrameT = performance.now();
  tick();
  toast(`已就绪 · 采样率 ${engine.ctx.sampleRate} Hz · 窗口 ${S.detector.windowSize}`);
}

function stopListening() {
  S.running = false;
  cancelAnimationFrame(S.raf);
  engine.stop();
  el.btnStart.classList.remove('on');
  el.btnStartText.textContent = '开始调音';
  el.meterWrap.classList.remove('listening', 'in-tune');
  setState('待机', '');
  el.noteName.textContent = '—';
  el.noteName.className = 'note-name idle';
  el.noteOct.innerHTML = '&nbsp;';
  el.roCents.textContent = '—';
  el.roFreq.textContent = '—';
  el.roCents.className = 'ro-v';
  el.qualityHint.textContent = '拨响一根弦开始调音';
  el.qualityHint.className = 'quality-hint';
  setBars(0, false);
  releaseWakeLock();
}

async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) S.wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* 忽略 */ }
}
function releaseWakeLock() {
  try { S.wakeLock?.release(); } catch (e) { /* 忽略 */ }
  S.wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.running) requestWakeLock();
});

// ---------------------------------------------------------------------------
// 分析主循环
// ---------------------------------------------------------------------------

function tick() {
  if (!S.running) return;
  S.raf = requestAnimationFrame(tick);

  const now = performance.now();
  const dt = Math.min(0.25, (now - S.lastFrameT) / 1000);
  S.lastFrameT = now;

  const d = S.detector;
  if (!d) return;

  // 自适应窗口：手动指定时不干预；auto 时未锁定用快窗口，稳定后切精确窗口
  if (store.get('windowMode') === 'auto') {
    const want = S.stableMs > 220 ? PRECISION.PRECISE : PRECISION.FAST;
    if (d.precision !== want) {
      d.setPrecision(want);
      S.kalman.reset();
    }
  }

  const buf = engine.readAll();
  if (!buf) return;

  // 环境底噪估计（无信号时更新）
  const rmsNow = Math.sqrt(buf.reduce((s, v) => s + v * v, 0) / buf.length);
  const dbNow = 20 * Math.log10(Math.max(rmsNow, 1e-7));

  const t = targets();
  const manual = store.get('mode') === 'manual' && t.length > 0;
  const selIdx = Math.min(store.get('selectedString'), Math.max(0, t.length - 1));
  const hint = manual ? t[selIdx].freq : null;

  const r = d.detect(buf, { hintFreq: hint, track: true });

  if (!r || r.rmsDb < store.get('gateDb') || r.confidence < 0.22) {
    // 无信号：更新底噪，衰减状态
    if (dbNow < -45) {
      S.ambientDb = S.ambientDb < -99 ? dbNow : S.ambientDb * 0.92 + dbNow * 0.08;
      if (el.ambient) el.ambient.textContent = `${S.ambientDb.toFixed(1)} dB`;
    }
    S.stableMs = Math.max(0, S.stableMs - dt * 1000 * 2.2);
    if (S.stableMs === 0) S.lastFreq = 0;   // 信号消失后清空跟踪，避免下一个音误判为"已稳定"
    S.noteMidi = null;
    meter.update({ cents: 0, hasSignal: false, inTune: false, confidence: 0 });
    paintIdle(dbNow);
    return;
  }

  // ---------------- 有信号 ----------------
  const freq = r.freq;

  // 匹配目标音
  const match = matchTarget(freq, t);
  const targetFreq = match.freq;
  const rawCents = cents(freq, targetFreq);

  // 音符一致性跟踪：判定是否"同一根弦、同一个音"稳定持续
  const sameNote = S.lastFreq > 0 && Math.abs(cents(freq, S.lastFreq)) < 22;
  if (sameNote) {
    S.stableMs += dt * 1000;
  } else {
    S.stableMs = 0;
    S.kalman.reset(rawCents);
    S.median.reset();
    S.jitter.length = 0;
  }
  S.lastFreq = freq;
  S.noteMidi = match.midi;
  S.noteStartT = S.noteStartT || now;

  // 平滑：中值滤波去野值 + 卡尔曼（音分域）
  const med = S.median.push(rawCents);
  const smooth = S.kalman.update(med, dt, Math.max(0.15, r.confidence));

  // 抖动统计（稳定度指标）
  S.jitter.push(rawCents);
  if (S.jitter.length > 14) S.jitter.shift();
  const jitterSd = S.jitter.length > 4 ? stddev(S.jitter) : 99;
  const stability = clamp01(1 - jitterSd / 6) * clamp01(S.stableMs / 260);

  // 到位判定
  const tol = store.get('tolerance');
  const needLock = !store.get('lockMode') || S.stableMs >= 250;
  const near = Math.abs(smooth) <= Math.max(tol * 2.5, 5);
  const inTune = needLock && Math.abs(smooth) <= tol && stability > 0.35 && r.confidence > 0.3;

  // ---------------- 渲染 ----------------
  meter.update({
    cents: smooth, hasSignal: true, inTune,
    confidence: r.confidence, tolerance: tol,
  });

  if (now - S.lastDomT > 45) {          // DOM 更新限流到 ~22fps
    S.lastDomT = now;
    paintLive(r, match, smooth, rawCents, stability, inTune, near, tol);
  }

  setBars(smooth, inTune);
  el.qLevel.style.width = `${clamp01((r.rmsDb + 60) / 34) * 100}%`;
  el.qConf.style.width = `${r.confidence * 100}%`;
  el.qStab.style.width = `${stability * 100}%`;

  el.meterWrap.classList.toggle('in-tune', inTune);
  if (inTune && !S.wasInTune) {
    haptic(12);
    S.lockFlashUntil = now + 600;
    markStringTuned(match);
  }
  if (!inTune && S.wasInTune) S.inTuneSince = 0;
  S.wasInTune = inTune;
}

function paintIdle(dbNow) {
  if (performance.now() - S.lastDomT < 90) return;
  S.lastDomT = performance.now();
  el.noteName.textContent = '—';
  el.noteName.className = 'note-name idle';
  el.noteOct.innerHTML = '&nbsp;';
  el.roCents.textContent = '—';
  el.roCents.className = 'ro-v';
  el.roFreq.textContent = '—';
  const gate = store.get('gateDb');
  if (dbNow > gate + 6) {
    setState('噪声', '');
    el.qualityHint.textContent = `环境噪声较大（${dbNow.toFixed(0)} dB），请靠近琴弦或到安静处`;
    el.qualityHint.className = 'quality-hint warn';
  } else {
    setState('聆听中', '');
    el.qualityHint.textContent = '拨响一根弦';
    el.qualityHint.className = 'quality-hint';
  }
  el.barFlat.querySelector('i').style.transform = 'scaleX(0)';
  el.barSharp.querySelector('i').style.transform = 'scaleX(0)';
  el.barCenter.querySelector('i').style.transform = 'scaleX(0)';
  [el.barFlat, el.barCenter, el.barSharp].forEach(b => b.classList.remove('on'));
  el.qLevel.style.width = `${clamp01((dbNow + 70) / 40) * 100}%`;
  el.qConf.style.width = '0%';
  el.qStab.style.width = '0%';
  highlightString(null);
}

function paintLive(r, match, smooth, rawCents, stability, inTune, near, tol) {
  const note = PitchDetector.noteFromFreq(match.freq, a4(), store.get('useFlats'));
  el.noteName.textContent = note.name;
  el.noteName.className = 'note-name ' + (inTune ? 'ok' : smooth < -tol ? 'flat' : smooth > tol ? 'sharp' : '');
  el.noteOct.textContent = String(note.octave);

  const c = smooth;
  el.roCents.textContent = `${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(1)}`;
  el.roCents.className = 'ro-v ' + (inTune ? 'ok' : c < 0 ? 'flat' : 'sharp');
  el.roFreq.textContent = fmtHz(r.freq);
  el.roTarget.textContent = fmtHz(match.freq);

  // 状态标签
  if (inTune) {
    setState('准了 ✓', 'lock');
    el.qualityHint.textContent = match.hint || `${match.name} 已到位，可以换下一根弦`;
    el.qualityHint.className = 'quality-hint';
  } else if (near && S.stableMs > 200) {
    setState('接近', 'near');
    const dir = c < 0 ? '偏低，请拧紧（升高）' : '偏高，请放松（降低）';
    const amount = Math.abs(c) < tol * 1.6 ? '只差一点点' : `还差 ${Math.abs(c).toFixed(1)} 音分`;
    el.qualityHint.textContent = `${dir} · ${amount}`;
    el.qualityHint.className = 'quality-hint';
  } else if (S.stableMs < 200 && Math.abs(c) <= Math.max(tol * 3, 8)) {
    // 读数还在收敛且偏差本身很小 —— 方向没有意义，让用户稍等
    setState('识别中', '');
    el.qualityHint.textContent = '让音符持续响一会儿（≥0.3 秒）以获得精确读数';
    el.qualityHint.className = 'quality-hint';
  } else {
    // 偏差已经明显：即使尚未完全收敛，方向也是确定的，立即给操作指引
    setState(c < 0 ? '偏低' : '偏高', '');
    const amt = Math.abs(c) > tol * 1.6 ? `（约差 ${Math.abs(c).toFixed(0)} 音分）` : '';
    el.qualityHint.textContent = (c < 0 ? '拧紧弦钮，让音升高' : '放松弦钮，让音降低') + amt;
    el.qualityHint.className = 'quality-hint';
  }

  // 补偿信息（专业用户会想看）
  const comp = r.compensation;
  if (comp && Math.abs(comp.cents) > 0.3) {
    el.roTarget.title = `刚度补偿 ${comp.cents.toFixed(1)} 音分（B=${comp.B.toExponential(1)}）`;
  }

  highlightString(match.index);
}

function setState(text, cls) {
  if (el.meterState.textContent !== text || el.meterState.className !== `meter-state ${cls}`.trim()) {
    el.meterState.textContent = text;
    el.meterState.className = `meter-state ${cls}`.trim();
  }
}

function setBars(c, inTune) {
  const flat = c < 0 ? clamp01(-c / 50) : 0;
  const sharp = c > 0 ? clamp01(c / 50) : 0;
  el.barFlat.querySelector('i').style.transform = `scaleX(${flat})`;
  el.barSharp.querySelector('i').style.transform = `scaleX(${sharp})`;
  el.barCenter.querySelector('i').style.transform = `scaleX(${inTune ? 1 : 0})`;
  el.barCenter.classList.toggle('on', inTune);
}

/** 把检测到的频率匹配到当前调弦的某根弦 */
function matchTarget(freq, t) {
  if (!t.length) {
    // 半音模式：最近的半音
    const n = PitchDetector.noteFromFreq(freq, a4(), store.get('useFlats'));
    return {
      index: -1, midi: n.midi, freq: midiToFreq(n.midi, a4()),
      name: n.label, hint: null,
    };
  }
  let best = t[0], bestD = Infinity;
  for (const s of t) {
    const d = Math.abs(cents(freq, s.freq));
    if (d < bestD) { bestD = d; best = s; }
  }
  const inst = currentInst();
  if (bestD <= 70) {
    const strNo = inst.strings - best.index;
    return {
      index: best.index, midi: best.midi, freq: best.freq,
      name: `${best.note}`, hint: `${strNo} 弦（${best.note}）已到位`,
    };
  }
  // 离所有空弦都很远 → 用户可能在按品，退化为半音判定
  const n = PitchDetector.noteFromFreq(freq, a4(), store.get('useFlats'));
  return {
    index: -1, midi: n.midi, freq: midiToFreq(n.midi, a4()),
    name: n.label, hint: null,
  };
}

function markStringTuned(match) {
  if (match.index == null || match.index < 0) return;
  S.tunedStrings.add(match.index);
  renderStringGrid();
  // 自动记录
  const inst = currentInst(), tun = currentTuning();
  store.addHistory({
    inst: inst.id, tuning: tun.id, stringIndex: match.index,
    note: match.name, targetHz: match.freq,
    freqHz: S.detector.lastResult ? S.detector.lastResult.freq : match.freq,
    cents: S.kalman.x,
  });
  renderHistory();
}

function highlightString(index) {
  const btns = el.stringGrid.querySelectorAll('.sbtn');
  btns.forEach((b, i) => b.classList.toggle('active-now', i === index));
}

// ---------------------------------------------------------------------------
// 界面渲染
// ---------------------------------------------------------------------------

function renderInstruments() {
  el.instRow.innerHTML = '';
  for (const id of INSTRUMENT_ORDER) {
    const inst = INSTRUMENTS[id];
    const b = document.createElement('button');
    b.className = 'chip' + (store.get('instrument') === id ? ' on' : '');
    b.textContent = `${inst.icon} ${inst.name}`;
    b.onclick = () => {
      store.set({ instrument: id, selectedString: 0 });
      S.tunedStrings.clear();
      S.kalman.reset(); S.stableMs = 0; S.lastFreq = 0;
      renderAll();
      if (S.running) buildDetector();
      haptic(6);
    };
    el.instRow.appendChild(b);
  }
}

function renderTunings() {
  const inst = currentInst();
  el.tuningRow.innerHTML = '';
  if (inst.tunings.length <= 1 && inst.id === 'chromatic') {
    el.tuningRow.style.display = 'none';
    return;
  }
  el.tuningRow.style.display = '';
  const cur = store.get('tunings')[inst.id];
  for (const t of inst.tunings) {
    const b = document.createElement('button');
    b.className = 'chip slim' + (cur === t.id ? ' on' : '');
    b.textContent = t.name;
    b.title = t.desc;
    b.onclick = () => {
      store.setTuning(inst.id, t.id);
      S.tunedStrings.clear();
      S.kalman.reset(); S.stableMs = 0; S.lastFreq = 0;
      renderAll();
      if (S.running) buildDetector();
      haptic(6);
      toast(t.desc || t.name);
    };
    el.tuningRow.appendChild(b);
  }
}

function renderStringGrid() {
  const inst = currentInst();
  const t = targets();
  el.stringGrid.innerHTML = '';
  if (!t.length) {
    el.stringsSection.style.display = 'none';
    return;
  }
  el.stringsSection.style.display = '';
  el.stringGrid.className = 'string-grid' + (inst.strings === 4 ? ' n4' : inst.strings === 5 ? ' n5' : '');
  el.stringsTitle.textContent = `${inst.name} · ${currentTuning().name}`;

  const sel = store.get('selectedString');
  const manual = store.get('mode') === 'manual';
  const latest = store.latestPerString(inst.id, currentTuning().id);

  t.forEach((s, i) => {
    const b = document.createElement('button');
    b.className = 'sbtn' + (manual && sel === i ? ' sel' : '') + (S.tunedStrings.has(i) ? ' tuned' : '');
    const rec = latest.get(i);
    b.innerHTML = `<span class="idx">${inst.strings - i}</span><b>${noteName(s.note)}</b><small>${fmtHz(s.freq)}</small>`;
    b.title = rec ? `上次偏差 ${rec.cents >= 0 ? '+' : ''}${rec.cents.toFixed(1)} 音分` : s.note;
    b.onclick = () => {
      store.set({ mode: 'manual', selectedString: i });
      renderModeSeg(); renderStringGrid();
      if (S.running) { buildDetector(); }
      // 点弦按钮时顺手给一个参考音，方便对比
      tones.play(s.freq, { duration: store.get('toneDur') });
      haptic(6);
    };
    el.stringGrid.appendChild(b);
  });
}

function noteName(note) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(note);
  if (!m) return note;
  let acc = m[2];
  if (store.get('useFlats')) {
    const map = { 'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb' };
    acc = map[m[1] + acc] ? map[m[1] + acc].slice(1) : acc;
  }
  return m[1] + acc;
}

function renderModeSeg() {
  const seg = $('mode-seg');
  seg.querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.mode === store.get('mode'));
  });
  const inst = currentInst();
  if (!inst.strings) { el.stringsSection.style.display = 'none'; }
}

function renderRefGrid() {
  const t = targets();
  const grid = $('ref-grid');
  grid.innerHTML = '';
  grid.className = 'ref-grid' + (t.length === 4 ? ' n4' : '');
  if (!t.length) {
    // 半音模式：给一个八度的参考音
    const notes = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4'];
    for (const n of notes) {
      const f = noteToFreq(n, a4());
      const b = document.createElement('button');
      b.className = 'ref-btn';
      b.innerHTML = `<b>${noteName(n)}</b><small>${fmtHz(f)}</small>`;
      b.onclick = () => playRef(f, b);
      grid.appendChild(b);
    }
  } else {
    for (const s of t) {
      const b = document.createElement('button');
      b.className = 'ref-btn';
      b.innerHTML = `<b>${noteName(s.note)}</b><small>${fmtHz(s.freq)}</small>`;
      b.onclick = () => playRef(s.freq, b);
      grid.appendChild(b);
    }
  }
  // 和弦
  const inst = currentInst();
  const chords = $('ref-chords');
  chords.innerHTML = '';
  if (inst.chords && inst.chords.length) {
    const lbl = document.createElement('span');
    lbl.className = 'muted';
    lbl.style.cssText = 'width:100%;font-size:12px;color:var(--txt-3)';
    lbl.textContent = '扫弦校对（用耳朵确认整体和谐）：';
    chords.appendChild(lbl);
    for (const ch of inst.chords) {
      const b = document.createElement('button');
      b.textContent = ch.name;
      b.onclick = () => {
        // ch.frets 与 targets() 同序：index 0 = 最低音（6 弦）
        const t2 = targets();
        const freqs = [];
        ch.frets.forEach((fr, i) => {
          if (fr == null || !t2[i]) return;
          freqs.push(t2[i].freq * Math.pow(2, fr / 12));
        });
        tones.strum(freqs, { duration: 3.2, strumMs: 60 });
        haptic(8);
      };
      chords.appendChild(b);
    }
  }
}

let refHandle = null;
function playRef(freq, btn) {
  tones.stopAll();
  document.querySelectorAll('.ref-btn.playing').forEach(b => b.classList.remove('playing'));
  if (store.get('toneType') === 'sine') {
    refHandle = tones.playSine(freq, store.get('toneDur') + 1, 0.4);
  } else {
    refHandle = tones.play(freq, { duration: store.get('toneDur') });
  }
  if (btn) {
    btn.classList.add('playing');
    setTimeout(() => btn.classList.remove('playing'), store.get('toneDur') * 1000);
  }
  haptic(6);
}

// ---------------------------------------------------------------------------
// 历史记录
// ---------------------------------------------------------------------------

function renderHistory() {
  const box = $('hist-table');
  const inst = currentInst();
  const tun = currentTuning();
  const rows = store.get('history').filter(h => h.inst === inst.id && h.tuning === tun.id).slice(-40).reverse();
  if (!rows.length) {
    box.innerHTML = '<div class="empty">还没有记录。调准一根弦后会自动记录它的实际偏差。</div>';
    drawHistChart([]);
    return;
  }
  const html = ['<div class="hist-row head"><span>弦/音</span><span>偏差</span><span>实测频率</span><span>时间</span></div>'];
  for (const r of rows) {
    const c = r.cents;
    const col = Math.abs(c) <= store.get('tolerance') ? 'var(--ok)' : c < 0 ? 'var(--flat)' : 'var(--sharp)';
    const pct = clamp01(Math.abs(c) / 20) * 50;
    const left = c < 0 ? 50 - pct : 50;
    const d = new Date(r.t);
    const hh = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const strNo = inst.strings ? `${inst.strings - r.stringIndex} 弦` : r.note;
    html.push(`<div class="hist-row">
      <span>${strNo}<small style="color:var(--txt-3)"> ${r.note || ''}</small></span>
      <span class="hist-mini"><span class="track"><i style="left:${left}%;background:${col}"></i></span>
        <span class="ct" style="color:${col}">${c >= 0 ? '+' : '−'}${Math.abs(c).toFixed(1)}</span></span>
      <span class="hz">${fmtHz(r.freqHz)}</span>
      <span class="when">${hh}</span>
    </div>`);
  }
  box.innerHTML = html.join('');
  drawHistChart(rows.reverse());
}

function drawHistChart(rows) {
  const cv = $('hist-chart');
  if (!cv) return;
  const ctx = cv.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const cssW = cv.clientWidth || 320, cssH = 150;
  cv.width = cssW * dpr; cv.height = cssH * dpr;
  cv.style.height = cssH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  if (!rows.length) {
    ctx.fillStyle = '#626e80'; ctx.font = '12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('暂无数据', cssW / 2, cssH / 2);
    return;
  }
  const padL = 30, padR = 10, padT = 12, padB = 22;
  const w = cssW - padL - padR, h = cssH - padT - padB;
  const maxC = Math.max(5, ...rows.map(r => Math.abs(r.cents))) * 1.2;
  const yOf = c => padT + h / 2 - (c / maxC) * (h / 2);
  // 网格
  ctx.strokeStyle = '#232b37'; ctx.lineWidth = 1;
  ctx.fillStyle = '#626e80'; ctx.font = '9px monospace'; ctx.textAlign = 'right';
  for (const g of [-maxC, -maxC / 2, 0, maxC / 2, maxC]) {
    const y = yOf(g);
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(cssW - padR, y); ctx.stroke();
    ctx.fillText(g.toFixed(0), padL - 4, y + 3);
  }
  // 容差带
  const tol = store.get('tolerance');
  ctx.fillStyle = 'rgba(52,214,127,.10)';
  ctx.fillRect(padL, yOf(tol), w, yOf(-tol) - yOf(tol));
  // 折线
  ctx.strokeStyle = '#4ea8ff'; ctx.lineWidth = 1.6;
  ctx.beginPath();
  rows.forEach((r, i) => {
    const x = padL + (rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w);
    const y = yOf(clamp(r.cents, -maxC, maxC));
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();
  // 点
  rows.forEach((r, i) => {
    const x = padL + (rows.length === 1 ? w / 2 : (i / (rows.length - 1)) * w);
    const y = yOf(clamp(r.cents, -maxC, maxC));
    ctx.fillStyle = Math.abs(r.cents) <= tol ? '#34d67f' : r.cents < 0 ? '#ff9f43' : '#6ea8ff';
    ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = '#626e80'; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('调音记录偏差走势（音分）', cssW / 2, cssH - 6);
}

// ---------------------------------------------------------------------------
// 诊断
// ---------------------------------------------------------------------------

function renderDiagnosticsButton() { /* 预留：可在顶栏显示状态点 */ }

function showDiagnostics() {
  const dg = engine.diagnostics || {};
  const g = dg.granted || {};
  const row = (k, v, cls = '') => `<tr><td>${k}</td><td class="${cls}">${v}</td></tr>`;
  const bool = v => v === true ? '<span class="bad">开启（影响精度）</span>'
    : v === false ? '<span class="ok">已关闭 ✓</span>' : `<span class="warn">${v === undefined ? '未知' : v}</span>`;
  const det = S.detector;
  openModal('麦克风诊断', `
    <table>
      ${row('安全上下文', AudioEngine.isSecure() ? '<span class="ok">是 ✓</span>' : '<span class="bad">否（无法用麦克风）</span>')}
      ${row('运行状态', S.running ? '<span class="ok">采集中</span>' : '未启动')}
      ${row('AudioContext 采样率', dg.sampleRate ? `${dg.sampleRate} Hz` : '—')}
      ${row('音轨采样率', g.sampleRate ? `${g.sampleRate} Hz` : '—')}
      ${row('声道数', g.channelCount ?? '—')}
      ${row('音轨标签', escapeHtml(dg.trackLabel || '—'))}
      ${row('回声消除', bool(g.echoCancellation))}
      ${row('系统降噪', bool(g.noiseSuppression))}
      ${row('自动增益 AGC', bool(g.autoGainControl))}
      ${row('环境底噪', S.ambientDb < -99 ? '—' : `${S.ambientDb.toFixed(1)} dB`)}
      ${row('噪声门限', `${store.get('gateDb')} dB`)}
      ${row('分析窗口', det ? `${det.windowSize} 点 / ${det.windowMs.toFixed(0)} ms（${det.precision === 'precise' ? '精确' : '快速'}）` : '—')}
      ${row('低通截止', det ? `${det.lowpassHz.toFixed(0)} Hz` : '—')}
      ${row('频率范围', det ? `${det.minFreq.toFixed(0)} – ${det.maxFreq.toFixed(0)} Hz` : '—')}
      ${row('刚度补偿', store.get('compensateInharmonicity') ? '<span class="ok">开启</span>' : '关闭')}
    </table>
    ${(dg.warnings || []).length ? `<h4 class="warn">⚠ 注意</h4><ul>${dg.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}</ul>` : ''}
    <h4>如果系统降噪/AGC 显示"开启"</h4>
    <ul>
      <li>这两项会削弱谐波并让读数漂移，本 App 已请求关闭，但部分机型由<b>系统层强制</b>处理，网页无法覆盖。</li>
      <li>小米/Redmi（HyperOS）：设置 → 声音与触感 → 通话降噪，或 设置 → 应用设置 → 系统应用 → 录音机 → 关闭"智能降噪"。</li>
      <li>调音时<b>不要插耳机线控麦克风</b>，用机身麦克风；手机离琴 20~40 cm，正对音孔/拾音器。</li>
      <li>彻底摆脱浏览器音频处理链的方式：用 <code>android-build/</code> 里的工程打包成 APK（Capacitor 可直连 AudioRecord）。</li>
    </ul>
    <h4>提高精度的操作要点</h4>
    <ul>
      <li>让音符<b>持续响 0.3 秒以上</b>再读数：音头（前 150 ms）高次谐波最强，物理上会把综合音高拉高几音分。</li>
      <li>轻拨而不是猛扫：过大的振幅会让弦张力瞬时变化，音高本身就会偏高。</li>
      <li>调准一根弦后再调下一根，最后<b>整体复查一遍</b>——拧弦会改变琴颈受力，前面的弦可能跑音。</li>
      <li>避免在音箱、充电器、日光灯附近调音（50 Hz 工频干扰）。</li>
    </ul>`);
}

function showHelp() {
  const inst = currentInst();
  openModal('使用说明', `
    <h4>30 秒上手</h4>
    <ul>
      <li>点底部 <b>🎤 开始调音</b>，允许麦克风权限。</li>
      <li>选乐器与调弦（当前：<b>${inst.name} · ${currentTuning().name}</b>）。</li>
      <li>拨响一根弦，让它持续响半秒以上，看指针：<b>偏左=偏低（拧紧）</b>，<b>偏右=偏高（放松）</b>。</li>
      <li>指针进入中间绿区并显示<b>「准了 ✓」</b>即到位（默认容差 ±${store.get('tolerance')} 音分）。</li>
      <li>不确定是哪根弦时用<b>自动识别</b>；已知是哪根弦时切到<b>手动选弦</b>，抗干扰更强。</li>
    </ul>
    <h4>这个调音器凭什么准</h4>
    <ul>
      <li><b>ρ(τ) 归一化相关 + 12 点 Lagrange 分数滞后插值</b>：合成谐波信号上全音域实测误差 <b>0.044 音分</b>（MAE）。</li>
      <li><b>琴弦刚度补偿</b>：自动拟合非谐性系数 B，还原真实基频。低音缠弦可修正 3~5 音分的系统性偏高。</li>
      <li><b>最短周期规则</b>：基频缺失（靠指板拨弦）时也不会误判八度，实测 240 组 0 次误判。</li>
      <li><b>6 kHz 抗混叠低通</b>：避免近 Nyquist 谐波破坏插值精度。</li>
      <li><b>音分域卡尔曼滤波</b>：读数稳定，帧间标准差 0.36 音分。</li>
      <li>完整数据见 <code>tuner/tests/BENCHMARK.txt</code>。</li>
    </ul>
    <h4>自动量程</h4>
    <p>指针靠近中心时，刻度会自动从 ±50 缩到 ±20、±5 音分，让你能读出 0.5 音分以内的差别。左下角显示当前量程。</p>
    <h4>调音顺序建议（吉他）</h4>
    <p>6弦(E) → 5弦(A) → 4弦(D) → 3弦(G) → 2弦(B) → 1弦(E)，全部调完后再从头复查一遍。
       新弦要先<b>拉伸</b>（用手轻拉弦身）再调，否则几分钟就跑音。</p>`);
}

function showAboutAccuracy() {
  const box = $('about-acc');
  box.innerHTML = `
    <p>下列数据来自本仓库 <code>tuner/tests/test_accuracy.py</code> 的合成信号基准
       （含谐波列、非谐性、拨弦位置陷波、逐谐波衰减、噪声与 50 Hz 工频哼声），
       完整输出在 <code>tuner/tests/BENCHMARK.txt</code>。</p>
    <table>
      <tr><th>测试场景</th><th style="text-align:right">平均绝对误差</th></tr>
      <tr><td>算法固有精度（完全谐波信号，B0–C7 全音域）</td><td class="num">0.044 音分</td></tr>
      <tr><td>吉他全指板 120 个音（6 弦 × 0–19 品）</td><td class="num">0.079 音分</td></tr>
      <tr><td>抗噪 SNR 35 dB（含工频哼声）</td><td class="num">0.12 音分</td></tr>
      <tr><td>抗噪 SNR 18 dB</td><td class="num">0.38 音分</td></tr>
      <tr><td>基频极弱（拨弦点近弦中点）</td><td class="num">0.30 音分</td></tr>
      <tr><td>贝斯低音缠弦（B≈4e-4，已补偿）</td><td class="num">0.23 音分</td></tr>
      <tr><td>A4 = 415/432/440/442/446/466 Hz</td><td class="num">≤0.17 音分</td></tr>
      <tr><td>连续读数抖动（D3，卡尔曼平滑后）</td><td class="num">0.27 音分</td></tr>
      <tr><td>八度误判（全部场景累计）</td><td class="num">0 次</td></tr>
      <tr><td>单帧分析耗时</td><td class="num">≈2 ms</td></tr>
    </table>
    <p class="note">参考：人耳经过训练可分辨约 3~5 音分，专业频闪调音器标称精度约 ±0.1~1 音分。
       真机上最终精度还受麦克风频响、系统音频处理与演奏方式影响；
       本 App 已请求关闭系统降噪与自动增益，可在「📊 麦克风诊断」中核对实际生效情况。</p>
    <p class="note">物理说明：真实琴弦存在非谐性（谐波被拉伸），音头瞬间的综合音高会比基频高几音分，
       这是弦的物理属性而非算法误差。本 App 通过刚度补偿 + 稳定后读数（≥250 ms）把它压到 1 音分以内。</p>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function stddev(a) {
  const m = a.reduce((s, v) => s + v, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
}

// ---------------------------------------------------------------------------
// 页面切换 & 事件绑定
// ---------------------------------------------------------------------------

function switchPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === `page-${name}`));
  document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('on', b.dataset.page === name));
  if (name === 'set') { renderHistory(); showAboutAccuracy(); }
  if (name === 'ref') renderRefGrid();
}

function bindUI() {
  // 底部导航
  document.querySelectorAll('#tabbar button').forEach(b => {
    b.onclick = () => { switchPage(b.dataset.page); haptic(5); };
  });

  // 开始/停止
  el.btnStart.onclick = () => { S.running ? stopListening() : startListening(); haptic(10); };

  // 模式切换
  $('mode-seg').querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      store.set({ mode: b.dataset.mode });
      renderModeSeg(); renderStringGrid();
      if (S.running) buildDetector();
      haptic(6);
    };
  });

  // 快捷按钮
  $('btn-ref').onclick = () => {
    const t = targets();
    const sel = store.get('mode') === 'manual' && t.length ? t[Math.min(store.get('selectedString'), t.length - 1)] : t[0];
    if (sel) playRef(sel.freq, null);
    switchPage('ref');
  };
  $('btn-strum').onclick = () => {
    const t = targets();
    if (!t.length) { toast('当前为半音模式，无和弦可扫'); return; }
    tones.strum(t.map(s => s.freq).reverse(), { duration: 3.2, strumMs: 62 });
    haptic(10);
  };
  $('btn-metro').onclick = () => switchPage('metro');
  $('btn-diag').onclick = showDiagnostics;
  $('btn-help').onclick = showHelp;
  $('modal-close').onclick = closeModal;
  el.modal.onclick = e => { if (e.target === el.modal) closeModal(); };

  // ---- 设置项 ----
  bindSwitch('sw-inharm', 'compensateInharmonicity', () => { if (S.running) buildDetector(); });
  bindSwitch('sw-hum', 'rejectHum', () => { if (S.running) buildDetector(); });
  bindSwitch('sw-lock', 'lockMode');
  bindSwitch('sw-haptic', 'haptic');
  bindSwitch('sw-flat', 'useFlats', () => { renderStringGrid(); renderRefGrid(); });

  bindRange('a4-slider', 'a4', v => {
    $('a4-v').textContent = `${(+v).toFixed(1)} Hz`;
    document.querySelectorAll('#a4-presets button').forEach(b =>
      b.classList.toggle('on', Math.abs(+b.dataset.v - +v) < 0.05));
    renderStringGrid(); renderRefGrid();
    if (S.running) buildDetector();
  });
  document.querySelectorAll('#a4-presets button').forEach(b => {
    b.onclick = () => { setRange('a4-slider', +b.dataset.v); };
  });

  bindRange('gate-slider', 'gateDb', v => {
    $('gate-v').textContent = `${(+v).toFixed(0)} dB`;
    if (S.detector) S.detector.rmsGate = Math.pow(10, (+v) / 20);
  });
  bindRange('tol-slider', 'tolerance', v => {
    $('tol-v').textContent = `±${(+v).toFixed(1)} 音分`;
    meter.setTolerance(+v);
    renderHistory();
  });
  $('btn-calibrate-gate').onclick = () => {
    if (!S.running) { toast('请先点「开始调音」再自动设定门限'); return; }
    const g = Math.round(clamp(S.ambientDb + 7, -75, -30));
    setRange('gate-slider', g);
    toast(`已按当前底噪 ${S.ambientDb.toFixed(1)} dB 设定门限为 ${g} dB`);
  };

  document.querySelectorAll('#win-chips button').forEach(b => {
    b.onclick = () => {
      store.set({ windowMode: b.dataset.v });
      document.querySelectorAll('#win-chips button').forEach(x => x.classList.toggle('on', x === b));
      $('win-v').textContent = b.textContent;
      if (S.running) { buildDetector(); toast(`分析窗口：${S.detector.windowMs.toFixed(0)} ms`); }
    };
  });

  // ---- 节拍器 ----
  const bpmSlider = $('bpm-slider');
  bindRange('bpm-slider', 'metroBpm', v => {
    $('bpm-value').textContent = Math.round(v);
    metro.set({ bpm: +v });
    renderBeatDots();
  });
  $('bpm-minus').onclick = () => setRange('bpm-slider', store.get('metroBpm') - 1);
  $('bpm-plus').onclick = () => setRange('bpm-slider', store.get('metroBpm') + 1);
  document.querySelectorAll('.metro-presets button').forEach(b => {
    b.onclick = () => setRange('bpm-slider', +b.dataset.bpm);
  });
  document.querySelectorAll('#ts-chips button').forEach(b => {
    b.onclick = () => {
      store.set({ metroBeats: +b.dataset.v });
      document.querySelectorAll('#ts-chips button').forEach(x => x.classList.toggle('on', x === b));
      metro.set({ beatsPerBar: +b.dataset.v });
      renderBeatDots(); haptic(5);
    };
  });
  document.querySelectorAll('#sub-chips button').forEach(b => {
    b.onclick = () => {
      store.set({ metroSub: +b.dataset.v });
      document.querySelectorAll('#sub-chips button').forEach(x => x.classList.toggle('on', x === b));
      metro.set({ subdivision: +b.dataset.v });
      haptic(5);
    };
  });
  bindRange('metro-vol', 'metroVol', v => {
    $('metro-vol-v').textContent = `${Math.round(v)}%`;
    metro.set({ volume: +v / 100 });
  });
  $('btn-metro-toggle').onclick = () => {
    if (metro.playing) {
      metro.stop();
      $('btn-metro-toggle').textContent = '▶ 开始';
      $('btn-metro-toggle').classList.remove('on');
      renderBeatDots();
    } else {
      metro.start();
      $('btn-metro-toggle').textContent = '■ 停止';
      $('btn-metro-toggle').classList.add('on');
    }
    haptic(8);
  };
  // TAP 测速
  let taps = [];
  $('btn-tap').onclick = () => {
    const now = performance.now();
    taps = taps.filter(t => now - t < 2600);
    taps.push(now);
    haptic(5);
    if (taps.length >= 2) {
      const iv = [];
      for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
      const avg = iv.reduce((s, v) => s + v, 0) / iv.length;
      const bpm = Math.round(clamp(60000 / avg, 20, 300));
      setRange('bpm-slider', bpm);
      $('tap-hint').textContent = `${taps.length} 次点击 → ${bpm} BPM`;
    }
    if (taps.length > 12) taps.shift();
  };

  // ---- 参考音 ----
  document.querySelectorAll('#tone-chips button').forEach(b => {
    b.onclick = () => {
      store.set({ toneType: b.dataset.v });
      document.querySelectorAll('#tone-chips button').forEach(x => x.classList.toggle('on', x === b));
    };
  });
  bindRange('tone-dur', 'toneDur', v => {
    $('tone-dur-v').textContent = `${(+v).toFixed(1)} 秒`;
    tones.setDuration(+v);
  });
  bindRange('tone-vol', 'toneVol', v => {
    $('tone-vol-v').textContent = `${Math.round(v)}%`;
    tones.setVolume(+v / 100);
  });
  $('btn-stop-tone').onclick = () => { tones.stopAll(); if (refHandle) { refHandle.stop?.(); refHandle = null; } };

  // ---- 历史 ----
  $('btn-hist-save').onclick = () => {
    if (!S.running || !S.detector?.lastResult) { toast('请先开始调音并拨响一根弦'); return; }
    const r = S.detector.lastResult;
    const t = targets();
    const m = matchTarget(r.freq, t);
    store.addHistory({
      inst: currentInst().id, tuning: currentTuning().id,
      stringIndex: Math.max(0, m.index), note: m.name,
      targetHz: m.freq, freqHz: r.freq, cents: S.kalman.x,
    });
    renderHistory();
    toast('已记录当前偏差');
  };
  $('btn-hist-clear').onclick = () => {
    store.clearHistory(); renderHistory(); S.tunedStrings.clear(); renderStringGrid(); toast('记录已清空');
  };

  // 键盘快捷键（桌面调试用）
  window.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); S.running ? stopListening() : startListening(); }
  });
}

function bindSwitch(id, key, after) {
  const sw = $(id);
  sw.checked = !!store.get(key);
  sw.onchange = () => { store.set({ [key]: sw.checked }); after?.(); };
}

function bindRange(id, key, onInput) {
  const r = $(id);
  r.value = store.get(key);
  paintRange(r);
  const handler = () => {
    paintRange(r);
    store.set({ [key]: parseFloat(r.value) });
    onInput?.(r.value);
  };
  r.oninput = handler;
  onInput?.(r.value);
}

function setRange(id, v) {
  const r = $(id);
  r.value = v;
  paintRange(r);
  r.dispatchEvent(new Event('input'));
}

function paintRange(r) {
  const min = +r.min, max = +r.max, v = +r.value;
  r.style.setProperty('--fill', `${((v - min) / (max - min)) * 100}%`);
}

function renderBeatDots() {
  const box = $('beat-dots');
  const n = store.get('metroBeats') * store.get('metroSub');
  box.innerHTML = '';
  for (let i = 0; i < Math.min(n, 32); i++) {
    const d = document.createElement('div');
    d.className = 'dot';
    box.appendChild(d);
  }
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

function renderAll() {
  renderInstruments();
  renderTunings();
  renderModeSeg();
  renderStringGrid();
  renderRefGrid();
  renderHistory();
}

function init() {
  meter = new Meter($('meter'));
  meter.setTolerance(store.get('tolerance'));

  // 恢复设置到控件
  document.querySelectorAll('#win-chips button').forEach(b =>
    b.classList.toggle('on', b.dataset.v === store.get('windowMode')));
  $('win-v').textContent = document.querySelector('#win-chips button.on')?.textContent || '自动';
  document.querySelectorAll('#ts-chips button').forEach(b =>
    b.classList.toggle('on', +b.dataset.v === store.get('metroBeats')));
  document.querySelectorAll('#sub-chips button').forEach(b =>
    b.classList.toggle('on', +b.dataset.v === store.get('metroSub')));
  document.querySelectorAll('#tone-chips button').forEach(b =>
    b.classList.toggle('on', b.dataset.v === store.get('toneType')));

  bindUI();
  renderAll();
  renderBeatDots();

  tones.setDuration(store.get('toneDur'));
  tones.setVolume(store.get('toneVol'));
  metro.set({
    bpm: store.get('metroBpm'), beatsPerBar: store.get('metroBeats'),
    subdivision: store.get('metroSub'), volume: store.get('metroVol'),
  });
  metro.onBeat = ({ inBar, isBarStart }) => {
    const dots = $('beat-dots').children;
    for (const d of dots) d.classList.remove('hit', 'accent');
    if (dots[inBar]) {
      dots[inBar].classList.add('hit');
      if (isBarStart) dots[inBar].classList.add('accent');
    }
    if (isBarStart && store.get('haptic')) haptic(8);
  };

  // 表盘持续重绘（指针平滑需要）
  (function loop() {
    requestAnimationFrame(loop);
    if (!S.running) meter.update({ cents: 0, hasSignal: false, inTune: false, confidence: 0 });
  })();

  // Service Worker（离线可用 + 可安装到桌面）
  // 打成 APK 后（Capacitor / WebView）不注册：资源本就随包内置在本地，
  // 再叠加 SW 缓存只会让升级时读到旧文件。
  const inNativeShell = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!inNativeShell && 'serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW 注册失败', e));
  }

  // 首次提示
  if (!localStorage.getItem('jingtiao.hinted')) {
    localStorage.setItem('jingtiao.hinted', '1');
    setTimeout(() => toast('点右下角「🎤 开始调音」并允许麦克风权限', 4200), 700);
  }

  // 音频上下文被系统打断后自动恢复
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && S.running && engine.ctx?.state === 'suspended') {
      engine.ctx.resume().catch(() => {});
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
