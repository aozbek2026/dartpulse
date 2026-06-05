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

// Çift eleme bracket reset: GF'de LB kazandı → leg sayısı sor → reset maçını oluştur
socket.on('tournament:reset_needed', ({ tournamentId, gfMatchId, defaultLegs }) => {
  showResetFinalModal(tournamentId, gfMatchId, defaultLegs);
});

function showResetFinalModal(tournamentId, gfMatchId, defaultLegs) {
  // Zaten açık bir reset modal var mı?
  if (document.getElementById('reset-final-modal')) return;

  const overlay = document.createElement('div');
  overlay.id = 'reset-final-modal';
  overlay.style.cssText = `
    position:fixed;inset:0;z-index:9000;
    background:rgba(0,0,0,0.72);
    display:flex;align-items:center;justify-content:center;
  `;
  overlay.innerHTML = `
    <div style="
      background:var(--surface);
      border:1px solid var(--border);
      border-radius:16px;
      padding:2rem 2.25rem;
      max-width:400px;width:92%;
      box-shadow:0 24px 64px -16px rgba(0,0,0,0.7);
    ">
      <div style="font-size:1.5rem;margin-bottom:0.35rem;">🔄 Bracket Reset</div>
      <p style="color:var(--text-dim);margin:0 0 1.25rem;font-size:0.95rem;line-height:1.5;">
        Grand Final'i <strong>LB oyuncusu</strong> kazandı — iki oyuncu da 1'er mağlubiyetle eşit.<br>
        Belirleyici maç oynanacak. Kaç leg oynansın?
      </p>
      <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.5rem;">
        <label style="font-weight:600;font-size:0.95rem;white-space:nowrap;">Leg sayısı (kazanmak için):</label>
        <input id="reset-legs-input" type="number" min="1" max="20" value="${defaultLegs || 2}"
          style="width:70px;padding:0.5rem 0.6rem;border-radius:8px;border:1px solid var(--border);
                 background:var(--surface-2);color:var(--text);font-size:1rem;text-align:center;" />
      </div>
      <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
        <button id="reset-confirm-btn" style="
          background:linear-gradient(135deg,var(--accent),var(--accent-3));
          color:#fff;border:0;border-radius:9px;
          padding:0.7rem 1.5rem;font-weight:700;font-size:0.95rem;cursor:pointer;
        ">Reset Maçını Oluştur</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById('reset-legs-input');
  input.focus();
  input.select();

  document.getElementById('reset-confirm-btn').onclick = async () => {
    const legs = parseInt(input.value, 10);
    if (!legs || legs < 1 || legs > 20) {
      input.style.borderColor = 'var(--accent)';
      input.focus();
      return;
    }
    document.getElementById('reset-confirm-btn').disabled = true;
    document.getElementById('reset-confirm-btn').textContent = 'Oluşturuluyor…';
    try {
      const r = await fetch(`/api/tournament/${tournamentId}/create-reset-final`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ gfMatchId, legs_to_win: legs }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Hata');
      overlay.remove();
    } catch (err) {
      alert('Reset maçı oluşturulamadı: ' + err.message);
      document.getElementById('reset-confirm-btn').disabled = false;
      document.getElementById('reset-confirm-btn').textContent = 'Reset Maçını Oluştur';
    }
  };

  // Enter ile onayla
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('reset-confirm-btn').click();
  });
}

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
  if (!await showOrgConfirm('Silinsin mi?', 'Sil', 'İptal')) return;
  await api.del('/api/players/' + id);
}

async function bulkAddPlayers() {
  const raw = document.getElementById('bulk-names').value;
  const lines = raw.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (!lines.length) return toast('Liste boş');
  let added = 0, skipped = 0;
  const seen = new Set(); // liste içi tekrarları da engelle
  for (const line of lines) {
    const parts = line.split('/').map(p => p.trim());
    const name = parts[0];
    const nickname = parts[1] || '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);
    const res = await api.post('/api/players', { name, nickname });
    if (res && res.error) { skipped++; continue; } // sunucudan duplicate hatası
    added++;
  }
  document.getElementById('bulk-names').value = '';
  const det = document.getElementById('bulk-details');
  if (det) det.removeAttribute('open');
  const msg = skipped > 0 ? `${added} oyuncu eklendi, ${skipped} tekrar atlandı` : `${added} oyuncu eklendi`;
  toast(msg);
}

// ---- Boards ----
async function addBoard() {
  const name = document.getElementById('board-name').value.trim();
  if (!name) return toast('İsim gerekli');
  const tidRaw = document.getElementById('board-tournament').value;
  const tid = tidRaw ? +tidRaw : null;
  await api.post('/api/boards', { name, tournament_id: tid });
  document.getElementById('board-name').value = '';
  // Seçili turnuvayı sıfırlama: aynı turnuvaya birden fazla board peş peşe eklemek kolay olsun
}
async function deleteBoard(id) {
  if (!await showOrgConfirm('Silinsin mi?', 'Sil', 'İptal')) return;
  await api.del('/api/boards/' + id);
}
async function changeBoardTournament(boardId, tidRaw) {
  const tid = tidRaw ? +tidRaw : null;
  await api.patch('/api/boards/' + boardId, { tournament_id: tid });
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
  const groupSize = s0.config?.group_size || '';

  // Önizleme hesapla
  let groupPreview = '';
  let qualifierPreview = '';
  if (primary === 'round_robin' && groupSize >= 2) {
    const entryCount = _entryCountForStage(0);
    if (entryCount > 0) {
      const gc = Math.ceil(entryCount / groupSize);
      const floorSz = Math.floor(entryCount / gc);
      const extraGc = entryCount % gc;
      const sizeDesc = extraGc > 0
        ? `${gc} grup (${extraGc}×${floorSz + 1} kişi, ${gc - extraGc}×${floorSz} kişi)`
        : `${gc} grup × ${floorSz} kişi`;
      groupPreview = `<div style="font-size:0.82rem;color:var(--accent-2);margin-top:0.3rem;">→ ${sizeDesc}</div>`;
      if (qcount) {
        const total = +qcount;
        const directPG = Math.floor(total / gc);
        const lucky = total - gc * directPG;
        const luckyTxt = lucky > 0 ? ` + ${lucky} lucky loser` : '';
        qualifierPreview = `<div style="font-size:0.82rem;color:var(--accent-2);margin-top:0.3rem;">→ ${gc}×${directPG} direkt${luckyTxt} = ${total} kişi</div>`;
      }
    }
  }

  host.innerHTML = `
    <div class="grid cols-2" style="gap: 0.75rem;">
      <div>
        <label>Format</label>
        <select id="wiz-primary" style="width: 100%;" onchange="wizSetPrimary(this.value)">
          <option value="single_elim" ${primary === 'single_elim' ? 'selected' : ''}>Tek eleme (single elimination)</option>
          <option value="double_elim" ${primary === 'double_elim' ? 'selected' : ''}>Çift eleme (double elimination)</option>
          <option value="round_robin" ${primary === 'round_robin' ? 'selected' : ''}>Grup aşaması (round-robin)</option>
        </select>
      </div>
      ${primary === 'round_robin' ? `
        <div>
          <label>Grup başına kaç oyuncu?</label>
          <input type="number" id="wiz-gsize" min="2" max="20" value="${groupSize}"
            placeholder="örn: 4" oninput="wizSetGroupSize(this.value)" style="width: 100%;" />
          ${groupPreview}
        </div>
      ` : '<div></div>'}
    </div>

    ${primary === 'round_robin' ? `
      <div class="grid cols-2" style="gap: 0.75rem; margin-top: 0.75rem;">
        <div>
          <label>Toplam kaç oyuncu üst tura çıksın?</label>
          <input type="number" id="wiz-qcount" min="1" value="${qcount}" placeholder="örn: 8"
            oninput="wizSetQualifierCount(this.value)" style="width: 100%;" />
          ${qualifierPreview}
        </div>
        <div>
          <label>Sıradaki aşama</label>
          <select id="wiz-secondary" style="width: 100%;" onchange="wizSetSecondary(this.value)">
            <option value="single_elim" ${secondary === 'single_elim' ? 'selected' : ''}>Tek eleme</option>
            <option value="double_elim" ${secondary === 'double_elim' ? 'selected' : ''}>Çift eleme</option>
          </select>
        </div>
      </div>
    ` : ''}
  `;
}

function wizSetPrimary(val) {
  if (val === 'round_robin') {
    const qcount = stagesDraft[0]?.qualifier_count || null;
    const groupSize = stagesDraft[0]?.config?.group_size || null;
    const secondary = stagesDraft[1]?.format || 'single_elim';
    stagesDraft = [
      { format: 'round_robin', qualifier_count: qcount, config: { group_size: groupSize } },
      { format: secondary, qualifier_count: null, config: {} },
    ];
  } else {
    stagesDraft = [{ format: val, qualifier_count: null, config: {} }];
  }
  renderStagesWizard();
  renderStagesDraft();
  renderRoundOverridesPanel();
}
function wizSetGroupSize(val) {
  const n = val ? +val : null;
  if (!stagesDraft[0]) return;
  if (!stagesDraft[0].config) stagesDraft[0].config = {};
  stagesDraft[0].config.group_size = (n && n >= 2) ? n : null;
  renderStagesWizard();
  renderStagesDraft();
}
function wizSetQualifierCount(val) {
  const n = val ? +val : null;
  if (stagesDraft[0]) stagesDraft[0].qualifier_count = (n && n >= 1) ? n : null;
  renderStagesWizard();
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

function onGameModeChange(val) {
  const fbOpts = document.getElementById('fb-options');
  if (fbOpts) fbOpts.style.display = (val === 'cricket_fb_cezali' || val === 'cricket_fb_karambol') ? '' : 'none';
}

function modeLabel(mode) {
  return { '501': '501', '701': '701', '1001': '1001', cricket: 'Cricket', cricket_fb_cezali: 'Full Board Cezalı', cricket_fb_karambol: 'Full Board Karambol' }[mode] || mode;
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

  let game_config_json = null;
  if (game_mode === 'cricket_fb_cezali' || game_mode === 'cricket_fb_karambol') {
    const includeLow = document.getElementById('t-include-low')?.checked !== false;
    game_config_json = JSON.stringify({ include_low: includeLow });
  }

  const body = {
    name, game_mode, team_mode, legs_to_win, sets_to_win,
    config_json: game_config_json,
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
  let msg = 'Turnuvayı başlatmak istediğinizden emin misiniz?';
  if (state.boards.length === 0) {
    msg = '⚠️ Henüz hiç board eklenmemiş!\n\nMaçlar board olmadan oynanamaz. "Board\'lar" sekmesinden board ekledikten sonra başlatmanı öneririz.\n\nYine de şimdi başlatmak istiyor musun?';
  }
  const devam = await showOrgConfirm(msg, 'Başlat', 'İptal');
  if (!devam) return;
  const res = await api.post(`/api/tournaments/${id}/start`, {});
  if (res.error) return toast('Hata: ' + res.error);
  toast('Turnuva başladı');
}

function showOrgConfirm(message, okLabel = 'Evet', cancelLabel = 'İptal') {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:2rem;max-width:420px;width:100%;">
        <div style="font-size:1rem;line-height:1.5;margin-bottom:1.5rem;white-space:pre-line;">${message}</div>
        <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
          <button id="oc-no" style="padding:0.65rem 1.25rem;border-radius:8px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);font-size:0.95rem;cursor:pointer;">${cancelLabel}</button>
          <button id="oc-yes" style="padding:0.65rem 1.25rem;border-radius:8px;border:none;background:var(--accent);color:#000;font-size:0.95rem;font-weight:700;cursor:pointer;">${okLabel}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#oc-yes').onclick = () => close(true);
    overlay.querySelector('#oc-no').onclick = () => close(false);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
  });
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
        <option value="cricket_fb_cezali" ${t.game_mode === 'cricket_fb_cezali' ? 'selected' : ''}>Cricket Full Board Cezalı</option>
        <option value="cricket_fb_karambol" ${t.game_mode === 'cricket_fb_karambol' ? 'selected' : ''}>Cricket Full Board Karambol</option>
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
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  overlay.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:var(--surface);border-radius:16px;padding:2rem;max-width:700px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
      <button id="org-stats-close" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:var(--text-dim);font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
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
  // Close button + Esc
  const closeIt = () => overlay.remove();
  overlay.querySelector('#org-stats-close').onclick = closeIt;
  const escHandler = (e) => { if (e.key === 'Escape') { closeIt(); document.removeEventListener('keydown', escHandler); } };
  document.addEventListener('keydown', escHandler);
}

async function deleteTournament(id) {
  if (!await showOrgConfirm('Turnuva silinsin mi?\nTüm maçlar ve skorlar kaybolur.', 'Sil', 'İptal')) return;
  await api.del('/api/tournaments/' + id);
}

async function hideFromPublic(id, btn) {
  if (!await showOrgConfirm('Bu turnuva izleyici listesinden kaldırılsın mı?', 'Kaldır', 'İptal')) return;
  await api.patch('/api/tournaments/' + id + '/hide-public', {});
  if (btn) btn.remove();
  toast('İzleyici listesinden kaldırıldı.');
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
  maybeFocusTournament();
}

// Lig/sezon detay sayfasindan gelinince ?focus=ID parametresi varsa
// once dogru sekmeye gec, sonra o turnuvaya scroll + kisaca highlight.
// Sadece bir kez calistirilir.
let _focusDone = false;
function maybeFocusTournament() {
  if (_focusDone) return;
  const u = new URL(window.location.href);
  const fid = parseInt(u.searchParams.get('focus'), 10);
  if (!fid) { _focusDone = true; return; }
  const el = document.getElementById('tournament-' + fid);
  if (!el) return; // state henuz yuklenmediyse bir sonraki render'da dene
  _focusDone = true;

  // Hangi sekmedeyiz? (aktif vs gecmis) → ona gore tab-link click et
  const inPast = !!el.closest('#past-tournament-list');
  const targetTab = inPast ? 'past-tournaments' : 'tournaments';
  const tabLink = document.querySelector(`.tab-link[data-tab="${targetTab}"]`);
  if (tabLink) tabLink.click();

  // Tab gecisi gizli flag'i kaldirinca, scroll target'i artik gorunur olur
  setTimeout(() => {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.transition = 'box-shadow 0.4s';
    el.style.boxShadow = '0 0 0 3px var(--accent, #f59e0b)';
    setTimeout(() => { el.style.boxShadow = ''; }, 2000);
  }, 120);
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

  // Add Board form'undaki turnuva dropdown'unu doldur (aktif turnuvalar)
  const tSel = document.getElementById('board-tournament');
  if (tSel) {
    const activeTours = state.tournaments.filter(t => t.status !== 'finished');
    const currentVal = tSel.value;
    tSel.innerHTML = '<option value="">— Genel (her turnuva) —</option>'
      + activeTours.map(t => `<option value="${t.id}">${t.name}</option>`).join('');
    if (currentVal) tSel.value = currentVal;
  }

  if (!state.boards.length) {
    host.innerHTML = '<div class="empty">Henüz board yok</div>';
    return;
  }

  // Turnuvaya göre grupla
  const tourMap = new Map();
  for (const t of state.tournaments) tourMap.set(t.id, t);
  const groups = new Map(); // key: tournament_id veya 'general'
  for (const b of state.boards) {
    const key = b.tournament_id || 'general';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }

  // Sıralama: önce aktif turnuvalar (id'ye göre), sonra finish olmuş, sonra Genel en sonda
  const orderedKeys = [];
  for (const t of state.tournaments) {
    if (groups.has(t.id) && t.status !== 'finished') orderedKeys.push(t.id);
  }
  for (const t of state.tournaments) {
    if (groups.has(t.id) && t.status === 'finished') orderedKeys.push(t.id);
  }
  if (groups.has('general')) orderedKeys.push('general');

  const activeTours = state.tournaments.filter(t => t.status !== 'finished');
  const tourOptions = (selectedId) =>
    `<option value=""${selectedId == null ? ' selected' : ''}>— Atanmamış (maç almaz) —</option>` +
    activeTours.map(t => `<option value="${t.id}"${selectedId === t.id ? ' selected' : ''}>${t.name}</option>`).join('');

  host.innerHTML = orderedKeys.map(k => {
    const groupBoards = groups.get(k);
    const isUnassigned = (k === 'general');
    const groupName = isUnassigned
      ? '⚠️ Atanmamış (maç almaz)'
      : (tourMap.get(k)?.name || `Turnuva #${k}`);
    const groupBg = isUnassigned
      ? 'background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35);'
      : 'background: var(--surface-2);';
    const groupNote = isUnassigned
      ? `<div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 0.2rem; font-weight: 400;">
           Bu boardlar hiçbir turnuvaya atanmadığı için maç almaz. Aşağıdan bir turnuva seçin.
         </div>`
      : '';
    const cards = groupBoards.map(b => `
      <div class="card" style="margin: 0;${isUnassigned ? ' border-color: rgba(245, 158, 11, 0.4);' : ''}">
        <div class="row between">
          <h3 style="margin: 0;">${b.name}</h3>
          <span class="chip ${b.status === 'busy' ? 'live' : (isUnassigned ? '' : 'success')}" ${isUnassigned ? 'style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;"' : ''}>
            ${b.status === 'busy' ? 'MEŞGUL' : (isUnassigned ? 'PASİF' : 'BOŞ')}
          </span>
        </div>
        <div style="margin-top: 0.75rem; color: var(--text-dim); font-size: 0.88rem;">
          ${b.currentMatch
            ? `Aktif: ${entryLabel(b.currentMatch.entry1)} vs ${entryLabel(b.currentMatch.entry2)}`
            : (isUnassigned ? 'Atanmamış — maç almaz' : 'Boşta bekliyor')}
        </div>
        <div class="row" style="margin-top: 0.75rem; gap: 0.5rem; flex-wrap: wrap;">
          <select onchange="changeBoardTournament(${b.id}, this.value)" style="flex: 1; min-width: 140px; padding: 0.45rem; font-size: 0.82rem;${isUnassigned ? ' border-color: #f59e0b;' : ''}">
            ${tourOptions(b.tournament_id)}
          </select>
          <a class="btn secondary" href="/board.html?id=${b.id}" target="_blank" style="font-size: 0.85rem;">Tablet ↗</a>
          <button class="icon danger" onclick="deleteBoard(${b.id})">Sil</button>
        </div>
      </div>
    `).join('');
    return `
      <div style="margin-bottom: 1.25rem;">
        <h4 style="margin: 0 0 0.6rem 0; padding: 0.4rem 0.75rem; ${groupBg} border-radius: 6px; font-size: 0.95rem;">
          ${groupName} <span style="color: var(--text-dim); font-weight: 400; font-size: 0.85rem;">(${groupBoards.length})</span>
          ${groupNote}
        </h4>
        <div class="grid cols-3">${cards}</div>
      </div>`;
  }).join('');
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
    <div class="card" id="tournament-${t.id}">
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
          ${t.status === 'draft' && t.entries.length >= 2 ? `<button class="secondary" onclick="showMatchEditModal(${t.id})">🔀 Eşleşmeleri Düzenle</button>` : ''}
          ${t.status === 'draft' ? `<button class="primary" onclick="startTournament(${t.id})">Başlat</button>` : ''}
          ${t.status !== 'draft' ? `<button class="secondary" onclick="toggleReport(${t.id})">📊 Rapor</button>` : ''}
          ${canFinishTournament(t) ? `<button class="btn" style="background: #22c55e; color: #000; font-weight: 700;" onclick="showTournamentStats(${t.id})">🏆 Turnuvayı Bitir</button>` : ''}
          ${t.status === 'finished' && !t.hidden_from_public ? `<button class="secondary" title="İzleyici listesinden kaldır" onclick="hideFromPublic(${t.id}, this)">👁 Listeden Kaldır</button>` : ''}
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

