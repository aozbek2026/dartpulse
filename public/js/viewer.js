// İzleyici — tek sayfa, çok bölümlü canlı görünüm
const socket = io();
let state = { players: [], boards: [], tournaments: [], activeMatches: [] };
let matchFilter = 'all';
let watchedMatchId = null; // Aynalanan maç ID'si
let watchFlashKeys = new Set(); // Flash animasyonu için kalan skor key'leri
let watchPrevScores = {}; // Önceki kalan skorlar (flash tetiklemek için)
let watchLastThrows = {}; // Son atılan skor { fk: score }

// ── Turnuva seçim filtresi ───────────────────────────────────────
// null  → tüm turnuvalar görünür (varsayılan)
// <id>  → sadece o turnuva görünür
let selectedTourId = readInitialTourSelection();

function readInitialTourSelection() {
  // 1) URL ?t=ID önceliklidir (paylaşılabilir link)
  try {
    const sp = new URLSearchParams(window.location.search);
    const v = sp.get('t');
    if (v != null && v !== '') {
      const n = +v;
      if (!isNaN(n)) return n;
    }
  } catch {}
  // 2) Sonra localStorage
  try {
    const v = localStorage.getItem('viewer.selectedTourId');
    if (v != null && v !== '' && v !== 'null') {
      const n = +v;
      if (!isNaN(n)) return n;
    }
  } catch {}
  return null;
}

function persistTourSelection() {
  // URL ve localStorage'ı senkron tut
  try {
    const url = new URL(window.location.href);
    if (selectedTourId == null) url.searchParams.delete('t');
    else url.searchParams.set('t', String(selectedTourId));
    window.history.replaceState({}, '', url.toString());
  } catch {}
  try {
    if (selectedTourId == null) localStorage.removeItem('viewer.selectedTourId');
    else localStorage.setItem('viewer.selectedTourId', String(selectedTourId));
  } catch {}
}

// Dropdown change handler (HTML'den çağrılıyor)
function onTourChange(val) {
  selectedTourId = (val === '' || val == null) ? null : +val;
  persistTourSelection();
  render();
}
window.onTourChange = onTourChange;

// Görünür turnuvaları döndüren ortak helper.
// base verilmezse state.tournaments kullanılır.
function getVisibleTournaments(base) {
  const list = base || state.tournaments || [];
  if (selectedTourId == null) return list;
  return list.filter(t => t.id === selectedTourId);
}

// Maçları seçili turnuvaya göre filtrele.
// match.tournament_id mevcutsa onu, yoksa state.tournaments arasından
// matches içinde olan ilk turnuvayı kullanır (fallback).
function filterMatchesByTour(matches) {
  if (selectedTourId == null) return matches || [];
  return (matches || []).filter(m => {
    if (m.tournament_id != null) return m.tournament_id === selectedTourId;
    // tournament_id alanı yoksa — hangi turnuvaya ait olduğunu state üzerinden bul
    for (const t of state.tournaments || []) {
      if ((t.matches || []).some(tm => tm.id === m.id)) {
        return t.id === selectedTourId;
      }
    }
    return false;
  });
}

// Dropdown'u doldur. Her render'da çağrılır — opsiyonların güncel kalması için.
function renderTourSelector() {
  const sel = document.getElementById('tour-select');
  if (!sel) return;
  // Draft (taslak) turnuvaları seçeneklerden hariç tut
  const tourns = (state.tournaments || []).filter(t => t.status !== 'draft');
  const order = (s) => ({ live: 0, running: 0, ready: 1, finished: 2 }[s] ?? 3);
  tourns.sort((a, b) => order(a.status) - order(b.status) || (b.id - a.id));
  const opts = [`<option value="">Hepsi (${tourns.length})</option>`]
    .concat(tourns.map(t => {
      const dot = t.status === 'finished' ? '✅' : '🔴';
      return `<option value="${t.id}"${selectedTourId === t.id ? ' selected' : ''}>${dot} ${escapeHtml(t.name)}</option>`;
    }));
  sel.innerHTML = opts.join('');
  // Seçili turnuva artık mevcut değilse (silinmiş) Hepsi'ye düş
  if (selectedTourId != null && !tourns.some(t => t.id === selectedTourId)) {
    selectedTourId = null;
    persistTourSelection();
  }
}

