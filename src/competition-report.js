// src/competition-report.js
// Lig / Sezon için Excel (.xlsx) raporu üretir.
// SheetJS (xlsx) paketini kullanır — saf JS, native bağımlılık yok.
//
// Sekmeler:
//   1. Özet              — competition meta + puan tablosu
//   2. Klasman           — birikimli oyuncu istatistikleri (competition_players)
//   3. Oturum Sonuçları  — her oturum × her oyuncu için pozisyon + puan
//   4. Maç İstatistikleri — her oturum için tournamentPlayerReport (3DA, 180, vs.)
//
// Kullanım:
//   const buf = buildCompetitionWorkbook(competitionId, userId);
//   res.send(buf);

// xlsx paketi opsiyonel — kurulu değilse server crash etmesin,
// sadece Excel endpoint'i çağrıldığında temiz bir hata döner.
// Kurulum: `npm install xlsx`
let XLSX = null;
try { XLSX = require('xlsx'); }
catch (e) {
  console.warn('[competition-report] xlsx paketi kurulu değil. `npm install` çalıştırın. Excel raporu devre dışı.');
}

const db = require('./db');
const tournament = require('./tournament');

// ── Yardımcı: güvenli JSON parse ───────────────────────────────────
function safeParse(txt) {
  if (!txt) return null;
  try { return JSON.parse(txt); } catch { return null; }
}

// ── Yardımcı: yüzde formatla ───────────────────────────────────────
function pct(num, den) {
  if (!den || den <= 0) return 0;
  return Math.round((num / den) * 100);
}

// ── Yardımcı: tip etiketi ──────────────────────────────────────────
const TYPE_LABEL = { season: 'Sezon', league: 'Lig' };
const STATUS_LABEL = { draft: 'Taslak', running: 'Aktif', finished: 'Bitti', pending: 'Bekliyor' };
const FORMAT_LABEL = {
  single_elim: 'Tek Eleme',
  double_elim: 'Çift Eleme',
  round_robin: 'Round Robin',
};

// ── 1. Özet sekmesi ────────────────────────────────────────────────
function buildOzetSheet(comp, sessions, players) {
  const points = safeParse(comp.points_json) || {};
  const defaultPts = points['default'] != null ? +points['default'] : 0;

  // Pozisyon -> puan satırları (1, 2, 3, ... sıralı; ardından "Diğerleri")
  const ptsRows = [];
  const keys = Object.keys(points).filter(k => k !== 'default').map(k => +k).filter(n => !isNaN(n)).sort((a, b) => a - b);
  for (const k of keys) {
    ptsRows.push([`${k}.`, +points[String(k)]]);
  }
  ptsRows.push(['Diğerleri', defaultPts]);

  const finishedSessions = sessions.filter(s => s.status === 'finished').length;
  const teamLabel = comp.team_mode === 'doubles' ? 'Eşli' : 'Bireysel';
  const legsBo = (comp.legs_to_win || 2) * 2 - 1;
  const setsBo = (comp.sets_to_win || 1) * 2 - 1;
  const formatStr = setsBo > 1 ? `Bo${legsBo} leg · Bo${setsBo} set` : `Bo${legsBo} leg`;

  const aoa = [
    ['Dart Core Pro — Yarışma Raporu'],
    [],
    ['Ad', comp.name || ''],
    ['Tip', TYPE_LABEL[comp.type] || comp.type || ''],
    ['Kategori', comp.category || '-'],
    ['Durum', STATUS_LABEL[comp.status] || comp.status || ''],
    ['Oyun Modu', comp.game_mode || '501'],
    ['Takım Modu', teamLabel],
    ['Format', formatStr],
  ];

  if (comp.type === 'league') {
    aoa.push(['Karşılaşma Sayısı', `${comp.meet_count || 1}×`]);
  }

  aoa.push(
    ['Planlanan Oturum', comp.planned_sessions || 1],
    ['Tamamlanan Oturum', finishedSessions],
    ['Toplam Oyuncu', players.length],
    ['Oluşturulma', comp.created_at || ''],
    [],
    ['Puan Tablosu'],
    ['Pozisyon', 'Puan'],
    ...ptsRows,
  );

  return XLSX.utils.aoa_to_sheet(aoa);
}

