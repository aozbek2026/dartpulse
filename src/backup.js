// Bulut yedekleme — SQLite veritabanının tutarlı bir kopyasını alıp gzip'leyerek
// S3-uyumlu bir bulut deposuna (Cloudflare R2, Backblaze B2, AWS S3...) yükler.
//
// TAMAMEN OPSİYONEL VE GÜVENLİ: Gerekli env var'lar set değilse modül "kapalı"
// kalır, hiçbir şey yapmaz, sunucu davranışı hiç değişmez. Yedekleme verityabanını
// SADECE OKUR (better-sqlite3 online backup) — canlı turnuvayı kesmez, kilitlemez.
//
// Gerekli env var'lar (Render panelinden girilir):
//   BACKUP_S3_ENDPOINT   - depo endpoint URL'i (ör. https://<accountid>.r2.cloudflarestorage.com)
//   BACKUP_S3_BUCKET     - bucket adı (ör. dartcorepro-yedek)
//   BACKUP_S3_KEY_ID     - erişim anahtarı ID
//   BACKUP_S3_SECRET     - gizli anahtar
// Opsiyonel:
//   BACKUP_S3_REGION     - bölge (varsayılan 'auto', R2 için uygun)
//   BACKUP_S3_PREFIX     - klasör öneki (varsayılan 'backups/')

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const db = require('./db');

function isConfigured() {
  return !!(
    process.env.BACKUP_S3_ENDPOINT &&
    process.env.BACKUP_S3_BUCKET &&
    process.env.BACKUP_S3_KEY_ID &&
    process.env.BACKUP_S3_SECRET
  );
}

// aws-sdk opsiyonel: paket yoksa modül çökmesin (resend pattern'i gibi)
let S3Client, PutObjectCommand;
try {
  ({ S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'));
} catch (e) {
  S3Client = null;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Veritabanının tutarlı bir kopyasını geçici bir dosyaya alır (online backup —
// canlı DB'yi kilitlemez). Sonra gzip'ler ve buffer döner.
async function makeSnapshotBuffer() {
  const tmpFile = path.join(os.tmpdir(), `dcp-backup-${Date.now()}.db`);
  // better-sqlite3 online backup API'si — Promise döner
  await db.db.backup(tmpFile);
  try {
    const raw = fs.readFileSync(tmpFile);
    return zlib.gzipSync(raw);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// Tek seferlik yedek çalıştırır. Başarı/atlama bilgisini döner; ASLA throw etmez
// (yedek hatası sunucuyu etkilememeli).
async function runBackup() {
  if (!isConfigured()) {
    return { ok: false, skipped: true, reason: 'env var yok' };
  }
  if (!S3Client) {
    console.warn('[backup] @aws-sdk/client-s3 paketi yok — yedek atlandı');
    return { ok: false, skipped: true, reason: 'paket yok' };
  }
  try {
    const gz = await makeSnapshotBuffer();
    const prefix = process.env.BACKUP_S3_PREFIX || 'backups/';
    const key = `${prefix}data-${timestamp()}.db.gz`;
    const client = new S3Client({
      region: process.env.BACKUP_S3_REGION || 'auto',
      endpoint: process.env.BACKUP_S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.BACKUP_S3_KEY_ID,
        secretAccessKey: process.env.BACKUP_S3_SECRET,
      },
      // R2/B2 gibi sağlayıcılar için path-style genelde gerekir
      forcePathStyle: true,
    });
    await client.send(new PutObjectCommand({
      Bucket: process.env.BACKUP_S3_BUCKET,
      Key: key,
      Body: gz,
      ContentType: 'application/gzip',
    }));
    console.log(`[backup] OK -> ${key} (${(gz.length / 1024).toFixed(0)} KB)`);
    return { ok: true, key, size: gz.length };
  } catch (e) {
    console.error('[backup] HATA:', e.message);
    return { ok: false, error: e.message };
  }
}

// Sunucu açılışında çağrılır. Yapılandırılmışsa: açılıştan ~30sn sonra bir kez,
// sonra her INTERVAL saatte bir yedek alır. Yapılandırılmamışsa hiçbir şey yapmaz.
function startSchedule() {
  if (!isConfigured()) {
    console.log('[backup] yapılandırılmamış (env var yok) — yedekleme kapalı');
    return;
  }
  const hours = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '24');
  const ms = Math.max(1, hours) * 3600 * 1000;
  console.log(`[backup] aktif — her ${hours} saatte bir yedek alınacak`);
  // açılıştan kısa süre sonra ilk yedek
  setTimeout(() => { runBackup(); }, 30 * 1000);
  // periyodik; unref ile process kapanışını engellemez
  const timer = setInterval(() => { runBackup(); }, ms);
  if (timer.unref) timer.unref();
}

module.exports = { isConfigured, runBackup, startSchedule };
