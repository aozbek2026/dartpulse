// Board (tablet) ekranı - üç durum: pre-match (ready) / live / post-match (finished)
const params = new URLSearchParams(location.search);
const boardId = params.get('id') ? +params.get('id') : null;
const readonlyMatchId = params.get('match') ? +params.get('match') : null;
const isReadonly = params.get('readonly') === '1' && !!readonlyMatchId;
const root = document.getElementById('root');
const socket = io();

// ---- Bağlantı durum banner'ı (board.html'deki #conn-banner) ----
// Socket koparsa skor giren kişi anında fark etsin diye büyük kırmızı bant.
(function setupConnBanner() {
  const banner = document.getElementById('conn-banner');
  if (!banner) return;
  let hideTimer = null;
  function show(text) {
    const t = banner.querySelector('.conn-banner__text');
    if (t && text) t.textContent = text;
    banner.hidden = false;
    banner.classList.add('is-visible');
  }
  function hide() { banner.classList.remove('is-visible'); banner.classList.remove('is-ok'); banner.style.display = 'none'; banner.hidden = true; }
  function showBanner() { banner.style.display = ''; banner.hidden = false; banner.classList.add('is-visible'); }
  socket.on('disconnect', (reason) => {
    clearTimeout(hideTimer);
    banner.classList.remove('is-ok');
    show(reason === 'io server disconnect'
      ? 'Sunucu bağlantıyı kapattı — yeniden bağlanılıyor…'
      : 'Bağlantı kesildi — yeniden bağlanılıyor…');
    showBanner();
  });
  socket.io.on('reconnect_attempt', () => { clearTimeout(hideTimer); banner.classList.remove('is-ok'); show('Bağlantı kesildi — yeniden bağlanılıyor…'); showBanner(); });
  socket.io.on('error', () => { clearTimeout(hideTimer); banner.classList.remove('is-ok'); show('Bağlantı sorunlu — yeniden bağlanılıyor…'); showBanner(); });
  socket.on('connect', () => {
    clearTimeout(hideTimer);
    const t = banner.querySelector('.conn-banner__text');
    if (t) t.textContent = '✓ Yeniden bağlandı';
    banner.classList.remove('is-error');
    banner.classList.add('is-ok');
    showBanner();
    hideTimer = setTimeout(() => hide(), 1500);
  });
})();

// ==========================================================================
// Offline atış kuyruğu (Temmuz 2026)
// Bağlantı koptuğunda gönderilemeyen atışlar burada bekler; bağlantı gelince
// SIRAYLA otomatik gönderilir. Her atışa benzersiz clientThrowId eklenir —
// sunucu aynı kimliği ikinci kez İŞLEMEZ (çift sayma engellenir, bkz.
// applied_client_throws tablosu). Kuyruk localStorage'a yazılır: tablet/uygulama
// kapanıp açılsa/çökse bile bekleyen atış kaybolmaz.
// ==========================================================================
const THROW_QUEUE_KEY = 'board.throwQueue.v1';
let _throwQueue = _loadThrowQueue();
let _flushingQueue = false;

