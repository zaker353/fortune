// 離線快取:網路優先、失敗時用快取(所以有網路時永遠拿最新版,離線時用上次的版本)
// 快取名稱不再手動 +1:npm run build 的最後一步 scripts/stamp-sw.mjs 把 dist/sw.js 裡的 2602b2c-20261031125601 換成
// 「git 短 hash-建置時間」,每次部署都自然換新、舊快取在 activate 時被清掉(2026-09-08 起;之前是手動 v1…v27)。
// dev server 直接供應這個檔、沒有替換,所以留一個固定的 dev 名稱。
const BUILD_ID = '2602b2c-20261031125601'
const CACHE = BUILD_ID.startsWith('__') ? 'fortune-app-dev' : 'fortune-app-' + BUILD_ID

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
