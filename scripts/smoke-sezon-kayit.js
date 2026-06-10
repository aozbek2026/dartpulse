// Sezon online kaydı için hızlı in-process smoke testi.
// Mevcut data.db'ye geçici bir sezon + kayıt-açık oturum açar, kayıt/yedek/iptal/onay
// akışını uçtan uca çalıştırır, sonunda kendi yarattığı kayıtları siler.
// Çalıştır (Mac'te, server kapalıyken):  node scripts/smoke-sezon-kayit.js

const path = require('path');
const db = require(path.join(__dirname, '..', 'src', 'db.js'));

db.init();

function fail(msg) { console.error('✗', msg); process.exitCode = 1; throw new Error(msg); }
function ok(msg)   { console.log('✓', msg); }

const owner = db.userByEmail('demo@dart.local');
if (!owner) { console.error('demo kullanıcı yok — önce scripts/seed-demo.js çalıştır'); process.exit(1); }

const NAME = 'SMOKE_SEZON_KAYIT_' + Date.now();
let compId = null;
const tmpUserIds = [];

try {
  // 1) Sezon yarat
  const comp = db.createCompetition({
    user_id: owner.id, name: NAME, type: 'season', category: 'smoke',
    planned_sessions: 2, game_mode: '501', team_mode: 'singles',
    legs_to_win: 2, sets_to_win: 1, points_json: JSON.stringify({ 1: 10, 2: 7, default: 1 }),
  });
  compId = comp.id;
  ok(`sezon açıldı: id=${compId}`);

  // 2) Kayıt-açık oturum yarat (kontenjan 2 — yedek mantığını test etmek için)
  const sess = db.createSession({
    competition_id: compId, user_id: owner.id, session_number: 1,
    name: '1. Oturum', session_date: new Date().toISOString().slice(0, 10),
    status: 'pending', reg_enabled: 1, reg_status: 'open', capacity: 2, checkin_enabled: 0,
  });
  if (!sess.reg_enabled || sess.reg_status !== 'open' || sess.capacity !== 2) fail('oturum kayıt alanları yanlış kaydedildi');
  ok(`kayıt-açık oturum: id=${sess.id}, kontenjan=2`);

  // 3) 3 sahte hesap oluştur ve kaydet (2 asıl + 1 yedek beklenir)
  for (let i = 1; i <= 3; i++) {
    const email = `smoke_reg_${Date.now()}_${i}@x.local`;
    const uid = db.db.prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
      .run(email, 'Smoke U' + i, 'x').lastInsertRowid;
    tmpUserIds.push(uid);
    const reg = db.createSessionRegistration(sess.id, compId, uid, sess.capacity);
    ok(`U${i} kaydı: ${reg.status}`);
  }
  let active = db.countSessionRegistrations(sess.id, ['registered', 'checked_in', 'confirmed']);
  let wait = db.countSessionRegistrations(sess.id, ['waitlisted']);
  if (active !== 2 || wait !== 1) fail(`kontenjan mantığı yanlış: asıl=${active}, yedek=${wait} (beklenen 2/1)`);
  ok('kontenjan: 2 asıl, 1 yedek');

  // 4) 1. asıl kaydı iptal et → yedek otomatik terfi etmeli
  const w = db.withdrawSessionRegistration(sess.id, tmpUserIds[0], sess.capacity);
  if (!w.ok || !w.promoted) fail('iptalde yedek terfi etmedi');
  active = db.countSessionRegistrations(sess.id, ['registered', 'checked_in', 'confirmed']);
  wait = db.countSessionRegistrations(sess.id, ['waitlisted']);
  if (active !== 2 || wait !== 0) fail(`terfi sonrası yanlış: asıl=${active}, yedek=${wait}`);
  ok('iptal → yedek otomatik asıla terfi etti (2 asıl, 0 yedek)');

  // 5) Onayla → kayıtlardan player_id listesi + havuza ekleme
  const conf = db.confirmSessionRegistrations(sess.id, compId, owner.id, false, sess.session_number);
  if (conf.player_ids.length !== 2) fail(`onay sonrası 2 player_id beklenir, gelen ${conf.player_ids.length}`);
  ok(`onay: ${conf.player_ids.length} oyuncu havuza eklendi + player_id bağlandı`);

  // 6) Havuz gerçekten 2 oyuncu içeriyor mu
  const pool = db.competitionPlayers(compId);
  if (pool.length !== 2) fail(`havuzda 2 oyuncu beklenir, görülen ${pool.length}`);
  ok('sezon havuzu 2 oyuncuyla dolu');

  // 7) İdempotency: tekrar onay aynı 2 player_id'yi dönmeli, yeni transfer 0
  const conf2 = db.confirmSessionRegistrations(sess.id, compId, owner.id, false, sess.session_number);
  if (conf2.player_ids.length !== 2 || conf2.transferred !== 0) fail('idempotency kırık: ikinci onay temiz değil');
  ok('idempotency: ikinci onay 0 yeni transfer, aynı 2 oyuncu');

  console.log('\n✅ Tüm sezon-kayıt smoke adımları başarılı.');
} catch (e) {
  console.error('\n✗ Smoke patladı:', e.message);
} finally {
  if (compId) {
    try { db.deleteCompetition(compId, owner.id); } catch (_) {}
  }
  for (const uid of tmpUserIds) {
    try { db.db.prepare('DELETE FROM session_registrations WHERE user_id = ?').run(uid); } catch (_) {}
    try { db.db.prepare('DELETE FROM players WHERE account_user_id = ?').run(uid); } catch (_) {}
    try { db.db.prepare('DELETE FROM users WHERE id = ?').run(uid); } catch (_) {}
  }
  console.log('🧹 Geçici sezon, kayıtlar ve sahte hesaplar silindi.');
}
