// TV / Kiosk modu — bölümler arası otomatik geçiş, ekran uyutma engeli,
// Socket.IO push ile gerçek zamanlı güncelleme.

const socket = io();
let state = { players: [], boards: [], tournaments: [], activeMatches: [] };

// ========== Auto-rotate ayarı ==========
const ROTATE_MS = 15000;
const SECTIONS = [
  { id: 'tv-live',      label: 'Canlı Maçlar',     show: () => true /* canlı yoksa bile boş ekran göster */ },
  { id: 'tv-standings', label: 'Klasman',          show: () => state.tournaments.some(t => t.status !== 'draft') },
  { id: 'tv-bracket',   label: 'Bracket',          show: () => state.tournaments.some(t => t.status !== 'draft' && t.matches.length > 0) },
  { id: 'tv-recent',    label: 'Son Bitenler',     show: () => state.tournaments.some(t => t.matches.some(m => m.status === 'finished')) },
];
let activeIdx = 0;
let rotateTimer = null;

function visibleSections() {
  return SECTIONS.map((s, i) => ({ ...s, idx: i })).filter(s => s.show());
}

function applyActive() {
  const visible = visibleSections();
  // Active idx geçerli değilse ilkine düş
  if (!visible.find(s => s.idx === activeIdx)) {
    activeIdx = visible.length ? visible[0].idx : 0;
  }
  SECTIONS.forEach((s, i) => {
    const el = document.getElementById(s.id);
    if (el) el.classList.toggle('active', i === activeIdx);
  });
  renderDots();
}

function renderDots() {
  const dots = document.getElementById('dots');
  if (!dots) return;
  const visible = visibleSections();
  dots.innerHTML = visible.map(s =>
    `<div class="dot ${s.idx === activeIdx ? 'active' : ''}" title="${s.label}"></div>`
  ).join('');
}

function nextSection() {
  const visible = visibleSections();
  if (visible.length <= 1) { applyActive(); return; }
  const curPos = visible.findIndex(s => s.idx === activeIdx);
  const nextPos = (curPos + 1) % visible.length;
  activeIdx = visible[nextPos].idx;
  applyActive();
}

function startRotate() {
  if (rotateTimer) clearInterval(rotateTimer);
  rotateTimer = setInterval(nextSection, ROTATE_MS);
}

// ========== Socket.IO ==========
socket.on('state', (s) => {
  state = s;
  renderAll();
  applyActive();
});

socket.on('connect', () => {
  setBanner(false);
  setConnText('CANLI', false);
});
socket.on('disconnect', () => {
  setBanner(true);
  setConnText('OFFLINE', true);
});
socket.on('connect_error', () => {
  setBanner(true);
  setConnText('OFFLINE', true);
});

function setBanner(show) {
  const b = document.getElementById('banner');
  if (b) b.classList.toggle('show', !!show);
}
function setConnText(text, disc) {
  const t = document.getElementById('conn-text');
  const meta = document.getElementById('meta');
  if (t) t.textContent = text;
  if (meta) meta.classList.toggle('disconnected', !!disc);
}

// ========== Wake Lock — TV ekranı uyusun istemiyoruz ==========
let wakeLock = null;
async function requestWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch (e) {
    // Bazı tarayıcılarda kullanıcı etkileşimi gerekir; sessizce yut
    console.warn('Wake Lock alınamadı:', e.message);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') requestWakeLock();
});
requestWakeLock();

