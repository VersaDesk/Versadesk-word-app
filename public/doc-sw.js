/**
 * OnlyOffice 文件快取 Service Worker
 *
 * 主執行緒用 Cache API 把文件存入 'oo-docs' 快取，
 * SW 攔截 /sw-doc/* 請求並從快取回傳。
 * 不需要 postMessage，比 Map 儲存更可靠。
 */
const CACHE = 'oo-docs-v1';

self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  if (!pathname.startsWith('/sw-doc/')) return;

  event.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(event.request.url).then(resp => {
        if (resp) {
          console.log('[SW] 命中快取:', pathname);
          return resp;
        }
        console.warn('[SW] 快取未命中:', pathname);
        return new Response('Document not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      })
    )
  );
});

self.addEventListener('install', () => {
  console.log('[SW] installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[SW] activated');
  event.waitUntil(self.clients.claim());
});
