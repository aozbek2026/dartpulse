// Çerez bilgilendirme banner'ı — hafif, bağımsız, hiçbir bağımlılığı yok.
// Yalnızca zorunlu oturum çerezi kullanıldığı için bu bir "rıza" değil bilgilendirmedir.
// İlk ziyarette gösterilir; "Tamam"a basınca localStorage'da hatırlanır ve bir daha çıkmaz.
(function () {
  // Tablet/kiosk skor ekranlarında banner ASLA gösterilmez (kullanıcı isteği).
  // İki savunma katmanı: (1) sayfa yolu board/tv/scorer ise, (2) PWA standalone
  // modda çalışıyorsa (board/scorer tabletten "ana ekrana ekle" ile açılınca).
  // Böylece ileride script yanlışlıkla bu sayfalara eklense bile çıkmaz.
  try {
    var p = (location.pathname || '').toLowerCase();
    if (/(^|\/)(board|tv|scorer)\.html$/.test(p)) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    if (window.navigator && window.navigator.standalone === true) return; // iOS PWA
  } catch (e) { /* devam et */ }

  try {
    if (localStorage.getItem('dcp_cookie_ok') === '1') return;
  } catch (e) { /* localStorage kapalıysa yine de göster */ }

  function build() {
    if (document.getElementById('dcp-cookie-banner')) return;

    var style = document.createElement('style');
    style.textContent =
      '#dcp-cookie-banner{position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:#12152a;border-top:1px solid #2a2f48;color:#c8cee0;' +
      'padding:14px 18px;display:flex;gap:14px;align-items:center;justify-content:center;' +
      'flex-wrap:wrap;font-family:inherit;font-size:14px;line-height:1.5;' +
      'box-shadow:0 -4px 24px rgba(0,0,0,.35)}' +
      '#dcp-cookie-banner a{color:#00d4ff;text-decoration:underline}' +
      '#dcp-cookie-banner .dcp-cc-text{max-width:720px}' +
      '#dcp-cookie-banner button{background:#ff3860;color:#fff;border:none;cursor:pointer;' +
      'font-weight:700;font-size:14px;padding:9px 22px;border-radius:9px;white-space:nowrap}' +
      '#dcp-cookie-banner button:hover{filter:brightness(1.1)}';
    document.head.appendChild(style);

    var bar = document.createElement('div');
    bar.id = 'dcp-cookie-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Çerez bilgilendirmesi');
    bar.innerHTML =
      '<span class="dcp-cc-text">🍪 Bu site, yalnızca oturumunuzu açık tutmak için gerekli olan zorunlu ' +
      'çerezi kullanır. Reklam veya takip çerezi kullanmıyoruz. Ayrıntılar: ' +
      '<a href="/cerezler.html">Çerez Politikası</a> · <a href="/gizlilik.html">Gizlilik</a>.</span>' +
      '<button type="button" id="dcp-cookie-ok">Tamam</button>';
    document.body.appendChild(bar);

    document.getElementById('dcp-cookie-ok').addEventListener('click', function () {
      try { localStorage.setItem('dcp_cookie_ok', '1'); } catch (e) {}
      bar.remove();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
