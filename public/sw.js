// Service Worker — Dart Pulse Hızlı Skor
// Strateji: Network First — her açılışta güncel versiyonu çek, çevrimdışıysa cache kullan.
const CACHE = 'dart-scorer-v1';
const SCORER_FILES = [
  '/scorer.html',
  '/css/style.css',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SCORER_FILES))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Sadece scorer ile ilgili dosyaları yakala
  const url = new URL(e.request.url);
  const isScorer = SCORER_FILES.some(f => url.pathname === f || url.pathname.startsWith(f));
  if (!isScorer) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Başarılı yanıtı cache'le
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
