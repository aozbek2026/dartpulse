// Ortak yardımcılar
// credentials: 'same-origin' → session cookie'sini API istekleriyle birlikte gönder
const CRED = { credentials: 'same-origin' };

// --- Oturum sonu yönetimi (401) ---------------------------------------------
// API çağrılarında 401 görülürse oturum kapanmış demektir. Tek seferlik uyarı
// gösterip giriş ekranına yönlendir; aynı anda birçok çağrı 401 dönse bile
// yalnız bir kez tetiklenir.
let _sessionExpiredHandled = false;
function _handleSessionExpired() {
  if (_sessionExpiredHandled) return;
  _sessionExpiredHandled = true;
  try { if (window.toast) toast('Oturumunuz sona ermiş. Giriş ekranına yönlendiriliyorsunuz…', 4000); } catch (_) {}
  const back = encodeURIComponent(location.pathname + location.search);
  setTimeout(() => { location.href = '/login.html?next=' + back; }, 1200);
}

// Tüm api.* metodlarının ortak gövdesi:
// - Ağ hatası      → { error: '...', _network: true }   (throw ETMEZ)
// - 401            → giriş ekranına yönlendirir + { error, _unauthorized:true }
// - JSON gövde     → olduğu gibi döner (önceki davranış aynen korunur)
// - JSON olmayan   → { error: 'Sunucu hatası (HTTP n)', _httpStatus:n }
// Böylece çağıran taraf her zaman bir nesne alır; mevcut `res.error` kontrolü
// çalışır, `r.json()` JSON olmayan hata sayfalarında beklenmedik şekilde patlamaz.
async function _apiFetch(url, opts) {
  let r;
  try {
    r = await fetch(url, { credentials: 'same-origin', ...(opts || {}) });
  } catch (_) {
    return { error: 'Bağlantı hatası — internet bağlantınızı kontrol edin.', _network: true };
  }
  if (r.status === 401) {
    _handleSessionExpired();
    return { error: 'Oturumunuz sona ermiş. Yeniden giriş yapın.', _unauthorized: true };
  }
  let data = null;
  const ct = r.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await r.json(); } catch (_) { data = null; }
  }
  if (data == null) {
    if (r.ok) return {};
    return { error: 'Sunucu hatası (HTTP ' + r.status + '). Lütfen tekrar deneyin.', _httpStatus: r.status };
  }
  return data;
}

const _jsonOpts = (method, body) => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body || {}),
});

window.api = {
  get: (url) => _apiFetch(url, {}),
  post: (url, body) => _apiFetch(url, _jsonOpts('POST', body)),
  patch: (url, body) => _apiFetch(url, _jsonOpts('PATCH', body)),
  put: (url, body) => _apiFetch(url, _jsonOpts('PUT', body)),
  del: (url) => _apiFetch(url, { method: 'DELETE' }),
  request: (url, opts) => _apiFetch(url, opts),
};

window.toast = (msg, ms = 2500) => {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
};

window.entryLabel = (entry) => {
  if (!entry) return '—';
  const p1 = (entry.player1 && (entry.player1.nickname || entry.player1.name)) || '?';
  if (entry.player2) {
    const p2 = (entry.player2 && (entry.player2.nickname || entry.player2.name)) || '?';
    return `${p1} / ${p2}`;
  }
  return p1;
};

window.modeLabel = (mode) => ({
  '501': '501', '701': '701', '1001': '1001', 'cricket': 'Cricket'
}[mode] || mode);

window.formatLabel = (f) => ({
  'single_elim': 'Tek eleme',
  'double_elim': 'Çift eleme',
  'round_robin': 'Round-robin',
}[f] || f);

// ===========================================================================
// Ortak kullanıcı menüsü — sağ üst köşe kutusu (tek kaynak, tüm yönetim sayfaları)
// CSS + HTML + davranış hepsi burada. /auth/me kullanıcı dönerse basılır,
// girişsizse veya hariç tutulan sayfalarda hiç render edilmez.
// ===========================================================================
// Kullanıcı menüsü artık ayrı dosyada (anasayfa ile ortak): /js/user-menu.js
(function () {
  if (document.querySelector('script[src="/js/user-menu.js"]')) return;
  const s = document.createElement('script');
  s.src = '/js/user-menu.js';
  document.head.appendChild(s);
})();
