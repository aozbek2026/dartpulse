// Ortak yardımcılar
// credentials: 'same-origin' → session cookie'sini API istekleriyle birlikte gönder
const CRED = { credentials: 'same-origin' };
window.api = {
  get: (url) => fetch(url, CRED).then(r => r.json()),
  post: (url, body) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {})
  }).then(r => r.json()),
  patch: (url, body) => fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(body || {})
  }).then(r => r.json()),
  del: (url) => fetch(url, { method: 'DELETE', credentials: 'same-origin' }).then(r => r.json()),
  request: (url, opts) => fetch(url, { credentials: 'same-origin', ...opts }).then(r => r.json()),
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
  const p1 = entry.player1?.nickname || entry.player1?.name || '?';
  if (entry.player2) {
    const p2 = entry.player2?.nickname || entry.player2?.name || '?';
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