// Tek eleme ve WB bölümleri için SVG çizgili, hizalamalı bracket görünümü
function renderElimBracketSVG(columns, matchFn) {
  if (!columns.length) return '';
  const MW = 180, MH = 64, CS = 225, LH = 24, UH = 72;
  const firstCount = columns[0].matches.length;
  const cy = (r, i) => i * UH * Math.pow(2, r) + UH * Math.pow(2, r) / 2;
  const totalW = (columns.length - 1) * CS + MW;
  const totalH = firstCount * UH + LH + 8;

  let svgLines = '';
  for (let r = 0; r < columns.length - 1; r++) {
    const nextCount = columns[r + 1].matches.length;
    const xR = r * CS + MW, xN = (r + 1) * CS, xM = (xR + xN) / 2;
    for (let i = 0; i < nextCount; i++) {
      const c1 = cy(r, i * 2), c2 = cy(r, i * 2 + 1), cm = (c1 + c2) / 2;
      svgLines += `<line x1="${xR}" y1="${c1}" x2="${xM}" y2="${c1}" stroke="var(--border)" stroke-width="1.5"/>`;
      svgLines += `<line x1="${xR}" y1="${c2}" x2="${xM}" y2="${c2}" stroke="var(--border)" stroke-width="1.5"/>`;
      svgLines += `<line x1="${xM}" y1="${c1}" x2="${xM}" y2="${c2}" stroke="var(--border)" stroke-width="1.5"/>`;
      svgLines += `<line x1="${xM}" y1="${cm}" x2="${xN}" y2="${cm}" stroke="var(--border)" stroke-width="1.5"/>`;
    }
  }

  let html = '';
  columns.forEach((col, r) => {
    html += `<div style="position:absolute;top:0;left:${r * CS}px;width:${MW}px;text-align:center;font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;line-height:${LH}px;">${col.label}</div>`;
    col.matches.forEach((m, i) => {
      const top = Math.round(cy(r, i) - MH / 2 + LH);
      html += `<div style="position:absolute;top:${top}px;left:${r * CS}px;width:${MW}px;">${matchFn(m)}</div>`;
    });
  });

  return `<div style="overflow-x:auto;padding-bottom:0.5rem;">
    <div style="position:relative;width:${totalW}px;height:${totalH}px;">
      <svg style="position:absolute;top:${LH}px;left:0;width:${totalW}px;height:${totalH - LH}px;pointer-events:none;overflow:visible;">${svgLines}</svg>
      ${html}
    </div>
  </div>`;
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
    // `|| 99` kullanma — winners=0 falsy olur, Final sola kaçar. `??` ile düzelt.
    return ((order[ba] ?? 99) - (order[bb] ?? 99)) || (+ra - +rb);
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
      const isWB = keys[0].startsWith('winners-');
      let bracketHTML;
      if (isWB) {
        const cols = keys.map(k => {
          const [, round] = k.split('-');
          const cnt = rounds[k].length;
          const label = cnt === 1 ? 'WB Final' : cnt === 2 ? 'WB Yarı Final' : `WB R${round}`;
          return { label, matches: rounds[k] };
        });
        bracketHTML = renderElimBracketSVG(cols, renderBracketMatch);
      } else {
        bracketHTML = `<div class="bracket">
          ${keys.map(k => {
            const ms = rounds[k];
            const [bracket, round] = k.split('-');
            const label = bracket === 'losers' ? `LB R${round}` : 'Grand Final';
            return `<div class="bracket-round"><h4>${label}</h4>${ms.map(m => renderBracketMatch(m)).join('')}</div>`;
          }).join('')}
        </div>`;
      }
      return `
        <div style="margin-bottom: 0.75rem;">
          <div style="font-size: 0.72rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.35rem; padding: 0.2rem 0.4rem; background: var(--bg-2); border-radius: 4px; display: inline-block;">${sectionLabel}</div>
          ${bracketHTML}
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

  // Tek eleme — SVG bağlantı çizgili, hizalamalı görünüm
  const columns = allKeys.map(k => {
    const [bracket, round] = k.split('-');
    const cnt = rounds[k].length;
    const label = bracket === 'final' ? 'Final' :
      cnt === 1 ? 'Final' : cnt === 2 ? 'Yarı Final' :
      cnt === 4 ? 'Çeyrek Final' : cnt === 8 ? 'Son 16' :
      cnt === 16 ? 'Son 32' : `R${round}`;
    return { label, matches: rounds[k] };
  });
  return `
    <div style="margin-top: 1rem;">
      <h4 style="color: var(--text-dim); font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        ${formatLabel(stage.format)} — Aşama ${stage.stage_index + 1}
      </h4>
      ${renderElimBracketSVG(columns, renderBracketMatch)}
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

// ---- Eşleşmeleri Düzenle Modalı ----

let _editTournamentId = null;   // hangi turnuvanın düzenleniyor
let _editEntries = [];          // çalışma kopyası (slot sırasına göre)
let _editSelected = null;       // click-to-swap: seçili entry id

// İstemci tarafında 2'nin katlarına yuvarla (bracket boyutu için)
function _nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Standart turnuva tohumlaması: [1, N, N/2+1, N/2, ...]
function _buildSeedOrder(n) {
  if (n === 1) return [1];
  const prev = _buildSeedOrder(n / 2);
  const result = [];
  for (const s of prev) {
    result.push(s);
    result.push(n + 1 - s);
  }
  return result;
}

function showMatchEditModal(tournamentId) {
  const t = state.tournaments.find(x => x.id === tournamentId);
  if (!t || t.status !== 'draft') return;
  _editTournamentId = tournamentId;
  _editEntries = [...t.entries].sort((a, b) => a.slot - b.slot);
  _editSelected = null;
  _renderMatchEditModal();
}

function _renderMatchEditModal() {
  document.getElementById('match-edit-overlay')?.remove();

  const t = state.tournaments.find(x => x.id === _editTournamentId);
  if (!t) return;

  const n = _editEntries.length;
  const bracketSize = _nextPow2(n);
  // Gerçek bracket motoruyla (src/tournament.js → seedWithByes) BİREBİR aynı düzen:
  // _editEntries sırası "seed 1, seed 2, ..." kabul edilir, seed sırasına göre
  // bracket'e yerleştirilir, BYE'lar dağıtılır. Böylece önizleme gerçeği yansıtır
  // ve iki BYE asla yan yana gelmez.
  const seedOrder = _buildSeedOrder(bracketSize); // [1, N, N/2+1, ...]
  const placed = new Array(bracketSize).fill(null);
  for (let s = 0; s < bracketSize; s++) {
    const idx = seedOrder[s] - 1; // 0-tabanlı
    placed[s] = idx < n ? _editEntries[idx] : null;
  }
  const pairs = [];
  for (let i = 0; i < bracketSize; i += 2) {
    pairs.push([placed[i] ?? null, placed[i + 1] ?? null]);
  }

  const pairsHtml = pairs.map((pair, mi) => {
    const [e1, e2] = pair;
    return `
      <div class="mep-row">
        <span class="mep-num">Maç ${mi + 1}</span>
        ${_editEntryChip(e1)}
        <span class="mep-vs">vs</span>
        ${_editEntryChip(e2)}
      </div>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.id = 'match-edit-overlay';
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal mep-modal">
      <h3 style="margin-bottom:0.4rem">🔀 Eşleşmeleri Düzenle</h3>
      <p class="mep-hint">Bir isme bas → sarıya döner (seçili). Ardından başka bir isme bas → yer değişir.</p>
      <div class="mep-toolbar">
        <button class="secondary" onclick="_editShuffle()">🎲 Karıştır</button>
        <button class="secondary" onclick="_editSortSeq()">🔢 Sıralı</button>
        <button class="secondary" onclick="_editSortSeeded()">🏆 Seri Başı</button>
      </div>
      <div id="mep-pairs">${pairsHtml}</div>
      <div class="mep-actions">
        <button class="secondary" onclick="_closeMatchEditModal()">İptal</button>
        <button class="primary" onclick="_saveMatchEdit()">Kaydet</button>
      </div>
    </div>`;

  overlay.addEventListener('click', e => { if (e.target === overlay) _closeMatchEditModal(); });
  document.body.appendChild(overlay);
}

function _editEntryChip(entry) {
  if (!entry) return `<span class="mep-chip mep-bye">BYE</span>`;
  const p1 = state.players.find(p => p.id === entry.player1_id);
  const name = p1 ? (p1.nickname || p1.name) : '?';
  const isSel = _editSelected === entry.id;
  return `<span class="mep-chip${isSel ? ' mep-sel' : ''}" onclick="_editTap(${entry.id})">${name}</span>`;
}

function _editTap(entryId) {
  if (_editSelected === null) {
    _editSelected = entryId;
  } else if (_editSelected === entryId) {
    _editSelected = null; // aynısına basınca iptal
  } else {
    // swap
    const ia = _editEntries.findIndex(e => e.id === _editSelected);
    const ib = _editEntries.findIndex(e => e.id === entryId);
    if (ia !== -1 && ib !== -1) {
      [_editEntries[ia], _editEntries[ib]] = [_editEntries[ib], _editEntries[ia]];
    }
    _editSelected = null;
  }
  _renderMatchEditModal();
}

function _editShuffle() {
  for (let i = _editEntries.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [_editEntries[i], _editEntries[j]] = [_editEntries[j], _editEntries[i]];
  }
  _editSelected = null;
  _renderMatchEditModal();
}

function _editSortSeq() {
  // Orijinal ekleniş sırasına dön (slot değerine göre sırala — sunucudaki mevcut slot)
  const t = state.tournaments.find(x => x.id === _editTournamentId);
  _editEntries = [...t.entries].sort((a, b) => a.slot - b.slot);
  _editSelected = null;
  _renderMatchEditModal();
}

function _editSortSeeded() {
  // Seri başlarını öne al: seed değeri olanlar küçükten büyüğe (seed 1, 2, ...),
  // ardından seed'siz oyuncular mevcut sıralarında.
  // Dağıtım (1-vs-N, BYE serpiştirme) artık _renderMatchEditModal'daki seedOrder
  // ile otomatik yapıldığı için burada SADECE sıralama listesi hazırlanır.
  const seeded = _editEntries.filter(e => e && e.seed).slice().sort((a, b) => a.seed - b.seed);
  const unseeded = _editEntries.filter(e => !e || !e.seed);
  _editEntries = [...seeded, ...unseeded];
  _editSelected = null;
  _renderMatchEditModal();
}

function _closeMatchEditModal() {
  document.getElementById('match-edit-overlay')?.remove();
  _editTournamentId = null;
  _editEntries = [];
  _editSelected = null;
}

async function _saveMatchEdit() {
  if (!_editTournamentId) return;
  const order = _editEntries.map(e => e.id);
  const res = await api.put(`/api/tournaments/${_editTournamentId}/entries/reorder`, { order });
  if (res.error) { toast('Hata: ' + res.error); return; }
  toast('Eşleşmeler kaydedildi');
  _closeMatchEditModal();
}

// Initial render
render();
