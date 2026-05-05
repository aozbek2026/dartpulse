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
  renderParticipantsList();
});
socket.on('team:deleted', ({ id }) => {
  events = events.filter(e => e.id !== id);
  renderEventsList();
  renderParticipantsList();
});

// ── Katılımcı yönetimi ───────────────────────────────────────────────────────
function getTeamRoster(ev) {
  try { return ev.teams_json ? JSON.parse(ev.teams_json) : { team1: [], team2: [] }; } catch { return { team1: [], team2: [] }; }
}

async function saveTeamRoster(evId, roster) {
  await fetch(`/api/team-events/${evId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teams_json: JSON.stringify(roster) }),
  });
}

function renderParticipantsList() {
  const el = document.getElementById('participants-list');
  if (!el) return;
  if (!events.length) {
    el.innerHTML = '<p style="color:var(--text-dim)">Önce "Yeni Maç" sekmesinden bir takım maçı oluştur.</p>';
    return;
  }
  el.innerHTML = events.map(ev => renderParticipantsCard(ev)).join('');
}

function renderParticipantsCard(ev) {
  const roster = getTeamRoster(ev);
  const t1 = roster.team1 || [];
  const t2 = roster.team2 || [];

  const teamCol = (players, teamNum, teamName) => `
    <div style="flex:1;min-width:180px">
      <div style="font-weight:700;font-size:0.95rem;margin-bottom:0.5rem;color:var(--accent)">${esc(teamName)}</div>
      ${players.map((p, i) => `
        <div style="display:flex;align-items:center;gap:0.4rem;padding:0.3rem 0;border-bottom:1px solid var(--border,rgba(255,255,255,0.05))">
          <span style="flex:1;font-size:0.88rem">${i + 1}. ${esc(p)}</span>
          <button class="edit-btn" style="font-size:0.72rem;color:#f87171;padding:0.1rem 0.35rem"
            onclick="removeTeamPlayer(${ev.id},${teamNum},${i})">✕</button>
        </div>`).join('')}
      ${players.length === 0 ? '<p style="color:var(--text-dim);font-size:0.82rem;margin:0.3rem 0">Henüz oyuncu yok.</p>' : ''}
      <div style="display:flex;gap:0.35rem;margin-top:0.5rem">
        <input list="player-pool-dl" id="tp-${ev.id}-${teamNum}" placeholder="Oyuncu adı…"
          style="flex:1;padding:0.3rem 0.5rem;font-size:0.85rem"
          onkeydown="if(event.key==='Enter')addTeamPlayer(${ev.id},${teamNum})" />
        <button class="secondary" style="font-size:0.82rem;padding:0.3rem 0.6rem"
          onclick="addTeamPlayer(${ev.id},${teamNum})">+ Ekle</button>
      </div>
    </div>`;

  return `<div class="card" style="margin-bottom:0.75rem">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.75rem">
      <strong>${esc(ev.name)}</strong>
      <span style="font-size:0.8rem;color:var(--text-dim)">${t1.length + t2.length} oyuncu</span>
    </div>
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
      ${teamCol(t1, 1, ev.team1_name)}
      ${teamCol(t2, 2, ev.team2_name)}
    </div>
  </div>`;
}

async function addTeamPlayer(evId, teamNum) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const input = document.getElementById(`tp-${evId}-${teamNum}`);
  const name = input?.value.trim();
  if (!name) return;
  const roster = getTeamRoster(ev);
  const key = teamNum === 1 ? 'team1' : 'team2';
  roster[key] = [...(roster[key] || []), name];
  await saveTeamRoster(evId, roster);
  if (input) input.value = '';
}

async function removeTeamPlayer(evId, teamNum, idx) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const roster = getTeamRoster(ev);
  const key = teamNum === 1 ? 'team1' : 'team2';
  roster[key] = (roster[key] || []).filter((_, i) => i !== idx);
  await saveTeamRoster(evId, roster);
}

// Takım oyuncularından <select> seçenekleri üret
function teamPlayerOpts(players, placeholder) {
  const opts = [`<option value="">${placeholder}</option>`];
  players.forEach(p => opts.push(`<option value="${esc(p)}">${esc(p)}</option>`));
  opts.push(`<option value="Rakip Yok">— Rakip Yok —</option>`);
  return opts.join('');
}

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
    ${renderBracket(ev)}
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
  const matches     = ph.matches || [];
  const matchesHtml = matches.map(pm => renderPhaseMatch(ev, ph, pm)).join('');
  const isDoubles   = ph.phase_type === 'doubles';
  const roster      = getTeamRoster(ev);
  const t1          = roster.team1 || [];
  const t2          = roster.team2 || [];

  // Oyuncu listesi varsa select, yoksa free text
  const p1input = t1.length
    ? `<select id="p1-${ph.id}" style="flex:1"><option value="">— ${esc(ev.team1_name)} —</option>${t1.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}<option value="Rakip Yok">Rakip Yok</option></select>`
    : `<input list="player-pool-dl" id="p1-${ph.id}" placeholder="${esc(ev.team1_name)} — oyuncu" style="flex:1" />`;
  const p2input = t2.length
    ? `<select id="p2-${ph.id}" style="flex:1"><option value="">— ${esc(ev.team2_name)} —</option>${t2.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('')}<option value="Rakip Yok">Rakip Yok</option></select>`
    : `<input list="player-pool-dl" id="p2-${ph.id}" placeholder="${esc(ev.team2_name)} — oyuncu" style="flex:1" />`;

  const p1a = t1.length
    ? `<select id="p1a-${ph.id}"><option value="">— ${esc(ev.team1_name)} Oyuncu 1 —</option>${t1.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>`
    : `<input list="player-pool-dl" id="p1a-${ph.id}" placeholder="${esc(ev.team1_name)} — Oyuncu 1" />`;
  const p1b = t1.length
    ? `<select id="p1b-${ph.id}"><option value="">— ${esc(ev.team1_name)} Oyuncu 2 —</option>${t1.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>`
    : `<input list="player-pool-dl" id="p1b-${ph.id}" placeholder="${esc(ev.team1_name)} — Oyuncu 2" />`;
  const p2a = t2.length
    ? `<select id="p2a-${ph.id}"><option value="">— ${esc(ev.team2_name)} Oyuncu 1 —</option>${t2.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>`
    : `<input list="player-pool-dl" id="p2a-${ph.id}" placeholder="${esc(ev.team2_name)} — Oyuncu 1" />`;
  const p2b = t2.length
    ? `<select id="p2b-${ph.id}"><option value="">— ${esc(ev.team2_name)} Oyuncu 2 —</option>${t2.map(p=>`<option value="${esc(p)}">${esc(p)}</option>`).join('')}</select>`
    : `<input list="player-pool-dl" id="p2b-${ph.id}" placeholder="${esc(ev.team2_name)} — Oyuncu 2" />`;

  const addRow = isDoubles
    ? `<div class="tm-add-row" id="add-row-${ph.id}">
        <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1">${p1a}${p1b}</div>
        <span style="align-self:center;font-weight:700;color:var(--text-dim)">vs</span>
        <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1">${p2a}${p2b}</div>
        <button class="secondary" style="font-size:0.82rem;align-self:center" onclick="addDoublesMatch(${ph.id})">+ Ekle</button>
       </div>`
    : `<div class="tm-add-row" id="add-row-${ph.id}">
        ${p1input}
        <span style="color:var(--text-dim);font-weight:700;align-self:center">vs</span>
        ${p2input}
        <button class="secondary" style="font-size:0.82rem;align-self:center" onclick="addMatch(${ph.id})">+ Ekle</button>
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
  // Oyuncu listesi artık event roster'ından geliyor
  const roster    = getTeamRoster(ev);
  const t1players = roster.team1 || [];
  const t2players = roster.team2 || [];

  const resultMatch = (ph.matches || [])[0];
  const resultHtml  = resultMatch
    ? renderPhaseMatch(ev, ph, resultMatch)
    : `<div style="text-align:center;padding:0.5rem 0;font-size:0.85rem;color:var(--text-dim)">
         <button class="winner-btn" onclick="addBeerResultMatch(${ph.id})">Sonuç gir</button>
       </div>`;

  const playerCol = (players, label) => `
    <div style="flex:1;min-width:140px">
      <div style="font-size:0.8rem;color:var(--text-dim);font-weight:600;margin-bottom:0.3rem">${label}</div>
      ${players.length
        ? players.map((p, i) => `<div style="padding:0.2rem 0;font-size:0.88rem;border-bottom:1px solid var(--border,rgba(255,255,255,0.05))">${i+1}. ${esc(p)}</div>`).join('')
        : `<p style="color:var(--text-dim);font-size:0.82rem;margin:0">"Katılımcılar" sekmesinden ekle.</p>`}
    </div>`;

  return `
    <div style="display:flex;gap:1.5rem;flex-wrap:wrap;margin-bottom:0.75rem">
      ${playerCol(t1players, esc(ev.team1_name))}
      ${playerCol(t2players, esc(ev.team2_name))}
    </div>
    <div style="border-top:1px solid var(--border,rgba(255,255,255,0.07));padding-top:0.5rem">
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

// ── Bracket ──────────────────────────────────────────────────────────────────
function getBracket(ev) {
  try { return ev.bracket_json ? JSON.parse(ev.bracket_json) : null; } catch { return null; }
}

function renderBracket(ev) {
  const b = getBracket(ev);
  if (!b?.enabled) {
    return `<div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border,rgba(255,255,255,0.07))">
      <button class="secondary" style="font-size:0.82rem" onclick="toggleBracket(${ev.id})">🏆 Playoff Bracket Ekle</button>
    </div>`;
  }
  const rounds = b.rounds || [];
  const roundsHtml = rounds.length
    ? `<div class="bracket-rounds">${rounds.map((r, ri) => renderBracketRound(ev, b, r, ri)).join('')}</div>`
    : `<p style="color:var(--text-dim);font-size:0.85rem;margin:0.5rem 0">
         Katılımcıları ekle ve bracket oluştur.
       </p>`;

  return `<div style="margin-top:0.75rem;padding-top:0.75rem;border-top:1px solid var(--border,rgba(255,255,255,0.07))">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;flex-wrap:wrap;gap:0.4rem">
      <strong>🏆 Playoff Bracket</strong>
      <div style="display:flex;gap:0.35rem">
        <button class="secondary" style="font-size:0.78rem;padding:0.25rem 0.5rem" onclick="openBracketEditor(${ev.id})">Düzenle</button>
        <button class="secondary" style="font-size:0.78rem;padding:0.25rem 0.5rem;color:#f87171" onclick="toggleBracket(${ev.id})">Kaldır</button>
      </div>
    </div>
    ${roundsHtml}
  </div>`;
}

function renderBracketRound(ev, b, round, ri) {
  const NAMES = { 1: 'FİNAL', 2: 'YARI FİNAL', 4: 'ÇEYREK FİNAL', 8: 'SON 16' };
  const matchCount = round.matches?.length || 0;
  const name = round.name || NAMES[matchCount] || `Tur ${ri + 1}`;

  const matchesHtml = (round.matches || []).map((m, mi) => {
    const t1 = m.team1 || '—';
    const t2 = m.team2 || '—';
    const t1cls = m.winner_slot === 1 ? 'br-winner' : m.winner_slot === 2 ? 'br-loser' : '';
    const t2cls = m.winner_slot === 2 ? 'br-winner' : m.winner_slot === 1 ? 'br-loser' : '';
    const canPick = m.team1 && m.team2;
    const onclick1 = canPick ? `onclick="setBracketWinner(${ev.id},${ri},${mi},1)"` : '';
    const onclick2 = canPick ? `onclick="setBracketWinner(${ev.id},${ri},${mi},2)"` : '';
    return `<div class="br-match">
      <div class="br-team ${t1cls}" ${onclick1} title="${canPick ? 'Tıkla → galip' : ''}">${esc(t1)}</div>
      <div class="br-sep"></div>
      <div class="br-team ${t2cls}" ${onclick2} title="${canPick ? 'Tıkla → galip' : ''}">${esc(t2)}</div>
    </div>`;
  }).join('');

  return `<div class="br-round">
    <div class="br-round-name">${name}</div>
    <div class="br-matches">${matchesHtml}</div>
  </div>`;
}

// Bracket enable/disable
async function toggleBracket(evId) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const b = getBracket(ev);
  if (b?.enabled) {
    if (!confirm('Bracket\'ı kaldırmak istediğine emin misin? Veriler silinir.')) return;
    await saveBracket(evId, { enabled: false, participants: [], rounds: [] });
  } else {
    await saveBracket(evId, { enabled: true, participants: [], rounds: [] });
    openBracketEditor(evId);
  }
}

async function saveBracket(evId, b) {
  const res = await fetch(`/api/team-events/${evId}`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ bracket_json: JSON.stringify(b) }),
  });
  if (!res.ok) alert('Bracket kaydedilemedi.');
}

// Bracket editor modal
function openBracketEditor(evId) {
  document.querySelector('#bracket-editor-overlay')?.remove();
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const b = getBracket(ev) || { enabled: true, participants: [], rounds: [] };
  const ps = b.participants || [];

  const overlay = document.createElement('div');
  overlay.className = 'tm-modal-overlay';
  overlay.id = 'bracket-editor-overlay';
  overlay.innerHTML = `
    <div class="tm-modal" style="max-width:440px">
      <h3>🏆 Playoff Bracket</h3>
      <label>Katılımcılar (${ps.length})</label>
      <div id="br-plist" style="margin-bottom:0.5rem">
        ${ps.map((p, i) => `
          <div style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.25rem">
            <span style="flex:1;font-size:0.88rem">${i + 1}. ${esc(p)}</span>
            <button class="edit-btn" style="font-size:0.72rem;color:#f87171" onclick="removeBrParticipant(${evId},${i})">✕</button>
          </div>`).join('')}
      </div>
      <div style="display:flex;gap:0.4rem;margin-bottom:1rem">
        <input list="player-pool-dl" id="br-new-p" placeholder="Takım / oyuncu adı…" style="flex:1" />
        <button class="secondary" onclick="addBrParticipant(${evId})">+ Ekle</button>
      </div>
      <p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.75rem">
        Galip seçimi için maç ekranında takım adına tıkla. Kazanan otomatik ilerler.
      </p>
      <div class="row">
        <button class="primary" onclick="generateBracket(${evId})">Bracket Oluştur / Sıfırla</button>
        <button class="secondary" onclick="this.closest('.tm-modal-overlay').remove()">Kapat</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('br-new-p')?.focus();
}

async function addBrParticipant(evId) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const input = document.getElementById('br-new-p');
  const name = input?.value.trim();
  if (!name) return;
  const b = getBracket(ev) || { enabled: true, participants: [], rounds: [] };
  b.participants = [...(b.participants || []), name];
  b.rounds = []; // bracket'ı sıfırla
  await saveBracket(evId, b);
  if (input) input.value = '';
  openBracketEditor(evId); // editörü yenile
}

async function removeBrParticipant(evId, idx) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const b = getBracket(ev);
  if (!b) return;
  b.participants = (b.participants || []).filter((_, i) => i !== idx);
  b.rounds = [];
  await saveBracket(evId, b);
  openBracketEditor(evId);
}

async function generateBracket(evId) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const b = getBracket(ev) || { enabled: true, participants: [] };
  const ps = b.participants || [];
  if (ps.length < 2) { alert('En az 2 katılımcı gerekli.'); return; }

  // 2'nin üssüne yuvarla
  let n = 1;
  while (n < ps.length) n *= 2;
  const padded = [...ps];
  while (padded.length < n) padded.push(null); // bye

  const NAMES = { 1: 'Final', 2: 'Yarı Final', 4: 'Çeyrek Final', 8: 'Son 16', 16: 'Son 32' };
  const rounds = [];
  let size = n;
  let first = true;

  while (size >= 2) {
    const count = size / 2;
    const matches = [];
    if (first) {
      for (let i = 0; i < count; i++) {
        const t1 = padded[i] || null;
        const t2 = padded[n - 1 - i] || null;
        const winner_slot = (!t1 && t2) ? 2 : (!t2 && t1) ? 1 : null; // bye → otomatik geç
        matches.push({ team1: t1, team2: t2, winner_slot });
      }
      first = false;
    } else {
      for (let i = 0; i < count; i++) matches.push({ team1: null, team2: null, winner_slot: null });
    }
    rounds.push({ name: NAMES[count] || `${count * 2} Takım`, matches });
    size = count;
  }

  // Bye'ları ileri taşı
  autoAdvanceByes(rounds);

  b.rounds = rounds;
  await saveBracket(evId, b);
  document.querySelector('#bracket-editor-overlay')?.remove();
}

