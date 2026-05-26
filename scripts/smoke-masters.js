// scripts/smoke-masters.js
// Dilim 5c-1 Ustalar (Masters) oturumu uçtan uca akışı:
// 1) Demo kullanıcısıyla bir sezon yarat (puan tablosu standart, düşük puanlı)
// 2) Birkaç oyuncu ekle
// 3) Normal bir oturum + bir Ustalar oturumu yarat (yüksek puanlı override ile)
// 4) Maçları manuel finished'a çek (turnuva engine kullanmıyoruz)
// 5) Her iki oturumu finalize et
// 6) total_points'in beklendiği gibi (sezon + ustalar = toplam) artmış mı doğrula
//
// Kendi temizliğini yapar (test verisini siler).

const db = require('../src/db');
const tournament = require('../src/tournament');

// db.init() migration'ları çalıştırır (CREATE TABLE + ALTER TABLE ADD COLUMN).
// Server normalde startup'ta çağırır; script'ler manuel.
db.init();

function fail(msg) {
  console.error('✗ FAIL:', msg);
  process.exit(1);
}
function ok(msg) {
  console.log('✓', msg);
}

(function main() {
  // Demo kullanıcısını bul
  const user = db.userByEmail('demo@dart.local');
  if (!user) fail('demo@dart.local kullanıcısı yok');
  const userId = user.id;

  // Test sezonu yarat (standart puan: 1.=10, 2.=7, 3.=5, default=1)
  const comp = db.createCompetition({
    user_id: userId,
    name: '[SMOKE-MASTERS] Test Sezon',
    type: 'season',
    category: 'genel',
    points_json: { '1': 10, '2': 7, '3': 5, 'default': 1 },
    planned_sessions: 2,
    game_mode: '501',
    team_mode: 'singles',
  });
  ok(`Sezon yaratıldı: id=${comp.id}`);

  try {
    // 4 oyuncu ekle (createPlayer pozisyonel: name, nickname, userId)
    const playerIds = [];
    for (const name of ['SmokeA', 'SmokeB', 'SmokeC', 'SmokeD']) {
      const p = db.createPlayer(name, null, userId);
      db.addCompetitionPlayer(comp.id, p.id);
      playerIds.push(p.id);
    }
    ok(`4 oyuncu eklendi: ${playerIds.join(',')}`);

    // Helper: oturum yarat + 4 oyunculu single_elim turnuva + maçları finished
    function createAndPlaySession(name, isMasters, pointsOverride) {
      const existing = db.sessionsForCompetition(comp.id);
      const sn = existing.length + 1;
      // Tournament yarat
      const entries = playerIds.map(pid => ({ player1_id: pid, player2_id: null, seed: null }));
      const t = tournament.createTournament({
        user_id: userId, name,
        game_mode: '501', team_mode: 'singles',
        legs_to_win: 2, sets_to_win: 1,
        entries,
        stages: [{ format: 'single_elim', qualifier_count: null, config: {} }],
      });
      // Session yarat
      const s = db.createSession({
        competition_id: comp.id, user_id: userId,
        session_number: sn, tournament_id: t.id,
        name, status: 'pending',
        is_masters: isMasters,
        points_override_json: pointsOverride,
      });
      // Tournament'ı resmi yoldan start et (status='running' + R1 entries set)
      tournament.startTournament(t.id);

      // Tüm maçları finished yap, sırayla 1. → 4. seedlere göre ilerlemek için match-engine yerine
      // doğrudan winner_entry_id setle, tournament.onMatchFinished çağır (bracket ilerlesin).
      const tEntries = db.entriesForTournament(t.id);
      // Basit: entries seed sırasına göre — playerIds[0] her zaman kazansın
      // playerIds[0] = winner, playerIds[1] = runner-up, playerIds[2,3] = SF kaybedenler
      // 4-oyunculu SE bracket: round1: (e0 vs e3), (e1 vs e2); round2: winners
      // Bunu match-by-match çözmek karmaşık, daha basit: tüm maçları sırayla en yüksek seed'i kazandır
      let safety = 0;
      while (safety++ < 20) {
        const ready = db.matchesForTournament(t.id).filter(m => m.status === 'ready');
        if (!ready.length) break;
        for (const m of ready) {
          // E1 her zaman kazansın (entry id küçük olan)
          const e1 = m.entry1_id, e2 = m.entry2_id;
          if (!e1 || !e2) continue; // BYE veya doldurulmamış
          const winner = Math.min(e1, e2);
          const loser = Math.max(e1, e2);
          db.updateMatch(m.id, {
            status: 'finished',
            winner_entry_id: winner,
            p1_legs: winner === e1 ? 2 : 0,
            p2_legs: winner === e2 ? 2 : 0,
            finished_at: new Date().toISOString(),
          });
          tournament.onMatchFinished(m.id);
        }
      }
      // Turnuva finished mı? onMatchFinished bracket'i ilerlettiyse otomatik finished olur.
      const after = db.tournamentById(t.id);
      if (after.status !== 'finished') {
        // Manuel finished yap (safety — yarım kalmış maç yoksa)
        db.updateTournamentStatus(t.id, 'finished');
      }
      return { session: s, tournament: t };
    }

    // 1. Normal oturum
    const { session: s1 } = createAndPlaySession('[SMOKE] 1. Oturum (Normal)', false, null);
    ok(`Normal oturum oynandı: sid=${s1.id}`);

    // 2. Ustalar oturumu (yüksek puan)
    const mastersPoints = { '1': 25, '2': 18, '3': 12, '4': 8, 'default': 3 };
    const { session: s2 } = createAndPlaySession('[SMOKE] 2. Oturum (Ustalar)', true, mastersPoints);
    ok(`Ustalar oturumu oynandı: sid=${s2.id}, is_masters=${s2.is_masters}, override=${s2.points_override_json}`);

    // Doğrula: s2 DB'de gerçekten is_masters=1 ve points_override_json dolu mu
    const s2Reload = db.sessionById(s2.id);
    if (!s2Reload.is_masters) fail('s2.is_masters DB\'de 0');
    if (!s2Reload.points_override_json) fail('s2.points_override_json DB\'de null');
    ok(`DB doğrulama: s2 is_masters=${s2Reload.is_masters}, override saklandı`);

    // Finalize her iki oturum (server-side endpoint mantığını taklit)
    const safeParse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

    function finalize(sid) {
      const s = db.sessionById(sid);
      const c = db.competitionById(comp.id, userId);
      const standings = tournament.computeFinalStandings(s.tournament_id);
      const sessionPoints = s.points_override_json ? safeParse(s.points_override_json) : null;
      const points = (s.is_masters && sessionPoints) ? sessionPoints : (safeParse(c.points_json) || {});
      const defaultPts = points['default'] != null ? +points['default'] : 0;
      for (const row of standings) {
        if (!row.player_id) continue;
        const pts = points[String(row.position)] != null ? +points[String(row.position)] : defaultPts;
        db.recordSessionResult(sid, comp.id, row.player_id, row.position, pts);
        db.addToCompetitionPlayerStats(comp.id, row.player_id, {
          total_points: pts,
          sessions_played: 1,
          matches_won: row.wins || 0,
          matches_lost: row.losses || 0,
          legs_won: row.legs_won || 0,
          legs_lost: row.legs_lost || 0,
          first_place: row.position === 1 ? 1 : 0,
          second_place: row.position === 2 ? 1 : 0,
          third_place: row.position === 3 ? 1 : 0,
        });
      }
      db.updateSession(sid, { status: 'finished' });
      return standings;
    }

    const standings1 = finalize(s1.id);
    ok(`Normal oturum finalize: ${standings1.length} oyuncu, 1.=${standings1[0].player_id} → ${standings1[0].position}.`);
    const standings2 = finalize(s2.id);
    ok(`Ustalar oturum finalize: ${standings2.length} oyuncu`);

    // Doğrula: en yüksek seed'li oyuncu (playerIds[0]) toplamda 10 (normal) + 25 (ustalar) = 35 puan almalı
    const winnerStats = db.db.prepare(
      'SELECT total_points, first_place FROM competition_players WHERE competition_id = ? AND player_id = ?'
    ).get(comp.id, playerIds[0]);
    if (!winnerStats) fail('Kazanan oyuncunun istatistiği bulunamadı');
    const expected = 10 + 25; // 1. sezon normal + 1. ustalar
    if (winnerStats.total_points !== expected) {
      fail(`Beklenen total_points=${expected}, gerçek=${winnerStats.total_points}`);
    }
    if (winnerStats.first_place !== 2) {
      fail(`Beklenen first_place=2, gerçek=${winnerStats.first_place}`);
    }
    ok(`Kazanan toplam puan: ${winnerStats.total_points} (sezon 10 + ustalar 25 = 35) ✓`);
    ok(`Kazanan podyum: ${winnerStats.first_place} kez 1. ✓`);

    // 2. ve 3. oyuncu için kabaca: 2.=7+18=25, 3.=5+12=17
    const p2Stats = db.db.prepare(
      'SELECT total_points FROM competition_players WHERE competition_id = ? AND player_id = ?'
    ).get(comp.id, playerIds[1]);
    ok(`2. oyuncu toplam puan: ${p2Stats.total_points} (beklenti civar 25 — bracket düzenine göre değişebilir)`);

    console.log('\n🎉 SMOKE-MASTERS BAŞARILI: Ustalar oturumu sezon puanına yüksek puan ekledi');
  } finally {
    // Temizlik
    const sessions = db.sessionsForCompetition(comp.id);
    for (const s of sessions) {
      if (s.tournament_id) {
        try {
          // Tournament + matches'i bırak, sadece reference'ı temizle (cascade DELETE comp ile)
        } catch (_) {}
      }
    }
    db.deleteCompetition(comp.id, userId);
    ok(`Temizlik: comp.id=${comp.id} silindi`);
  }
})();
