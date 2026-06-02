// Sezon tur-bazlı puanlama smoke testi.
// Gerçek tek-eleme bracket'i kurar, oynatır, computeFinalStandings ile
// pozisyonları alır ve server.js'teki positionToStage / pointsForRow
// fonksiyonlarıyla puan dağıtımını doğrular. Kendi yarattığını temizler.
// Çalıştır: node scripts/smoke-sezon-puan.js

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));
const tournament = require(path.join(__dirname, '..', 'src', 'tournament.js'));
const { positionToStage, pointsForRow } = require(path.join(__dirname, '..', 'server.js'));

db.init();

let failures = 0;
function check(cond, msg) {
  if (cond) { console.log('✓', msg); }
  else { console.error('✗', msg); failures++; }
}
function fail(msg) { console.error('✗', msg); process.exit(1); }

// ── 1) positionToStage eşleme tablosu (birim test) ──────────────────
const stageCases = [
  [1, 'birinci'], [2, 'final'],
  [3, 'yari_final'], [4, 'yari_final'],
  [5, 'ceyrek_final'], [8, 'ceyrek_final'],
  [9, 'son_16'], [16, 'son_16'],
  [17, 'son_32'], [32, 'son_32'],
  [33, 'son_64'], [64, 'son_64'],
  [65, 'son_128'], [128, 'son_128'],
  [129, 'son_256'], [256, 'son_256'],
  [257, 'diger'], [500, 'diger'],
];
for (const [pos, exp] of stageCases) {
  check(positionToStage(pos) === exp, `pozisyon ${pos} → ${exp} (görülen: ${positionToStage(pos)})`);
}

// ── 2) pointsForRow: tur anahtarı öncelikli + geriye dönük uyumluluk ──
const newPoints = { birinci: 20, final: 15, yari_final: 11, ceyrek_final: 8, default: 1 };
check(pointsForRow(newPoints, 1, 1) === 20, 'yeni puan: 1. → 20 (birinci)');
check(pointsForRow(newPoints, 2, 1) === 15, 'yeni puan: 2. → 15 (final)');
check(pointsForRow(newPoints, 3, 1) === 11, 'yeni puan: 3. → 11 (yari_final)');
check(pointsForRow(newPoints, 5, 1) === 8,  'yeni puan: 5. → 8 (ceyrek_final)');
check(pointsForRow(newPoints, 9, 1) === 1,  'yeni puan: 9. → default 1 (son_16 tanımsız)');

// Eski sezon: pozisyon anahtarlı points_json hâlâ çalışmalı
const oldPoints = { '1': 10, '2': 7, '3': 5, default: 1 };
check(pointsForRow(oldPoints, 1, 1) === 10, 'eski puan: 1. → 10 (geriye dönük)');
check(pointsForRow(oldPoints, 2, 1) === 7,  'eski puan: 2. → 7 (geriye dönük)');
check(pointsForRow(oldPoints, 3, 1) === 5,  'eski puan: 3. → 5 (geriye dönük)');
check(pointsForRow(oldPoints, 9, 1) === 1,  'eski puan: 9. → default 1');

// ── 3) Gerçek 8 kişilik tek-eleme bracket: pozisyon dağıtımı ─────────
const user = db.userByEmail('demo@dart.local');
if (!user) fail('demo kullanıcı yok — önce scripts/seed-demo.js çalıştır');

const SMOKE_NAME = 'SMOKE_SEZON_PUAN_' + Date.now();
let createdTournamentId = null;
const createdPlayerIds = [];

try {
  // 8 oyuncu
  const entries = [];
  for (let i = 1; i <= 8; i++) {
    const nm = `SezonSmoke${i}`;
    const ex = db.db.prepare('SELECT id FROM players WHERE name = ? AND user_id = ? LIMIT 1').get(nm, user.id);
    const pid = ex ? ex.id : db.db.prepare('INSERT INTO players (user_id, name) VALUES (?, ?)').run(user.id, nm).lastInsertRowid;
    createdPlayerIds.push(pid);
    entries.push({ player1_id: pid, seed: i });
  }

  const t = tournament.createTournament({
    user_id: user.id,
    name: SMOKE_NAME,
    game_mode: '501',
    team_mode: 'singles',
    legs_to_win: 2,
    sets_to_win: 1,
    entries,
    stages: [{ format: 'single_elim' }],
  });
  createdTournamentId = t.id;
  tournament.startTournament(t.id);

  // Tüm maçları oynat: her hazır maçta entry1 kazanır, bracket'i ilerlet.
  let guard = 0;
  while (guard++ < 100) {
    const tt = db.tournamentById(t.id);
    if (tt.status === 'finished') break;
    const matches = db.matchesForTournament(t.id);
    const ready = matches.filter(m =>
      m.status !== 'finished' && m.entry1_id && m.entry2_id);
    if (ready.length === 0) fail('ilerleme durdu — hazır maç yok ama turnuva bitmedi');
    for (const m of ready) {
      db.db.prepare(
        'UPDATE matches SET status = ?, winner_entry_id = ?, p1_legs = ?, p2_legs = ? WHERE id = ?'
      ).run('finished', m.entry1_id, 2, 0, m.id);
      tournament.onMatchFinished(m.id);
    }
  }
  check(db.tournamentById(t.id).status === 'finished', '8 kişilik bracket bitti');

  // Pozisyon dağıtımı: 1, 2, 3, 3, 5, 5, 5, 5 olmalı
  const standings = tournament.computeFinalStandings(t.id);
  const positions = standings.map(r => r.position).sort((a, b) => a - b);
  check(JSON.stringify(positions) === JSON.stringify([1, 2, 3, 3, 5, 5, 5, 5]),
    `pozisyon dağıtımı = ${JSON.stringify(positions)} (beklenen [1,2,3,3,5,5,5,5])`);

  // Her pozisyona düşen puan, tur eşlemesiyle tutarlı mı?
  const seasonPoints = { birinci: 20, final: 15, yari_final: 11, ceyrek_final: 8, son_16: 5, default: 1 };
  const dist = standings.map(r => ({
    pos: r.position,
    stage: positionToStage(r.position),
    pts: pointsForRow(seasonPoints, r.position, seasonPoints.default),
  }));
  const champ = dist.find(d => d.pos === 1);
  const runner = dist.find(d => d.pos === 2);
  const sfPts = dist.filter(d => d.pos === 3).map(d => d.pts);
  const qfPts = dist.filter(d => d.pos === 5).map(d => d.pts);
  check(champ.pts === 20, `şampiyon (1.) → 20 puan [birinci]`);
  check(runner.pts === 15, `ikinci (2.) → 15 puan [final]`);
  check(sfPts.every(p => p === 11) && sfPts.length === 2, `2 yarı finalci → 11 puan [yari_final]`);
  check(qfPts.every(p => p === 8) && qfPts.length === 4, `4 çeyrek finalci → 8 puan [ceyrek_final]`);

  if (failures === 0) console.log('\n✅ Tüm sezon puanlama testleri başarılı.');
  else { console.error(`\n✗ ${failures} test başarısız.`); process.exitCode = 1; }
} catch (e) {
  console.error('\n✗ Test patladı:', e.message);
  console.error(e.stack);
  process.exitCode = 1;
} finally {
  if (createdTournamentId) {
    try { db.deleteTournament(createdTournamentId); console.log('🧹 turnuva silindi.'); }
    catch (e) { console.warn('temizlik (turnuva):', e.message); }
  }
  for (const pid of createdPlayerIds) {
    try { db.db.prepare('DELETE FROM players WHERE id = ? AND user_id = ?').run(pid, user.id); } catch (_) {}
  }
}