// ── 2. Klasman sekmesi ────────────────────────────────────────────
function buildKlasmanSheet(players) {
  // Tiebreaker: total_points DESC → matches_won DESC → leg diff DESC → name ASC
  const sorted = [...players].sort((a, b) => {
    if ((b.total_points || 0) !== (a.total_points || 0)) return (b.total_points || 0) - (a.total_points || 0);
    if ((b.matches_won || 0) !== (a.matches_won || 0)) return (b.matches_won || 0) - (a.matches_won || 0);
    const da = (a.legs_won || 0) - (a.legs_lost || 0);
    const db = (b.legs_won || 0) - (b.legs_lost || 0);
    if (db !== da) return db - da;
    return (a.player_name || '').localeCompare(b.player_name || '', 'tr');
  });

  const header = [
    'Sıra', 'Oyuncu', 'Lakap', 'Puan',
    'Oturum',
    '🥇 1.', '🥈 2.', '🥉 3.',
    'Maç G', 'Maç M', 'Maç %',
    'Leg G', 'Leg M', 'Leg %',
    '3DA', 'En Yüksek Çıkış',
    '100+', '140+', '180',
  ];
  const rows = sorted.map((p, i) => {
    const mPlayed = (p.matches_won || 0) + (p.matches_lost || 0);
    const lPlayed = (p.legs_won || 0) + (p.legs_lost || 0);
    // stats_json — backend obje olarak donmuyor olabilir (xlsx route raw alir);
    // hem string hem obje halini destekleyelim
    let st = p.stats_json;
    if (typeof st === 'string') st = safeParse(st) || {};
    if (!st || typeof st !== 'object') st = {};
    const totalScore  = +st.total_score   || 0;
    const dartsThrown = +st.darts_thrown  || 0;
    const avg3        = dartsThrown > 0 ? +((totalScore / dartsThrown) * 3).toFixed(2) : 0;
    return [
      i + 1,
      p.player_name || '',
      p.player_nickname || '',
      p.total_points || 0,
      p.sessions_played || 0,
      p.first_place || 0,
      p.second_place || 0,
      p.third_place || 0,
      p.matches_won || 0,
      p.matches_lost || 0,
      pct(p.matches_won || 0, mPlayed),
      p.legs_won || 0,
      p.legs_lost || 0,
      pct(p.legs_won || 0, lPlayed),
      avg3,
      +st.best_checkout || 0,
      +st.tons          || 0,
      +st.ton_plus      || 0,
      +st.one_eighty    || 0,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  // Sütun genişlikleri (yaklaşık)
  ws['!cols'] = [
    { wch: 5 },  { wch: 22 }, { wch: 14 }, { wch: 8 },
    { wch: 8 },
    { wch: 7 },  { wch: 7 },  { wch: 7 },
    { wch: 7 },  { wch: 7 },  { wch: 8 },
    { wch: 7 },  { wch: 7 },  { wch: 8 },
    { wch: 7 },  { wch: 16 },
    { wch: 7 },  { wch: 7 },  { wch: 7 },
  ];
  return ws;
}

// ── 3. Oturum Sonuçları sekmesi ───────────────────────────────────
function buildOturumSonuclariSheet(sessions, playerNameMap) {
  const header = ['Oturum #', 'Oturum Adı', 'Tarih', 'Durum', 'Sıra', 'Oyuncu', 'Puan'];
  const rows = [];

  for (const s of sessions) {
    const sessName = s.name || `${s.session_number}. Oturum`;
    const sessDate = s.session_date || '';
    const sessStatus = STATUS_LABEL[s.status] || s.status || '';

    const results = db.resultsForSession(s.id);
    if (!results.length) {
      rows.push([s.session_number, sessName, sessDate, sessStatus, '-', '(sonuç yok)', '']);
      continue;
    }
    // position'a göre sıralı
    results.sort((a, b) => (a.position || 999) - (b.position || 999));
    for (const r of results) {
      rows.push([
        s.session_number,
        sessName,
        sessDate,
        sessStatus,
        r.position || '',
        playerNameMap[r.player_id] || `#${r.player_id}`,
        r.points || 0,
      ]);
    }
    rows.push([]); // oturumlar arası boş satır
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 9 }, { wch: 22 }, { wch: 12 }, { wch: 10 },
    { wch: 6 }, { wch: 24 }, { wch: 8 },
  ];
  return ws;
}

// ── 4. Maç İstatistikleri sekmesi ─────────────────────────────────
// tournamentPlayerReport entry bazlı veri döner. Doubles'da entry iki oyuncu içerir
// — istatistiği iki oyuncuya da aynen yazıyoruz (finalize() de bunu yapıyor; tutarlı).
function buildMacIstatistikleriSheet(sessions) {
  const header = [
    'Oturum #', 'Oturum Adı', 'Durum',
    'Oyuncu',
    'Maç (O)', 'Maç (G)',
    '3DA', 'Ortalama Skor', 'Yüksek Bitiş',
    '180', '140+', '100+',
    'Leg (G)', 'Set (G)',
    'Toplam Ok',
  ];
  const rows = [];

  for (const s of sessions) {
    const sessName = s.name || `${s.session_number}. Oturum`;
    const sessStatus = STATUS_LABEL[s.status] || s.status || '';

    if (!s.tournament_id) {
      rows.push([s.session_number, sessName, sessStatus, '(turnuva yok)', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }

    let report;
    try { report = db.tournamentPlayerReport(s.tournament_id) || []; }
    catch (e) { report = []; }

    if (!report.length) {
      rows.push([s.session_number, sessName, sessStatus, '(istatistik yok)', '', '', '', '', '', '', '', '', '', '', '']);
      continue;
    }

    // Oyuncu bazlı satırları topla: entry-level rapor → her oyuncu için bir satır
    // Doubles: aynı entry'nin iki oyuncusuna da kopyalanır.
    const perPlayer = [];
    for (const r of report) {
      const e = r.entry || {};
      const players = [e.player1, e.player2].filter(Boolean);
      for (const p of players) {
        perPlayer.push({
          name: p.name || `#${p.id}`,
          matches_played: r.matches_played || 0,
          matches_won: r.matches_won || 0,
          average_3dart: r.average_3dart || 0,
          total_score: r.total_score || 0,
          darts_thrown: r.darts_thrown || 0,
          best_checkout: r.best_checkout || 0,
          one_eighty: r.one_eighty || 0,
          ton_plus: r.ton_plus || 0,
          tons: r.tons || 0,
          legs_won: r.legs_won || 0,
          sets_won: r.sets_won || 0,
        });
      }
    }
    // Sıralama: en çok galibiyet → en yüksek 3DA
    perPlayer.sort((a, b) => {
      if (b.matches_won !== a.matches_won) return b.matches_won - a.matches_won;
      return b.average_3dart - a.average_3dart;
    });

    for (const pp of perPlayer) {
      const avgScore = pp.darts_thrown > 0 ? +(pp.total_score / pp.darts_thrown * 3).toFixed(2) : 0;
      rows.push([
        s.session_number, sessName, sessStatus,
        pp.name,
        pp.matches_played,
        pp.matches_won,
        pp.average_3dart,
        avgScore,
        pp.best_checkout,
        pp.one_eighty,
        pp.ton_plus,
        pp.tons,
        pp.legs_won,
        pp.sets_won,
        pp.darts_thrown,
      ]);
    }
    rows.push([]); // oturumlar arası boş satır
  }

  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = [
    { wch: 9 }, { wch: 18 }, { wch: 9 },
    { wch: 22 },
    { wch: 8 }, { wch: 8 },
    { wch: 8 }, { wch: 11 }, { wch: 11 },
    { wch: 6 }, { wch: 7 }, { wch: 7 },
    { wch: 7 }, { wch: 7 },
    { wch: 10 },
  ];
  return ws;
}

// ── Ana fonksiyon ─────────────────────────────────────────────────
function buildCompetitionWorkbook(competitionId, userId) {
  if (!XLSX) {
    const err = new Error('Excel paketi (xlsx) kurulu değil. Sunucuda `npm install` çalıştırın.');
    err.code = 'XLSX_NOT_INSTALLED';
    throw err;
  }
  // userId scope'lu okuma — yetkisiz erişimi engelle
  const comp = db.competitionById(competitionId, userId);
  if (!comp) throw new Error('Yarışma bulunamadı');

  const players = db.competitionPlayers(competitionId) || [];
  const sessions = db.sessionsForCompetition(competitionId) || [];

  // player_id -> isim eşleştirmesi (oturum sonuçları sekmesi için)
  const playerNameMap = {};
  for (const p of players) {
    playerNameMap[p.player_id] = p.player_name || `#${p.player_id}`;
  }
  // Sezon: havuzda olmayan ama session_results'da olabilecek oyuncular için tamamla
  for (const s of sessions) {
    const results = db.resultsForSession(s.id);
    for (const r of results) {
      if (playerNameMap[r.player_id]) continue;
      const pl = db.playerById(r.player_id);
      if (pl) playerNameMap[r.player_id] = pl.name || `#${r.player_id}`;
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildOzetSheet(comp, sessions, players), 'Özet');
  XLSX.utils.book_append_sheet(wb, buildKlasmanSheet(players), 'Klasman');
  XLSX.utils.book_append_sheet(wb, buildOturumSonuclariSheet(sessions, playerNameMap), 'Oturum Sonuçları');
  XLSX.utils.book_append_sheet(wb, buildMacIstatistikleriSheet(sessions), 'Maç İstatistikleri');

  // Buffer döndür — Express ile direkt res.send(buf) yapılabilir
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

// Dosya adı için yardımcı (server.js'in kullanması için)
function safeFilename(name) {
  return String(name || 'competition')
    .replace(/[^a-zA-Z0-9çÇğĞıİöÖşŞüÜ_\-\s]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 60) || 'competition';
}

module.exports = { buildCompetitionWorkbook, safeFilename };
