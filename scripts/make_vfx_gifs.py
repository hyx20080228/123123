#!/usr/bin/env python3
"""记忆时空 · 打击感动效 GIF 渲染器
生成：打击五件套 / 故障波纹 / 边界崩解 / 数据裂缝 四个演示 GIF
逻辑画布 160x90，NEAREST 放大 6 倍 → 960x540
"""
import os, math, random
from PIL import Image, ImageDraw, ImageFont

random.seed(7)

W, H = 160, 90
SCALE = 6
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'vfx')
os.makedirs(OUT, exist_ok=True)

BG      = (21, 17, 11)
GRID    = (43, 39, 30)
INK     = (141, 136, 120)
WOOD_D  = (107, 76, 47)
WOOD_L  = (138, 98, 56)
STRAW   = (200, 163, 90)
STRAW_D = (168, 131, 74)
HEAD    = (215, 198, 138)
BASE    = (58, 52, 40)
WHITE   = (255, 255, 255)
YELLOW  = (255, 211, 77)
RED     = (195, 60, 60)
BLUE    = (120, 180, 220)
CREAM   = (232, 226, 210)
GOLD    = (215, 198, 138)

FONT = None
for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
    if os.path.exists(p):
        FONT = ImageFont.truetype(p, 8)
        break
if FONT is None:
    FONT = ImageFont.load_default()

def mix(c, a):
    return tuple(int(c[i] * a + BG[i] * (1 - a)) for i in range(3))

def draw_num(d, x, y, txt, color, alpha=1.0):
    c = mix(color, alpha)
    for ox in (-1, 1):
        for oy in (-1, 1):
            d.text((x + ox, y + oy), txt, font=FONT, fill=(0, 0, 0))
    d.text((x, y), txt, font=FONT, fill=c)

def save(frames, name, ms=33):
    import subprocess, tempfile
    ims = [f.resize((W * SCALE, H * SCALE), Image.NEAREST) for f in frames]
    path = os.path.join(OUT, name)
    with tempfile.TemporaryDirectory() as td:
        pngs = []
        for i, im in enumerate(ims):
            p = os.path.join(td, "f%04d.png" % i)
            im.save(p)
            pngs.append(p)
        delay = "%d" % ms
        subprocess.run(["convert", "-delay", delay, "-dispose", "background",
                        "-loop", "0"] + pngs + [path], check=True)
    print("saved", path, len(ims), "frames")

# ================= 场景：训练木桩 =================
def base_scene():
    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)
    for x in range(0, W, 6):
        d.line([(x, 0), (x, H)], fill=GRID)
    for y in range(0, H, 6):
        d.line([(0, y), (W, y)], fill=GRID)
    return im

def draw_dummy(im, dx, dy, flash=False):
    d = ImageDraw.Draw(im)
    dx, dy = int(dx), int(dy)
    # 地面阴影
    d.rectangle([dx - 9, dy + 9, dx + 9, dy + 11], fill=(8, 7, 5))
    # 底座
    d.rectangle([dx - 5, dy + 10, dx + 5, dy + 11], fill=BASE)
    # 柱子
    d.rectangle([dx - 1, dy - 12, dx + 2, dy + 10], fill=WOOD_D if not flash else WHITE)
    d.rectangle([dx - 2, dy - 12, dx - 1, dy + 10], fill=WOOD_L if not flash else CREAM)
    # 身体草人
    d.rectangle([dx - 4, dy - 10, dx + 4, dy - 3], fill=STRAW if not flash else WHITE)
    d.rectangle([dx - 3, dy - 9, dx + 3, dy - 6], fill=STRAW_D if not flash else CREAM)
    # 头
    d.rectangle([dx - 2, dy - 16, dx + 2, dy - 12], fill=HEAD if not flash else WHITE)
    d.rectangle([dx - 1, dy - 15, dx, dy - 14], fill=INK)
    d.rectangle([dx + 1, dy - 15, dx + 2, dy - 14], fill=INK)

def draw_slash(im, dx, dy, p, heavy):
    if p >= 1:
        return
    a = max(0.0, 1.0 - p * 1.1)
    c = mix(YELLOW if heavy else WHITE, a)
    d = ImageDraw.Draw(im)
    sx = dx - 11 - int(p * 5)
    d.rectangle([sx, dy - 13, sx + 4, dy - 12], fill=c)
    d.rectangle([sx + 4, dy - 14, sx + 7, dy - 11], fill=c)
    d.rectangle([sx - 1, dy - 11, sx + 1, dy - 10], fill=c)

