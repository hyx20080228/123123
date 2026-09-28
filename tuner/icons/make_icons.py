"""
make_icons.py — 生成应用图标（PWA 与 Android 共用同一套图形）

运行：python3 tuner/icons/make_icons.py
输出：icon-192.png / icon-512.png / icon-maskable-512.png

图形语言与 App 内表盘一致：深色底 + 刻度尺 + 居中发光的绿色指针 +
顶部三根收敛的琴弦，一眼就能看出"这是给弦乐器调音的"。

结构上把「画布/背景」与「表盘图形」分开：
  - gradient_bg / rect_gradient  负责底色
  - draw_meter_art               只画图形，可画到任意尺寸的画布上
这样 android-build/scripts/make_android_assets.py 能把同一套图形
按 Android 各密度尺寸（启动图标、自适应图标前景层、闪屏）复用，
不会出现"网页图标和 APK 图标长得不一样"的问题。
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))

BG_TOP = (24, 34, 50)
BG_BOTTOM = (9, 12, 18)
GREEN = (52, 214, 127)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def rect_gradient(w, h, top=BG_TOP, bottom=BG_BOTTOM):
    """竖直渐变底色（非方形画布也可用）"""
    img = Image.new('RGB', (w, h))
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = lerp(top, bottom, t ** 0.85)
        for x in range(w):
            px[x, y] = c
    return img


def gradient_bg(size, top=BG_TOP, bottom=BG_BOTTOM):
    return rect_gradient(size, size, top, bottom)


def radial_glow(w, h, cx, cy, radius, color, alpha):
    """在透明层上画一个柔和光晕"""
    layer = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(layer)
    d.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=alpha)
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.55))
    rgb = Image.new('RGB', (w, h), color)
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    out.paste(rgb, (0, 0), layer)
    return out


def draw_meter_art(img, cx, cy, S, safe=1.0):
    """
    把表盘图形画到已有的 RGBA 画布 img 上。
    cx, cy：表盘中心；S：设计基准尺寸（决定线宽等比例）；
    safe：主体缩放（Android 自适应图标前景层用 0.66 收进安全区）。
    """
    d = ImageDraw.Draw(img)

    # 背景光晕
    img.alpha_composite(radial_glow(img.width, img.height, cx, cy - S * 0.09,
                                    S * 0.46 * safe, (52, 120, 210), 96))
    d = ImageDraw.Draw(img)

    # 刻度盘几何
    axis_y = cy + S * 0.10 * safe
    half_w = S * 0.34 * safe
    tick_h = S * 0.055 * safe

    # 中央合格区（绿）
    zone_w = half_w * 0.16
    zr = S * 0.028 * safe
    d.rounded_rectangle(
        [cx - zone_w, axis_y - tick_h * 1.7, cx + zone_w, axis_y + tick_h * 1.7],
        radius=zr, fill=(GREEN[0], GREEN[1], GREEN[2], 38),
        outline=(GREEN[0], GREEN[1], GREEN[2], 190),
        width=max(1, int(S * 0.006)))

    # 刻度
    for i in range(-5, 6):
        t = i / 5.0
        x = cx + t * half_w
        major = (i % 5 == 0) or (i == 0)
        h = tick_h * (1.35 if major else 0.75)
        col = (190, 205, 225, 225) if major else (120, 138, 162, 190)
        w = max(1, int(S * (0.011 if major else 0.007)))
        d.line([x, axis_y - tick_h * 1.7 - h, x, axis_y - tick_h * 1.7], fill=col, width=w)
        d.line([x, axis_y + tick_h * 1.7, x, axis_y + tick_h * 1.7 + h], fill=col, width=w)

    # 指针（居中，绿色发光）—— 表示"已调准"
    needle_layer = Image.new('RGBA', (img.width, img.height), (0, 0, 0, 0))
    nd = ImageDraw.Draw(needle_layer)
    nw = S * 0.026 * safe
    top = axis_y - tick_h * 1.7 - tick_h * 2.5
    bot = axis_y + tick_h * 1.7 + tick_h * 2.5
    nd.rounded_rectangle([cx - nw, top, cx + nw, bot], radius=nw,
                         fill=(GREEN[0], GREEN[1], GREEN[2], 255))
    tri = S * 0.055 * safe
    nd.polygon([(cx, top + tri * 0.2), (cx - tri, top - tri * 0.75), (cx + tri, top - tri * 0.75)],
               fill=(GREEN[0], GREEN[1], GREEN[2], 255))
    nd.polygon([(cx, bot - tri * 0.2), (cx - tri, bot + tri * 0.75), (cx + tri, bot + tri * 0.75)],
               fill=(GREEN[0], GREEN[1], GREEN[2], 255))

    glow = needle_layer.filter(ImageFilter.GaussianBlur(S * 0.022))
    img.alpha_composite(glow)
    img.alpha_composite(glow)
    img.alpha_composite(needle_layer)

    d = ImageDraw.Draw(img)
    r = S * 0.020 * safe
    d.ellipse([cx - r, axis_y - r, cx + r, axis_y + r], fill=(9, 12, 18, 255),
              outline=(GREEN[0], GREEN[1], GREEN[2], 255), width=max(1, int(S * 0.008)))

    # 顶部：三根水平琴弦，中间一根正在振动（弓形）——"被调的那根弦"
    sx0, sx1 = cx - S * 0.33 * safe, cx + S * 0.33 * safe
    steps = 48
    for k, y_off in enumerate((-0.315, -0.255, -0.195)):
        y = cy + S * y_off * safe
        vibrating = (k == 1)
        col = (205, 226, 250, 230) if vibrating else (140, 168, 200, 150)
        wdt = max(1, int(S * (0.011 if vibrating else 0.008)))
        amp = S * 0.022 * safe if vibrating else 0.0
        pts = []
        for i in range(steps + 1):
            t = i / steps
            x = sx0 + (sx1 - sx0) * t
            yy = y + math.sin(math.pi * t) * amp
            pts.append((x, yy))
        if vibrating:
            # 振动残影：上下两条更淡的包络
            for sgn, alpha in ((1, 70), (-1, 70)):
                env = [(x, y + sgn * math.sin(math.pi * ((x - sx0) / (sx1 - sx0))) * amp * 1.35)
                       for x, _ in pts]
                d.line(env, fill=(205, 226, 250, alpha), width=max(1, wdt - 1), joint='curve')
        d.line(pts, fill=col, width=wdt, joint='curve')
        # 两端弦枕/弦桥的点
        pr = S * 0.011 * safe
        for xe in (sx0, sx1):
            d.ellipse([xe - pr, y - pr, xe + pr, y + pr], fill=(78, 168, 255, 235))

    return img


def draw_meter(size, safe=1.0, maskable=False):
    """方形图标：渐变底 + 表盘；maskable=False 时做圆角裁切"""
    S = size
    img = gradient_bg(S).convert('RGBA')
    draw_meter_art(img, S / 2, S / 2, S, safe=safe)

    if not maskable:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=S * 0.225, fill=255)
        out = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        out.paste(img, (0, 0), mask)
        return out
    return img


def main():
    specs = [
        ('icon-192.png', 192, 1.0, False),
        ('icon-512.png', 512, 1.0, False),
        ('icon-maskable-512.png', 512, 0.66, True),
        ('icon-1024.png', 1024, 1.0, False),
    ]
    for name, size, safe, maskable in specs:
        img = draw_meter(size, safe=safe, maskable=maskable)
        path = os.path.join(OUT, name)
        img.save(path, 'PNG', optimize=True)
        print(f'  ✓ {name}  {size}×{size}  {"maskable" if maskable else "any"}')


if __name__ == '__main__':
    main()
