// Organizatör paneli
let state = { players: [], boards: [], tournaments: [] };
let stagesDraft = [{ format: 'single_elim', qualifier_count: null, config: {} }];
let entriesDraft = [{ player1_id: null, player2_id: null, seed: null }];
let reportsCache = {}; // tournamentId -> report data
let roundOverridesEnabled = false;

// Oyuncu picker state
let openPickerKey = null;  // "i_p1" veya "i_p2" formatında
let pickerSearch = '';

// Sürükle-bırak sıralama state
let dragSrcIndex = null;

const socket = io();
socket.on('state', (s) => {
  state = s;
  render();
});

// Tab switching
document.querySelectorAll('.tab-link').forEach(a => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.tab-link').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(x => x.hidden = true);
    a.classList.add('active');
    document.getElementById('tab-' + a.dataset.tab).hidden = false;
  });
});

// ---- Players ----
async function addPlayer() {
  const name = document.getElementById('player-name').value.trim();
  const nickname = document.getElementById('player-nick').value.trim();
  if (!name) return toast('İsim gerekli');
  await api.post('/api/players', { name, nickname });
  document.getElementById('player-name').value = '';
  document.getElementById('player-nick').value = '';
}

async function deletePlayer(id) {
  if (!confirm('Silinsin mi?')) return;
  await api.del('/api/players/' + id);
}

async function bulkAddPlayers() {
  const raw = document.getElementById('bulk-names').value;
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return toast('Liste boş');
  let added = 0;
  for (const line of lines) {
    const parts = line.split('/').map(p => p.trim());
    const name = parts[0];
    const nickname = parts[1] || '';
    if (!name) continue;
    await api.post('/api/players', { name, nickname });
    added++;
  }
  document.getElementById('bulk-names').value = '';
  const det = document.getElementById('bulk-details');
  if (det) det.removeAttribute('open');
  toast(`${added} oyuncu eklendi`);
}

// ---- Boards ----
async function addBoard() {
  const name = document.getElementById('board-name').value.trim();
  if (!name) return toast('İsim gerekli');
  await api.post('/api/boards', { name });
  document.getElementById('board-name').value = '';
}
async function deleteBoard(id) {
  if (!confirm('Silinsin mi?')) return;
  await api.del('/api/boards/' + id);
}

// ---- Stages wizard (basit format seçici) ----
// Wizard stagesDraft üzerinde çalışır:
// - Tek aşama (single/double elim) → stagesDraft = [{ format: 'single_elim' }]
// - İki aşama (RR + elim) → stagesDraft = [{ format: 'round_robin', qualifier_count }, { format: 'single_elim'|'double_elim' }]
function renderStagesWizard() {
  const host = document.getElementById('stages-wizard');
  if (!host) return;
  const s0 = stagesDraft[0] || { format: 'single_elim' };
  const s1 = stagesDraft[1];
  const primary = s0.format;
  const secondary = s1?.format || 'single_elim';
  const qcount = s0.qualifier_count || '';

  host.innerHTML = `
    <div class="grid cols-2" style="gap: 0.75rem;">
      <div>
        <label>Format</label>
        <select id="wiz-primary" style="width: 100%;" onchange="wizSetPrimary(this.value)">
          <option value="single_elim" ${primary === 'single_elim' ? 'selected' : ''}>Tek eleme (single elimination)</option>
          <option value="double_elim" ${primary === 'double_elim' ? 'selected' : ''}>Çift eleme (double elimination)</option>
          <option value="round_robin" ${primary === 'round_robin' ? 'selected' : ''}>Round-robin (grup maçları)</option>
        </select>
      </div>
      ${primary === 'round_robin' ? `
        <div>
          <label>Her gruptan kaç kişi üst tura çıksın?</label>
          <input type="number" id="wiz-qcount" min="1" value="${qcount}" placeholder="örn: 2"
            oninput="wizSetQualifierCount(this.value)" style="width: 100%;" />
        </div>
      ` : '<div></div>'}
    </div>

    ${primary === 'round_robin' ? `
      <div style="margin-top: 0.75rem; padding: 0.75rem; background: var(--bg-2, rgba(255,255,255,0.03)); border-radius: 8px;">
        <label style="color: var(--text-dim); font-size: 0.88rem;">
          Gruplar bittikten sonra → sıradaki aşama
        </label>
        <select id="wiz-secondary" style="width: 100%; margin-top: 0.35rem;" onchange="wizSetSecondary(this.value)">
          <option value="single_elim" ${secondary === 'single_elim' ? 'selected' : ''}>Tek eleme (single elimination)</option>
          <option value="double_elim" ${secondary === 'double_elim' ? 'selected' : ''}>Çift eleme (double elimination)</option>
        </select>
      </div>
    ` : ''}
  `;
}

function wizSetPrimary(val) {
  if (val === 'round_robin') {
    // RR + elim (default: single)
    const qcount = stagesDraft[0]?.qualifier_count || null;
    const secondary = stagesDraft[1]?.format || 'single_elim';
    stagesDraft = [
      { format: 'round_robin', qualifier_count: qcount, config: {} },
      { format: secondary, qualifier_count: null, config: {} },
    ];
  } else {
    stagesDraft = [{ format: val, qualifier_count: null, config: {} }];
  }
  renderStagesWizard();
  renderStagesDraft();
  renderRoundOverridesPanel();
}
function wizSetQualifierCount(val) {
  const n = val ? +val : null;
  if (stagesDraft[0]) stagesDraft[0].qualifier_count = (n && n >= 1) ? n : null;
  renderStagesDraft();
  renderRoundOverridesPanel();
}
function wizSetSecondary(val) {
  if (!stagesDraft[1]) stagesDraft.push({ format: val, qualifier_count: null, config: {} });
  else stagesDraft[1].format = val;
  renderStagesDraft();
  renderRoundOverridesPanel();
}