function autoAdvanceByes(rounds) {
  for (let ri = 0; ri < rounds.length - 1; ri++) {
    rounds[ri].matches.forEach((m, mi) => {
      if (m.winner_slot) {
        const winner = m.winner_slot === 1 ? m.team1 : m.team2;
        const nextMi = Math.floor(mi / 2);
        const nextSlot = mi % 2 === 0 ? 'team1' : 'team2';
        if (rounds[ri + 1]?.matches[nextMi]) {
          rounds[ri + 1].matches[nextMi][nextSlot] = winner;
        }
      }
    });
  }
}

async function setBracketWinner(evId, roundIdx, matchIdx, slot) {
  const ev = events.find(e => e.id === evId);
  if (!ev) return;
  const b = getBracket(ev);
  if (!b) return;

  const match = b.rounds[roundIdx]?.matches[matchIdx];
  if (!match) return;

  // Tıklama toggle: aynı galip tekrar seçilirse sıfırla
  const toggle = match.winner_slot === slot ? null : slot;
  match.winner_slot = toggle;

  // Bir sonraki tura ileri taşı
  const nextRound = b.rounds[roundIdx + 1];
  if (nextRound) {
    const nextMi   = Math.floor(matchIdx / 2);
    const nextSlot = matchIdx % 2 === 0 ? 'team1' : 'team2';
    const nm = nextRound.matches[nextMi];
    if (nm) {
      nm[nextSlot] = toggle ? (slot === 1 ? match.team1 : match.team2) : null;
      nm.winner_slot = null; // ileri turun sonucunu sıfırla
      // Sonraki-sonraki turdaki etkiyi de sıfırla
      const nn = b.rounds[roundIdx + 2];
      if (nn) {
        const nnMi   = Math.floor(nextMi / 2);
        const nnSlot = nextMi % 2 === 0 ? 'team1' : 'team2';
        if (nn.matches[nnMi]) { nn.matches[nnMi][nnSlot] = null; nn.matches[nnMi].winner_slot = null; }
      }
    }
  }

  await saveBracket(evId, b);
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────
function fmt(n) { return Number.isInteger(n) ? n : Number(n).toFixed(1).replace('.0',''); }
function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Init ─────────────────────────────────────────────────────────────────────
async function init() {
  await Promise.all([loadPlayers(), loadEvents()]);
  renderParticipantsList();
}
init();
