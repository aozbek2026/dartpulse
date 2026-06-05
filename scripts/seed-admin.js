#!/usr/bin/env node
// Admin hesabı oluşturma / yükseltme scripti.
//
// Ne yapar:
//   1. users tablosunda 'role' kolonu yoksa ekler (default 'player').
//   2. Verilen e-postaya sahip kullanıcıyı bulur:
//        - varsa  -> role = 'admin' yapar (şifreye dokunmaz).
//        - yoksa  -> verilen şifreyle yeni admin kullanıcı oluşturur (email_verified = 1).
//
// Kullanım:
//   ADMIN_EMAIL=aozbek@gmail.com ADMIN_PASSWORD='guclu-bir-sifre' node scripts/seed-admin.js
//
// Production (Render) ortamında DB_PATH otomatik /data/data.db olur.
// Render Shell'den çalıştırmak için yukarıdaki komutu aynen kullanabilirsin.

const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

// --- scrypt hash (auth.js ile birebir aynı format) ---
const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCKSIZE = 8;
const SCRYPT_PARALLEL = 1;

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST, r: SCRYPT_BLOCKSIZE, p: SCRYPT_PARALLEL,
  });
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || '';

if (!email) {
  console.error('HATA: ADMIN_EMAIL gerekli. Örn: ADMIN_EMAIL=aozbek@gmail.com node scripts/seed-admin.js');
  process.exit(1);
}

const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');
console.log(`[seed-admin] DB_PATH = ${DB_PATH}`);

// 1) role kolonunu garanti et
const userCols = db.prepare('PRAGMA table_info(users)').all().map(c => c.name);
if (!userCols.includes('role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'");
  console.log("[seed-admin] 'role' kolonu eklendi (default 'player').");
}

// 2) kullanıcıyı bul / oluştur / yükselt
const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(email);

if (existing) {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
  console.log(`[seed-admin] Mevcut kullanıcı admin yapıldı: ${email} (id=${existing.id})`);
} else {
  if (!password || password.length < 6) {
    console.error('HATA: Yeni admin oluşturmak için ADMIN_PASSWORD gerekli (en az 6 karakter).');
    process.exit(1);
  }
  const info = db.prepare(
    "INSERT INTO users (email, password_hash, name, email_verified, role) VALUES (?, ?, ?, 1, 'admin')"
  ).run(email, hashPassword(password), 'Admin');
  console.log(`[seed-admin] Yeni admin oluşturuldu: ${email} (id=${info.lastInsertRowid})`);
}

console.log('[seed-admin] Tamam.');
