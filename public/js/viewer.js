// İzleyici — tek sayfa, çok bölümlü canlı görünüm
const socket = io();
let state = { players: [], boards: [], tournaments: [], activeMatches: [] };
let matchFilter = 'all';

socket.on('state', (s) => {
  state = s;
  render();
});

function render() {
  renderLive();
  renderStandings();
  renderBracket();
  renderMatches();
  renderRecent();
}

// ========== Klasman hesaplaması ==========
// matches_won → (legs_won - legs_lost) → 3-ok ortalaması sırasıyla
function buildStandings(t) {
  const reportByEntry = {};
  for (const r of (t.report || [])) reportByEntry[r.entry_id] = r;

  // Maçlardan W-L ve leg farkı topla (canlı/bitmiş için)
  const stats = {};
  for (const e of t.entries) {
    stats[e.id] = {
      entry: e,
      matches_played: 0, matches_won: 0,
      legs_for: 0, legs_against: 0,
      sets_for: 0, sets_against: 0,
    };
  }
  for (const m of t.matches) {
    if (m.status !== 'finished') continue;
    if (!m.entry1_id || !m.entry2_id) continue;
    const a = stats[m.entry1_id], b = stats[m.entry2_id];
    if (a) {
      a.matches_played++;
      a.legs_for += m.p1_legs || 0; a.legs_against += m.p2_legs || 0;
      a.sets_for += m.p1_sets || 0; a.sets_against += m.p2_sets || 0;
      if (m.winner_entry_id === m.entry1_id) a.matches_won++;
    }
    if (b) {
      b.matches_played++;
      b.legs_for += m.p2_legs || 0; b.legs_against += m.p1_legs || 0;
      b.sets_for += m.p2_sets || 0; b.sets_against += m.p1_sets || 0;
      if (m.winner_entry_id === m.entry2_id) b.matches_won++;
    }
  }

  const rows = Object.values(stats).map(s => {
    const r = reportByEntry[s.entry.id] || {};
    return {
      ...s,
      leg_diff: s.legs_for - s.legs_against,
      average_3dart: r.average_3dart || 0,
      darts_per_leg: r.darts_per_leg || 0,
      tons: r.tons || 0,
      ton_plus: r.ton_plus || 0,
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

// ========== Render: Canlı ==========
function renderLive() {
  const host = document.getElementById('live-host');
  const active = state.activeMatches || [];
  if (!active.length) {
    host.innerHTML = `<div class="card empty">Şu an canlı maç yok</div>`;
    return;
  }
  host.innerHTML = `
    <div class="grid cols-2">
      ${active.map(m => {
        const board = state.boards.find(b => b.current_match_id === m.id);
        const setLeg = m.p1_sets > 0 || m.p2_sets > 0
          ? `${m.p1_sets}-${m.p2_sets} (${m.p1_legs}-${m.p2_legs})`
          : `${m.p1_legs}-${m.p2_legs}`;
        const scorerName = m.scorer ? entryLabel(m.scorer) : '—';
        const statusChip = m.status === 'ready'
          ? '<span class="chip" style="background: var(--warn, #f59e0b); color:#000;">BEKLİYOR</span>'
          : '<span class="chip live">CANLI</span>';
        return `
          <div class="card" style="padding: 1rem;">
            <div style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
              <span>${board ? board.name : 'Board yok'} · Leg ${m.current_leg}</span>
              <span>${statusChip}</span>
            </div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-weight: 600; ${m.current_turn === 1 && m.status === 'live' ? 'color: var(--accent);' : ''}">${entryLabel(m.entry1)}</div>
                <div style="font-weight: 600; ${m.current_turn === 2 && m.status === 'live' ? 'color: var(--accent);' : ''}">${entryLabel(m.entry2)}</div>
              </div>
              <div style="text-align: right;">
                <div style="font-variant-numeric: tabular-nums; font-size: 1.2rem; font-weight: 700;">${m.p1_leg_score ?? '-'}</div>
                <div style="font-variant-numeric: tabular-nums; font-size: 1.2rem; font-weight: 700;">${m.p2_leg_score ?? '-'}</div>
              </div>
              <div style="text-align: right; min-width: 80px;">
                <div style="color: var(--text-dim); font-size: 0.75rem;">Set-Leg</div>
                <div style="font-weight: 600;">${setLeg}</div>
              </div>
            </div>
            <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border); color: var(--text-dim); font-size: 0.82rem;">
              ✍️ Yazıcı-Hakem: <strong style="color: var(--text);">${scorerName}</strong>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ========== Render: Klasman ==========
function renderStandings() {
  const host = document.getElementById('standings-host');
  const tourns = state.tournaments.filter(t => t.status !== 'draft');
  if (!tourns.length) {
    host.innerHTML = `<div class="card empty">Henüz başlamış turnuva yok</div>`;
    return;
  }
  host.innerHTML = tourns.map(t => {
    const rows = buildStandings(t);
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.85rem;">
          <h4 style="margin: 0;">${t.name}</h4>
          <span class="chip ${t.status === 'finished' ? 'success' : 'live'}">
            ${t.status === 'finished' ? 'TAMAM' : 'DEVAM'}
          </span>
        </div>
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th><th>Oyuncu</th>
              <th class="num">O</th><th class="num">G</th><th class="num">M</th>
              <th class="num">Leg</th><th class="num">±</th>
              <th class="num">3-Ok Ort.</th>
              <th class="num">100+</th><th class="num">140+</th><th class="num">180</th>
              <th class="num">En Yük. Çıkış</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length === 0
              ? '<tr><td colspan="12" class="empty">Henüz veri yok</td></tr>'
              : rows.map((r, i) => {
                  const rank = i + 1;
                  const pillCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                  const ml = r.matches_won;
                  const lo = r.matches_played - r.matches_won;
                  return `
                    <tr class="rank-${rank}">
                      <td><span class="rank-pill ${pillCls}">${rank}</span></td>
                      <td><strong>${entryLabel(r.entry)}</strong></td>
                      <td class="num">${r.matches_played}</td>
                      <td class="num">${ml}</td>
                      <td class="num">${lo}</td>
                      <td class="num">${r.legs_for}-${r.legs_against}</td>
                      <td class="num">${r.leg_diff > 0 ? '+' : ''}${r.leg_diff}</td>
                      <td class="num"><strong>${r.average_3dart.toFixed(2)}</strong></td>
                      <td class="num">${r.tons}</td>
                      <td class="num">${r.ton_plus}</td>
                      <td class="num">${r.one_eighty}</td>
                      <td class="num">${r.best_checkout || '—'}</td>
                    </tr>
                  `;
                }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }).join('');
}

// ========== Render: Bracket ==========
function renderBracket() {
  const host = document.getElementById('bracket-host');
  const tourns = state.tournaments.filter(t => t.status !== 'draft');
  if (!tourns.length) { host.innerHTML = ''; return; }
  host.innerHTML = tourns.map(t => `
    <div class="card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.85rem;">
        <h4 style="margin: 0;">${t.name}</h4>
        <span style="color: var(--text-dim); font-size: 0.85rem;">
          ${modeLabel(t.game_mode)} · ${t.team_mode === 'singles' ? 'Teklik' : 'Çiftli'} · ${t.entries.length} katılımcı
        </span>
      </div>
      ${t.stages.map(s => renderStage(t, s)).join('')}
    </div>
  `).join('');
}

function renderStage(t, stage) {
  const stageMatches = t.matches.filter(m => m.stage_id === stage.id);
  if (stageMatches.length === 0) return '';
  if (stage.format === 'round_robin') return renderRR(stage, stageMatches);
  return renderElim(stage, stageMatches);
}

function renderElim(stage, matches) {
  const rounds = {};
  for (const m of matches) {
    const key = `${m.bracket}-${m.round}`;
    (rounds[key] = rounds[key] || []).push(m);
  }
  const keys = Object.keys(rounds).sort((a, b) => {
    const [ba, ra] = a.split('-'); const [bb, rb] = b.split('-');
    const order = { winners: 0, losers: 1, final: 2 };
    return (order[ba] || 99) - (order[bb] || 99) || +ra - +rb;
  });
  return `
    <div style="margin-top: 0.5rem;">
      <h4 style="color: var(--text-dim); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        ${formatLabel(stage.format)}
      </h4>
      <div class="bracket">
        ${keys.map(k => {
          const ms = rounds[k];
          const [bracket, round] = k.split('-');
          const label = bracket === 'final' ? 'Final' :
            bracket === 'losers' ? `Losers R${round}` : `R${round}`;
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
  const w1 = m.winner_entry_id === m.entry1_id;
  const w2 = m.winner_entry_id === m.entry2_id;
  const s1 = m.p1_sets > 0 || m.p2_sets > 0 ? `${m.p1_sets}(${m.p1_legs})` : `${m.p1_legs}`;
  const s2 = m.p1_sets > 0 || m.p2_sets > 0 ? `${m.p2_sets}(${m.p2_legs})` : `${m.p2_legs}`;
  return `
    <div class="bracket-match ${cls}">
      <div class="slot ${w1 ? 'winner' : ''}">
        <span>${entryLabel(m.entry1)}</span>
        <span class="score">${m.entry1_id ? s1 : ''}</span>
      </div>
      <div class="slot ${w2 ? 'winner' : ''}">
        <span>${entryLabel(m.entry2)}</span>
        <span class="score">${m.entry2_id ? s2 : ''}</span>
      </div>
    </div>
  `;
}

function renderRR(stage, matches) {
  // Bracket sekmesinde RR için minik özet — esas tablo Klasman bölümünde
  const totalMatches = matches.length;
  const finished = matches.filter(m => m.status === 'finished').length;
  return `
    <div style="color: var(--text-dim); font-size: 0.88rem; padding: 0.5rem 0;">
      Round-robin · ${finished}/${totalMatches} maç tamamlandı
    </div>
  `;
}

// ========== Render: Tüm Maçlar ==========
function renderMatches() {
  const host = document.getElementById('matches-host');
  const all = [];
  for (const t of state.tournaments) {
    for (const m of t.matches) {
      all.push({ ...m, _tournament: t.name });
    }
  }

  let filtered = all;
  if (matchFilter === 'live') filtered = all.filter(m => m.status === 'live' || m.status === 'ready');
  else if (matchFilter === 'ready') filtered = all.filter(m => m.status === 'ready');
  else if (matchFilter === 'finished') filtered = all.filter(m => m.status === 'finished');

  // Sıralama: live → ready → finished, sonra round/match_index
  const order = { live: 0, ready: 1, finished: 2, pending: 3 };
  filtered.sort((a, b) =>
    (order[a.status] || 9) - (order[b.status] || 9) ||
    (a.round || 0) - (b.round || 0) ||
    (a.match_index || 0) - (b.match_index || 0));

  if (filtered.length === 0) {
    host.innerHTML = `<div class="card empty">Bu filtreye uyan maç yok</div>`;
    return;
  }

  host.innerHTML = `
    <div class="card" style="padding: 0;">
      <table class="matches-list">
        <thead>
          <tr>
            <th style="padding: 0.55rem 0.7rem; color: var(--text-dim); text-align: left; font-size: 0.78rem;">Durum</th>
            <th style="padding: 0.55rem 0.7rem; color: var(--text-dim); text-align: left; font-size: 0.78rem;">Turnuva · Tur</th>
            <th style="padding: 0.55rem 0.7rem; color: var(--text-dim); text-align: left; font-size: 0.78rem;">Eşleşme</th>
            <th style="padding: 0.55rem 0.7rem; color: var(--text-dim); text-align: right; font-size: 0.78rem;">Skor</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(m => {
            const statusBadge = ({
              live: '<span class="chip live">CANLI</span>',
              ready: '<span class="chip" style="background:#f59e0b;color:#000;">HAZIR</span>',
              finished: '<span class="chip success">BİTTİ</span>',
              pending: '<span class="chip" style="background:var(--surface-2);color:var(--text-dim);">BEKLİYOR</span>',
            })[m.status] || m.status;

            const e1 = entryLabel(m.entry1);
            const e2 = entryLabel(m.entry2);
            const w1 = m.winner_entry_id === m.entry1_id;
            const w2 = m.winner_entry_id === m.entry2_id;
            const setLeg = m.p1_sets > 0 || m.p2_sets > 0
              ? `${m.p1_sets}-${m.p2_sets} (${m.p1_legs}-${m.p2_legs})`
              : `${m.p1_legs}-${m.p2_legs}`;
            const score = m.status === 'pending' ? '—' : setLeg;

            const turLabel = ({
              winners: 'WB R', losers: 'LB R', final: 'GF', group: 'Grup', rr: 'RR',
            })[m.bracket] || 'R';
            const turText = m.bracket === 'final' ? 'GF' :
              m.round ? `${turLabel}${m.round}` : '';

            return `
              <tr>
                <td style="padding: 0.55rem 0.7rem;">${statusBadge}</td>
                <td style="padding: 0.55rem 0.7rem; color: var(--text-dim); font-size: 0.85rem;">
                  ${m._tournament}${turText ? ' · ' + turText : ''}
                </td>
                <td style="padding: 0.55rem 0.7rem;">
                  <span class="${w1 ? 'winner' : ''}">${e1}</span>
                  <span class="vs">vs</span>
                  <span class="${w2 ? 'winner' : ''}">${e2}</span>
                </td>
                <td style="padding: 0.55rem 0.7rem; text-align: right; font-variant-numeric: tabular-nums;">
                  <strong>${score}</strong>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ========== Render: Son bitenler ==========
function renderRecent() {
  const host = document.getElementById('recent-host');
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
  const recent = finished.slice(0, 10);

  if (recent.length === 0) {
    host.innerHTML = `<div class="card empty">Henüz biten maç yok</div>`;
    return;
  }

  host.innerHTML = `
    <div class="recent-list">
      ${recent.map(m => {
        const e1 = entryLabel(m.entry1);
        const e2 = entryLabel(m.entry2);
        const w1 = m.winner_entry_id === m.entry1_id;
        const score = m.p1_sets > 0 || m.p2_sets > 0
          ? `${m.p1_sets}-${m.p2_sets} (${m.p1_legs}-${m.p2_legs})`
          : `${m.p1_legs}-${m.p2_legs}`;
        return `
          <div class="recent-row">
            <div>
              <div style="font-weight: 600;">
                <span class="${w1 ? 'winner' : ''}">${e1}</span>
                <span class="vs">vs</span>
                <span class="${!w1 ? 'winner' : ''}">${e2}</span>
              </div>
              <div style="color: var(--text-dim); font-size: 0.78rem; margin-top: 0.2rem;">
                ${m._tournament}
              </div>
            </div>
            <span class="score-pill">${score}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// ========== Filter UI ==========
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#filter-row button');
  if (!btn) return;
  matchFilter = btn.dataset.filter;
  document.querySelectorAll('#filter-row button').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === matchFilter));
  renderMatches();
});

// ========== Sticky nav: aktif bölüm vurgusu ==========
const navLinks = document.querySelectorAll('#nav a');
const sections = ['sec-live', 'sec-standings', 'sec-bracket', 'sec-matches', 'sec-recent'];
const obs = new IntersectionObserver((entries) => {
  for (const ent of entries) {
    if (ent.isIntersecting) {
      navLinks.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + ent.target.id));
    }
  }
}, { rootMargin: '-30% 0px -60% 0px' });
sections.forEach(id => {
  const el = document.getElementById(id);
  if (el) obs.observe(el);
});
