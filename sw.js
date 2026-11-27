/* 静态站点离线壳：只缓存同源静态资源，音频与 iTunes 接口保持网络直连。 */
const VERSION = 'jc-vinyl-v8-20261127';
const CORE_CACHE = `${VERSION}-core`;
const RUNTIME_CACHE = `${VERSION}-runtime`;

const CORE = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/app.js?v=20261127-r3',
  './js/audio.js?v=20261127-r3',
  './js/scene.js?v=20261127-r3',
  './js/data.js',
  './js/media.js',
  './js/covers.js',
  './js/lyricstore.js',
  './js/vinyl-worklet.js',
  './js/limiter-worklet.js',
  './js/retro.js?v=20261127-r3',
  './js/pixel-room.js',
  './assets/vinyl-profiles.json',
  './assets/vendor/three.module.js',
  './assets/vendor/RoundedBoxGeometry.js',
  './assets/fonts/NotoSerifSC-900.woff2',
  './assets/fonts/NotoSerifSC-400.woff2',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/apple-touch-icon.png',
  './assets/social-card.jpg'
];

const STATIC_RE = /\.(?:css|js|json|woff2|png|jpg|jpeg|svg|webmanifest)$/i;
const AUDIO_RE = /\.(?:m4a|mp3|aac|wav|ogg|opus)$/i;
const CORE_URLS = new Set(CORE.map((url) => new URL(url, self.location.origin).href));
const RUNTIME_LIMIT = 80;
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://itunes.apple.com https://lrclib.net; media-src 'self' blob: https:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy-Report-Only', CSP);
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('X-Content-Type-Options', 'nosniff');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function trimRuntimeCache() {
  const cache = await caches.open(RUNTIME_CACHE);
  const keys = await cache.keys();
  const excess = keys.length - RUNTIME_LIMIT;
  if (excess > 0) await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const responses = await Promise.all(CORE.map((url) => fetch(new Request(url, { cache: 'reload' }))));
      if (responses.some((response) => !response.ok)) throw new Error('Core asset unavailable');
      const cache = await caches.open(CORE_CACHE);
      await Promise.all(CORE.map((url, index) => cache.put(url, responses[index])));
      await self.skipWaiting();
    } catch (err) {
      await caches.delete(CORE_CACHE);
      throw err;
    }
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
          if (fresh.ok) {
            const cache = await caches.open(CORE_CACHE);
            await cache.put('./index.html', fresh.clone());
          }
        } catch { /* 缓存写入失败不影响本次响应 */ }
        return withSecurityHeaders(fresh);
      } catch {
        const cached = await caches.match('./index.html');
        return cached ? withSecurityHeaders(cached) : Response.error();
      }
    })());
    return;
  }

  if (!STATIC_RE.test(url.pathname)) return;
  if (CORE_URLS.has(url.href)) {
    event.respondWith((async () => (await caches.match(request)) || fetch(request))());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const network = fetch(request).then(async (response) => {
      if (response && response.ok) {
        const cache = await caches.open(RUNTIME_CACHE);
        await cache.put(request, response.clone());
        await trimRuntimeCache();
      }
      return response;
    }).catch(() => null);

    return cached || (await network) || Response.error();
  })());
});
