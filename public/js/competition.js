// Competition (Lig/Sezon) detay sayfası — Dilim 2
// URL: /competition.html?id=42

// ── State ─────────────────────────────────────────────────────────
const STATE = {
  id: null,
  comp: null,      // { id, name, type, status, ... }
  players: [],     // [{ player_id, player_name, ... }]
  sessions: [],    // [{ id, session_number, name, status, tournament_id, ... }]
  schedule: null,  // lig için [{ round_number, pairs, session_id, ... }]
};

// ── Boot ──────────────────────────────────────────────────────────
function getCompId() {
  const u = new URL(window.location.href);
  const id = parseInt(u.searchParams.get('id'), 10);
  return isNaN(id) ? null : id;
}

async function boot() {
  STATE.id = getCompId();
  if (!STATE.id) {
    document.getElementById('comp-header').innerHTML =
      '<p style="color:#ef4444">URL\'de id parametresi bulunamadı.</p>';
    return;
  }
  await loadComp();
  await loadPlayers();
  await loadSessions();
  renderHeader();
  renderOverview();
  renderPlayers();
  await renderSessions();
  renderStandings();
  bindTabs();
}

// ── API yükleyiciler ──────────────────────────────────────────────
async function loadComp() {
  try {
    const c = await api.get('/api/competitions/' + STATE.id);
    if (c && c.error) {
      document.getElementById('comp-header').innerHTML =
        `<p style="color:#ef4444">Hata: ${escapeHtml(c.error)}</p>`;
      STATE.comp = null;
      return;
    }
    STATE.comp = c;
  } catch (e) {
    console.error(e);
    document.getElementById('comp-header').innerHTML =
      '<p style="color:#ef4444">Yüklenemedi: ' + (e.message || e) + '</p>';
  }
}

async function loadPlayers() {
  try {
    const rows = await api.get(`/api/competitions/${STATE.id}/players`);
    if (rows && rows.error) {
      STATE.players = [];
      return;
    }
    STATE.players = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error(e);
    STATE.players = [];
  }
}

async function loadSessions() {
  try {
    const rows = await api.get(`/api/competitions/${STATE.id}/sessions`);
    if (rows && rows.error) {
      STATE.sessions = [];
      return;
    }
    STATE.sessions = Array.isArray(rows) ? rows : [];
  } catch (e) {
    console.error(e);
    STATE.sessions = [];
  }
}

// ── Render: header ────────────────────────────────────────────────
function renderHeader() {
  const c = STATE.comp;
  if (!c) return;
  const typeLabel = c.type === 'league' ? 'LİG' : 'SEZON';
  const statusLabels = { draft: 'Taslak', running: 'Aktif', finished: 'Bitti' };
  const sLabel = statusLabels[c.status] || c.status;
  const gameLabel = window.modeLabel ? window.modeLabel(c.game_mode) : c.game_mode;
  const teamLabel = c.team_mode === 'doubles' ? 'Eşli' : 'Bireysel';

  document.getElementById('comp-header').innerHTML = `
    <div class="comp-header-row">
      <div>
        <h2>
          <span class="comp-type-pill ${c.type}">${typeLabel}</span>
          ${escapeHtml(c.name)}
          ${c.category ? `<span style="color:var(--text-dim);font-weight:400;font-size:0.9rem;margin-left:0.5rem">· ${escapeHtml(c.category)}</span>` : ''}
        </h2>
      </div>
      <div style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap">
        <button class="secondary" onclick="downloadReport()" title="Klasman + oturum sonuçları + maç istatistikleri (4 sekme)" style="font-size:0.85rem;padding:0.4rem 0.75rem">📊 Excel İndir</button>
        <span class="comp-status-pill ${c.status}">${sLabel}</span>
      </div>
    </div>
    <div class="comp-meta-grid">
      <div>
        <div class="label">Oturum</div>
        <div class="val">${(STATE.sessions || []).length} / ${c.planned_sessions || '?'}</div>
      </div>
      <div>
        <div class="label">Oyuncu</div>
        <div class="val">${(STATE.players || []).length}</div>
      </div>
      <div>
        <div class="label">Oyun</div>
        <div class="val">${gameLabel} · ${teamLabel}</div>
      </div>
      <div>
        <div class="label">Format</div>
        <div class="val">bo${(c.legs_to_win || 2) * 2 - 1}${(c.sets_to_win || 1) > 1 ? ` · ${(c.sets_to_win) * 2 - 1} set` : ''}</div>
      </div>
      ${c.type === 'league' ? `
      <div>
        <div class="label">Karşılaşma</div>
        <div class="val">${c.meet_count || 1}×</div>
      </div>` : ''}
    </div>
  `;
}

