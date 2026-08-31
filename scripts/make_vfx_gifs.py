#!/usr/bin/env python3
"""记忆时空 · 动效预览渲染器 v3
- 逻辑画布 480x270（放大 2 倍 → 960x540），细节比 v2 再高一个档
- GIF：20ms/帧 = 50fps（浏览器上限）；MP4：120fps
- 所有坐标按 U=1.5 从 320x180 基准缩放
"""
import os, math, random, subprocess, tempfile
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

random.seed(7)

LW, LH = 480, 270
SCALE = 2
U = LW / 320.0          # 坐标缩放系数 = 1.5
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docs', 'vfx')
os.makedirs(OUT, exist_ok=True)

def q(v):
    """320 基准坐标 → 当前画布坐标"""
    return int(round(v * U))

# ---------- 调色板 ----------
BG      = (21, 17, 11)
GRID    = (30, 26, 20)
OUTL    = (26, 20, 12)
WOOD    = (122, 90, 50)
WOOD_D  = (85, 60, 34)
STRAW   = (216, 192, 122)
STRAW_M = (201, 169, 95)
STRAW_D = (154, 127, 66)
HAT     = (185, 138, 62)
HAT_D   = (125, 90, 38)
REDBAND = (178, 60, 50)
INK     = (24, 20, 14)
WHITE   = (255, 255, 255)
CREAM   = (238, 230, 210)
YELLOW  = (255, 211, 77)
RED     = (195, 60, 60)
BLUE    = (120, 180, 220)
GOLD    = (215, 198, 138)