// ---- Stages draft (gelişmiş, çok-aşamalı düzenleme) ----
function addStage() {
  stagesDraft.push({ format: 'single_elim', qualifier_count: null, config: {} });
  renderStagesDraft();
  renderStagesWizard();
  renderRoundOverridesPanel();
}
function removeStage(i) {
  stagesDraft.splice(i, 1);
  if (stagesDraft.length === 0) stagesDraft.push({ format: 'single_elim', qualifier_count: null, config: {} });
  renderStagesDraft();
  renderStagesWizard();
  renderRoundOverridesPanel();
}
function updateStage(i, field, value) {
  stagesDraft[i][field] = value;
  renderStagesWizard();
  renderRoundOverridesPanel();
}
function renderStagesDraft() {
  const host = document.getElementById('stages-list');
  host.innerHTML = stagesDraft.map((s, i) => `
    <div class="row" style="margin-bottom: 0.6rem;">
      <span style="min-width: 60px; color: var(--text-dim);">${i + 1}. aşama</span>
      <select onchange="updateStage(${i}, 'format', this.value)" style="flex: 1;">
        <option value="single_elim" ${s.format === 'single_elim' ? 'selected' : ''}>Tek eleme</option>
        <option value="double_elim" ${s.format === 'double_elim' ? 'selected' : ''}>Çift eleme</option>
        <option value="round_robin" ${s.format === 'round_robin' ? 'selected' : ''}>Round-robin</option>
      </select>
      ${s.format === 'round_robin' ? `
        <input type="number" min="1" placeholder="Üst tura geçecek kişi sayısı"
          value="${s.qualifier_count || ''}"
          onchange="updateStage(${i}, 'qualifier_count', +this.value)" style="flex: 1;" />
      ` : '<div style="flex: 1;"></div>'}
      <button class="icon danger" onclick="removeStage(${i})" title="Sil">×</button>
    </div>
  `).join('');
}

// ---- Round başına leg/set override ----
// Her aşama için, o aşamada oynanacak round'ları çıkarır ve UI'da listeler.
// Kullanıcı "kaç leg / kaç set kazanan ilerler" değerlerini round bazında belirler.
// Boş bırakılan değerler turnuvanın varsayılan legs_to_win/sets_to_win'ine düşer.

function _nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }

function _roundLabel(matchCount) {
  if (matchCount === 1) return 'Final';
  if (matchCount === 2) return 'Yarı Final';
  if (matchCount === 4) return 'Çeyrek Final';
  if (matchCount === 8) return 'Son 16';
  if (matchCount === 16) return 'Son 32';
  if (matchCount === 32) return 'Son 64';
  return matchCount * 2 + ' kişilik tur';
}

// Bir aşamanın round yapısını {key, label} listesi olarak döndürür.
// key = `${bracket}-${round}` veya 'rr' — backend'in kullandığı anahtarla aynı.
function _roundsForStage(stageFormat, entryCount) {
  if (stageFormat === 'round_robin') {
    return [{ key: 'rr', label: 'Round-robin maçları' }];
  }
  if (entryCount < 2) return [];
  const bracketSize = _nextPow2(entryCount);
  const wbRounds = Math.log2(bracketSize);

  if (stageFormat === 'single_elim') {
    const out = [];
    for (let r = 1; r <= wbRounds; r++) {
      const matchCount = bracketSize / Math.pow(2, r);
      const isFinal = r === wbRounds;
      const bracket = isFinal ? 'final' : 'winners';
      out.push({ key: `${bracket}-${r}`, label: _roundLabel(matchCount) });
    }
    return out;
  }
  if (stageFormat === 'double_elim') {
    const out = [];
    for (let r = 1; r <= wbRounds; r++) {
      const matchCount = bracketSize / Math.pow(2, r);
      const lbl = matchCount === 1 ? 'WB Final' : 'WB ' + _roundLabel(matchCount);
      out.push({ key: `winners-${r}`, label: lbl });
    }
    const lbRounds = wbRounds === 1 ? 0 : 2 * (wbRounds - 1);
    for (let r = 1; r <= lbRounds; r++) {
      const isLast = r === lbRounds;
      out.push({ key: `losers-${r}`, label: isLast ? 'LB Final' : `LB Round ${r}` });
    }
    out.push({ key: `final-${wbRounds + lbRounds + 1}`, label: 'Grand Final' });
    return out;
  }
  return [];
}

// Bir aşamaya kaç katılımcı düşer? (ilk aşama: tüm geçerli entries; sonraki: önceki aşamanın qualifier_count'u)
function _entryCountForStage(stageIndex) {
  const teamMode = document.getElementById('t-team')?.value || 'singles';
  if (stageIndex === 0) {
    return entriesDraft.filter(e =>
      e.player1_id && (teamMode === 'singles' || e.player2_id)
    ).length;
  }
  const prev = stagesDraft[stageIndex - 1];
  if (!prev) return 0;
  // RR'den sonraki aşama qualifier_count * grup sayısına bağlı; basitleştirme: qualifier_count
  return +(prev.qualifier_count || 0);
}

function toggleRoundOverrides(checked) {
  roundOverridesEnabled = !!checked;
  const panel = document.getElementById('round-overrides-panel');
  if (!panel) return;
  panel.hidden = !roundOverridesEnabled;
  if (roundOverridesEnabled) renderRoundOverridesPanel();
  else {
    // Kapatınca config'leri temizle, böylece submit'te yollanmazlar
    stagesDraft.forEach(s => { if (s.config) delete s.config.round_overrides; });
  }
}

