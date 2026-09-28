"""
make_zips.py — 生成下载页用的分发包（tuner/download/dist/）

产出：
  dist/jingtiao-pwa-<ver>.zip       仅运行 PWA 所需文件（丢到任意静态 HTTPS 托管即可）
  dist/jingtiao-full-<ver>.zip      完整工程：PWA + 测试 + 已配置好的 Android 打包工程
  dist/manifest.json                两个包的尺寸与 sha256（下载页读取展示）

排除：node_modules / www / 构建产物 / .git / 缓存 / 本 dist 目录自身。

运行：python3 tuner/download/make_zips.py
"""
from __future__ import annotations

import hashlib
import json
import os
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
TUNER = os.path.abspath(os.path.join(HERE, '..'))
DIST = os.path.join(HERE, 'dist')
VERSION = '1.0.0'

EXCLUDE_DIRS = {
    'node_modules', 'www', 'dist', '.git', '__pycache__', '.gradle', '.idea',
    'build', '.pytest_cache', '.mypy_cache',
}
EXCLUDE_FILES = {'local.properties', '.DS_Store'}
EXCLUDE_EXT = {'.apk', '.aab', '.pyc', '.iml', '.keystore', '.jks'}

RUNTIME = [
    'index.html', 'manifest.webmanifest', 'sw.js', 'README.md',
    'css/style.css',
    'js/app.js', 'js/audio.js', 'js/tone.js', 'js/meter.js', 'js/store.js',
    'js/music.js', 'js/fft.js',
    'js/pitch/detector.js', 'js/pitch/yin.js', 'js/pitch/harmonic.js', 'js/pitch/filter.js',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png',
]


def walk(rel_root):
    for root, dirs, files in os.walk(os.path.join(TUNER, rel_root)):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in sorted(files):
            if name in EXCLUDE_FILES:
                continue
            if os.path.splitext(name)[1] in EXCLUDE_EXT:
                continue
            full = os.path.join(root, name)
            yield os.path.relpath(full, TUNER)


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def build():
    os.makedirs(DIST, exist_ok=True)
    out = []

    # ① 纯 PWA 包
    p = os.path.join(DIST, f'jingtiao-pwa-{VERSION}.zip')
    with zipfile.ZipFile(p, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in RUNTIME:
            z.write(os.path.join(TUNER, rel), f'jingtiao-pwa/{rel}')
    out.append(p)

    # ② 完整工程包
    p = os.path.join(DIST, f'jingtiao-full-{VERSION}.zip')
    with zipfile.ZipFile(p, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in walk(''):
            z.write(os.path.join(TUNER, rel), f'jingtiao/{rel}')
    out.append(p)

    manifest = {
        'version': VERSION,
        'packages': [
            {
                'file': os.path.basename(p),
                'href': f'./dist/{os.path.basename(p)}',
                'bytes': os.path.getsize(p),
                'sha256': sha256(p),
            } for p in out
        ],
    }
    with open(os.path.join(DIST, 'manifest.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    for pkg in manifest['packages']:
        print(f"  ✓ {pkg['file']}  {pkg['bytes']/1024:.0f} KB  sha256={pkg['sha256'][:16]}…")


if __name__ == '__main__':
    build()
