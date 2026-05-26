// Lig & Sezon yönetimi — Dilim 1: liste + oluşturma
// Sonraki dilimlerde: oyuncu havuzu, oturum oluşturma, klasman, vs.

// ── Sekme geçişi ───────────────────────────────────────────────
document.querySelectorAll('.tab-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const tab = link.getAttribute('data-tab');
    document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');
    document.querySelectorAll('.tab').forEach(s => s.hidden = true);
    const target = document.getElementById('tab-' + tab);
    if (target) target.hidden = false;
  });
});

// ── Format değişince meet_count + puan bloklarını göster/gizle ───
const typeEl = document.getElementById('nc-type');
const meetWrap = document.getElementById('nc-meet-wrap');
function syncTypeUI() {
  const isLeague = typeEl.value === 'league';
  meetWrap.style.display = isLeague ? '' : 'none';
  const seasonBlock = document.getElementById('points-season-block');
  const leagueBlock = document.getElementById('points-league-block');
  if (seasonBlock) seasonBlock.style.display = isLeague ? 'none' : '';
  if (leagueBlock) leagueBlock.style.display = isLeague ? '' : 'none';
}
typeEl.addEventListener('change', syncTypeUI);
syncTypeUI();

// ── Puan tablosu inputları (1.-8. pozisyon) ────────────────────
const DEFAULT_POINTS = { '1': 10, '2': 7, '3': 5, '4': 4, '5': 3, '6': 2, '7': 1, '8': 1 };
function buildPointsGrid() {
  const grid = document.getElementById('points-grid');
  grid.innerHTML = '';
  for (let pos = 1; pos <= 8; pos++) {
    const cell = document.createElement('div');
    cell.className = 'pt-cell';
    cell.innerHTML = `
      <label for="pt-${pos}">${pos}.</label>
      <input id="pt-${pos}" type="number" min="0" step="0.5" value="${DEFAULT_POINTS[pos] || 0}" />
    `;
    grid.appendChild(cell);
  }
}
buildPointsGrid();

function readPointsJson() {
  // Lig: sadece "match" anahtarı (maç başına puan). Sezon mantığı (pozisyon) lig için anlamsız.
  if (typeEl.value === 'league') {
    const v = parseFloat(document.getElementById('nc-match-points').value);
    return { match: isNaN(v) ? 3 : v };
  }
  // Sezon: pozisyon-bazlı tablo
  const out = {};
  for (let pos = 1; pos <= 8; pos++) {
    const el = document.getElementById('pt-' + pos);
    if (!el) continue;
    const v = parseFloat(el.value);
    if (!isNaN(v)) out[String(pos)] = v;
  }
  const def = parseFloat(document.getElementById('nc-default-points').value);
  out['default'] = isNaN(def) ? 0 : def;
  return out;
}

// ── Yeni competition oluştur ───────────────────────────────────
async function submitNewComp() {
  const name = document.getElementById('nc-name').value.trim();
  if (!name) {
    toast('Ad zorunlu');
    return;
  }
  const payload = {
    name,
    type: typeEl.value,
    category: document.getElementById('nc-category').value.trim(),
    planned_sessions: parseInt(document.getElementById('nc-sessions').value, 10) || 1,
    meet_count: parseInt(document.getElementById('nc-meet').value, 10) || 1,
    game_mode: document.getElementById('nc-game-mode').value,
    team_mode: document.getElementById('nc-team-mode').value,
    legs_to_win: parseInt(document.getElementById('nc-legs').value, 10) || 2,
    sets_to_win: parseInt(document.getElementById('nc-sets').value, 10) || 1,
    points_json: readPointsJson(),
  };
  try {
    const res = await api.post('/api/competitions', payload);
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    toast('Oluşturuldu ✓');
    // Formu sıfırla, listeye geç
    document.getElementById('nc-name').value = '';
    document.getElementById('nc-category').value = '';
    document.querySelector('.tab-link[data-tab="list"]').click();
    await loadComps();
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
  }
}
window.submitNewComp = submitNewComp;