FONT = None
for p in ["/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf",
          "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
    if os.path.exists(p):
        FONT = ImageFont.truetype(p, q(15))
        break
if FONT is None:
    FONT = ImageFont.load_default()

def mix(c, a):
    return tuple(int(c[i] * a + BG[i] * (1 - a)) for i in range(3))

def draw_num(d, x, y, txt, color, alpha=1.0):
    c = mix(color, alpha)
    for ox in (-q(1), q(1)):
        for oy in (-q(1), q(1)):
            d.text((x + ox, y + oy), txt, font=FONT, fill=INK)
    d.text((x, y), txt, font=FONT, fill=c)

# ================= 训练木人（清晰人形） =================
def draw_dummy(im, cx, cy, tilt=0.0, flash=0.0):
    d = ImageDraw.Draw(im)
    t = int(round(tilt))
    f = flash
    d.ellipse([cx - q(18), cy - q(3), cx + q(18), cy + q(1)], fill=(8, 7, 5))
    # 底座
    d.rectangle([cx - q(9), cy - q(4), cx + q(9), cy], fill=WOOD_D, outline=OUTL)
    # 主木桩
    d.rectangle([cx - q(4), cy - q(96), cx + q(4), cy - q(4)], fill=WOOD, outline=OUTL)
    d.rectangle([cx - q(5), cy - q(96), cx - q(4), cy - q(4)], fill=WOOD_D)
    # 双腿
    lg = WOOD_D if f < 0.5 else CREAM
    d.line([cx - q(3), cy - q(30), cx - q(7), cy - q(6)], fill=lg, width=q(3))
    d.line([cx + q(3), cy - q(30), cx + q(7), cy - q(6)], fill=lg, width=q(3))
    # 脚（草团）
    fc = STRAW_D if f < 0.5 else WHITE
    d.rectangle([cx - q(11), cy - q(7), cx - q(3), cy - q(4)], fill=fc)
    d.rectangle([cx + q(3), cy - q(7), cx + q(11), cy - q(4)], fill=fc)
    # 躯干（后仰）
    bx = cx + t
    tc = STRAW if f < 0.5 else WHITE
    tm = STRAW_M if f < 0.5 else CREAM
    td = STRAW_D if f < 0.5 else CREAM
    d.rectangle([bx - q(10), cy - q(58), bx + q(10), cy - q(30)], fill=tc, outline=OUTL)
    d.rectangle([bx - q(8), cy - q(52), bx + q(8), cy - q(50)], fill=tm)
    d.rectangle([bx - q(8), cy - q(44), bx + q(8), cy - q(42)], fill=tm)
    # 胸口"人"字
    d.line([bx - q(3), cy - q(56), bx, cy - q(51)], fill=td, width=1)
    d.line([bx + q(3), cy - q(56), bx, cy - q(51)], fill=td, width=1)
    d.line([bx - q(4), cy - q(47), bx + q(4), cy - q(47)], fill=td, width=1)
    # 双臂
    arm = WOOD if f < 0.5 else WHITE
    d.line([bx - q(16), cy - q(50), bx - q(9), cy - q(50)], fill=arm, width=q(4))
    d.line([bx + q(9), cy - q(50), bx + q(16), cy - q(50)], fill=arm, width=q(4))
    # 手
    hc = STRAW_D if f < 0.5 else WHITE
    d.rectangle([bx - q(19), cy - q(52), bx - q(15), cy - q(48)], fill=hc)
    d.rectangle([bx + q(15), cy - q(52), bx + q(19), cy - q(48)], fill=hc)
    # 头 + 斗笠
    hx = bx
    hy = cy - q(74)
    hd = STRAW if f < 0.5 else WHITE
    d.rectangle([hx - q(7), hy - q(8), hx + q(7), hy + q(4)], fill=hd, outline=OUTL)
    d.rectangle([hx - q(7), hy - q(4), hx + q(7), hy - q(2)], fill=REDBAND if f < 0.5 else CREAM)
    d.rectangle([hx - q(4), hy + q(1), hx - q(2), hy + q(3)], fill=INK if f < 0.5 else CREAM)
    d.rectangle([hx + q(2), hy + q(1), hx + q(4), hy + q(3)], fill=INK if f < 0.5 else CREAM)
    hp = HAT if f < 0.5 else WHITE
    hp_d = HAT_D if f < 0.5 else CREAM
    d.rectangle([hx - q(10), hy - q(11), hx + q(10), hy - q(9)], fill=hp_d)
    d.polygon([(hx - q(8), hy - q(10)), (hx + q(8), hy - q(10)), (hx, hy - q(20))],
              fill=hp, outline=OUTL)
    d.line([(hx - q(4), hy - q(13)), (hx, hy - q(19))], fill=hp_d)
    d.line([(hx + q(4), hy - q(13)), (hx, hy - q(19))], fill=hp_d)

def draw_slash(im, cx, cy, t, dur_ms, heavy):
    p = min(1.0, t / dur_ms)
    if p >= 1.0:
        return
    a = max(0.0, 1.0 - p * 1.05)
    c = mix(YELLOW if heavy else WHITE, a)
    d = ImageDraw.Draw(im)
    sx = cx - q(34) - int(p * q(14))
    sy = cy - q(62)
    d.rectangle([sx, sy, sx + q(10), sy + q(3)], fill=c)
    d.rectangle([sx + q(10), sy + q(1), sx + q(16), sy + q(4)], fill=c)
    d.rectangle([sx + q(2), sy + q(4), sx + q(8), sy + q(7)], fill=c)
    if heavy:
        d.rectangle([sx - q(6), sy - q(4), sx + q(2), sy + q(9)], fill=mix(YELLOW, a * 0.7))
        d.rectangle([sx + q(12), sy - q(3), sx + q(20), sy + q(2)], fill=mix(YELLOW, a * 0.6))

def base_scene():
    im = Image.new('RGB', (LW, LH), BG)
    d = ImageDraw.Draw(im)
    for x in range(0, LW, q(12)):
        d.line([(x, 0), (x, LH)], fill=GRID)
    for y in range(0, LH, q(12)):
        d.line([(0, y), (LW, y)], fill=GRID)
    # 地面
    d.rectangle([q(8), q(118), LW - q(9), LH - q(9)], fill=(26, 22, 15))
    for x in range(q(16), LW - q(8), q(12)):
        d.line([(x, q(118)), (x, LH - q(9))], fill=GRID)
    for y in range(q(124), LH - q(9), q(12)):
        d.line([(q(8), y), (LW - q(9), y)], fill=GRID)
    return im

# ================= 战斗演示 =================
def combat_frames(fps, seconds=3.6):
    dt = 1000.0 / fps
    frames = []
    cx0, cy = q(214), q(148)
    cx = float(cx0); cx_d = 0.0
    tilt = 0.0
    flash = 0.0
    slashes = []
    parts = []
    nums = []
    shake_t = 0.0; shake_mag = 0.0
    freeze = 0.0
    attacks_ms = [(150, False, 60), (870, False, 60), (1590, False, 60), (2310, True, 130)]
    N = int(seconds * fps)
    for f in range(N):
        t = f * dt
        for (at, heavy, stopms) in attacks_ms:
            if abs(t - at) < dt / 2 + 0.01:
                slashes.append([0.0, 140.0 if heavy else 110.0, heavy])
                if heavy:
                    cx_d = -q(12); tilt = -q(4); shake_mag = q(3); shake_t = 200.0
                    parts += [[cx + random.uniform(-q(6), q(6)), cy - q(40) + random.uniform(0, q(6)),
                               random.uniform(-q(60), q(60)), random.uniform(-q(90), -q(50)),
                               0.0, 500.0 + random.uniform(0, 200),
                               [CREAM, STRAW_M, GOLD, WOOD][i % 4]] for i in range(12)]
                    nums.append([cx + random.uniform(-q(4), q(4)), cy - q(78), 0.0, 900.0,
                                 26 + random.randint(0, 8), True, YELLOW])
                else:
                    cx_d = -q(5); tilt = -q(2); shake_mag = q(1.6); shake_t = 160.0
                    parts += [[cx + random.uniform(-q(4), q(4)), cy - q(36) + random.uniform(0, q(4)),
                               random.uniform(-q(50), q(50)), random.uniform(-q(70), -q(40)),
                               0.0, 400.0 + random.uniform(0, 150),
                               [CREAM, STRAW_M, GOLD, WOOD][i % 4]] for i in range(5)]
                    crit = random.random() < 0.2
                    nums.append([cx + random.uniform(-q(4), q(4)), cy - q(78), 0.0, 750.0,
                                 10 + random.randint(0, 12), crit,
                                 YELLOW if crit else WHITE])
                flash = 90.0 if heavy else 50.0
                freeze = float(stopms)
        if freeze > 0:
            freeze -= dt
        else:
            flash = max(0.0, flash - dt)
            if shake_t > 0:
                shake_t -= dt
                if shake_t <= 0:
                    shake_mag = 0.0
            cx_d *= 0.86
            cx = cx0 + cx_d
            tilt *= 0.86
            for s in slashes:
                s[0] += dt
            slashes = [s for s in slashes if s[0] < s[1]]
            for p in parts:
                p[4] += dt
                p[0] += p[2] * dt / 1000.0
                p[1] += p[3] * dt / 1000.0
                p[3] += 260.0 * dt / 1000.0
            parts = [p for p in parts if p[4] < p[5]]
            for n in nums:
                n[2] += dt
            nums = [n for n in nums if n[2] < n[3]]
        im = base_scene()
        d = ImageDraw.Draw(im)
        draw_dummy(im, cx, cy, tilt=tilt, flash=1.0 if flash > 0 else 0.0)
        for s in slashes:
            draw_slash(im, cx, cy, s[0], s[1], s[2])
        for p in parts:
            pn = p[4] / p[5]
            a = max(0.0, 1.0 - pn)
            c = mix(p[6], a)
            sz = q(1) if int(p[4] / 60) % 3 else q(2)
            d.rectangle([p[0], p[1], p[0] + sz, p[1] + sz], fill=c)
        for n in nums:
            pn = n[2] / n[3]
            bounce = abs(math.sin(n[2] / 1000.0 * math.pi * 7.2)) * -q(9) * (1.0 - pn * 0.5)
            rise = -q(30) * (n[2] / 1000.0)
            alpha = max(0.0, 1.0 - max(0.0, pn - 0.6) * 2.5)
            draw_num(d, n[0], n[1] + rise + bounce, str(n[4]), n[6], alpha)
        if shake_t > 0:
            ox = int(random.uniform(-1, 1) * shake_mag)
            oy = int(random.uniform(-1, 1) * shake_mag)
            pad = q(6)
            im2 = Image.new('RGB', (LW + pad * 2, LH + pad * 2), BG)
            im2.paste(im, (pad + ox, pad + oy))
            im = im2.crop((pad, pad, pad + LW, pad + LH))
        frames.append(im)
    return frames

# ================= 故障波纹 =================
def glitch_frames(fps):
    base = base_scene()
    draw_dummy(base, q(214), q(148))
    base = base.convert('RGB')
    N = int(0.8 * fps)
    frames = []
    for f in range(N):
        k = math.sin(f / (N - 1) * math.pi)
        im = Image.new('RGB', (LW, LH), BG)
        band = q(6)
        for y in range(0, LH, band):
            off = int(random.uniform(-1, 1) * q(5) * k)
            src = base.crop((0, y, LW, min(LH, y + band)))
            im.paste(src, (off, y))
            if random.random() < 0.3 * k:
                ov = Image.new('RGBA', (LW, LH), (0, 0, 0, 0))
                od = ImageDraw.Draw(ov)
                c = RED if random.random() < 0.5 else BLUE
                od.rectangle([max(0, off), y, min(LW, off + band), min(LH, y + band)], fill=c + (60,))
                im = Image.alpha_composite(im.convert('RGBA'), ov).convert('RGB')
        d = ImageDraw.Draw(im)
        if random.random() < 0.6 * k:
            x, y = random.randint(0, LW - 1), random.randint(0, LH - 1)
            d.rectangle([x, y, min(LW, x + random.randint(q(6), q(60))), y + 1], fill=RED)
        if random.random() < 0.6 * k:
            x, y = random.randint(0, LW - 1), random.randint(0, LH - 1)
            d.rectangle([x, y, min(LW, x + random.randint(q(6), q(60))), y + 1], fill=BLUE)
        frames.append(im)
    return frames

# ================= 边界崩解 =================
def edge_frames(fps):
    frags = []
    N = int(2.4 * fps)
    frames = []
    for f in range(N):
        im = base_scene()
        d = ImageDraw.Draw(im)
        d.rectangle([2, 2, LW - 3, 6], fill=(52, 45, 34))
        d.rectangle([2, LH - 7, LW - 3, LH - 3], fill=(52, 45, 34))
        d.rectangle([2, 2, 6, LH - 3], fill=(52, 45, 34))
        d.rectangle([LW - 7, 2, LW - 3, LH - 3], fill=(52, 45, 34))
        if len(frags) < 70:
            side = random.randint(0, 3)
            if side == 0:
                x, y = random.randint(4, LW - 4), random.randint(0, 3)
            elif side == 1:
                x, y = random.randint(4, LW - 4), random.randint(LH - 4, LH - 1)
            elif side == 2:
                x, y = random.randint(0, 3), random.randint(4, LH - 4)
            else:
                x, y = random.randint(LW - 4, LW - 1), random.randint(4, LH - 4)
            vx = (0.4 if side != 2 else -0.4) + random.uniform(-0.2, 0.2)
            vy = random.uniform(0.15, 0.6)
            c = random.choice([(52, 45, 34), (26, 22, 15), RED, CREAM])
            frags.append([float(x), float(y), vx, vy, 0.0, random.uniform(500, 1100), c])
        for fr in list(frags):
            fr[4] += 1000.0 / fps
            fr[0] += fr[2] * (1000.0 / fps) / 16.7
            fr[1] += fr[3] * (1000.0 / fps) / 16.7
            if fr[4] >= fr[5]:
                frags.remove(fr)
                continue
            a = max(0.0, 1.0 - fr[4] / fr[5])
            c = mix(fr[6], a)
            d.rectangle([fr[0], fr[1], fr[0] + q(1), fr[1] + q(1)], fill=c)
        for _ in range(8):
            x = random.choice([random.randint(0, 3), random.randint(LW - 4, LW - 1)])
            y = random.randint(0, LH - 1)
            d.rectangle([x, y, x, y], fill=random.choice([RED, CREAM, WHITE]))
        frames.append(im)
    return frames

# ================= 数据裂缝 =================
def crack_frames(fps):
    N = int(2.4 * fps)
    frames = []
    for f in range(N):
        im = Image.new('RGB', (LW, LH), (30, 26, 20))
        d = ImageDraw.Draw(im)
        for x in range(0, LW, q(12)):
            d.line([(x, 0), (x, LH)], fill=(24, 21, 16))
        for y in range(0, LH, q(12)):
            d.line([(0, y), (LW, y)], fill=(24, 21, 16))
        pulse = (math.sin(f / N * math.pi * 2) + 1) / 2
        segs = [(q(124), q(36)), (q(136), q(56)), (q(128), q(76)),
                (q(144), q(96)), (q(136), q(116)), (q(152), q(136))]
        for i in range(len(segs) - 1):
            x0, y0 = segs[i]; x1, y1 = segs[i + 1]
            wd = 1 + int(pulse * q(4))
            c = mix((150, 178, 200), 0.45 + pulse * 0.55)
            d.line([(x0, y0), (x1, y1)], fill=c, width=wd)
        d.line([(q(136), q(56)), (q(116), q(50))], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        d.line([(q(128), q(76)), (q(160), q(72))], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        d.line([(q(136), q(116)), (q(112), q(124))], fill=mix((120, 140, 160), 0.3 + pulse * 0.5), width=1)
        if random.random() < 0.25 + pulse * 0.4:
            for _ in range(10):
                x = random.randint(q(100), q(168)); y = random.randint(q(24), q(148))
                d.rectangle([x, y, x, y], fill=random.choice([RED, WHITE, CREAM]))
        for _ in range(4):
            if random.random() < pulse:
                x = random.randint(q(108), q(164)); y = random.randint(q(28), q(144))
                d.rectangle([x, y, x + q(1), y + q(1)], fill=GOLD)
        frames.append(im)
    return frames

# ================= 导出 =================
def export(frames_mp4, name, fps_gif=50, fps_mp4=120):
    big = [f.resize((LW * SCALE, LH * SCALE), Image.NEAREST) for f in frames_mp4]
    ratio = fps_mp4 / fps_gif
    with tempfile.TemporaryDirectory() as td:
        gif_sel = []
        seen = set()
        for i in range(len(big)):
            j = int(round(i / ratio))
            if j not in seen:
                seen.add(j)
                gif_sel.append(i)
        gif_pngs = []
        for k, i in enumerate(gif_sel):
            p = os.path.join(td, "g%05d.png" % k)
            big[i].save(p)
            gif_pngs.append(p)
        gif_path = os.path.join(OUT, name + ".gif")
        subprocess.run(["convert", "-delay", "2", "-dispose", "background", "-loop", "0"]
                       + gif_pngs + [gif_path], check=True)
        print("saved", gif_path, len(gif_pngs), "frames @50fps")
        mp4_pngs = []
        for i, im in enumerate(big):
            p = os.path.join(td, "m%05d.png" % i)
            im.save(p)
            mp4_pngs.append(p)
        mp4_path = os.path.join(OUT, name + ".mp4")
        ff = imageio_ffmpeg.get_ffmpeg_exe()
        subprocess.run([ff, "-y", "-framerate", str(fps_mp4), "-i",
                        os.path.join(td, "m%05d.png"),
                        "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-crf", "18", "-movflags", "+faststart", mp4_path],
                       check=True, capture_output=True)
        print("saved", mp4_path, len(mp4_pngs), "frames @%dfps" % fps_mp4)

if __name__ == '__main__':
    export(combat_frames(120), "打击五件套")
    export(glitch_frames(120), "故障波纹")
    export(edge_frames(120), "边界崩解")
    export(crack_frames(120), "数据裂缝")
    print("done")
