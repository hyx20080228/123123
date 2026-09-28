"""
detector.py — tuner/js/pitch/detector.js 的 Python 等价实现（逐行对应）

用途：真机之前用合成弦音量化验证音分误差。改 JS 必须同步改这里。
运行：python3 tuner/tests/test_accuracy.py
"""
from __future__ import annotations

import numpy as np

LAG_INTERP_TAPS = 12
HALF = LAG_INTERP_TAPS // 2
HUM_BASE = (50, 60)
HUM_HARMONICS = 3
HUM_TOLERANCE_CENTS = 8


def next_pow2(n: int) -> int:
    p = 1
    while p < n:
        p <<= 1
    return p


# --------------------------------------------------------------------------- YIN

def difference(x: np.ndarray, acf: np.ndarray, max_lag: int):
    n = x.size
    E = np.zeros(n + 1)
    np.cumsum(x * x, out=E[1:])
    taus = np.arange(max_lag + 1)
    d = E[n - taus] + (E[n] - E[taus]) - 2.0 * acf[: max_lag + 1]
    return np.maximum(d, 0.0), E


def cmndf(d: np.ndarray, max_lag: int, min_lag: int = 2) -> np.ndarray:
    c = np.ones(max_lag + 1)
    running = np.cumsum(d)
    for tau in range(min_lag, max_lag + 1):
        c[tau] = (d[tau] * tau) / running[tau] if running[tau] > 0 else 1.0
    return c


def parabolic_min(y, i: int) -> float:
    a, b, c = float(y[i - 1]), float(y[i]), float(y[i + 1])
    denom = a - 2 * b + c
    if abs(denom) < 1e-12:
        return float(i)
    delta = (0.5 * (a - c)) / denom
    return i + delta if abs(delta) <= 1 else float(i)


def _lagrange_weights(frac: float) -> np.ndarray:
    xs = np.arange(-(HALF - 1), HALF + 1, dtype=np.float64)
    w = np.ones(LAG_INTERP_TAPS)
    for i, xi in enumerate(xs):
        for j, xj in enumerate(xs):
            if i != j:
                w[i] *= (frac - xj) / (xi - xj)
    return w / w.sum()


_W_CACHE: dict[int, np.ndarray] = {}


def _cached_weights(q: int) -> np.ndarray:
    if q not in _W_CACHE:
        _W_CACHE[q] = _lagrange_weights(q / 1024.0)
    return _W_CACHE[q]


def rho_at(acf: np.ndarray, E: np.ndarray, n: int, tau: float) -> float:
    """归一化相关系数 ρ(τ)，τ 可为非整数。分母恰好抵消 d(τ) 的长度趋势 → 对周期无偏。"""
    i = int(np.floor(tau))
    if i < HALF or i + HALF + 1 >= acf.size:
        return -1.0
    w = _cached_weights(int(round((tau - i) * 1024)))
    s = float(np.dot(w, acf[i - (HALF - 1): i - (HALF - 1) + LAG_INTERP_TAPS]))
    fr = tau - i
    e1a, e1b = E[n - i], E[n - i - 1]
    e2a, e2b = E[n] - E[i], E[n] - E[i + 1]
    denom = (e1a + (e1b - e1a) * fr) + (e2a + (e2b - e2a) * fr)
    if denom <= 1e-12:
        return -1.0
    return (2.0 * s) / denom


