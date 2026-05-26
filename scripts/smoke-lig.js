// Lig akışı için hızlı in-process smoke testi.
// Yeni geçici DB değil; mevcut data.db'ye DEMO_LIG_SMOKE adıyla bir lig açar,
// adımları çalıştırır, sonunda kendi yarattığı kayıtları siler.
// Çalıştır: node scripts/smoke-lig.js

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));
const tournament = require(path.join(__dirname, '..', 'src', 'tournament.js'));

db.init();

function fail(msg) { console.error('✗', msg); process.exit(1); }
function ok(msg)   { console.log('✓', msg); }

// 1) Demo kullanıcı ID — herkes için yeterli sayılır
const user = db.userByEmail('demo@dart.local');
if (!user) fail('demo kullanıcı yok — önce scripts/seed-demo.js çalıştır');

const SMOKE_COMP_NAME = 'SMOKE_LIG_TEST_' + Date.now();

let compId = null;
try {
  // 2) Lig yarat (3 oyuncu, herkes 1×)
  const comp = db.createCompetition({
    user_id: user.id,
    name: SMOKE_COMP_NAME,
    type: 'league',
    category: 'smoke',
    planned_sessions: 1,
    meet_count: 1,
    game_mode: '501',
    team_mode: 'singles',
    legs_to_win: 2,
    sets_to_win: 1,
    points_json: JSON.stringify({ match: 3 }),
  });
  compId = comp.id;
  ok(`lig açıldı: id=${compId}, name=${comp.name}`);

  // 3) 3 oyuncu ekle
  const pNames = ['SmokeA', 'SmokeB', 'SmokeC'];
  const playerIds = [];
  for (const nm of pNames) {
    const ex = db.db.prepare('SELECT id FROM players WHERE name = ? AND user_id = ? LIMIT 1').get(nm, user.id);
    let pid = ex ? ex.id : db.db.prepare(
      'INSERT INTO players (user_id, name) VALUES (?, ?)'
    ).run(user.id, nm).lastInsertRowid;
    db.addCompetitionPlayer(compId, pid);
    playerIds.push(pid);
  }
  ok(`3 oyuncu eklendi: ${playerIds.join(',')}`);

  // 4) Plan üret
  const result = db.generateLeaguePlan(compId, user.id);
  ok(`plan üretildi: rounds=${result.rounds}, matchups=${result.matchups}`);
  if (result.rounds !== 3) fail(`beklenen 3 round, üretilen ${result.rounds}`);

  // 5) Server endpoint'i otomatik 1.Gün açıyor — burada manuel çağıralım (endpoint dışında)
  let sessions = db.sessionsForCompetition(compId);
  if (sessions.length > 0) fail('plan üretiminde db.js otomatik oturum yaratmamalı (endpoint yapar)');
  ok('plan db helperı sezon yaratmadı (doğru — endpoint yapar)');

  // 6) Endpoint mantığını taklit et: createSession + linkRoundToSession
  const day1 = db.createSession({
    competition_id: compId,
    user_id: user.id,
    session_number: 1,
    name: '1. Gün',
    session_date: new Date().toISOString().slice(0, 10),
    session_type: 'league_day',
    status: 'pending',
  });
  ok(`1. Gün açıldı: id=${day1.id}`);

  const sched = db.leagueSchedule(compId);
  for (const r of sched) {
    if (!r.session_id) db.linkRoundToSession(compId, r.round_number, day1.id, null);
  }
  const schedAfter = db.leagueSchedule(compId);
  const linked = schedAfter.filter(r => r.session_id === day1.id).length;
  if (linked !== 3) fail(`beklenen 3 round 1.Gün'e bağlı, görülen ${linked}`);
  ok(`3 round 1.Gün'e bağlandı`);

  // 7) Round 1'i başlat
  const r1 = schedAfter[0];
  if (!r1.pairs || r1.pairs.length === 0) fail('round 1 eşleşmesiz');
  const t = tournament.createLeagueRoundTournament({
    user_id: user.id,
    name: `${SMOKE_COMP_NAME} — Round 1`,
    game_mode: '501',
    team_mode: 'singles',
    legs_to_win: 2,
    sets_to_win: 1,
    pairs: r1.pairs.map(p => ({ player1_id: p.player1_id, player2_id: p.player2_id })),
  });
  db.linkRoundToSession(compId, 1, day1.id, t.id);
  ok(`round 1 turnuvası açıldı: t.id=${t.id}, pairs=${r1.pairs.length}`);

  // 8) Round'un maçlarını bitir (manuel olarak winner_entry_id yaz)
  const matches = db.matchesForTournament(t.id);
  if (matches.length === 0) fail('round 1 maç yaratmadı');
  for (const m of matches) {
    // p1 kazansın varsayalım, 2-0
    db.db.prepare(
      'UPDATE matches SET status = ?, winner_entry_id = ?, p1_legs = ?, p2_legs = ? WHERE id = ?'
    ).run('finished', m.entry1_id, 2, 0, m.id);
  }
  db.db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run('finished', t.id);
  ok(`round 1 ${matches.length} maç bittti olarak işaretlendi`);

  // 9) Round'u finalize et
  const fin = db.recordLeagueRoundResults(compId, 1, user.id);
  if (!fin.ok) fail(`finalize başarısız: ${JSON.stringify(fin)}`);
  ok(`finalize ok: ${fin.recorded} oyuncu klasmana yazıldı, match_points=${fin.match_points}`);

  // 10) Klasmana baktığımızda Kazananın total_points = wins*3 olmalı
  const players = db.competitionPlayers(compId);
  const winners = players.filter(p => (p.matches_won || 0) > 0);
  if (winners.length === 0) fail('kazanan yok');
  for (const p of winners) {
    const expected = (p.matches_won || 0) * 3;
    if ((p.total_points || 0) !== expected) {
      fail(`${p.player_name}: total_points=${p.total_points}, beklenen=${expected}`);
    }
  }
  ok(`klasmana puanlar doğru yansıdı (${winners.length} kazanan, her birinin total_points = wins × 3)`);

  // 11) Idempotency: ikinci finalize çağrısı hata vermeli (already=true döner)
  const second = db.recordLeagueRoundResults(compId, 1, user.id);
  if (!second.already) fail('idempotency kırık: ikinci finalize true dönmüyor');
  ok('idempotency: ikinci finalize already=true');

  console.log('\n✅ Tüm smoke adımları başarılı.');
} catch (e) {
  console.error('\n✗ Smoke test patladı:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  // Temizlik — yarattığımız competition'ı sil (cascade)
  if (compId) {
    try {
      // Bağlı turnuvaları manuel sil
      const sched = db.leagueSchedule(compId);
      for (const r of sched) {
        if (r.tournament_id) {
          try { db.deleteTournament(r.tournament_id); } catch (_) {}
        }
      }
      db.deleteCompetition(compId, db.userByEmail('demo@dart.local').id);
      console.log(`🧹 SMOKE_LIG_TEST competition silindi.`);
    } catch (e) {
      console.warn('temizlik hatası:', e.message);
    }
  }
}
