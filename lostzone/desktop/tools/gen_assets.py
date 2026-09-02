#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LOST ZONE 桌面版 · 高清资源包生成器（可复现，零外部依赖：PIL + 标准库）
生成 desktop/resources/ 下：
  art/       2K 概念背景 + 18 张 2K 地表/墙体纹理（程序绘制，固定 seed）
  audio/bgm/ 完整 OST（44.1kHz 16bit 立体声 WAV，分层合成）
  audio/sfx/ 120 个环境/战斗音效 WAV
用法：
  python3 tools/gen_assets.py --size 1G     完整生成（资源约 1GB+）
  python3 tools/gen_assets.py --size 150M   快速验证
  python3 tools/gen_assets.py --size 0 --report   仅统计
"""
import argparse
import math
import os
import random
import sys
import time
import wave
from array import array
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'resources')
SR = 44100
BYTES_PER_SEC = SR * 2 * 2  # 16bit stereo


def ensure(p):
    os.makedirs(p, exist_ok=True)
    return p


def du(n):
    for u, d in (('GB', 3), ('MB', 2), ('KB', 1)):
        if n >= 1024 ** d:
            return f'{n / 1024 ** d:.1f} {u}'
    return f'{n} B'


# ---------------------------------------------------------------- 纹理 ----
def tex(base_rgb, name, seed, kind):
    S = 2048
    rnd = random.Random(seed)
    img = Image.new('RGB', (S, S), base_rgb)
    d = ImageDraw.Draw(img, 'RGBA')
    if kind == 'grass':
        for _ in range(9000):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            g = rnd.randint(-26, 26)
            d.point((x, y), fill=(base_rgb[0] + g, base_rgb[1] + g, base_rgb[2] + g))
        for _ in range(2600):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            ln = rnd.randint(4, 12)
            c = rnd.choice([(96, 132, 82), (78, 116, 66), (110, 148, 92)])
            d.line([(x, y), (x + rnd.randint(-3, 3), y - ln)], fill=c, width=1)
    elif kind in ('stone', 'plaster', 'asphalt', 'metal', 'rust'):
        for _ in range(16000):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            g = rnd.randint(-18, 18)
            d.point((x, y), fill=(max(0, base_rgb[0] + g), max(0, base_rgb[1] + g), max(0, base_rgb[2] + g)))
        for _ in range(rnd.randint(10, 30)):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            pts = [(x, y)]
            for _ in range(rnd.randint(6, 22)):
                x += rnd.randint(-26, 26)
                y += rnd.randint(-18, 18)
                pts.append((x, y))
            d.line(pts, fill=(16, 18, 20), width=rnd.choice([1, 1, 2]))
        if kind in ('stone', 'asphalt'):
            step = rnd.choice([256, 342, 512])
            for gx in range(0, S, step):
                d.line([(gx, 0), (gx, S)], fill=(30, 32, 34), width=3)
            for gy in range(0, S, step):
                d.line([(0, gy), (S, gy)], fill=(30, 32, 34), width=3)
        if kind == 'metal':
            for _ in range(60):
                x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
                d.ellipse([x, y, x + 10, y + 10], fill=(70, 74, 80))
                d.ellipse([x + 3, y + 3, x + 7, y + 7], fill=(30, 32, 36))
        if kind == 'rust':
            for _ in range(90):
                x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
                r = rnd.randint(20, 90)
                c = rnd.choice([(120, 66, 36), (96, 48, 26), (140, 84, 44)])
                d.ellipse([x, y, x + r, y + r], fill=(*c, rnd.randint(18, 60)))
    elif kind == 'brick':
        bh, bw = 128, 256
        for row, gy in enumerate(range(0, S, bh)):
            off = (row % 2) * (bw // 2)
            for gx in range(-bw, S, bw):
                x0 = gx + off
                c = (base_rgb[0] + rnd.randint(-14, 14), base_rgb[1] + rnd.randint(-12, 12), base_rgb[2] + rnd.randint(-12, 12))
                d.rectangle([x0 + 4, gy + 4, x0 + bw - 4, gy + bh - 4], fill=c)
        for _ in range(8000):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            g = rnd.randint(-16, 16)
            d.point((x, y), fill=(base_rgb[0] + g, base_rgb[1] + g, base_rgb[2] + g))
    elif kind == 'wood':
        for gy in range(0, S, 170):
            c = (base_rgb[0] + rnd.randint(-16, 16), base_rgb[1] + rnd.randint(-14, 14), base_rgb[2] + rnd.randint(-12, 12))
            d.rectangle([0, gy, S, gy + 166], fill=c)
            for _ in range(220):
                y = gy + rnd.randint(2, 164)
                d.line([(0, y), (S, y + rnd.randint(-6, 6))], fill=(52, 36, 22), width=1)
            for _ in range(8):
                x, y = rnd.randint(60, S - 60), gy + rnd.randint(20, 140)
                d.ellipse([x, y, x + rnd.randint(12, 26), y + rnd.randint(12, 26)], fill=(56, 40, 24))
    elif kind == 'tile':
        step = 256
        for gy in range(0, S, step):
            for gx in range(0, S, step):
                c = (base_rgb[0] + rnd.randint(-8, 8), base_rgb[1] + rnd.randint(-8, 8), base_rgb[2] + rnd.randint(-8, 8))
                d.rectangle([gx + 3, gy + 3, gx + step - 3, gy + step - 3], fill=c)
        for _ in range(42):
            x, y = rnd.randint(0, S - 1), rnd.randint(0, S - 1)
            r = rnd.randint(30, 120)
            d.ellipse([x, y, x + r, y + r], fill=(70, 86, 74, 26))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    p = ensure(os.path.join(ROOT, 'art', 'tex'))
    fp = os.path.join(p, name)
    img.save(fp, optimize=True, compress_level=9)
    return os.path.getsize(fp)


TEX_SET = [
    ((64, 96, 58), 'grass_01.png', 'grass'), ((58, 88, 54), 'grass_02.png', 'grass'),
    ((92, 96, 100), 'stone_01.png', 'stone'), ((84, 88, 94), 'stone_02.png', 'stone'),
    ((128, 84, 64), 'brick_01.png', 'brick'), ((118, 76, 58), 'brick_02.png', 'brick'),
    ((110, 82, 52), 'wood_01.png', 'wood'), ((100, 74, 48), 'wood_02.png', 'wood'),
    ((120, 122, 126), 'plaster_01.png', 'plaster'), ((110, 112, 118), 'plaster_02.png', 'plaster'),
    ((70, 74, 80), 'metal_01.png', 'metal'), ((62, 66, 72), 'metal_02.png', 'metal'),
    ((52, 54, 58), 'asphalt_01.png', 'asphalt'), ((48, 50, 54), 'asphalt_02.png', 'asphalt'),
    ((124, 100, 78), 'rust_01.png', 'rust'), ((112, 90, 70), 'rust_02.png', 'rust'),
    ((172, 190, 196), 'tile_01.png', 'tile'), ((160, 178, 186), 'tile_02.png', 'tile'),
]


def concept_art(name, seed, w=2048, h=1152):
    """2K 概念背景：天空渐变 + 废墟剪影 + 雾气（固定 seed 可复现）"""
    rnd = random.Random(seed)
    img = Image.new('RGB', (w, h))
    d = ImageDraw.Draw(img, 'RGBA')
    top = rnd.choice([(18, 22, 34), (26, 20, 30), (14, 18, 28), (30, 24, 26)])
    hor = rnd.choice([(120, 70, 40), (98, 66, 52), (140, 84, 44), (88, 70, 66)])
    for y in range(h):
        t = y / h
        c = tuple(int(top[i] + (hor[i] - top[i]) * min(1.0, t * 1.6)) for i in range(3))
        d.line([(0, y), (w, y)], fill=c)
    for layer, (col, off) in enumerate([((24, 22, 30), 0), ((16, 14, 20), 160), ((10, 9, 13), 320)]):
        x = -50
        while x < w:
            bw = rnd.randint(60, 190)
            bh = rnd.randint(200, 520)
            base = h - off - rnd.randint(0, 120)
            d.rectangle([x, base - bh, x + bw, base], fill=col)
            for _ in range(rnd.randint(0, 14)):
                wy = base - rnd.randint(10, bh - 20)
                wx0 = x + rnd.randint(6, max(7, bw - 14))
                wx1 = x + rnd.randint(wx0 - x + 4, max(wx0 - x + 5, bw - 4))
                d.rectangle([wx0, wy, wx1, wy + 3],
                            fill=(255, 200, 120, rnd.randint(24, 70)))
            x += bw + rnd.randint(10, 46)
    d.rectangle([0, h - 260, w, h], fill=(18, 16, 14))
    for _ in range(120):
        x = rnd.randint(0, w)
        y = h - 260 + rnd.randint(0, 250)
        d.line([(x, y), (x, y - rnd.randint(6, 26))], fill=(40, 36, 30), width=2)
    for _ in range(1500):
        x, y = rnd.randint(0, w), rnd.randint(0, h)
        d.point((x, y), fill=(200, 180, 150, rnd.randint(6, 28)))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    p = ensure(os.path.join(ROOT, 'art'))
    fp = os.path.join(p, name)
    img.save(fp, optimize=True, quality=92)
    return os.path.getsize(fp)


# ---------------------------------------------------------------- 音频 ----
SIN = [math.sin(2 * math.pi * i / 2048) for i in range(2048)]


def osc(phase):
    return SIN[int((phase % 1.0) * 2048) & 2047]


NOTE = {n: 440.0 * 2 ** ((n - 69) / 12) for n in range(21, 109)}
_CHORDS = [
    [57, 60, 64],  # Am
    [53, 57, 60],  # F
    [48, 52, 55],  # C
    [55, 59, 62],  # G
]
PENTA = [57, 60, 62, 64, 67, 69, 72, 74, 76]


def synth_track(idx, dur_s, seed):
    """分层合成一首 OST：和弦垫 + 低音 + 五声旋律 + 氛围噪声（stereo 16bit）"""
    rnd = random.Random(seed)
    n = int(SR * dur_s)
    buf = array('h', bytes(2 * 2 * n))
    chord_sec = 8.0
    chord_n = int(SR * chord_sec)
    bass_gain, pad_gain, mel_gain, noise_gain = 0.30, 0.16, 0.16, 0.02
    # 和弦循环
    seq = [_CHORDS[(ci + idx) % len(_CHORDS)] for ci in range(n // chord_n + 2)]
    # 旋律事件
    step = SR // 4
    mel_events = []
    for si in range(n // step + 2):
        if rnd.random() < 0.16:
            mel_events.append((si * step, NOTE[rnd.choice(PENTA)]))
    mel_ev = 0
    mel_f = 0.0
    mel_ph = 0.0
    ph = [0.0, 0.0, 0.0, 0.0]
    lp = 0.0
    ci = 0
    for i in range(n):
        cidx = i // chord_n
        if cidx != ci:
            ci = cidx
        bp = i % chord_n
        env = min(1.0, bp / (SR * 0.4), (chord_n - bp) / (SR * 0.5))
        c = seq[ci]
        f0, f1, f2 = (NOTE[x] for x in c)
        ph[0] += f0 / SR
        ph[1] += f1 / SR
        ph[2] += f2 / SR
        pad = (osc(ph[0]) + osc(ph[1]) + osc(ph[2])) / 3.0
        ph[3] += f0 / 2 / SR
        bass = osc(ph[3]) + 0.5 * osc(ph[3] * 2)
        while mel_ev < len(mel_events) and mel_events[mel_ev][0] <= i:
            mel_f = mel_events[mel_ev][1]
            mel_ph = 0.0
            mel_ev += 1
        if mel_f > 0 and (i % step) < int(SR * 0.6):
            mel_ph += mel_f / SR
            mel = osc(mel_ph)
        else:
            mel = 0.0
        lp = lp * 0.999 + (rnd.random() * 2 - 1) * 0.02
        s = (pad * pad_gain + bass * bass_gain * 0.9 + mel * mel_gain + lp * noise_gain) * env
        sL = s * (1.0 + 0.06 * osc(ph[1] * 1.003))
        sR = s * (1.0 + 0.06 * osc(ph[0] * 0.997))
        buf[i * 2] = int(max(-1.0, min(1.0, sL)) * 32000)
        buf[i * 2 + 1] = int(max(-1.0, min(1.0, sR)) * 32000)
        if i % SR == 0:
            sys.stderr.write(f'\r  track {idx}: {100 * i // n}%   ')
            sys.stderr.flush()
    fi = int(SR * 1.5)
    for i in range(fi):
        g = i / fi
        buf[i * 2] = int(buf[i * 2] * g)
        buf[i * 2 + 1] = int(buf[i * 2 + 1] * g)
        buf[(n - 1 - i) * 2] = int(buf[(n - 1 - i) * 2] * g)
        buf[(n - 1 - i) * 2 + 1] = int(buf[(n - 1 - i) * 2 + 1] * g)
    return buf


def synth_sfx(name, seed, kind, dur):
    rnd = random.Random(seed)
    n = int(SR * dur)
    buf = array('h', bytes(2 * 2 * n))
    ph = 0.0
    if kind == 'noise':
        lp = 0.0
        for i in range(n):
            lp = lp * 0.994 + (rnd.random() * 2 - 1) * 0.9
            v = int(max(-1, min(1, lp)) * 30000 * (1 - i / n))
            buf[i * 2] = v
            buf[i * 2 + 1] = v
    elif kind == 'sweep':
        for i in range(n):
            ph += (200 + 1800 * (i / n)) / SR
            v = int(max(-1, min(1, osc(ph) * (1 - i / n))) * 30000)
            buf[i * 2] = v
            buf[i * 2 + 1] = v
    elif kind == 'thump':
        for i in range(n):
            ph += (90 - 50 * (i / n)) / SR
            g = math.exp(-i / (SR * 0.12))
            v = int(max(-1, min(1, osc(ph) * g)) * 30000)
            buf[i * 2] = v
            buf[i * 2 + 1] = v
    else:  # click
        m = min(n, int(SR * 0.08))
        for i in range(m):
            v = int(30000 * (1 - i / (SR * 0.08)) * (1 if rnd.random() > 0.5 else -1))
            buf[i * 2] = v
            buf[i * 2 + 1] = v
    p = ensure(os.path.join(ROOT, 'audio', 'sfx'))
    fp = os.path.join(p, name)
    with wave.open(fp, 'wb') as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(buf.tobytes())
    return os.path.getsize(fp)


def report():
    total = 0
    files = 0
    if os.path.isdir(ROOT):
        for dp, _, fs in os.walk(ROOT):
            for f in fs:
                total += os.path.getsize(os.path.join(dp, f))
                files += 1
    print(f'[report] resources: {files} files, {du(total)}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--size', default='150M', help='目标资源体积: 1G / 800M / 150M / 0(仅报告)')
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args()
    if a.report or a.size == '0':
        report()
        return
    size = a.size.upper().rstrip('B')
    mult = {'K': 1024, 'M': 1024 ** 2, 'G': 1024 ** 3}
    if size[-1] in mult:
        target = int(float(size[:-1]) * mult[size[-1]])
    else:
        target = int(float(size))
    t0 = time.time()
    track_sec = 240
    track_bytes = track_sec * BYTES_PER_SEC
    n_tracks = max(1, int(target // track_bytes))
    print(f'[gen] target {du(target)} → {n_tracks} OST × {track_sec}s, 18 纹理 2K, 6 概念图, 120 SFX')
    ensure(ROOT)
    for i in range(n_tracks):
        data = synth_track(i, track_sec, 777000 + i * 131)
        p = ensure(os.path.join(ROOT, 'audio', 'bgm'))
        with wave.open(os.path.join(p, f'{i + 1:02d}.wav'), 'wb') as wf:
            wf.setnchannels(2)
            wf.setsampwidth(2)
            wf.setframerate(SR)
            wf.writeframes(data.tobytes())
        print(f'\n[gen] bgm/{i + 1:02d}.wav = {du(len(data) * 2)} ({time.time() - t0:.0f}s)', flush=True)
    for i, (rgb, nm, kind) in enumerate(TEX_SET):
        s = tex(rgb, nm, 9001 + i, kind)
        print(f'[gen] tex/{nm} = {du(s)}')
    for i in range(6):
        s = concept_art(f'concept_{i + 1:02d}.jpg', 5000 + i)
        print(f'[gen] art/concept_{i + 1:02d}.jpg = {du(s)}')
    names = ['wind_', 'alarm_', 'footstep_', 'hit_', 'door_', 'gun_', 'engine_', 'grab_']
    kinds = ['noise', 'sweep', 'thump', 'click']
    for i in range(120):
        nm = f'{names[i % len(names)]}{i // len(names) + 1:02d}.wav'
        dur = 0.3 + (i * 7919 % 100) / 40
        synth_sfx(nm, 31337 + i, kinds[i % len(kinds)], dur)
    print(f'\n[gen] 完成 {time.time() - t0:.0f}s')
    report()


if __name__ == '__main__':
    main()
