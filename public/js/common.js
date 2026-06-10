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
  put: (url, body) => fetch(url, {
    method: 'PUT',
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

// ===========================================================================
// Ortak kullanıcı menüsü — sağ üst köşe kutusu (tek kaynak, tüm yönetim sayfaları)
// CSS + HTML + davranış hepsi burada. /auth/me kullanıcı dönerse basılır,
// girişsizse veya hariç tutulan sayfalarda hiç render edilmez.
// ===========================================================================
(function () {
  // Bu sayfalarda menü GÖSTERİLMEZ: kiosk/skor ekranları, bağımsız bracket,
  // giriş & şifre akışları, ve kendi menüsü olan anasayfa.
  const EXCLUDE = new Set([
    '/', '/index.html',
    '/board.html', '/tv.html', '/scorer.html', '/bracket.html',
    '/login.html', '/forgot-password.html', '/reset-password.html', '/verify-email.html',
  ]);
  if (EXCLUDE.has(location.pathname)) return;

  function injectStyles() {
    if (document.getElementById('dcp-um-css')) return;
    const css = `
.dcp-um { position: fixed; top: 12px; right: 14px; z-index: 9000; font-size: 0.92rem; }
.dcp-um-trigger { display: inline-flex; align-items: center; gap: 0.5rem;
  background: var(--surface, #1a1e2d); border: 1px solid var(--border, #2a2f48);
  border-radius: 999px; padding: 0.32rem 0.8rem 0.32rem 0.36rem; cursor: pointer;
  color: var(--text, #e8ebf5); font-weight: 600; font-family: inherit;
  transition: border-color 0.15s; box-shadow: 0 4px 16px -8px rgba(0,0,0,0.5); }
.dcp-um-trigger:hover { border-color: var(--accent-2, #00d4ff); }
.dcp-um-avatar { width: 26px; height: 26px; border-radius: 50%;
  background: linear-gradient(135deg, var(--accent, #ff3860), var(--accent-2, #00d4ff));
  color: #fff; font-weight: 800; font-size: 0.82rem; display: flex;
  align-items: center; justify-content: center; }
.dcp-um-name { max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dcp-um-arrow { font-size: 0.68rem; color: var(--text-dim, #9099b4); transition: transform 0.15s; }
.dcp-um.open .dcp-um-arrow { transform: rotate(180deg); }
.dcp-um-dd { display: none; position: absolute; top: calc(100% + 8px); right: 0;
  min-width: 240px; background: var(--surface, #1a1e2d); border: 1px solid var(--border, #2a2f48);
  border-radius: 12px; padding: 0.5rem; box-shadow: 0 12px 36px -12px rgba(0,0,0,0.6); }
.dcp-um.open .dcp-um-dd { display: block; }
.dcp-um-info { padding: 0.6rem 0.8rem 0.75rem; border-bottom: 1px solid var(--border, #2a2f48); margin-bottom: 0.4rem; }
.dcp-um-info .nm { font-weight: 700; font-size: 0.92rem; margin-bottom: 0.15rem; }
.dcp-um-info .em { font-size: 0.78rem; color: var(--text-dim, #9099b4); word-break: break-all; }
.dcp-um-item { display: flex; align-items: center; gap: 0.55rem; padding: 0.55rem 0.8rem;
  border-radius: 7px; color: var(--text, #e8ebf5); text-decoration: none; font-size: 0.9rem;
  cursor: pointer; background: transparent; border: 0; width: 100%; text-align: left;
  font-family: inherit; transition: background 0.12s; }
.dcp-um-item:hover { background: var(--surface-2, #232840); }
.dcp-um-item .ico { font-size: 1rem; opacity: 0.85; }
.dcp-um-item.disabled { color: var(--text-dim, #9099b4); cursor: default; }
.dcp-um-item.disabled:hover { background: transparent; }
.dcp-um-divider { height: 1px; background: var(--border, #2a2f48); margin: 0.35rem 0; }
.dcp-um-item.danger { color: #ff7a8a; }
@media (max-width: 640px) { .dcp-um-name { display: none; } }
`;
    const style = document.createElement('style');
    style.id = 'dcp-um-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  function render(user) {
    injectStyles();
    const display = (user.name || user.email || '?').trim();
    const initial = (display.charAt(0) || '·').toUpperCase();
    const first = display.split(/\s+/)[0] || display;
    const status = user.organizer_status || 'none';
    const isAdmin = user.role === 'admin';

    // Organizatör Ol öğesi: admin veya onaylı ise gizli
    let organizerItem = '';
    if (!isAdmin && status !== 'approved') {
      if (status === 'pending') {
        organizerItem = `<button class="dcp-um-item disabled" data-locked="1">
          <span class="ico">🎫</span><span>Başvurunuz değerlendirmede</span></button>`;
      } else {
        const label = status === 'rejected' ? 'Tekrar Organizatör Ol' : 'Organizatör Ol';
        organizerItem = `<button class="dcp-um-item" id="dcp-um-apply">
          <span class="ico">🎫</span><span>${label}</span></button>`;
      }
    }
    const adminItem = isAdmin
      ? `<a class="dcp-um-item" href="/admin.html"><span class="ico">🛡️</span><span>Yönetici Paneli</span></a>`
      : '';

    const box = document.createElement('div');
    box.className = 'dcp-um';
    box.id = 'dcp-um';
    box.innerHTML = `
      <button class="dcp-um-trigger" id="dcp-um-trigger">
        <span class="dcp-um-avatar">${esc(initial)}</span>
        <span class="dcp-um-name">${esc(first)}</span>
        <span class="dcp-um-arrow">▾</span>
      </button>
      <div class="dcp-um-dd" id="dcp-um-dd">
        <div class="dcp-um-info">
          <div class="nm">${esc(user.name || display)}</div>
          <div class="em">${esc(user.email || '')}</div>
        </div>
        <a class="dcp-um-item" href="/organizer.html"><span class="ico">🏆</span><span>Organizatör Paneli</span></a>
        <a class="dcp-um-item" href="/liga.html"><span class="ico">🏅</span><span>Ligler &amp; Sezonlar</span></a>
        <a class="dcp-um-item" href="/turnuvalar.html"><span class="ico">🎯</span><span>Turnuvalar</span></a>
        <a class="dcp-um-item" href="/profil.html"><span class="ico">📊</span><span>Performans &amp; Başarımlar</span></a>
        ${adminItem}
        ${organizerItem}
        <div class="dcp-um-divider"></div>
        <button class="dcp-um-item danger" id="dcp-um-logout"><span class="ico">⏻</span><span>Çıkış Yap</span></button>
      </div>`;
    document.body.appendChild(box);

    const trigger = box.querySelector('#dcp-um-trigger');
    const dd = box.querySelector('#dcp-um-dd');
    trigger.addEventListener('click', (e) => { e.stopPropagation(); box.classList.toggle('open'); });
    dd.addEventListener('click', (e) => e.stopPropagation());
    document.addEventListener('click', () => box.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.classList.remove('open'); });

    const logoutBtn = box.querySelector('#dcp-um-logout');
    logoutBtn.addEventListener('click', async () => {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch {}
      location.href = '/';
    });

    const applyBtn = box.querySelector('#dcp-um-apply');
    if (applyBtn) {
      applyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const note = prompt('İsterseniz başvurunuza kısa bir not ekleyin (kulüp/mekan, neden organizatör olmak istediğiniz vb.):', '');
        if (note === null) return;
        try {
          const r = await fetch('/auth/organizer-apply', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin', body: JSON.stringify({ note }),
          });
          const d = await r.json();
          if (!r.ok) { alert(d.error || 'Başvuru gönderilemedi.'); return; }
          alert(d.message || 'Başvurunuz alındı.');
          applyBtn.outerHTML = `<button class="dcp-um-item disabled" data-locked="1">
            <span class="ico">🎫</span><span>Başvurunuz değerlendirmede</span></button>`;
        } catch { alert('Başvuru gönderilemedi, bağlantınızı kontrol edin.'); }
      });
    }
  }

  function boot() {
    fetch('/auth/me', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(d => { if (d && d.user) render(d.user); })
      .catch(() => {});
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
