// Board (tablet) ekranı - üç durum: pre-match (ready) / live / post-match (finished)
const params = new URLSearchParams(location.search);
const boardId = params.get('id') ? +params.get('id') : null;
const readonlyMatchId = params.get('match') ? +params.get('match') : null;
const isReadonly = params.get('readonly') === '1' && !!readonlyMatchId;
const root = document.getElementById('root');
const socket = io();

let currentMatch = null;
let currentBoard = null;
let currentInput = '';
let allBoards = [];
let allTournaments = [];
let cricketVisit = {};          // {20: 2, 19: 1, ...} — aktif visit girişi
let selectedStarter = null;    // 1 veya 2 — hangi takım başlıyor
let selectedSubStarter1 = null; // 1 veya 2 — takım 1'de kim başlıyor (doubles)
let selectedSubStarter2 = null; // 1 veya 2 — takım 2'de kim başlıyor (doubles)

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
  root.innerHTML = `
    <div style="max-width: 600px; margin: 4rem auto;">
      <h2 style="text-align: center; margin-bottom: 2rem;">Bu tablet hangi board için?</h2>
      <div class="grid cols-2">
        ${allBoards.map(b => `
          <a class="card" href="/board.html?id=${b.id}" style="text-decoration: none; color: inherit;">
            <h3>${b.name}</h3>
            <div style="color: var(--text-dim); margin-top: 0.5rem;">
              ${b.status === 'busy' ? '⚡ Meşgul' : '💤 Boşta'}
            </div>
          </a>
        `).join('')}
      </div>
    </div>
  `;
}

function renderIdle() {
  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${currentBoard.name}</div>
        <div class="match-info">Bekliyor</div>
      </div>
      <a href="/board.html" class="btn secondary">Board değiştir</a>
    </div>
    <div style="flex: 1; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 1rem;">
      <div style="font-size: 5rem;">🎯</div>
      <h2>Maç bekleniyor</h2>
      <p style="color: var(--text-dim);">Organizatör turnuva başlattığında sıradaki maç otomatik gelecek.</p>
    </div>
  `;
}

// ---- Pre-match ekranı (status === 'ready') ----
function renderPreMatch() {
  const m = currentMatch;
  const e1 = entryLabel(m.entry1);
  const e2 = entryLabel(m.entry2);
  const isDoubles = !!(m.entry1?.player2 || m.entry2?.player2);
  const scorer = m.scorer ? entryLabel(m.scorer) : null;
  const roundLabel = m.round_label || `Round ${m.round}`;
  const tName = m.tournament_name || 'Turnuva';

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
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; gap: 1.5rem;">
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

      <div style="display: flex; gap: 1rem; margin-top: 0.5rem;">
        <button class="btn secondary" style="font-size: 0.9rem; padding: 0.6rem 1.2rem; border-color: var(--danger, #ef4444); color: var(--danger, #ef4444);"
          onclick="declareWalkover(1, '${e2.replace(/'/g, "\\'")}')">
          ${e2} gelmedi
        </button>
        <button class="btn secondary" style="font-size: 0.9rem; padding: 0.6rem 1.2rem; border-color: var(--danger, #ef4444); color: var(--danger, #ef4444);"
          onclick="declareWalkover(2, '${e1.replace(/'/g, "\\'")}')">
          ${e1} gelmedi
        </button>
      </div>
    </div>
  `;
}

