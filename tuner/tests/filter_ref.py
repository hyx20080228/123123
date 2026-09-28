"""filter_ref.py — tuner/js/pitch/filter.js 的 Python 等价实现（用于验证平滑效果）"""
from __future__ import annotations


class CentKalmanRef:
    """音分域一维卡尔曼滤波：状态 = [音分, 音分/秒]，含跳变门限"""

    def __init__(self, q_pos=0.6, q_vel=22.0, r_base=5.5, gate=55.0):
        self.q_pos, self.q_vel, self.r_base, self.gate = q_pos, q_vel, r_base, gate
        self.reset()

    def reset(self, cent=None):
        self.x = 0.0 if cent is None else cent
        self.v = 0.0
        self.p = 25.0 if cent is not None else 1e4
        self.pv = 1e3
        self.initialized = cent is not None
        self.outliers = 0

    def update(self, cent, dt, confidence=1.0):
        if not self.initialized:
            self.reset(cent)
            return self.x
        dt = min(max(dt, 0.005), 0.25)
        self.x += self.v * dt
        self.p += self.pv * dt * dt + self.q_pos * dt * 60
        self.pv += self.q_vel * dt * 60

        c = min(max(confidence, 0.02), 1.0)
        R = self.r_base / c
        innov = cent - self.x
        if abs(innov) > self.gate:
            self.outliers += 1
            if self.outliers < 4:
                R *= 60
            else:
                self.reset(cent)
                return self.x
        else:
            self.outliers = max(0, self.outliers - 1)

        K = self.p / (self.p + R)
        Kv = (self.pv * dt) / (self.p + R)
        self.x += K * innov
        self.v += Kv * innov
        self.p = (1 - K) * self.p
        self.pv = max(self.pv * (1 - K * 0.6), 1e-2)
        return self.x
