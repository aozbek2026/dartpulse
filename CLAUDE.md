# Dart Core Pro — Agent Context

Bu dosya, kod tabanı üzerinde çalışacak ileri sürüm Claude ajanlarının (Sonnet/Haiku/Opus) hızlıca devralabilmesi için yazıldı. Lütfen iş başlamadan **önce** oku.

**Domain:** [dartcorepro.com](https://dartcorepro.com)  
**Kaynak klasör (lokal):** `/Users/ahmetozbek/Desktop/dart core pro`

## ⚠️ KORUMALI MODÜLLER — DEĞİŞTİRMEDEN ÖNCE KULLANICIYA SOR

Aşağıdaki dosyalar canlı turnuvada kullanılıyor ve regresyon affetmiyor. Kullanıcıdan açık onay (**"evet"** cevabı yeterli) almadan **kod değişikliği yapma, refactor önerme, dosya silme/taşıma, şema migrasyonu ekleme**. Sadece okumak serbest. Bug-fix bile olsa önce planı yazılı paylaş, "evet" cevabı gelince başla.

**Skor motoru:**
- `src/match-engine.js`
- `public/js/board.js`
- `public/scorer.html` (cricket / FB Cezalı / Karambol blokları dahil)

**Board / tablet UI:**
- `public/board.html`
- `public/manifest-board.json`
- `public/css/style.css` içindeki `.conn-banner`, `.fs-toggle` ve board-spesifik bloklar

**Turnuva çekirdeği:**
- `src/tournament.js` (`_createMatch` wrapper, bracket üretimi — single/double elim, RR)
- `src/scheduler.js` (otomatik board atama)
- `src/db.js` içindeki `matches`, `tournaments`, `entries`, `stages` tablolarına yönelik **şema değişiklikleri** (yeni tablo eklemek serbest, bu tabloların yapısını değiştirmek değil)

**İstisnalar (sormadan yapılabilir):**
- Yazım/imla hatası düzeltme
- Türkçe metin/label rötuşları (anlam değişmediği sürece)
- Yorum satırı ekleme/güncelleme
- Console.log temizliği (debug amaçlı eklenmiş geçici log'lar)

**Açık onay sayılır:** Kullanıcı mesajında bu dosyalardan birinin adını/yolunu yazıp "değiştir / düzelt / ekle / refactor et" derse onay alınmış sayılır, ayrıca sormaya gerek yok.

## Proje özeti

Dart Core Pro, Türkçe bir dart turnuvası yönetim sistemidir. Tek elemeli, çift elemeli ve round-robin formatlarını destekler; tablet üzerinden skor girişi yapılır, TV ekranında bracket gösterilir, organizatör tarayıcıdan kontrol eder.

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
dart-core-pro/
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
│   ├── board.html         # Tablet skor giriş arayüzü (PWA — manifest-board.json)
│   ├── viewer.html        # İzleyici (sticky nav, multi-section)
│   ├── tv.html            # TV/kiosk modu (auto-rotate bracket)
│   ├── liga.html          # Lig/Sezon listesi (oluştur, sil, detaya git)
│   ├── competition.html   # Lig/Sezon detay (4 sekme: Özet, Oyuncular, Oturumlar, Klasman)
│   ├── session.html       # Oturum detay (bracket veya league_day round başlatma)
│   ├── manifest.json      # Scorer (Hızlı Skor) PWA manifest
│   ├── manifest-board.json # Board PWA manifest (display: standalone, landscape)
│   ├── js/
│   │   ├── organizer.js, board.js, viewer.js, tv.js, login.js
│   │   ├── liga.js        # Lig/Sezon liste sayfası
│   │   └── competition.js # Lig/Sezon detay sayfası
│   └── css/style.css
├── scripts/seed-demo.js   # Örnek turnuva üretimi
├── render.yaml            # Render deploy konfigürasyonu (şu an free plan; Starter'a yükseltilecek)
└── README.md, LAN-SETUP.md
```

## Kod konvansiyonları (uy)

### 0. Cricket logic duplikasyonu (ÖNEMLİ)
`scorer.html` (Hızlı Skor) **board.js** içindeki cricket / FB Cezalı / Karambol render + engine kodunu **birebir kopya** olarak içerir. Local-only çalıştığı için server'a bağlı değil.

**Cricket UI veya engine kuralı değiştirilirse iki yerde de değiştirilmeli:**
- `public/js/board.js` — turnuva skor ekranı (server'a bağlı)
- `public/scorer.html` — Hızlı Skor (local)

Etkilenen fonksiyonlar:
- Render: `renderCricketMatch`, `renderFBCezaliMatch`, `renderKarambolMatch`
- Helpers: `cricketMarkSym`, `cricketMarksHtml`, `fbTargetLabel`, `fbIsMetaTarget`, `cricketPendingForTarget`, `fbPendingForTarget`, `karambolPendingForTarget`
- Dart handlers: `cricketDart`, `fbDart`, `fbMetaTap`, `karambolDart`, `cricketUndoDart`, `fbUndoDart`, `karambolUndoDart`
- Engine: `applyCricketHits`, `submitFBCezaliDarts`, `submitKarambolDarts` (scorer'da local; board.js'de server'a POST)

İleride paylaşımlı modüle (`public/js/cricket-shared.js`) refactor planlanıyor — yapıldığında bu duplikasyon kalkar.

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

### 8. Rezerve edilmiş tablo adları (DOKUNMA)
Aşağıdaki tablolar üçüncü taraf middleware tarafından yönetilir. Bu isimlerle **yeni kolon ekleme, yeniden yaratma, ALTER TABLE yapma**:

- **`sessions`** — express-session middleware (BetterSQLiteStore, `server.js` içinde) tarafından yönetilir. Şema: `sid TEXT PK, sess TEXT, expired_at INTEGER`. Bu tabloya başka bir amaçla kolon eklersen login kırılır.

`db.js` içinde **iki HOTFIX migrasyonu** var (Mayıs 2026):
1. **HOTFIX-1 (sessions şeması):** Eğer `sessions` tablosu yanlış şemayla bulunursa (eski connect-sqlite3 stili `expired` kolonu, ya da başka bir varyant), DROP edilip BetterSQLiteStore şemasıyla yeniden yaratılıyor. Yan etki: aktif oturum cookie'leri geçersiz olur.
2. **HOTFIX-2 (session_results FK):** Lig sisteminin ilk versiyonunda `session_results` tablosu `FOREIGN KEY ... REFERENCES sessions(id)` ile yaratılmıştı. Sonra `sessions` yeniden yaratılınca (id kolonu yok artık) tüm INSERT'ler "foreign key mismatch" hatası attı — login kırıldı. HOTFIX-2 bu tabloyu tespit edip `competition_sessions(id)` FK'siyle yeniden yaratıyor.

**Genel ders:** Yeni tabloda FK kurarken, hedef tablonun adı + kolonu **gerçekten var** mı kontrol et. Şema migrasyonu yaparken FK ile bağlı child tabloları da güncellemen gerekebilir. SQLite FK validation, INSERT/UPDATE sırasında çalışır — INIT sırasında değil — yani CREATE TABLE'da geçen kötü FK sessizce kabul edilir, çakışma sonra patlar.

**Domain tabloları için `<domain>_sessions` adlandırması kullan** (örn. `competition_sessions`). JS helper'larının kısa adı (`createSession`, `sessionsForCompetition`) korunabilir; sadece SQL içindeki tablo adı farklılaşır.

> **Debug not:** `server.js` içindeki `BetterSQLiteStore.set` metoduna teşhis için `console.log('[session.set]', ...)` eklendi. Production'a çıkmadan önce kaldırılabilir; şu an her login'de bir satır log atıyor.

## Oyun modları

### Mevcut (uygulanmış)
- **501 / 701 / 1001**: Standart X01. Double'la bitirme zorunlu. `game_mode` değerleri: `'501'`, `'701'`, `'1001'`.
- **Cricket**: Klasik cricket. Hedefler: 15, 16, 17, 18, 19, 20, Bull (25). Her hedef 3 mark'ta kapanır. Rakip açıkken puan yazılır. Tüm hedefler kapalı + skor ≥ rakip → kazanır.

### Planlanmış (henüz uygulanmamış)

#### Cricket Full Board Cezalı
Standart cricket'in genişletilmiş versiyonu. Hedefler: 10-20, Bull, DOUBLE, TRIPLE, HOUSE (isteğe göre 10-11 çıkarılabilir). Her dart'ın nereye yazılacağını oyuncu seçer:
- Single N → N'e 1 mark
- Double N → N'e 2 mark **veya** DOUBLE hedefine 1 mark **veya** puan (2×N)
- Triple N → N'e 3 mark **veya** TRIPLE hedefine 1 mark **veya** puan (3×N)
- Double Bull (50) → Bull'a 1 mark **veya** DOUBLE'a 1 mark
- HOUSE → 3 dart aynı segmentte ise (double/triple dahil) HOUSE'a 1 mark **veya** 3 dartın toplam puanı
- Puan yazma: hedef kapalıysa ve rakip açıksa, o atışın değeri rakibe karşı yazılır
- Kazanma: tüm hedefler kapalı + skor ≥ rakip

#### Cricket Full Board Karambol
Aynı hedef seti ama puan yazma yok. Fark: tahtanın tamamı geçerli (T7 → TRIPLE, D3 → DOUBLE, küçük sayı segmentleri HOUSE için geçerli). Kazanma: tüm hedefleri ilk kapatan kazanır.

**UI notu:** Her iki Full Board modu, dart dart giriş + allocation seçimi gerektiriyor (visit toplamı yetmez). Standart cricket UI'ından farklı ekran tasarımı gerekecek.

**Doubles desteği:** Tüm oyun modları (501/701/1001, Cricket, Full Board Cezalı, Karambol) iki kişilik takımlar halinde oynanabilir. Mevcut doubles altyapısı (p1_sub_turn / p2_sub_turn, leg başı oyuncu seçimi) cricket modlarına da uygulanacak.


## Takım Maçı / Lig formatı (planlanmış, henüz uygulanmamış)

Ana sayfada ayrı bir "Takım Maçı" bölümü olacak. Mevcut bireysel turnuva sisteminden bağımsız.

Bir takım maçı **3 aşamadan** oluşur. Her aşama opsiyoneldir (organizatör hangilerinin oynanacağını seçer). Her aşamaya puan değeri atanır (0 = sadece eğlence için). En çok toplam puan alan takım kazanır.

### Aşama 1 — Tekli Maçlar
- Her takımdan oyuncular 1v1 karşılaşır, sıra kaptanlar tarafından belirlenir
- Her maç için oyun modu seçilebilir (default 501 DO), leg sayısı seçilebilir
- Eksik oyuncu → "Rakip Yok" → hükmen galibiyet (Bo5 → 3-0)
- Her maç galibi X puan alır (aşama başında belirlenir)

### Aşama 2 — 1001 Maçı (Bira Maçı)
- Takım bazlı X01: tüm oyuncular ortak 1001 skorundan düşürür
- Sırayla her oyuncu 3 ok atar, sıranın arkasına geçer (döngüsel)
- Oyuncu sayıları iki takımda eşit olmalı
- Default tek leg, leg sayısı seçilebilir
- Kazanan takıma X puan (0 olabilir — sadece eğlence)

### Aşama 3 — Eşli Maçlar
- Kaptanlar 2 kişilik çiftler oluşturur, sırayla eşleştirilir
- Her maç için oyun modu ve leg sayısı seçilebilir
- Her maç galibi X puan alır

### Genel
- Sezona yayılan organizasyon: hafta hafta iki takım karşılaşıyor
- Genel sezon tablosu: puan, galibiyet, mağlubiyet (ileride)
- Bracket/playoff aşaması opsiyonel (ileride)
- Takım isimleri girilecek
- Bir organizatör aynı anda birden fazla takım maçı yönetebilir (örn. aynı mekanda 4 takımın eş zamanlı maçları). Liste görünümünde her aktif takım maçı ayrı kart olarak gösterilir.

## Lig & Sezon Sistemi — Tasarım Kararları (Mayıs 2026)

Ayrıntılı mimari belge: `mimari_ozet.docx` (klasör kökünde)

### İki format

**Sezon (açık):** Her oturumda yeni oyuncu katılabilir. Organizatör sezon oluştururken kac oturum yapılacağını ve puan sistemini belirler. Bracket o gün gelenlere göre kurulur. Yeni oyuncu ilk katıldığı oturumdan itibaren klasmana girer.

**Lig (kapalı):** Bastan belirlenmiş sabit kadro. Organizatör oyuncu listesini, oturum sayısını ve "herkes birbirleriyle kaç kez karşılaşsın" sayısını girer. Sistem eşleşmeleri planlar.

### Hiyerarşi

```
competitions (lig/sezon)
 └── sessions → her oturum mevcut tournaments tablosuna bağlanır
      └── Bracket, tablet, skor: mevcut altyapı aynen çalışır
 └── playoffs / Ustalar (Masters)
 └── Genel Klasman + İstatistikler
```

### Veri modeli (yeni tablolar)

- `competitions` — tip (`season`|`league`), kategori, puan sistemi (JSON), oturum sayısı, user_id
- `competition_players` — oyuncu havuzu; birikimli puan + istatistikler; unique per competition
- `competition_sessions` — competition_id + tournament_id (mevcut tournaments'a FK) + session_number + session_type (`'bracket'`|`'league_day'`). **Adı kasten `sessions` değil** — bkz. Kod konvansiyonu #8. `league_day` tipi: turnuvası olmayan gün-konteyner; içinde birden fazla round çalıştırılabilir.
- `session_results` — oturum bitis pozisyonu + puan (FK: `competition_sessions.id`)
- `playoffs` — tip (`standard`|`masters`), katılımcılar (manuel seçim), kendi puan sistemi
- `league_matchups` — (sadece lig) kimin kiminle kaç kez oynadığı
- `league_schedule` — Berger/circle-method ile üretilmiş tur planı. Kolonlar: `competition_id`, `round_number`, `meeting_number`, `player1_id`, `player2_id` (BYE için NULL), `session_id` (hangi güne atandığı, NULL=henüz atanmamış), `tournament_id` (round başlatılınca yaratılan mini RR turnuvası). `leagueSchedule(compId)` helper'ı tournament durumundan türetilmiş `session_status` (`planned`|`running`|`finished`) döner.

**Kural:** Tüm yeni sorgular `user_id` ile scope edilmeli (mevcut kurala uygun).

### Puan sistemi

Sezon/lig oluşturulurken JSON olarak girilir: `{1: 10, 2: 7, 3: 5, "default": 1}`. Her sezon/lig farklı puan tablosuna sahip olabilir. Ustalar etkinliği için ayrı puan tablosu tanımlanır.

### Playoff & Ustalar (Masters)

- **Standart playoff:** Sezon bitince klasmandan ilk N oyuncu seçilir, bracket kurulur.
- **Ustalar:** İki kategorinin en iyileri birleşir (Genç Erkekler + Erkekler → Erkekler Ustalar; Genç Kadınlar + Kadınlar → Kadınlar Ustalar). Kendi puan sistemi var. Nihai sıralama = Sezon puanı + Ustalar puanı. Katılımcılar klasman ekranından manuel seçilir.

### Federasyon kullanımı

Kategoriler: Minikler, Yıldızlar, Genç Erkekler, Genç Kadınlar, Kadınlar, Erkekler, Veteran, Engelli (handicap ileride).
Her kategori bağımsız bir lig/sezon. Yılda 6 etkinlik, her etkinlik 4 gün, her gün = ayrı oturum = ayrı puan.
Tek oturumda eş zamanlı 40 maça kadar destek gerekiyor (Socket.IO kaldırır).
Organizatör yapısı: Faz 1'de tek admin hesabı yeterli. Faz 2'de alt-organizatör yetkilendirmesi eklenebilir.

### Oyuncu istatistikleri (sezon boyunca birikimli)

Klasman: toplam puan, oturum katılım oranı, maç G/M/%, leg G/M/%, 1./2./3. sayısı, podiyum sayısı, galibiyet serisi.
Atış: sezon 3DA, en yüksek maç 3DA, en yüksek tek ziyaret (High Turn), en yüksek finish, ortalama finish, 180 / 140+ / 100+ sayıları.
H2H (lig): iki oyuncu arası maç G/M + karşılıklı 3DA.

### Raporlama

- Canlı klasman sayfası (sezon boyunca anlık güncellenir)
- Excel (.xlsx) raporu indirilebilir — klasman + maç geçmişi + istatistikler ayrı sekmeler
- Federasyon için tüm kategoriler tek dosyada

### Sonraya bırakılanlar

- Handicap sistemi (kural seti netleştirilmedi)
- Alt-organizatör yetkilendirmesi
- Checkout yüzdesi (double deneme sayımı altyapısı gerektirir)
- Multi-kategori federasyon dashboard'u (Faz 2)

### Mevcut ilerleme — Dilim 1-4 (Mayıs 2026, tamam)

**Dilim 1 — DB + temel CRUD:**
- DB tabloları: `competitions`, `competition_players`, `competition_sessions`, `session_results`, `league_matchups`, `playoffs` (`src/db.js` CREATE TABLE bloğunda)
- DB helper'ları (hepsi userId scope'lu): `createCompetition`, `allCompetitions`, `competitionById`, `updateCompetition`, `deleteCompetition`, `addCompetitionPlayer`, `competitionPlayers`, `removeCompetitionPlayer`, `createSession`, `sessionsForCompetition`, `sessionById`, `updateSession`, `deleteSession`, `recordSessionResult`, `resultsForSession`
- REST API: `GET/POST /api/competitions`, `GET/PUT/DELETE /api/competitions/:id` — `requireAuth` korumalı
- Frontend: `public/liga.html` + `public/js/liga.js` — sezon/lig oluşturma formu (puan tablosu 1-8. pozisyon + diğerleri için varsayılan), liste görünümü, sil butonu (sadece draft). Organizer sidebar'ında **🏅 Ligler & Sezonlar** linki.

**Dilim 1'de uygulanan iki HOTFIX migrasyonu (önemli — bir daha kurmaya gerek yok):**
1. Eski DB'deki `sessions` tablosu connect-sqlite3 stili (`sid, expired, sess`) şemayla yaratılmıştı — BetterSQLiteStore `expired_at` istediği için login kırıktı. DROP + doğru semayla yeniden yaratıldı.
2. Lig sisteminin ilk yaratılış denemesinde `session_results.session_id` FK'si yanlışlıkla `sessions(id)`'ye bağlanmıştı; sonra `sessions` yeniden yaratılınca FK validation tüm INSERT'leri reddetti. HOTFIX-2 `session_results` tablosunu DROP + doğru FK ile (`competition_sessions(id)`) yeniden yarattı.

Detay: Kod konvansiyonu #8'e bak.

**Dilim 2 — Oyuncu havuzu:**
- Endpoint'ler: `GET/POST /api/competitions/:id/players`, `DELETE /api/competitions/:id/players/:playerId`
- POST hem `{name, nickname}` hem `{player_id}` kabul eder. Aynı isimde mevcut oyuncu varsa onu yeniden kullanır (cift kayıt önlenir), yoksa `players` tablosuna yeni kayıt yaratır. Status kontrolleri: lig=draft only, sezon=draft+running.
- Frontend: `public/competition.html` (yeni) + `public/js/competition.js` (yeni). 4 sekme: Özet, Oyuncular, Oturumlar, Klasman. Oyuncular sekmesi: lig için "kapalı kadro" uyarısı + min 2 oyuncu; sezon için "açık katılım" notu. Enter ile hızlı ekleme.
- `liga.js`'deki "Detay" butonu artık `/competition.html?id=X`'e yönlendirir.

**Dilim 3 — Oturum yaşam döngüsü + sonuçları işleme:**

*3a/3b — Oturum yarat/listele/sil:*
- Endpoint'ler: `GET/POST /api/competitions/:id/sessions`, `DELETE /api/competitions/:id/sessions/:sid`
- POST body: `{name?, session_date?, format, participant_player_ids[]}`. Arka planda `tournament.createTournament` çağırır, entries ekler, `competition_sessions`'a bağlar. Competition draft ise otomatik `running`'e geçer.
- Faz 1 sınırı: `team_mode=doubles` competition'larda oturum yaratma henüz desteklenmiyor (açıklayıcı hata mesajı).
- Format whitelist: `single_elim | double_elim | round_robin`.
- Frontend: Oturumlar sekmesinde "+ Yeni Oturum" formu (ad, tarih, format, katılımcı checkbox listesi + "Tümünü seç/Hiçbiri" butonları). Liste satırlarında "▶ Başlat / 🎯 Bracket / 📊 Bracket" linki → `/organizer.html?focus=ID` ile turnuvaya köprü.
- `organizer.js`'e küçük ek: turnuva kartlarına `id="tournament-X"` eklendi + `maybeFocusTournament()` sayfa yüklenince URL'den `?focus=ID` okuyup ilgili sekmeye geçer (`.tab-link[data-tab=tournaments/past-tournaments].click()`) + smooth scroll + 2 saniyelik altın highlight.

*3c — Sonuçları klasmana işle:*
- Yeni tournament helper: `tournament.computeFinalStandings(tournamentId)` — bracket-aware final sıralama.
  - `single_elim`: en yüksek round = final. Round R kaybedenleri `2^(maxRound-R)+1` pozisyonu paylaşır (SF=3 eşit, QF=5 eşit, vb).
  - `double_elim`: bracket='final' GF → 1/2. bracket='losers' rounds yukarıdan aşağıya 3, 4, 5...
  - `round_robin`: mevcut `computeRRStandings` (puan + leg-diff sıralı).
  - Her satır `{position, entry_id, player_id, p2_player_id, wins, losses, legs_won, legs_lost}` döner.
- Yeni db helper'ları: `sessionHasResults(sid)` (idempotent kontrol), `addToCompetitionPlayerStats(compId, pid, delta)` (tek UPDATE'le total_points, sessions_played, podium sayıları, maç ve leg sayılarını artırır).
- Endpoint'ler: `GET /api/competitions/:id/sessions/:sid/preview` (yazma yok, önizleme), `POST .../finalize` (idempotent, tek transaction'da session_results + competition_players birikimli stats; çift sayıma kapalı; session status'u finished).
- Sessions list response'unda `results_recorded` flag'i.
- Frontend: oturum satırında finished + işlenmemiş ise yeşil "✓ Sonuçları İşle" butonu. Tıklayınca önce GET preview → Promise-based modal'da sıralama (🥇🥈🥉, oyuncu adı, G-M, +X puan) → onay → POST finalize → "KLASMANDA" rozeti gelir.

**Dilim 4 — Klasman ekranı:**
- Backend değişiklik yok (mevcut `competition_players` verisi yeterli).
- Frontend: `renderStandings()` + `renderStandingsRow()`. Sütunlar: Sıra, Oyuncu (+lakap), Puan, Oturum, Podyum (🥇🥈🥉 sayıları), Maç G-M, Maç %, Leg G-M, Leg %. Yüzdeler mini progress bar (`.pct-bar`) ile gösteriliyor. 1./2./3. sıralarda renk + emoji vurgusu.
- Frontend tiebreaker sıralaması: `total_points DESC → matches_won DESC → leg diff DESC → name ASC`.
- Tüm refresh akışlarına (oyuncu ekle/çıkar, oturum yarat/sil, finalize) `renderStandings()` çağrısı eklendi — sonuç işlenince klasman anında güncellenir.

### Dilim 5 — tamamlanan ve bekleyen

**✅ Dilim 5b — Lig round-robin planlama + oturum akışı (Mayıs 2026, tamam):**
- DB: `league_schedule` tablosu. Berger/circle-method algoritması `src/tournament.js` içinde `buildLeagueSchedule(playerIds, meetCount)`. Tek sayılı oyuncu → BYE (NULL) eklenir. Toplam tur = (N−1) × meetCount, N=playerIds.length (çift yapıldıktan sonra).
- DB helper'ları: `saveLeagueSchedule(compId, rounds)`, `leagueSchedule(compId)` (tournament durumundan `session_status` türetilmiş), `linkRoundToSession(compId, roundNumber, sessionId, tournamentId)`.
- Backend endpoint'ler: `GET /api/competitions/:id/schedule` (plan önizleme), `POST /api/competitions/:id/generate-schedule` (planı üret + kaydet), `POST /api/competitions/:id/sessions/:sid/start-round` body: `{round_number}` — round için mini RR turnuvası yarat, `competition_sessions`'a bağla, `league_schedule`'ı güncelle.
- `competition.html` Oturumlar sekmesi: ligler için "league_day" konteyner oturum yaratma (format + katılımcı seçimi gizli, sadece ad + tarih). Buton adı "+ Yeni Gün". Satırlarda `renderLeagueDayRow()` → `session.html?id=X` linki.
- `session.html` league_day modu: "Bu Günde Oynatılan Roundlar" (başlatılmış) + "Oynanabilir Roundlar" (henüz atanmamış). Her round satırında çift listesi. "▶ Bu Günde Başlat" → `startRound(sid, compId, roundNumber)` → API → yeniden render.
- Bug fix: `submitNewSession()` lig için katılımcı koleksiyonunu atlar (form takılıp kalıyordu). Submit butonu istek sırasında devre dışı.
- Bug fix: `leagueSchedule()` `session_status` döndürmüyordu → done/active sayaçları hep 0'dı. Düzeltildi.

**✅ Dilim 5a — Excel (.xlsx) raporu (Mayıs 2026, tamam):**
- Backend: `src/competition-report.js` + `GET /api/competitions/:id/report.xlsx` (`server.js:1570`). `xlsx` (SheetJS) paketi (saf JS).
- 4 sekme: Klasman, oturum sonuçları, maç dökümü, atış istatistikleri.
- Frontend: `competition.html` üst barda "📊 Excel İndir" butonu (`downloadReport()` → yeni sekmede dosya indirir).

**✅ Sezon oturumu — Kura & Seri Başı (Haziran 2026, tamam):**
- Yeni turnuva modülündeki (organizer.js `drawLots` + seri başı) sistemin sezon oturum formuna uyarlaması. Sezon oturumu artık katılımcı seçildikten sonra araya bir kura/seri başı adımı koyabiliyor.
- Frontend: `competition.html` `#ns-seed-section` + `competition.js` `STATE.seedDraft` (`openSeedDraft`, `drawSeedLots`, `resetSeedDraft`, `renderSeedDraft`, `updateSeedValue`, sürükle-bırak `seedDrag*`). "🎲 Düzenle" seçili katılımcıları sıralı satırlara açar; seri başı input + "Kura Çek" (Fisher-Yates, seed'liler önde) + sürükle-sırala + "Sıfırla". Katılımcı seçimi değişince taslak `invalidateSeedDraft()` ile geçersizleşir.
- Backend: `server.js` sezon oturumu POST'u opsiyonel `entries: [{player_id, seed}]` kabul eder (`server.js:~1398`). Gelirse + tüm seçili katılımcıları kapsıyorsa sıra+seed uygulanır, aksi halde eski davranışa düşer (havuz sırası, seed yok). **Geriye dönük uyumlu** — `participant_player_ids` aynen çalışır. `tournament.createTournament` → `orderEntriesBySeed` zaten seed/sırayı uyguluyor, dokunulmadı.
- Lig (league_day) tarafına dokunulmadı — orası Berger planlamasıyla ayrı.
- Ustalar (Masters) roster akışı da değişmedi; kura bölümü sadece normal sezon oturumunda görünür.

**Bekleyen — Dilim 5c, 5d:**

5c. **Ustalar (Masters) + Playoff** — iki ayrı kavram, ayrı uygulama. Tasarım kararları (26 Mayıs 2026, kullanıcıyla netleşti):

  **5c-1: Ustalar (Masters)** — federasyon-kritik, **sıradaki iş bu**.
  - Konsept: "Sezonun son oturumu, sadece daha yüksek puan veriyor"
  - Ayrı entity DEĞİL — mevcut `competition_sessions` altyapısının özel bir varyantı
  - Uygulama: `competition_sessions` tablosuna `points_override_json` (TEXT, nullable) + `is_masters` (INTEGER, DEFAULT 0) kolonları
  - Frontend: yeni oturum formunda "🏆 Ustalar oturumu" checkbox + checked ise ayrı puan tablosu input
  - Backend: finalize'da `session.points_override_json` varsa onu kullan, yoksa `competition.points_json`
  - Puanlar **kalıcı** olarak `competition_players.total_points`'e eklenir (mevcut session finalize akışı)
  - Klasman/oturum listesinde 🏆 rozet
  - Dış kategori oyuncu daveti **yok** (şimdilik) — sadece sezonun kendi oyuncu havuzundan katılım. İhtiyaç netleşirse sonra eklenir.
  - **Katılımcı seçimi:** Klasmandan otomatik top-N + manuel değiştirme/çıkarma.
    - Organizatör "Ustalar'a kaç oyuncu katılacak?" sayısını girer (varsayılan 8)
    - Mevcut competition_players klasmanından (total_points DESC) ilk N otomatik seçilir
    - Her satırda "Değiştir" → o slot için pool'daki kalan oyuncular dropdown'da, biri seçilir (gelmeyen oyuncu yerine başkası gelirse)
    - Her satırda "Çıkar" → slot listeden silinir (toplam katılımcı azalır)
    - N input değişince roster top-N'den yeniden hesaplanır (manuel swap'lar sıfırlanır)
    - Submit: server'a normal `participant_player_ids[]` olarak gönderilir (mevcut endpoint)
  - Tahmini iş: 1.5-2 saat (tamamen frontend — backend zaten hazır)

  **5c-2: Playoff** — sezon/lig finalinde opsiyonel, federasyonca daha az kullanılır.
  - Ayrı entity — `playoffs` tablosu kullanılır (Dilim 1'de yaratıldı, kolon ekleme gerekebilir)
  - Format: tek eleme, çift eleme, RR, RR+tek eleme, RR+çift eleme (5 seçenek)
  - Entry mode: otomatik top-N veya manuel seçim (oluşturma anında seçtirilir)
  - Klasman: **ayrı** — sezona karışmaz. `competition_players.total_points` etkilenmez. Playoff'un kendi `standings_json`'u var.
  - Tek oturum (bir playoff = bir gün = bir turnuva)
  - Bracket üretimi: mevcut `tournament.createTournament` + `_createMatch` wrapper kullanılır
  - UI: `competition.html`'e yeni "🏆 Playoff" sekmesi (5.)
  - Tahmini iş: 4-5 saat

  **Temel ayrım (federasyon mantığı):**
  - Ustalar puanı sezona EKLENİR (additive) — "Genel klasmana eklediği değer daha fazla, normal bir oturumdan daha fazla puan veriyor"
  - Playoff puanı sezona EKLENMEZ (separate) — sezon klasmanı dokunulmaz, playoff kendi başına yarış
  - Federasyon çoğunlukla Sezon + Ustalar kullanır (her etkinlikte); Playoff opsiyonel finalde tercih edilir

5d. **Gelişmiş istatistikler** — şu an `match_stats` per-tournament bazında atılıyor (3DA, 180, 140+, 100+, highest finish). `competition_players.stats_json`'a birikimli aktarım için finalize endpoint'i genişletilmeli + klasmana yeni sütunlar/expandable satır. `tournamentPlayerReport(id)` zaten ihtiyacımız olan veriyi veriyor.

---

## Board güvenilirliği — Android Chrome tab discard (Mayıs 2026)

### Sorun
Canlı turnuvada Android tabletlerde board ekranı kendiliğinden kayboluyor, yerine Chrome'un arama önerisi geliyor (ör. "board2 arama sonuçlarını görmek için dokunun"). Her turnuvada birkaç kez tekrar ediyordu, skor girişi kesintiye uğruyordu.

### Kök neden
Android Chrome'un **tab discard** mekanizması: tablet düşük bellek altında veya başka uygulama öne alındığında arka plandaki "normal sekme"yi öldürüyor. Tablete dönüldüğünde URL çubuğu hatırlanıyor ama sayfa gitmiş — bazen Chrome history'den arama önerisi gösteriyor. Sebep server-side **değil** (Render Starter plan, sleep yok); tamamen client tarafında.

### Çözüm (uygulandı)
Dört katmanlı savunma — her biri ayrı bir hata modunu kapatıyor:

1. **Board kendi PWA'sı oldu** — `public/manifest-board.json` (`display: standalone`, `start_url: /board.html`, `orientation: landscape`). `board.html` <head> içinde `<link rel="manifest" href="/manifest-board.json">` + iOS/Android meta tag'leri. Tabletten "Ana ekrana ekle" yapılınca board kendi uygulama penceresi olarak açılır — Chrome'un tab discard'ına uğramaz, kendi recents kartı olur. (`display: fullscreen` yerine `standalone` — fullscreen Android'de geniş desteklenmiyor.)
2. **Wake Lock board.html'e eklendi** — `board.html` inline script'inde `navigator.wakeLock.request('screen')`, `visibilitychange` üzerinde yeniden talep. Ekran asla uyumaz → tab arka plana düşmez. **Yalnız HTTPS/localhost'ta çalışır**; LAN HTTP'de pasif (LAN-SETUP.md'deki bilinen kısıt).
3. **Socket disconnect banner'ı** — `board.js` başında `setupConnBanner()`: `socket.on('disconnect')` ve `socket.io.on('reconnect_attempt'/'error')` üstte büyük kırmızı banner (`.conn-banner`) gösterir, `socket.on('connect')` reconnect sonrası 1.5 sn yeşil "✓ Yeniden bağlandı" gösterip gizler. Skor girenler bağlantı kopunca anında fark eder.
4. **Board seçildikten sonra otomatik fullscreen** — `renderBoardPicker()` `<a class="card">` linkleri `data-board-id` ile etiketli, click handler:
   - `e.preventDefault()`
   - `requestFs()` çağrısı (Fullscreen API, user gesture içinde)
   - 30 ms sonra `location.href = href` navigate
   
   Navigate sırasında fullscreen kaybolursa yeni sayfada sağ üst köşede `#fs-toggle` butonu (⛶ Tam ekran) görünür — tek dokunuş yeterli. PWA standalone modunda CSS ile otomatik gizli (`@media (display-mode: standalone)`).

### Etkilenen dosyalar
- `public/manifest-board.json` (yeni)
- `public/board.html` (manifest link + meta + Wake Lock script + `#conn-banner` + `#fs-toggle` elementleri)
- `public/js/board.js` (`setupConnBanner`, `requestFs/isFs/updateFsToggle`, board picker click handler)
- `public/css/style.css` (`.conn-banner`, `.fs-toggle` stilleri)

### Tablet kurulum adımları (her tablet için, bir kerelik)
1. `dartcorepro.com/board.html` aç → giriş yap
2. Chrome üç nokta → "Ana ekrana ekle" → ismi "Board" bırak
3. Bundan sonra her seferinde ana ekrandaki Board simgesinden aç
4. Board seçince otomatik tam ekran; değilse sağ üstte ⛶ butonu

### Bilinmesi gereken
- Wake Lock LAN HTTP'de çalışmaz (tv.html için zaten dokümante edilmişti). LAN testlerinde tablet ekran-kapanma süresini "Hiçbir Zaman" yapılmalı.
- `manifest.json` (Hızlı Skor için, `start_url: /scorer.html`) ve `manifest-board.json` (Board için, `start_url: /board.html`) ayrı dosyalar — karıştırma. İkisi de scope `/` olduğu için aynı origin'de yaşıyor ama farklı sayfalar farklı manifest'e işaret ediyor.
- `scorer.html` (Hızlı Skor) bağımsız çalıştığı için bu değişikliklerden etkilenmedi — kendi `manifest.json`'u var.

---

## Lig akışı — board atama, round finalize, puan sistemi (Mayıs 2026)

Dilim 5b sonrası federasyon-öncesi smoke testlerinde ortaya çıkan birikmiş bug'lar ve eksik tasarım kararları bu bölümde kapatıldı. Lig akışı artık uçtan uca çalışıyor.

### Plan üretimi → otomatik "1. Gün"

`POST /api/competitions/:id/plan` endpoint'i artık üç şey yapıyor:
1. `db.generateLeaguePlan()` — Berger ile tüm round'ları `league_schedule`'a basar
2. Eğer competition'da henüz hiç oturum yoksa otomatik bir `league_day` oturumu açar (`name='1. Gün'`, `session_date=bugün`, `status=pending`)
3. Tüm round'ları (`session_id IS NULL` olanlar) bu güne bağlar

Plan yenilenirken (regenerate) mevcut günler korunur, yeni eklenen round'lar **en eski** güne bağlanır. Kullanıcı sonradan ek günler açabilir ve round'ları taşıyabilir.

Frontend tarafı: `competition.html` → "Oturumlar" sekmesi planı görsel olarak gösterir, "+ Yeni Gün" ile ek gün açılır. `session.html` → tek liste UX (gün başına bağlı round'ları sırayla gösterir; başka günden round çekme butonu mevcut).

### Round başlatma → board claim kuralları

`POST /api/competitions/:id/sessions/:sid/start-round` endpoint'inin board atama davranışı **üç katmanlı**:

1. **Board boşsa** (`tournament_id IS NULL`): doğrudan yeni round'un turnuvasına atanır
2. **Bağlı turnuva bitmişse** (`status='finished'`): yeni round'a atanır
3. **Aynı ligin başka round'una bağlı + şu an boşta** (`current_match_id IS NULL` veya `status='idle'`): yeni round'a atanır — *aynı lig içinde* round'lar arası board paylaşımı serbest

Farklı bir lig veya farklı bir turnuvanın board'una **dokunulmaz** (federasyon: 4 paralel kategoriye 4 ayrı board grubu varsa, bir kategorideki round'lar başka kategorinin board'una sıçramaz).

Aynı ligin tournament_id'lerini bulmak için `db.leagueSchedule(compId)` döndürdüğü tüm `tournament_id`'ler bir Set'e konuluyor; yeni başlatılan round'un tid'si de eklenir.

### Scheduler tetikleme noktaları (KRİTİK)

`scheduler.assignPendingMatches(io, userId)` çağrılmazsa `status='ready'` maçlar `board_id=NULL` halde askıda kalır, tabletlere düşmez. Çağrı yerleri:

- `/api/tournaments/:id/start` — turnuva manuel başlatma (sezon)
- `/api/boards/:id` PATCH — board'un turnuva ataması değiştirildiğinde (**yeni — eskiden yoktu, bug'dı**)
- `/api/competitions/:id/sessions/:sid/start-round` — lig round başlatma (**yeni — eskiden yoktu, bug'dı**)
- `match-engine` maç bitirdiğinde, `tournament.onMatchFinished` sonrası (mevcut)
- **Sunucu startup'ında bir kez** (`scheduler.assignPendingMatches(io, null)`) — restart sonrası askıda kalan state'leri toparlar

Yeni bir endpoint board veya match state'ini değiştiriyorsa scheduler çağrısı eklemeyi unutma. Aksi halde maçlar görünmez şekilde askıda kalır, kullanıcı "tabletlere maç gelmiyor" diye gelir.

### Round-bazlı finalize ve puan formülü

Lig için klasman finalize'ı **round-bazlıdır**, gün-bazlı değil. `POST /api/competitions/:id/rounds/:roundNumber/finalize` (`db.recordLeagueRoundResults`):

- Round'un tournament_id'sine bağlı tüm `finished` maçları okur
- Her oyuncu için `wins`, `losses`, `legs_won`, `legs_lost` toplar
- Formül: `pts = wins × points_json.match` (yoksa fallback 3)
- `addToCompetitionPlayerStats(compId, pid, ...)` ile birikimli yazar
- `sessions_played = 0` (round = oturum sayılmaz, gün konteyner)
- `league_schedule.results_recorded = 1` işaretler — idempotent (ikinci çağrı `{already: true}` döner)

`league_schedule.results_recorded` kolonu Mayıs 2026'da migrationla eklendi (eski DB'ler için `ALTER TABLE ADD COLUMN`). Aynı migration bloğunda `session_id`, `tournament_id`, `meeting_number` kolonları da eklenmiş eski DB'leri kurtarmak için.

Frontend tetikleyici: `session.html` round satırında round bitince "✓ Sonuçları İşle" butonu çıkar. Tıklayınca onay → API çağrısı → toast → klasman güncel.

### Lig puan sistemi UI ayrımı

`liga.html` formunda `type` seçimine göre iki ayrı puan bloğu var:
- **Sezon (`points-season-block`)**: 1.-8. pozisyon × puan grid'i + "Diğer pozisyonlar" → `points_json = {"1": 10, "2": 7, ..., "default": 1}`
- **Lig (`points-league-block`)**: tek alan "Maç başına puan" → `points_json = {"match": 3}`

`liga.js` → `syncTypeUI()` blokları toggle eder, `readPointsJson()` aktif moda göre doğru şekli üretir. Eski liglerde `points_json.match` yoksa server fallback 3 kullanır (geriye dönük uyumlu).

İleride lig için "Maç başına puan" değiştirme UI'ı ihtiyaç olursa: `competition.html` Özet sekmesine küçük edit alanı, `PUT /api/competitions/:id` ile `points_json` güncellenir.

### Yeni endpoint'ler (özet)

- `POST /api/competitions/:id/plan` — plan üret + otomatik 1. Gün (genişletildi)
- `POST /api/competitions/:id/rounds/:roundNumber/move` body `{session_id}` — başlatılmamış round'u başka güne taşı
- `POST /api/competitions/:id/rounds/:roundNumber/finalize` — round sonuçlarını klasmana işle
- `POST /api/competitions/:id/sessions/:sid/start-round` — round başlat (scheduler çağrısı eklendi, board claim genişletildi)
- `DELETE /api/competitions/:id/sessions/:sid` — league_day silmeden önce başlatılmış round var mı kontrolü eklendi

### Yeni helper'lar (db.js)

- `recordLeagueRoundResults(compId, roundNumber, userId)` — idempotent finalize
- `leagueRoundResultsRecorded(compId, roundNumber)` — durum sorgusu
- `linkRoundToSession()` artık `tournamentId=null` ile sadece session_id güncelleyebilir (taşıma için)
- `leagueSchedule()` çıktısı `results_recorded` flag'ini de döndürür

### Tanı araçları (scripts/)

- `scripts/lig-debug.js` — Aktif liglerin board/round/maç durumunu listeler. "Tabletlere maç gelmiyor" şüphesinde ilk başvuru. Çıktıdan: hangi board hangi turnuvaya bağlı, kaç ready maç var, kaçı board_id'siz.
- `scripts/scheduler-poke.js` — Çalışan sunucu varsa scheduler'i bir kez tetikler. Normalde gerekmez (startup poke + endpoint trigger'lar kapsayıcı), ama edge case için sigorta.
- `scripts/smoke-lig.js` — Uçtan uca lig akışını in-process test eder (lig aç, oyuncu ekle, plan üret, round başlat-bitir-finalize). Demo kullanıcısı gerektirir, kendi temizliğini yapar.

### Bilinmesi gereken edge case'ler

- **Round 1 yarım, Round 2 başlat**: Round 1'in 4 maçından 2'si oynanıyorsa o 2 board kilitli kalır, boşta olan diğer board(lar) Round 2'ye geçer. Round 1 maçı bitince scheduler aynı board'u Round 2'ye atar (aynı lig kuralı). Manuel müdahale gerekmez.
- **Plan yenileme oyuncu değişikliği sonrası**: `regeneratePlan` `session_id IS NULL` olanları silip yeniden üretir. Başlatılmış round'lar korunur. **Sınırlama**: oynanmış round'larda eski oyuncularla maç var; klasman bütünlüğü için plan yenileme dikkat ister, ideali ligi en başında doğru kurmak.
- **BYE oyuncusu**: Tek sayılı kadroda her round bir oyuncu boş. `bergerRounds()` BYE'lı pair'leri üretmez, yani `league_schedule.pairs`'da yok. UI: `session.html` round satırında "Boş: X" şeridi gösterilir (`STATE.players` ile pair'lerde olmayan oyuncuyu çıkararak). Klasmana etki yok — sadece round skoru için.
- **Aynı lig içinde paralel günler**: Teorik olarak mümkün — Gün 1'de Round 1 oynanırken Gün 2'de Round 2 başlatılırsa, aynı oyuncu hem Gün 1'de hem Gün 2'de yer alabilir; scheduler `busy` set'i nedeniyle aynı anda iki yerde olmasını engeller (entry1_id/entry2_id meşgul sayılır). Pratikte aynı oyuncu paralel iki tabletten oynayamaz, scheduler doğal olarak ikinci match'i bekletir.

---

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
- Board güvenilirliği: PWA manifest (`standalone`) + Wake Lock + disconnect banner + otomatik fullscreen (Mayıs 2026) — Android Chrome tab discard sorununu kapatır, ayrı bölüme bak
- BYE dağılım düzeltmesi: `seedWithByes()` artık `buildSeedOrder()` ile BYE'ları bracket'e eşit dağıtıyor — BYE vs BYE maçı oluşmuyor
- Lig/Sezon sistemi Dilim 1-4: DB + CRUD + oyuncu havuzu + oturum yaşam döngüsü + klasman (Mayıs 2026, ayrı bölüme bak)
- Lig planlama Dilim 5b: Berger/circle-method round-robin planlama, `league_schedule` tablosu, `league_day` oturum tipi, `session.html` round başlatma akışı (Mayıs 2026)
- Lig akışı tamamlama (Mayıs 2026): otomatik 1. Gün, round-bazlı finalize, scheduler tetikleme noktaları + startup poke, board claim 3 katmanlı kural (aynı lig boşta board paylaşımı serbest), liga.html lig/sezon puan formu ayrımı, tanı scriptleri — ayrı bölüme bak
- **Production deploy (26 Mayıs 2026)**: Lig & Sezon sistemi (Dilim 1-5b) + board PWA + Excel raporu altyapısı `dartcorepro.com` üzerinde canlıya alındı. Render Starter ($7/ay) + 1GB kalıcı disk (`/data/data.db`) + auto-deploy from `main`. Faz 1 (Render deploy) tamamlandı; sıradaki yol haritası Faz 2 hardening.
- **Tanıtım videosu / "DartCorePro Nedir?" (Haziran 2026)**: Anasayfaya gömülü, otomatik oynayan animasyonlu tanıtım — ayrı bölüme bak.

## Tanıtım videosu — "DartCorePro Nedir?" (Haziran 2026)

Anasayfaya (`public/index.html`) gömülü, kendi başına çalışan animasyonlu bir tanıtım. Gerçek video/ses değil; saf HTML+CSS+JS sahne animasyonu (ekran kaydı alınıp gerçek videoya da çevrilebilir).

### Dosyalar
- **`public/tanitim.html`** (yeni) — bağımsız tanıtım sayfası. ~9 sahne, ~45 sn, 16:9. Sahneler: intro → sorun → **gerçek braket (128, soldan tümü görünür sonra şampiyona zoom-in)** → otopilot board akışı → **gerçek tablet maç-öncesi ekranı (portrait)** → **gerçek tablet skor ekranı (portrait `.dp`)** → klasman → tüm ekranlar → CTA. Sağ üstte "↻ Baştan" ve vurgulu "**Geç ⏭**" butonu.
- **`public/index.html`** (değişti) — nav'a "**DartCorePro Nedir?**" linki (`#hp-about`, i18n `nav_about` TR/EN), tam ekran `.dcp-intro-overlay` + iframe, ilk-ziyaret otomatik açılış mantığı.

### Önemli tasarım kararları
- **Gerçek ekran kodu kullanılır, mockup değil**: Braket `organizer.js`'deki `renderBracketMatch` + `style.css` `.bracket*` yapısının birebir kopyası; tablet ekranları `board.js`'deki `renderPreMatch` ve X01 `.dp` markup'ının kopyası. Renkler uygulamanın gerçek paletinden (`--accent:#ff3860`, `--accent-2:#00d4ff`, `--bg:#0b0d14`).
- **Tablet ekranları portrait iframe içinde**: `.dp` ve maç-öncesi ekranı `vw` tabanlı ölçüler kullandığı için, ölçülerin çerçeveyle birebir örtüşmesi adına ekranlar **iframe `srcdoc`** içine gerçek CSS ile gömülür (iframe'in kendi viewport'u = çerçeve genişliği). iframe `body{display:flex;flex-direction:column;height:100vh}` olmazsa `.dp` taşıp keypad kesilir — bilinen tuzak.
- **Braket**: 128 oyuncu JS ile üretilir; önce tümü ekrana sığar, sahnenin 2. yarısında smoothstep ile Final/Şampiyon bandına zoom-in (`setupBracketPan`/`panBracket`, `BRACKET_SCENE` index'ine bağlı).
- **Stage** viewport'a tam oturur (`width:min(100vw,177.78vh);height:min(56.25vw,100vh)`) ki gerçek ekranların `vw` ölçüleri stage ile örtüşsün.

### Açılış / kapanış akışı
- **Sadece ilk ziyarette** otomatik açılır (`localStorage: dcp_intro_seen`). "DartCorePro Nedir?" linki her zaman tekrar açar.
- Video bitince **veya** "Geç"e basınca → iframe içindeyse `parent.postMessage('dcp-intro-done')` ile overlay kapanır ve anasayfa görünür; doğrudan `/tanitim.html` açıldıysa `location.href='/'`.
- Otomatik açılışı yeniden test: konsolda `localStorage.removeItem('dcp_intro_seen')` + reload.

### Yan deliverable'lar (repoya dahil DEĞİL, `promo/` klasöründe)
`dartcorepro-senaryo-storyboard.docx` (sahne planı + seslendirme metni), `dartcorepro-sosyal-medya.md` (Instagram/TikTok/YouTube metinleri). `public/tanitim.html` bunların güncel sürümüyle eşit.

## Braket görünümü düzeltmeleri — izleyici/TV/organizatör (Haziran 2026)

İzleyici (`viewer.js`) braketi kutuya sığmıyor, yatay scroll ile görünüyordu; ayrıca
Final kutusu solda çıkıyor ve ilk tur (R1) kutularının sol tarafında sarkan bağlantı
çizgileri kalıyordu. Üç ayrı sorun düzeltildi:

1. **Kutuya sığdırma (`fitBrackets`)** — `viewer.js` `renderElimBracketSVG` çıktısı artık
   sabit px'li bir iç katman (`.bracket-fit-inner`) içinde; `renderBracket()` sonrası ve
   `window.resize`'da çağrılan `fitBrackets()` her braketi kutu genişliğine göre
   `transform: scale(...)` ile küçültür (asla büyütmez). Ölçeklenince boş alan kalmasın
   diye kutu yüksekliği de düşürülür. Yatay scroll kalktı.

2. **ASIL BUG — `|| 99` → `?? 99`** — braket sütunlarını sıralayan `sortKeys`'te
   `order = { winners: 0, losers: 1, final: 2 }` map'i `order[ba] || 99` ile okunuyordu.
   `winners` değeri `0` (falsy) olduğu için `0 || 99 = 99` oluyor, tüm winners turları en
   sağa, `final` (2) ise sola kaçıyordu → **Final solda, R1 sağda, R1 kutularında soldan
   sarkan çizgiler**. `?? 99` (nullish) ile düzeltildi: `0` korunuyor, sıra artık
   `winners-1 → winners-2 → … → final` yani R1 solda, Final en sağda.
   - **Aynı bug üç dosyadaydı, üçü de düzeltildi:** `public/js/viewer.js`,
     `public/js/tv.js`, `public/js/organizer.js`. Gelecekte yeni bir braket renderer
     yazarken bu pattern'i (`order[x] || N`) kullanma; `??` kullan.

3. **Sarkan bağlantı çizgileri koruması** — `renderElimBracketSVG` connector döngüsü artık
   her çocuk maçın iki ebeveynini (`2i`, `2i+1`) bounds-check ediyor; sadece gerçekten var
   olan ebeveynler için çizgi çiziyor (BYE'lı / tek sayılı braketlerde boşluğa giden
   çizgileri engeller). Boş sütunlar da render öncesi filtreleniyor (hayalet sütun → Final
   yanlış konuma kaymasın).

Not: `organizer.js` korumalı modül listesinde DEĞİL; bu yüzden bug-fix doğrudan yapıldı.
`board.js`/`scorer.html` braket göstermiyor, etkilenmedi.

## Skor board görsel iyileştirmeleri — aktif yarı + atış flash (Haziran 2026)

Canlı turnuvada katılımcılardan iki görsel geri bildirim geldi, ikisi de skor mantığına
dokunulmadan (saf CSS + küçük JS) kapatıldı. `match-engine.js` ve `_createMatch`
akışına el sürülmedi.

### 1. Sıradaki oyuncunun yarısı belirginleştirildi
Eskiden aktif oyuncu sadece ince kırmızı yazı + 3px üst çizgi + neredeyse görünmez koyu
ton (`#140a10`) ile işaretliydi; uzaktan/hızlı bakışta okunmuyordu. Artık aktif yarı:
- Belirgin koyu kırmızı zemin (`#2a0e16`) — pasif yarı koyu lacivert kalır
- İsim **dolu kırmızı banda** (`#ff3860` zemin, beyaz yazı) alındı (eski: sadece kırmızı yazı)
- Yarı dört taraftan kırmızı çerçeveyle sarıldı: üst (isim kutusu `border-top`),
  sol/sağ/orta (gradient), alt (`.dp-scores::after`)
- Eşli (doubles) maçta kırmızı zeminde aktif alt-oyuncu adı + Ort/Set yazıları beyaza/açığa
  çekildi (kırmızı-üstü-kırmızı kontrast sorunu)

**ÖNEMLİ — çerçeve tek sürekli gradient'ten gelir (parça parça DEĞİL):** İlk denemede
çerçeve parça parça çiziliyordu (isim kutusu `border` + skor hücrelerinde `box-shadow:inset`).
İki sorun çıktı: (a) kalan-skor kutusu ile boş orta bölge arasında çentik, (b) isim satırı
`1fr` grid kolonundan, skor alanı gradient `%50`'den çizdiği için orta dikey çizgiler **1px
kayıyordu** (grid track yuvarlaması ≠ %50). Çözüm: aktif yarının **tüm zemini + sol/sağ/orta
dikey pembe çizgileri tek bir `linear-gradient`** ile çiziliyor ve bu **aynı gradient hem
`.dp-names` hem `.dp-scores`'a** uygulanıyor (ikisi de `.dp` içinde aynı genişlikte → `%50`
birebir aynı piksel). Orta sütun genişliği `clamp(18px,7.4vw,36px)`, gradient'te yarısı
`clamp(9px,3.7vw,18px)` olarak `calc(50% ∓ ...)` ile kullanılır. Atış satırları/rem satırı
artık **kendi zemin/kenarlarını çizmez** (şeffaf), tek katmanın üstüne oturur → hiç ek yeri yok.

İlgili kurallar `public/css/style.css`: `.dp-scores.p1-active, .dp-names.p1-active` (+ p2)
gradient'leri, `.dp-scores::after` (alt kenar), `.dp-name-col(.active)` (sadece üst kenar +
metin renkleri, zemin/yan kenar YOK), `.dp-names-mid` (şeffaf orta hücre), `.dp-pname-sub`,
`.dp-meta` active override'ları. Markup tarafı (`board.js` + `scorer.html`): `.dp-names`'e
`p1-active|p2-active` class'ı + araya boş `<div class="dp-names-mid">` eklendi (isim satırı da
skor alanı gibi 3 kolonlu olsun diye). Vurgunun yön bilgisi zaten `current_turn`'den geliyor.

