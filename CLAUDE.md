# Dart Pulse — Agent Context

Bu dosya, kod tabanı üzerinde çalışacak ileri sürüm Claude ajanlarının (Sonnet/Haiku/Opus) hızlıca devralabilmesi için yazıldı. Lütfen iş başlamadan **önce** oku.

## Proje özeti

Dart Pulse, Türkçe bir dart turnuvası yönetim sistemidir. Tek elemeli, çift elemeli ve round-robin formatlarını destekler; tablet üzerinden skor girişi yapılır, TV ekranında bracket gösterilir, organizatör tarayıcıdan kontrol eder.

Şu an LAN'da çalışıyor (4 tablet + 1 Mac sunucu + 1 Windows TV). Kullanıcının orta-uzun vadeli hedefi: bunu Render üzerinde public web servisi olarak çalıştırmak, login olan herkes kendi turnuvasını oynatabilsin, ücretsiz sunmak, ileride Google AdSense + opsiyonel premium ($3-5/yıl) ile sunucu maliyetini karşılamak.

## Kullanıcı profili

- Adı: Ahmet Özbek (aozbek@gmail.com)
- Geliştirici değil ama mantıklı, pratik düşünüyor.
- UI dili **Türkçe** — tüm yeni metinler, label'lar, hata mesajları, modal başlıkları Türkçe olmalı.
- Ev kullanımı için başladı, public servise evrilecek.
- Donanım: Mac M4 (sunucu + organizatör), Windows PC (TV), 3 Android tablet + 1 iPad (skor board).
- Aşırı mühendislikten kaçının — sade, çalışan çözümler tercih ediyor.

## Teknoloji yığını

- **Backend**: Node 20 + Express + Socket.IO + better-sqlite3 + express-session
- **Frontend**: Vanilla JS + HTML + CSS (framework yok), Socket.IO client
- **Hosting (planlanan)**: Render Starter ($7/ay, kalıcı disk dahil)
- **Veritabanı**: SQLite (kalıcı disk üzerinde). 50+ eş zamanlı turnuvaya kadar yeter; ölçek gelince Postgres'e geçiş planı var (kod orta düzey refactor).

## Klasör yapısı

```
dart pulse/
├── server.js              # Express + Socket.IO + tüm endpoint'ler
├── src/
│   ├── auth.js            # Kayıt/giriş, session middleware
│   ├── db.js              # better-sqlite3 wrapper, şema, migrasyonlar
│   ├── match-engine.js    # X01 oyun motoru, throw kaydı, leg/set yönetimi
│   ├── scheduler.js       # Otomatik board atama (per-user)
│   └── tournament.js      # Bracket üretimi (single/double/RR), _createMatch wrapper
├── public/
│   ├── index.html         # Landing (organizer dashboard'a yönlendirir)
│   ├── login.html         # Giriş/kayıt
│   ├── organizer.html     # Organizatör arayüzü (turnuva oluştur, kura, bracket)
│   ├── board.html         # Tablet skor giriş arayüzü
│   ├── viewer.html        # İzleyici (sticky nav, multi-section)
│   ├── tv.html            # TV/kiosk modu (auto-rotate bracket)
│   ├── js/
│   │   ├── organizer.js, board.js, viewer.js, tv.js, login.js
│   └── css/style.css
├── scripts/seed-demo.js   # Örnek turnuva üretimi
├── render.yaml            # Render deploy konfigürasyonu (şu an free plan; Starter'a yükseltilecek)
└── README.md, LAN-SETUP.md
```

## Kod konvansiyonları (uy)

### 1. Multi-tenant scope
**Her DB sorgusu `userId` ile scope edilmiştir.** `db.js` içinde tüm `select`/`update`/`delete` fonksiyonları `userId` parametresi alır ve `WHERE user_id = ?` filtresi uygular. Yeni endpoint eklerken `req.session.userId` kullan, asla atla.

### 2. Match oluşturma — _createMatch wrapper
`src/tournament.js` içinde `_createMatch(common, ...)` adında bir helper var. Tüm bracket üretim yolları (single elim, double elim WB/LB/Final/GF, round-robin) bu wrapper'dan geçer. Wrapper, `stages.config_json.round_overrides` içindeki round-bazlı leg/set sayılarını uygular.

**Override anahtarı**: `${bracket}-${round}` — örn. `winners-1`, `losers-2`, `final-3`, `rr` (round-robin tek anahtar).

Yeni bir match oluşturma yolu eklersen **mutlaka `_createMatch`'ten geç**, doğrudan `db.createMatch` çağırma.

### 3. Şema migrasyonları
`db.js` başlangıcında `CREATE TABLE IF NOT EXISTS` blokları var, ardından geriye dönük uyumlu `ALTER TABLE ADD COLUMN` migrasyonları:

```js
const cols = db.prepare("PRAGMA table_info(table_name)").all().map(c => c.name);
if (!cols.includes('new_col')) {
  try { db.exec('ALTER TABLE table_name ADD COLUMN new_col TYPE DEFAULT ...'); } catch {}
}
```

Yeni kolon eklerken **mutlaka nullable veya DEFAULT'lu** ekle (eski kayıtları kırmasın). Kolonu hem `CREATE TABLE`'a hem migrasyon bloğuna ekle (taze DB için + mevcut DB için).

### 4. Promise-based modal pattern
Frontend'de modal göstermek için bu pattern kullanılıyor (örnek: `askFinishDarts`, `showLegSummary`, `board.js`):