function _loadThrowQueue() {
  try { const a = JSON.parse(localStorage.getItem(THROW_QUEUE_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
function _saveThrowQueue() {
  try { localStorage.setItem(THROW_QUEUE_KEY, JSON.stringify(_throwQueue)); } catch {}
  _updatePendingIndicator();
}
function _genThrowId() {
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch {}
  return 'q-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
}
// Bekleyen atış sayısını üstte küçük bir rozette gösterir (board.html'e dokunmadan,
// element dinamik oluşturulur).
function _updatePendingIndicator() {
  let el = document.getElementById('pending-throws');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pending-throws';
    el.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:10000;'
      + 'background:#b45309;color:#fff;padding:6px 14px;border-radius:999px;font-size:0.85rem;'
      + 'font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.4);pointer-events:none;';
    document.body.appendChild(el);
  }
  const n = _throwQueue.length;
  if (n > 0) { el.textContent = `⏳ Bekleyen atış: ${n}`; el.style.display = ''; }
  else el.style.display = 'none';
}

// Bir atışı kuyruğa ekle + kuyruğu boşaltmayı dene.
// Dönüş: sunucu cevabı (delivered) VEYA offline ise { _queued: true }.
async function sendThrow(url, body) {
  const item = { id: _genThrowId(), url, body: { ...body } };
  item.body.clientThrowId = item.id;
  _throwQueue.push(item);
  _saveThrowQueue();
  return await flushThrowQueue(item.id);
}

// Kuyruğu FIFO gönderir. targetId verilirse o atışın cevabını döndürür; ona
// ulaşamadan offline olursa { _queued: true } döner.
async function flushThrowQueue(targetId) {
  if (_flushingQueue) return { _queued: true };
  _flushingQueue = true;
  let targetRes = { _queued: true };
  try {
    while (_throwQueue.length) {
      const item = _throwQueue[0];
      const res = await api.post(item.url, item.body);
      if (res && res._network) break; // offline → dur, kuyruk kalsın
      // delivered (başarı | duplicate | uygulama-hatası) → kuyruktan çıkar
      _throwQueue.shift();
      _saveThrowQueue();
      if (item.id === targetId) targetRes = res;
      if (res && res.error && !res.duplicate) toast('Atış hatası: ' + res.error);
    }
  } finally {
    _flushingQueue = false;
  }
  return targetRes;
}

// Bağlantı gelince + periyodik olarak + açılışta kuyruğu boşalt.
socket.on('connect', () => { if (_throwQueue.length) flushThrowQueue(); });
setInterval(() => { if (_throwQueue.length && !_flushingQueue) flushThrowQueue(); }, 5000);
window.addEventListener('load', () => { _updatePendingIndicator(); if (_throwQueue.length) flushThrowQueue(); });

// ---- Tam ekran yardımcıları (board seçildikten sonra) ----
async function requestFs(el) {
  try {
    el = el || document.documentElement;
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (_) { /* sessiz */ }
}
function isFs() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement)
    || (window.matchMedia && window.matchMedia('(display-mode: fullscreen)').matches)
    || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function updateFsToggle() {
  const btn = document.getElementById('fs-toggle');
  if (!btn) return;
  // Board seçili değilse veya zaten tam ekransa → gizle.
  if (!boardId || isFs()) { btn.hidden = true; return; }
  btn.hidden = false;
}
document.addEventListener('fullscreenchange', updateFsToggle);
document.addEventListener('webkitfullscreenchange', updateFsToggle);
window.addEventListener('load', updateFsToggle);
(function bindFsToggle() {
  const btn = document.getElementById('fs-toggle');
  if (!btn) return;
  btn.addEventListener('click', async () => { await requestFs(); updateFsToggle(); });
})();

let currentMatch = null;
let currentBoard = null;
let currentInput = '';
let allBoards = [];
let allTournaments = [];
let cricketDarts = [];          // [{target: 20, mult: 1|2|3} | {target: null, mult: 0 — ışkal}, ...] (max 3)
let selectedStarter = null;    // 1 veya 2 — hangi takım başlıyor
let selectedSubStarter1 = null; // 1 veya 2 — takım 1'de kim başlıyor (doubles)
let selectedSubStarter2 = null; // 1 veya 2 — takım 2'de kim başlıyor (doubles)
let selectedIncludeLow = true;  // FB Cezalı / Karambol: 10 ve 11 segmentleri dahil mi (default evet)

socket.on('state', (s) => {
  allBoards = s.boards;
  allTournaments = s.tournaments || [];
  if (isReadonly) { refreshMatch(readonlyMatchId); return; }
  if (!boardId) return renderBoardPicker();
  currentBoard = s.boards.find(b => b.id === boardId);
  currentMatch = currentBoard?.currentMatch || null;
  // details endpoint'inden round_label, game_mode almak için yeniden fetch
  if (currentMatch) refreshMatch(currentMatch.id);
  else render();
});

socket.on('board:state', (data) => {
  currentBoard = data.board;
  currentMatch = data.match;
  if (currentMatch) refreshMatch(currentMatch.id);
  else render();
});

socket.on('match:update', (data) => {
  if (isReadonly && data.matchId === readonlyMatchId) { refreshMatch(readonlyMatchId); return; }
  if (currentMatch && data.matchId === currentMatch.id) {
    refreshMatch(currentMatch.id);
  }
});

async function refreshMatch(id) {
  try {
    const m = await (await fetch('/api/matches/' + id)).json();
    currentMatch = m;
    render();
  } catch (e) {
    render();
  }
}

if (boardId) socket.emit('board:subscribe', boardId);
if (isReadonly) refreshMatch(readonlyMatchId);

// ---- Render ----
function render() {
  if (isReadonly) {
    if (!currentMatch) { root.innerHTML = `<div class="empty">Yükleniyor…</div>`; return; }
    if (currentMatch.status === 'ready') {
      root.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;gap:1rem;"><div style="font-size:3rem;">⏳</div><h2>Maç başlamayı bekliyor</h2><p style="color:var(--text-dim);">${entryLabel(currentMatch.entry1)} vs ${entryLabel(currentMatch.entry2)}</p></div>`;
      return;
    }
    if (currentMatch.status === 'finished') return renderPostMatch();
    return renderMatch();
  }
  if (!boardId) return renderBoardPicker();
  if (!currentBoard) {
    root.innerHTML = `<div class="empty">Board bulunamadı. <a href="/board.html">Geri dön</a></div>`;
    return;
  }
  if (!currentMatch) return renderIdle();
  if (currentMatch.status === 'ready') return renderPreMatch();
  if (currentMatch.status === 'finished') return renderPostMatch();
  renderMatch();
}

function renderBoardPicker() {
  if (!allBoards.length) {
    root.innerHTML = `<div class="empty">
      Henüz board kaydı yok.<br>
      Organizatör panelinden board ekle: <a href="/organizer.html#boards">Organizatör</a>
    </div>`;
    return;
  }
  // Turnuvaya göre grupla
  const tourMap = new Map();
  for (const t of allTournaments) tourMap.set(t.id, t);
  const groups = new Map();
  for (const b of allBoards) {
    const key = b.tournament_id || 'general';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  const orderedKeys = [];
  for (const t of allTournaments) {
    if (groups.has(t.id) && t.status !== 'finished') orderedKeys.push(t.id);
  }
  for (const t of allTournaments) {
    if (groups.has(t.id) && t.status === 'finished') orderedKeys.push(t.id);
  }
  if (groups.has('general')) orderedKeys.push('general');

  const groupHtml = orderedKeys.map(k => {
    const gName = (k === 'general') ? '🔓 Genel' : (tourMap.get(k)?.name || `Turnuva #${k}`);
    const cards = groups.get(k).map(b => `
      <a class="card board-pick" href="/board.html?id=${b.id}" data-board-id="${b.id}" style="text-decoration: none; color: inherit;">
        <h3>${b.name}</h3>
        <div style="color: var(--text-dim); margin-top: 0.5rem;">
          ${b.status === 'busy' ? '⚡ Meşgul' : '💤 Boşta'}
        </div>
      </a>
    `).join('');
    return `
      <div style="margin-bottom: 1.5rem;">
        <h4 style="margin: 0 0 0.75rem 0; padding: 0.5rem 0.85rem; background: var(--surface-2); border-radius: 6px; font-size: 1rem;">${gName}</h4>
        <div class="grid cols-2">${cards}</div>
      </div>
    `;
  }).join('');

  root.innerHTML = `
    <div style="max-width: 720px; margin: 3rem auto; padding: 0 1rem;">
      <h2 style="text-align: center; margin-bottom: 1.5rem;">Bu tablet hangi board için?</h2>
      <p style="text-align: center; color: var(--text-dim); margin: -0.5rem 0 1.25rem; font-size: 0.9rem;">
        Seçtiğin board tam ekran modunda açılacak.
      </p>
      ${groupHtml}
    </div>
  `;

  // Board seçimi: user gesture içinde önce tam ekrana geç, sonra navigate et.
  // (Browser fullscreen API'si yalnız bir kullanıcı dokunuşu içinde çağrılabiliyor.)
  root.querySelectorAll('a.board-pick').forEach(card => {
    card.addEventListener('click', async (e) => {
      e.preventDefault();
      const href = card.getAttribute('href');
      // Tam ekrana geçişi ARKA PLANDA başlat, navigate'i bekletme.
      // Bazı tarayıcılarda navigate sırasında fullscreen kaybolur — o zaman
      // yeni sayfada ⛶ butonu görünür ve tek dokunuşla geri alınır.
      try { requestFs(); } catch (_) {}
      // Kısa bir mikro-gecikme, fullscreen request'i async settle etsin
      setTimeout(() => { location.href = href; }, 30);
    });
  });
}

function renderIdle() {
  const tour = allTournaments.find(t => t.id === currentBoard.tournament_id);
  const tourName = tour ? (tour.name.startsWith('__team_pool_') ? 'Takım Maçı' : tour.name) : null;

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${currentBoard.name}</div>
        <div class="match-info">Bekliyor</div>
      </div>
      <a href="/board.html" class="btn secondary">Board değiştir</a>
    </div>
    <div style="flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: clamp(0.75rem, 2vmin, 1.5rem); text-align: center; padding: 1rem;">
      <div style="font-size: clamp(3rem, 8vmin, 6rem);">🎯</div>
      ${tourName ? `<div style="font-size: clamp(1.1rem, 3.5vmin, 2rem); color: var(--text-dim); letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;">${tourName}</div>` : ''}
      <div style="font-size: clamp(2.5rem, 9vmin, 6rem); font-weight: 900; line-height: 1.1; color: var(--accent);">${currentBoard.name}</div>
      <div style="font-size: clamp(1.2rem, 4vmin, 2.2rem); font-weight: 700; margin-top: 0.25rem;">Maç bekleniyor</div>
      <p style="color: var(--text-dim); font-size: clamp(0.85rem, 2.5vmin, 1.1rem); margin-top: 0.25rem;">Organizatör sıradaki maçı atadığında otomatik başlayacak.</p>
      <button class="btn secondary" style="font-size: clamp(0.9rem, 2.6vmin, 1.2rem); padding: 0.7rem 1.4rem; margin-top: 0.5rem;"
        onclick="openMatchSwap()">
        🔄 Başka maç seç
      </button>
    </div>
  `;
}

// ---- Başka maç seç (takas) ----
// Geç kalan oyuncu vb. durumlarda, bu tablette duran/bekleyen maç yerine
// aynı turnuvanın başka bir hazır maçını seçip oynatmayı sağlar.
async function openMatchSwap() {
  if (!currentBoard) return;
  let matches = [];
  try {
    const r = await fetch('/api/boards/' + currentBoard.id + '/available-matches');
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Liste alınamadı');
    matches = data.matches || [];
  } catch (e) {
    toast('Maç listesi alınamadı: ' + e.message);
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'swap-modal';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.72);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem;';

  const rows = matches.length ? matches.map(m => `
    <button class="card swap-row" data-mid="${m.id}"
      style="width:100%;text-align:left;padding:1rem 1.1rem;margin-bottom:0.6rem;background:var(--surface-2);border:1px solid var(--surface-3,#2a2f3a);cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:1rem;">
      <span style="font-size:1.15rem;font-weight:700;">${entryLabel(m.entry1)} <span style="color:var(--text-dim);font-weight:500;">vs</span> ${entryLabel(m.entry2)}</span>
      <span style="font-size:0.85rem;color:var(--text-dim);white-space:nowrap;">Round ${m.round}</span>
    </button>
  `).join('') : `<div style="text-align:center;color:var(--text-dim);padding:1.5rem 0;">Şu an oynatılabilecek başka hazır maç yok.</div>`;

  overlay.innerHTML = `
    <div class="card" style="max-width:560px;width:100%;max-height:85vh;overflow-y:auto;background:var(--surface,#11151c);padding:1.25rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h3 style="margin:0;font-size:1.3rem;">🔄 Başka maç seç</h3>
        <button class="btn secondary swap-close" style="padding:0.4rem 0.9rem;">Kapat</button>
      </div>
      <p style="color:var(--text-dim);font-size:0.85rem;margin:0 0 1rem;">
        Seçtiğin maç bu tablete gelir. Şu an bekleyen maç havuza geri döner.
      </p>
      ${rows}
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.swap-close').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  overlay.querySelectorAll('.swap-row').forEach(btn => {
    btn.onclick = async () => {
      const mid = +btn.getAttribute('data-mid');
      btn.disabled = true;
      try {
        const r = await fetch('/api/boards/' + currentBoard.id + '/swap-match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ match_id: mid }),
        });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Takas başarısız');
        close();
        // board:state socket olayı ekranı zaten yenileyecek; garanti için fetch
        refreshMatch(mid);
      } catch (e) {
        btn.disabled = false;
        toast('Takas başarısız: ' + e.message);
      }
    };
  });
}

// ---- Pre-match ekranı (status === 'ready') ----
function renderPreMatch() {
  const m = currentMatch;
  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const isDoubles = !!(m.entry1?.player2 || m.entry2?.player2);
  const scorer = m.scorer ? entryLabel(m.scorer) : null;
  const roundLabel = m.round_label || `Round ${m.round}`;
  const rawTName = m.tournament_name || 'Turnuva';
  const tName = rawTName.startsWith('__team_pool_') ? 'Takım Maçı' : rawTName;

  // Yazıcı dropdown için uygun entry listesi: mevcut entry + tüm uygun entry'ler
  const t = allTournaments.find(tt => tt.id === m.tournament_id);
  const scorerOptions = (t?.entries || []).filter(e => e.id !== m.entry1_id && e.id !== m.entry2_id);

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${currentBoard.name}</div>
        <div class="match-info">${tName} · ${roundLabel}</div>
      </div>
      <a href="/board.html" class="btn secondary">Board değiştir</a>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding: 1rem; gap: 1rem; overflow-y: auto; min-height: 0;">
      <div style="text-align: center;">
        <div style="font-size: 1rem; letter-spacing: 0.1em; color: var(--text-dim); text-transform: uppercase;">${tName}</div>
        <div style="font-size: 2.5rem; font-weight: 800; margin-top: 0.25rem; color: var(--accent);">${roundLabel}</div>
        <div style="font-size: 1.1rem; color: var(--text-dim); margin-top: 0.25rem;">${currentBoard.name}</div>
      </div>

      <div style="width: 100%; max-width: 780px; display: grid; grid-template-columns: 1fr auto 1fr; gap: 1.5rem; align-items: center;">
        <button class="card" style="text-align: center; padding: 1.75rem 1rem; border: 2px solid var(--surface-3, #2a2f3a); background: var(--surface-2); cursor: default;">
          <div style="font-size: 0.78rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase;">Oyuncu 1</div>
          <div style="font-size: 1.9rem; font-weight: 700; margin-top: 0.5rem; line-height: 1.15;">${e1}</div>
        </button>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--text-dim);">VS</div>
        <button class="card" style="text-align: center; padding: 1.75rem 1rem; border: 2px solid var(--surface-3, #2a2f3a); background: var(--surface-2); cursor: default;">
          <div style="font-size: 0.78rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase;">Oyuncu 2</div>
          <div style="font-size: 1.9rem; font-weight: 700; margin-top: 0.5rem; line-height: 1.15;">${e2}</div>
        </button>
      </div>

      <div style="width: 100%; max-width: 780px;">
        <div class="card" style="padding: 1.25rem; background: var(--surface-2);">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div>
              <div style="font-size: 0.78rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase;">Yazıcı-Hakem</div>
              <div style="font-size: 1.5rem; font-weight: 700; margin-top: 0.25rem;">
                ${scorer ? `✍️ ${scorer}` : '<span style="color: var(--text-dim);">Atanmadı</span>'}
              </div>
            </div>
            <select id="scorerSelect" class="btn secondary" style="min-width: 200px; padding: 0.5rem;" onchange="changeScorer()">
              <option value="">— Değiştir —</option>
              ${m.scorer_entry_id ? `<option value="" style="color: #f88;">(Boşalt)</option>` : ''}
              ${scorerOptions.map(e => `<option value="${e.id}" ${e.id === m.scorer_entry_id ? 'selected' : ''}>${entryLabel(e)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div style="width: 100%; max-width: 780px;">
        <div class="card" style="background: var(--surface-2); padding: 1.25rem;">
          <div style="font-size: 0.78rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">🎯 Hangi takım başlıyor?</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
            <button class="btn ${selectedStarter === 1 ? '' : 'secondary'}"
              style="font-size: 1.1rem; padding: 0.85rem; ${selectedStarter === 1 ? 'background: var(--accent); color: #000; font-weight: 800;' : ''}"
              onclick="selectStarter(1)">
              ${selectedStarter === 1 ? '▶ ' : ''}${e1}
            </button>
            <button class="btn ${selectedStarter === 2 ? '' : 'secondary'}"
              style="font-size: 1.1rem; padding: 0.85rem; ${selectedStarter === 2 ? 'background: var(--accent); color: #000; font-weight: 800;' : ''}"
              onclick="selectStarter(2)">
              ${selectedStarter === 2 ? '▶ ' : ''}${e2}
            </button>
          </div>
        </div>
      </div>

      ${(() => {
        const tt = allTournaments.find(tx => tx.id === m.tournament_id);
        const gm = tt?.game_mode;
        const isFBMode = gm === 'cricket_fb_cezali' || gm === 'cricket_fb_karambol';
        if (!isFBMode) return '';
        return `
        <div style="width: 100%; max-width: 780px;">
          <div class="card" style="background: var(--surface-2); padding: 1.25rem;">
            <div style="font-size: 0.78rem; color: var(--text-dim); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 0.75rem;">🎯 Hedef segmentleri</div>
            <label style="display: flex; align-items: center; gap: 0.85rem; cursor: pointer; padding: 0.4rem 0;">
              <input type="checkbox" ${selectedIncludeLow ? 'checked' : ''}
                onchange="selectIncludeLow(this.checked)"
                style="width: 1.4rem; height: 1.4rem; cursor: pointer; accent-color: var(--accent);" />
              <span style="font-size: 1.05rem; font-weight: 600;">10 ve 11 segmentleri dahil</span>
            </label>
            <div style="font-size: 0.82rem; color: var(--text-dim); margin-top: 0.3rem; padding-left: 2.25rem;">
              Kapatılırsa oyun 12-20 + Bull + D + T + H ile oynanır.
            </div>
          </div>
        </div>`;
      })()}

      ${isDoubles ? `
      <div style="width: 100%; max-width: 780px; display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
        ${[1, 2].map(slot => {
          const entry = slot === 1 ? m.entry1 : m.entry2;
          const sub = slot === 1 ? selectedSubStarter1 : selectedSubStarter2;
          const p1name = entry?.player1?.nickname || entry?.player1?.name || '?';
          const p2name = entry?.player2?.nickname || entry?.player2?.name || '?';
          const teamLabel = slot === 1 ? e1 : e2;
          return `
            <div class="card" style="background: var(--surface-2); padding: 1rem;">
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.6rem;">
                ${teamLabel} — ilk atan
              </div>
              <div style="display: flex; flex-direction: column; gap: 0.5rem;">
                <button class="btn ${sub === 1 ? '' : 'secondary'}"
                  style="padding: 0.65rem; ${sub === 1 ? 'background: var(--accent); color: #000; font-weight: 800;' : ''}"
                  onclick="selectSubStarter(${slot}, 1)">
                  ${sub === 1 ? '▶ ' : ''}${p1name}
                </button>
                <button class="btn ${sub === 2 ? '' : 'secondary'}"
                  style="padding: 0.65rem; ${sub === 2 ? 'background: var(--accent); color: #000; font-weight: 800;' : ''}"
                  onclick="selectSubStarter(${slot}, 2)">
                  ${sub === 2 ? '▶ ' : ''}${p2name}
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      ` : ''}

      ${(() => {
        const ready = isDoubles
          ? selectedStarter && selectedSubStarter1 && selectedSubStarter2
          : !!selectedStarter;
        const hint = isDoubles
          ? 'Başlayan takımı ve her takımdan ilk atan oyuncuyu seçin.'
          : 'Başlayan oyuncuyu seçin, ardından MAÇA BAŞLA\'ya basın.';
        const errMsg = isDoubles
          ? 'Önce başlayan takımı ve her takımdan ilk atan oyuncuyu seçin'
          : 'Önce başlayan oyuncuyu seçin';
        return `
          <button class="btn" style="font-size: 1.5rem; padding: 1.25rem 3rem; background: var(--accent); color: #000; font-weight: 800; border-radius: 12px; margin-top: 0.5rem; opacity: ${ready ? 1 : 0.45}; cursor: ${ready ? 'pointer' : 'not-allowed'};"
            onclick="${ready ? 'beginMatch()' : `toast('${errMsg}')`}">
            ▶ MAÇA BAŞLA
          </button>
          <div style="font-size: 0.85rem; color: var(--text-dim); text-align: center; max-width: 560px;">${hint}</div>
        `;
      })()}

      <div style="display: flex; gap: 1rem; margin-top: 0.5rem; flex-wrap: wrap; justify-content: center;">
        <button class="btn secondary" style="font-size: 0.9rem; padding: 0.6rem 1.2rem; border-color: var(--danger, #ef4444); color: var(--danger, #ef4444);"
          onclick="declareWalkover(1, '${e2.replace(/'/g, "\\'")}')">
          ${e2} gelmedi
        </button>
        <button class="btn secondary" style="font-size: 0.9rem; padding: 0.6rem 1.2rem; border-color: var(--danger, #ef4444); color: var(--danger, #ef4444);"
          onclick="declareWalkover(2, '${e1.replace(/'/g, "\\'")}')">
          ${e1} gelmedi
        </button>
        <button class="btn secondary" style="font-size: 0.9rem; padding: 0.6rem 1.2rem;"
          onclick="openMatchSwap()">
          🔄 Başka maç seç
        </button>
      </div>
    </div>
  `;
}

function selectStarter(slot) {
  selectedStarter = slot;
  renderPreMatch();
}

function selectIncludeLow(val) {
  selectedIncludeLow = !!val;
  renderPreMatch();
}

function selectSubStarter(teamSlot, playerSlot) {
  if (teamSlot === 1) selectedSubStarter1 = playerSlot;
  else selectedSubStarter2 = playerSlot;
  renderPreMatch();
}

async function beginMatch() {
  if (!currentMatch) return;
  const isDoubles = !!(currentMatch.entry1?.player2 || currentMatch.entry2?.player2);
  if (!selectedStarter) return toast('Önce başlayan takımı seçin');
  if (isDoubles && (!selectedSubStarter1 || !selectedSubStarter2))
    return toast('Her takımdan ilk atan oyuncuyu seçin');
  const body = { starting_turn: selectedStarter };
  if (isDoubles) {
    body.p1_sub_turn = selectedSubStarter1;
    body.p2_sub_turn = selectedSubStarter2;
  }
  // FB Cezalı / Karambol için 10-11 dahil tercihi (varsayılan: dahil)
  body.include_low = !!selectedIncludeLow;
  const res = await api.post(`/api/matches/${currentMatch.id}/begin`, body);
  if (res.error) return toast('Hata: ' + res.error);
  selectedStarter = null;
  selectedSubStarter1 = null;
  selectedSubStarter2 = null;
  toast('Maç başladı!');
}

// winnerSlot: gelen oyuncunun slot'u (1 veya 2), absentName: gelmeyen oyuncunun adı
async function declareWalkover(winnerSlot, absentName) {
  if (!currentMatch) return;
  const confirmed = await showConfirm(
    `${absentName} turnuvadan çekildi olarak işaretlensin mi?\nBu maç istatistiklere sayılmayacak.`,
    'Evet, Çekildi',
    'İptal'
  );
  if (!confirmed) return;
  const res = await api.post(`/api/matches/${currentMatch.id}/walkover`, { winnerSlot });
  if (res.error) return toast('Hata: ' + res.error);
  toast('Walkover kaydedildi — bracket güncellendi');
}

async function changeScorer() {
  const sel = document.getElementById('scorerSelect');
  if (!sel || !currentMatch) return;
  const val = sel.value;
  if (val === '') return; // "Değiştir" default
  const scorerEntryId = val ? +val : null;
  const res = await api.patch(`/api/matches/${currentMatch.id}/scorer`, { scorer_entry_id: scorerEntryId });
  if (res && res.error) return toast('Hata: ' + res.error);
  toast('Yazıcı-hakem güncellendi');
}

// ---- Live ekran (status === 'live') ----
function renderMatch() {
  const m = currentMatch;
  if (m.game_mode === 'cricket') return renderCricketMatch(m);
  if (m.game_mode === 'cricket_fb_cezali') return renderFBCezaliMatch(m);
  if (m.game_mode === 'cricket_fb_karambol') return renderKarambolMatch(m);
  const startScore = getStartScore(m);
  const rem1 = m.p1_leg_score ?? startScore;
  const rem2 = m.p2_leg_score ?? startScore;

  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const scorer = m.scorer ? entryLabel(m.scorer) : null;

  const isTurn1 = m.current_turn === 1;
  const showSets = (m.sets_to_win || 1) > 1;
  const isDoubles = !!(m.entry1?.player2 || m.entry2?.player2);

  const stats1 = m.stats?.find(s => s.player_slot === 1) || {};
  const stats2 = m.stats?.find(s => s.player_slot === 2) || {};
  const avg1 = avg(stats1).toFixed(1);
  const avg2 = avg(stats2).toFixed(1);
  const legs1 = m.p1_legs || 0;
  const legs2 = m.p2_legs || 0;

  // Aktif leg throw geçmişi
  const legThrows = (m.throws || []).filter(t =>
    t.leg_index === m.current_leg && t.set_index === (m.current_set || 1)
  );
  const visits1 = legThrows.filter(t => t.player_slot === 1);
  const visits2 = legThrows.filter(t => t.player_slot === 2);
  const SHOW = 50;
  const vis1 = visits1.slice(-SHOW);
  const vis2 = visits2.slice(-SHOW);
  const visCount = Math.max(vis1.length, vis2.length, 0);
  const visOffset = Math.max(visits1.length, visits2.length) - visCount;

  // Her visit = tek satır: sol skor | ok sayısı | sağ skor — hizalama otomatik
  let visitRows = '';
  for (let i = 0; i < visCount; i++) {
    const v1 = vis1[i];
    const v2 = vis2[i];
    const num = (visOffset + i + 1) * 3;
    const cls1 = !v1 ? '' : (v1.bust ? ' bust' : (i === vis1.length - 1 ? ' last' : ''));
    const cls2 = !v2 ? '' : (v2.bust ? ' bust' : (i === vis2.length - 1 ? ' last' : ''));
    visitRows += `<div class="dp-visit-row">
      <div class="dp-throw${cls1}">${v1 ? (v1.bust ? 'Bust' : v1.score) : ''}</div>
      <div class="dp-visit-num">${num}</div>
      <div class="dp-throw dp-throw-r${cls2}">${v2 ? (v2.bust ? 'Bust' : v2.score) : ''}</div>
    </div>`;
  }

  const boardName = isReadonly ? '👁 Canlı İzleme' : currentBoard.name;
  const headerRight = isReadonly
    ? `<button onclick="window.close()" class="btn secondary">Kapat</button>`
    : `<a href="/board.html" class="btn secondary">Board değiştir</a>`;

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${boardName}</div>
        <div class="match-info">
          ${m.round_label || ''} · Leg ${m.current_leg}${m.current_set > 1 ? ` · Set ${m.current_set}` : ''} ·
          Sıra: <strong>${isDoubles
            ? (() => {
                const activeEntry = isTurn1 ? m.entry1 : m.entry2;
                const subTurn = isTurn1 ? (m.p1_sub_turn || 1) : (m.p2_sub_turn || 1);
                const p = subTurn === 1 ? activeEntry?.player1 : activeEntry?.player2;
                return p?.nickname || p?.name || (isTurn1 ? e1 : e2);
              })()
            : (isTurn1 ? e1 : e2)}</strong>
          ${scorer ? ` · ✍️ ${scorer}` : ''}
        </div>
      </div>
      ${headerRight}
    </div>

    <div class="dp">
      <div class="dp-names ${isTurn1 ? 'p1-active' : 'p2-active'}">
        <div class="dp-name-col${isTurn1 ? ' active' : ''}">
          <div class="dp-leg-big">${legs1}</div>
          <div class="dp-name-center">
            ${isDoubles ? `
              <div class="dp-pname dp-pname-sub${isTurn1 && m.p1_sub_turn === 1 ? ' dp-sub-active' : ''}">${m.entry1?.player1?.nickname || m.entry1?.player1?.name || '?'}</div>
              <div class="dp-pname dp-pname-sub${isTurn1 && m.p1_sub_turn === 2 ? ' dp-sub-active' : ''}">${m.entry1?.player2?.nickname || m.entry1?.player2?.name || '?'}</div>
            ` : `<div class="dp-pname">${e1}</div>`}
            <div class="dp-meta"><span>Ort <strong>${avg1}</strong>${showSets ? ` · Set <strong>${m.p1_sets || 0}</strong>` : ''}</span></div>
          </div>
        </div>
        <div class="dp-names-mid"></div>
        <div class="dp-name-col${!isTurn1 ? ' active' : ''}" style="flex-direction:row-reverse;">
          <div class="dp-leg-big">${legs2}</div>
          <div class="dp-name-center">
            ${isDoubles ? `
              <div class="dp-pname dp-pname-sub${!isTurn1 && m.p2_sub_turn === 1 ? ' dp-sub-active' : ''}">${m.entry2?.player1?.nickname || m.entry2?.player1?.name || '?'}</div>
              <div class="dp-pname dp-pname-sub${!isTurn1 && m.p2_sub_turn === 2 ? ' dp-sub-active' : ''}">${m.entry2?.player2?.nickname || m.entry2?.player2?.name || '?'}</div>
            ` : `<div class="dp-pname">${e2}</div>`}
            <div class="dp-meta"><span>Ort <strong>${avg2}</strong>${showSets ? ` · Set <strong>${m.p2_sets || 0}</strong>` : ''}</span></div>
          </div>
        </div>
      </div>

      <div class="dp-scores${isTurn1 ? ' p1-active' : ' p2-active'}">
        <div class="dp-rem-row">
          <div class="dp-rem"${isTurn1 && !isReadonly ? ' onclick="submitRemaining()"' : ''}>${rem1}</div>
          <div></div>
          <div class="dp-rem dp-rem-r"${!isTurn1 && !isReadonly ? ' onclick="submitRemaining()"' : ''}>${rem2}</div>
        </div>
        <div class="dp-visit-table">
          ${visitRows}
        </div>
      </div>

      <div class="dp-gap"></div>

      ${isReadonly ? '' : `
      <div class="dp-keypad">
        <div class="dp-top">
          <div class="dp-undo" onclick="undoThrow()">Geri Al</div>
          <div class="dp-inp" id="keypad-input">${currentInput || '0'}</div>
          <div class="dp-gon" onclick="submitScore()">Gönder ▶</div>
        </div>
        <div class="dp-main">
          <div class="dp-quick">
            ${[26,40,41,43,45].map(s => `<div class="dp-qbtn" onclick="setScore(${s})">${s}</div>`).join('')}
          </div>
          <div class="dp-grid">
            ${[1,2,3,4,5,6,7,8,9].map(n => `<div class="dp-key" onclick="addDigit('${n}')">${n}</div>`).join('')}
            <div class="dp-key c" onclick="clearInput()">C</div>
            <div class="dp-key${currentInput ? '' : ' dp-key-180'}" id="key-zero" onclick="${currentInput ? "addDigit('0')" : 'setScore(180)'}">${currentInput ? '0' : '180'}</div>
            <div class="dp-key bust" onclick="submitBust()">Bust</div>
          </div>
          <div class="dp-quick">
            ${[60,81,85,100,140].map(s => `<div class="dp-qbtn" onclick="setScore(${s})">${s}</div>`).join('')}
          </div>
        </div>
      </div>
      <div class="dp-safe"></div>
      `}
    </div>
  `;

  // Atış tablosu: en son satır görünsün
  requestAnimationFrame(() => {
    const t = document.querySelector('.dp-visit-table');
    if (t) t.scrollTop = t.scrollHeight;
  });
}

function renderPlayer(name, remaining, legs, sets, active, m, showSets) {
  const isCricket = m.game_mode === 'cricket';
  const stats = m.stats?.find(s => s.player_slot === (active ? m.current_turn : (m.current_turn === 1 ? 2 : 1))) || {};
  return `
    <div class="player-panel ${active ? 'active' : ''}">
      <div class="player-name">${name}</div>
      <div class="player-sub">${isCricket ? 'Puan' : 'Kalan'}</div>
      <div class="score-display">${remaining}</div>
      <div class="player-stats">
        <div class="stat"><div class="label">Leg</div><div class="value">${legs}</div></div>
        ${showSets ? `<div class="stat"><div class="label">Set</div><div class="value">${sets}</div></div>` : ''}
        <div class="stat"><div class="label">Ort.</div><div class="value">${avg(stats).toFixed(1)}</div></div>
        <div class="stat"><div class="label">180</div><div class="value">${stats.one_eighty || 0}</div></div>
      </div>
    </div>
  `;
}

// ---- Cricket ekranı (yeni dart-bazlı UI — DartConnect tarzı) ----
const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];

// Eski API uyumluluğu — FB Cezalı ve Karambol hâlâ bu fonksiyonu kullanıyor.
// Yeni cricket UI'a geçtikten sonra (task #5/#6) silinecek.
function cricketMarksHtml(count, active) {
  if (count <= 0) return '<span class="cr-mark-empty">·</span>';
  if (count === 1) return `<span class="cr-mark${active ? ' cr-mark-act' : ''}">/</span>`;
  if (count === 2) return `<span class="cr-mark${active ? ' cr-mark-act' : ''}">╳</span>`;
  return `<span class="cr-mark cr-mark-closed">⊗</span>`;
}

// Marks sembolü: /, X, O (closed). Boşken zayıf nokta.
function cricketMarkSym(count) {
  if (count <= 0) return { sym: '·', cls: 'cr-m0' };
  if (count === 1) return { sym: '/', cls: 'cr-m1' };
  if (count === 2) return { sym: 'X', cls: 'cr-m2' };
  return { sym: 'O', cls: 'cr-m3' }; // 3+ closed
}

// Aktif oyuncunun pending dartlarından bu satıra düşen mark katkısını hesapla
function cricketPendingForTarget(target) {
  let extra = 0;
  for (const d of cricketDarts) {
    if (d.target === target && d.mult > 0) extra += d.mult;
  }
  return extra;
}

function renderCricketMatch(m) {
  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const isTurn1 = m.current_turn === 1;
  const boardName = isReadonly ? '👁 Canlı İzleme' : currentBoard?.name || '';
  const headerRight = isReadonly
    ? `<button onclick="window.close()" class="btn secondary">Kapat</button>`
    : `<a href="/board.html" class="btn secondary">Board değiştir</a>`;

  let state;
  try { state = m.cricket_state_json ? JSON.parse(m.cricket_state_json) : null; } catch { state = null; }
  if (!state) state = { marks: Object.fromEntries(CRICKET_NUMBERS.map(n => [n, {p1:0,p2:0}])), p1_score:0, p2_score:0 };

  const pKey = isTurn1 ? 'p1' : 'p2';

  // Hedef satırları
  const rows = CRICKET_NUMBERS.map(n => {
    const p1m = state.marks[n]?.p1 || 0;
    const p2m = state.marks[n]?.p2 || 0;
    // Aktif oyuncunun pending dartları kendi tarafına eklenir (görsel preview)
    const pendingForMe = isReadonly ? 0 : cricketPendingForTarget(n);
    // Görsel: hep p1 solda / p2 sağda — slot yer değiştirmez
    const leftCount  = p1m + (isTurn1 ? pendingForMe : 0);
    const rightCount = p2m + (isTurn1 ? 0 : pendingForMe);
    const lSym = cricketMarkSym(leftCount);
    const rSym = cricketMarkSym(rightCount);
    const bothClosed = leftCount >= 3 && rightCount >= 3;
    const numLabel = n === 25 ? 'BULL' : n;
    const isBull = (n === 25);

    if (isReadonly) {
      return `
        <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <div></div>
          <div class="cr-tap-num" style="cursor:default;">${numLabel}</div>
          <div></div>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>
      `;
    }

    const dBtn = isBull
      ? `<button class="cr-tap-dbull" onclick="cricketDart(25, 2)">D-BULL</button>`
      : `<button class="cr-tap-d" onclick="cricketDart(${n}, 2)">D</button>`;
    const tBtn = isBull
      ? `<div></div>`
      : `<button class="cr-tap-t" onclick="cricketDart(${n}, 3)">T</button>`;

    return `
      <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
        <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
        ${dBtn}
        <button class="cr-tap-num" onclick="cricketDart(${n}, 1)">${numLabel}</button>
        ${tBtn}
        <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
      </div>
    `;
  }).join('');

  // 3 dart slot göstergesi
  const dotsHtml = [0,1,2].map(i => {
    const d = cricketDarts[i];
    if (!d) return `<div class="cr-dot"></div>`;
    if (d.target == null) return `<div class="cr-dot cr-dot-miss">×</div>`;
    const pre = d.mult === 2 ? 'D' : d.mult === 3 ? 'T' : '';
    const lbl = d.target === 25 ? (d.mult === 2 ? 'DB' : 'B') : `${pre}${d.target}`;
    return `<div class="cr-dot cr-dot-hit">${lbl}</div>`;
  }).join('');

  const bottomBar = isReadonly ? '' : `
    <div class="cr-bottom-bar">
      <button class="cr-undo-btn" onclick="cricketUndoDart()" ${cricketDarts.length === 0 && !m.cricket_undo_json ? 'disabled' : ''}>← GERİ</button>
      <div class="cr-dots">${dotsHtml}</div>
      <button class="cr-miss-btn" onclick="submitCricketDarts()" ${cricketDarts.length === 0 ? 'disabled' : ''}>Enter</button>
    </div>
  `;

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${boardName}</div>
        <div class="match-info">
          ${m.round_label || ''} · Leg ${m.current_leg} ·
          Sıra: <strong>${isTurn1 ? e1 : e2}</strong>
        </div>
      </div>
      ${headerRight}
    </div>

    <div class="cr-wrap">
      <div class="cr-scores">
        <div class="cr-score-col${isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts">${state.p1_score || 0}</div>
          <div class="cr-legs">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts">${state.p2_score || 0}</div>
          <div class="cr-legs">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <div class="cr-targets">${rows}</div>

      ${bottomBar}
    </div>
  `;
}

// Dart girişi: target=null ışkal, mult=1 single / 2 double / 3 triple
function cricketDart(target, mult) {
  if (isReadonly || !currentMatch) return;
  if (cricketDarts.length >= 3) return;
  cricketDarts.push({ target, mult });
  if (cricketDarts.length === 3) {
    submitCricketDarts();
  } else {
    renderMatch();
  }
}

function cricketMiss() {
  cricketDart(null, 0);
}

function cricketUndoDart() {
  if (cricketDarts.length > 0) {
    cricketDarts.pop();
    renderMatch();
    return;
  }
  cricketConfirmAndUndoLastVisit();
}

// Cricket/FB/Karambol için ortak: önceki visit'i onaylı geri al
async function cricketConfirmAndUndoLastVisit() {
  if (!currentMatch) return;
  if (!currentMatch.cricket_undo_json) return toast('Geri alınacak visit yok');
  const ok = await cricketConfirm('Önceki visit geri alınsın mı?');
  if (!ok) return;
  const res = await api.post(`/api/matches/${currentMatch.id}/cricket-undo`, {});
  if (res.error) return toast('Hata: ' + res.error);
}

// Basit promise-based onay dialog'u
function cricketConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;padding:1rem;';
    overlay.innerHTML = `
      <div style="background:#1a1d2e;border:2px solid #ffd200;border-radius:14px;padding:1.5rem 1.75rem;max-width:420px;text-align:center;font-family:var(--font-sans,system-ui);">
        <div style="font-size:clamp(15px,3.5vmin,20px);color:#e2e8f0;margin-bottom:1.25rem;font-weight:600;">${message}</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;">
          <button data-no style="padding:0.85rem;background:#2a2e42;color:#e2e8f0;border:0;border-radius:8px;font-size:clamp(13px,3vmin,18px);font-weight:700;cursor:pointer;">Vazgeç</button>
          <button data-yes style="padding:0.85rem;background:#ffd200;color:#000;border:0;border-radius:8px;font-size:clamp(13px,3vmin,18px);font-weight:800;cursor:pointer;">Evet, geri al</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', kh, true);
      resolve(val);
    };
    overlay.querySelector('[data-no]').onclick = () => close(false);
    overlay.querySelector('[data-yes]').onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    const kh = (e) => { if (e.key === 'Escape') close(false); else if (e.key === 'Enter') close(true); };
    document.addEventListener('keydown', kh, true);
  });
}

