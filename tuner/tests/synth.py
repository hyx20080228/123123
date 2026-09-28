"""
synth.py — 拨弦乐器物理仿真，用于验证调音算法精度

模型要素（都来自真实弦振动的物理特性，缺一个都会让测试偏乐观）：
  1. 谐波列 + 非谐性 B：f_k = k·f0·sqrt(1 + B·k²)   （钢弦 B≈1e-4，尼龙弦更小）
  2. 拨弦位置陷波：在距琴桥 p 处拨弦，第 k 次谐波幅度 ∝ sin(π·k·p)
     → 例如在 1/8 处拨弦，第 8、16 次谐波完全消失；靠近 1/2 处拨弦则基频很弱
     这是调音器最容易出错的情况（基频缺失 → 八度误判）
  3. 逐谐波指数衰减，高频衰减更快（弦的辐射阻尼 + 空气阻尼）
  4. 起振瞬态：拨弦瞬间有 2~5 ms 的宽频噪声（拨片/指甲摩擦）
  5. 抖动：手指/琴体带来的微小频率调制与幅度调制
  6. 环境噪声（白噪 + 50/60 Hz 工频哼声）
"""
from __future__ import annotations

import numpy as np


def plucked_string(f0: float, sr: int = 48000, dur: float = 1.5,
                   n_harm: int = 22,
                   inharmonicity: float = 1.2e-4,
                   pick_pos: float = 0.13,
                   brightness: float = 1.0,
                   decay_t60: float = 4.5,
                   detune_cents: float = 0.0,
                   jitter_hz: float = 0.0,
                   am_depth: float = 0.0,
                   attack_noise_ms: float = 3.0,
                   seed: int | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(dur * sr)
    t = np.arange(n) / sr

    f = f0 * 2 ** (detune_cents / 1200.0)
    out = np.zeros(n)

    # 频率抖动（随机游走，模拟左手轻微触碰 / 琴颈形变）
    if jitter_hz > 0:
        steps = rng.normal(0, jitter_hz / np.sqrt(sr), n).cumsum()
        steps = np.clip(steps, -3 * jitter_hz, 3 * jitter_hz)
        phase_mod = 2 * np.pi * np.cumsum(steps) / sr
    else:
        phase_mod = 0.0

    total = 0.0
    for k in range(1, n_harm + 1):
        fk = k * f * np.sqrt(1 + inharmonicity * k * k)
        if fk > sr * 0.48:
            break
        # 拨弦位置陷波
        amp = abs(np.sin(np.pi * k * pick_pos))
        # 频谱倾斜（拨弦能量随谐波衰减）
        amp *= (1.0 / k) ** (1.0 + 0.35 * (1.0 - brightness))
        # 逐谐波衰减：高频衰减快
        tau = decay_t60 / (1.0 + 0.55 * (k - 1) ** 0.9) / 3.0
        env = np.exp(-t / max(tau, 1e-3))
        # 幅度调制
        if am_depth > 0:
            env = env * (1 + am_depth * np.sin(2 * np.pi * rng.uniform(1.5, 6) * t))
        phase = rng.uniform(0, 2 * np.pi)
        out += amp * env * np.sin(2 * np.pi * fk * t + phase + (phase_mod * k if jitter_hz else 0))
        total += amp
    if total > 0:
        out /= total

    # 起振瞬态噪声
    if attack_noise_ms > 0:
        na = int(attack_noise_ms * 1e-3 * sr)
        burst = rng.normal(0, 1, na) * np.exp(-np.arange(na) / (na / 3.5))
        out[:na] += burst * 0.16

    # 归一化到 0.7 峰值
    peak = np.max(np.abs(out))
    if peak > 0:
        out *= 0.7 / peak
    return out


def add_noise(sig: np.ndarray, snr_db: float = 40.0, hum_hz: float = 50.0,
              hum_level: float = 0.0, seed: int | None = None) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = sig.size
    p_sig = np.mean(sig ** 2)
    target = p_sig / (10 ** (snr_db / 10.0))
    noise = rng.normal(0, np.sqrt(max(target, 0)), n)
    if hum_level > 0:
        t = np.arange(n) / 48000
        noise += hum_level * np.sin(2 * np.pi * hum_hz * t)
        noise += hum_level * 0.4 * np.sin(2 * np.pi * hum_hz * 2 * t)
    out = sig + noise
    peak = np.max(np.abs(out))
    return out / peak * 0.85 if peak > 0.95 else out


def note_to_freq(note: str, a4: float = 440.0) -> float:
    SEMI = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4,
            'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9,
            'A#': 10, 'Bb': 10, 'B': 11}
    import re
    m = re.match(r'^([A-G])([#b]?)(-?\d)$', note)
    letter, acc, octv = m.group(1), m.group(2), int(m.group(3))
    semi = SEMI[letter] + (1 if acc == '#' else -1 if acc == 'b' else 0)
    midi = (octv + 1) * 12 + semi
    return a4 * 2 ** ((midi - 69) / 12)


# 吉他标准调弦 6 弦空弦
GUITAR_STD = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4']
