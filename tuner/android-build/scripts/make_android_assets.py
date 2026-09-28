"""
make_android_assets.py — 用与 PWA 完全相同的图形，替换 Capacitor 模板的启动图标与闪屏

做法：不猜尺寸 —— 读取模板里每个 PNG 的实际宽高，按同尺寸重画后覆盖。
因此 Capacitor 版本升级改了密度尺寸表也不会失配。

覆盖范围：
  res/mipmap-*/ic_launcher.png           旧版启动图标（方形满铺）
  res/mipmap-*/ic_launcher_round.png     圆形启动图标
  res/mipmap-*/ic_launcher_foreground.png 自适应图标前景层（主体收进 66% 安全区）
  res/drawable*/splash.png               闪屏（横/竖/默认，按各向尺寸画）

运行：python3 scripts/make_android_assets.py   （或 npm run art）
依赖：pillow（pip3 install --break-system-packages pillow）
"""
from __future__ import annotations

import os
import sys

from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', '..', 'icons'))

from make_icons import draw_meter_art, rect_gradient  # noqa: E402

RES = os.path.join(HERE, '..', 'android', 'app', 'src', 'main', 'res')


def square_bg(size):
    return rect_gradient(size, size).convert('RGBA')


def launcher(size):
    """旧版启动图标：满铺，不带圆角（圆角由 launcher 裁）"""
    img = square_bg(size)
    draw_meter_art(img, size / 2, size / 2, size, safe=0.92)
    return img


def launcher_round(size):
    img = launcher(size)
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size, size], fill=255)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def foreground(size):
    """自适应图标前景层：系统会裁掉外圈 ~18%，主体收进 66% 安全区"""
    img = square_bg(size)
    draw_meter_art(img, size / 2, size / 2, size, safe=0.66)
    return img


def splash(w, h):
    img = rect_gradient(w, h).convert('RGBA')
    S = min(w, h) * 0.62
    draw_meter_art(img, w / 2, h * 0.46, S, safe=1.0)
    return img


def main():
    if not os.path.isdir(RES):
        print('  ✗ 还没有 android/ 工程。请先运行：npm run add:android')
        sys.exit(1)

    n = 0
    for root, _dirs, files in os.walk(RES):
        rel = os.path.relpath(root, RES)
        for name in sorted(files):
            if not name.endswith('.png'):
                continue
            p = os.path.join(root, name)
            with Image.open(p) as im:
                w, h = im.size

            if name == 'ic_launcher_round.png':
                img = launcher_round(w)
            elif name == 'ic_launcher.png':
                img = launcher(w)
            elif name == 'ic_launcher_foreground.png':
                img = foreground(w)
            elif name == 'splash.png':
                img = splash(w, h)
            else:
                continue

            img.save(p, 'PNG', optimize=True)
            n += 1
            print(f'  ✓ {rel}/{name}  {w}×{h}')

    print(f'\n  共替换 {n} 个 Android 资源图（与 PWA 图标同一套图形）')


if __name__ == '__main__':
    main()