async function submitCricketDarts() {
  if (!currentMatch) return;
  const slot = currentMatch.current_turn;
  // Dartları hits objesine roll-up
  const hits = {};
  for (const d of cricketDarts) {
    if (d.target == null || d.mult <= 0) continue;
    hits[d.target] = (hits[d.target] || 0) + d.mult;
  }
  // Visit'i temizle (server cevabı gelmeden önce — UI takılmasın)
  const sentDarts = cricketDarts.slice();
  cricketDarts = [];
  const res = await sendThrow(`/api/matches/${currentMatch.id}/cricket-throw`, {
    playerSlot: slot,
    hits,
  });
  if (res && res._queued) { showScoreFlash('✓', false); return; } // offline: kuyruğa alındı
  if (res && res.duplicate) return; // zaten işlenmiş
  if (res.error) {
    // Hata durumunda dartları geri yükle
    cricketDarts = sentDarts;
    renderMatch();
    return toast('Hata: ' + res.error);
  }
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
    if (!res.matchFinished) showLegScoreFlash(res.legSummary.p1_legs ?? 0, res.legSummary.p2_legs ?? 0);
  }
  if (res.matchFinished) toast('Maç tamamlandı!');
}


// ---- Cricket Full Board Cezalı ekranı (yeni dart-bazlı UI) ----
// Sıralama: 20→10, sonra D, T, B (Bull), H (House)
const FB_TARGETS_ALL  = ['20','19','18','17','16','15','14','13','12','11','10','D','T','25','H'];
const FB_TARGET_LABEL = { '25':'BULL', 'D':'D', 'T':'T', 'H':'H' };
let fbDarts = []; // [{target:'20'|..., mult:1|2|3} | {target:null,mult:0}]
// "Ceza yazma modu" — D / T / H meta hedefi bende kapalı + rakipte açık iken
// meta butona basıp dart taps'leri puan olarak yazma akışı
let fbMetaMode  = null;  // 'D' | 'T' | 'H' | null
let fbMetaScore = 0;     // mod aktifken biriken toplam puan

