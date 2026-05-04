// team.js — Takım Maçı yönetim arayüzü

const socket = io();
let events = [];

const PHASE_LABELS = { singles: '① Tekli Maçlar', beer: '② Bira Maçı', doubles: '③ Eşli Maçlar' };
const MODE_LABELS = { '501': '501 DO', '701': '701 DO', '1001': '1001 DO', cricket: 'Cricket' };

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
async function loadEvents() {
  try {
    const res = await fetch('/api/team-events', { credentials: 'same-origin' });
    events = await res.json();
    renderEventsList();
  } catch (e) {
    document.getElementById('events-list').innerHTML =
      '<p style="color:var(--text-dim)">Yüklenemedi.</p>';
  }
}

socket.on('team:update', (ev) => {
  const idx = events.findIndex(e => e.id === ev.id);
  if (idx >= 0) events[idx] = ev; else events.unshift(ev);
  renderEventsList();
});
socket.on('team:deleted', ({ id }) => {
  events = events.filter(e => e.id !== id);
  renderEventsList();
});

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
  const phasesHtml = (ev.phases || []).map(ph => renderPhase(ev, ph)).join('');

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

function renderPhase(ev, ph) {
  const label = PHASE_LABELS[ph.phase_type] || ph.phase_type;
  const enabled = !!ph.enabled;
  const matches = ph.matches || [];
  const modeLabel = MODE_LABELS[ph.game_mode] || ph.game_mode;
  const legsLabel = `Bo${ph.legs_to_win * 2 - 1}`;

  const matchesHtml = matches.map(pm => renderPhaseMatch(ev, ph, pm)).join('');
  const addSection = ph.phase_type !== 'beer'
    ? `<div class="add-match-row" id="add-row-${ph.id}">
        <input id="p1-${ph.id}" placeholder="${esc(ev.team1_name)} — oyuncu adı" />
        <input id="p2-${ph.id}" placeholder="${esc(ev.team2_name)} — oyuncu adı" />
        <button class="secondary" style="font-size:0.82rem" onclick="addMatch(${ph.id}, ${ev.id})">+ Ekle</button>
       </div>`
    : `<p style="color:var(--text-dim);font-size:0.82rem;margin-top:0.35rem;">
         Bira maçı — tüm oyuncular sırayla atar. Sonuç aşağıya girilir.
       </p>`;

  return `<div class="card phase-card" style="background:var(--bg-2,rgba(255,255,255,0.04));border:1px solid var(--border,rgba(255,255,255,0.07))">
    <div class="phase-title">
      <span>${label}</span>
      <span class="phase-badge ${enabled ? '' : 'disabled'}">${enabled ? 'Etkin' : 'Devre Dışı'}</span>
    </div>
    <div class="phase-settings">
      <label style="display:flex;align-items:center;gap:0.3rem;cursor:pointer;">
        <input type="checkbox" ${enabled ? 'checked' : ''} onchange="togglePhase(${ph.id},this.checked,${ev.id})" />
        Etkin
      </label>
      <span style="color:var(--text-dim)">|</span>
      <label>Oyun: <select style="display:inline-block" onchange="updatePhaseField(${ph.id},'game_mode',this.value,${ev.id})">
        ${Object.entries(MODE_LABELS).map(([v,l]) =>
          `<option value="${v}" ${ph.game_mode === v ? 'selected' : ''}>${l}</option>`).join('')}
      </select></label>
      <label>Leg: <input type="number" min="1" max="11" value="${ph.legs_to_win}" style="width:3.5rem;display:inline-block"
        onchange="updatePhaseField(${ph.id},'legs_to_win',+this.value,${ev.id})" /></label>
      <label>Puan: <input type="number" min="0" step="0.5" value="${ph.point_value}" style="width:3.5rem;display:inline-block"
        onchange="updatePhaseField(${ph.id},'point_value',+this.value,${ev.id})" /></label>
    </div>
    ${matchesHtml}
    ${addSection}
  </div>`;
}

function renderPhaseMatch(ev, ph, pm) {
  const p1w = pm.winner_slot === 1;
  const p2w = pm.winner_slot === 2;
  const p1class = pm.winner_slot ? (p1w ? 'winner' : 'loser') : '';
  const p2class = pm.winner_slot ? (p2w ? 'winner' : 'loser') : '';
  const legs = pm.winner_slot ? `${pm.team1_legs}–${pm.team2_legs}` : '–';
  const wkoText = pm.walkover ? ' <em>(hükmen)</em>' : '';

  const p1name = esc(pm.team1_player || '?');
  const p2name = esc(pm.team2_player || '?');

  const actionsHtml = pm.status !== 'finished'
    ? `<button class="winner-btn" onclick="openScoreModal(${pm.id},${ph.id},${ev.id})">Sonuç gir</button>`
    : `<button class="edit-btn" onclick="openScoreModal(${pm.id},${ph.id},${ev.id})">Düzenle</button>
       <button class="edit-btn" style="color:#f87171" onclick="removeMatch(${pm.id})">✕</button>`;

  return `<div class="pm-row ${pm.walkover ? 'walkover' : ''}" id="pm-${pm.id}">
    <span class="pname ${p1class}">${p1name}${wkoText}</span>
    <span class="pleg">${legs}</span>
    <span class="pname ${p2class}" style="text-align:right">${p2name}</span>
    <span class="pm-actions">${actionsHtml}</span>
  </div>`;
}

