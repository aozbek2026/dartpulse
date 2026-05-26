// Lig akışı tanı çıktısı — boardlara maç gitmeme bug'ı için.
// Çalıştır: node scripts/lig-debug.js
// Output: aktif liglerin son round'ları, board'lar, scheduler engelleri.

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));

db.init();

console.log('═══════════════════════════════════════════════════════');
console.log(' LİG TANI ÇIKTISI');
console.log('═══════════════════════════════════════════════════════\n');

// 1) Aktif lig competition'ları
const comps = db.db.prepare(
  "SELECT * FROM competitions WHERE type = 'league' AND status != 'finished' ORDER BY id DESC LIMIT 5"
).all();

if (comps.length === 0) {
  console.log('Aktif lig yok.');
  process.exit(0);
}

for (const c of comps) {
  console.log(`▶ Lig #${c.id}: ${c.name} (status=${c.status}, user_id=${c.user_id})`);
  console.log(`   points_json = ${c.points_json || '(yok)'}\n`);

  // Bu ligin board'ları
  const boards = db.allBoards(c.user_id);
  console.log(`   📺 BOARDS (${boards.length}):`);
  for (const b of boards) {
    const bt = b.tournament_id ? db.tournamentById(b.tournament_id) : null;
    const btInfo = bt ? `t#${bt.id} "${bt.name}" status=${bt.status}` : 'BOŞ';
    const curM = b.current_match_id ? db.matchById(b.current_match_id) : null;
    const curInfo = curM ? `match#${curM.id} status=${curM.status}` : '—';
    console.log(`     B#${b.id} "${b.name}" status=${b.status} → ${btInfo} | current: ${curInfo}`);
  }
  console.log('');

  // Bu ligin schedule'ı
  const sched = db.leagueSchedule(c.id);
  console.log(`   🗓  ROUNDS (${sched.length}):`);
  for (const r of sched) {
    const t = r.tournament_id ? db.tournamentById(r.tournament_id) : null;
    const status = t ? t.status : 'başlatılmadı';
    console.log(`     R${r.round_number}: session=${r.session_id || 'YOK'} t#${r.tournament_id || '-'} (${status}) recorded=${r.results_recorded ? 'EVET' : 'hayır'} pairs=${r.pairs.length}`);

    if (r.tournament_id && t && t.status !== 'finished') {
      // Bu turnuvanın maçları
      const ms = db.matchesForTournament(r.tournament_id);
      const ready  = ms.filter(m => m.status === 'ready');
      const live   = ms.filter(m => m.status === 'live');
      const fin    = ms.filter(m => m.status === 'finished');
      const unassignedReady = ready.filter(m => !m.board_id);
      console.log(`        Maçlar: ready=${ready.length} live=${live.length} finished=${fin.length} | atanmamış_ready=${unassignedReady.length}`);
      if (unassignedReady.length > 0) {
        // Hangi board'lara gidebilirler? (Aynı tournament_id'li board)
        const matchingBoards = boards.filter(b => b.tournament_id === r.tournament_id);
        console.log(`        Bu turnuvaya bağlı board sayısı: ${matchingBoards.length} (${matchingBoards.map(b => b.name).join(', ') || 'YOK'})`);
        if (matchingBoards.length === 0) {
          console.log(`        ⚠️  Atanmamış maçlar var ama bu turnuvaya bağlı board yok!`);
        }
      }
    }
  }
  console.log('\n───────────────────────────────────────────────────────\n');
}

console.log('Tanı tamam.');
