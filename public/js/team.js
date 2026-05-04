// team.js — Takım Maçı yönetim arayüzü

const socket = io();
let events  = [];
let players = []; // kayıtlı oyuncu havuzu

const PHASE_LABELS = { singles: '① Tekli Maçlar', beer: '② Bira Maçı', doubles: '③ Eşli Maçlar' };
const MODE_LABELS  = {
  '501':  '501 Double-out',
  '701':  '701 Double-out',
  '1001': '1001 Double-out',
  'cricket':             'Cricket',
  'cricket_fb_cezali':   'Cricket Full Board Cezalı',
  'cricket_fb_karambol': 'Cricket Full Board Karambol',
};

// ── Tab sistemi ──────────────────────────────────────────────────────────────
document.querySelectorAll('.tab-link').forEach(a => {
  a.addEventListener('click', e => {
    e.preventDefault();
    const tab = a.dataset.tab;
    document.querySelectorAll('.tab-link').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.tab').forEach(s => s.hidden = true);
    const el = document.getElementById('tab-' + tab);
    if (el) el.hidden = false;
  });
});

// ── Veri yükle ───────────────────────────────────────────────────────────────
async function loadPlayers() {
  try {
    const res = await fetch('/api/players', { credentials: 'same-origin' });
    players = await res.json();
    renderPlayerPool();
    refreshDatalist();
  } catch {}
}

async function loadEvents() {
  try {
    const res = await fetch('/api/team-events', { credentials: 'same-origin' });
    events = await res.json();
    renderEventsList();
  } catch {
    document.getElementById('events-list').innerHTML =
      '<p style="color:var(--text-dim)">Yüklenemedi.</p>';
  }
}

socket.on('team:update', ev => {
  const idx = events.findIndex(e => e.id === ev.id);
  if (idx >= 0) events[idx] = ev; else events.unshift(ev);
  renderEventsList();
});
socket.on('team:deleted', ({ id }) => {
  events = events.filter(e => e.id !== id);
  renderEventsList();
});

// ── Oyuncu havuzu ────────────────────────────────────────────────────────────
function refreshDatalist() {
  let dl = document.getElementById('player-pool-dl');
  if (!dl) {
    dl = document.createElement('datalist');
    dl.id = 'player-pool-dl';
    document.body.appendChild(dl);
  }
  dl.innerHTML = players.map(p =>
    `<option value="${esc(p.nickname || p.name)}">${esc(p.name)}${p.nickname ? ' (' + esc(p.nickname) + ')' : ''}</option>`
  ).join('');
}

function renderPlayerPool() {
  const el = document.getElementById('player-pool-panel');
  if (!el) return;
  if (!players.length) { el.innerHTML = '<em style="color:var(--text-dim);font-size:0.82rem;">Oyuncu havuzu boş — Organizatör sayfasından ekle.</em>'; return; }
  el.innerHTML = players.map(p =>
    `<span class="player-chip" onclick="chipClick('${esc(p.nickname || p.name)}')">${esc(p.nickname || p.name)}</span>`
  ).join('');
}