// ── Liste yükle & render ───────────────────────────────────────
async function loadComps() {
  const wrap = document.getElementById('comps-list');
  try {
    const rows = await api.get('/api/competitions');
    if (!Array.isArray(rows) || rows.length === 0) {
      wrap.innerHTML = `
        <div class="card" style="text-align:center;padding:2rem 1rem;color:var(--text-dim)">
          Henüz hiçbir sezon veya lig oluşturmadın.<br />
          <button class="primary" style="margin-top:0.8rem" onclick="document.querySelector('.tab-link[data-tab=&quot;new&quot;]').click()">
            Yeni Oluştur
          </button>
        </div>`;
      return;
    }
    wrap.innerHTML = rows.map(renderCompCard).join('');
  } catch (e) {
    console.error(e);
    wrap.innerHTML = '<p style="color:#ef4444">Yüklenemedi: ' + (e.message || e) + '</p>';
  }
}

function renderCompCard(c) {
  const typeLabel = c.type === 'league' ? 'LİG' : 'SEZON';
  const statusLabels = { draft: 'Taslak', running: 'Aktif', finished: 'Bitti' };
  const sLabel = statusLabels[c.status] || c.status;
  const gameLabel = window.modeLabel ? window.modeLabel(c.game_mode) : c.game_mode;
  const teamLabel = c.team_mode === 'doubles' ? 'Eşli' : 'Bireysel';
  const pts = c.points_json || {};
  const ptsPreview = ['1','2','3']
    .filter(k => pts[k] !== undefined)
    .map(k => `${k}.→${pts[k]}p`).join(' ');

  return `
    <div class="comp-card">
      <div class="comp-card-header">
        <div>
          <span class="comp-type-pill ${c.type}">${typeLabel}</span>
          <span class="comp-card-title">${escapeHtml(c.name)}</span>
          ${c.category ? `<span style="color:var(--text-dim);margin-left:0.5rem">· ${escapeHtml(c.category)}</span>` : ''}
        </div>
        <span class="comp-status-pill ${c.status}">${sLabel}</span>
      </div>
      <div class="comp-meta">
        <span class="chip">📅 ${c.sessions_count || 0}/${c.planned_sessions} oturum</span>
        <span class="chip">👥 ${c.players_count || 0} oyuncu</span>
        <span class="chip">🎯 ${gameLabel} · ${teamLabel}</span>
        <span class="chip">🏅 bo${(c.legs_to_win || 2) * 2 - 1}${(c.sets_to_win || 1) > 1 ? ` · ${(c.sets_to_win)*2-1} set` : ''}</span>
        ${c.type === 'league' && c.meet_count > 1 ? `<span class="chip">↔ ${c.meet_count}× karşılaşma</span>` : ''}
        ${ptsPreview ? `<span class="chip">${ptsPreview}</span>` : ''}
      </div>
      <div class="comp-actions">
        <a href="/competition.html?id=${c.id}" class="btn primary" style="text-decoration:none;display:inline-block;padding:0.4rem 0.75rem;border-radius:6px;">
          📋 Detay
        </a>
        <button class="danger" onclick="deleteComp(${c.id}, '${escapeHtml(c.name).replace(/'/g, "\\'")}', '${c.status}', ${c.sessions_count || 0}, ${c.players_count || 0})">
          🗑️ Sil
        </button>
      </div>
    </div>
  `;
}

async function deleteComp(id, name, status, sessionsCount, playersCount) {
  // Statusa göre uyarı metnini sertleştir
  let msg;
  if (status === 'draft') {
    msg = `"${name}" silinsin mi?\n\nBu işlem geri alınamaz.`;
  } else {
    const statusLabel = status === 'running' ? 'AKTİF' : status === 'finished' ? 'BİTMİŞ' : status;
    msg =
      `⚠️ DİKKAT — "${name}" (${statusLabel}) silinecek.\n\n` +
      `• ${sessionsCount} oturum (bracket dahil)\n` +
      `• ${playersCount} oyuncu havuzu\n` +
      `• Tüm puanlar, klasman, oturum sonuçları\n\n` +
      `Bu işlem GERİ ALINAMAZ. Devam edilsin mi?`;
  }
  if (!confirm(msg)) return;

  // Bitmiş/aktif olanlar için ikinci onay (yanlışlıkla tıklamayı engellemek için)
  if (status !== 'draft') {
    const conf = prompt(`Onaylamak için yarışmanın adını aynen yazın:\n\n${name}`);
    if (conf !== name) {
      toast('Silme iptal edildi');
      return;
    }
  }

  try {
    const res = await api.del('/api/competitions/' + id);
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    toast('Silindi');
    await loadComps();
  } catch (e) {
    toast('Sunucu hatası');
  }
}
window.deleteComp = deleteComp;

function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// İlk yükleme
loadComps();