function fbTargetLabel(t) { return FB_TARGET_LABEL[t] || t; }
function fbIsNumberTarget(t) { return !isNaN(parseInt(t)); }  // 10-20, 25
function fbIsMetaTarget(t)   { return t === 'D' || t === 'T' || t === 'H'; }
function fbPendingForTarget(target) {
  let extra = 0;
  for (const d of fbDarts) if (d.target === target && d.mult > 0) extra += d.mult;
  return extra;
}

function renderFBCezaliMatch(m) {
  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const isTurn1 = m.current_turn === 1;
  const boardName = isReadonly ? '👁 Canlı İzleme' : currentBoard?.name || '';
  const headerRight = isReadonly
    ? `<button onclick="window.close()" class="btn secondary">Kapat</button>`
    : `<a href="/board.html" class="btn secondary">Board değiştir</a>`;

  let state;
  try { state = m.cricket_state_json ? JSON.parse(m.cricket_state_json) : null; } catch { state = null; }
  if (!state) state = { marks: {}, p1_score: 0, p2_score: 0, include_low: true };

  const activeTargets = FB_TARGETS_ALL.filter(t => {
    if ((t === '10' || t === '11') && !state.include_low) return false;
    return true;
  });

  const rows = activeTargets.map(t => {
    const p1m = state.marks[t]?.p1 || 0;
    const p2m = state.marks[t]?.p2 || 0;
    const pendingForMe = isReadonly ? 0 : fbPendingForTarget(t);
    const leftCount  = Math.min(3, p1m + (isTurn1 ? pendingForMe : 0));
    const rightCount = Math.min(3, p2m + (isTurn1 ? 0 : pendingForMe));
    const lSym = cricketMarkSym(leftCount);
    const rSym = cricketMarkSym(rightCount);
    const bothClosed = leftCount >= 3 && rightCount >= 3;
    const label = fbTargetLabel(t);
    const isBull = (t === '25');
    const isMeta = fbIsMetaTarget(t);

    if (isReadonly) {
      return `
        <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <div></div>
          <div class="cr-tap-num" style="cursor:default;">${label}</div>
          <div></div>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    if (isMeta) {
      // D / T / H — tek geniş buton. Akıllı handler: meta hedefi açıksa +1 mark,
      // kapalı + rakipte açık ise "ceza yazma modu"nu açar/kapatır.
      const modeOn = (fbMetaMode === t);
      return `
        <div class="cr-target-row cr-target-meta${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <button class="cr-tap-num cr-tap-meta${modeOn ? ' cr-tap-meta-active' : ''}" onclick="fbMetaTap('${t}')">${label}${modeOn ? ' ✓' : ''}</button>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    if (isBull) {
      return `
        <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <button class="cr-tap-dbull" onclick="fbDart('25', 2)">D-BULL</button>
          <button class="cr-tap-num" onclick="fbDart('25', 1)">${label}</button>
          <div></div>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    // 10-20 — standart row: D / NUM / T
    return `
      <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
        <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
        <button class="cr-tap-d" onclick="fbDart('${t}', 2)">D</button>
        <button class="cr-tap-num" onclick="fbDart('${t}', 1)">${label}</button>
        <button class="cr-tap-t" onclick="fbDart('${t}', 3)">T</button>
        <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
      </div>`;
  }).join('');

  // Visit dot indicators
  const dotsHtml = [0,1,2].map(i => {
    const d = fbDarts[i];
    if (!d) return `<div class="cr-dot"></div>`;
    if (d.target == null) return `<div class="cr-dot cr-dot-miss">×</div>`;
    const pre = d.mult === 2 ? 'D' : d.mult === 3 ? 'T' : '';
    const tLabel = d.target === '25' ? (d.mult === 2 ? 'DB' : 'B') : d.target;
    return `<div class="cr-dot cr-dot-hit">${pre}${tLabel}</div>`;
  }).join('');

  const modeBar = fbMetaMode
    ? `<div class="cr-mode-bar">
         <span class="cr-mode-label">${fbMetaMode} CEZA</span>
         <span class="cr-mode-tip">— atışlarını tuşla</span>
         <span class="cr-mode-score">${fbMetaScore}</span>
       </div>`
    : '';

  const bottomBar = isReadonly ? '' : `
    ${modeBar}
    <div class="cr-bottom-bar">
      <button class="cr-undo-btn" onclick="fbUndoDart()" ${fbDarts.length === 0 && !m.cricket_undo_json ? 'disabled' : ''}>← GERİ</button>
      <div class="cr-dots">${dotsHtml}</div>
      <button class="cr-miss-btn" onclick="submitFBCezaliDarts()" ${fbDarts.length === 0 ? 'disabled' : ''}>Enter</button>
    </div>`;

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${boardName}</div>
        <div class="match-info">
          ${m.round_label || ''} · Leg ${m.current_leg} ·
          Sıra: <strong>${isTurn1 ? e1 : e2}</strong>
        </div>
      </div>
      ${headerRight}
    </div>

    <div class="cr-wrap">
      <div class="cr-scores">
        <div class="cr-score-col${isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts">${state.p1_score || 0}</div>
          <div class="cr-legs">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts">${state.p2_score || 0}</div>
          <div class="cr-legs">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <div class="cr-targets cr-targets-fb">${rows}</div>

      ${bottomBar}
    </div>
  `;
}

// Big D / T / H meta butona basıldığında akıllı handler
function fbMetaTap(metaTarget) {
  if (isReadonly || !currentMatch) return;

  // Mod aktifken aynı meta'ya tekrar basmak iptal
  if (fbMetaMode === metaTarget) {
    fbMetaMode = null;
    fbMetaScore = 0;
    fbDarts = [];
    renderMatch();
    return;
  }

  // Mevcut state — mod açma kararı için
  let state;
  try { state = currentMatch.cricket_state_json ? JSON.parse(currentMatch.cricket_state_json) : null; } catch { state = null; }
  if (!state) state = { marks: {} };

  const slot = currentMatch.current_turn;
  const pKey = `p${slot}`;
  const oppKey = slot === 1 ? 'p2' : 'p1';
  const myMeta  = state.marks?.[metaTarget]?.[pKey]   || 0;
  const oppMeta = state.marks?.[metaTarget]?.[oppKey] || 0;

  if (myMeta >= 3 && oppMeta < 3) {
    // Ceza yazma modu — explicit
    fbMetaMode = metaTarget;
    fbMetaScore = 0;
    fbDarts = [];
    renderMatch();
  } else {
    // Normal +1 mark akışı — H için visit başına 1 kez (3 ok = 1 H mark)
    if (metaTarget === 'H' && fbDarts.some(d => d.target === 'H')) {
      toast('H bu visit\'te zaten kaydedildi');
      return;
    }
    fbDart(metaTarget, 1);
  }
}

function fbDart(target, mult) {
  if (isReadonly || !currentMatch) return;
  if (fbDarts.length >= 3) return;

  // Ceza yazma modu — dart taps puan ekler, mark eklemez
  if (fbMetaMode) {
    if (target == null) {
      // ISKA — boş slot, puan eklemez
      fbDarts.push({ target: null, mult: 0 });
    } else {
      const N = parseInt(target);
      if (isNaN(N)) {
        toast(`${fbMetaMode} ceza modu için sayıya bas`);
        return;
      }
      let valid = false;
      let value = 0;
      if (fbMetaMode === 'D') {
        if (mult === 2) { valid = true; value = 2 * N; } // D-on-N veya D-Bull (N=25, mult=2)
      } else if (fbMetaMode === 'T') {
        if (mult === 3) { valid = true; value = 3 * N; }
      } else if (fbMetaMode === 'H') {
        // H = 3 ok aynı segmentte (sayıda) olmak zorunda; multiplier (S/D/T) fark etmez
        // Skor her dart için kendi değeri (D20=40, T20=60, S20=20)
        const firstValid = fbDarts.find(d => d.target != null && d.mult > 0);
        if (!firstValid)                              { valid = true; value = mult * N; }
        else if (firstValid.target === String(target)) { valid = true; value = mult * N; }
      }
      if (!valid) {
        if      (fbMetaMode === 'D') toast('D ceza modu: D butonu ya da D-BULL atışı gerekli');
        else if (fbMetaMode === 'T') toast('T ceza modu: T butonu atışı gerekli');
        else if (fbMetaMode === 'H') toast('H ceza modu: 3 ok aynı segmentte olmalı');
        return;
      }
      fbDarts.push({ target: String(target), mult });
      fbMetaScore += value;
    }
    if (fbDarts.length === 3) submitFBCezaliDarts();
    else renderMatch();
    return;
  }

  // Normal mark modu
  fbDarts.push({ target: target == null ? null : String(target), mult });
  if (fbDarts.length === 3) submitFBCezaliDarts();
  else renderMatch();
}

function fbMiss() { fbDart(null, 0); }

function fbUndoDart() {
  if (fbDarts.length > 0) {
    const last = fbDarts.pop();
    if (fbMetaMode && last && last.target != null && last.mult > 0) {
      const N = parseInt(last.target);
      if (!isNaN(N)) {
        fbMetaScore -= last.mult * N;
        if (fbMetaScore < 0) fbMetaScore = 0;
      }
    }
    renderMatch();
    return;
  }
  cricketConfirmAndUndoLastVisit();
}

async function submitFBCezaliDarts() {
  if (!currentMatch) return;
  const slot = currentMatch.current_turn;

  let payload;

  if (fbMetaMode) {
    // Ceza yazma modu — sadece skor, mark yok
    payload = { playerSlot: slot, allocation: { marks: {}, score: fbMetaScore } };
  } else {
    // Normal mark modu (+ D/T fallback puan otomasyonu)
    const pKey   = `p${slot}`;
    const oppKey = slot === 1 ? 'p2' : 'p1';
    let preState;
    try { preState = currentMatch.cricket_state_json ? JSON.parse(currentMatch.cricket_state_json) : null; } catch { preState = null; }
    if (!preState) preState = { marks: {} };
    const myDClosed   = (preState.marks?.['D']?.[pKey]   || 0) >= 3;
    const oppDOpen    = (preState.marks?.['D']?.[oppKey] || 0) <  3;
    const myTClosed   = (preState.marks?.['T']?.[pKey]   || 0) >= 3;
    const oppTOpen    = (preState.marks?.['T']?.[oppKey] || 0) <  3;
    const dFallbackOK = myDClosed && oppDOpen;
    const tFallbackOK = myTClosed && oppTOpen;

    const marksObj = {};
    let fallbackScore = 0;
    for (const d of fbDarts) {
      if (d.target == null || d.mult <= 0) continue;
      marksObj[d.target] = (marksObj[d.target] || 0) + d.mult;
      const N = parseInt(d.target);
      if (isNaN(N)) continue;
      const oppMarks = preState.marks?.[d.target]?.[oppKey] || 0;
      if (oppMarks < 3) continue; // sayı rakipte açık — engine zaten halleder
      if (d.mult === 2 && dFallbackOK)      fallbackScore += 2 * N;
      else if (d.mult === 3 && tFallbackOK) fallbackScore += 3 * N;
    }
    payload = { playerSlot: slot, allocation: { marks: marksObj, score: fallbackScore } };
  }

  const sentDarts  = fbDarts.slice();
  const sentMode   = fbMetaMode;
  const sentScore  = fbMetaScore;
  fbDarts = [];
  fbMetaMode = null;
  fbMetaScore = 0;

  const res = await sendThrow(`/api/matches/${currentMatch.id}/fb-cezali-throw`, payload);
  if (res && res._queued) { showScoreFlash('✓', false); return; }
  if (res && res.duplicate) return;
  if (res.error) {
    fbDarts = sentDarts;
    fbMetaMode = sentMode;
    fbMetaScore = sentScore;
    renderMatch();
    return toast('Hata: ' + res.error);
  }
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
    if (!res.matchFinished) showLegScoreFlash(res.legSummary.p1_legs ?? 0, res.legSummary.p2_legs ?? 0);
    if (currentMatch?.entry1?.player2 || currentMatch?.entry2?.player2) {
      await askDoublesSubStarters(currentMatch);
      await api.post(`/api/matches/${currentMatch.id}/set-sub-starters`, {
        p1_sub_turn: selectedSubStarter1,
        p2_sub_turn: selectedSubStarter2,
      });
      selectedSubStarter1 = null;
      selectedSubStarter2 = null;
    }
  }
  if (res.matchFinished) toast('Maç tamamlandı!');
}


// ---- Cricket Full Board Karambol ekranı (yeni dart-bazlı UI) ----
// FB Cezalı ile aynı görünüm/akış — fark: skor yok (sadece leg sayısı), endpoint farklı
let karambolDarts = [];

function karambolPendingForTarget(target) {
  let extra = 0;
  for (const d of karambolDarts) if (d.target === target && d.mult > 0) extra += d.mult;
  return extra;
}

function renderKarambolMatch(m) {
  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const isTurn1 = m.current_turn === 1;
  const boardName = isReadonly ? '👁 Canlı İzleme' : currentBoard?.name || '';
  const headerRight = isReadonly
    ? `<button onclick="window.close()" class="btn secondary">Kapat</button>`
    : `<a href="/board.html" class="btn secondary">Board değiştir</a>`;

  let state;
  try { state = m.cricket_state_json ? JSON.parse(m.cricket_state_json) : null; } catch { state = null; }
  if (!state) state = { marks: {}, include_low: true };

  const activeTargets = FB_TARGETS_ALL.filter(t => {
    if ((t === '10' || t === '11') && !state.include_low) return false;
    return true;
  });

  const rows = activeTargets.map(t => {
    const p1m = state.marks[t]?.p1 || 0;
    const p2m = state.marks[t]?.p2 || 0;
    const pendingForMe = isReadonly ? 0 : karambolPendingForTarget(t);
    const leftCount  = Math.min(3, p1m + (isTurn1 ? pendingForMe : 0));
    const rightCount = Math.min(3, p2m + (isTurn1 ? 0 : pendingForMe));
    const lSym = cricketMarkSym(leftCount);
    const rSym = cricketMarkSym(rightCount);
    const bothClosed = leftCount >= 3 && rightCount >= 3;
    const label = fbTargetLabel(t);
    const isBull = (t === '25');
    const isMeta = fbIsMetaTarget(t);

    if (isReadonly) {
      return `
        <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <div></div>
          <div class="cr-tap-num" style="cursor:default;">${label}</div>
          <div></div>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    if (isMeta) {
      return `
        <div class="cr-target-row cr-target-meta${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <button class="cr-tap-num cr-tap-meta" onclick="karambolDart('${t}', 1)">${label}</button>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    if (isBull) {
      return `
        <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
          <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
          <button class="cr-tap-dbull" onclick="karambolDart('25', 2)">D-BULL</button>
          <button class="cr-tap-num" onclick="karambolDart('25', 1)">${label}</button>
          <div></div>
          <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
        </div>`;
    }

    return `
      <div class="cr-target-row${bothClosed ? ' cr-target-done' : ''}">
        <div class="cr-marks-l ${lSym.cls}${isTurn1 ? ' cr-active' : ''}">${lSym.sym}</div>
        <button class="cr-tap-d" onclick="karambolDart('${t}', 2)">D</button>
        <button class="cr-tap-num" onclick="karambolDart('${t}', 1)">${label}</button>
        <button class="cr-tap-t" onclick="karambolDart('${t}', 3)">T</button>
        <div class="cr-marks-r ${rSym.cls}${!isTurn1 ? ' cr-active' : ''}">${rSym.sym}</div>
      </div>`;
  }).join('');

  const dotsHtml = [0,1,2].map(i => {
    const d = karambolDarts[i];
    if (!d) return `<div class="cr-dot"></div>`;
    if (d.target == null) return `<div class="cr-dot cr-dot-miss">×</div>`;
    const pre = d.mult === 2 ? 'D' : d.mult === 3 ? 'T' : '';
    const tLabel = d.target === '25' ? (d.mult === 2 ? 'DB' : 'B') : d.target;
    return `<div class="cr-dot cr-dot-hit">${pre}${tLabel}</div>`;
  }).join('');

  const bottomBar = isReadonly ? '' : `
    <div class="cr-bottom-bar">
      <button class="cr-undo-btn" onclick="karambolUndoDart()" ${karambolDarts.length === 0 && !m.cricket_undo_json ? 'disabled' : ''}>← GERİ</button>
      <div class="cr-dots">${dotsHtml}</div>
      <button class="cr-miss-btn" onclick="submitKarambolDarts()" ${karambolDarts.length === 0 ? 'disabled' : ''}>Enter</button>
    </div>`;

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${boardName}</div>
        <div class="match-info">
          ${m.round_label || ''} · Leg ${m.current_leg} ·
          Sıra: <strong>${isTurn1 ? e1 : e2}</strong>
        </div>
      </div>
      ${headerRight}
    </div>

    <div class="cr-wrap">
      <div class="cr-scores">
        <div class="cr-score-col${isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts" style="font-size:clamp(20px,5vmin,38px);">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-flip-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts" style="font-size:clamp(20px,5vmin,38px);">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <div class="cr-targets cr-targets-fb">${rows}</div>

      ${bottomBar}
    </div>
  `;
}

function karambolDart(target, mult) {
  if (isReadonly || !currentMatch) return;
  if (karambolDarts.length >= 3) return;
  // H için visit başına 1 kez (3 ok = 1 H mark)
  if (target === 'H' && karambolDarts.some(d => d.target === 'H')) {
    toast('H bu visit\'te zaten kaydedildi');
    return;
  }
  karambolDarts.push({ target: target == null ? null : String(target), mult });
  if (karambolDarts.length === 3) submitKarambolDarts();
  else renderMatch();
}

function karambolMiss() { karambolDart(null, 0); }

function karambolUndoDart() {
  if (karambolDarts.length > 0) {
    karambolDarts.pop();
    renderMatch();
    return;
  }
  cricketConfirmAndUndoLastVisit();
}

async function submitKarambolDarts() {
  if (!currentMatch) return;
  const slot = currentMatch.current_turn;
  const marksObj = {};
  for (const d of karambolDarts) {
    if (d.target == null || d.mult <= 0) continue;
    marksObj[d.target] = (marksObj[d.target] || 0) + d.mult;
  }
  const sentDarts = karambolDarts.slice();
  karambolDarts = [];
  const res = await sendThrow(`/api/matches/${currentMatch.id}/karambol-throw`, {
    playerSlot: slot,
    allocation: { marks: marksObj },
  });
  if (res && res._queued) { showScoreFlash('✓', false); return; }
  if (res && res.duplicate) return;
  if (res.error) {
    karambolDarts = sentDarts;
    renderMatch();
    return toast('Hata: ' + res.error);
  }
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
    if (!res.matchFinished) showLegScoreFlash(res.legSummary.p1_legs ?? 0, res.legSummary.p2_legs ?? 0);
    if (currentMatch?.entry1?.player2 || currentMatch?.entry2?.player2) {
      await askDoublesSubStarters(currentMatch);
      await api.post(`/api/matches/${currentMatch.id}/set-sub-starters`, {
        p1_sub_turn: selectedSubStarter1,
        p2_sub_turn: selectedSubStarter2,
      });
      selectedSubStarter1 = null;
      selectedSubStarter2 = null;
    }
  }
  if (res.matchFinished) toast('Maç tamamlandı!');
}

// ---- Post-match ekranı (status === 'finished') ----
function renderPostMatch() {
  const m = currentMatch;
  // Turnuvada başka oynanacak maç var mı? Yoksa bu final/son maçtır.
  const t = allTournaments.find(tt => tt.id === m.tournament_id);
  const hasMoreMatches = t?.matches?.some(
    mx => mx.id !== m.id && mx.status !== 'finished' && mx.entry1_id && mx.entry2_id
  );
  const winnerEntry = m.winner_entry_id === m.entry1_id ? m.entry1 : m.entry2;
  const loserEntry  = m.winner_entry_id === m.entry1_id ? m.entry2 : m.entry1;
  const winnerSlot  = m.winner_entry_id === m.entry1_id ? 1 : 2;
  const loserSlot   = winnerSlot === 1 ? 2 : 1;
  const wStats = (m.stats || []).find(s => s.player_slot === winnerSlot) || {};
  const lStats = (m.stats || []).find(s => s.player_slot === loserSlot) || {};
  const wLegs = winnerSlot === 1 ? m.p1_legs : m.p2_legs;
  const lLegs = loserSlot === 1 ? m.p1_legs : m.p2_legs;
  const wSets = winnerSlot === 1 ? m.p1_sets : m.p2_sets;
  const lSets = loserSlot === 1 ? m.p1_sets : m.p2_sets;
  const scorer = m.scorer ? entryLabel(m.scorer) : null;
  const isTeamPool = (m.tournament_name || '').startsWith('__team_pool_');
  const postTName  = isTeamPool ? 'Takım Maçı' : (m.tournament_name || '');

  const setLegLabel = (s, l) => (s > 0 ? `${s} set ${l} leg` : `${l} leg`);

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${currentBoard.name}</div>
        <div class="match-info">${postTName} · ${m.round_label || ''} · MAÇ BİTTİ</div>
      </div>
      <a href="/board.html" class="btn secondary">Board değiştir</a>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: flex-start; align-items: center; padding: 1rem; gap: 1rem; overflow-y: auto; min-height: 0;">
      <div style="text-align: center;">
        <div style="font-size: 1rem; letter-spacing: 0.15em; color: var(--text-dim); text-transform: uppercase;">Maç Sonucu</div>
        <div style="font-size: 2rem; font-weight: 800; margin-top: 0.25rem;">${m.round_label || ''}</div>
      </div>

      <div style="width: 100%; max-width: 880px; display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem;">
        <div class="card" style="background: linear-gradient(180deg, rgba(34,197,94,0.15), rgba(34,197,94,0.04)); border: 2px solid #22c55e; padding: 1.5rem; text-align: center;">
          <div style="font-size: 0.85rem; color: #22c55e; font-weight: 700; letter-spacing: 0.2em;">🏆 KAZANAN</div>
          <div style="font-size: 2.1rem; font-weight: 800; margin-top: 0.5rem;">${entryLabel(winnerEntry)}</div>
          <div style="font-size: 0.95rem; color: var(--text-dim); margin-top: 0.25rem;">${setLegLabel(wSets, wLegs)}</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem; font-variant-numeric: tabular-nums;">
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">3-Ok Ort.</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${avg(wStats).toFixed(2)}</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">180</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${wStats.one_eighty || 0}</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Best CO</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${wStats.best_checkout || 0}</div>
            </div>
          </div>
        </div>

        <div class="card" style="background: var(--surface-2); border: 2px solid var(--surface-3, #2a2f3a); padding: 1.5rem; text-align: center;">
          <div style="font-size: 0.85rem; color: var(--text-dim); font-weight: 700; letter-spacing: 0.2em;">KAYBEDEN</div>
          <div style="font-size: 2.1rem; font-weight: 800; margin-top: 0.5rem; opacity: 0.85;">${entryLabel(loserEntry)}</div>
          <div style="font-size: 0.95rem; color: var(--text-dim); margin-top: 0.25rem;">${setLegLabel(lSets, lLegs)}</div>
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 1rem; font-variant-numeric: tabular-nums;">
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">3-Ok Ort.</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${avg(lStats).toFixed(2)}</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">180</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${lStats.one_eighty || 0}</div>
            </div>
            <div>
              <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase;">Best CO</div>
              <div style="font-size: 1.6rem; font-weight: 800;">${lStats.best_checkout || 0}</div>
            </div>
          </div>
        </div>
      </div>

      ${scorer ? `<div style="color: var(--text-dim); font-size: 0.95rem;">✍️ Yazıcı-Hakem: <strong style="color: var(--text);">${scorer}</strong></div>` : ''}

      ${hasMoreMatches ? `
        <button class="btn" style="font-size: 1.3rem; padding: 1rem 2.5rem; background: var(--accent); color: #000; font-weight: 800; border-radius: 12px; margin-top: 0.5rem;" onclick="nextMatch()">
          ➜ SONRAKİ MAÇ
        </button>
        <div style="font-size: 0.85rem; color: var(--text-dim);">
          Bu butona bastığınızda board serbest kalır ve sıradaki maç otomatik yüklenir.
        </div>
      ` : `
        <div style="font-size: 1.4rem; font-weight: 800; color: #22c55e; margin-top: 0.75rem; text-align: center;">
          ${isTeamPool ? '✅ Takım maçı kaydedildi!' : '🏆 Turnuva tamamlandı!'}
        </div>
        <button class="btn secondary" style="font-size: 1rem; padding: 0.75rem 2rem; margin-top: 0.25rem; border-radius: 12px;" onclick="nextMatch()">
          Board'u serbest bırak
        </button>
      `}
    </div>
  `;
}

async function nextMatch() {
  if (!currentBoard) return;
  const res = await api.post(`/api/boards/${currentBoard.id}/next`, {});
  if (res.error) return toast('Hata: ' + res.error);
  toast('Sonraki maç yükleniyor…');
}

// ---- Actions ----
function addDigit(d) {
  if (currentInput.length >= 3) return;
  currentInput = (currentInput + d).replace(/^0+(?=\d)/, '');
  const n = +currentInput;
  if (n > 180) { currentInput = '180'; }
  updateInput();
}
function clearInput() { currentInput = ''; updateInput(); }
function setScore(n) { currentInput = '' + n; updateInput(); }
function updateInput() {
  const el = document.getElementById('keypad-input');
  if (el) el.textContent = currentInput || '0';
  // 0 tuşu: input yoksa "180" göster ve tıklayınca 180 girer; input varsa normal "0"
  const keyZero = document.getElementById('key-zero');
  if (keyZero) {
    keyZero.textContent = currentInput ? '0' : '180';
    keyZero.onclick = currentInput ? () => addDigit('0') : () => setScore(180);
    keyZero.classList.toggle('dp-key-180', !currentInput);
  }
  const submitBtn = document.querySelector('.keypad-grid .submit');
  if (submitBtn) submitBtn.textContent = `Skor Gönder (${currentInput || '0'})`;
}

async function submitScore() {
  if (!currentMatch) return;
  const score = +currentInput || 0;
  const slot = currentMatch.current_turn;
  const m = currentMatch;
  const isX01 = m.game_mode !== 'cricket';
  const rem = slot === 1 ? (m.p1_leg_score ?? getStartScore(m)) : (m.p2_leg_score ?? getStartScore(m));

  // Checkout tespiti: X01 modunda kalan tam tutuyorsa, son visit'te kaç ok atıldığını sor.
  // (1 → mümkün sadece belli skorlarda, ama oyuncu en iyi bilir; UI'a güveniyoruz.)
  let finishDarts = null;
  if (isX01 && score > 0 && score === rem) {
    finishDarts = await askFinishDarts(score);
    if (finishDarts === null) return; // Kullanıcı vazgeçti
  }

  const body = { playerSlot: slot, score };
  if (finishDarts) body.finishDarts = finishDarts;

  const res = await sendThrow(`/api/matches/${currentMatch.id}/throw`, body);
  // Offline → atış kuyruğa alındı; kalan/sıra bağlantı gelince güncellenecek.
  if (res && res._queued) {
    currentInput = '';
    showScoreFlash(String(score), false);
    return;
  }
  // Aynı atış zaten işlenmiş (yeniden gönderim) → çift sayma yok; state tazelenir.
  if (res && res.duplicate) { currentInput = ''; return; }
  if (res.error) return toast('Hata: ' + res.error);
  currentInput = '';
  // Flash efekti — kalan skor kutusuna kısa parıltı
  const inputEl = document.getElementById('keypad-input');
  if (inputEl) { inputEl.classList.remove('score-flash'); void inputEl.offsetWidth; inputEl.classList.add('score-flash'); }
  if (res.bust) toast('Bust!');
  // Atış flash'ı — kaydedilen sayı ekran ortasında ~1 sn belirip soluyor (tıklamayı engellemez).
  // Leg bittiyse zaten leg-özeti açılıyor, çakışmasın diye flash gösterme.
  if (!res.legFinished) showScoreFlash(res.bust ? 'Bust' : String(score), res.bust);
  // Leg bitti ama maç bitmediyse → mini özet modalı göster ve onay bekle.
  // (Maç tamamlandıysa zaten post-match ekranı açılıyor; ayrıca özet vermiyoruz.)
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
    if (!res.matchFinished) showLegScoreFlash(res.legSummary.p1_legs ?? 0, res.legSummary.p2_legs ?? 0);
    // Doubles: yeni leg için her takımdan ilk atanı sor
    const isDoubles = !!(currentMatch?.entry1?.player2 || currentMatch?.entry2?.player2);
    if (isDoubles && currentMatch) {
      const subs = await askDoublesSubStarters(currentMatch);
      if (subs) {
        await api.post(`/api/matches/${currentMatch.id}/set-sub-starters`, subs);
      }
    }
  }
  if (res.matchFinished) toast('Maç tamamlandı!');
}

// Kalan-dokun kolaylığı (checkout): keypad'e YENİ kalanı yazıp aktif oyuncunun
// kalan sayısına dokununca, atılan skor = mevcut kalan − yazılan kalan olarak hesaplanır.
// Hesaplanan skoru normal submitScore akışına verir (checkout/bust kuralları aynen geçerli).
function submitRemaining() {
  if (!currentMatch) return;
  const m = currentMatch;
  if (m.game_mode === 'cricket') return;
  if (!currentInput) return toast('Önce keypad\'e kalan sayıyı yaz');
  const slot = m.current_turn;
  const currentRem = slot === 1 ? (m.p1_leg_score ?? getStartScore(m)) : (m.p2_leg_score ?? getStartScore(m));
  const newRem = +currentInput;
  if (isNaN(newRem) || newRem < 0) return;
  if (newRem > currentRem) return toast('Yeni kalan, mevcut kalandan büyük olamaz');
  const score = currentRem - newRem;
  if (score > 180) return toast('Bir visit 180\'den fazla olamaz');
  currentInput = String(score);
  submitScore();
}

// BUST tuşu — gerçek bust kaydı (skor 0, kalan değişmez, sıra rakibe geçer).
// İstatistik: 3 ok atıldı, 0 puan (motor tarafında). Leg bitmez.
async function submitBust() {
  if (!currentMatch) return;
  const m = currentMatch;
  if (m.game_mode === 'cricket') return;
  const slot = m.current_turn;
  const res = await sendThrow(`/api/matches/${currentMatch.id}/throw`, { playerSlot: slot, score: 0, bust: true });
  if (res && res._queued) { currentInput = ''; showScoreFlash('Bust', true); return; }
  if (res && res.duplicate) { currentInput = ''; return; }
  if (res.error) return toast('Hata: ' + res.error);
  currentInput = '';
  const inputEl = document.getElementById('keypad-input');
  if (inputEl) { inputEl.classList.remove('score-flash'); void inputEl.offsetWidth; inputEl.classList.add('score-flash'); }
  showScoreFlash('Bust', true);
}

// Atış flash modalı — kaydedilen sayıyı ekran ortasında kısa süre gösterir.
// Tıklamayı engellemez (pointer-events: none), kendiliğinden silinir.
let _scoreFlashEl = null;
function showScoreFlash(text, isBust) {
  if (_scoreFlashEl) { _scoreFlashEl.remove(); _scoreFlashEl = null; }
  const el = document.createElement('div');
  el.className = 'score-flash-modal' + (isBust ? ' bust' : '');
  el.innerHTML = `<div class="score-flash-num">${text}</div>`;
  document.body.appendChild(el);
  _scoreFlashEl = el;
  void el.offsetWidth; // reflow → giriş animasyonu
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { if (el === _scoreFlashEl) _scoreFlashEl = null; el.remove(); }, 250);
  }, 800);
}

