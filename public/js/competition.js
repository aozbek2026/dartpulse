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
  // Yeni tur-bazlı anahtarlar; eski sezonlar için pozisyon anahtarlarına düş.
  const STAGE_LABELS = [
    ['birinci', 'Birinci'], ['final', 'Final (ikinci)'], ['yari_final', 'Yarı final'],
    ['ceyrek_final', 'Çeyrek final'], ['son_16', 'Son 16'], ['son_32', 'Son 32'],
    ['son_64', 'Son 64'], ['son_128', 'Son 128'], ['son_256', 'Son 256'],
  ];
  let ptsRows = STAGE_LABELS
    .filter(([k]) => pts[k] !== undefined)
    .map(([k, lbl]) => `<tr><td>${lbl}</td><td>${pts[k]} puan</td></tr>`).join('');
  let ptsHeader = 'Tur';
  if (!ptsRows) {
    ptsRows = ['1','2','3','4','5','6','7','8']
      .filter(k => pts[k] !== undefined)
      .map(k => `<tr><td>${k}.</td><td>${pts[k]} puan</td></tr>`).join('');
    ptsHeader = 'Pozisyon';
  }
  const defaultPts = pts['default'] != null ? pts['default'] : 0;

  document.getElementById('overview-content').innerHTML = `
    <div class="card" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;align-items:start">
      <div>
        <h3 style="margin-top:0">Puan Sistemi</h3>
        ${ptsRows ? `
        <table style="width:100%;font-size:0.9rem">
          <thead><tr><th style="text-align:left">${ptsHeader}</th><th style="text-align:left">Puan</th></tr></thead>
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

  // Dilim 5c-1: Ustalar (Masters) oturumu rozeti
  const mastersBadge = s.is_masters
    ? '<span style="margin-left:0.5rem;font-size:0.7rem;background:linear-gradient(135deg,#facc15,#f59e0b);color:#000;padding:0.1rem 0.55rem;border-radius:10px;font-weight:700">🏆 USTALAR</span>'
    : '';

  return `
    <div class="player-row" style="align-items:flex-start;flex-direction:column;gap:0.4rem${s.is_masters ? ';border-left:3px solid #f59e0b;padding-left:0.7rem' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;width:100%;flex-wrap:wrap;gap:0.4rem">
        <div>
          <div class="pname">
            <span style="color:var(--text-dim);min-width:1.8em;display:inline-block">${s.session_number}.</span>
            ${escapeHtml(s.name || `${s.session_number}. Oturum`)}
            ${mastersBadge}
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
    const masterSec = document.getElementById('ns-masters-section');
    if (isLeague) {
      // Lig: sadece ad + tarih, format/katılımcı/Ustalar gizli
      if (fmtRow) fmtRow.style.display = 'none';
      if (fmtSpacer) fmtSpacer.style.display = 'none';
      if (partSec) partSec.style.display = 'none';
      if (masterSec) masterSec.style.display = 'none';
    } else {
      // Sezon: tam form (Ustalar bölümü dahil)
      if (fmtRow) fmtRow.style.display = '';
      if (fmtSpacer) fmtSpacer.style.display = '';
      if (partSec) partSec.style.display = '';
      if (masterSec) masterSec.style.display = '';
      document.getElementById('ns-format').value = 'single_elim';
      renderParticipantPicker();
      // Ustalar bölümünü sıfırla (kapalı başlasın)
      const cb = document.getElementById('ns-is-masters');
      if (cb) cb.checked = false;
      const pts = document.getElementById('ns-masters-points');
      if (pts) pts.style.display = 'none';
      const roster = document.getElementById('ns-masters-roster');
      if (roster) roster.style.display = 'none';
      STATE.mastersRoster = [];
      renderMastersGrid();
    }
  }
}
window.toggleNewSessionForm = toggleNewSessionForm;

// ── Ustalar (Masters) puan tablosu ────────────────────────────────
// Ulaşılan tur için input grid'i render eder. Varsayılan değerler
// sezon puanının yaklaşık 2 katı (federasyon mantığı: Ustalar = sezonun
// son oturumu, daha yüksek puan dağıtır).
// Anahtarlar server.js'teki positionToStage ile birebir aynıdır.
const MASTERS_STAGES = [
  { key: 'birinci',      label: 'Birinci',        def: 40 },
  { key: 'final',        label: 'Final (ikinci)', def: 30 },
  { key: 'yari_final',   label: 'Yarı final',     def: 22 },
  { key: 'ceyrek_final', label: 'Çeyrek final',   def: 16 },
  { key: 'son_16',       label: 'Son 16',         def: 10 },
  { key: 'son_32',       label: 'Son 32',         def: 6 },
  { key: 'son_64',       label: 'Son 64',         def: 4 },
  { key: 'son_128',      label: 'Son 128',        def: 2 },
  { key: 'son_256',      label: 'Son 256',        def: 2 },
];
function renderMastersGrid() {
  const grid = document.getElementById('ns-masters-grid');
  if (!grid) return;
  const base = (STATE.comp && STATE.comp.points_json) || {};
  let html = '';
  for (const st of MASTERS_STAGES) {
    const baseVal = base[st.key] != null ? +base[st.key] : null;
    const sugg = baseVal != null ? Math.max(baseVal * 2, st.def) : st.def;
    html += `
      <div style="display:flex;align-items:center;gap:0.4rem">
        <label style="font-size:0.82rem;color:var(--text-dim);min-width:78px">${st.label}</label>
        <input type="number" class="ns-masters-pt" data-pos="${st.key}" min="0" step="1" value="${sugg}" style="width:65px" />
      </div>
    `;
  }
  grid.innerHTML = html;
  const defInput = document.getElementById('ns-masters-default');
  if (defInput) {
    const baseDef = base['default'] != null ? +base['default'] : 1;
    defInput.value = Math.max(baseDef * 2, 2);
  }
}

// Ustalar modu açılınca: puan tablosu + roster göster, normal katılımcı listesi gizle.
// Kapanınca: tersine.
function toggleMastersMode() {
  const cb = document.getElementById('ns-is-masters');
  const ptsBlock = document.getElementById('ns-masters-points');
  const rosterBlock = document.getElementById('ns-masters-roster');
  const regularPart = document.getElementById('ns-participants-section');
  if (!cb) return;
  if (ptsBlock) ptsBlock.style.display = cb.checked ? 'block' : 'none';
  if (rosterBlock) rosterBlock.style.display = cb.checked ? 'block' : 'none';
  if (regularPart) regularPart.style.display = cb.checked ? 'none' : '';
  if (cb.checked) {
    renderMastersGrid();
    initMastersRoster();
  }
}
window.toggleMastersMode = toggleMastersMode;

// Form'dan Ustalar puan tablosunu çıkarır: { "1": 20, "2": 14, ..., "default": 2 }
function readMastersPoints() {
  const obj = {};
  document.querySelectorAll('.ns-masters-pt').forEach(inp => {
    const pos = inp.dataset.pos;
    const v = +inp.value;
    if (Number.isFinite(v) && v >= 0) obj[pos] = v;
  });
  const defEl = document.getElementById('ns-masters-default');
  const defV = defEl ? +defEl.value : NaN;
  if (Number.isFinite(defV) && defV >= 0) obj['default'] = defV;
  return obj;
}

// ── Ustalar katılımcı roster'ı (top-N + manuel swap/remove) ──────
// STATE.mastersRoster: [player_id, player_id, ...] — gönderilecek katılımcı listesi
function initMastersRoster() {
  const pool = (STATE.players || []).slice();
  if (!pool.length) {
    STATE.mastersRoster = [];
    document.getElementById('ns-masters-pool-info').textContent = 'Havuzda oyuncu yok — önce Oyuncular sekmesinden ekle';
    document.getElementById('ns-masters-roster-list').innerHTML = '';
    document.getElementById('ns-masters-roster-count').textContent = '';
    return;
  }
  // N varsayılan: 8 ama havuzdan büyükse havuz boyutu
  const nInput = document.getElementById('ns-masters-n');
  let n = +nInput.value || 8;
  if (n > pool.length) n = pool.length;
  if (n < 2) n = Math.min(2, pool.length);
  nInput.value = n;
  nInput.max = pool.length;

  // Klasman sırası (total_points DESC, tiebreaker: matches_won, sessions_played, name)
  const sorted = pool.slice().sort((a, b) => {
    const ap = +a.total_points || 0, bp = +b.total_points || 0;
    if (ap !== bp) return bp - ap;
    const aw = +a.matches_won || 0, bw = +b.matches_won || 0;
    if (aw !== bw) return bw - aw;
    const as = +a.sessions_played || 0, bs = +b.sessions_played || 0;
    if (as !== bs) return bs - as;
    return String(a.player_name || '').localeCompare(String(b.player_name || ''), 'tr');
  });
  STATE.mastersRoster = sorted.slice(0, n).map(p => p.player_id);
  renderMastersRoster();
}

function onMastersNChange() {
  // N değişince roster top-N'den yeniden hesaplanır (manuel swap'lar sıfırlanır)
  initMastersRoster();
}
window.onMastersNChange = onMastersNChange;

function renderMastersRoster() {
  const listEl = document.getElementById('ns-masters-roster-list');
  const countEl = document.getElementById('ns-masters-roster-count');
  const poolInfo = document.getElementById('ns-masters-pool-info');
  if (!listEl) return;
  const pool = STATE.players || [];
  const byId = new Map(pool.map(p => [p.player_id, p]));
  // "Manuel" = otomatik top-N'de olmayan oyuncu (swap göstergesi için)
  const sorted = pool.slice().sort((a, b) => (+b.total_points || 0) - (+a.total_points || 0));
  const autoTopN = new Set(sorted.slice(0, STATE.mastersRoster.length).map(p => p.player_id));

  if (poolInfo) poolInfo.textContent = `(Havuzda ${pool.length} oyuncu var)`;
  const rows = STATE.mastersRoster.map((pid, idx) => {
    const p = byId.get(pid);
    const name = p ? p.player_name : `(silinmiş #${pid})`;
    const pts = p ? (+p.total_points || 0) : 0;
    const isManual = !autoTopN.has(pid);
    return `
      <div class="ns-masters-row" data-idx="${idx}" style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.5rem;background:rgba(255,255,255,0.02);border-radius:6px">
        <span style="min-width:2em;color:var(--text-dim);font-size:0.85rem">${idx + 1}.</span>
        <span style="flex:1;font-size:0.9rem">${escapeHtml(name)}${p && p.player_nickname ? ` <span style="color:var(--text-dim);font-size:0.8rem">(${escapeHtml(p.player_nickname)})</span>` : ''}</span>
        <span style="font-size:0.78rem;color:var(--text-dim);min-width:5em;text-align:right">${pts} puan</span>
        ${isManual ? '<span style="font-size:0.7rem;background:#3b82f6;color:#fff;padding:0.1rem 0.4rem;border-radius:8px">manuel</span>' : ''}
        <button onclick="swapMastersSlot(${idx})" style="font-size:0.75rem;padding:0.2rem 0.5rem">Değiştir</button>
        <button class="danger" onclick="removeMastersSlot(${idx})" style="font-size:0.75rem;padding:0.2rem 0.5rem">Çıkar</button>
      </div>
    `;
  });
  listEl.innerHTML = rows.join('') || '<p style="color:var(--text-dim);font-size:0.85rem;margin:0">Liste boş — sayıyı artır veya oyuncu ekle</p>';
  if (countEl) countEl.textContent = `Toplam: ${STATE.mastersRoster.length} katılımcı`;
}

