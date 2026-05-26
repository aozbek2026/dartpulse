// Mevcut bitmiş lig round'larının atış istatistiklerini (3DA, 180, 140+, 100+,
// high finish, best checkout) klasmana geriye dönük yazar.
//
// Eski bug: recordLeagueRoundResults atış istatistiklerini yazmıyordu, yalnızca
// maç G/M ve leg G/M yazılıyordu. Bu script bir kez çalıştırılır; her round'a
// shot_stats_recorded=1 işareti basar, ikinci çağrı no-op olur.
//
// Çalıştır: node scripts/backfill-shot-stats.js [competition_id]
// Parametresiz çağrı tüm aktif liglere uygular.

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));

db.init();

const compIdArg = process.argv[2] ? parseInt(process.argv[2], 10) : null;

let comps;
if (compIdArg) {
  const c = db.db.prepare("SELECT * FROM competitions WHERE id = ? AND type = 'league'").get(compIdArg);
  if (!c) { console.error(`Lig #${compIdArg} bulunamadı.`); process.exit(1); }
  comps = [c];
} else {
  comps = db.db.prepare("SELECT * FROM competitions WHERE type = 'league' ORDER BY id ASC").all();
}

if (comps.length === 0) {
  console.log('İşlenecek lig yok.');
  process.exit(0);
}

let grandTotalRounds = 0;
let grandTotalPlayers = 0;

for (const c of comps) {
  console.log(`▶ Lig #${c.id}: ${c.name}`);
  try {
    const result = db.backfillShotStatsForCompetition(c.id, c.user_id);
    if (result.rounds === 0) {
      console.log(`   (atış istatistikleri zaten güncel)`);
    } else {
      console.log(`   ✓ ${result.rounds} round backfill edildi, ${result.players_touched} oyuncu kaydı güncellendi`);
      grandTotalRounds += result.rounds;
      grandTotalPlayers += result.players_touched;
    }
  } catch (err) {
    console.error(`   ✗ Hata: ${err.message}`);
  }
}

console.log(`\nÖzet: ${grandTotalRounds} round, ${grandTotalPlayers} oyuncu kaydı güncellendi.`);
console.log('Klasman sayfasını refresh et — atış istatistikleri görünmeli.');