function fmt(n) { return Number.isInteger(n) ? n : Number(n).toFixed(1).replace('.0',''); }
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Aksiyonlar ───────────────────────────────────────────────────────────────

async function createEvent() {
  const name = document.getElementById('ne-name').value.trim();
  const t1 = document.getElementById('ne-t1').value.trim();
  const t2 = document.getElementById('ne-t2').value.trim();
  if (!name || !t1 || !t2) { alert('Lütfen maç adı ve her iki takım adını gir.'); return; }

  const res = await fetch('/api/team-events', {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, team1_name: t1, team2_name: t2 }),
  });
  if (!res.ok) { alert('Oluşturulamadı.'); return; }

  document.getElementById('ne-name').value = '';
  document.getElementById('ne-t1').value = '';
  document.getElementById('ne-t2').value = '';

  // Aktif maçlar sekmesine geç
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

async function togglePhase(phaseId, enabled, evId) {
  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
  });
}

async function updatePhaseField(phaseId, field, value, evId) {
  await fetch(`/api/team-phases/${phaseId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value }),
  });
}

async function addMatch(phaseId, evId) {
  const p1 = document.getElementById(`p1-${phaseId}`)?.value.trim();
  const p2 = document.getElementById(`p2-${phaseId}`)?.value.trim();

  // İsim boşsa izin ver (hükmen için)
  const res = await fetch(`/api/team-phases/${phaseId}/matches`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ team1_player: p1 || 'Rakip Yok', team2_player: p2 || 'Rakip Yok' }),
  });
  if (!res.ok) { alert('Eklenemedi.'); return; }
  if (document.getElementById(`p1-${phaseId}`)) document.getElementById(`p1-${phaseId}`).value = '';
  if (document.getElementById(`p2-${phaseId}`)) document.getElementById(`p2-${phaseId}`).value = '';
}

async function removeMatch(pmId) {
  if (!confirm('Bu maçı silmek istediğine emin misin?')) return;
  await fetch(`/api/team-phase-matches/${pmId}`, { method: 'DELETE', credentials: 'same-origin' });
}

// ── Sonuç giriş modalı ───────────────────────────────────────────────────────
function openScoreModal(pmId, phaseId, evId) {
  // Mevcut veriden maç bul
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const ph = (ev.phases || []).find(p => p.id === phaseId);
  if (!ph) return;
  const pm = (ph.matches || []).find(m => m.id === pmId);
  if (!pm) return;

  const overlay = document.createElement('div');
  overlay.className = 'tm-modal-overlay';
  overlay.innerHTML = `
    <div class="tm-modal">
      <h3>Sonuç Gir</h3>
      <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:0.5rem;align-items:end;margin-bottom:0.75rem">
        <div>
          <label>${esc(ev.team1_name)}</label>
          <input id="sm-p1name" value="${esc(pm.team1_player||'')}" placeholder="Oyuncu" />
          <label style="margin-top:0.35rem">Leg</label>
          <input type="number" id="sm-t1legs" min="0" value="${pm.team1_legs||0}" style="margin-bottom:0" />
        </div>
        <div style="padding-bottom:0.4rem;text-align:center;font-size:1.2rem;font-weight:700;">–</div>
        <div>
          <label>${esc(ev.team2_name)}</label>
          <input id="sm-p2name" value="${esc(pm.team2_player||'')}" placeholder="Oyuncu" />
          <label style="margin-top:0.35rem">Leg</label>
          <input type="number" id="sm-t2legs" min="0" value="${pm.team2_legs||0}" style="margin-bottom:0" />
        </div>
      </div>
      <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem;cursor:pointer;">
        <input type="checkbox" id="sm-wko" ${pm.walkover ? 'checked' : ''} />
        Hükmen galibiyet
      </label>
      <div class="row">
        <button class="primary" onclick="saveScore(${pmId},${evId})">Kaydet</button>
        <button class="secondary" onclick="clearScore(${pmId},${evId})">Sonucu Sıfırla</button>
        <button class="secondary" onclick="this.closest('.tm-modal-overlay').remove()">İptal</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

async function saveScore(pmId, evId) {
  const p1name = document.getElementById('sm-p1name')?.value.trim();
  const p2name = document.getElementById('sm-p2name')?.value.trim();
  const t1legs = +document.getElementById('sm-t1legs')?.value || 0;
  const t2legs = +document.getElementById('sm-t2legs')?.value || 0;
  const wko = document.getElementById('sm-wko')?.checked ? 1 : 0;

  let winnerSlot = null;
  if (t1legs > t2legs) winnerSlot = 1;
  else if (t2legs > t1legs) winnerSlot = 2;
  // eşit → null (devam ediyor)

  const body = {
    team1_player: p1name, team2_player: p2name,
    team1_legs: t1legs, team2_legs: t2legs,
    walkover: wko, winner_slot: winnerSlot,
  };

  const res = await fetch(`/api/team-phase-matches/${pmId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) { alert('Kaydedilemedi.'); return; }
  document.querySelector('.tm-modal-overlay')?.remove();
}

async function clearScore(pmId, evId) {
  await fetch(`/api/team-phase-matches/${pmId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner_slot: null, team1_legs: 0, team2_legs: 0, walkover: 0, status: 'pending' }),
  });
  document.querySelector('.tm-modal-overlay')?.remove();
}

// ── Init ─────────────────────────────────────────────────────────────────────
loadEvents();
