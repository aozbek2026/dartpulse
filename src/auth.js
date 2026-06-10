// Auth: register/login + session middleware
// Node crypto.scrypt ile şifre hash (bcrypt bağımlılığı yok).
const crypto = require('crypto');
const db = require('./db');
const mailer = require('./mailer');

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N=2^14
const SCRYPT_BLOCKSIZE = 8;
const SCRYPT_PARALLEL = 1;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST, r: SCRYPT_BLOCKSIZE, p: SCRYPT_PARALLEL,
  });
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const got = crypto.scryptSync(password, salt, expected.length, {
    N: SCRYPT_COST, r: SCRYPT_BLOCKSIZE, p: SCRYPT_PARALLEL,
  });
  return crypto.timingSafeEqual(got, expected);
}

// Middleware: auth gerekir
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }
  const u = db.userById(req.session.userId);
  if (!u) {
    req.session.userId = null;
    return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
  }
  req.user = u;
  next();
}

// Middleware: admin gerekir (Turnuva Kayıt Sistemi — Dilim A)
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }
  const u = db.userById(req.session.userId);
  if (!u) {
    req.session.userId = null;
    return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
  }
  if (u.role !== 'admin') {
    return res.status(403).json({ error: 'Yönetici yetkisi gerekli' });
  }
  req.user = u;
  next();
}

// Middleware: organizatör gerekir (admin ya da onaylı organizatör)
function requireOrganizer(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: 'Giriş gerekli' });
  }
  const u = db.userById(req.session.userId);
  if (!u) {
    req.session.userId = null;
    return res.status(401).json({ error: 'Kullanıcı bulunamadı' });
  }
  if (u.role !== 'admin' && u.organizer_status !== 'approved') {
    return res.status(403).json({
      error: 'Organizatör yetkisi gerekli. Turnuva düzenlemek için önce "Organizatör Ol" başvurusu yapmanız ve onaylanmanız gerekir.',
      organizer_status: u.organizer_status || 'none',
    });
  }
  req.user = u;
  next();
}

// Middleware: user varsa req.user doldur (opsiyonel)
function optionalAuth(req, res, next) {
  if (req.session && req.session.userId) {
    const u = db.userById(req.session.userId);
    if (u) req.user = u;
  }
  next();
}

// --- Route handlers ---
function registerHandler(req, res) {
  const { email, password, name } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre gerekli' });
  }
  const normEmail = String(email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normEmail)) {
    return res.status(400).json({ error: 'Geçersiz email' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
  }
  if (db.userByEmail(normEmail)) {
    return res.status(400).json({ error: 'Bu email zaten kayıtlı' });
  }
  const u = db.createUser(normEmail, hashPassword(password), (name || '').trim() || null);
  // E-posta doğrulama token'ı oluştur ve gönder
  const verifyToken = crypto.randomBytes(32).toString('hex');
  db.setVerifyToken(u.id, verifyToken);
  mailer.sendVerifyEmail(normEmail, verifyToken).catch(console.error);
  req.session.userId = u.id;
  res.json({ user: u, emailSent: true });
}

function loginHandler(req, res) {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email ve şifre gerekli' });
  }
  const normEmail = String(email).trim().toLowerCase();
  const row = db.userByEmail(normEmail);
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email veya şifre hatalı' });
  }
  req.session.userId = row.id;
  res.json({ user: { id: row.id, email: row.email, name: row.name } });
}

function logoutHandler(req, res) {
  if (req.session) {
    req.session.userId = null;
    if (typeof req.session.destroy === 'function') {
      return req.session.destroy(() => res.json({ ok: true }));
    }
  }
  res.json({ ok: true });
}

function meHandler(req, res) {
  if (!req.session || !req.session.userId) {
    return res.json({ user: null });
  }
  const u = db.userById(req.session.userId);
  res.json({ user: u || null });
}