### 2. Atış flash modalı
Kısa leg'lerde atış çok hızlı kaydedildiği için katılımcılar "sayı girdi mi?" diye emin
olamıyordu. Artık Enter/Gönder ile atış kaydedilince ekran ortasında büyük rakam (~3-4cm,
`clamp(72px,16vmin,150px)` yükseklik) **~1 sn** belirip soluyor; bust'ta kırmızı "Bust".
- `board.js`: `submitScore` içinde başarılı POST sonrası `showScoreFlash(text, isBust)`
  çağrısı (yeni helper). **Tıklamayı engellemez** (`pointer-events: none`) — input açık kalır.
  Leg bittiyse zaten `showLegSummary` açıldığı için flash **gösterilmez** (çakışma önleme).
- `style.css`: `.score-flash-modal` (+ `.show`, `.bust`, `.score-flash-num`). `position:fixed`
  + opacity/scale geçişi. Mevcut `.score-flash` (keypad parıltısı) ile karıştırma — bu ayrı.

### Hızlı Skor (scorer.html) — uygulandı
İkisi de `scorer.html`'e taşındı. CSS ortak (`/css/style.css`) olduğu için aktif yarı
gradient'i + flash stilleri otomatik geçti; tek gereken markup'tı: `.dp-names`'e
`p1-active|p2-active` class'ı + `.dp-names-mid` boş hücresi eklendi. Atış flash'ı (`showScoreFlash`
+ `submitVisit` içindeki çağrı) zaten `scorer.html`'de mevcuttu. Cricket duplikasyon kuralı
(Kod konvansiyonu #0) board.js ↔ scorer.html eşitliği için hâlâ geçerli — gelecekte board
görselini değiştirirsen scorer'ı da güncelle.

### Bekleyen: viewer/TV'ye taşıma
Aktif yarı vurgusu şimdilik sadece tablet board'unda. İzleyici (`viewer.js`) ve TV (`tv.js`)
ayrı renderer kullanıyor; istenirse oralara da benzer vurgu taşınabilir.

## Takım Maçı — Yarın Yapılacaklar (öncelik sırası)

1. **Tablet entegrasyonu**: Phase maçlarını board'lara gönder. Tablet üzerinden oyna, maç bitince sonuç otomatik team_phase_match'e yazılsın ve sıradaki maça geçilsin.
2. **Katılımcı yönetimi**: `team.html` sol menüsüne "Katılımcılar" sekmesi. İki takım adı girilir, her takıma oyuncu listesi eklenir (takım bazlı, turnuva player pool'undan ayrı).
3. **Maç oluştururken takım bazlı seçim**: Tekli/eşli/bira maç ekleme satırlarında serbest metin yerine takıma göre filtrelenmiş oyuncu dropdown'u.
4. **Bracket yeniden tasarımı**: Mevcut bracket görünümü çirkin, sıfırdan düzgün görsel bracket (bağlantı çizgileri, dikey hizalama).

---

## Turnuva Kayıt Sistemi — Tasarım (Haziran 2026, beyin fırtınası tamam, KOD BEKLİYOR)

Ayrıntılı tasarım belgesi: `turnuva-kayit-sistemi-tasarim.docx` (klasör kökünde). Aşağısı özet.

**Amaç:** Organizatör ileri tarihli turnuvayı "event" olarak açar; katılımcı kendi hesabıyla online kayıt olur; turnuva günü yüz yüze check-in ile gerçek liste netleşir; "Confirm" anında mevcut turnuva motoruna (players/entries) aktarılır. Kariyer istatistikleri opsiyonel olarak katılımcı profilinde tutulur.

**Temel ilkeler:** (1) Korumalı modüllere (`tournament.js`, `scheduler.js`, `match-engine.js`, `board.js`, `scorer.html`) DOKUNMADAN, additive. Yeni katman "Confirm" anına kadar bağımsız yaşar. (2) Tüm yeni özellikler turnuva bazında OPSİYONEL (3 kutucuk).

### Roller (tek hesap, çoklu yetki)
- **Katılımcı (player):** herkeste var, kayıt anında otomatik default. Kayıt ekranı sade kalır (rol seçimi YOK).
- **Organizatör:** kayıtta değil, giriş sonrası "Organizatör Ol" başvurusuyla istenir; admin onayıyla aktif. Durum: `none → pending → approved/rejected` (rejected tekrar başvurabilir). Başvuruda admin'e e-posta gider.
- **Admin:** DB'deki `role` alanından okunur (koda gömülü e-posta DEĞİL — ileride çoklu admin için). İlk admin `scripts/seed-admin.js` ile tohumlanır. "Son admin koruması": sıfır-admin kilitlenmesi engellenir.

### Admin paneli (`admin.html`, ayrı sayfa, sadece role='admin')
Bekleyen başvurular onay/red · onaylı organizatörler (yetki geri al) · tüm turnuvalar (yayında + geçmiş) sonlandır/sil/geçmişle sil · (gelecek) başka admin atama.

### Turnuva oluşturmada 3 opsiyonel kutucuk
- **Online kayıt** açık → "Gelecek Turnuvalar"da görünür, kayıt + yedek liste işler. Kapalı → eski usul elle ekleme.
- **Check-in** açık → gün-içi yüz yüze check-in aşaması.
- **İstatistik tutulsun** açık → maç istatistikleri katılımcı profiline işlenir.
- Bağımlılık: istatistiğin katılımcı PROFİLİNDE birikmesi için online kayıt + `players.account_user_id` bağı gerekir. "İstatistik tutulmasın" = (a) maç anında her şey normal hesaplanır (motor zorunlu), sadece turnuva sonu kariyer AKTARIMI atlanır. Korumalı modüle dokunulmaz.

### Online kayıt akışı + durum makinesi
Kayıt → (kontenjan doluysa) yedek liste → iptal her zaman serbest, iptalde yedek başı otomatik asıl listeye akar (kayıt sırasına göre) → gün-içi organizatör check-in'i manuel açar, geleni yüz yüze işaretler, gelmeyen yerine yedek alınır → "Katılımcıları Onayla" (Confirm) = mevcut motora transfer.
Registration durumları: `registered | waitlisted | checked_in | confirmed | withdrawn | no_show`.

### Bildirim
Otomatik bildirim YOK (her iki taraf panelden görür). Tek e-posta: organizatör başvurusu → admin.

### Katılımcı profili: MVP orta seviye (katıldığı turnuvalar + sonuç, maç G/M, kariyer 3DA, en iyi checkout, toplam 180). Sadece online-kayıt+istatistik-açık turnuvalar görünür.

### Önerilen veri modeli (additive, geriye dönük uyumlu)
- `users`: `role TEXT DEFAULT 'player'`, `organizer_status TEXT`, `organizer_note TEXT`
- `players`: `account_user_id INTEGER` (elle girilende NULL)
- `tournaments`: `reg_enabled`, `checkin_enabled`, `stats_to_profile` (INTEGER DEFAULT 0), `category`, `capacity`, `reg_deadline`, `checkin_time`, `event_date`, `description`
- Yeni tablo `registrations`: id, tournament_id, user_id, status, reg_order, player_id (Confirm'de bağlanır), created_at/updated_at

### Dilim planı (sıra A→G, her dilim öncesi kısa plan + onay)
- **A** Rol altyapısı (users kolonları + `seed-admin.js` [HAZIR] + requireAdmin)
- **B** Organizatör başvuru akışı (+ mailer `sendOrganizerRequestEmail`)
- **C** Admin paneli (`admin.html`)
- **D** Event oluşturma opsiyonları (3 kutucuk + ek alanlar)
- **E** Online kayıt + yedek liste + "Gelecek Turnuvalar" + "Turnuvalarım"
- **F** Check-in + Confirm (→ players/entries transfer)
- **G** Katılımcı profili + koşullu kariyer aktarımı

### E-posta durumu (kontrol gerekiyor)
`src/mailer.js` Resend ile hazır ama: (1) `RESEND_API_KEY` `render.yaml`'da YOK — Render panelinden manuel set edilmediyse production'da da mail gitmiyor (no-op). (2) FROM hâlâ test adresi `onboarding@resend.dev`; gerçek `noreply@dartcorepro.com` için Resend'de domain doğrulama (DNS) + `EMAIL_FROM` env gerekir. Yerelde `.env` yok → yerel testte mail gitmez (beklenen).

---

## Bekleyen yol haritası — production launch

### Faz 1: Render deploy ✅ TAMAMLANDI (26 Mayıs 2026)
- `render.yaml` → `plan: starter` + `disk: sqlite-data` (`/data`, 1GB) ✅
- `DB_PATH=/data/data.db` env var ✅
- `SESSION_SECRET` Render tarafından otomatik üretiliyor (`generateValue: true`) ✅
- `NODE_ENV=production`, `trust proxy`, secure cookie'ler ✅
- Auto-deploy: `main` branch'e push → Render build başlatır
- Build komutu: `npm install && npm rebuild better-sqlite3 --build-from-source` (native modül için zorunlu)
- Canonical host redirect (`a1ab6dc` commit): tüm istekler `dartcorepro.com`'a 301
- Bilinmesi gereken: HOTFIX-1 (sessions tablosu DROP) ilk deploy'da tetiklendi — eski cookie'ler düştü, yeniden giriş gerekti. Bir daha tetiklenmez.

### Faz 2: Production hardening (sıradaki)
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

## Yerel geliştirme notları

- **`resend` paketi opsiyoneldir.** `src/mailer.js` içinde `require('resend')` try/catch ile sarmalanmış — paket yoksa server sessizce email göndermeden kalkıyor. Email göndermek gerekirse: `npm install resend` + `RESEND_API_KEY` env var. Yerel LAN testlerinde gerek yok.
- **Demo kullanıcı**: Mevcut `data.db`'de tek hesap var: `demo@dart.local`. Şifre kaybolursa yeni şifre belirleme komutu:
  ```bash
  node -e "
    const auth = require('./src/auth'), db = require('./src/db');
    db.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(auth.hashPassword('YENI_SIFRE'));
    console.log('OK');
  "
  ```
  Bu komutu çalıştırmadan ÖNCE `npm start`'ı durdur (Ctrl+C), sonra çalıştır, sonra tekrar başlat — aksi halde foreground sunucu öldürür.

## Ölçek / Performans — snapshot yayını (Haziran 2026)

Soru: "Aynı anda kaç 512 kişilik turnuva sorunsuz çalışır?" İncelemede asıl darboğazın
turnuva büyüklüğü değil, `server.js`'teki **snapshot yayını (broadcastState)** olduğu
görüldü. Eski hâlde her atış (`/api/matches/:id/throw`), bağlı **her socket için ayrı
ayrı** `getSnapshot(uid)` çağırıyordu — yani 512 kişilik bir turnuvada koca bracket ağacı
(511 maç + 512 entry + entry başına `tournamentPlayerReport` agregasyonu) her atışta,
her cihaz için yeniden kuruluyordu. 40 tabletli bir organizatörde bu = atış başına 40×
yeniden kurulum.

**Skoru giren tablet bundan etkilenmiyordu zaten** — board.js canlı güncellemeyi
`board:state` (scoped) + `match:update` (sadece matchId) ile alıyor. Ağır `state`
snapshot'ı yalnızca izleyici/TV/organizatör dashboard'u + board seçim ekranı için.

Üç katmanlı optimizasyon (hepsi `server.js`, korumalı modüllere dokunulmadı):
1. **`flushBroadcast`** — yayın başına uid başına snapshot'ı **tek sefer** kurar
   (`Map<uid, snapshot>`), aynı uid'li tüm socket'lere aynı nesneyi gönderir. Cihaz
   sayısı çarpanını kaldırır.
2. **`scheduleBroadcast`** — trailing debounce, varsayılan **500ms** (`BROADCAST_DEBOUNCE_MS`
   env ile ayarlanabilir, Render'da kod değişmeden). Tüm 30+ `broadcastState()` çağrısı
   buna çevrildi. Aynı tick'teki burst tek yayına iner; yayın hızı atış hızından bağımsız
   (500ms → ~2 yayın/sn tavan). Yalnızca izleyici/TV/organizatör panelini geciktirir; skoru
   giren board zaten ayrı event'le anlık güncelleniyor, spectator bir maça girince o maç da
   `match:update` ile anlık yenilenir. ~750ms üstünde TV'de canlı skor aynası gözle görülür
   gecikir, CPU kazancı ihmal edilebilir (yayın başı maliyet zaten ~2-5ms).
3. **`cachedReport`** — en pahalı sorgu olan `tournamentPlayerReport` 1.5sn TTL cache'e
   alındı (maç bitmeden anlamlı değişmez). İstemci payload şekli değişmedi.

**Ölçüm** (`scripts/load-snapshot-bench.js` — gerçek db.js ile Mac'te çalıştırılır;
sandbox'ta node:sqlite ile alınan tahmini rakamlar): 4 turnuva × 512 oyuncu × 40 cihaz
senaryosunda yayın maliyeti ~245ms → ~2ms (**~112×**). ~0.5 vCPU Starter'da eş zamanlı
bağımsız organizatör tavanı kabaca 0 → ~27'ye çıkıyor. Tek organizatör + birkaç 512'lik
turnuva (federasyon: 4 kategori, ~40 board) artık tek instance'ta rahat.

Not: Postgres'e geçiş hâlâ 50+ eş zamanlı turnuva eşiğinde geçerli; bu optimizasyon o
eşiği yukarı taşır ama değiştirmez.

## Karar verilmiş ama henüz uygulanmamış konular

- SQLite + kalıcı disk ile başla **(uygulandı, canlıda Render Starter + 1GB disk)**. 50+ eş zamanlı turnuvayı geçince Postgres'e geçiş.
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