function renderRoundOverridesPanel() {
  const panel = document.getElementById('round-overrides-panel');
  if (!panel) return;
  if (!roundOverridesEnabled) { panel.hidden = true; return; }
  panel.hidden = false;

  const baseLegs = +document.getElementById('t-legs')?.value || 3;
  const baseSets = +document.getElementById('t-sets')?.value || 1;

  const sections = stagesDraft.map((stage, si) => {
    const ec = _entryCountForStage(si);
    const rounds = _roundsForStage(stage.format, ec);
    const stageLabel = (stage.format === 'single_elim') ? 'Tek eleme'
      : (stage.format === 'double_elim') ? 'Çift eleme'
      : 'Round-robin';
    const heading = `Aşama ${si + 1} — ${stageLabel}` + (ec ? ` (${ec} katılımcı)` : ' (katılımcı sayısı bilinmiyor)');

    if (rounds.length === 0) {
      return `<div class="card" style="margin-bottom: 0.6rem; padding: 0.7rem;">
        <strong>${heading}</strong>
        <p style="color: var(--text-dim); font-size: 0.82rem; margin: 0.3rem 0 0;">
          Round'ları görmek için katılımcı sayısını ya da grup formatını ayarlayın.
        </p>
      </div>`;
    }

    const ovs = (stage.config && stage.config.round_overrides) || {};
    const rows = rounds.map(rd => {
      const cur = ovs[rd.key] || {};
      const legVal = cur.legs ?? '';
      const setVal = cur.sets ?? '';
      return `
        <div class="row" style="gap: 0.5rem; margin-bottom: 0.4rem; align-items: center;">
          <span style="flex: 1; color: var(--text-dim);">${rd.label}</span>
          <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem;">
            <span style="color: var(--text-dim);">Leg</span>
            <input type="number" min="1" placeholder="${baseLegs}" value="${legVal}"
              style="width: 70px;"
              oninput="updateRoundOverride(${si}, '${rd.key}', 'legs', this.value)" />
          </label>
          <label style="display: flex; align-items: center; gap: 0.3rem; font-size: 0.85rem;">
            <span style="color: var(--text-dim);">Set</span>
            <input type="number" min="1" placeholder="${baseSets}" value="${setVal}"
              style="width: 70px;"
              oninput="updateRoundOverride(${si}, '${rd.key}', 'sets', this.value)" />
          </label>
        </div>
      `;
    }).join('');

    return `<div class="card" style="margin-bottom: 0.6rem; padding: 0.7rem;">
      <strong style="display: block; margin-bottom: 0.5rem;">${heading}</strong>
      ${rows}
    </div>`;
  }).join('');

  panel.innerHTML = sections || '<p style="color: var(--text-dim);">Aşama yok.</p>';
}

function updateRoundOverride(stageIndex, roundKey, field, value) {
  const stage = stagesDraft[stageIndex];
  if (!stage) return;
  if (!stage.config) stage.config = {};
  if (!stage.config.round_overrides) stage.config.round_overrides = {};
  const ovs = stage.config.round_overrides;
  if (!ovs[roundKey]) ovs[roundKey] = {};
  const n = value ? +value : null;
  if (n && n >= 1) ovs[roundKey][field] = n;
  else delete ovs[roundKey][field];
  // Tüm alanlar boşaldıysa round'u temizle
  if (!ovs[roundKey].legs && !ovs[roundKey].sets) delete ovs[roundKey];
}

// ---- Entries draft ----
function addEntry() {
  entriesDraft.push({ player1_id: null, player2_id: null, seed: null });
  renderEntriesDraft();
  renderRoundOverridesPanel();
}
function removeEntry(i) {
  entriesDraft.splice(i, 1);
  if (entriesDraft.length === 0) entriesDraft.push({ player1_id: null, player2_id: null, seed: null });
  renderEntriesDraft();
  renderRoundOverridesPanel();
}
function updateEntry(i, field, value) {
  if (field === 'seed') {
    const n = value ? +value : null;
    entriesDraft[i].seed = (n && n >= 1) ? n : null;
  } else {
    entriesDraft[i][field] = value ? +value : null;
  }
  if (field === 'player1_id' || field === 'player2_id') renderRoundOverridesPanel();
}
// Kayıtlı tüm oyuncuları entriesDraft'a ekle (zaten eklenenleri atla)
function addAllPlayers() {
  const teamMode = document.getElementById('t-team').value;
  const existing1 = new Set(entriesDraft.map(e => e.player1_id).filter(Boolean));
  const existing2 = new Set(entriesDraft.map(e => e.player2_id).filter(Boolean));
  const usedIds = new Set([...existing1, ...existing2]);
  const remaining = state.players.filter(p => !usedIds.has(p.id));
  if (!remaining.length) return toast('Tüm oyuncular zaten eklenmiş');
  // Boş slot'ları önce kaldır (player seçilmemiş satırlar)
  entriesDraft = entriesDraft.filter(e => e.player1_id || e.player2_id);
  for (const p of remaining) {
    entriesDraft.push({ player1_id: p.id, player2_id: null, seed: null });
  }
  renderEntriesDraft();
  renderRoundOverridesPanel();
  toast(`${remaining.length} oyuncu eklendi`);
}

