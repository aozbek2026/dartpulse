// Hızlı demo seed — LAN testi için.
// Çalıştır: node scripts/seed-demo.js
// Oluşturur:
//   - demo@dart.local / demo123 organizatörü
//   - 8 oyuncu (Ahmet, Mehmet, Ali, Can, Burak, Deniz, Ece, Fatma)
//   - 4 board (Board 1-4)
//   - "Demo Turnuva" — single elim, 8 katılımcı, 501 doubleout, 3 leg/match
//
// Var olan veritabanını silmez; sadece demo kullanıcı yoksa ekler.

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));
const auth = require(path.join(__dirname, '..', 'src', 'auth.js'));
const tournament = require(path.join(__dirname, '..', 'src', 'tournament.js'));

db.init();

const EMAIL = 'demo@dart.local';
const PASSWORD = 'demo123';
const NAME = 'Demo Organizatör';

const existing = db.userByEmail(EMAIL);
if (existing) {
  console.log(`ℹ️  Demo kullanıcı zaten mevcut (id=${existing.id}). Atlanıyor.`);
  console.log(`   Login: ${EMAIL} / ${PASSWORD}`);
  process.exit(0);
}

const passwordHash = auth.hashPassword(PASSWORD);
const user = db.createUser(EMAIL, passwordHash, NAME);
console.log(`✓ Demo organizatör oluşturuldu (id=${user.id})`);

const playerNames = ['Ahmet', 'Mehmet', 'Ali', 'Can', 'Burak', 'Deniz', 'Ece', 'Fatma'];
const players = playerNames.map(n => db.createPlayer(n, null, user.id));
console.log(`✓ ${players.length} oyuncu eklendi`);

const boards = [];
for (let i = 1; i <= 4; i++) {
  boards.push(db.createBoard(`Board ${i}`, user.id));
}
console.log(`✓ ${boards.length} board eklendi (Board 1-4)`);

const t = tournament.createTournament({
  user_id: user.id,
  name: 'Demo Turnuva',
  game_mode: '501',
  team_mode: 'singles',
  legs_to_win: 3,
  sets_to_win: 1,
  entries: players.map((p, i) => ({ player1_id: p.id, seed: i + 1 })),
  stages: [{ format: 'single_elim' }],
});
console.log(`✓ Demo turnuva oluşturuldu (id=${t.id}, draft durumda)`);

console.log('');
console.log('───────────────────────────────────────────────');
console.log(`🎯 Demo verisi hazır`);
console.log(`   Login: ${EMAIL}`);
console.log(`   Şifre: ${PASSWORD}`);
console.log(`   → /organizer.html → "Turnuvalar" sekmesi → "Başlat"`);
console.log('───────────────────────────────────────────────');
