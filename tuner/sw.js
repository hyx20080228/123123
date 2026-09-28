/**
 * sw.js — Service Worker
 * 目标：装到桌面后完全离线可用（调音、节拍器、参考音都不需要网络）。
 * 策略：预缓存全部资源 + 运行时 stale-while-revalidate。
 */

const VERSION = 'jingtiao-v1.0.0';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/audio.js',
  './js/tone.js',
  './js/meter.js',
  './js/store.js',
  './js/music.js',
  './js/fft.js',
  './js/pitch/detector.js',
  './js/pitch/yin.js',
  './js/pitch/harmonic.js',
  './js/pitch/filter.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(VERSION)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
      .catch(err => { console.warn('预缓存失败', err); self.skipWaiting(); })
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // 不拦截跨域请求

  // stale-while-revalidate：先给缓存（离线可用），后台更新
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const network = fetch(req).then(res => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit || caches.match('./index.html'));
      return hit || network;
    })
  );
});

// 允许页面主动触发版本更新
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});