function swapMastersSlot(idx) {
  // Bu slot'u dropdown'a dönüştür — pool'dan rosterde olmayanları göster
  const row = document.querySelector(`.ns-masters-row[data-idx="${idx}"]`);
  if (!row) return;
  const usedSet = new Set(STATE.mastersRoster);
  usedSet.delete(STATE.mastersRoster[idx]); // bu slot'un kendisi seçilebilir kalsın
  const available = (STATE.players || []).filter(p => !usedSet.has(p.player_id));
  const opts = available.map(p =>
    `<option value="${p.player_id}" ${p.player_id === STATE.mastersRoster[idx] ? 'selected' : ''}>${escapeHtml(p.player_name)} (${(+p.total_points || 0)} puan)</option>`
  ).join('');
  row.innerHTML = `
    <span style="min-width:2em;color:var(--text-dim);font-size:0.85rem">${idx + 1}.</span>
    <select class="ns-masters-swap-sel" style="flex:1;font-size:0.88rem">${opts}</select>
    <button class="primary" onclick="applyMastersSwap(${idx})" style="font-size:0.75rem;padding:0.2rem 0.6rem">Kaydet</button>
    <button onclick="renderMastersRoster()" style="font-size:0.75rem;padding:0.2rem 0.5rem">Vazgeç</button>
  `;
}
window.swapMastersSlot = swapMastersSlot;