// Leg skoru flash modalı — leg bitip yeni leg ekranı açılırken maçın leg sayısını
// (örn. "0-1", "3-2") ekran ortasında ~1.2 sn gösterir. Tıklamayı engellemez.
let _legFlashEl = null;
function showLegScoreFlash(p1, p2) {
  if (_legFlashEl) { _legFlashEl.remove(); _legFlashEl = null; }
  const el = document.createElement('div');
  el.className = 'score-flash-modal leg-flash';
  el.innerHTML = `<div class="score-flash-num">${p1}-${p2}</div>`;
  document.body.appendChild(el);
  _legFlashEl = el;
  void el.offsetWidth;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => { if (el === _legFlashEl) _legFlashEl = null; el.remove(); }, 250);
  }, 1200);
}

// Checkout anında "Bitiren çift kaçıncı oktu?" promptu.
// 1 / 2 / 3 butonlarından birine basınca o sayıyı döndürür; kapatınca null.
function askFinishDarts(score) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'finish-prompt';
    overlay.innerHTML = `
      <div class="finish-prompt-card">
        <div class="finish-prompt-title">Checkout: ${score}</div>
        <div class="finish-prompt-sub">Bitiren çift kaçıncı oktu?</div>
        <div class="finish-prompt-buttons">
          <button data-fd="1">1. ok</button>
          <button data-fd="2">2. ok</button>
          <button data-fd="3">3. ok</button>
        </div>
        <button class="finish-prompt-cancel">İptal</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => {
      overlay.remove();
      resolve(val);
    };
    overlay.querySelectorAll('button[data-fd]').forEach(b => {
      b.onclick = () => close(+b.dataset.fd);
    });
    overlay.querySelector('.finish-prompt-cancel').onclick = () => close(null);
    // Klavye 1/2/3 ile de seçim
    const keyHandler = (e) => {
      if (e.key === '1' || e.key === '2' || e.key === '3') {
        document.removeEventListener('keydown', keyHandler, true);
        close(+e.key);
      } else if (e.key === 'Escape') {
        document.removeEventListener('keydown', keyHandler, true);
        close(null);
      }
    };
    document.addEventListener('keydown', keyHandler, true);
  });
}

// Doubles: yeni leg başında her takımdan ilk atanı seç.
// { p1_sub_turn, p2_sub_turn } döner.
function askDoublesSubStarters(match) {
  return new Promise((resolve) => {
    const e1 = entryLabel(match.entry1);
    const e2 = entryLabel(match.entry2);
    const sel = { 1: null, 2: null };

    const overlay = document.createElement('div');
    overlay.className = 'finish-prompt';

    const renderModal = () => {
      overlay.innerHTML = `
        <div class="finish-prompt-card" style="max-width: 480px; width: 92vw;">
          <div class="finish-prompt-title" style="font-size: clamp(14px,4vw,22px);">Yeni Leg — İlk Atanlar</div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: clamp(8px,2.5vw,18px); margin-top: clamp(10px,3vw,20px);">
            ${[1, 2].map(slot => {
              const entry = slot === 1 ? match.entry1 : match.entry2;
              const teamLabel = slot === 1 ? e1 : e2;
              const p1name = entry?.player1?.nickname || entry?.player1?.name || '?';
              const p2name = entry?.player2?.nickname || entry?.player2?.name || '?';
              const picked = sel[slot];
              return `
                <div>
                  <div style="font-size: clamp(9px,2.5vw,13px); color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: clamp(4px,1.5vw,10px);">
                    ${teamLabel}
                  </div>
                  <div style="display: flex; flex-direction: column; gap: clamp(4px,1.5vw,8px);">
                    <button class="btn ${picked === 1 ? '' : 'secondary'}"
                      style="padding: clamp(8px,2vw,14px); font-size: clamp(11px,3vw,16px); ${picked === 1 ? 'background:var(--accent);color:#000;font-weight:800;' : ''}"
                      id="dsub-${slot}-1">
                      ${picked === 1 ? '▶ ' : ''}${p1name}
                    </button>
                    <button class="btn ${picked === 2 ? '' : 'secondary'}"
                      style="padding: clamp(8px,2vw,14px); font-size: clamp(11px,3vw,16px); ${picked === 2 ? 'background:var(--accent);color:#000;font-weight:800;' : ''}"
                      id="dsub-${slot}-2">
                      ${picked === 2 ? '▶ ' : ''}${p2name}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
          <button id="dsub-confirm" class="btn"
            style="margin-top: clamp(12px,3.5vw,22px); width: 100%; font-size: clamp(13px,3.5vw,18px); padding: clamp(10px,2.5vw,16px);
                   background: var(--accent); color: #000; font-weight: 800;
                   opacity: ${sel[1] && sel[2] ? 1 : 0.4}; cursor: ${sel[1] && sel[2] ? 'pointer' : 'not-allowed'};">
            Onayla →
          </button>
        </div>
      `;
      // Buton listener'ları
      overlay.querySelectorAll('[id^="dsub-"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const parts = btn.id.split('-');
          if (parts[0] === 'dsub' && parts[1] !== 'confirm') {
            sel[+parts[1]] = +parts[2];
            renderModal();
          }
        });
      });
      const confirmBtn = overlay.querySelector('#dsub-confirm');
      if (confirmBtn) {
        confirmBtn.addEventListener('click', () => {
          if (!sel[1] || !sel[2]) return;
          overlay.remove();
          resolve({ p1_sub_turn: sel[1], p2_sub_turn: sel[2] });
        });
      }
    };

    renderModal();
    document.body.appendChild(overlay);
  });
}