# ================= GIF 1：打击五件套 =================
def gif_combat():
    frames = []
    dx0, dy0 = 106, 70
    dy = dy0
    dx = dx0; dxkb = 0
    flash_t = 0
    slashes = []          # (t, dur, heavy)
    parts = []            # (x,y,vx,vy,t,life,color)
    nums = []             # (x,y,vx,vy,t,life,dmg,crit,color)
    shake_t = 0; shake_mag = 0
    freeze_until = 0
    attacks = [(10, False, 60), (34, False, 60), (58, False, 60), (82, True, 130)]
    N = 96
    for f in range(N):
        im = base_scene()
        t = f * 33.33
        # 攻击触发
        for (af, heavy, stopms) in attacks:
            if f == af:
                slashes.append([0, 190 if heavy else 120, heavy])
                if heavy:
                    dxkb = -9; shake_mag = 3; shake_t = 6
                    parts += [[dx + random.randint(-3, 3), dy - 10 + random.randint(0, 3),
                               random.uniform(-20, 20), random.uniform(-26, -14), 0, 26,
                               [CREAM, INK, GOLD, WOOD_L][i % 4]] for i in range(10)]
                    dmg = 26 + random.randint(0, 8)
                    nums.append([dx + random.randint(-3, 3), dy - 17, 0, -3.4, 0, 30, dmg, True, YELLOW])
                else:
                    dxkb = -3; shake_mag = 1.5; shake_t = 4
                    parts += [[dx + random.randint(-3, 3), dy - 9 + random.randint(0, 2),
                               random.uniform(-18, 18), random.uniform(-22, -10), 0, 18,
                               [CREAM, INK, GOLD, WOOD_L][i % 4]] for i in range(4)]
                    dmg = 10 + random.randint(0, 12)
                    crit = random.random() < 0.2
                    nums.append([dx + random.randint(-3, 3), dy - 17, 0, -3.2, 0, 28, dmg, crit,
                                 YELLOW if crit else WHITE])
                flash_t = 3 if heavy else 2
                freeze_until = t + stopms
        frozen = t < freeze_until
        if not frozen:
            flash_t = max(0, flash_t - 1)
            shake_t = max(0, shake_t - 1)
            if shake_t == 0:
                shake_mag = 0
            dxkb *= 0.35
            dx = dx0 + dxkb
            for s in slashes:
                s[0] += 33.33
            slashes = [s for s in slashes if s[0] < s[1]]
            for p in parts:
                p[4] += 1; p[0] += p[2] / 30; p[1] += p[3] / 30; p[3] += 8
            parts = [p for p in parts if p[4] < p[5]]
            for n in nums:
                n[4] += 1; n[1] += n[3] / 30; n[3] += 7
            nums = [n for n in nums if n[4] < n[5]]
        # 绘制
        draw_dummy(im, dx, dy, flash=flash_t > 0)
        for s in slashes:
            draw_slash(im, dx, dy, s[0] / s[1], s[2])
        d = ImageDraw.Draw(im)
        for p in parts:
            a = max(0.0, 1.0 - p[4] / p[5])
            c = mix(p[6], a)
            sz = 1 if p[4] % 3 else 2
            d.rectangle([p[0], p[1], p[0] + sz, p[1] + sz], fill=c)
        for n in nums:
            p = n[4] / n[5]
            bounce = abs(math.sin(p * math.pi * 2.4)) * -4
            a = max(0.0, 1.0 - max(0.0, p - 0.6) * 2.5)
            draw_num(d, n[0], n[1] + bounce, str(n[6]), n[8], a)
        # 震屏（在加边画布上偏移，再裁回标准尺寸）
        if shake_t > 0:
            ox = random.randint(-1, 1) * (1 if shake_mag <= 1.5 else 2)
            oy = random.randint(-1, 1) * (1 if shake_mag <= 1.5 else 2)
            pad = 6
            im2 = Image.new('RGB', (W + pad * 2, H + pad * 2), BG)
            im2.paste(im, (pad + ox, pad + oy))
            im = im2.crop((pad, pad, pad + W, pad + H))
        frames.append(im)
    save(frames, '打击五件套.gif')

# ================= GIF 2：故障波纹 =================
def gif_glitch():
    base = base_scene()
    draw_dummy(base, 106, 70)
    base = base.convert('RGB')
    frames = []
    N = 24
    for f in range(N):
        k = math.sin(f / (N - 1) * math.pi)      # 0→1→0
        im = Image.new('RGB', (W, H), BG)
        band = 5
        for y in range(0, H, band):
            off = int((random.uniform(-1, 1)) * 6 * k)
            src = base.crop((0, y, W, min(H, y + band)))
            im.paste(src, (off, y))
            if random.random() < 0.3 * k:
                ov = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                c = RED if random.random() < 0.5 else BLUE
                od.rectangle([max(0, off), y, min(W, off + band), min(H, y + band)], fill=c + (70,))
                im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
        d = ImageDraw.Draw(im)
        if random.random() < 0.6 * k:
            x, y = random.randint(0, W - 1), random.randint(0, H - 1)
            d.rectangle([x, y, min(W, x + random.randint(4, 40)), y], fill=RED)
        if random.random() < 0.6 * k:
            x, y = random.randint(0, W - 1), random.randint(0, H - 1)
            d.rectangle([x, y, min(W, x + random.randint(4, 40)), y], fill=BLUE)
        frames.append(im)
    save(frames, '故障波纹.gif')