// ========== Saat ==========
function tickClock() {
  const el = document.getElementById('clock');
  if (!el) return;
  const d = new Date();
  el.textContent = d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(tickClock, 1000); tickClock();

// ========== Klasman hesaplaması (viewer ile aynı mantık) ==========
function buildStandings(t) {
  const reportByEntry = {};
  for (const r of (t.report || [])) reportByEntry[r.entry_id] = r;
  const stats = {};
  for (const e of t.entries) {
    stats[e.id] = {
      entry: e, matches_played: 0, matches_won: 0,
      legs_for: 0, legs_against: 0,
    };
  }
  for (const m of t.matches) {
    if (m.status !== 'finished') continue;
    if (!m.entry1_id || !m.entry2_id) continue;
    const a = stats[m.entry1_id], b = stats[m.entry2_id];
    if (a) {
      a.matches_played++;
      a.legs_for += m.p1_legs || 0; a.legs_against += m.p2_legs || 0;
      if (m.winner_entry_id === m.entry1_id) a.matches_won++;
    }
    if (b) {
      b.matches_played++;
      b.legs_for += m.p2_legs || 0; b.legs_against += m.p1_legs || 0;
      if (m.winner_entry_id === m.entry2_id) b.matches_won++;
    }
  }
  const rows = Object.values(stats).map(s => {
    const r = reportByEntry[s.entry.id] || {};
    return {
      ...s,
      leg_diff: s.legs_for - s.legs_against,
      average_3dart: r.average_3dart || 0,
      one_eighty: r.one_eighty || 0,
      best_checkout: r.best_checkout || 0,
    };
  });
  rows.sort((a, b) =>
    b.matches_won - a.matches_won ||
    b.leg_diff - a.leg_diff ||
    b.average_3dart - a.average_3dart);
  return rows;
}

function activeTournament() {
  // Önce devam eden, yoksa son bitmiş
  const tourns = state.tournaments.filter(t => t.status !== 'draft');
  return tourns.find(t => t.status === 'active') || tourns[0] || null;
}

// ========== Render: Header ==========
function renderHeader() {
  const t = activeTournament();
  const el = document.getElementById('tournament-name');
  if (!el) return;
  el.textContent = t ? `· ${t.name}` : '';
}

// ========== Render: Canlı ==========
function renderLive() {
  const host = document.getElementById('tv-live');
  const active = state.activeMatches || [];
  const liveOnly = active.filter(m => m.status === 'live' || m.status === 'ready');

  if (!liveOnly.length) {
    host.innerHTML = `
      <h2>🔴 Canlı Maçlar</h2>
      <div class="tv-empty">
        <div class="icon">🎯</div>
        <div>Şu an oynanan maç yok</div>
        <div style="font-size: 1.05rem; margin-top: 0.4rem;">Bir sonraki maç hazırlanıyor…</div>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <h2>🔴 Canlı Maçlar <span class="sub">${liveOnly.length} maç</span></h2>
    <div class="tv-live-grid">
      ${liveOnly.map(m => {
        const board = state.boards.find(b => b.current_match_id === m.id);
        const setLeg = m.p1_sets > 0 || m.p2_sets > 0
          ? `${m.p1_sets}-${m.p2_sets} (Leg ${m.p1_legs}-${m.p2_legs})`
          : `Leg ${m.p1_legs}-${m.p2_legs}`;
        const isLive = m.status === 'live';
        const turn1 = isLive && m.current_turn === 1;
        const turn2 = isLive && m.current_turn === 2;
        return `
          <div class="tv-live-card ${isLive ? 'live' : ''}">
            <div class="meta">
              <span>${board ? board.name : 'Board atanmamış'}</span>
              <span>${isLive ? '🔴 CANLI' : '⏳ HAZIR'}</span>
            </div>
            <div class="player-row ${turn1 ? 'active-turn' : ''}">
              <span class="player-name">${turn1 ? '▶ ' : ''}${entryLabel(m.entry1)}</span>
              <span class="player-score">${isLive ? (m.p1_leg_score ?? '—') : '—'}</span>
            </div>
            <div class="player-row ${turn2 ? 'active-turn' : ''}">
              <span class="player-name">${turn2 ? '▶ ' : ''}${entryLabel(m.entry2)}</span>
              <span class="player-score">${isLive ? (m.p2_leg_score ?? '—') : '—'}</span>
            </div>
            <div class="footer">
              <span>${setLeg}</span>
              <span>${m.scorer ? '✍ ' + entryLabel(m.scorer) : ''}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ========== Render: Klasman ==========
function renderStandings() {
  const host = document.getElementById('tv-standings');
  const t = activeTournament();
  if (!t) {
    host.innerHTML = `<h2>📊 Klasman</h2><div class="tv-empty"><div class="icon">📊</div><div>Henüz turnuva yok</div></div>`;
    return;
  }
  const rows = buildStandings(t);
  // İlk 10
  const top = rows.slice(0, 10);
  host.innerHTML = `
    <h2>📊 Klasman <span class="sub">${t.name}</span></h2>
    <table class="tv-standings-table">
      <thead>
        <tr>
          <th>#</th><th>Oyuncu</th>
          <th class="num">O</th><th class="num">G</th><th class="num">M</th>
          <th class="num">Leg</th><th class="num">±</th>
          <th class="num">3-Ok Ort.</th>
          <th class="num">180</th>
          <th class="num">En Yük. Çıkış</th>
        </tr>
      </thead>
      <tbody>
        ${top.length === 0
          ? `<tr><td colspan="10" style="text-align:center; padding: 2rem; color: var(--text-dim);">Henüz biten maç yok</td></tr>`
          : top.map((r, i) => {
              const rank = i + 1;
              const cls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
              return `
                <tr class="rank-${rank}">
                  <td><span class="tv-rank ${cls}">${rank}</span></td>
                  <td><strong>${entryLabel(r.entry)}</strong></td>
                  <td class="num">${r.matches_played}</td>
                  <td class="num">${r.matches_won}</td>
                  <td class="num">${r.matches_played - r.matches_won}</td>
                  <td class="num">${r.legs_for}-${r.legs_against}</td>
                  <td class="num">${r.leg_diff > 0 ? '+' : ''}${r.leg_diff}</td>
                  <td class="num"><strong>${r.average_3dart.toFixed(2)}</strong></td>
                  <td class="num">${r.one_eighty || 0}</td>
                  <td class="num">${r.best_checkout || '—'}</td>
                </tr>
              `;
            }).join('')}
      </tbody>
    </table>
  `;
}

// ========== Render: Bracket ==========
function renderBracket() {
  const host = document.getElementById('tv-bracket');
  const t = activeTournament();
  if (!t) {
    host.innerHTML = `<h2>🏆 Bracket</h2><div class="tv-empty"><div class="icon">🏆</div><div>Henüz turnuva yok</div></div>`;
    return;
  }
  // Yalnızca elim aşamalarını çiz; RR sadece sayım
  const elimMatches = t.matches.filter(m => {
    const stage = t.stages.find(s => s.id === m.stage_id);
    return stage && stage.format !== 'round_robin';
  });

  if (elimMatches.length === 0) {
    host.innerHTML = `<h2>🏆 Bracket</h2><div class="tv-empty"><div class="icon">🏆</div><div>Eleminasyon aşaması henüz yok</div></div>`;
    return;
  }

  // Round'a göre grupla
  const rounds = {};
  for (const m of elimMatches) {
    const key = `${m.bracket}-${m.round}`;
    (rounds[key] = rounds[key] || []).push(m);
  }
  // Her round içinde match_no veya id'ye göre stabil sıralama
  Object.values(rounds).forEach(arr =>
    arr.sort((a, b) => (a.match_no || 0) - (b.match_no || 0) || (a.id - b.id))
  );

  const keys = Object.keys(rounds).sort((a, b) => {
    const [ba, ra] = a.split('-'); const [bb, rb] = b.split('-');
    const order = { winners: 0, losers: 1, final: 2 };
    return (order[ba] || 99) - (order[bb] || 99) || +ra - +rb;
  });

  // Bir round'un kaç maçtan oluştuğuna göre etiket isimlendir (final, yarı final, çeyrek)
  const wcounts = keys
    .filter(k => k.startsWith('winners-') || k.startsWith('final-'))
    .map(k => rounds[k].length);
  const labelFor = (bracket, round, count) => {
    if (bracket === 'final') return 'Final';
    if (bracket === 'losers') return `LB R${round}`;
    if (count === 1) return 'Final';
    if (count === 2) return 'Yarı Final';
    if (count === 4) return 'Çeyrek Final';
    if (count === 8) return 'Son 16';
    if (count === 16) return 'Son 32';
    return `R${round}`;
  };

  const renderMatch = (m) => {
    const isLive = m.status === 'live';
    const isFinished = m.status === 'finished';
    const cls = isLive ? 'live' : (isFinished ? 'finished' : '');
    const w1 = m.winner_entry_id === m.entry1_id;
    const w2 = m.winner_entry_id === m.entry2_id;
    const showSets = (m.p1_sets > 0 || m.p2_sets > 0);
    const score1 = showSets
      ? `${m.p1_sets}<small>(${m.p1_legs})</small>`
      : `${m.p1_legs ?? ''}`;
    const score2 = showSets
      ? `${m.p2_sets}<small>(${m.p2_legs})</small>`
      : `${m.p2_legs ?? ''}`;
    return `
      <div class="match ${cls}">
        ${isLive ? '<span class="match-live-dot"></span>' : ''}
        <div class="slot ${w1 ? 'winner' : ''}">
          <span class="name">${m.entry1 ? entryLabel(m.entry1) : '<em>— TBD —</em>'}</span>
          <span class="score">${m.entry1_id ? score1 : ''}</span>
        </div>
        <div class="slot ${w2 ? 'winner' : ''}">
          <span class="name">${m.entry2 ? entryLabel(m.entry2) : '<em>— TBD —</em>'}</span>
          <span class="score">${m.entry2_id ? score2 : ''}</span>
        </div>
      </div>
    `;
  };

  host.innerHTML = `
    <h2>🏆 Bracket <span class="sub">${t.name}</span></h2>
    <div class="tv-bracket">
      ${keys.map((k, idx) => {
        const ms = rounds[k];
        const [bracket, round] = k.split('-');
        const isLastCol = (idx === keys.length - 1);
        const label = labelFor(bracket, round, ms.length);

        // Son kolon veya tek maçlı round → pair gruplaması yok
        let inner;
        if (isLastCol || ms.length <= 1) {
          inner = ms.map(renderMatch).join('');
        } else {
          // 2'şer 2'şer pair'le
          const pairs = [];
          for (let i = 0; i < ms.length; i += 2) pairs.push(ms.slice(i, i + 2));
          inner = pairs.map(pair => {
            const single = pair.length === 1 ? 'single' : '';
            return `<div class="pair ${single}">${pair.map(renderMatch).join('')}</div>`;
          }).join('');
        }

        return `
          <div class="col ${isLastCol ? 'last-col' : ''}">
            <h4>${label}</h4>
            <div class="matches">${inner}</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ========== Render: Son bitenler ==========
function renderRecent() {
  const host = document.getElementById('tv-recent');
  const finished = [];
  for (const t of state.tournaments) {
    for (const m of t.matches) {
      if (m.status === 'finished') finished.push({ ...m, _tournament: t.name });
    }
  }
  finished.sort((a, b) => {
    if (a.finished_at && b.finished_at) return b.finished_at.localeCompare(a.finished_at);
    return (b.id || 0) - (a.id || 0);
  });
  const recent = finished.slice(0, 8);

  if (recent.length === 0) {
    host.innerHTML = `<h2>✅ Son Bitenler</h2><div class="tv-empty"><div class="icon">✅</div><div>Henüz biten maç yok</div></div>`;
    return;
  }

  host.innerHTML = `
    <h2>✅ Son Bitenler <span class="sub">son ${recent.length} maç</span></h2>
    <div class="tv-recent-grid">
      ${recent.map(m => {
        const e1 = entryLabel(m.entry1);
        const e2 = entryLabel(m.entry2);
        const w1 = m.winner_entry_id === m.entry1_id;
        const score = m.p1_sets > 0 || m.p2_sets > 0
          ? `${m.p1_sets}-${m.p2_sets} (${m.p1_legs}-${m.p2_legs})`
          : `${m.p1_legs}-${m.p2_legs}`;
        return `
          <div class="tv-recent-card">
            <div>
              <div>
                <span class="${w1 ? 'winner' : ''}">${e1}</span>
                <span style="color: var(--text-dim); margin: 0 0.4rem;">vs</span>
                <span class="${!w1 ? 'winner' : ''}">${e2}</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.95rem; margin-top: 0.2rem;">${m._tournament}</div>
            </div>
            <span class="pill">${score}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderAll() {
  renderHeader();
  renderLive();
  renderStandings();
  renderBracket();
  renderRecent();
}

// ========== Klavye kısayolları ==========
document.addEventListener('keydown', (e) => {
  // Boşluk / sağ ok → sonraki
  if (e.key === ' ' || e.key === 'ArrowRight') {
    e.preventDefault();
    nextSection();
    startRotate(); // timer'ı sıfırla
  }
  // 1-4 doğrudan bölüm seç
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= SECTIONS.length) {
    activeIdx = n - 1;
    applyActive();
    startRotate();
  }
  // F → fullscreen
  if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }
});

// ========== Başlat ==========
applyActive();
startRotate();