function applyMastersSwap(idx) {
  const row = document.querySelector(`.ns-masters-row[data-idx="${idx}"]`);
  if (!row) return;
  const sel = row.querySelector('.ns-masters-swap-sel');
  if (!sel) return;
  const newId = +sel.value;
  if (!Number.isFinite(newId) || newId <= 0) { toast('Geçersiz oyuncu'); return; }
  if (STATE.mastersRoster.includes(newId) && STATE.mastersRoster[idx] !== newId) {
    toast('Bu oyuncu zaten listede');
    return;
  }
  STATE.mastersRoster[idx] = newId;
  renderMastersRoster();
}
window.applyMastersSwap = applyMastersSwap;

function removeMastersSlot(idx) {
  if (STATE.mastersRoster.length <= 2) {
    toast('Ustalar için en az 2 oyuncu gerekli');
    return;
  }
  STATE.mastersRoster.splice(idx, 1);
  // N input'unu da güncelle
  const nInput = document.getElementById('ns-masters-n');
  if (nInput) nInput.value = STATE.mastersRoster.length;
  renderMastersRoster();
}
window.removeMastersSlot = removeMastersSlot;

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
  invalidateSeedDraft();
}
window.updateParticipantCount = updateParticipantCount;

function toggleAllParticipants(check) {
  document.querySelectorAll('.ns-part-cb').forEach(c => { c.checked = !!check; });
  updateParticipantCount();
}
window.toggleAllParticipants = toggleAllParticipants;