// HTML escape — selector için
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCfg(json) {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

socket.on('state', (s) => {
  state = s;
  render();
});

// Aynalanan maç güncellenince modalı yenile
socket.on('match:update', (data) => {
  if (watchedMatchId && data.matchId === watchedMatchId) {
    refreshWatchModal(data.matchId);
  }
});

function render() {
  renderTourSelector();
  renderLive();
  renderStandings();
  renderBracket();
  renderMatches();
  renderRecent();
  renderPast();
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

// ========== Grup sıralaması hesaplaması (RR grup aşaması) ==========
function buildGroupStandings(t, stageMatches) {
  const groupIndices = [...new Set(stageMatches.map(m => m.group_index).filter(g => g != null))].sort((a, b) => a - b);
  const result = {};
  for (const gi of groupIndices) {
    const groupMatches = stageMatches.filter(m => m.group_index === gi);
    const entryIds = new Set();
    for (const m of groupMatches) {
      if (m.entry1_id) entryIds.add(m.entry1_id);
      if (m.entry2_id) entryIds.add(m.entry2_id);
    }
    const stats = {};
    for (const eid of entryIds) {
      const entry = t.entries.find(e => e.id === eid) || null;
      stats[eid] = { entry, matches_played: 0, matches_won: 0, legs_for: 0, legs_against: 0 };
    }
    for (const m of groupMatches) {
      if (m.status !== 'finished' || !m.entry1_id || !m.entry2_id) continue;
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
    const rows = Object.values(stats).map(s => ({
      ...s,
      leg_diff: s.legs_for - s.legs_against,
    }));
    rows.sort((a, b) => b.matches_won - a.matches_won || b.leg_diff - a.leg_diff);
    result[gi] = rows;
  }
  return result;
}

// ========== Render: Canlı ==========
function renderLive() {
  const host = document.getElementById('live-host');
  const active = filterMatchesByTour(state.activeMatches || []);
  if (!active.length) {
    const msg = selectedTourId != null
      ? 'Bu turnuvada şu an canlı maç yok'
      : 'Şu an canlı maç yok';
    host.innerHTML = `<div class="card empty">${msg}</div>`;
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
          <div class="card" style="padding: 1rem; cursor: pointer;" onclick="openWatchModal(${m.id})" title="Tıkla — canlı skor izle">
            <div style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 0.5rem; display: flex; justify-content: space-between;">
              <span>${board ? board.name : 'Board yok'} · ${m.round_label || (m.bracket === 'final' ? 'Grand Final' : m.bracket === 'losers' ? `LB R${m.round}` : m.bracket === 'winners' ? `WB R${m.round}` : m.round ? `R${m.round}` : '')} · Leg ${m.current_leg}</span>
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
  const tourns = getVisibleTournaments(state.tournaments.filter(t => t.status !== 'draft'));
  if (!tourns.length) {
    const msg = selectedTourId != null
      ? 'Seçili turnuva henüz başlamadı'
      : 'Henüz başlamış turnuva yok';
    host.innerHTML = `<div class="card empty">${msg}</div>`;
    return;
  }
  host.innerHTML = tourns.map(t => {
    const statusChip = `<span class="chip ${t.status === 'finished' ? 'success' : 'live'}">${t.status === 'finished' ? 'TAMAM' : 'DEVAM'}</span>`;
    // RR grup aşaması var mı kontrol et
    const rrStage = t.stages.find(s => s.format === 'round_robin');
    if (rrStage) {
      const cfg = parseCfg(rrStage.config_json);
      const rrMatches = t.matches.filter(m => m.stage_id === rrStage.id);
      if (cfg.group_size && cfg.group_size > 0) {
        // Grup sıralamaları
        const groupStandings = buildGroupStandings(t, rrMatches);
        const groupIndices = Object.keys(groupStandings).map(Number).sort((a, b) => a - b);
        return `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.85rem;">
              <h4 style="margin:0;">${t.name}</h4>${statusChip}
            </div>
            ${groupIndices.map(gi => {
              const rows = groupStandings[gi];
              const gLabel = String.fromCharCode(65 + gi) + ' Grubu';
              return `
                <div style="margin-bottom:1.2rem;">
                  <div style="font-size:0.72rem;font-weight:600;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:0.45rem;padding-bottom:0.3rem;border-bottom:1px solid var(--border);">${gLabel}</div>
                  <table class="standings-table">
                    <thead>
                      <tr>
                        <th>#</th><th>Oyuncu</th>
                        <th class="num">O</th><th class="num">G</th><th class="num">M</th>
                        <th class="num">Leg</th><th class="num">±</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${rows.length === 0
                        ? '<tr><td colspan="7" class="empty">Henüz veri yok</td></tr>'
                        : rows.map((r, i) => {
                            const rank = i + 1;
                            const pillCls = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
                            return `
                              <tr class="rank-${rank}">
                                <td><span class="rank-pill ${pillCls}">${rank}</span></td>
                                <td><strong>${entryLabel(r.entry)}</strong></td>
                                <td class="num">${r.matches_played}</td>
                                <td class="num">${r.matches_won}</td>
                                <td class="num">${r.matches_played - r.matches_won}</td>
                                <td class="num">${r.legs_for}-${r.legs_against}</td>
                                <td class="num">${r.leg_diff > 0 ? '+' : ''}${r.leg_diff}</td>
                              </tr>
                            `;
                          }).join('')}
                    </tbody>
                  </table>
                </div>
              `;
            }).join('')}
          </div>
        `;
      }
    }
    // Elim veya tek-grup RR — orijinal geniş tablo
    const rows = buildStandings(t);
    return `
      <div class="card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.85rem;">
          <h4 style="margin: 0;">${t.name}</h4>${statusChip}
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
                  return `
                    <tr class="rank-${rank}">
                      <td><span class="rank-pill ${pillCls}">${rank}</span></td>
                      <td><strong>${entryLabel(r.entry)}</strong></td>
                      <td class="num">${r.matches_played}</td>
                      <td class="num">${r.matches_won}</td>
                      <td class="num">${r.matches_played - r.matches_won}</td>
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
function scaleBrackets(host) {
  host.querySelectorAll('.bsv-wrap').forEach(wrap => {
    const inner = wrap.firstElementChild;
    if (!inner) return;
    const innerW = parseInt(wrap.dataset.bsvW, 10);
    const innerH = parseInt(wrap.dataset.bsvH, 10);
    let lastW = -1;
    const apply = () => {
      const w = wrap.offsetWidth;
      if (w <= 0 || w === lastW) return;
      lastW = w;
      if (innerW > w) {
        const s = w / innerW;
        inner.style.transform = `scale(${s})`;
        wrap.style.height = Math.round(innerH * s) + 'px';
      } else {
        inner.style.transform = '';
        wrap.style.height = innerH + 'px';
      }
    };
    requestAnimationFrame(apply);
    new ResizeObserver(apply).observe(wrap);
  });
}

function renderBracket() {
  const host = document.getElementById('bracket-host');
  const tourns = getVisibleTournaments(state.tournaments.filter(t => t.status !== 'draft'));
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
  scaleBrackets(host);
}

function renderStage(t, stage) {
  const stageMatches = t.matches.filter(m => m.stage_id === stage.id);
  if (stageMatches.length === 0) return '';
  if (stage.format === 'round_robin') return renderRR(stage, stageMatches);
  return renderElim(stage, stageMatches);
}

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

  return `<div class="bsv-wrap" style="overflow:hidden;width:100%;height:${totalH}px;" data-bsv-w="${totalW}" data-bsv-h="${totalH}">
    <div style="position:relative;width:${totalW}px;height:${totalH}px;transform-origin:top left;">
      <svg style="position:absolute;top:${LH}px;left:0;width:${totalW}px;height:${totalH - LH}px;pointer-events:none;overflow:visible;">${svgLines}</svg>
      ${html}
    </div>
  </div>`;
}

function renderElim(stage, matches) {
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
        <div style="margin-bottom: 0.6rem;">
          <div style="font-size: 0.7rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.3rem; padding: 0.15rem 0.4rem; background: var(--bg-2); border-radius: 4px; display: inline-block;">${sectionLabel}</div>
          ${bracketHTML}
        </div>
      `;
    };

    return `
      <div style="margin-top: 0.5rem;">
        <h4 style="color: var(--text-dim); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.6rem;">${formatLabel(stage.format)}</h4>
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
    <div style="margin-top: 0.5rem;">
      <h4 style="color: var(--text-dim); font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem;">
        ${formatLabel(stage.format)}
      </h4>
      ${renderElimBracketSVG(columns, renderBracketMatch)}
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
  const cfg = parseCfg(stage.config_json);
  const hasGroups = cfg.group_size && cfg.group_size > 0;
  const totalMatches = matches.length;
  const finished = matches.filter(m => m.status === 'finished').length;

  const stageHeader = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.7rem;">
      <h4 style="color:var(--text-dim);font-size:0.78rem;text-transform:uppercase;letter-spacing:0.05em;margin:0;">${formatLabel(stage.format)}</h4>
      <span style="font-size:0.82rem;color:var(--text-dim);">${finished}/${totalMatches} maç tamamlandı</span>
    </div>
  `;

  if (!hasGroups) {
    // Tek-grup RR
    return `
      <div style="margin-top:0.5rem;">
        ${stageHeader}
        <div class="bracket">
          <div class="bracket-round">
            <h4>Round Robin</h4>
            ${matches.map(m => renderBracketMatch(m)).join('')}
          </div>
        </div>
      </div>
    `;
  }

  // Çok-grup RR: her grubu ayrı sütunda göster
  const groupIndices = [...new Set(matches.map(m => m.group_index).filter(g => g != null))].sort((a, b) => a - b);
  return `
    <div style="margin-top:0.5rem;">
      ${stageHeader}
      <div style="display:flex;flex-wrap:wrap;gap:1rem;align-items:flex-start;">
        ${groupIndices.map(gi => {
          const gMatches = matches.filter(m => m.group_index === gi);
          const gLabel = String.fromCharCode(65 + gi) + ' Grubu';
          const gFin = gMatches.filter(m => m.status === 'finished').length;
          return `
            <div style="flex:1 1 260px;min-width:0;">
              <div style="font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:0.4rem;padding:0.2rem 0.5rem;background:var(--surface-2);border-radius:4px;display:inline-block;">
                ${gLabel} · ${gFin}/${gMatches.length} maç
              </div>
              ${gMatches.map(m => renderBracketMatch(m)).join('')}
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

// ========== Render: Tüm Maçlar ==========
function renderMatches() {
  const host = document.getElementById('matches-host');
  const all = [];
  for (const t of getVisibleTournaments()) {
    for (const m of t.matches) {
      all.push({ ...m, _tournament: t.name });
    }
  }

  let filtered = all;
  if (matchFilter === 'live') filtered = all.filter(m => m.status === 'live' || m.status === 'ready');
  else if (matchFilter === 'ready') filtered = all.filter(m => m.status === 'ready');
  else if (matchFilter === 'finished') filtered = all.filter(m => m.status === 'finished');

  // Sıralama: son biten en üstte; aktif (live/ready) sonra; bekleyenler en altta
  filtered.sort((a, b) => {
    const aFin = a.status === 'finished';
    const bFin = b.status === 'finished';
    // İkisi de bitmişse → finished_at desc (en yeni üstte)
    if (aFin && bFin) {
      if (a.finished_at && b.finished_at) return b.finished_at.localeCompare(a.finished_at);
      return (b.id || 0) - (a.id || 0);
    }
    // Bitmişler önce, sonra live, ready, pending
    const order = { finished: 0, live: 1, ready: 2, pending: 3 };
    return (order[a.status] ?? 9) - (order[b.status] ?? 9);
  });

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

            let turText = '';
            if (m.bracket === 'final') {
              turText = 'GF';
            } else if (m.bracket === 'rr' || m.bracket === 'group') {
              const gLetter = m.group_index != null ? String.fromCharCode(65 + m.group_index) + ' Grubu' : 'RR';
              turText = m.round ? `${gLetter} R${m.round}` : gLetter;
            } else if (m.bracket === 'winners') {
              turText = `WB R${m.round}`;
            } else if (m.bracket === 'losers') {
              turText = `LB R${m.round}`;
            } else if (m.round) {
              turText = `R${m.round}`;
            }

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
  for (const t of getVisibleTournaments()) {
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

// ========== Render: Geçmiş turnuvalar ==========
function renderPast() {
  const host = document.getElementById('past-host');
  if (!host) return;
  const finished = getVisibleTournaments(state.tournaments.filter(t => t.status === 'finished'));
  if (!finished.length) {
    const msg = selectedTourId != null
      ? 'Seçili turnuva henüz tamamlanmadı'
      : 'Henüz tamamlanmış turnuva yok';
    host.innerHTML = `<div class="card empty">${msg}</div>`;
    return;
  }
  host.innerHTML = finished.map(t => {
    // Son aşamanın final maçını bul → şampiyonu belirle
    const finalMatch = [...t.matches].reverse().find(m =>
      m.status === 'finished' && (m.bracket === 'final' || m.round === Math.max(...t.matches.map(x => x.round || 0)))
    );
    const champion = finalMatch
      ? entryLabel(finalMatch.winner_entry_id === finalMatch.entry1_id ? finalMatch.entry1 : finalMatch.entry2)
      : '—';
    const totalMatches = t.matches.filter(m => m.status === 'finished').length;
    const stages = t.stages.map(s => formatLabel(s.format)).join(' + ');
    return `
      <div class="card" style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem;">
          <div>
            <div style="font-weight: 600; font-size: 1.05rem; margin-bottom: 0.25rem;">
              🏆 ${t.name}
            </div>
            <div style="color: var(--text-dim); font-size: 0.85rem;">
              ${modeLabel(t.game_mode)} · ${stages} · ${t.entries.length} katılımcı · ${totalMatches} maç
            </div>
            <div style="margin-top: 0.5rem; font-size: 0.88rem;">
              Şampiyon: <strong style="color: var(--accent);">${champion}</strong>
            </div>
          </div>
          <span class="chip success">TAMAMLANDI</span>
        </div>
      </div>
    `;
  }).join('');
}

// ========== Canlı Maç Aynalama ==========
async function openWatchModal(matchId) {
  watchedMatchId = matchId;
  // Modal zaten açıksa güncelle
  let modal = document.getElementById('watch-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'watch-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.8);display:flex;align-items:center;justify-content:center;z-index:9999;padding:1rem;';
    modal.innerHTML = `
      <div style="background:var(--surface);border-radius:16px;padding:1.5rem;max-width:680px;width:100%;max-height:90vh;overflow-y:auto;position:relative;">
        <button onclick="closeWatchModal()" style="position:absolute;top:1rem;right:1rem;background:none;border:none;color:var(--text-dim);font-size:1.5rem;cursor:pointer;line-height:1;">×</button>
        <div id="watch-content" style="margin-top:0.5rem;">Yükleniyor…</div>
      </div>
    `;
    document.body.appendChild(modal);
    // Esc ile kapat
    document.addEventListener('keydown', watchEscHandler, true);
  }
  await refreshWatchModal(matchId);
}

function closeWatchModal() {
  watchedMatchId = null;
  watchFlashKeys = new Set();
  watchPrevScores = {};
  watchLastThrows = {};
  document.getElementById('watch-modal')?.remove();
  document.removeEventListener('keydown', watchEscHandler, true);
}

function watchEscHandler(e) {
  if (e.key === 'Escape') closeWatchModal();
}

async function refreshWatchModal(matchId) {
  const content = document.getElementById('watch-content');
  if (!content) return;
  try {
    const m = await api.get(`/api/matches/${matchId}`);
    if (!m || m.error) { content.innerHTML = '<div style="color:var(--text-dim);">Maç bulunamadı.</div>'; return; }

    const e1 = entryLabel(m.entry1);
    const e2 = entryLabel(m.entry2);
    const isTurn1 = m.current_turn === 1;
    const showSets = (m.sets_to_win || 1) > 1;
    const stats1 = (m.stats || []).find(s => s.player_slot === 1) || {};
    const stats2 = (m.stats || []).find(s => s.player_slot === 2) || {};
    const rem1 = m.p1_leg_score ?? startScore(m);
    const rem2 = m.p2_leg_score ?? startScore(m);
    const setLeg = showSets
      ? `Set: ${m.p1_sets}-${m.p2_sets} · Leg: ${m.p1_legs}-${m.p2_legs}`
      : `Leg: ${m.p1_legs}-${m.p2_legs}`;

    // Flash + throw badge: önceki skorla karşılaştır
    const fk1 = `${matchId}-1`, fk2 = `${matchId}-2`;
    watchFlashKeys = new Set();
    // Kalan skor düştüyse → o oyuncu attı, farkı throw badge olarak göster
    watchLastThrows[fk1] = (watchPrevScores[fk1] !== undefined && rem1 < watchPrevScores[fk1])
      ? watchPrevScores[fk1] - rem1 : null;
    watchLastThrows[fk2] = (watchPrevScores[fk2] !== undefined && rem2 < watchPrevScores[fk2])
      ? watchPrevScores[fk2] - rem2 : null;
    if (watchLastThrows[fk1]) watchFlashKeys.add(fk1);
    if (watchLastThrows[fk2]) watchFlashKeys.add(fk2);
    watchPrevScores[fk1] = rem1;
    watchPrevScores[fk2] = rem2;

    content.innerHTML = `
      <div style="text-align:center;margin-bottom:1rem;">
        <div style="font-size:0.8rem;color:var(--text-dim);letter-spacing:0.1em;text-transform:uppercase;">${m.round_label || ''} · ${setLeg}</div>
        <div style="font-size:0.88rem;color:var(--text-dim);margin-top:0.2rem;">Sıra: <strong style="color:var(--accent);">${isTurn1 ? e1 : e2}</strong></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
        ${watchPlayerCard(e1, rem1, stats1, isTurn1, m.p1_legs, m.p1_sets, showSets, fk1)}
        ${watchPlayerCard(e2, rem2, stats2, !isTurn1, m.p2_legs, m.p2_sets, showSets, fk2)}
      </div>

      <div style="text-align:center;font-size:0.8rem;color:var(--text-dim);display:flex;align-items:center;justify-content:center;gap:1rem;">
        <span>${m.status === 'live' ? '🟢 Canlı — her atışta otomatik güncellenir' : m.status === 'finished' ? '🏁 Maç bitti' : '⏳ Başlamayı bekliyor'}</span>
        ${m.status === 'live' ? `<a href="/board.html?match=${matchId}&readonly=1" target="_blank" style="display:inline-block;padding:0.35rem 0.9rem;background:var(--accent);color:#000;border-radius:8px;font-weight:700;font-size:0.82rem;text-decoration:none;">Canlı İzle ▶</a>` : ''}
      </div>
    `;
  } catch(e) {
    if (content) content.innerHTML = '<div style="color:var(--text-dim);">Bağlantı hatası.</div>';
  }
}

function watchPlayerCard(name, remaining, stats, active, legs, sets, showSets, flashKey) {
  const avg3 = stats.darts_thrown ? ((stats.total_score / stats.darts_thrown) * 3).toFixed(1) : '—';
  const isFlashing = flashKey && watchFlashKeys && watchFlashKeys.has(flashKey);
  const thrown = flashKey && watchLastThrows[flashKey];
  return `
    <div style="background:var(--surface-2);border:2px solid ${active ? 'var(--accent)' : 'var(--border)'};border-radius:12px;padding:1rem;text-align:center;${active ? 'box-shadow:0 0 30px rgba(255,56,96,0.15);' : ''}">
      <div style="font-weight:700;font-size:1rem;margin-bottom:0.5rem;${active ? 'color:var(--accent);' : ''}">${name}</div>
      <div style="font-size:0.75rem;color:var(--text-dim);">Kalan</div>
      ${thrown ? `<div class="throw-badge">${thrown}</div>` : '<div style="height:2rem;"></div>'}
      <div class="${isFlashing ? 'score-flash' : ''}" style="font-size:4.5rem;font-weight:900;line-height:1.05;letter-spacing:-2px;">${remaining}</div>
      <div style="font-size:0.78rem;color:var(--text-dim);margin-top:0.4rem;">Leg: <strong>${legs}</strong>${showSets ? ` · Set: <strong>${sets}</strong>` : ''}</div>
      <div style="display:flex;justify-content:center;gap:1rem;margin-top:0.5rem;font-size:0.8rem;">
        <span>Ort: <strong>${avg3}</strong></span>
        <span>180: <strong>${stats.one_eighty || 0}</strong></span>
        <span>CO: <strong>${stats.best_checkout || '—'}</strong></span>
      </div>
    </div>
  `;
}

function startScore(m) {
  const mode = m?.game_mode;
  if (mode === '501') return 501;
  if (mode === '701') return 701;
  if (mode === '1001') return 1001;
  return 501;
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
const sections = ['sec-live', 'sec-standings', 'sec-bracket', 'sec-matches', 'sec-recent', 'sec-past'];
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