// ── Render: özet ──────────────────────────────────────────────────
function renderOverview() {
  const c = STATE.comp;
  if (!c) return;
  const pts = c.points_json || {};
  const ptsRows = ['1','2','3','4','5','6','7','8']
    .filter(k => pts[k] !== undefined)
    .map(k => `<tr><td>${k}.</td><td>${pts[k]} puan</td></tr>`).join('');
  const defaultPts = pts['default'] != null ? pts['default'] : 0;

  document.getElementById('overview-content').innerHTML = `
    <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start">
      <div>
        <h3 style="margin-top:0">Puan Sistemi</h3>
        ${ptsRows ? `
        <table style="width:100%;font-size:0.9rem">
          <thead><tr><th style="text-align:left">Pozisyon</th><th style="text-align:left">Puan</th></tr></thead>
          <tbody>${ptsRows}<tr><td>Diğer</td><td>${defaultPts} puan</td></tr></tbody>
        </table>` : '<p style="color:var(--text-dim)">Puan tablosu tanımlanmamış.</p>'}
      </div>
      <div>
        <h3 style="margin-top:0">Bilgi</h3>
        <p style="color:var(--text-dim);font-size:0.88rem;line-height:1.5">
          ${c.type === 'league'
            ? 'Lig formatı kapalı kadrodur — oyuncular taslak aşamasında belirlenir, daha sonra eklenip çıkarılamaz. Sistem ileride round-robin oturum planlaması yapacak.'
            : 'Sezon formatı açık katılımdır — her oturuma yeni oyuncu eklenebilir, ilk katıldığı oturumdan itibaren klasmana dahil olur.'}
        </p>
        <p style="color:var(--text-dim);font-size:0.88rem;line-height:1.5;margin-top:0.6rem">
          Oturum oluşturma ve klasman özellikleri bir sonraki dilimde eklenecek.
        </p>
      </div>
    </div>
  `;
}