// Kura: seed'i olmayan katılımcıları Fisher-Yates ile karıştır,
// seed'liler (seed değerine göre sıralı) önde kalsın
function drawLots() {
  const seeded = entriesDraft.filter(e => e.seed).sort((a, b) => a.seed - b.seed);
  const unseeded = entriesDraft.filter(e => !e.seed);
  for (let i = unseeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
  }
  entriesDraft = [...seeded, ...unseeded];
  renderEntriesDraft();
  renderRoundOverridesPanel();
  toast('Kura çekildi — seri başları yerinde, diğerleri karıştırıldı');
}
function renderEntriesDraft() {
  const host = document.getElementById('entries-list');
  const teamMode = document.getElementById('t-team').value;

  host.innerHTML = entriesDraft.map((e, i) => {
    const p1 = state.players.find(p => p.id === e.player1_id);
    const p2 = state.players.find(p => p.id === e.player2_id);
    const key1 = `${i}_p1`;
    const key2 = `${i}_p2`;
    return `
      <div class="entry-row" style="margin-bottom: 0.5rem;"
           draggable="true"
           ondragstart="dragStart(event, ${i})"
           ondragover="dragOver(event, ${i})"
           ondrop="dragDrop(event, ${i})"
           ondragend="dragEnd()"
           id="entry-row-${i}">
        <div class="row" style="align-items: center; gap: 0.5rem;">
          <span style="min-width: 40px; color: var(--text-dim); cursor: grab;" title="Sürükle">⠿ #${i + 1}</span>
          ${renderPickerBtn(key1, p1)}
          ${teamMode === 'doubles' ? renderPickerBtn(key2, p2) : ''}
          <input type="number" min="1" placeholder="Seri başı" title="Seri başı (opsiyonel)"
            value="${e.seed || ''}"
            style="width: 90px;"
            oninput="updateEntry(${i}, 'seed', this.value)" />
          <button class="icon danger" onclick="removeEntry(${i})">×</button>
        </div>
        ${openPickerKey === key1 ? renderPickerDropdown(key1, i, 'player1_id', e.player1_id) : ''}
        ${teamMode === 'doubles' && openPickerKey === key2 ? renderPickerDropdown(key2, i, 'player2_id', e.player2_id) : ''}
      </div>
    `;
  }).join('');
}

function renderPickerBtn(key, selectedPlayer) {
  const isOpen = openPickerKey === key;
  const label = selectedPlayer ? (selectedPlayer.nickname || selectedPlayer.name) : '— Oyuncu seç —';
  return `
    <button class="btn secondary" style="flex: 1; text-align: left; padding: 0.4rem 0.75rem; display: flex; justify-content: space-between; align-items: center;"
            onclick="togglePicker('${key}')">
      <span>${label}</span>
      <span style="opacity: 0.5; font-size: 0.8rem;">${isOpen ? '▴' : '▾'}</span>
    </button>
  `;
}

function renderPickerDropdown(key, entryIndex, field, selectedId) {
  const q = pickerSearch.toLowerCase();
  const filtered = state.players.filter(p =>
    !q || p.name.toLowerCase().includes(q) || (p.nickname || '').toLowerCase().includes(q)
  );
  return `
    <div style="margin: 0.25rem 0 0.25rem 46px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 0.5rem; z-index: 100; position: relative;">
      <input type="text" placeholder="İsim ara…" value="${pickerSearch.replace(/"/g, '&quot;')}"
             style="width: 100%; margin-bottom: 0.4rem; padding: 0.35rem 0.5rem; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; color: var(--text); box-sizing: border-box;"
             autofocus
             oninput="pickerSearch = this.value; renderEntriesDraft()" />
      <div style="max-height: 180px; overflow-y: auto;">
        ${filtered.length === 0
          ? '<div style="color: var(--text-dim); padding: 0.4rem 0.5rem; font-size: 0.88rem;">Sonuç yok</div>'
          : filtered.map(p => `
            <div class="picker-item ${p.id === selectedId ? 'selected' : ''}"
                 onclick="selectPlayerForEntry(${entryIndex}, '${field}', ${p.id})">
              ${p.name}${p.nickname ? ` <span style="opacity: 0.6; font-size: 0.85em;">(${p.nickname})</span>` : ''}
              ${p.id === selectedId ? ' <span style="color: var(--accent);">✓</span>' : ''}
            </div>
          `).join('')
        }
      </div>
    </div>
  `;
}

function togglePicker(key) {
  openPickerKey = (openPickerKey === key) ? null : key;
  pickerSearch = '';
  renderEntriesDraft();
}

function selectPlayerForEntry(entryIndex, field, playerId) {
  updateEntry(entryIndex, field, playerId);
  openPickerKey = null;
  pickerSearch = '';
  renderEntriesDraft();
  renderRoundOverridesPanel();
}

// ---- Sürükle-bırak sıralama ----
function dragStart(e, index) {
  dragSrcIndex = index;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.4';
}
function dragOver(e, index) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // Hedef satırı vurgula
  document.querySelectorAll('.entry-row').forEach((r, i) => {
    r.style.borderTop = (i === index && i !== dragSrcIndex) ? '2px solid var(--accent)' : '';
  });
}
function dragDrop(e, targetIndex) {
  e.preventDefault();
  if (dragSrcIndex === null || dragSrcIndex === targetIndex) return;
  // Sıralamayı değiştir
  const moved = entriesDraft.splice(dragSrcIndex, 1)[0];
  entriesDraft.splice(targetIndex, 0, moved);
  dragSrcIndex = null;
  openPickerKey = null;
  renderEntriesDraft();
  renderRoundOverridesPanel();
}
function dragEnd() {
  dragSrcIndex = null;
  document.querySelectorAll('.entry-row').forEach(r => {
    r.style.opacity = '';
    r.style.borderTop = '';
  });
}