// Leg sonu mini özet modalı — kazananı, leg/set skorunu, ortalamayı gösterir.
// "Sonraki Leg" butonuna basılınca dismiss olur. Promise döner böylece submitScore await edebilir.
function showLegSummary(summary) {
  return new Promise((resolve) => {
    const m = currentMatch;
    const e1Name = entryLabel(m?.entry1);
    const e2Name = entryLabel(m?.entry2);
    const winnerName = summary.winner_slot === 1 ? e1Name : e2Name;
    const showSets = (m?.sets_to_win || 1) > 1;

    const overlay = document.createElement('div');
    overlay.className = 'leg-summary';
    overlay.innerHTML = `
      <div class="leg-summary-card">
        <div class="leg-summary-banner">LEG ${summary.leg_index} BİTTİ</div>
        <div class="leg-summary-winner">🏆 ${winnerName}</div>
        ${summary.checkout ? `<div class="leg-summary-checkout">Checkout: <strong>${summary.checkout}</strong></div>` : ''}

        <div class="leg-summary-grid">
          ${legSummarySide(e1Name, summary.p1, summary.winner_slot === 1)}
          ${legSummarySide(e2Name, summary.p2, summary.winner_slot === 2)}
        </div>

        <div class="leg-summary-score">
          ${showSets ? `Set: <strong>${summary.p1_sets ?? 0} - ${summary.p2_sets ?? 0}</strong> · ` : ''}
          Leg: <strong>${summary.p1_legs ?? 0} - ${summary.p2_legs ?? 0}</strong>
        </div>

        <button class="leg-summary-next">Sonraki Leg ▶</button>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = () => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler, true);
      resolve();
    };
    overlay.querySelector('.leg-summary-next').onclick = close;
    const keyHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', keyHandler, true);
  });
}

function legSummarySide(name, p, isWinner) {
  return `
    <div class="leg-summary-side ${isWinner ? 'winner' : ''}">
      <div class="leg-summary-name">${name}</div>
      <div class="leg-summary-stat-row">
        <div class="leg-summary-stat"><span>3-Ok Ort.</span><strong>${(p?.avg ?? 0).toFixed(2)}</strong></div>
        <div class="leg-summary-stat"><span>Atılan</span><strong>${p?.darts ?? 0}</strong></div>
        <div class="leg-summary-stat"><span>Toplam</span><strong>${p?.total ?? 0}</strong></div>
      </div>
      ${(p?.hi180 || p?.hi140 || p?.hi100) ? `
        <div class="leg-summary-pills">
          ${p.hi180 ? `<span class="pill pill-180">180 ×${p.hi180}</span>` : ''}
          ${p.hi140 ? `<span class="pill pill-140">140+ ×${p.hi140}</span>` : ''}
          ${p.hi100 ? `<span class="pill pill-100">100+ ×${p.hi100}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

async function undoThrow() {
  if (!currentMatch) return;
  const confirmed = await showConfirm('Son atışı geri almak istediğinizden emin misiniz?');
  if (!confirmed) return;
  const res = await api.post(`/api/matches/${currentMatch.id}/undo`, {});
  if (res.error) toast('Hata: ' + res.error);
  else toast('Son atış geri alındı');
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1.5rem;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2rem;max-width:380px;width:100%;text-align:center;">
        <div style="font-size:1.1rem;font-weight:600;margin-bottom:1.5rem;">${message}</div>
        <div style="display:flex;gap:1rem;justify-content:center;">
          <button id="confirm-no" style="flex:1;padding:0.85rem;border-radius:10px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:1rem;cursor:pointer;">İptal</button>
          <button id="confirm-yes" style="flex:1;padding:0.85rem;border-radius:10px;border:none;background:var(--danger);color:white;font-size:1rem;font-weight:700;cursor:pointer;">Geri Al</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#confirm-yes').onclick = () => close(true);
    overlay.querySelector('#confirm-no').onclick = () => close(false);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
}

// ---- Utils ----
function getStartScore(m) {
  const mode = m?.game_mode;
  if (mode === '501') return 501;
  if (mode === '701') return 701;
  if (mode === '1001') return 1001;
  if (mode === 'cricket') return 0;
  return 501;
}

function avg(stats) {
  if (!stats || !stats.darts_thrown) return 0;
  return (stats.total_score / stats.darts_thrown) * 3;
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (!currentMatch || currentMatch.status !== 'live') return;
  if (e.key >= '0' && e.key <= '9') addDigit(e.key);
  else if (e.key === 'Enter') submitScore();
  else if (e.key === 'Backspace' || e.key === 'Delete') clearInput();
  else if (e.key === 'u' || e.key === 'U') undoThrow();
});
