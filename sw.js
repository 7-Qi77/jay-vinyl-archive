/* 静态站点离线壳：只缓存同源静态资源，音频与 iTunes 接口保持网络直连。 */
const VERSION = 'jc-vinyl-v1-20261124';
const CORE_CACHE = `${VERSION}-core`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/audio.js',
  './js/scene.js',
  './js/data.js',
  './js/media.js',
  './js/covers.js',
  './js/lyricstore.js',
  './js/vinyl-worklet.js',
  './js/retro.js',
  './assets/vendor/three.module.js',
  './assets/vendor/RoundedBoxGeometry.js',
  './assets/fonts/NotoSerifSC-900.woff2',
  './assets/fonts/NotoSerifSC-400.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/social-card.jpg'
];

const STATIC_RE = /\.(?:css|js|woff2|png|jpg|jpeg|svg|webmanifest)$/i;
const AUDIO_RE = /\.(?:m4a|mp3|aac|wav|ogg|opus)$/i;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await Promise.all(CORE.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CORE_CACHE && key !== RUNTIME_CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (AUDIO_RE.test(url.pathname)) return; // 音频交给浏览器 Range 请求，避免缓存半截文件

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        try {
          const cache = await caches.open(CORE_CACHE);
          await cache.put('./index.html', fresh.clone());
        } catch { /* 缓存写入失败不影响本次响应 */ }
        return fresh;
      } catch {
        return (await caches.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  if (!STATIC_RE.test(url.pathname)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then((response) => {
      if (response && response.ok) {
        caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }).catch(() => null);

    return cached || (await network) || Response.error();
  })());
});