// ── Kura & Seri Başı (sezon oturumu) ──────────────────────────────
// STATE.seedDraft: null = panel kapalı (havuz sırası kullanılır)
//                  [{player_id, seed}] = organizatör sıraladı/seri başı verdi
// Yeni turnuva modülündeki (organizer.js) drawLots + seri başı mantığının
// sezon oturumu formuna uyarlamasıdır.

function checkedParticipantIds() {
  return Array.from(document.querySelectorAll('.ns-part-cb:checked')).map(c => +c.value);
}

// Panel açıkken katılımcı seçimi değişirse taslağı geçersiz say (eski sıra kalmasın)
function invalidateSeedDraft() {
  if (!STATE.seedDraft) return;
  STATE.seedDraft = null;
  const list = document.getElementById('ns-seed-list');
  const shuf = document.getElementById('ns-seed-shuffle-btn');
  const reset = document.getElementById('ns-seed-reset-btn');
  const open = document.getElementById('ns-seed-open-btn');
  if (list) { list.style.display = 'none'; list.innerHTML = ''; }
  if (shuf) shuf.style.display = 'none';
  if (reset) reset.style.display = 'none';
  if (open) open.textContent = '🎲 Düzenle';
}

function openSeedDraft() {
  const ids = checkedParticipantIds();
  if (ids.length < 2) { toast('Önce en az 2 katılımcı seç'); return; }
  const byId = new Map((STATE.players || []).map(p => [p.player_id, p]));
  // Mevcut taslak varsa seçili olanları koruyup seed'leri sakla, yenileri sona ekle
  const prevSeed = new Map((STATE.seedDraft || []).map(d => [d.player_id, d.seed]));
  STATE.seedDraft = ids
    .map(id => ({ player_id: id, seed: prevSeed.has(id) ? prevSeed.get(id) : null }))
    .filter(d => byId.has(d.player_id));
  document.getElementById('ns-seed-shuffle-btn').style.display = '';
  document.getElementById('ns-seed-reset-btn').style.display = '';
  document.getElementById('ns-seed-open-btn').textContent = '🔄 Yenile';
  document.getElementById('ns-seed-list').style.display = 'block';
  renderSeedDraft();
}
window.openSeedDraft = openSeedDraft;