// ---- Create tournament ----
async function createTournament() {
  const name = document.getElementById('t-name').value.trim();
  const game_mode = document.getElementById('t-mode').value;
  const team_mode = document.getElementById('t-team').value;
  const legs_to_win = +document.getElementById('t-legs').value;
  const sets_to_win = +document.getElementById('t-sets').value;

  if (!name) return toast('Turnuva adı gerekli');

  const validEntries = entriesDraft.filter(e => e.player1_id && (team_mode === 'singles' || e.player2_id));
  if (validEntries.length < 2) return toast('En az 2 geçerli katılımcı gerekli');

  const body = {
    name, game_mode, team_mode, legs_to_win, sets_to_win,
    entries: validEntries,
    stages: stagesDraft,
  };

  const res = await api.post('/api/tournaments', body);
  if (res.error) return toast('Hata: ' + res.error);
  toast('Turnuva oluşturuldu');
  // Reset drafts and jump to tournaments tab
  entriesDraft = [{ player1_id: null, player2_id: null, seed: null }];
  stagesDraft = [{ format: 'single_elim', qualifier_count: null, config: {} }];
  roundOverridesEnabled = false;
  const ovToggle = document.getElementById('round-override-toggle');
  if (ovToggle) ovToggle.checked = false;
  const ovPanel = document.getElementById('round-overrides-panel');
  if (ovPanel) { ovPanel.hidden = true; ovPanel.innerHTML = ''; }
  document.getElementById('t-name').value = '';
  document.querySelector('.tab-link[data-tab="tournaments"]').click();
}

// ---- Tournament controls ----
async function startTournament(id) {
  // Board atanmamışsa uyar
  if (state.boards.length === 0) {
    const devam = confirm(
      '⚠️ Henüz hiç board eklenmemiş!\n\n' +
      'Maçlar board olmadan oynanamaz. ' +
      '"Boards" sekmesinden board ekledikten sonra başlatmanı öneririz.\n\n' +
      'Yine de şimdi başlatmak istiyor musun?'
    );
    if (!devam) return;
  } else if (!confirm('Turnuvayı başlat?')) return;

  const res = await api.post(`/api/tournaments/${id}/start`, {});
  if (res.error) return toast('Hata: ' + res.error);
  toast('Turnuva başladı');
}
// Turnuva ayarları modalı (sadece draft)
function showTournamentSettings(id) {
  const t = state.tournaments.find(x => x.id === id);
  if (!t || t.status !== 'draft') return;

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:2rem;max-width:480px;width:100%;position:relative;">
      <button onclick="this.closest('[style*=fixed]').remove()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:var(--text-dim);font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
      <h3 style="margin-bottom:1.25rem;">⚙️ Turnuva Ayarları</h3>

      <label>Turnuva adı</label>
      <input id="ts-name" type="text" value="${t.name.replace(/"/g, '&quot;')}" style="width:100%;margin-bottom:0.75rem;box-sizing:border-box;" />

      <label>Oyun modu</label>
      <select id="ts-mode" style="width:100%;margin-bottom:0.75rem;">
        <option value="501" ${t.game_mode === '501' ? 'selected' : ''}>501</option>
        <option value="701" ${t.game_mode === '701' ? 'selected' : ''}>701</option>
        <option value="1001" ${t.game_mode === '1001' ? 'selected' : ''}>1001</option>
        <option value="cricket" ${t.game_mode === 'cricket' ? 'selected' : ''}>Cricket</option>
      </select>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1.25rem;">
        <div>
          <label>Leg sayısı (bo)</label>
          <input id="ts-legs" type="number" min="1" max="11" value="${t.legs_to_win}" style="width:100%;box-sizing:border-box;" />
        </div>
        <div>
          <label>Set sayısı (bo)</label>
          <input id="ts-sets" type="number" min="1" max="7" value="${t.sets_to_win}" style="width:100%;box-sizing:border-box;" />
        </div>
      </div>

      <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
        <button class="btn secondary" onclick="this.closest('[style*=fixed]').remove()">İptal</button>
        <button class="btn primary" onclick="saveTournamentSettings(${id}, this)">Kaydet</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function saveTournamentSettings(id, btn) {
  const overlay = btn.closest('[style*=fixed]');
  const name = document.getElementById('ts-name').value.trim();
  const game_mode = document.getElementById('ts-mode').value;
  const legs_to_win = +document.getElementById('ts-legs').value;
  const sets_to_win = +document.getElementById('ts-sets').value;
  if (!name) return toast('Turnuva adı boş olamaz');
  const res = await api.patch(`/api/tournaments/${id}`, { name, game_mode, legs_to_win, sets_to_win });
  if (res.error) return toast('Hata: ' + res.error);
  toast('Ayarlar kaydedildi');
  overlay?.remove();
}

// Turnuva bitirilmeye hazır mı? Running + tüm maçlar finished
function canFinishTournament(t) {
  if (t.status !== 'running') return false;
  const playable = t.matches.filter(m => m.entry1_id && m.entry2_id);
  return playable.length > 0 && playable.every(m => m.status === 'finished');
}

