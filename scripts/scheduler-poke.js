// Scheduler'i HTTP üzerinden tetikle — askıda kalan ready maçlar için.
// Bunun için en kolay yol: bir board'a kendi mevcut tournament_id'sini tekrar yazmak.
// Bu PATCH endpoint'i scheduler.assignPendingMatches'i çağırır.
//
// Çalıştır: node scripts/scheduler-poke.js
// Gereksinim: sunucu http://localhost:3000 üzerinde çalışıyor.

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));

db.init();

// İlk aktif kullanıcının board'larını al
const u = db.db.prepare("SELECT id FROM users ORDER BY id ASC LIMIT 1").get();
if (!u) { console.error('Kullanıcı yok.'); process.exit(1); }

const boards = db.allBoards(u.id);
if (boards.length === 0) { console.error('Board yok.'); process.exit(1); }

const target = boards.find(b => b.tournament_id) || boards[0];
console.log(`Hedef board: B#${target.id} "${target.name}" tid=${target.tournament_id}`);

// Cookie'siz HTTP req — auth atlamak için doğrudan scheduler.assignPendingMatches kullan
const scheduler = require(path.join(__dirname, '..', 'src', 'scheduler.js'));
console.log(`Scheduler tetikleniyor (userId=${u.id})...`);
// io olmadan da iş görür — atamaları yapar, sadece socket bildirimi atmaz.
// Tabletler bir sonraki state-refresh'te güncel match'i görür.
scheduler.assignPendingMatches(null, u.id);

// Sonuç
const after = db.allBoards(u.id);
for (const b of after) {
  const m = b.current_match_id ? db.matchById(b.current_match_id) : null;
  console.log(`  B#${b.id} "${b.name}" → tid=${b.tournament_id} cur_match=${m ? `#${m.id} (${m.status})` : '—'}`);
}

console.log('\nTamam. Tabletleri refresh et veya 1-2 saniye bekle, maçlar gelmeli.');