function selectStarter(slot) {
  selectedStarter = slot;
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
  const SHOW = 6;
  const vis1 = visits1.slice(-SHOW);
  const vis2 = visits2.slice(-SHOW);
  const visCount = Math.max(vis1.length, vis2.length, 0);
  const visOffset = Math.max(visits1.length, visits2.length) - visCount;

  // Her oyuncu için throw satırları — son atış "last" class'ı alır
  const buildThrows = (visits) => visits.map((v, i) => {
    const isLast = i === visits.length - 1;
    const cls = v.bust ? ' bust' : (isLast ? ' last' : '');
    return `<div class="dp-throw${cls}">${v.bust ? 'Bust' : v.score}</div>`;
  }).join('');

  // Orta sütun ok sayıları (3, 6, 9 ...)
  let visitNums = '';
  for (let i = 0; i < visCount; i++) {
    visitNums += `<div class="dp-visit-num">${(visOffset + i + 1) * 3}</div>`;
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
      <div class="dp-names">
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

      <div class="dp-scores">
        <div class="dp-score-col${isTurn1 ? ' active' : ''}">
          <div class="dp-rem">${rem1}</div>
          <div class="dp-throws">${buildThrows(vis1)}</div>
        </div>
        <div class="dp-middle">${visitNums}</div>
        <div class="dp-score-col${!isTurn1 ? ' active' : ''}">
          <div class="dp-rem">${rem2}</div>
          <div class="dp-throws">${buildThrows(vis2)}</div>
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
            <div class="dp-key" onclick="addDigit('0')">0</div>
            <div class="dp-key bust" onclick="setScore(0)">Bust</div>
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

// ---- Cricket ekranı ----
const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];

function cricketMarksHtml(count, active) {
  if (count <= 0) return '<span class="cr-mark-empty">·</span>';
  if (count === 1) return `<span class="cr-mark${active ? ' cr-mark-act' : ''}">/</span>`;
  if (count === 2) return `<span class="cr-mark${active ? ' cr-mark-act' : ''}">╳</span>`;
  return `<span class="cr-mark cr-mark-closed">⊗</span>`;
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

  const rows = CRICKET_NUMBERS.map(n => {
    const p1m = state.marks[n]?.p1 || 0;
    const p2m = state.marks[n]?.p2 || 0;
    const bothClosed = p1m >= 3 && p2m >= 3;
    const vHits = cricketVisit[n] || 0;
    const numLabel = n === 25 ? 'BULL' : n;
    return `
      <tr class="cr-row${bothClosed ? ' cr-row-done' : ''}">
        <td class="cr-cell cr-left">${cricketMarksHtml(p1m, isTurn1)}</td>
        <td class="cr-num">
          <span>${numLabel}</span>
          ${!isReadonly && vHits > 0 ? `<span class="cr-pending">${vHits === 1 ? '/' : vHits === 2 ? '╳' : '⊗'}</span>` : ''}
        </td>
        <td class="cr-cell cr-right">${cricketMarksHtml(p2m, !isTurn1)}</td>
      </tr>
    `;
  }).join('');

  const inputButtons = isReadonly ? '' : CRICKET_NUMBERS.map(n => {
    const myMarks = state.marks[n]?.[pKey] || 0;
    const vHits = cricketVisit[n] || 0;
    const numLabel = n === 25 ? 'BULL' : n;
    const isClosed = myMarks >= 3;
    return `
      <button class="cr-btn${vHits > 0 ? ' cr-btn-sel' : ''}${isClosed ? ' cr-btn-ok' : ''}"
        onclick="cricketToggle(${n})">
        <span class="cr-btn-num">${numLabel}</span>
        ${vHits > 0 ? `<span class="cr-btn-mark">${vHits === 1 ? '/' : vHits === 2 ? '╳' : '⊗'}</span>` : ''}
        ${isClosed ? '<span class="cr-btn-mark">⊗</span>' : ''}
      </button>
    `;
  }).join('');

  const hasInput = Object.keys(cricketVisit).length > 0;

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
        <div class="cr-score-col${isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts">${state.p1_score || 0}</div>
          <div class="cr-legs">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts">${state.p2_score || 0}</div>
          <div class="cr-legs">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <table class="cr-table">
        <tbody>${rows}</tbody>
      </table>

      ${isReadonly ? '' : `
        <div class="cr-input">
          <div class="cr-btns">${inputButtons}</div>
          <div class="cr-actions">
            <button class="btn secondary" onclick="cricketClear()" style="flex:1;">Temizle</button>
            <button class="btn${hasInput ? '' : ' secondary'}" onclick="submitCricketVisit()"
              style="flex:2; ${hasInput ? 'background:var(--accent);color:#000;font-weight:800;' : 'opacity:0.45;'}">
              Enter
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

function cricketToggle(num) {
  const cur = cricketVisit[num] || 0;
  const next = (cur + 1) % 4;
  if (next === 0) delete cricketVisit[num];
  else cricketVisit[num] = next;
  renderMatch();
}

function cricketClear() {
  cricketVisit = {};
  renderMatch();
}

async function submitCricketVisit() {
  if (!currentMatch) return;
  if (!Object.keys(cricketVisit).length) return toast('Vurulan sayıları seçin');
  const slot = currentMatch.current_turn;
  const res = await api.post(`/api/matches/${currentMatch.id}/cricket-throw`, {
    playerSlot: slot,
    hits: cricketVisit,
  });
  if (res.error) return toast('Hata: ' + res.error);
  cricketVisit = {};
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
  }
  if (res.matchFinished) toast('Maç tamamlandı!');
}


// ---- Cricket Full Board Cezalı ekranı ----
const FB_TARGETS_ALL  = ['20','19','18','17','16','15','14','13','12','25','11','10','D','T','H'];
const FB_TARGET_LABEL = { '25':'Bull', 'D':'Double', 'T':'Triple', 'H':'House' };
let fbVisit = {}; // { target: markCount }
let fbScore = 0;

function fbTargetLabel(t) { return FB_TARGET_LABEL[t] || t; }

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

  const pKey = isTurn1 ? 'p1' : 'p2';

  const rows = activeTargets.map(t => {
    const p1m = state.marks[t]?.p1 || 0;
    const p2m = state.marks[t]?.p2 || 0;
    const bothClosed = p1m >= 3 && p2m >= 3;
    const label = fbTargetLabel(t);
    return `
      <tr class="cr-row${bothClosed ? ' cr-row-done' : ''}">
        <td class="cr-cell cr-left">${cricketMarksHtml(p1m, isTurn1)}</td>
        <td class="cr-num"><span>${label}</span></td>
        <td class="cr-cell cr-right">${cricketMarksHtml(p2m, !isTurn1)}</td>
      </tr>`;
  }).join('');

  const inputBtns = isReadonly ? '' : activeTargets.map(t => {
    const myMarks = state.marks[t]?.[pKey] || 0;
    const vHits   = fbVisit[t] || 0;
    const isClosed = myMarks >= 3;
    const label    = fbTargetLabel(t);
    return `
      <button class="cr-btn${vHits > 0 ? ' cr-btn-sel' : ''}${isClosed ? ' cr-btn-ok' : ''}"
        onclick="fbToggle('${t}')">
        <span class="cr-btn-num">${label}</span>
        ${vHits > 0 ? `<span class="cr-btn-mark">${vHits === 1 ? '/' : vHits === 2 ? '╳' : '⊗'}</span>` : ''}
        ${isClosed && !vHits ? '<span class="cr-btn-mark">⊗</span>' : ''}
      </button>`;
  }).join('');

  const hasInput = Object.values(fbVisit).some(v => v > 0) || fbScore > 0;
  const colCount = activeTargets.length <= 12 ? activeTargets.length : Math.ceil(activeTargets.length / 2);

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
        <div class="cr-score-col${isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts">${state.p1_score || 0}</div>
          <div class="cr-legs">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts">${state.p2_score || 0}</div>
          <div class="cr-legs">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <table class="cr-table">
        <tbody>${rows}</tbody>
      </table>

      ${isReadonly ? '' : `
        <div class="cr-input">
          <div class="cr-btns fb-btns" style="grid-template-columns: repeat(${colCount}, 1fr);">
            ${inputBtns}
          </div>
          <div class="fb-score-row">
            <label class="fb-score-label">Puan</label>
            <input id="fb-score-input" class="fb-score-input" type="number" min="0" max="999"
              value="${fbScore || ''}" placeholder="0"
              oninput="fbScore = +this.value || 0" />
          </div>
          <div class="cr-actions">
            <button class="btn secondary" onclick="fbClear()" style="flex:1;">Temizle</button>
            <button class="btn${hasInput ? '' : ' secondary'}" onclick="submitFBCezaliVisit()"
              style="flex:2;${hasInput ? 'background:var(--accent);color:#000;font-weight:800;' : 'opacity:0.45;'}">
              Enter
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

function fbToggle(target) {
  const current = fbVisit[target] || 0;
  if (current >= 3) {
    delete fbVisit[target];
  } else {
    fbVisit[target] = current + 1;
  }
  renderMatch();
  // Puan inputunu koru
  const inp = document.getElementById('fb-score-input');
  if (inp) inp.value = fbScore || '';
}

function fbClear() {
  fbVisit = {};
  fbScore = 0;
  renderMatch();
}

async function submitFBCezaliVisit() {
  if (!currentMatch) return;
  const hasMarks = Object.values(fbVisit).some(v => v > 0);
  if (!hasMarks && !fbScore) return toast('En az bir mark veya puan girin');
  const slot = currentMatch.current_turn;
  const res = await api.post(`/api/matches/${currentMatch.id}/fb-cezali-throw`, {
    playerSlot: slot,
    allocation: { marks: { ...fbVisit }, score: fbScore },
  });
  if (res.error) return toast('Hata: ' + res.error);
  fbVisit = {};
  fbScore = 0;
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
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


// ---- Cricket Full Board Karambol ekranı ----
// Cezalı ile aynı görünüm — fark: puan satırı yok, endpoint farklı
let karambolVisit = {};

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

  const pKey = isTurn1 ? 'p1' : 'p2';

  const rows = activeTargets.map(t => {
    const p1m = state.marks[t]?.p1 || 0;
    const p2m = state.marks[t]?.p2 || 0;
    const bothClosed = p1m >= 3 && p2m >= 3;
    return `
      <tr class="cr-row${bothClosed ? ' cr-row-done' : ''}">
        <td class="cr-cell cr-left">${cricketMarksHtml(p1m, isTurn1)}</td>
        <td class="cr-num"><span>${fbTargetLabel(t)}</span></td>
        <td class="cr-cell cr-right">${cricketMarksHtml(p2m, !isTurn1)}</td>
      </tr>`;
  }).join('');

  const colCount = activeTargets.length <= 12 ? activeTargets.length : Math.ceil(activeTargets.length / 2);

  const inputBtns = isReadonly ? '' : activeTargets.map(t => {
    const myMarks  = state.marks[t]?.[pKey] || 0;
    const vHits    = karambolVisit[t] || 0;
    const isClosed = myMarks >= 3;
    return `
      <button class="cr-btn${vHits > 0 ? ' cr-btn-sel' : ''}${isClosed ? ' cr-btn-ok' : ''}"
        onclick="karambolToggle('${t}')">
        <span class="cr-btn-num">${fbTargetLabel(t)}</span>
        ${vHits > 0 ? `<span class="cr-btn-mark">${vHits === 1 ? '/' : vHits === 2 ? '╳' : '⊗'}</span>` : ''}
        ${isClosed && !vHits ? '<span class="cr-btn-mark">⊗</span>' : ''}
      </button>`;
  }).join('');

  const hasInput = Object.values(karambolVisit).some(v => v > 0);

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
        <div class="cr-score-col${isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e1}</div>
          <div class="cr-pts" style="font-size:clamp(20px,5vmin,38px);">${m.p1_legs || 0} leg</div>
        </div>
        <div class="cr-score-col${!isTurn1 ? ' cr-active' : ''}">
          <div class="cr-name">${e2}</div>
          <div class="cr-pts" style="font-size:clamp(20px,5vmin,38px);">${m.p2_legs || 0} leg</div>
        </div>
      </div>

      <table class="cr-table">
        <tbody>${rows}</tbody>
      </table>

      ${isReadonly ? '' : `
        <div class="cr-input">
          <div class="cr-btns fb-btns" style="grid-template-columns: repeat(${colCount}, 1fr);">
            ${inputBtns}
          </div>
          <div class="cr-actions">
            <button class="btn secondary" onclick="karambolClear()" style="flex:1;">Temizle</button>
            <button class="btn${hasInput ? '' : ' secondary'}" onclick="submitKarambolVisit()"
              style="flex:2;${hasInput ? 'background:var(--accent);color:#000;font-weight:800;' : 'opacity:0.45;'}">
              Enter
            </button>
          </div>
        </div>
      `}
    </div>
  `;
}

function karambolToggle(target) {
  const current = karambolVisit[target] || 0;
  if (current >= 3) { delete karambolVisit[target]; } else { karambolVisit[target] = current + 1; }
  renderMatch();
}

function karambolClear() {
  karambolVisit = {};
  renderMatch();
}

async function submitKarambolVisit() {
  if (!currentMatch) return;
  if (!Object.values(karambolVisit).some(v => v > 0)) return toast('En az bir mark seçin');
  const slot = currentMatch.current_turn;
  const res = await api.post(`/api/matches/${currentMatch.id}/karambol-throw`, {
    playerSlot: slot,
    allocation: { marks: { ...karambolVisit } },
  });
  if (res.error) return toast('Hata: ' + res.error);
  karambolVisit = {};
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
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

  const setLegLabel = (s, l) => (s > 0 ? `${s} set ${l} leg` : `${l} leg`);

  root.innerHTML = `
    <div class="board-header">
      <div>
        <div class="board-name">${currentBoard.name}</div>
        <div class="match-info">${m.tournament_name || ''} · ${m.round_label || ''} · MAÇ BİTTİ</div>
      </div>
      <a href="/board.html" class="btn secondary">Board değiştir</a>
    </div>
    <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 2rem; gap: 1.5rem;">
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
          🏆 Turnuva tamamlandı!
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

  const res = await api.post(`/api/matches/${currentMatch.id}/throw`, body);
  if (res.error) return toast('Hata: ' + res.error);
  currentInput = '';
  // Flash efekti — kalan skor kutusuna kısa parıltı
  const inputEl = document.getElementById('keypad-input');
  if (inputEl) { inputEl.classList.remove('score-flash'); void inputEl.offsetWidth; inputEl.classList.add('score-flash'); }
  if (res.bust) toast('Bust!');
  // Leg bitti ama maç bitmediyse → mini özet modalı göster ve onay bekle.
  // (Maç tamamlandıysa zaten post-match ekranı açılıyor; ayrıca özet vermiyoruz.)
  if (res.legFinished && !res.matchFinished && res.legSummary) {
    await showLegSummary(res.legSummary);
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
