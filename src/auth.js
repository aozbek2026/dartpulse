// Auth: register/login + session middleware
// Node crypto.scrypt ile şifre hash (bcrypt bağımlılığı yok).
const crypto = require('crypto');
const db = require('./db');

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
  req.session.userId = u.id;
  res.json({ user: u });
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

module.exports = {
  hashPassword, verifyPassword,
  requireAuth, optionalAuth,
  registerHandler, loginHandler, logoutHandler, meHandler,
};
