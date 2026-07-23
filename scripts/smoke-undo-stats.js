// "Geri Al" istatistik düzeltmesi için hızlı in-process smoke testi.
// Yanlış girilen bir 180'in geri alınınca istatistik sayacından da düştüğünü doğrular.
// Mevcut data.db'ye geçici bir turnuva açar, test eder, sonunda siler.
// Çalıştır (Mac'te, sunucu KAPALIYKEN):  node scripts/smoke-undo-stats.js

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));
const engine = require(path.join(__dirname, '..', 'src', 'match-engine.js'));
const tournament = require(path.join(__dirname, '..', 'src', 'tournament.js'));

db.init();

function fail(msg) { console.error('✗', msg); process.exit(1); }
function ok(msg)   { console.log('✓', msg); }
function eq(got, exp, label) {
  if (got !== exp) fail(`${label}: beklenen ${exp}, gelen ${got}`);
  ok(`${label} = ${got}`);
}

const user = db.userByEmail('demo@dart.local');
if (!user) fail('demo kullanıcı yok — önce scripts/seed-demo.js çalıştır');

let tId = null;
try {
  // Geçici turnuva (2 oyuncu, 501)
  const mkPlayer = (nm) => {
    const ex = db.db.prepare('SELECT id FROM players WHERE name=? AND user_id=? LIMIT 1').get(nm, user.id);
    return ex ? ex.id : db.createPlayer(nm, null, user.id).id;
  };
  const p1 = mkPlayer('UNDO_SMOKE_A');
  const p2 = mkPlayer('UNDO_SMOKE_B');

  const t = tournament.createTournament({
    user_id: user.id, name: 'UNDO_SMOKE_' + Date.now(),
    game_mode: '501', team_mode: 'singles', legs_to_win: 3, sets_to_win: 1,
    entries: [{ player1_id: p1, seed: 1 }, { player1_id: p2, seed: 2 }],
    stages: [{ format: 'single_elim' }],
  });
  tId = t.id;
  const stage = db.stagesForTournament(t.id)[0];
  const entries = db.entriesForTournament(t.id);

  // Canlı maç oluştur
  const m = db.createMatch({
    tournament_id: t.id, stage_id: stage.id, bracket: 'winners', round: 1, match_index: 0,
    entry1_id: entries[0].id, entry2_id: entries[1].id, status: 'pending',
    start_score: 501, legs_to_win: 3, sets_to_win: 1,
  });
  db.updateMatch(m.id, { status: 'live', current_turn: 1, current_leg: 0, current_set: 0 });

  // Atışlar: p1=60 (sıra→2), p2=45 (sıra→1), p1=180 YANLIŞ
  engine.recordThrow(m.id, 1, 60, null, false);
  engine.recordThrow(m.id, 2, 45, null, false);
  engine.recordThrow(m.id, 1, 180, null, false);

  let s1 = db.getStats(m.id, 1);
  eq(s1.one_eighty, 1, 'yanlış 180 sonrası one_eighty');
  eq(s1.total_score, 240, 'p1 total_score (60+180)');

  // Geri al
  engine.undoLastThrow(m.id);
  s1 = db.getStats(m.id, 1);
  eq(s1.one_eighty, 0, 'undo sonrası one_eighty (hayalet 180 silinmeli)');
  eq(s1.total_score, 60, 'undo sonrası p1 total_score');
  eq(s1.darts_thrown, 3, 'undo sonrası p1 darts_thrown');
  const mm = db.matchById(m.id);
  eq(mm.current_turn, 1, 'undo sonrası sıra p1\'e döndü');

  console.log('\n🎯 Geri Al istatistik düzeltmesi çalışıyor.');
} finally {
  if (tId) {
    try { db.db.prepare('DELETE FROM tournaments WHERE id = ?').run(tId); ok('geçici turnuva silindi'); }
    catch (e) { console.error('temizlik hatası:', e.message); }
  }
}