# ================= GIF 3：边界崩解 =================
def gif_edge():
    frags = []
    N = 60
    frames = []
    for f in range(N):
        im = base_scene()
        d = ImageDraw.Draw(im)
        # 中央房间地板（比边缘亮一点）
        d.rectangle([6, 6, W - 7, H - 7], fill=(26, 22, 15))
        for x in range(12, W - 6, 12):
            d.line([(x, 6), (x, H - 7)], fill=GRID)
        for y in range(12, H - 6, 12):
            d.line([(6, y), (W - 7, y)], fill=GRID)
        # 边界墙
        d.rectangle([2, 2, W - 3, 5], fill=(52, 45, 34))
        d.rectangle([2, H - 6, W - 3, H - 3], fill=(52, 45, 34))
        d.rectangle([2, 2, 5, H - 3], fill=(52, 45, 34))
        d.rectangle([W - 6, 2, W - 3, H - 3], fill=(52, 45, 34))
        # 持续生成的剥落碎片
        if len(frags) < 60:
            side = random.randint(0, 3)
            if side == 0:
                x, y = random.randint(4, W - 4), random.randint(0, 3)
            elif side == 1:
                x, y = random.randint(4, W - 4), random.randint(H - 4, H - 1)
            elif side == 2:
                x, y = random.randint(0, 3), random.randint(4, H - 4)
            else:
                x, y = random.randint(W - 4, W - 1), random.randint(4, H - 4)
            vx = (0.5 if side != 2 else -0.5) + random.uniform(-0.3, 0.3)
            vy = random.uniform(0.2, 0.9)
            c = random.choice([(52, 45, 34), (26, 22, 15), RED, CREAM])
            frags.append([x, y, vx, vy, 0, random.randint(20, 45), c])
        for fr in frags:
            fr[4] += 1
            fr[0] += fr[2]; fr[1] += fr[3]
            if fr[4] >= fr[5]:
                frags.remove(fr); continue
            a = max(0.0, 1.0 - fr[4] / fr[5])
            c = mix(fr[6], a)
            d.rectangle([fr[0], fr[1], fr[0] + 1, fr[1] + 1], fill=c)
        # 边界噪点闪烁
        for _ in range(8):
            x = random.choice([random.randint(0, 3), random.randint(W - 4, W - 1)])
            y = random.randint(0, H - 1)
            d.rectangle([x, y, x, y], fill=random.choice([RED, CREAM, WHITE]))
        frames.append(im)
    save(frames, '边界崩解.gif')

# ================= GIF 4：数据裂缝（隐藏房入口） =================
def gif_crack():
    frames = []
    N = 60
    for f in range(N):
        im = Image.new('RGB', (W, H), (30, 26, 20))
        d = ImageDraw.Draw(im)
        for x in range(0, W, 6):
            d.line([(x, 0), (x, H)], fill=(24, 21, 16))
        for y in range(0, H, 6):
            d.line([(0, y), (W, y)], fill=(24, 21, 16))
        # 呼吸脉冲
        pulse = (math.sin(f / N * math.pi * 2) + 1) / 2
        # 裂缝主干（锯齿）
        segs = [(62, 20), (68, 30), (64, 40), (72, 50), (68, 60), (76, 70)]
        for i in range(len(segs) - 1):
            x0, y0 = segs[i]; x1, y1 = segs[i + 1]
            wd = 1 + int(pulse * 3)
            c = mix((150, 178, 200), 0.45 + pulse * 0.55)   # 冷灰蓝 → 亮
            d.line([(x0, y0), (x1, y1)], fill=c, width=wd)
        # 支裂缝
        d.line([(68, 30), (58, 26)], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        d.line([(64, 40), (80, 38)], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        d.line([(68, 60), (56, 64)], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        # 红白噪点闪动（数据泄漏）
        if random.random() < 0.25 + pulse * 0.4:
            for _ in range(6):
                x = random.randint(50, 84); y = random.randint(14, 76)
                d.rectangle([x, y, x, y], fill=random.choice([RED, WHITE, CREAM]))
        # 火花粒子
        for _ in range(3):
            if random.random() < pulse:
                x = random.randint(54, 82); y = random.randint(16, 74)
                d.rectangle([x, y, x, y], fill=GOLD)
        frames.append(im)
    save(frames, '数据裂缝.gif')

if __name__ == '__main__':
    gif_combat()
    gif_glitch()
    gif_edge()
    gif_crack()
    print('done')
