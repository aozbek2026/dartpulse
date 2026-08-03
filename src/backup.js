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
let S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand;
try {
  ({ S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3'));
} catch (e) {
  S3Client = null;
}

// Olay-tetikli (turnuva oynanırken) yedek için debounce durumu.
// triggerBackup() her atışta çağrılabilir; en fazla BACKUP_MIN_INTERVAL_MIN
// dakikada bir gerçek yedek alınır (varsayılan 15 dk). Böylece maçlar oynanırken
// sık, boştayken hiç yedek alınır.
let _lastBackupAt = 0;
let _pendingTimer = null;

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
    _lastBackupAt = Date.now();
    console.log(`[backup] OK -> ${key} (${(gz.length / 1024).toFixed(0)} KB)`);
    // Başarılı yükleme sonrası eski yedekleri buda (asla throw etmez).
    try { await pruneOldBackups(client); } catch (e) { console.warn('[backup] temizlik uyarısı:', e.message); }
    return { ok: true, key, size: gz.length };
  } catch (e) {
    console.error('[backup] HATA:', e.message);
    return { ok: false, error: e.message };
  }
}

// Eski yedekleri siler: LastModified'ı BACKUP_RETENTION_DAYS'ten (varsayılan 60)
// eski olan tüm yedek dosyalarını kaldırır. Depolama sınırsız birikmesin diye.
// ASLA throw etmez; liste/silme paketleri yoksa sessizce atlar.
async function pruneOldBackups(client) {
  if (!ListObjectsV2Command || !DeleteObjectCommand) return;
  const days = parseFloat(process.env.BACKUP_RETENTION_DAYS || '60');
  if (!(days > 0)) return; // 0 veya geçersiz → temizlik kapalı
  const prefix = process.env.BACKUP_S3_PREFIX || 'backups/';
  const cutoff = Date.now() - days * 86400 * 1000;
  const Bucket = process.env.BACKUP_S3_BUCKET;
  let ContinuationToken = undefined;
  let deleted = 0;
  do {
    const out = await client.send(new ListObjectsV2Command({ Bucket, Prefix: prefix, ContinuationToken }));
    for (const o of (out.Contents || [])) {
      if (o.LastModified && o.LastModified.getTime() < cutoff) {
        await client.send(new DeleteObjectCommand({ Bucket, Key: o.Key }));
        deleted++;
      }
    }
    ContinuationToken = out.IsTruncated ? out.NextContinuationToken : undefined;
  } while (ContinuationToken);
  if (deleted) console.log(`[backup] temizlik: ${deleted} eski yedek silindi (>${days} gün)`);
}

// Turnuva oynanırken çağrılır (her atış/maç bitişinde). Debounce'lu: en fazla
// BACKUP_MIN_INTERVAL_MIN (varsayılan 15) dakikada bir gerçek yedek alır.
// Yapılandırılmamışsa hiçbir şey yapmaz.
function triggerBackup() {
  if (!isConfigured() || !S3Client) return;
  const minMs = Math.max(1, parseFloat(process.env.BACKUP_MIN_INTERVAL_MIN || '15')) * 60 * 1000;
  const since = Date.now() - _lastBackupAt;
  if (since >= minMs) {
    _lastBackupAt = Date.now(); // yarış durumunu önle: hemen işaretle
    runBackup();
  } else if (!_pendingTimer) {
    // Yakın zamanda yedek alındı; kalan süre kadar bekleyip bir kez al.
    _pendingTimer = setTimeout(() => { _pendingTimer = null; runBackup(); }, minMs - since);
    if (_pendingTimer.unref) _pendingTimer.unref();
  }
}

// Sunucu açılışında çağrılır. Yapılandırılmışsa: açılıştan ~30sn sonra bir kez,
// sonra her INTERVAL saatte bir yedek alır. Yapılandırılmamışsa hiçbir şey yapmaz.
function startSchedule() {
  if (!isConfigured()) {
    console.log('[backup] yapılandırılmamış (env var yok) — yedekleme kapalı');
    return;
  }
  const hours = parseFloat(process.env.BACKUP_INTERVAL_HOURS || '3');
  const ms = Math.max(0.1, hours) * 3600 * 1000;
  const minMin = parseFloat(process.env.BACKUP_MIN_INTERVAL_MIN || '15');
  console.log(`[backup] aktif — güvenlik ağı her ${hours} saatte bir + maç oynanırken en fazla ${minMin} dk'da bir`);
  // açılıştan kısa süre sonra ilk yedek
  setTimeout(() => { runBackup(); }, 30 * 1000);
  // periyodik; unref ile process kapanışını engellemez
  const timer = setInterval(() => { runBackup(); }, ms);
  if (timer.unref) timer.unref();
}

module.exports = { isConfigured, runBackup, startSchedule, triggerBackup, pruneOldBackups };