// Turnuva istatistik modalı
function showTournamentStats(id) {
  const t = state.tournaments.find(x => x.id === id);
  if (!t) return;
  const report = t.report || [];

  // db.js zaten doğru sıralar (matches_won → legs_won → avg); burada kopyala
  const sorted = [...report];

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
  overlay.innerHTML = `
    <div style="background:var(--surface);border-radius:16px;padding:2rem;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
      <button onclick="this.closest('[style]').remove()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:var(--text-dim);font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
      <h2 style="margin-bottom:0.25rem;">🏆 ${t.name}</h2>
      <div style="color:var(--text-dim);font-size:0.9rem;margin-bottom:1.5rem;">Turnuva istatistikleri</div>

      ${sorted.length === 0 ? '<div style="color:var(--text-dim);">İstatistik bulunamadı.</div>' : `
        <table style="width:100%;border-collapse:collapse;font-size:0.9rem;">
          <thead>
            <tr style="color:var(--text-dim);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid var(--border);">
              <th style="text-align:left;padding:0.5rem 0.25rem;">#</th>
              <th style="text-align:left;padding:0.5rem 0.25rem;">Oyuncu</th>
              <th style="text-align:right;padding:0.5rem 0.25rem;">Maç G/O</th>
              <th style="text-align:right;padding:0.5rem 0.25rem;">Leg</th>
              <th style="text-align:right;padding:0.5rem 0.25rem;">3-Ok Ort.</th>
              <th style="text-align:right;padding:0.5rem 0.25rem;">180</th>
              <th style="text-align:right;padding:0.5rem 0.25rem;">Best CO</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((r, idx) => `
              <tr style="border-bottom:1px solid var(--border);${idx === 0 ? 'color:var(--accent);font-weight:700;' : ''}">
                <td style="padding:0.6rem 0.25rem;">${idx + 1}</td>
                <td style="padding:0.6rem 0.25rem;">${idx === 0 ? '🏆 ' : ''}${r.label || '?'}</td>
                <td style="text-align:right;padding:0.6rem 0.25rem;">${r.matches_won || 0} / ${r.matches_played || 0}</td>
                <td style="text-align:right;padding:0.6rem 0.25rem;">${r.legs_won || 0}</td>
                <td style="text-align:right;padding:0.6rem 0.25rem;">${r.average_3dart ? (+r.average_3dart).toFixed(2) : '—'}</td>
                <td style="text-align:right;padding:0.6rem 0.25rem;">${r.one_eighty || 0}</td>
                <td style="text-align:right;padding:0.6rem 0.25rem;">${r.best_checkout || '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}

      <div style="margin-top:1.5rem;display:flex;gap:0.75rem;justify-content:flex-end;">
        <button class="btn secondary" onclick="this.closest('[style]').remove()">Kapat</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

async function deleteTournament(id) {
  if (!confirm('Turnuva silinsin mi? Tüm maçlar/skorlar kaybolur.')) return;
  await api.del('/api/tournaments/' + id);
}

// ---- Performans raporu ----
async function loadReport(tournamentId) {
  try {
    const res = await fetch('/api/tournaments/' + tournamentId + '/report').then(r => r.json());
    if (res.error) return toast('Hata: ' + res.error);
    reportsCache[tournamentId] = res.report || [];
    renderReport(tournamentId);
  } catch (e) {
    toast('Rapor yüklenemedi: ' + e.message);
  }
}

function toggleReport(tournamentId) {
  const host = document.getElementById('report-' + tournamentId);
  if (!host) return;
  if (host.hidden) {
    host.hidden = false;
    if (!reportsCache[tournamentId]) loadReport(tournamentId);
  } else {
    host.hidden = true;
  }
}

function renderReport(tournamentId) {
  const host = document.getElementById('report-' + tournamentId);
  if (!host) return;
  const rows = reportsCache[tournamentId] || [];
  if (!rows.length) {
    host.innerHTML = '<div class="empty">Henüz istatistik yok — maçlar oynandıkça dolar.</div>';
    return;
  }
  host.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Oyuncu</th>
          <th title="Oynanan maç">M</th>
          <th title="Kazanılan maç">G</th>
          <th title="Kazanılan leg">Leg</th>
          <th title="3-dart ortalama">Ort.</th>
          <th title="Bitirilen leg başına dart">Dart/Leg</th>
          <th title="100-139">100+</th>
          <th title="140-179">140+</th>
          <th>180</th>
          <th title="100 ve üzeri bitiş">High Out</th>
          <th title="En iyi checkout">En İyi CO</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `
          <tr>
            <td>${i + 1}</td>
            <td><strong>${escapeHtml(r.label || '?')}</strong></td>
            <td>${r.matches_played || 0}</td>
            <td>${r.matches_won || 0}</td>
            <td>${r.legs_won || 0}</td>
            <td><strong>${(r.average_3dart || 0).toFixed(2)}</strong></td>
            <td>${r.darts_per_leg ? r.darts_per_leg.toFixed(1) : '—'}</td>
            <td>${r.tons || 0}</td>
            <td>${r.ton_plus || 0}</td>
            <td>${r.one_eighty || 0}</td>
            <td>${r.high_outs || 0}</td>
            <td>${r.best_checkout || '—'}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// ---- Render ----
function render() {
  renderPlayers();
  renderBoards();
  renderStagesWizard();
  renderStagesDraft();
  renderEntriesDraft();
  renderRoundOverridesPanel();
  renderTournaments();
  renderPastTournaments();
}

// Base legs/sets değiştiğinde override paneli yenilensin (placeholder güncellemesi için)
document.addEventListener('DOMContentLoaded', () => {
  ['t-legs', 't-sets', 't-team'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderRoundOverridesPanel);
  });
});
function renderPlayers() {
  document.getElementById('player-count').textContent = state.players.length;
  const list = document.getElementById('player-list');
  if (!state.players.length) {
    list.innerHTML = '<div class="empty">Henüz oyuncu yok</div>';
    return;
  }
  list.innerHTML = state.players.map(p => `
    <li>
      <span><strong>${p.name}</strong>${p.nickname ? ` <span style="color: var(--text-dim);">(${p.nickname})</span>` : ''}</span>
      <button class="icon danger" onclick="deletePlayer(${p.id})">Sil</button>
    </li>
  `).join('');
}