function resetSeedDraft() {
  if (!STATE.seedDraft) return;
  const ids = checkedParticipantIds();
  STATE.seedDraft = ids.map(id => ({ player_id: id, seed: null }));
  renderSeedDraft();
  toast('Sıra havuz sırasına döndü');
}
window.resetSeedDraft = resetSeedDraft;

// Seri başı verilmeyenleri Fisher-Yates ile karıştır, seri başlılar (seed'e göre sıralı) önde kalsın
function drawSeedLots() {
  if (!STATE.seedDraft) { openSeedDraft(); }
  if (!STATE.seedDraft) return;
  const seeded = STATE.seedDraft.filter(d => d.seed).sort((a, b) => a.seed - b.seed);
  const unseeded = STATE.seedDraft.filter(d => !d.seed);
  for (let i = unseeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
  }
  STATE.seedDraft = [...seeded, ...unseeded];
  renderSeedDraft();
  toast('Kura çekildi — seri başları yerinde, diğerleri karıştırıldı');
}
window.drawSeedLots = drawSeedLots;

function renderSeedDraft() {
  const host = document.getElementById('ns-seed-list');
  if (!host || !STATE.seedDraft) return;
  const byId = new Map((STATE.players || []).map(p => [p.player_id, p]));
  host.innerHTML = STATE.seedDraft.map((d, i) => {
    const p = byId.get(d.player_id);
    const name = p ? p.player_name : `(silinmiş #${d.player_id})`;
    const nick = p && p.player_nickname ? ` <span style="color:var(--text-dim);font-size:0.78rem">(${escapeHtml(p.player_nickname)})</span>` : '';
    return `
      <div class="ns-seed-row" draggable="true" data-idx="${i}"
           ondragstart="seedDragStart(event, ${i})" ondragover="seedDragOver(event)"
           ondrop="seedDrop(event, ${i})" ondragend="seedDragEnd(event)"
           style="display:flex;align-items:center;gap:0.5rem;padding:0.3rem 0.4rem;border-radius:6px;background:rgba(255,255,255,0.02);margin-bottom:0.3rem">
        <span style="cursor:grab;color:var(--text-dim);min-width:2.6em;font-size:0.85rem" title="Sürükle">⠿ ${i + 1}.</span>
        <span style="flex:1;font-size:0.9rem">${escapeHtml(name)}${nick}</span>
        <input type="number" min="1" placeholder="Seri başı" title="Seri başı (opsiyonel)"
               value="${d.seed || ''}" onchange="updateSeedValue(${i}, this.value)"
               style="width:84px;font-size:0.82rem" />
      </div>`;
  }).join('');
}

function updateSeedValue(idx, val) {
  if (!STATE.seedDraft || !STATE.seedDraft[idx]) return;
  const n = parseInt(val, 10);
  STATE.seedDraft[idx].seed = (n && n >= 1) ? n : null;
}
window.updateSeedValue = updateSeedValue;

// Sürükle-bırak sıralama
function seedDragStart(e, idx) {
  STATE.seedDragIdx = idx;
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
}
function seedDragOver(e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; }
function seedDrop(e, idx) {
  e.preventDefault();
  const from = STATE.seedDragIdx;
  if (from == null || from === idx || !STATE.seedDraft) return;
  const moved = STATE.seedDraft.splice(from, 1)[0];
  STATE.seedDraft.splice(idx, 0, moved);
  STATE.seedDragIdx = null;
  renderSeedDraft();
}
function seedDragEnd() { STATE.seedDragIdx = null; }
window.seedDragStart = seedDragStart;
window.seedDragOver = seedDragOver;
window.seedDrop = seedDrop;
window.seedDragEnd = seedDragEnd;