// Şifremi unuttum
async function forgotPasswordHandler(req, res) {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email gerekli' });
  const normEmail = String(email).trim().toLowerCase();
  const user = db.userByEmail(normEmail);
  // Güvenlik: kullanıcı olsun olmasın aynı yanıt
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = Date.now() + 60 * 60 * 1000; // 1 saat
    db.setResetToken(user.id, token, expires);
    mailer.sendResetEmail(normEmail, token).catch(console.error);
  }
  res.json({ ok: true, message: 'Eğer bu e-posta kayıtlıysa sıfırlama linki gönderildi.' });
}

// Şifre sıfırla
function resetPasswordHandler(req, res) {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: 'Token ve şifre gerekli' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı' });
  const user = db.getUserByResetToken(token);
  if (!user) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş link' });
  db.updatePassword(user.id, hashPassword(password));
  db.clearResetToken(user.id);
  res.json({ ok: true, message: 'Şifreniz güncellendi. Giriş yapabilirsiniz.' });
}

// E-posta doğrula
function verifyEmailHandler(req, res) {
  const { token } = req.query || {};
  if (!token) return res.status(400).json({ error: 'Token gerekli' });
  const user = db.verifyEmailToken(token);
  if (!user) return res.status(400).json({ error: 'Geçersiz veya kullanılmış doğrulama linki' });
  res.json({ ok: true, message: 'E-posta doğrulandı!' });
}

// Doğrulama e-postasını yeniden gönder
async function resendVerifyHandler(req, res) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Giriş gerekli' });
  const user = db.userById(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });
  const full = db.userByEmail(user.email);
  if (full && full.email_verified) return res.json({ ok: true, message: 'E-posta zaten doğrulanmış' });
  const verifyToken = require('crypto').randomBytes(32).toString('hex');
  db.setVerifyToken(user.id, verifyToken);
  await mailer.sendVerifyEmail(user.email, verifyToken).catch(console.error);
  res.json({ ok: true, message: 'Doğrulama e-postası tekrar gönderildi.' });
}

// Organizatör başvurusu (Turnuva Kayıt Sistemi — Dilim B)
async function applyOrganizerHandler(req, res) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Giriş gerekli' });
  const user = db.userById(req.session.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' });

  if (user.role === 'admin') {
    return res.status(400).json({ error: 'Yöneticiler zaten tüm yetkilere sahip.' });
  }
  if (user.organizer_status === 'approved') {
    return res.status(400).json({ error: 'Zaten organizatörsünüz.' });
  }
  if (user.organizer_status === 'pending') {
    return res.status(400).json({ error: 'Başvurunuz zaten değerlendirmede.' });
  }

  const note = (req.body && req.body.note ? String(req.body.note) : '').trim().slice(0, 1000) || null;
  db.setOrganizerStatus(user.id, 'pending', note);

  // Tüm admin'lere bildir
  const adminEmails = db.usersByRole('admin').map(a => a.email).filter(Boolean);
  mailer.sendOrganizerRequestEmail(adminEmails, user, note).catch(console.error);

  res.json({ ok: true, organizer_status: 'pending', message: 'Başvurunuz alındı, değerlendirildikten sonra bilgilendirileceksiniz.' });
}

// Hesap sil
function deleteAccountHandler(req, res) {
  if (!req.session || !req.session.userId) return res.status(401).json({ error: 'Giriş gerekli' });
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Şifre gerekli' });
  const user = db.userByEmail(db.userById(req.session.userId)?.email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Şifre hatalı' });
  }
  const uid = req.session.userId;
  req.session.destroy(() => {});
  db.deleteUser(uid);
  res.json({ ok: true, message: 'Hesabınız silindi.' });
}

module.exports = {
  hashPassword, verifyPassword,
  requireAuth, requireAdmin, requireOrganizer, optionalAuth,
  registerHandler, loginHandler, logoutHandler, meHandler,
  forgotPasswordHandler, resetPasswordHandler, verifyEmailHandler,
  resendVerifyHandler, deleteAccountHandler,
  applyOrganizerHandler,
};
