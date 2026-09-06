// 離線快取:網路優先、失敗時用快取(所以有網路時永遠拿最新版,離線時用上次的版本)
const CACHE = 'fortune-app-v27'

// 安裝時除了首頁,也把首頁引用的 assets/*.js、*.css 一起預快取。
// 原本只快取 './':第一次造訪時 JS/CSS 是在 SW 接管前抓的、不會進快取,「第一次開 → 馬上離線」會白畫面。
async function precache() {
  const cache = await caches.open(CACHE)
  await cache.add('./')
  try {
    const html = await (await fetch('./', { cache: 'no-cache' })).text()
    const assets = [...html.matchAll(/(?:src|href)="([^"]*assets\/[^"]+)"/g)].map((m) => m[1])
    if (assets.length) await cache.addAll(assets)
  } catch {
    // 抓不到就算了,fetch 事件那邊還會邊用邊快取
  }
}

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== location.origin) return

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      .catch(() =>
        // 只有「頁面導航」才退回首頁;JS/CSS 找不到就讓它失敗,不要把 HTML 當成 JS 回去(那樣一樣白畫面、還更難查)
        caches.match(request).then((cached) => cached ?? (request.mode === 'navigate' ? caches.match('./') : Response.error())),
      ),
  )
})