// ── Render: oyuncular ─────────────────────────────────────────────
function renderPlayers() {
  const c = STATE.comp;
  if (!c) return;

  const banner = document.getElementById('players-banner');
  const addArea = document.getElementById('add-player-area');
  const list = document.getElementById('players-list');

  // Banner: format ve durum bilgisi
  let bannerHtml = '';
  if (c.type === 'league') {
    if (c.status === 'draft') {
      bannerHtml = `<div class="info-banner">
        <strong>Lig — kapalı kadro.</strong> Tüm oyuncuları şimdi ekle. Lig başladıktan sonra liste kilitlenir.
        ${STATE.players.length < 2 ? ' En az 2 oyuncu gerekli.' : ''}
      </div>`;
    } else {
      bannerHtml = `<div class="info-banner warn">
        Lig başladığı için kadro kilitli. Oyuncu eklenemez veya çıkarılamaz.
      </div>`;
    }
  } else {
    // sezon
    if (c.status === 'finished') {
      bannerHtml = `<div class="info-banner">Sezon bitti — kadro arşiv modunda.</div>`;
    } else {
      bannerHtml = `<div class="info-banner">
        <strong>Sezon — açık katılım.</strong> Yeni oyuncuyu istediğin zaman ekleyebilirsin; ilk katıldığı oturumdan itibaren klasmana dahil olur.
      </div>`;
    }
  }
  banner.innerHTML = bannerHtml;

  // Add form: lig için sadece draft, sezon için draft+running
  const canAdd =
    (c.type === 'league' && c.status === 'draft') ||
    (c.type === 'season' && c.status !== 'finished');
  addArea.style.display = canAdd ? 'flex' : 'none';

  // Liste
  if (!STATE.players.length) {
    list.innerHTML = `
      <div class="placeholder-block" style="padding:1.5rem 1rem">
        Henüz oyuncu eklenmedi.
        ${canAdd ? '<br/><span style="font-size:0.85rem">Yukarıdaki formdan başlayabilirsin.</span>' : ''}
      </div>`;
    return;
  }

  const canRemove =
    (c.type === 'league' && c.status === 'draft') ||
    (c.type === 'season' && c.status !== 'finished');

  list.innerHTML = STATE.players.map((p, i) => `
    <div class="player-row">
      <div>
        <div class="pname">
          <span style="color:var(--text-dim);min-width:1.8em;display:inline-block">${i + 1}.</span>
          ${escapeHtml(p.player_name || '?')}
          ${p.player_nickname ? `<span style="color:var(--text-dim);font-weight:400;margin-left:0.4rem">(${escapeHtml(p.player_nickname)})</span>` : ''}
        </div>
        <div class="pmeta">
          ${p.sessions_played || 0} oturum oynadı · ${p.total_points || 0} puan
          ${p.joined_session && p.joined_session > 1 ? ` · ${p.joined_session}. oturumdan itibaren` : ''}
        </div>
      </div>
      <div class="pactions">
        ${canRemove ? `
          <button class="danger" onclick="confirmRemove(${p.player_id}, '${escapeJsStr(p.player_name)}')">
            🗑️
          </button>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Player ekle ───────────────────────────────────────────────────
async function submitNewPlayer() {
  const nameEl = document.getElementById('np-name');
  const nickEl = document.getElementById('np-nickname');
  const name = (nameEl.value || '').trim();
  if (!name) {
    toast('Oyuncu adı zorunlu');
    return;
  }
  const nickname = (nickEl.value || '').trim();
  try {
    const res = await api.post(`/api/competitions/${STATE.id}/players`, { name, nickname });
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    nameEl.value = '';
    nickEl.value = '';
    nameEl.focus();
    toast('Eklendi ✓');
    await loadComp();   // sessions_count, players_count güncellensin
    await loadPlayers();
    renderHeader();
    renderPlayers();
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
  }
}
window.submitNewPlayer = submitNewPlayer;

// ── Player çıkar ──────────────────────────────────────────────────
function confirmRemove(playerId, name) {
  const c = STATE.comp;
  let msg = `"${name}" oyuncusunu çıkarmak istediğine emin misin?`;
  if (c && c.type === 'season' && (c.sessions_count || 0) > 0) {
    msg += '\n\nUYARI: Bu oyuncu daha önce oturum oynadıysa istatistikleri silinmez ama klasmandan düşer.';
  }
  if (!confirm(msg)) return;
  removePlayer(playerId);
}
window.confirmRemove = confirmRemove;

async function removePlayer(playerId) {
  try {
    const res = await api.del(`/api/competitions/${STATE.id}/players/${playerId}`);
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    toast('Çıkarıldı');
    await loadComp();
    await loadPlayers();
    renderHeader();
    renderPlayers();
    renderStandings();
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
  }
}

// ── Render: klasman ───────────────────────────────────────────────
function renderStandings() {
  const c = STATE.comp;
  if (!c) return;
  const banner = document.getElementById('standings-banner');
  const wrap = document.getElementById('standings-content');
  if (!banner || !wrap) return;

  const players = STATE.players || [];
  const sessionsDone = (STATE.sessions || []).filter(s => s.results_recorded).length;
  const sessionsTotal = (STATE.sessions || []).length;

  banner.innerHTML = `
    <div class="info-banner">
      ${sessionsDone > 0
        ? `<strong>${sessionsDone}</strong> oturum işlendi (toplam ${sessionsTotal}).
           Sıralama, oynanan oturumların birikimli sonucudur.`
        : 'Henüz hiçbir oturum sonucu klasmana işlenmedi. Bir oturumu bitirip Oturumlar sekmesinden "Sonuçları İşle"yi kullan.'}
    </div>
  `;

  if (!players.length) {
    wrap.innerHTML = `
      <div class="placeholder-block" style="padding:1.5rem 1rem">
        Henüz oyuncu yok. Önce Oyuncular sekmesinden havuza ekle.
      </div>`;
    return;
  }

  // Frontend sıralama: total_points DESC → sessions_played DESC → matches_won DESC → name ASC
  // (backend zaten total_points DESC döndürüyor, ama tiebreaker ve canlı veri için tekrar sırala)
  const ranked = [...players].sort((a, b) => {
    const pa = +a.total_points || 0, pb = +b.total_points || 0;
    if (pb !== pa) return pb - pa;
    const wa = +a.matches_won || 0, wb = +b.matches_won || 0;
    if (wb !== wa) return wb - wa;
    const la = (+a.legs_won || 0) - (+a.legs_lost || 0);
    const lb = (+b.legs_won || 0) - (+b.legs_lost || 0);
    if (lb !== la) return lb - la;
    return (a.player_name || '').localeCompare(b.player_name || '');
  });

  // Toplam oturum tamamen 0 ise sadece liste, istatistikler boş — yine de göster
  const hasAnyData = ranked.some(r => (+r.sessions_played || 0) > 0);

  wrap.innerHTML = `
    <div class="card" style="padding:0;overflow-x:auto">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="center">Sıra</th>
            <th>Oyuncu</th>
            <th class="center">Puan</th>
            <th class="center">Oyn.</th>
            <th class="center">🥇🥈🥉</th>
            <th class="center">Maç</th>
            <th class="center">Maç %</th>
            <th class="center">Leg</th>
            <th class="center">Leg %</th>
            <th class="center" title="3 ok ortalaması (sezon birikimli)">3DA</th>
            <th class="center" title="En yüksek çıkış (finish)">EYÇ</th>
            <th class="center" title="100-139 puanlık ziyaret sayısı">100+</th>
            <th class="center" title="140-179 puanlık ziyaret sayısı">140+</th>
            <th class="center" title="180 puanlık ziyaret sayısı">180</th>
          </tr>
        </thead>
        <tbody>
          ${ranked.map((p, i) => renderStandingsRow(p, i + 1)).join('')}
        </tbody>
      </table>
    </div>
    ${!hasAnyData ? '<p style="margin-top:0.6rem;color:var(--text-dim);font-size:0.85rem;text-align:center">Henüz hiç oturum oynanmadı — tüm satırlar 0 gösteriyor.</p>' : ''}
  `;
}

function renderStandingsRow(p, rank) {
  const pts       = +p.total_points || 0;
  const sp        = +p.sessions_played || 0;
  const mw        = +p.matches_won || 0;
  const ml        = +p.matches_lost || 0;
  const lw        = +p.legs_won || 0;
  const ll        = +p.legs_lost || 0;
  const first     = +p.first_place || 0;
  const second    = +p.second_place || 0;
  const third     = +p.third_place || 0;

  const matchTotal = mw + ml;
  const matchPct = matchTotal > 0 ? Math.round((mw / matchTotal) * 100) : null;
  const legTotal  = lw + ll;
  const legPct = legTotal > 0 ? Math.round((lw / legTotal) * 100) : null;

  // Atis istatistikleri (stats_json) — backend obje olarak donduruyor
  const stat = (p.stats_json && typeof p.stats_json === 'object') ? p.stats_json : {};
  const totalScore  = +stat.total_score   || 0;
  const dartsTotal  = +stat.darts_thrown  || 0;
  const avg3        = dartsTotal > 0 ? (totalScore / dartsTotal) * 3 : 0;
  const bestCheck   = +stat.best_checkout || 0;
  const hi100       = +stat.tons          || 0;  // 100-139
  const hi140       = +stat.ton_plus      || 0;  // 140-179
  const hi180       = +stat.one_eighty    || 0;  // 180

  const dim = v => v ? String(v) : '<span style="color:var(--text-dim)">·</span>';

  const rankClass = rank <= 3 ? `rank-${rank}` : '';
  const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';

  return `
    <tr>
      <td class="rank-cell ${rankClass} center">${rankIcon} ${rank}</td>
      <td>
        <div>${escapeHtml(p.player_name || '?')}</div>
        ${p.player_nickname ? `<div style="font-size:0.78rem;color:var(--text-dim)">${escapeHtml(p.player_nickname)}</div>` : ''}
      </td>
      <td class="center num points-cell">${pts}</td>
      <td class="center" style="color:var(--text-dim)">${sp}</td>
      <td class="center podium-cells" title="${first} birinci · ${second} ikinci · ${third} üçüncü">
        <span>${first || '·'}</span><span>${second || '·'}</span><span>${third || '·'}</span>
      </td>
      <td class="center num"><span style="font-variant-numeric:tabular-nums">${mw}-${ml}</span></td>
      <td class="center">${pctCell(matchPct)}</td>
      <td class="center num"><span style="font-variant-numeric:tabular-nums">${lw}-${ll}</span></td>
      <td class="center">${pctCell(legPct)}</td>
      <td class="center num" style="font-variant-numeric:tabular-nums">${dartsTotal > 0 ? avg3.toFixed(2) : '<span style=\"color:var(--text-dim)\">·</span>'}</td>
      <td class="center num" style="font-variant-numeric:tabular-nums">${dim(bestCheck)}</td>
      <td class="center num" style="font-variant-numeric:tabular-nums">${dim(hi100)}</td>
      <td class="center num" style="font-variant-numeric:tabular-nums">${dim(hi140)}</td>
      <td class="center num" style="font-variant-numeric:tabular-nums">${dim(hi180)}</td>
    </tr>
  `;
}

function pctCell(pct) {
  if (pct == null) return '<span style="color:var(--text-dim)">—</span>';
  return `
    <span style="display:inline-flex;align-items:center;gap:0.3rem">
      <span class="pct-bar"><span style="width:${pct}%"></span></span>
      <span style="font-variant-numeric:tabular-nums;font-size:0.85rem">${pct}%</span>
    </span>
  `;
}

// ── Render: oturumlar ─────────────────────────────────────────────
async function renderSessions() {
  const c = STATE.comp;
  if (!c) return;

  const banner = document.getElementById('sessions-banner');
  const list = document.getElementById('sessions-list');
  const newBtn = document.getElementById('new-session-btn');
  const canCreate = c.status !== 'finished' && STATE.players.length >= 2;

  // Lig plan mı var?
  if (c.type === 'league') {
    // Plan yoksa banner + "Planı Oluştur" göster
    if (!c.plan_generated) {
      const canPlan = c.status === 'draft' && STATE.players.length >= 2;
      banner.innerHTML = `
        <div class="info-banner">
          <strong>Lig planı henüz oluşturulmadı.</strong>
          ${STATE.players.length < 2
            ? '<span style="color:#ef4444"> En az 2 oyuncu ekledikten sonra plan üretilebilir.</span>'
            : `${STATE.players.length} oyuncu, ${c.meet_count || 1}× karşılaşma →
               <strong>${STATE.players.length % 2 === 0 ? STATE.players.length - 1 : STATE.players.length} round × ${c.meet_count || 1} = ${
                 ((STATE.players.length % 2 === 0 ? STATE.players.length - 1 : STATE.players.length)) * (c.meet_count || 1)
               } toplam round</strong> üretilecek.`
          }
          ${STATE.players.length >= 2 ? `
          <div style="color:var(--text-dim);font-size:0.82rem;margin-top:0.35rem">
            Plan üretilince otomatik bir "1. Gün" oturumu açılır ve tüm round'lar oraya bağlanır.
            İstediğin sırada başlatabilirsin; sonradan yeni gün açıp round taşıyabilirsin.
          </div>` : ''}
        </div>
        ${canPlan ? `<button class="primary" onclick="generateLeaguePlan()" style="margin-top:0.6rem">⚡ Planı Oluştur</button>` : ''}
      `;
      newBtn.style.display = 'none';
      list.innerHTML = `<div class="placeholder-block" style="padding:1.5rem 1rem">Plan oluşturulunca round'lar burada görünecek.</div>`;
      return;
    }

    // Plan var — schedule'ı yükle ve göster
    let schedule = STATE.schedule || [];
    if (!schedule.length) {
      try {
        const r = await api.get(`/api/competitions/${c.id}/schedule`);
        schedule = (r && r.schedule) ? r.schedule : [];
        STATE.schedule = schedule;
      } catch (_) { schedule = []; }
    }

    const totalRounds = schedule.length;
    const doneRounds  = schedule.filter(r => r.session_status === 'finished').length;
    const activeRounds = schedule.filter(r => r.session_status === 'running').length;
    const notStarted  = schedule.filter(r => !r.tournament_id).length;
    const unassigned  = schedule.filter(r => !r.session_id).length;

    banner.innerHTML = `
      <div class="info-banner">
        <strong>${doneRounds} / ${totalRounds}</strong> round tamamlandı.
        ${activeRounds > 0 ? `<span style="color:#4ade80"> · ${activeRounds} aktif</span>` : ''}
        ${notStarted > 0 ? `<span style="color:var(--text-dim)"> · ${notStarted} başlatılmadı</span>` : ''}
        ${unassigned > 0 ? `<span style="color:#f59e0b"> · ${unassigned} gün atanmamış</span>` : ''}
        ${STATE.players.length >= 2
          ? `<button class="danger" onclick="regeneratePlan()" style="margin-left:1rem;padding:0.2rem 0.6rem;font-size:0.8rem">🔄 Planı Yenile</button>`
          : ''}
        <div style="color:var(--text-dim);font-size:0.82rem;margin-top:0.35rem">
          Round'lar günlerin altında listelenir. Gün detayına gir, istediğin sırada başlat.
          Yeni gün ekleyip başlatılmamış round'ları oraya taşıyabilirsin.
        </div>
      </div>
    `;
    newBtn.textContent = '+ Yeni Gün';
    newBtn.style.display = canCreate ? '' : 'none';

    if (!STATE.sessions.length) {
      list.innerHTML = `
        <div class="placeholder-block" style="padding:1.5rem 1rem">
          Henüz gün oluşturulmadı.<br/>
          <span style="font-size:0.85rem">"+ Yeni Gün" butonu ile bir oturum günü ekle, sonra içinden roundları başlat.</span>
        </div>`;
      return;
    }

    // Oturum günlerini listele — her biri session.html'e link verir
    list.innerHTML = STATE.sessions.map(s => renderLeagueDayRow(s, schedule)).join('');
    return;
  }

  // Sezon akışı (değişmedi)
  const totalPlanned = c.planned_sessions || 0;
  const done = STATE.sessions.length;
  banner.innerHTML = `
    <div class="info-banner">
      Toplam <strong>${done} / ${totalPlanned}</strong> oturum.
      ${STATE.players.length < 2
        ? `<span style="color:#ef4444;font-weight:600">Oturum oluşturmak için en az 2 oyuncu havuzda olmalı.</span>`
        : `Yeni bir oturum başlatmak için yukarıdaki butonu kullan.`}
    </div>
  `;
  newBtn.style.display = canCreate ? '' : 'none';

  if (!STATE.sessions.length) {
    list.innerHTML = `<div class="placeholder-block" style="padding:1.5rem 1rem">Henüz oturum oluşturulmadı.</div>`;
    return;
  }
  list.innerHTML = STATE.sessions.map(s => renderSessionRow(s)).join('');
}

function renderRoundCard(round) {
  const status = round.session_status || 'planned';
  const isPlanned  = status === 'planned' || !round.session_id;
  const isActive   = status === 'running';
  const isFinished = status === 'finished';

  const statusColors = { planned: 'var(--text-dim)', running: '#4ade80', finished: 'var(--accent, #f59e0b)' };
  const statusLabels = { planned: 'Planlandı', running: '▶ Aktif', finished: '✓ Bitti' };
  const borderColor = isActive ? '#4ade80' : isFinished ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)';

  const pairsHtml = round.pairs.map(p =>
    `<div style="display:flex;gap:0.3rem;align-items:center;font-size:0.88rem">
      <span>${escapeHtml(p.p1_name || '?')}</span>
      <span style="color:var(--text-dim)">vs</span>
      <span>${escapeHtml(p.p2_name || '?')}</span>
    </div>`
  ).join('');

  // Butonlar
  let actions = '';
  if (round.session_id) {
    const sid = round.session_id;
    const tid = round.tournament_id;
    const results_recorded = STATE.sessions.find(s => s.id === sid)?.results_recorded || false;
    const canFinalize = isFinished && !results_recorded;
    if (isPlanned && !tid) {
      actions = `
        <button class="primary" onclick="startLeagueRound(${sid})" style="padding:0.35rem 0.7rem;font-size:0.82rem">
          ▶ Lig Roundu Başlat
        </button>
        <button onclick="startMiniTournament(${round.round_number})" style="padding:0.35rem 0.7rem;font-size:0.82rem;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:var(--text);cursor:pointer">
          🏆 Mini Turnuva
        </button>
      `;
    } else if (tid) {
      actions = `
        <a href="/session.html?id=${sid}" class="btn" style="text-decoration:none;display:inline-block;padding:0.35rem 0.7rem;border-radius:6px;font-size:0.82rem;background:rgba(255,255,255,0.08);color:var(--text)">
          ${isFinished ? '📊' : '🎯'} Oturum Detay
        </a>
        ${canFinalize ? `<button class="primary" onclick="openFinalizeModal(${sid})" style="padding:0.35rem 0.7rem;font-size:0.82rem;background:#16a34a">✓ Sonuçları İşle</button>` : ''}
      `;
    }
  }

  return `
    <div class="player-row" style="align-items:flex-start;flex-direction:column;gap:0.5rem;border-left:3px solid ${borderColor};padding-left:0.8rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;flex-wrap:wrap;gap:0.5rem">
        <div>
          <div class="pname" style="font-size:0.95rem">
            Round ${round.round_number}
            ${round.meeting_number > 1 ? `<span style="color:var(--text-dim);font-size:0.8rem;margin-left:0.4rem">(${round.meeting_number}. karşılaşma)</span>` : ''}
            <span style="margin-left:0.5rem;font-size:0.75rem;color:${statusColors[status] || 'var(--text-dim)'};font-weight:600">${statusLabels[status] || status}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:0.5rem 1.2rem;margin-top:0.3rem">${pairsHtml}</div>
        </div>
        <div class="pactions" style="flex-shrink:0">${actions}</div>
      </div>
    </div>
  `;
}

function renderSessionRow(s) {
  const tStatusLabels = {
    'draft': 'Bracket hazır, başlamadı',
    'running': 'Devam ediyor',
    'finished': 'Bitti',
  };
  const tStatus = s.tournament_status || (s.tournament_id ? 'draft' : 'planned');
  const tStatusLabel = tStatusLabels[tStatus] || tStatus;
  const statusColor = {
    'draft': 'var(--text-dim)',
    'running': '#4ade80',
    'finished': 'var(--accent, #f59e0b)',
  }[tStatus] || 'var(--text-dim)';

  const canDelete = !s.results_recorded;
  const canFinalize = tStatus === 'finished' && !s.results_recorded;
  const recorded = !!s.results_recorded;
  const dateStr = s.session_date ? formatDate(s.session_date) : '';

  return `
    <div class="player-row" style="align-items:flex-start;flex-direction:column;gap:0.4rem">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;flex-wrap:wrap;gap:0.4rem">
        <div>
          <div class="pname">
            <span style="color:var(--text-dim);min-width:1.8em;display:inline-block">${s.session_number}.</span>
            ${escapeHtml(s.name || `${s.session_number}. Oturum`)}
            ${recorded ? '<span style="margin-left:0.5rem;font-size:0.7rem;background:#16a34a;color:#fff;padding:0.1rem 0.5rem;border-radius:10px;font-weight:600">KLASMANDA</span>' : ''}
          </div>
          <div class="pmeta">
            ${dateStr ? `📅 ${dateStr} · ` : ''}👥 ${s.entries_count || 0} katılımcı
            · <span style="color:${statusColor}">● ${tStatusLabel}</span>
          </div>
        </div>
        <div class="pactions">
          ${canFinalize ? `<button class="primary" onclick="openFinalizeModal(${s.id})" style="padding:0.4rem 0.7rem;font-size:0.85rem;background:#16a34a">✓ Sonuçları İşle</button>` : ''}
          ${s.tournament_id ? `
            <a href="/session.html?id=${s.id}" class="btn" style="text-decoration:none;display:inline-block;padding:0.4rem 0.7rem;border-radius:6px;font-size:0.85rem;background:rgba(255,255,255,0.08);color:var(--text)">
              ${tStatus === 'finished' ? '📊 Detay' : tStatus === 'running' ? '🎯 Detay' : '▶ Başlat'}
            </a>
          ` : ''}
          ${canDelete ? `<button class="danger" onclick="confirmDeleteSession(${s.id}, '${escapeJsStr(s.name || s.session_number + '. Oturum')}')" style="padding:0.4rem 0.6rem;font-size:0.85rem">🗑️</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

// Lig için day-container satırı
function renderLeagueDayRow(s, schedule) {
  const linked   = (schedule || []).filter(r => r.session_id === s.id);
  const done     = linked.filter(r => r.session_status === 'finished').length;
  const active   = linked.filter(r => r.session_status === 'running').length;
  const recorded = linked.filter(r => r.results_recorded).length;
  const dateStr  = s.session_date ? formatDate(s.session_date) : '';
  const allRecorded = linked.length > 0 && recorded === linked.length;
  // Silmeye sadece hiçbir round başlatılmamışsa izin ver
  const anyStarted = linked.some(r => !!r.tournament_id);
  const canDelete = !anyStarted;

  let statusText = `${linked.length} round`;
  if (active > 0) statusText += ` · <span style="color:#4ade80">${active} aktif</span>`;
  else if (done === linked.length && linked.length > 0) statusText += ` · <span style="color:var(--accent, #f59e0b)">✓ Tüm round'lar bitti</span>`;
  else if (linked.length > 0) statusText += ` · ${done}/${linked.length} tamamlandı`;
  else statusText = `<span style="color:var(--text-dim)">Bu güne bağlı round yok</span>`;
  if (recorded > 0) statusText += ` · <span style="color:#16a34a">${recorded} klasmanda</span>`;

  return `
    <div class="player-row" style="align-items:flex-start;flex-direction:column;gap:0.3rem">
      <div style="display:flex;justify-content:space-between;align-items:center;width:100%;flex-wrap:wrap;gap:0.4rem">
        <div>
          <div class="pname">
            <span style="color:var(--text-dim);min-width:1.8em;display:inline-block">${s.session_number}.</span>
            ${escapeHtml(s.name || `${s.session_number}. Gün`)}
            ${allRecorded ? '<span style="margin-left:0.5rem;font-size:0.7rem;background:#16a34a;color:#fff;padding:0.1rem 0.5rem;border-radius:10px;font-weight:600">KLASMANDA</span>' : ''}
          </div>
          <div class="pmeta">
            ${dateStr ? `📅 ${dateStr} · ` : ''}${statusText}
          </div>
        </div>
        <div class="pactions">
          <a href="/session.html?id=${s.id}" class="btn" style="text-decoration:none;display:inline-block;padding:0.4rem 0.7rem;border-radius:6px;font-size:0.85rem;background:rgba(255,255,255,0.08);color:var(--text)">
            ${active > 0 ? '🎯 Round\'ları Gör' : (linked.length > 0 ? '▶ Round\'ları Başlat' : '⚙️ Detay')}
          </a>
          ${canDelete ? `<button class="danger" onclick="confirmDeleteSession(${s.id}, '${escapeJsStr(s.name || s.session_number + '. Gün')}')" style="padding:0.4rem 0.6rem;font-size:0.85rem">🗑️</button>` : ''}
        </div>
      </div>
    </div>
  `;
}

function formatDate(iso) {
  // YYYY-MM-DD → DD.MM.YYYY
  if (!iso) return '';
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

// ── Yeni oturum formu ─────────────────────────────────────────────
function toggleNewSessionForm() {
  const f = document.getElementById('new-session-form');
  const opening = f.style.display === 'none' || !f.style.display;
  f.style.display = opening ? 'block' : 'none';
  if (opening) {
    document.getElementById('ns-name').value = '';
    document.getElementById('ns-date').value = todayISO();
    document.getElementById('ns-round-info').textContent = '';

    const isLeague = STATE.comp && STATE.comp.type === 'league';
    const fmtRow = document.getElementById('ns-format-row');
    const fmtSpacer = document.getElementById('ns-format-row-spacer');
    const partSec = document.getElementById('ns-participants-section');
    if (isLeague) {
      // Lig: sadece ad + tarih, format ve katılımcı gizli
      if (fmtRow) fmtRow.style.display = 'none';
      if (fmtSpacer) fmtSpacer.style.display = 'none';
      if (partSec) partSec.style.display = 'none';
    } else {
      // Sezon: tam form
      if (fmtRow) fmtRow.style.display = '';
      if (fmtSpacer) fmtSpacer.style.display = '';
      if (partSec) partSec.style.display = '';
      document.getElementById('ns-format').value = 'single_elim';
      renderParticipantPicker();
    }
  }
}
window.toggleNewSessionForm = toggleNewSessionForm;

function todayISO() {
  const d = new Date();
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

function renderParticipantPicker() {
  const wrap = document.getElementById('ns-participants');
  if (!STATE.players.length) {
    wrap.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem;margin:0">Önce Oyuncular sekmesinden havuza oyuncu ekle.</p>';
    updateParticipantCount();
    return;
  }
  wrap.innerHTML = STATE.players.map(p => `
    <label style="display:flex;align-items:center;gap:0.5rem;padding:0.25rem 0.4rem;border-radius:6px;cursor:pointer;hover:background:rgba(255,255,255,0.03)">
      <input type="checkbox" class="ns-part-cb" value="${p.player_id}" checked onchange="updateParticipantCount()" />
      <span>${escapeHtml(p.player_name)}${p.player_nickname ? ` <span style="color:var(--text-dim);font-size:0.82rem">(${escapeHtml(p.player_nickname)})</span>` : ''}</span>
    </label>
  `).join('');
  updateParticipantCount();
}

function updateParticipantCount() {
  const cbs = document.querySelectorAll('.ns-part-cb');
  const checked = Array.from(cbs).filter(c => c.checked).length;
  const lbl = document.getElementById('ns-participant-count');
  if (lbl) lbl.textContent = `${checked} oyuncu seçili (en az 2 gerekli)`;
}
window.updateParticipantCount = updateParticipantCount;

function toggleAllParticipants(check) {
  document.querySelectorAll('.ns-part-cb').forEach(c => { c.checked = !!check; });
  updateParticipantCount();
}
window.toggleAllParticipants = toggleAllParticipants;

async function submitNewSession() {
  const name = document.getElementById('ns-name').value.trim();
  const session_date = document.getElementById('ns-date').value || null;
  const isLeague = STATE.comp && STATE.comp.type === 'league';

  let body;
  if (isLeague) {
    // Lig: sadece ad + tarih — server container session yaratır
    body = { name: name || null, session_date };
  } else {
    // Sezon: format + katılımcı gerekli
    const format = document.getElementById('ns-format').value;
    const ids = Array.from(document.querySelectorAll('.ns-part-cb:checked'))
      .map(c => +c.value);
    if (ids.length < 2) {
      toast('En az 2 katılımcı seçmelisin');
      return;
    }
    body = { name: name || null, session_date, format, participant_player_ids: ids };
  }

  // Submit butonunu devre dışı bırak (çift tıklama + takılma önlemi)
  const submitBtn = document.querySelector('#new-session-form button.primary');
  const origText = submitBtn ? submitBtn.textContent : '';
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Oluşturuluyor…'; }

  try {
    const res = await api.post(`/api/competitions/${STATE.id}/sessions`, body);
    if (res && res.error) {
      toast('Hata: ' + res.error, 4000);
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
      return;
    }
    toast('Oturum oluşturuldu ✓');
    document.getElementById('new-session-form').style.display = 'none';
    STATE.schedule = null; // schedule'ı tazele
    await loadComp();
    await loadSessions();
    renderHeader();
    await renderSessions();
    renderStandings();
  } catch (e) {
    console.error('[submitNewSession]', e);
    toast('Sunucu hatası: ' + (e.message || e), 4000);
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = origText; }
  }
}
window.submitNewSession = submitNewSession;

// ── Lig plan aksiyonları ──────────────────────────────────────────
async function generateLeaguePlan() {
  try {
    toast('Plan oluşturuluyor…');
    const res = await api.post(`/api/competitions/${STATE.id}/plan`, {});
    if (res && res.error) { toast('Hata: ' + res.error); return; }
    toast(`Plan oluşturuldu: ${res.rounds} round, ${res.matchups} eşleşme ✓`);
    STATE.schedule = null;
    await loadComp();
    await loadSessions();
    renderHeader();
    await renderSessions();
  } catch (e) { console.error(e); toast('Sunucu hatası'); }
}
window.generateLeaguePlan = generateLeaguePlan;

async function regeneratePlan() {
  if (!confirm('Plan yeniden oluşturulacak. Henüz başlatılmamış round oturumları silinir. Devam et?')) return;
  await generateLeaguePlan();
}
window.regeneratePlan = regeneratePlan;

// (startLeagueRound ve startMiniTournament session.html'e taşındı — artık kullanılmıyor)

function confirmDeleteSession(sid, name) {
  if (!confirm(`"${name}" oturumu silinsin mi? Bu işlem geri alınamaz.`)) return;
  deleteSessionAction(sid);
}
window.confirmDeleteSession = confirmDeleteSession;

async function deleteSessionAction(sid) {
  try {
    const res = await api.del(`/api/competitions/${STATE.id}/sessions/${sid}`);
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    toast('Silindi');
    await loadComp();
    await loadSessions();
    renderHeader();
    renderSessions();
    renderStandings();
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
  }
}

// ── Sonuçları işle: önizleme modalı ───────────────────────────────
async function openFinalizeModal(sid) {
  toast('Sıralama hesaplanıyor…');
  let preview;
  try {
    preview = await api.get(`/api/competitions/${STATE.id}/sessions/${sid}/preview`);
    if (preview && preview.error) {
      toast('Hata: ' + preview.error);
      return;
    }
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
    return;
  }

  if (preview.already_recorded) {
    toast('Bu oturumun sonuçları zaten klasmana işlendi.');
    return;
  }

  const standings = Array.isArray(preview.standings) ? preview.standings : [];
  if (!standings.length) {
    toast('Sıralama hesaplanamadı (boş)');
    return;
  }

  const confirmed = await showFinalizeModal(standings);
  if (!confirmed) return;

  // POST finalize
  try {
    const res = await api.post(`/api/competitions/${STATE.id}/sessions/${sid}/finalize`, {});
    if (res && res.error) {
      toast('Hata: ' + res.error);
      return;
    }
    toast(`Klasmana işlendi (${res.recorded || standings.length} oyuncu) ✓`);
    await loadComp();
    await loadPlayers();
    await loadSessions();
    renderHeader();
    renderPlayers();
    renderSessions();
    renderStandings();
  } catch (e) {
    console.error(e);
    toast('Sunucu hatası');
  }
}
window.openFinalizeModal = openFinalizeModal;

// ── Excel raporu indir (Dilim 5a) ──────────────────────────────────
function downloadReport() {
  const c = STATE.comp;
  if (!c || !c.id) {
    toast('Yarışma yüklenmedi');
    return;
  }
  // Yeni sekmede aç → tarayıcı dosyayı indirir, mevcut sayfa yerinde kalır
  const url = `/api/competitions/${c.id}/report.xlsx`;
  const a = document.createElement('a');
  a.href = url;
  a.rel = 'noopener';
  // download attribute server-side Content-Disposition ile zaten gelir;
  // burada sadece yedek olarak dosya adı ipucu veriyoruz
  a.download = `${(c.name || 'yarisma').replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_\-]/g, '_')}-${c.id}.xlsx`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => a.remove(), 1500);
}
window.downloadReport = downloadReport;

function showFinalizeModal(standings) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      padding:1rem;
    `;
    overlay.innerHTML = `
      <div style="background:var(--bg, #1a1a1a);border:1px solid var(--border, rgba(255,255,255,0.1));border-radius:12px;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border, rgba(255,255,255,0.08))">
          <h3 style="margin:0">Sonuçları Klasmana İşle</h3>
          <p style="margin:0.3rem 0 0 0;color:var(--text-dim);font-size:0.85rem">
            Aşağıdaki sıralama otomatik hesaplandı. Onaylarsan klasmana işlenir ve geri alınamaz.
          </p>
        </div>
        <div style="padding:0.6rem 1.2rem;overflow-y:auto;flex:1">
          <table style="width:100%;font-size:0.9rem;border-collapse:collapse">
            <thead>
              <tr style="border-bottom:1px solid var(--border, rgba(255,255,255,0.08));text-align:left">
                <th style="padding:0.4rem 0.3rem;width:50px">Sıra</th>
                <th style="padding:0.4rem 0.3rem">Oyuncu</th>
                <th style="padding:0.4rem 0.3rem;text-align:center;width:60px">G-M</th>
                <th style="padding:0.4rem 0.3rem;text-align:right;width:70px">Puan</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map(r => `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.04)">
                  <td style="padding:0.45rem 0.3rem;font-weight:600;color:${r.position <= 3 ? 'var(--accent, #f59e0b)' : 'var(--text)'}">
                    ${podiumIcon(r.position)} ${r.position}.
                  </td>
                  <td style="padding:0.45rem 0.3rem">
                    ${escapeHtml(r.player_name)}
                    ${r.p2_player_name ? ` / ${escapeHtml(r.p2_player_name)}` : ''}
                  </td>
                  <td style="padding:0.45rem 0.3rem;text-align:center;color:var(--text-dim);font-size:0.82rem">
                    ${r.wins || 0}-${r.losses || 0}
                  </td>
                  <td style="padding:0.45rem 0.3rem;text-align:right;font-weight:600">
                    +${r.points}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        <div style="padding:0.8rem 1.2rem;border-top:1px solid var(--border, rgba(255,255,255,0.08));display:flex;justify-content:flex-end;gap:0.5rem">
          <button id="fz-cancel">Vazgeç</button>
          <button id="fz-confirm" class="primary" style="background:#16a34a">Klasmana İşle</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const close = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler, true);
      resolve(val);
    };
    overlay.querySelector('#fz-cancel').onclick = () => close(false);
    overlay.querySelector('#fz-confirm').onclick = () => close(true);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
    const keyHandler = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    document.addEventListener('keydown', keyHandler, true);
  });
}

function podiumIcon(pos) {
  if (pos === 1) return '🥇';
  if (pos === 2) return '🥈';
  if (pos === 3) return '🥉';
  return '';
}

// ── Sekmeler ──────────────────────────────────────────────────────
function bindTabs() {
  document.querySelectorAll('#ctab-bar button').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-ctab');
      document.querySelectorAll('#ctab-bar button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('section.ctab').forEach(s => {
        s.hidden = (s.getAttribute('data-ctab') !== tab);
      });
    });
  });
}

// ── Yardımcılar ───────────────────────────────────────────────────
function escapeHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeJsStr(s) {
  if (s == null) return '';
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// Enter ile oyuncu ekle
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const active = document.activeElement;
  if (!active) return;
  if (active.id === 'np-name' || active.id === 'np-nickname') {
    e.preventDefault();
    submitNewPlayer();
  }
});

boot();