def refine_lag(acf, E, n, tau0, rel=None, tol=5e-4):
    """在 τ0 附近最大化 ρ(τ)。范围按绝对采样点给下限（短周期时百分比范围不够覆盖残差）。"""
    if rel is None:
        rel = max(0.85 / max(tau0, 1.0), 0.012)
    lo0 = max(HALF + 1, tau0 * (1 - rel))
    hi0 = min(acf.size - HALF - 3, tau0 * (1 + rel))
    if hi0 - lo0 < 0.5:
        return tau0, rho_at(acf, E, n, tau0)
    step = 0.2
    grid = np.arange(lo0, hi0 + step, step)
    rhos = np.array([rho_at(acf, E, n, t) for t in grid])
    bi = int(np.argmax(rhos))
    best_tau, best_rho = float(grid[bi]), float(rhos[bi])
    lo = max(lo0, best_tau - step * 2)
    hi = min(hi0, best_tau + step * 2)
    PHI = (np.sqrt(5) - 1) / 2
    c, d = hi - PHI * (hi - lo), lo + PHI * (hi - lo)
    fc, fd = rho_at(acf, E, n, c), rho_at(acf, E, n, d)
    guard = 0
    while hi - lo > tol and guard < 60:
        guard += 1
        if fc > fd:
            hi, d, fd = d, c, fc
            c = hi - PHI * (hi - lo)
            fc = rho_at(acf, E, n, c)
        else:
            lo, c, fc = c, d, fd
            d = lo + PHI * (hi - lo)
            fd = rho_at(acf, E, n, d)
    lag = 0.5 * (lo + hi)
    r = rho_at(acf, E, n, lag)
    return lag, (r if r > best_rho else best_rho)


def lowpass(x: np.ndarray, cutoff: float, sr: float) -> np.ndarray:
    """砖墙零相位低通（与 FFT.lowpass 等价）"""
    n = x.size
    size = 1 << int(np.ceil(np.log2(max(n, 2))))
    X = np.fft.rfft(x, n=size)
    fr = np.arange(X.size) * sr / size
    X[fr > cutoff] = 0
    return np.fft.irfft(X, n=size)[:n]


def yin_candidates(x, sample_rate, min_freq=30.0, max_freq=1400.0,
                   threshold=0.15, max_candidates=8, refine=True):
    n = x.size
    max_lag = min(n - HALF - 3, int(np.ceil(sample_rate / min_freq)))
    min_lag = max(HALF + 1, int(np.floor(sample_rate / max_freq)))
    if max_lag <= min_lag + 2:
        return [], None, max_lag, min_lag

    size = 1 << int(np.ceil(np.log2(2 * n)))
    acf = np.fft.irfft(np.abs(np.fft.rfft(x, n=size)) ** 2, n=size)[: max_lag + LAG_INTERP_TAPS + 2]
    d, E = difference(x, acf, max_lag)
    c = cmndf(d, max_lag, min_lag)

    valleys = [{"tau": tau, "depth": float(c[tau]), "clarity": 1.0 - float(c[tau])}
               for tau in range(min_lag + 1, max_lag)
               if c[tau] < c[tau - 1] and c[tau] <= c[tau + 1]]
    if not valleys:
        return [], None, max_lag, min_lag
    valleys.sort(key=lambda v: v["depth"])
    qualified = [v for v in valleys if v["depth"] < threshold]
    primary = sorted(qualified, key=lambda v: v["tau"])[0] if qualified else valleys[0]

    pool = valleys[:max_candidates]
    if not any(v["tau"] == primary["tau"] for v in pool):
        pool.append(primary)

    cands = []
    for v in pool:
        p0 = parabolic_min(c, v["tau"])
        if refine:
            lag, rho = refine_lag(acf, E, n, p0)
        else:
            lag, rho = p0, rho_at(acf, E, n, v["tau"])
        if lag < min_lag or lag > max_lag:
            continue
        cands.append({"lag": float(lag), "freq": sample_rate / lag, "rho": float(rho),
                      "clarity": v["clarity"], "depth": v["depth"], "tau": v["tau"],
                      "is_primary": v["tau"] == primary["tau"]})
    if not cands:
        return [], None, max_lag, min_lag

    cands.sort(key=lambda k: -k["rho"])
    top = cands[0]["rho"]
    close = [c_ for c_ in cands if c_["rho"] >= top - 0.04]
    close.sort(key=lambda k: k["lag"])
    return cands, (close[0] if close else cands[0]), max_lag, min_lag