// Chip tıklanınca: odaktaki input varsa oraya yaz, yoksa clipboard'a kopyala
function chipClick(name) {
  const focused = document.activeElement;
  if (focused && (focused.tagName === 'INPUT') && focused.closest('.tm-add-row, .tm-modal')) {
    focused.value = name;
    focused.dispatchEvent(new Event('input'));
    return;
  }
  navigator.clipboard?.writeText(name).catch(() => {});
  // küçük toast
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = `"${name}" kopyalandı`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ── Render ───────────────────────────────────────────────────────────────────
function renderEventsList() {
  const el = document.getElementById('events-list');
  if (!events.length) {
    el.innerHTML = '<p style="color:var(--text-dim)">Henüz takım maçı yok. "Yeni Maç" sekmesinden oluştur.</p>';
    return;
  }
  el.innerHTML = events.map(ev => renderEvent(ev)).join('');
}

function renderEvent(ev) {
  const statusLabel = { draft: 'Taslak', running: 'Devam Ediyor', finished: 'Tamamlandı' }[ev.status] || ev.status;
  const phasesHtml  = (ev.phases || []).map(ph => renderPhase(ev, ph)).join('');

  return `<div class="card" id="ev-${ev.id}">
    <div class="event-card-header">
      <div>
        <strong style="font-size:1.05rem">${esc(ev.name)}</strong>
        <span class="status-pill ${ev.status}" style="margin-left:0.5rem">${statusLabel}</span>
      </div>
      <div style="display:flex;gap:0.4rem;align-items:center">
        ${ev.status !== 'finished'
          ? `<button class="secondary" style="font-size:0.78rem;padding:0.25rem 0.6rem" onclick="finishEvent(${ev.id})">Bitir</button>`
          : ''}
        <button class="secondary" style="font-size:0.78rem;padding:0.25rem 0.6rem;color:#f87171" onclick="deleteEvent(${ev.id})">Sil</button>
      </div>
    </div>

    <div class="team-scoreboard">
      <span class="tname" title="${esc(ev.team1_name)}">${esc(ev.team1_name)}</span>
      <span class="tscore">${fmt(ev.team1_score)}</span>
      <span class="tsep">—</span>
      <span class="tscore">${fmt(ev.team2_score)}</span>
      <span class="tname" title="${esc(ev.team2_name)}">${esc(ev.team2_name)}</span>
    </div>

    <div style="margin-top:1rem">${phasesHtml}</div>
  </div>`;
}

// ── Aşama render ─────────────────────────────────────────────────────────────
function renderPhase(ev, ph) {
  const label   = PHASE_LABELS[ph.phase_type] || ph.phase_type;
  const enabled = !!ph.enabled;
  const modeOpts = Object.entries(MODE_LABELS).map(([v, l]) =>
    `<option value="${v}" ${ph.game_mode === v ? 'selected' : ''}>${l}</option>`).join('');

  const settingsBar = `
    <div class="phase-settings">
      <label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="togglePhase(${ph.id},this.checked)" />
        Etkin
      </label>
      <span style="color:var(--text-dim)">|</span>
      <label>Oyun: <select style="display:inline-block" onchange="updatePhaseField(${ph.id},'game_mode',this.value)">
        ${modeOpts}
      </select></label>
      <label>Leg: <input type="number" min="1" max="11" value="${ph.legs_to_win}" style="width:3.5rem;display:inline-block"
        onchange="updatePhaseField(${ph.id},'legs_to_win',+this.value)" /></label>
      <label>Puan: <input type="number" min="0" step="0.5" value="${ph.point_value}" style="width:3.5rem;display:inline-block"
        onchange="updatePhaseField(${ph.id},'point_value',+this.value)" /></label>
    </div>`;

  const header = `
    <div class="phase-title">
      <span>${label}</span>
      <span class="phase-badge ${enabled ? '' : 'disabled'}">${enabled ? 'Etkin' : 'Devre Dışı'}</span>
    </div>
    ${settingsBar}`;

  const phaseBody = ph.phase_type === 'beer'
    ? renderBeerBody(ev, ph)
    : renderMatchesBody(ev, ph);

  return `<div class="card phase-card" style="background:var(--bg-2,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.07))">
    ${header}
    ${phaseBody}
  </div>`;
}

// ── Tekli / Eşli maç listeleri ───────────────────────────────────────────────
function renderMatchesBody(ev, ph) {
  const matches    = ph.matches || [];
  const matchesHtml = matches.map(pm => renderPhaseMatch(ev, ph, pm)).join('');
  const isDoubles  = ph.phase_type === 'doubles';

  const addRow = isDoubles
    ? `<div class="tm-add-row" id="add-row-${ph.id}">
        <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1">
          <input list="player-pool-dl" id="p1a-${ph.id}" placeholder="${esc(ev.team1_name)} — Oyuncu 1" />
          <input list="player-pool-dl" id="p1b-${ph.id}" placeholder="${esc(ev.team1_name)} — Oyuncu 2" />
        </div>
        <span style="align-self:center;font-weight:700;color:var(--text-dim)">vs</span>
        <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1">
          <input list="player-pool-dl" id="p2a-${ph.id}" placeholder="${esc(ev.team2_name)} — Oyuncu 1" />
          <input list="player-pool-dl" id="p2b-${ph.id}" placeholder="${esc(ev.team2_name)} — Oyuncu 2" />
        </div>
        <button class="secondary" style="font-size:0.82rem;align-self:center" onclick="addDoublesMatch(${ph.id})">+ Ekle</button>
       </div>`
    : `<div class="tm-add-row" id="add-row-${ph.id}">
        <input list="player-pool-dl" id="p1-${ph.id}" placeholder="${esc(ev.team1_name)} — oyuncu" />
        <span style="color:var(--text-dim);font-weight:700">vs</span>
        <input list="player-pool-dl" id="p2-${ph.id}" placeholder="${esc(ev.team2_name)} — oyuncu" />
        <button class="secondary" style="font-size:0.82rem" onclick="addMatch(${ph.id})">+ Ekle</button>
       </div>`;

  return `${matchesHtml}${addRow}`;
}

function renderPhaseMatch(ev, ph, pm) {
  const p1w    = pm.winner_slot === 1;
  const p2w    = pm.winner_slot === 2;
  const p1cls  = pm.winner_slot ? (p1w ? 'winner' : 'loser') : '';
  const p2cls  = pm.winner_slot ? (p2w ? 'winner' : 'loser') : '';
  const legs   = pm.winner_slot ? `${pm.team1_legs}–${pm.team2_legs}` : '–';
  const wkoTxt = pm.walkover ? ' <em>(hükmen)</em>' : '';

  const actions = pm.status !== 'finished'
    ? `<button class="winner-btn" onclick="openScoreModal(${pm.id},${ph.id},${ev.id})">Sonuç gir</button>`
    : `<button class="edit-btn" onclick="openScoreModal(${pm.id},${ph.id},${ev.id})">Düzenle</button>
       <button class="edit-btn" style="color:#f87171" onclick="removeMatch(${pm.id})">✕</button>`;

  return `<div class="pm-row ${pm.walkover ? 'walkover' : ''}" id="pm-${pm.id}">
    <span class="pname ${p1cls}">${esc(pm.team1_player || '?')}${wkoTxt}</span>
    <span class="pleg">${legs}</span>
    <span class="pname ${p2cls}" style="text-align:right">${esc(pm.team2_player || '?')}</span>
    <span class="pm-actions">${actions}</span>
  </div>`;
}

// ── Bira Maçı ────────────────────────────────────────────────────────────────
function renderBeerBody(ev, ph) {
  let cfg = {};
  try { cfg = ph.game_config_json ? JSON.parse(ph.game_config_json) : {}; } catch {}
  const t1players = cfg.team1_players || [];
  const t2players = cfg.team2_players || [];

  const resultMatch = (ph.matches || [])[0];
  const resultHtml  = resultMatch
    ? renderPhaseMatch(ev, ph, resultMatch)
    : `<div class="pm-row" style="opacity:0.5;justify-content:center;">
         <span style="grid-column:1/-1;text-align:center;font-size:0.85rem;color:var(--text-dim)">
           Oyuncuları ekledikten sonra sonuç girilebilir —
           <button class="winner-btn" onclick="addBeerResultMatch(${ph.id})">Sonuç gir</button>
         </span>
       </div>`;

  const playerList = (arr, team, label) => `
    <div style="flex:1;min-width:140px">
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.3rem;font-weight:600">${label}</div>
      ${arr.map((name, i) =>
        `<div style="display:flex;align-items:center;gap:0.3rem;margin-bottom:0.2rem;font-size:0.88rem">
           <span style="flex:1">${esc(name)}</span>
           <button class="edit-btn" style="font-size:0.7rem;padding:0.1rem 0.35rem;color:#f87171"
             onclick="removeBeerPlayer(${ph.id},${team},${i})">✕</button>
         </div>`).join('')}
      <div style="display:flex;gap:0.3rem;margin-top:0.4rem">
        <input list="player-pool-dl" id="beer-p${team}-${ph.id}" placeholder="Oyuncu ekle…" style="flex:1;padding:0.25rem 0.4rem;font-size:0.82rem" />
        <button class="secondary" style="font-size:0.78rem;padding:0.25rem 0.5rem" onclick="addBeerPlayer(${ph.id},${team})">+</button>
      </div>
    </div>`;

  return `
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-bottom:0.75rem">
      ${playerList(t1players, 1, esc(ev.team1_name))}
      ${playerList(t2players, 2, esc(ev.team2_name))}
    </div>
    <div style="border-top:1px solid var(--border,rgba(255,255,255,0.07));padding-top:0.5rem;margin-top:0.25rem">
      <div style="font-size:0.8rem;color:var(--text-dim);margin-bottom:0.3rem">Sonuç</div>
      ${resultHtml}
    </div>`;
}

// ── Aksiyonlar ───────────────────────────────────────────────────────────────
async function submitNewEvent() {
  const name = document.getElementById('ne-name').value.trim();
  const t1   = document.getElementById('ne-t1').value.trim();
  const t2   = document.getElementById('ne-t2').value.trim();
  if (!name || !t1 || !t2) { alert('Lütfen maç adı ve her iki takım adını gir.'); return; }

  const res = await fetch('/api/team-events', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, team1_name: t1, team2_name: t2 }),
  });
  if (!res.ok) { alert('Oluşturulamadı.'); return; }
  ['ne-name','ne-t1','ne-t2'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.querySelector('[data-tab="events"]').click();
}

