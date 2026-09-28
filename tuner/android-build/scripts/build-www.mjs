/**
 * build-www.mjs — 把 tuner/ 的 PWA 复制成 Capacitor 的 webDir（www/）
 *
 * 只复制运行所需文件：sw.js 不复制 —— 在原生壳里资源本就内置在 APK 中，
 * app.js 检测到 Capacitor 环境也不会注册 Service Worker（避免旧缓存）。
 *
 * 运行：npm run build   （或 node scripts/build-www.mjs）
 */

import { copyFileSync, mkdirSync, rmSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const TUNER = path.resolve(here, '..', '..');        // tuner/
const OUT = path.resolve(here, '..', 'www');         // tuner/android-build/www

/** 与 sw.js 的 ASSETS 清单保持一致（去掉 sw.js 本身） */
const FILES = [
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/app.js',
  'js/audio.js',
  'js/tone.js',
  'js/meter.js',
  'js/store.js',
  'js/music.js',
  'js/fft.js',
  'js/pitch/detector.js',
  'js/pitch/yin.js',
  'js/pitch/harmonic.js',
  'js/pitch/filter.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let bytes = 0;
for (const rel of FILES) {
  const src = path.join(TUNER, rel);
  const dst = path.join(OUT, rel);
  if (!existsSync(src)) {
    console.error(`  ✗ 缺少源文件：${rel}`);
    process.exit(1);
  }
  mkdirSync(path.dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  bytes += statSync(dst).size;
}

console.log(`  ✓ www/ 已生成：${FILES.length} 个文件，${(bytes / 1024).toFixed(0)} KB`);
console.log('    下一步：npx cap sync android');