async function submitNewSession() {
  const name = document.getElementById('ns-name').value.trim();
  const session_date = document.getElementById('ns-date').value || null;
  const isLeague = STATE.comp && STATE.comp.type === 'league';

  let body;
  if (isLeague) {
    // Lig: sadece ad + tarih — server container session yaratır
    body = { name: name || null, session_date };
  } else {
    // Sezon: format gerekli; katılımcı kaynağı Ustalar mı normal mi'ye göre değişir
    const format = document.getElementById('ns-format').value;
    const isMastersCb = document.getElementById('ns-is-masters');
    const isMasters = !!(isMastersCb && isMastersCb.checked);

    let ids;
    if (isMasters) {
      // Ustalar: roster'dan al
      ids = Array.isArray(STATE.mastersRoster) ? STATE.mastersRoster.slice() : [];
    } else {
      // Normal: checkbox listesinden al
      ids = Array.from(document.querySelectorAll('.ns-part-cb:checked')).map(c => +c.value);
    }
    if (ids.length < 2) {
      toast(isMasters ? 'Ustalar için en az 2 oyuncu gerekli' : 'En az 2 katılımcı seçmelisin');
      return;
    }
    body = { name: name || null, session_date, format, participant_player_ids: ids };

    // Kura & Seri Başı taslağı varsa ve seçili oyuncularla birebir eşleşiyorsa,
    // sıralı + seed'li entries gönder (server bunu participant_player_ids yerine kullanır).
    if (!isMasters && Array.isArray(STATE.seedDraft) && STATE.seedDraft.length === ids.length) {
      const draftIds = STATE.seedDraft.map(d => d.player_id);
      const sameSet = draftIds.length === ids.length &&
        new Set([...draftIds, ...ids]).size === ids.length;
      if (sameSet) {
        body.entries = STATE.seedDraft.map(d => ({
          player_id: d.player_id,
          seed: (d.seed && d.seed >= 1) ? d.seed : null,
        }));
      }
    }

    if (isMasters) {
      const pts = readMastersPoints();
      if (Object.keys(pts).length === 0) {
        toast('Ustalar puan tablosu boş — en az Birinci puanını gir');
        return;
      }
      body.is_masters = true;
      body.points_override_json = pts;
    }
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

  const confirmed = await showFinalizeModal(standings, { isMasters: !!preview.is_masters });
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

function showFinalizeModal(standings, opts) {
  opts = opts || {};
  const isMasters = !!opts.isMasters;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,0.6);
      display:flex;align-items:center;justify-content:center;
      padding:1rem;
    `;
    overlay.innerHTML = `
      <div style="background:var(--bg, #1a1a1a);border:1px solid ${isMasters ? '#f59e0b' : 'var(--border, rgba(255,255,255,0.1))'};border-radius:12px;max-width:520px;width:100%;max-height:85vh;display:flex;flex-direction:column;overflow:hidden">
        <div style="padding:1rem 1.2rem;border-bottom:1px solid var(--border, rgba(255,255,255,0.08))${isMasters ? ';background:linear-gradient(135deg,rgba(250,204,21,0.08),rgba(245,158,11,0.04))' : ''}">
          <h3 style="margin:0">${isMasters ? '🏆 Ustalar — Sonuçları Klasmana İşle' : 'Sonuçları Klasmana İşle'}</h3>
          <p style="margin:0.3rem 0 0 0;color:var(--text-dim);font-size:0.85rem">
            ${isMasters
              ? 'Bu Ustalar oturumu — özel (yüksek) puan tablosu uygulanır. Onaylarsan klasmana işlenir ve geri alınamaz.'
              : 'Aşağıdaki sıralama otomatik hesaplandı. Onaylarsan klasmana işlenir ve geri alınamaz.'}
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