function renderBoards() {
  document.getElementById('board-count').textContent = state.boards.length;
  const host = document.getElementById('board-list');
  if (!state.boards.length) {
    host.innerHTML = '<div class="empty">Henüz board yok</div>';
    return;
  }
  host.innerHTML = state.boards.map(b => `
    <div class="card" style="margin: 0;">
      <div class="row between">
        <h3 style="margin: 0;">${b.name}</h3>
        <span class="chip ${b.status === 'busy' ? 'live' : 'success'}">${b.status === 'busy' ? 'MEŞGUL' : 'BOŞ'}</span>
      </div>
      <div style="margin-top: 0.75rem; color: var(--text-dim); font-size: 0.88rem;">
        ${b.currentMatch
          ? `Aktif: ${entryLabel(b.currentMatch.entry1)} vs ${entryLabel(b.currentMatch.entry2)}`
          : 'Boşta bekliyor'}
      </div>
      <div class="row" style="margin-top: 0.75rem;">
        <a class="btn secondary" href="/board.html?id=${b.id}" target="_blank" style="font-size: 0.85rem;">Tablet ekranını aç ↗</a>
        <button class="icon danger" onclick="deleteBoard(${b.id})">Sil</button>
      </div>
    </div>
  `).join('');
}

function renderTournaments() {
  const host = document.getElementById('tournament-list');
  const active = state.tournaments.filter(t => t.status !== 'finished');
  if (!active.length) {
    host.innerHTML = '<div class="empty">Aktif turnuva yok. "Yeni Turnuva" sekmesinden oluşturabilirsin.</div>';
    return;
  }
  host.innerHTML = active.map(t => renderTournament(t)).join('');
}

function renderPastTournaments() {
  const host = document.getElementById('past-tournament-list');
  if (!host) return;
  const finished = state.tournaments.filter(t => t.status === 'finished');
  if (!finished.length) {
    host.innerHTML = '<div class="empty">Henüz tamamlanmış turnuva yok.</div>';
    return;
  }
  host.innerHTML = finished.map(t => renderTournament(t)).join('');
}

