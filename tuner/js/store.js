/**
 * store.js — 设置与调音记录的本地持久化
 */

const KEY = 'jingtiao.v1';

export const DEFAULTS = {
  instrument: 'guitar',
  tunings: { guitar: 'std', ukulele: 'std', bass4: 'std', bass5: 'std', bass6: 'std', violin: 'std', viola: 'std', cello: 'std', mandolin: 'std', chromatic: 'auto' },
  mode: 'auto',             // auto | manual
  selectedString: 0,
  a4: 440,
  useFlats: false,
  compensateInharmonicity: true,
  rejectHum: true,
  lockMode: true,           // 稳定后才判定"准了"
  haptic: true,
  windowMode: 'auto',       // auto | fast | precise
  gateDb: -52,
  tolerance: 2.0,           // 到位容差（音分）
  toneType: 'pluck',
  toneDur: 2.2,
  toneVol: 0.8,
  metroBpm: 90,
  metroBeats: 4,
  metroSub: 1,
  metroVol: 0.7,
  history: [],
};

export class Store {
  constructor() {
    this.data = this._load();
    this._listeners = new Set();
  }

  _load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* 隐私模式可能禁用 */ }
    if (!raw) return structuredClone(DEFAULTS);
    try {
      const parsed = JSON.parse(raw);
      return { ...structuredClone(DEFAULTS), ...parsed, tunings: { ...DEFAULTS.tunings, ...(parsed.tunings || {}) } };
    } catch (e) {
      return structuredClone(DEFAULTS);
    }
  }

  _save() {
    try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { /* 忽略配额错误 */ }
  }

  get(k) { return this.data[k]; }

  set(patch) {
    Object.assign(this.data, patch);
    this._save();
    this._emit();
  }

  setTuning(instId, tuningId) {
    this.data.tunings[instId] = tuningId;
    this._save();
    this._emit();
  }

  onChange(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { this._listeners.forEach(fn => { try { fn(this.data); } catch (e) { console.error(e); } }); }

  // ------------------------------------------------------------------ 记录

  addHistory(entry) {
    const h = this.data.history;
    h.push({ t: Date.now(), ...entry });
    if (h.length > 400) h.splice(0, h.length - 400);
    this._save();
    this._emit();
  }

  clearHistory() { this.data.history = []; this._save(); this._emit(); }

  /** 每根弦最近一次的偏差 */
  latestPerString(instId, tuningId) {
    const out = new Map();
    for (const e of this.data.history) {
      if (e.inst === instId && e.tuning === tuningId) out.set(e.stringIndex, e);
    }
    return out;
  }
}

export default Store;