# ----------------------------------------------------------------------- 频谱封装

class Spectrum:
    """只用于置信度 / 哼声判别 / 非谐性补偿，不直接决定频率"""

    def __init__(self, mag: np.ndarray, sample_rate: float, fft_size: int):
        self.mag = np.asarray(mag, dtype=np.float64)
        self.n_bins = self.mag.size
        self.bin_hz = sample_rate / fft_size
        self.db = 20.0 * np.log10(np.maximum(self.mag, 1e-10))

    @property
    def max_freq(self) -> float:
        return (self.n_bins - 3) * self.bin_hz

    def median_db(self) -> float:
        return float(np.median(self.db[4::7])) if self.n_bins > 12 else -120.0


# ----------------------------------------------------------------------- 主检测器

class PitchDetector:
    def __init__(self, sample_rate=48000, min_freq=30.0, max_freq=1400.0,
                 threshold=0.15, window=4096, fast_window=2048,
                 rho_gate=0.5, rms_gate=0.0005, reject_hum=True,
                 compensate_inharmonicity=True, max_compensation_cents=25.0,
                 lowpass_hz=None):
        self.sr = float(sample_rate)
        self.min_freq = min_freq
        self.max_freq = max_freq
        self.threshold = threshold
        self.rho_gate = rho_gate
        self.rms_gate = rms_gate
        self.reject_hum = reject_hum
        self.compensate = compensate_inharmonicity
        self.max_comp = max_compensation_cents
        self.lowpass_hz = (min(0.22 * self.sr, max(6000.0, 2.5 * self.max_freq))
                           if lowpass_hz is None else lowpass_hz)
        need = int(np.ceil(self.sr / self.min_freq * 2.2)) + LAG_INTERP_TAPS + 4
        self.window = next_pow2(max(window, need))
        self.fast_window = next_pow2(max(fast_window, min(need, self.window)))
        self.prev_freq = None
        self._b_smooth = None
        self._win_cache = {}

    def _window(self, size):
        if size not in self._win_cache:
            self._win_cache[size] = np.hanning(size)
        return self._win_cache[size]

    def reset_tracking(self):
        self.prev_freq = None
        self._b_smooth = None

    # ---- 频谱工具 ----

    def _hum_cents(self, f):
        if not self.reject_hum:
            return None
        for base in HUM_BASE:
            for k in range(1, HUM_HARMONICS + 1):
                c = 1200 * np.log2(f / (base * k))
                if abs(c) < HUM_TOLERANCE_CENTS:
                    return float(c)
        return None

    def _peak_db_at(self, spec, f, median_db):
        i = int(round(f / spec.bin_hz))
        lo, hi = max(1, i - 1), min(spec.n_bins - 2, i + 1)
        if hi <= lo:
            return -200.0
        mx = float(spec.mag[lo:hi + 1].max())
        return 20 * np.log10(max(mx, 1e-10)) - median_db

    def _is_pure_tone(self, spec, f, median_db):
        h1 = self._peak_db_at(spec, f, median_db)
        if h1 < median_db + 6:
            return False
        for k in (2, 3):
            fk = f * k
            if fk > spec.max_freq:
                continue
            if self._peak_db_at(spec, fk, median_db) > h1 - 18:
                return False
        return True

    def _harmonic_peaks(self, spec, f, median_db):
        out = []
        fmax = min(spec.max_freq, self.lowpass_hz if self.lowpass_hz else spec.max_freq)
        max_k = min(14, int(np.floor(fmax / f)))
        for k in range(1, max_k + 1):
            fk = f * k
            cb = fk / spec.bin_hz
            lo, hi = max(1, int(np.floor(cb - 1.5))), min(spec.n_bins - 2, int(np.ceil(cb + 1.5)))
            if hi <= lo:
                continue
            seg = spec.mag[lo:hi + 1]
            i_max = lo + int(np.argmax(seg))
            mx = float(seg.max())
            if i_max < 1 or i_max >= spec.n_bins - 1:
                continue
            a, b, c = spec.db[i_max - 1], spec.db[i_max], spec.db[i_max + 1]
            den = a - 2 * b + c
            delta = float(np.clip(0.5 * (a - c) / den, -1, 1)) if abs(den) > 1e-9 else 0.0
            pk = (i_max + delta) * spec.bin_hz
            dev = 1200 * np.log2(pk / fk)
            # 峰位太靠近 DC（bin<4）时会被直流泄漏拉偏，不参与拟合；
            # |dev|<150 音分已足以确认锁定的是本谐波（相邻谐波至少差 1200/k 音分）
            usable = abs(dev) < 150 and (pk / spec.bin_hz) >= 4.0 and mx > 0
            out.append({"k": k, "freq": fk, "peak_freq": pk, "amp": mx,
                        "db": 20 * np.log10(max(mx, 1e-10)) - median_db,
                        "dev_cents": dev, "usable": usable})
        return out

    def _fit_inharmonicity(self, harmonics, f_ac):
        pts = [h for h in harmonics if h["usable"] and h["db"] > 0]
        if len(pts) < 4:
            return None
        sw = swx = swy = swxx = swxy = s2 = s4 = 0.0
        for h in pts:
            x = h["k"] ** 2 / 2.0
            y = h["peak_freq"] / h["k"]
            w = h["amp"] ** 2 * h["k"] ** 2
            sw += w; swx += w * x; swy += w * y
            swxx += w * x * x; swxy += w * x * y
            s2 += h["amp"] ** 2 * h["k"] ** 2
            s4 += h["amp"] ** 2 * h["k"] ** 4
        det = sw * swxx - swx * swx
        if abs(det) < 1e-18 or sw <= 0:
            return None
        slope = (sw * swxy - swx * swy) / det
        intercept = (swy - slope * swx) / sw
        if intercept <= 0:
            return None
        B = slope / intercept
        if not (1e-7 < B < 5e-3):
            return None
        k_eff2 = s4 / s2 if s2 > 0 else 0.0
        if not (0.5 < k_eff2 < 100):
            return None
        b_s = B if self._b_smooth is None else self._b_smooth * 0.85 + B * 0.15
        self._b_smooth = b_s
        cents = 1200 * np.log2(1 + b_s * k_eff2 / 2)
        if not np.isfinite(cents):
            return None
        cents = float(np.clip(cents, -self.max_comp, self.max_comp))
        f1 = f_ac / 2 ** (cents / 1200)
        if f1 < self.min_freq * 0.98 or f1 > self.max_freq * 1.02:
            return None
        return {"B": b_s, "B_raw": B, "k_eff": float(np.sqrt(k_eff2)),
                "f1": float(f1), "cents": cents, "n_harm": len(pts)}

    def _confidence(self, cand, harms, rms):
        rho_part = min(1.0, max(0.0, (cand["raw_rho"] - 0.35) / 0.6))
        strong = sum(1 for h in harms if h["db"] > 3)
        harm_part = min(1.0, strong / max(1, min(4, len(harms))))
        level_part = min(1.0, max(0.0, (20 * np.log10(max(rms, 1e-9)) + 60) / 34))
        return min(1.0, max(0.0, 0.62 * rho_part + 0.26 * harm_part + 0.12 * level_part))

    def _choose(self, scored, hint_freq, track=True):
        srt = sorted(scored, key=lambda c: -c["rho"])
        best_rho = srt[0]["rho"]
        if hint_freq:
            near = [c for c in scored if abs(1200 * np.log2(c["freq"] / hint_freq)) < 80]
            if near:
                near.sort(key=lambda c: -c["rho"])
                if near[0]["rho"] > best_rho - 0.25:
                    return near[0]
        if track and self.prev_freq:
            tr = [c for c in scored
                  if abs(1200 * np.log2(c["freq"] / self.prev_freq)) < 35
                  and c["rho"] > best_rho - 0.12]
            if tr:
                tr.sort(key=lambda c: -c["rho"])
                return tr[0]
        close = [c for c in scored if c["rho"] >= best_rho - 0.04]
        close.sort(key=lambda c: c["lag"])
        return close[0] if close else srt[0]

    # ---- 主入口 ----

    def detect(self, samples: np.ndarray, window: int | None = None,
               hint_freq=None, track: bool = True):
        size = window or self.window
        if samples.size < int(size * 0.8):
            return None
        x = np.asarray(samples[-size:], dtype=np.float64)
        x = x - x.mean()
        rms = float(np.sqrt(np.mean(x * x)))
        if rms < self.rms_gate:
            return None

        sig = x
        if self.lowpass_hz and self.lowpass_hz < self.sr * 0.45:
            sig = lowpass(x, self.lowpass_hz, self.sr)

        cands, _best, _ml, _nl = yin_candidates(
            sig, self.sr, self.min_freq, self.max_freq, self.threshold, 8)
        if not cands:
            return None

        # 频谱做 2 倍零填充：不增加真实分辨率，但显著改善抛物线插值的峰位精度
        # （临界采样时 scalloping 误差可达 ±0.15 bin，零填充后降到 ±0.02 bin）
        spec_size = next_pow2(size * 2)
        padded = np.zeros(spec_size)
        padded[:size] = sig * self._window(size)
        spec = Spectrum(np.abs(np.fft.rfft(padded)), self.sr, spec_size)
        median_db = spec.median_db()

        scored = []
        for cand in cands:
            f = self.sr / cand["lag"]
            if f < self.min_freq or f > self.max_freq:
                continue
            pen = 0.0
            hum = self._hum_cents(f)
            if hum is not None:
                pen += 0.5 if self._is_pure_tone(spec, f, median_db) else 0.08
            if hint_freq:
                dd = abs(1200 * np.log2(f / hint_freq))
                if dd > 90:
                    pen += min(0.6, (dd - 90) / 300.0)
            scored.append({**cand, "freq": f, "rho": cand["rho"] - pen,
                           "raw_rho": cand["rho"], "penalty": pen, "hum": hum})
        if not scored:
            return None

        chosen = self._choose(scored, hint_freq, track)
        if chosen is None:
            return None

        if (self.reject_hum and chosen["hum"] is not None
                and self._is_pure_tone(spec, chosen["freq"], median_db)):
            alt = sorted([c for c in scored if c["hum"] is None and c["raw_rho"] > 0.5],
                         key=lambda c: -c["rho"])
            if not alt:
                return None
            chosen = alt[0]

        harms = self._harmonic_peaks(spec, chosen["freq"], median_db)
        freq = chosen["freq"]
        comp = None
        if self.compensate:
            comp = self._fit_inharmonicity(harms, chosen["freq"])
            if comp:
                freq = comp["f1"]

        res = {"freq": float(freq), "raw_freq": float(chosen["freq"]),
               "rho": chosen["raw_rho"], "clarity": chosen["clarity"],
               "confidence": self._confidence(chosen, harms, rms),
               "rms": rms, "rms_db": 20 * np.log10(max(rms, 1e-9)),
               "harmonics": harms, "median_db": median_db, "compensation": comp,
               "candidates": scored[:5], "n_cand": len(scored),
               "window": size, "is_hum": chosen["hum"] is not None}
        if track:
            self.prev_freq = res["freq"]
        return res


def note_from_freq(freq: float, a4: float = 440.0):
    midi = 69 + 12 * np.log2(freq / a4)
    r = int(round(midi))
    return {"midi": r, "cents": (midi - r) * 100, "freq": freq}