```js
function myModal(args) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'my-modal';
    overlay.innerHTML = `...`;
    document.body.appendChild(overlay);
    const close = (val) => {
      overlay.remove();
      document.removeEventListener('keydown', keyHandler, true);
      resolve(val);
    };
    overlay.querySelector('button').onclick = () => close(value);
    const keyHandler = (e) => { /* Esc, Enter vb. */ };
    document.addEventListener('keydown', keyHandler, true);
  });
}
// Kullanım:
const result = await myModal(...);
```

### 5. CSS — tablet responsive
Skor board üç farklı tablet boyutunda çalışmalı (Android 10", iPad). `clamp(min, vmin, max)` kullan, sabit px verme. Her yeni modal/komponent için `clamp()`-bazlı font ve padding ölçekle. Örnekler `style.css`'te `.finish-prompt` ve `.leg-summary` blokları.

### 6. Socket.IO event'leri
- `match:update` — maç state'i değişti (her tarafa yayın)
- `match:throw` — yeni atış
- `match:finish` — maç bitti
- `tournament:update` — bracket değişti

Server `server.js` içinde, client tarafları `board.js`/`viewer.js`/`tv.js`/`organizer.js`. Yeni event eklerken her iki tarafı da güncelle.

### 7. JSON config saklama
Şema değişikliği gerektirmeyen ek ayarlar `stages.config_json` (TEXT, JSON parse) içinde. Örnek: `round_overrides`. Yeni opsiyonel ayarları buraya ekle, kolon açma.

## Tamamlanmış major özellikler

Görev numaralarıyla birlikte (TaskList sisteminde): #1-#46. Önemli olanlar:
- Üç format: single elim, double elim, round-robin (#3, #25, #28, #29)
- Multi-organizer + per-user scope (#30-#35)
- Otomatik board atama scheduler (#5, #18, #33)
- Üç-durumlu board UI: pre/live/post-match (#21, #22)
- Viewer + TV/kiosk modu (#9, #37, #38)
- Round-bazlı leg/set override paneli (#42, #43)
- Checkout dart sayısı (1/2/3) promptu — `darts_thrown` istatistiğini doğru hesaplıyor (#45)
- Leg-end mini özet modalı — her leg sonunda kazanan + ortalama + 180/140+/100+ pillleri (#46)
- LAN test hazırlığı — 4 tablet kurulumu (#41), `LAN-SETUP.md`

## Bekleyen yol haritası — production launch

### Faz 1: Render deploy (mevcut adım)
- `render.yaml`'ı `plan: starter` + `disks:` bloğuna çevir (kalıcı SQLite için)
- `data.db` yolunu `process.env.DB_PATH` ile parametrize et (Render disk mount path)
- `SESSION_SECRET` env variable
- `NODE_ENV=production` + `app.set('trust proxy', 1)` + `cookie.secure: true`
- HTTP → HTTPS redirect middleware
- Test: tabletlerden gerçek URL'e bağlan

### Faz 2: Production hardening
- E-posta onayı (Resend ya da SendGrid; ücretsiz tier yeterli)
- Şifre sıfırlama akışı (token + e-posta link)
- Captcha (hCaptcha — Cloudflare Turnstile bedava)
- Rate limiting (`express-rate-limit` — login/register endpoint'leri)
- Helmet.js (güvenlik header'ları)
- `pages/terms.html`, `pages/privacy.html`, `pages/cookies.html` — KVKK + GDPR uyumlu
- Çerez consent banner'ı
- Hesap silme + veri indirme (KVKK gereği)
- Otomatik yedekleme: cron + S3/Backblaze (haftalık SQLite snapshot)

### Faz 3: Public launch hazırlığı
- Cloudflare proxy (DDoS + cache + bedava)
- Sentry (hata izleme, ücretsiz tier)
- Plausible ya da Google Analytics
- Özel domain (~₺200-300/yıl)

### Faz 4: Gelir modeli
- AdSense başvurusu (1000+ ziyaret/ay sonrası)
- Premium altyapısı: Stripe Checkout, $3-5/yıl, ek özellikler (turnuva arşivi, custom branding, daha fazla oyuncu sınırı)
- Kullanıcı modelinde `tier: 'free' | 'premium'` kolonu — şimdiden ekleyebiliriz

## Karar verilmiş ama henüz uygulanmamış konular

- SQLite + kalıcı disk ile başla. 50+ eş zamanlı turnuvayı geçince Postgres'e geçiş.
- Public deploy: **Render Starter ($7/ay)**, ücretsiz tier'ın kalıcı diski yok.
- Gelir: Reklam + opsiyonel premium ikili model. AdSense onayı zor olduğundan premium altyapısını erken hazırla.
- Tek dilli (Türkçe) başla, gelecekte i18n eklenebilir.

## Doğrulama tarzı

Her büyük değişiklikten sonra:
1. `node --check src/*.js public/js/*.js server.js` (sözdizimi)
2. Etkilenen dosyaları açıp tutarlılık kontrolü
3. Mümkünse 1-2 satırlık integration smoke testi (`scripts/` altında örnek var)

Mevcut DB dosyası test verisiyle dolu (`data.db`) — silmek istemiyorsan migrasyon yazarken `ALTER TABLE` ile geriye dönük uyumlu git.

## Tarz tercihleri

- Türkçe konuş, Türkçe commit yaz, Türkçe yorum yaz.
- Kullanıcı non-technical — her büyük adımı kısaca açıkla, "neden" göster.
- Aşırı liste/madde ile boğma; kısa paragraflar tercih.
- Görsel feedback değerli — büyük UI değişikliklerinden sonra mockup widget göstermek faydalı oluyor (kullanıcı "scorer ekranı nasıl görünüyor" gibi sorularla istiyor).
- Yeni özellik eklemeden önce kısa bir plan paylaş, onay al, sonra uygula.