function renderTournament(t) {
  const statusChip = t.status === 'running' ? '<span class="chip live">DEVAM EDİYOR</span>' :
    t.status === 'finished' ? '<span class="chip success">TAMAMLANDI</span>' :
    '<span class="chip warn">TASLAK</span>';

  return `
    <div class="card">
      <div class="row between">
        <div>
          <h3 style="margin-bottom: 0.3rem;">${t.name} ${statusChip}</h3>
          <div style="color: var(--text-dim); font-size: 0.88rem;">
            ${modeLabel(t.game_mode)} · ${t.team_mode === 'singles' ? 'Teklik' : 'Çiftli'} ·
            Best of ${t.legs_to_win * 2 - 1} leg${t.sets_to_win > 1 ? ` · Best of ${t.sets_to_win * 2 - 1} set` : ''} ·
            ${t.entries.length} katılımcı
          </div>
        </div>
        <div class="row">
          ${t.status === 'draft' ? `<button class="secondary" onclick="showTournamentSettings(${t.id})">⚙️ Ayarlar</button>` : ''}
          ${t.status === 'draft' ? `<button class="primary" onclick="startTournament(${t.id})">Başlat</button>` : ''}
          ${t.status !== 'draft' ? `<button class="secondary" onclick="toggleReport(${t.id})">📊 Rapor</button>` : ''}
          ${canFinishTournament(t) ? `<button class="btn" style="background: #22c55e; color: #000; font-weight: 700;" onclick="showTournamentStats(${t.id})">🏆 Turnuvayı Bitir</button>` : ''}
          <button class="danger" onclick="deleteTournament(${t.id})">Sil</button>
        </div>
      </div>

      ${t.stages.map((s, si) => renderStage(t, s, si)).join('')}

      ${t.status !== 'draft' ? `
        <div id="report-${t.id}" hidden style="margin-top: 1rem;">
          <h4 style="color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
            📊 Oyuncu performans raporu
          </h4>
          <div class="empty">Yükleniyor…</div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderStage(t, stage, index) {
  const stageMatches = t.matches.filter(m => m.stage_id === stage.id);
  const formatL = formatLabel(stage.format);

  if (stageMatches.length === 0) {
    return `<div style="margin-top: 1rem; padding: 0.8rem; background: var(--bg-2); border-radius: 8px; color: var(--text-dim); font-size: 0.88rem;">
      Aşama ${index + 1}: ${formatL} — turnuva başlayınca maçlar oluşturulacak
    </div>`;
  }

  // Build bracket view
  if (stage.format === 'round_robin') {
    return renderRRStage(stage, stageMatches);
  }
  return renderElimStage(stage, stageMatches);
}

function renderElimStage(stage, matches) {
  const rounds = {};
  for (const m of matches) {
    const key = `${m.bracket}-${m.round}`;
    (rounds[key] = rounds[key] || []).push(m);
  }
  const sortKeys = (keys) => keys.sort((a, b) => {
    const [ba, ra] = a.split('-'); const [bb, rb] = b.split('-');
    const order = { winners: 0, losers: 1, final: 2 };
    return (order[ba] || 99) - (order[bb] || 99) || +ra - +rb;
  });

  const allKeys = sortKeys(Object.keys(rounds));
  const isDoubleElim = stage.format === 'double_elim';

  // Çift elemede WB, LB ve Final gruplarını ayır
  if (isDoubleElim) {
    const wbKeys = allKeys.filter(k => k.startsWith('winners-'));
    const lbKeys = allKeys.filter(k => k.startsWith('losers-'));
    const finalKeys = allKeys.filter(k => k.startsWith('final-'));

    const renderSection = (keys, sectionLabel) => {
      if (!keys.length) return '';
      return `
        <div style="margin-bottom: 0.75rem;">
          <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.35rem; padding: 0.2rem 0.4rem; background: var(--bg-2); border-radius: 4px; display: inline-block;">${sectionLabel}</div>
          <div class="bracket">
            ${keys.map(k => {
              const ms = rounds[k];
              const [bracket, round] = k.split('-');
              const label = bracket === 'winners' ? `WB R${round}` :
                bracket === 'losers' ? `LB R${round}` : 'Grand Final';
              return `
                <div class="bracket-round">
                  <h4>${label}</h4>
                  ${ms.map(m => renderBracketMatch(m)).join('')}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    };

    return `
      <div style="margin-top: 1rem;">
        <h4 style="color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem;">
          ${formatLabel(stage.format)} — Aşama ${stage.stage_index + 1}
        </h4>
        ${renderSection(wbKeys, '🏆 Winners Bracket')}
        ${renderSection(lbKeys, '🔁 Losers Bracket')}
        ${renderSection(finalKeys, '🎯 Grand Final')}
      </div>
    `;
  }

  // Tek eleme — orijinal görünüm
  return `
    <div style="margin-top: 1rem;">
      <h4 style="color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        ${formatLabel(stage.format)} — Aşama ${stage.stage_index + 1}
      </h4>
      <div class="bracket">
        ${allKeys.map(k => {
          const ms = rounds[k];
          const [bracket, round] = k.split('-');
          const label = bracket === 'final' ? 'Final' :
            bracket === 'losers' ? `Losers R${round}` :
            `R${round}`;
          return `
            <div class="bracket-round">
              <h4>${label}</h4>
              ${ms.map(m => renderBracketMatch(m)).join('')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderBracketMatch(m) {
  const cls = m.status === 'live' ? 'live' : m.status === 'finished' ? 'finished' : '';
  const label1 = entryLabel(m.entry1);
  const label2 = entryLabel(m.entry2);
  const s1 = m.p1_sets > 0 || m.p2_sets > 0 ? `${m.p1_sets} (${m.p1_legs})` : `${m.p1_legs}`;
  const s2 = m.p1_sets > 0 || m.p2_sets > 0 ? `${m.p2_sets} (${m.p2_legs})` : `${m.p2_legs}`;
  const w1 = m.winner_entry_id && m.winner_entry_id === m.entry1_id;
  const w2 = m.winner_entry_id && m.winner_entry_id === m.entry2_id;
  const matchNum = m.match_index != null ? `<span style="font-size:0.68rem;color:var(--text-dim);float:right;opacity:0.7;">#${m.match_index + 1}</span>` : '';
  const resetBadge = m.is_reset_final ? `<span style="font-size:0.68rem;color:var(--warn);margin-left:4px;">RESET</span>` : '';
  return `
    <div class="bracket-match ${cls}">
      <div style="font-size:0.68rem;color:var(--text-dim);padding:0.15rem 0.4rem 0;display:flex;justify-content:space-between;">
        <span>${resetBadge}</span>${matchNum}
      </div>
      <div class="slot ${w1 ? 'winner' : ''}">
        <span>${label1}</span>
        <span class="score">${m.entry1_id ? s1 : ''}</span>
      </div>
      <div class="slot ${w2 ? 'winner' : ''}">
        <span>${label2}</span>
        <span class="score">${m.entry2_id ? s2 : ''}</span>
      </div>
    </div>
  `;
}

function renderRRStage(stage, matches) {
  // Compute standings
  const table = computeRRStandings(matches);
  return `
    <div style="margin-top: 1rem;">
      <h4 style="color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        Round-robin — Aşama ${stage.stage_index + 1}
      </h4>
      <div class="grid cols-2">
        <div>
          <table>
            <thead>
              <tr><th>#</th><th>Oyuncu</th><th>G</th><th>M</th><th>Leg</th><th>P</th></tr>
            </thead>
            <tbody>
              ${table.length === 0 ? '<tr><td colspan="6" class="empty">Henüz sonuç yok</td></tr>' :
                table.map((row, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${entryLabelById(row.entryId)}</td>
                    <td>${row.W}</td>
                    <td>${row.L}</td>
                    <td>${row.legsFor}-${row.legsAgainst}</td>
                    <td><strong>${row.points}</strong></td>
                  </tr>
                `).join('')
              }
            </tbody>
          </table>
        </div>
        <div>
          <table>
            <thead>
              <tr><th>R</th><th>Maç</th><th>Skor</th><th>Durum</th></tr>
            </thead>
            <tbody>
              ${matches.map(m => `
                <tr>
                  <td>R${m.round}</td>
                  <td>${entryLabel(m.entry1)} vs ${entryLabel(m.entry2)}</td>
                  <td>${m.p1_legs}-${m.p2_legs}</td>
                  <td>${statusBadge(m.status)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function statusBadge(s) {
  if (s === 'live') return '<span class="chip live">CANLI</span>';
  if (s === 'finished') return '<span class="chip success">TAMAM</span>';
  if (s === 'ready') return '<span class="chip warn">HAZIR</span>';
  return '<span class="chip">BEKLİYOR</span>';
}

function computeRRStandings(matches) {
  const table = {};
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    for (const slot of [1, 2]) {
      const eid = slot === 1 ? m.entry1_id : m.entry2_id;
      if (!eid) continue;
      if (!table[eid]) table[eid] = { entryId: eid, W: 0, L: 0, legsFor: 0, legsAgainst: 0, points: 0 };
      const legsFor = slot === 1 ? m.p1_legs : m.p2_legs;
      const legsAgainst = slot === 1 ? m.p2_legs : m.p1_legs;
      table[eid].legsFor += legsFor;
      table[eid].legsAgainst += legsAgainst;
      if (m.winner_entry_id === eid) { table[eid].W++; table[eid].points += 3; }
      else table[eid].L++;
    }
  }
  return Object.values(table).sort((a, b) =>
    b.points - a.points || (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst));
}

function entryLabelById(id) {
  for (const t of state.tournaments) {
    const e = t.entries.find(x => x.id === id);
    if (e) return entryLabel(e);
  }
  return '?';
}

// Initial render
render();