async function deleteEvent(id) {
  if (!confirm('Bu takım maçını silmek istediğine emin misin?')) return;
  await fetch(`/api/team-events/${id}`, { method: 'DELETE', credentials: 'same-origin' });
}

async function finishEvent(id) {
  if (!confirm('Maçı tamamlandı olarak işaretle?')) return;
  await fetch(`/api/team-events/${id}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'finished' }),
  });
}

async function togglePhase(phaseId, enabled) {
  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
  });
}

async function updatePhaseField(phaseId, field, value) {
  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
}

// Tekli maç ekle
async function addMatch(phaseId) {
  const p1 = document.getElementById(`p1-${phaseId}`)?.value.trim();
  const p2 = document.getElementById(`p2-${phaseId}`)?.value.trim();
  const res = await fetch(`/api/team-phases/${phaseId}/matches`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_player: p1 || 'Rakip Yok', team2_player: p2 || 'Rakip Yok' }),
  });
  if (!res.ok) { alert('Eklenemedi.'); return; }
  [`p1-${phaseId}`, `p2-${phaseId}`].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
}

// Eşli maç ekle
async function addDoublesMatch(phaseId) {
  const p1a = document.getElementById(`p1a-${phaseId}`)?.value.trim();
  const p1b = document.getElementById(`p1b-${phaseId}`)?.value.trim();
  const p2a = document.getElementById(`p2a-${phaseId}`)?.value.trim();
  const p2b = document.getElementById(`p2b-${phaseId}`)?.value.trim();
  const t1 = [p1a, p1b].filter(Boolean).join(' / ') || 'Rakip Yok';
  const t2 = [p2a, p2b].filter(Boolean).join(' / ') || 'Rakip Yok';
  const res = await fetch(`/api/team-phases/${phaseId}/matches`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_player: t1, team2_player: t2 }),
  });
  if (!res.ok) { alert('Eklenemedi.'); return; }
  [`p1a-${phaseId}`,`p1b-${phaseId}`,`p2a-${phaseId}`,`p2b-${phaseId}`].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
}

async function removeMatch(pmId) {
  if (!confirm('Bu maçı silmek istediğine emin misin?')) return;
  await fetch(`/api/team-phase-matches/${pmId}`, { method: 'DELETE', credentials: 'same-origin' });
}

// ── Bira maçı oyuncu yönetimi ────────────────────────────────────────────────
function getBeerCfg(phaseId) {
  for (const ev of events) {
    const ph = (ev.phases || []).find(p => p.id === phaseId);
    if (ph) {
      try { return JSON.parse(ph.game_config_json || '{}'); } catch { return {}; }
    }
  }
  return {};
}

async function addBeerPlayer(phaseId, team) {
  const el = document.getElementById(`beer-p${team}-${phaseId}`);
  const name = el?.value.trim();
  if (!name) return;

  const cfg = getBeerCfg(phaseId);
  const key = team === 1 ? 'team1_players' : 'team2_players';
  cfg[key] = [...(cfg[key] || []), name];

  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_config_json: JSON.stringify(cfg) }),
  });
  if (el) el.value = '';
}

async function removeBeerPlayer(phaseId, team, idx) {
  const cfg = getBeerCfg(phaseId);
  const key = team === 1 ? 'team1_players' : 'team2_players';
  cfg[key] = (cfg[key] || []).filter((_, i) => i !== idx);

  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game_config_json: JSON.stringify(cfg) }),
  });
}

// Bira maçı için sonuç satırı oluştur (ilk kez)
async function addBeerResultMatch(phaseId) {
  await fetch(`/api/team-phases/${phaseId}/matches`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_player: 'Bira Maçı', team2_player: 'Bira Maçı' }),
  });
}

// ── Sonuç giriş modalı ───────────────────────────────────────────────────────
function openScoreModal(pmId, phaseId, evId) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const ph = (ev.phases || []).find(p => p.id === phaseId);
  if (!ph) return;
  const pm = (ph.matches || []).find(m => m.id === pmId);
  if (!pm) return;

  const isBeer = ph.phase_type === 'beer';

  const overlay = document.createElement('div');
  overlay.className = 'tm-modal-overlay';
  overlay.innerHTML = `
    <div class="tm-modal">
      <h3>${isBeer ? '🍺 Bira Maçı Sonucu' : 'Sonuç Gir'}</h3>
      ${!isBeer ? `
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:end;margin-bottom:0.75rem">
        <div>
          <label>${esc(ev.team1_name)}</label>
          <input list="player-pool-dl" id="sm-p1name" class="tm-modal" value="${esc(pm.team1_player||'')}" placeholder="Oyuncu" />
        </div>
        <div style="padding-bottom:0.4rem;text-align:center;font-size:1.2rem;font-weight:700">–</div>
        <div>
          <label>${esc(ev.team2_name)}</label>
          <input list="player-pool-dl" id="sm-p2name" class="tm-modal" value="${esc(pm.team2_player||'')}" placeholder="Oyuncu" />
        </div>
      </div>` : ''}
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:end;margin-bottom:0.75rem">
        <div>
          <label>${esc(ev.team1_name)} — Leg</label>
          <input type="number" id="sm-t1legs" min="0" value="${pm.team1_legs||0}" style="margin-bottom:0" />
        </div>
        <div style="padding-bottom:0.4rem;text-align:center;font-size:1rem;color:var(--text-dim)">–</div>
        <div>
          <label>${esc(ev.team2_name)} — Leg</label>
          <input type="number" id="sm-t2legs" min="0" value="${pm.team2_legs||0}" style="margin-bottom:0" />
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;cursor:pointer;">
        <input type="checkbox" id="sm-wko" ${pm.walkover ? 'checked' : ''} />
        Hükmen galibiyet
      </label>
      <div class="row">
        <button class="primary" onclick="saveScore(${pmId},${evId},${isBeer})">Kaydet</button>
        <button class="secondary" onclick="clearScore(${pmId})">Sıfırla</button>
        <button class="secondary" onclick="this.closest('.tm-modal-overlay').remove()">İptal</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveScore(pmId, evId, isBeer) {
  const p1name = isBeer ? 'Bira Maçı' : (document.getElementById('sm-p1name')?.value.trim() || '?');
  const p2name = isBeer ? 'Bira Maçı' : (document.getElementById('sm-p2name')?.value.trim() || '?');
  const t1legs = +document.getElementById('sm-t1legs')?.value || 0;
  const t2legs = +document.getElementById('sm-t2legs')?.value || 0;
  const wko    = document.getElementById('sm-wko')?.checked ? 1 : 0;

  const winnerSlot = t1legs > t2legs ? 1 : t2legs > t1legs ? 2 : null;

  const res = await fetch(`/api/team-phase-matches/${pmId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_player: p1name, team2_player: p2name,
      team1_legs: t1legs, team2_legs: t2legs, walkover: wko, winner_slot: winnerSlot }),
  });
  if (!res.ok) { alert('Kaydedilemedi.'); return; }
  document.querySelector('.tm-modal-overlay')?.remove();
}

async function clearScore(pmId) {
  await fetch(`/api/team-phase-matches/${pmId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner_slot: null, team1_legs: 0, team2_legs: 0, walkover: 0, status: 'pending' }),
  });
  document.querySelector('.tm-modal-overlay')?.remove();
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function fmt(n) { return Number.isInteger(n) ? n : Number(n).toFixed(1).replace('.0',''); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadPlayers();
loadEvents();
