// seed-test-registrations.js — Test katılımcıları oluşturur ve bir turnuvaya kaydeder.
//
// Amaç: Online kayıt sistemini tek başına test edebilmek. 8 İngiliz isimli sahte
// hesap açar (e-posta otomatik doğrulanmış) ve verilen turnuvaya kayıt eder.
//
// Kullanım:
//   1) Önce turnuvaları listele (hangi id'ye kayıt edeceğini gör):
//        node scripts/seed-test-registrations.js
//   2) Sonra o turnuvaya 8 test katılımcısı ekle:
//        TOURNAMENT_ID=5 node scripts/seed-test-registrations.js
//
// Idempotent: aynı e-postalar varsa yeniden kullanılır, çift hesap açılmaz.

const db = require('../src/db');
const auth = require('../src/auth');

db.init();

const TEST_PEOPLE = [
  { name: 'James Smith',    email: 'james.smith@dcptest.local' },
  { name: 'Oliver Brown',   email: 'oliver.brown@dcptest.local' },
  { name: 'Harry Wilson',   email: 'harry.wilson@dcptest.local' },
  { name: 'George Taylor',  email: 'george.taylor@dcptest.local' },
  { name: 'Jack Davies',    email: 'jack.davies@dcptest.local' },
  { name: 'Charlie Evans',  email: 'charlie.evans@dcptest.local' },
  { name: 'Thomas Roberts', email: 'thomas.roberts@dcptest.local' },
  { name: 'William Johnson',email: 'william.johnson@dcptest.local' },
];

const TID = process.env.TOURNAMENT_ID ? +process.env.TOURNAMENT_ID : null;

// Turnuva id verilmediyse online-kayıt açık turnuvaları listele
if (!TID) {
  const list = db.upcomingTournaments();
  console.log('\nOnline kayıt açık turnuvalar:');
  if (!list.length) {
    console.log('  (yok) — önce bir turnuvada "🎫 Etkinlik" > "Online kayıt"ı açın.');
  } else {
    for (const t of list) {
      console.log(`  id=${t.id}  "${t.name}"  (${t.active_count} kayıt${t.capacity ? '/' + t.capacity : ''})`);
    }
    console.log('\nKayıt eklemek için:  TOURNAMENT_ID=<id> node scripts/seed-test-registrations.js');
  }
  console.log('');
  process.exit(0);
}

const t = db.tournamentById(TID);
if (!t) { console.error(`HATA: id=${TID} turnuva bulunamadı.`); process.exit(1); }
const es = db.eventSettings(TID);
if (!es || !es.reg_enabled) {
  console.error(`HATA: "${t.name}" turnuvasında online kayıt kapalı.`);
  console.error('Panelde "🎫 Etkinlik" > "Online kayıt" kutusunu işaretleyip kaydedin, sonra tekrar deneyin.');
  process.exit(1);
}

console.log(`\nTurnuva: "${t.name}" (id=${TID})`);
let created = 0, reused = 0, registered = 0;

for (const person of TEST_PEOPLE) {
  let u = db.userByEmail(person.email);
  if (!u) {
    const created_u = db.createUser(person.email, auth.hashPassword('test1234'), person.name);
    // E-postayı otomatik doğrulanmış işaretle (doğrulama linki beklemesin)
    db.db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(created_u.id);
    u = db.userByEmail(person.email);
    created++;
  } else {
    reused++;
  }
  const reg = db.createRegistration(TID, u.id, es.capacity);
  console.log(`  ${person.name.padEnd(16)} → ${reg.status}`);
  if (reg.status) registered++;
}

console.log(`\n✓ ${created} yeni hesap, ${reused} mevcut hesap. ${registered} kayıt işlendi.`);
console.log('Şimdi panelde "📋 Kayıtlar" ile check-in / "Katılımcıları Onayla" akışını test edebilirsin.\n');
