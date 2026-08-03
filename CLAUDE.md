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

## 🔁 TUTARLILIK KURALI — bir değişiklik = HER yerde aynı (kullanıcı talebi, Haz 2026)

Kullanıcı net olarak şunu istedi: **"Bir bileşenin/davranışın nasıl olacağını söylediğimde, o bileşenin geçtiği BÜTÜN yerlerde aynı şekilde uygula."** Kullanıcı geliştirici değil ve kod tabanı artık büyük — her modülü tek tek kontrol edemez. Bu yüzden tutarlılığı sağlamak **ajanın sorumluluğu**.

Kurallar:
- **"Braket şöyle olsun" → istisnasız tüm braket görünümleri aynı olur.** ✅ **Braket layout motoru artık TEK dosya:** `public/js/bracket-shared.js` (`renderElimBracketSVG`, `renderLinkedBracketSVG`, `renderBracketWithTabs`, `fitBrackets`, `selectBracketTab`, `btBtnStyle`, `bracketResetTabs` — hepsi `window.*`). `viewer.js` ve `organizer.js` (bireysel turnuva sayfaları) bu motoru kullanır; sadece kendi `renderBracketMatch(m)` kutu-içeriğini sağlarlar (entry tabanlı). Braket **görünümünü/çizgisini/hizasını** değiştirmek istersen **yalnız `bracket-shared.js`'i düzenle** — bu iki sayfa otomatik güncellenir. İSTİSNALAR (kasıtlı, ayrı renderer): (a) `public/session.html` ve `public/sezon.html` (LİG/SEZON sayfaları) **kendi bağımsız braket kopyalarını** taşır — kullanıcı isteğiyle, **canlı/devam eden sezon sürerken lig/sezon koduna dokunulmuyor** (veri/akış riski olmasın diye). Bu iki sayfa **orijinal/HEAD haliyle aynen duruyor** (loser-braket SVG düzeltmesi bile uygulanmadı — canlı sezona dokunmamak için), `bracket-shared.js`'e BAĞLI DEĞİL. Sezon bittikten sonra bunlar da ortak motora bağlanabilir + loser düzeltmesi uygulanabilir. (b) `public/js/tv.js` kendi CSS-kolon kiosk renderer'ı (farklı paradigma). (c) `pdf-print.js` kendi bağımsız SVG'si. Yani braket görseli değişiminde sıra: **bracket-shared.js → (lig/sezon sürmüyorsa) session.html + sezon.html → (gerekirse) tv.js → (gerekirse) pdf-print.js**. Kutu-içeriği (isim/skor/renk) değişiminde ilgili sayfaların `renderBracketMatch`'ini gözden geçir.
- **Genelleme — sadece braket değil.** Aynı mantık tüm tekrarlı bileşenler için geçerli: skor ekranı (`board.js` ↔ `scorer.html`, bkz. Konvansiyon #0 cricket duplikasyonu), klasman tabloları, modallar, flash'lar, leg/set override panelleri, vb. Bir davranış/görünüm birden fazla dosyada yaşıyorsa, değişiklik hepsine uygulanır.
- **Bu, "söylenmeyen modülü değiştir" demek DEĞİL.** Kullanıcı bir şeyi açıkça istemediyse veya aklına gelmediyse, o ayrı/ilgisiz modülü kendiliğinden değiştirme. Kural yalnızca: *istenen değişikliğin kapsadığı* tüm kopyalar/varyantlar tutarlı olsun. Yani "kapsam içindeki her yere uygula", "her yere dokun" değil.
- **Pratik yöntem:** Bir bileşeni değiştirmeden önce kod tabanında o bileşenin/fonksiyonun diğer kopyalarını ara (grep). Bittiğinde kısa bir "şu dosyalarda aynı değişikliği yaptım" özeti ver ki kullanıcı tek tek kontrol etmek zorunda kalmasın.
- Yeni bir tekrarlı bileşen eklerken bunu bu dosyada **not düş** (hangi dosyalarda duplike olduğunu yaz) ki gelecekteki ajanlar bilsin. İleride paylaşımlı modül (`bracket-shared.js`, `cricket-shared.js`) refactor'ı bu duplikasyonları azaltacak.

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

**✅ Sezon + Ustalar oturumu — Tur bazında özel leg/set (Haziran 2026, tamam):**
- organizer.js'deki round-override panelinin (round başına kazanılacak leg/set sayısı) sezon oturum formuna uyarlaması. Çeyrek/Yarı/Final gibi ileri turlarda farklı leg sayısı, oturum **oluşturulurken** belirlenir.
- **Korumalı modüle dokunulmadı:** Altyapı `src/tournament.js` `_createMatch` wrapper + `stages.config_json.round_overrides`'ta zaten vardı (Kod konvansiyonu #2). Sadece sezon formuna açıldı.
- Backend: `server.js` `buildSessionStageConfig(format, body)` artık `body.round_overrides`'ı da kabul ediyor. Anahtar formatı tournament.js ile aynı (`winners-1`, `final-3`, `losers-2`, `rr`). Sanitize: leg/set tamsayı ≥1, geçersiz anahtarlar (regex `^(winners|losers|final)-\d+$` veya `rr`) süzülür. Çift elemede mevcut `lb_legs` (toplu loser-* override) ile **birleşir** — tur bazında verilen değer aynı anahtarı ezer. Geriye dönük uyumlu (yoksa boş config).
- Frontend: `competition.html` `#ns-round-ov-section` (checkbox `#ns-round-ov-toggle` + panel `#ns-round-ov-panel`). `competition.js`: `STATE.roundOv` + `_nextPow2Ns`, `_roundLabelNs` (Final/Yarı Final/Çeyrek Final/Son 16…), `_roundsForStageNs(format, count)` (seçili katılımcı sayısına göre tur listesi), `renderRoundOvPanel`, `updateRoundOvNs`, `toggleRoundOverridesNs`. Boş bırakılan turlar competition'ın varsayılan `legs_to_win`/`sets_to_win`'ine düşer.
- **Katılımcı sayısı kaynağı:** Normal sezonda checkbox listesinden (`checkedParticipantIds().length`), Ustalar modunda `STATE.mastersRoster.length`'ten. Panel; katılımcı checkbox değişiminde (`updateParticipantCount`), format değişiminde (`onNsFormatChange`), Ustalar roster değişiminde (`renderMastersRoster`) ve Ustalar moduna girişte (`toggleMastersMode`) yeniden render edilir.
- `submitNewSession`: panel açık + dolu + format ≠ round_robin ise `body.round_overrides = STATE.roundOv`. Ustalar oturumuyla birlikte de gönderilir (puan override'ından bağımsız). Round-robin'de panel "çeyrek/yarı/final yok" notu gösterir, gönderilmez.
- Lig (league_day) tarafına dokunulmadı — round'lar RR olduğu için çeyrek/yarı/final kavramı yok.

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

### Turnuva bitince board serbest bırakma — turnuva-bazlı olmalı (Haziran 2026 fix)

**Bug:** Bir maç bitince turnuva tamamlandıysa (`t.status==='finished'`) `server.js` throw + walkover finish handler'ları `db.clearUserBoards(t.user_id)` çağırıyordu — bu kullanıcının **TÜM** board'larını sıfırlar. Paralel iki turnuva oynanırken (ör. SMDN sezon oturumu + Lucky Loser) biri bitince diğerinin tabletleri de bekleme ekranına düştü; canlı maç eski `board_id`'ye bağlı `live` kaldığı için scheduler yeniden atayamadı → ikinci turnuva yarıda kaldı.

**Fix:** Yeni `db.clearTournamentBoards(userId, tournamentId)` helper'ı **sadece** `WHERE user_id=? AND tournament_id=?` board'ları sıfırlar ve sıfırlanan board listesini döndürür. `server.js`'teki iki finish handler'ı (`/api/matches/:id/throw` ve `/api/matches/:id/walkover`) artık bunu kullanıyor + sonrasında `scheduler.assignPendingMatches` çağırıp boşalan board'ları bekleyen başka turnuvaya yönlendiriyor. `scheduler.js` / skor motoru değişmedi.

**Ders:** Çok-turnuvalı (federasyon) senaryoda board temizliği **asla kullanıcı bazında** yapılma — daima turnuva bazında scope et. `clearUserBoards` hâlâ duruyor ama yeni kodda kullanma.

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
- **Klasman/Braket PDF + 32'lik braket dilimleri (Haziran 2026)**: `pdf-print.js` ortak motoru; tarayıcı "PDF kaydet" ile dikey A4 klasman + yatay A4 braket (32'lik bölme), viewer ekranında 32'lik sekmeler, TV'de rotasyonla dilim geçişi; viewer maç listesi sıralaması (canlı → board'a atanmış → bitmiş → sırası gelecek) — ayrı bölüme bak.
- **Braket motoru tekilleştirme + çift eleme loser düzeltmeleri (Haziran 2026)**: bye'lı kadrolarda loser braket ilerleme bug'ı (`resolveLbByes`), WB üst-tur kaybedeni çapraz düşürme, loser/GF görünümü winners ile aynı SVG'ye geçti, ve tüm braket layout motoru tek dosyaya toplandı (`public/js/bracket-shared.js`) — ayrı bölüme bak.

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

## Mobil (telefon) — izleyici klasman tablosu yatay taşması (Haziran 2026)

Telefondan siteye girenler izleyici sayfasında **yatay kayma + bölümlerin üst üste binmiş
görünmesi** bildirdi. Tarayıcıda 390px genişlikte iframe ile reprodüksiyon yapıldı (window
resize uzak Chrome'da viewport'u küçültmüyor; media query'ler iframe genişliğine göre
tetiklendiği için **390px iframe** güvenilir mobil test yöntemi oldu).

**Kök neden:** `viewer.html` Genel Klasman bölümündeki `.standings-table` 12 sütunlu
(O/G/M/LEG/±/3-OK ORT/100+/140+/180/En Yük. Çıkış…). Tablo telefon ekranından geniş olduğu
için **tüm sayfayı** yatay kaydırıyordu (384px ekranda içerik ~733px → 349px taşma). Yatay
kayınca diğer bölümler kaymış/üst üste binmiş görünüyordu — iki belirti de tek kaynaktan.

**Çözüm (additive, tek dosya):** `public/viewer.html` `<style>` içine, tabloları **sayfa
yerine kendi kutusunda** kaydıran kural eklendi:
```css
#standings-host, #matches-host, #recent-host, #past-host {
  overflow-x: auto; -webkit-overflow-scrolling: touch;
}
```
Bu, `competition.html`'in klasman tablosunda zaten kullandığı pattern'in aynısı
(`<div class="card" style="overflow-x:auto">`). İframe testinde sayfa taşması 349px → 0
(`-15` scrollbar) düştü; tablo artık parmakla kendi içinde yatay kayıyor.

**Taranan ama temiz çıkan sayfalar:** anasayfa (`index.html`), `turnuvalar.html`,
`profil.html`, `login.html`, `organizer.html`, `competition.html` — 390px'te yatay taşma
yok. Sorun yalnızca izleyiciydi.

**Bilinmesi gereken:** Geniş veri tablosu eklerken (klasman, maç dökümü vb.) tabloyu daima
`overflow-x:auto` bir kapsayıcıya koy; aksi halde mobilde **tüm sayfa** yatay kayar. Mobil
test için: masaüstü Chrome'da `width:390px` bir iframe'e sayfayı yükleyip
`documentElement.scrollWidth - innerWidth` ölç (window resize yöntemi bu kurulumda
çalışmıyor).

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

## Geri Al — istatistik sayaç bug'ı düzeltildi (Temmuz 2026)

**Bug (kullanıcı bildirdi):** X01'de yanlışlıkla girilen bir skor (ör. "180") "Geri Al" ile
silinince atış satırı gidiyor ve total_score/darts/turns geri alınıyordu; ama **180 / 140+ /
100+ / high_out sayaçları geri ALINMIYORDU**. Sonuç: hayalet bir 180 istatistiklerde kalıcı
kalıyor (yeni eklenen istatistik şeridi + Excel raporu). Kök neden: `match-engine.js`
`undoLastThrow`'daki `statDelta` yalnız üç alanı düşürüyordu.

**Fix (korumalı modüller — kullanıcı onayıyla):**
- `src/match-engine.js` `undoLastThrow`: `statDelta`'ya silinen atışın kategori sayaçları
  eklendi — `tons`/`ton_plus`/`one_eighty` skora göre `-1`, `high_outs` finish+100 ise `-1`.
  `throws.score` bust'ta zaten `0` saklandığı için (recordThrow) `last.score` ile kontrol
  güvenli — busted atış hiçbir sayaca girmez, total'dan 0 düşer.
- `best_checkout` bir "en yüksek" değeri; `db.updateStats` onu `Math.max` ile tuttuğu için
  delta ile DÜŞÜRÜLEMEZ. Yeni `db.recomputeBestCheckout(matchId, slot)` helper'ı kalan
  `is_finish=1` atışlardan `MAX(score)` ile yeniden hesaplayıp doğrudan yazıyor (silinen
  yüksek çıkış hayalet kalmasın). undo bunu updateStats'tan sonra çağırır.
- Şema değişmedi (yalnız yeni helper + export). `match_stats` korumalı şema listesinde değil.

**Doğrulama:** Node yerleşik sqlite ile birebir SQL mirror'ı iki senaryoda geçti (yanlış 180 →
one_eighty 1→0, diğerleri korunur; yanlış HO 160 → best_checkout 100'e döner). Gerçek motora
karşı Mac smoke: `node scripts/smoke-undo-stats.js` (sandbox'ta better-sqlite3 native binary
Mac derlemesi olduğu için çalışmaz; Mac'te sunucu kapalıyken çalıştır). `node --check` temiz.

**Bilinmesi gereken sınır:** `undoLastThrow` hâlâ "son atış, mevcut leg içinde" varsayımıyla
çalışıyor — leg/set geçişlerini geri sarmıyor (eski davranış, değişmedi). Checkout'u geri
almak (leg bitmiş) hâlâ tam desteklenmez; kategori/best_checkout düzeltmesi bu sınırı
genişletmez, sadece sayaç tutarlılığını sağlar.

## İzleyici "Tüm Maçlar" — sıralama + biten maç istatistikleri (Temmuz 2026)

Kullanıcı isteği: maç listesinde **en son oynanan en üstte** olsun, ve biten maç satırlarında
maçın istatistikleri de görünsün — **kutu ebadını büyütmeden**. Tamamı additive; sadece
`public/js/viewer.js` + `public/viewer.html` değişti, korumalı modüllere dokunulmadı.

### Sıralama (`renderMatches` içindeki `rank`)
Yeni sıra: **CANLI (0) → BİTEN, en yeni üstte (1) → board'a atanmış HAZIR (2) → sırası
gelecek / atanmamış (3)**. Eskiden biten maçlar hazır maçların altındaydı (2 ↔ 1 yer
değiştirdi). Bitmişler kendi içinde `finished_at DESC`, yoksa `id DESC`. Board ataması maç
satırında alan olarak yok — `state.boards`'taki `current_match_id` set'inden türetiliyor
(değişmedi).

Kullanıcı kararı (Tem 2026): **tek liste kalsın**, oynanmamış maçlar ayrı bölüme
çıkarılmasın, başlık şeritleri de eklenmesin — durum rozeti ayrım için yeterli.

### Biten maç istatistik şeridi
Bitmiş maç satırında, isimlerin altına 0.7rem'lik gri tek satır: oyuncu başına
`<3-ok ort> · 180×N · HO <en iyi çıkış>`. Checkout 100+ ise "HO", altındaysa "Çıkış"
etiketi. Değer yoksa parça hiç yazılmaz; hepsi boşsa `.mstat-line:empty { display:none }`
ile satır kaybolur (kutu büyümez).

**Veri kaynağı — snapshot'a EKLENMEDİ (bilinçli):** `getSnapshot` zaten büyük (bkz. "Ölçek /
Performans — snapshot yayını"); maç başına `match_stats` eklemek her yayını şişirirdi. Bunun
yerine mevcut **`GET /api/matches/:id`** ucu (public, `stats: db.statsForMatch(id)` döndürür)
satır bazında çağrılıyor:
- `matchStatsCache` (Map, matchId → stats satırları) + `matchStatsPending` (Set, çift istek
  koruması), modül seviyesinde. **Bitmiş maçın istatistiği değişmez** → bir kez çekilir,
  sonraki canlı güncellemelerde ağ isteği yok.
- `hydrateMatchStats(filtered)` render sonunda çağrılır, eksik olanları çeker ve dönünce
  **yalnız ilgili `.mstat-line[data-mid]` elementini** günceller — tam `render()` tetiklemez
  (sonsuz döngü + braket sekme seçiminin kaybı riski).
- `MSTAT_FETCH_LIMIT = 40` — tek renderda en fazla 40 maç çekilir (512 kişilik turnuvada
  istek fırtınası olmasın). Kalanlar filtre/scroll ile yeniden render edilince çekilir.

### İlgili fonksiyonlar/CSS
`viewer.js`: `fmtStatChunk`, `matchStatsHtml`, `hydrateMatchStats`, `matchStatsCache`.
`viewer.html`: `.mstat-line`, `.mstat-p` stilleri (inline `<style>` bloğunda,
`.standings-table` kuralının hemen üstünde).

**Not:** Aynı istatistik şeridi "Son Biten Maçlar" (`renderRecent`), braket kutuları,
`tv.js` ve `organizer.js`'e **eklenmedi** — kullanıcı kapsamı yalnız "Tüm Maçlar" tablosu
olarak seçti. Oralara da istenirse `matchStatsHtml` + `hydrateMatchStats` aynen kullanılabilir
(entry adları için `entryLabel`, session sayfalarında `p1_name`/`p2_name` farkına dikkat).

### session.html'e taşındı (Temmuz 2026, ikinci tur)
Kullanıcı isteğiyle aynı iki iyileştirme lig/sezon **oturum detay** sayfasına (`session.html`)
da uygulandı — hem tek turnuvalı oturum (`renderMatchList`) hem league_day round listeleri.
- **Sıralama:** `renderMatchList` içindeki `order` map'i `{live:0, ready:1, pending:2,
  finished:3}` iken **`{live:0, finished:1, ready:2, pending:3}`** oldu; bitmişler kendi
  içinde `finished_at DESC` (yoksa `id DESC`). Eskiden biten maçlar en altta + tur sırasına
  göre (en eski üstte) diziliyordu — kullanıcı "en yeni biten üstte" istedi.
- **İstatistik şeridi:** `session.html`'e izleyicideki mantığın aynısı taşındı
  (`matchStatsCache`, `matchStatsPending`, `fmtStatChunk`, `matchStatsHtml`, `hydrateMatchStats`).
  **Tek fark:** session maçları `entry1`/`entry2` objesi yerine `p1_name`/`p2_name` taşıdığı
  için `.mstat-line` elementine `data-p1`/`data-p2` yazılıp fetch dönüşünde oradan okunuyor
  (viewer'da `entryLabel(m.entry1)` kullanılıyordu). CSS `.mstat-line` `flex-basis:100%` ile
  kartın altına tam satır düşer (viewer'da tablo hücresi içindeydi). `hydrateMatchStats()`
  iki `content.innerHTML` atamasından sonra çağrılır (bracket render + league_day render).
- `session.html` **korumalı modül değil** — doğrudan düzenlendi. Braket motoru hâlâ kendi
  bağımsız kopyası (bkz. TUTARLILIK KURALI: lig/sezon sayfaları ortak `bracket-shared.js`'e
  bilinçli bağlanmadı).

## Braket 32'lik dilim seçimi + sezon/lig oturum braketi (Haziran 2026)

Canlı turnuvada üç görsel sorun kapatıldı. Hiçbir korumalı modüle dokunulmadı; tamamı
additive (sadece `viewer.js`, `organizer.js`, `session.html`). Commit `812cc65`, `main`'e
push'landı.

### 1. İzleyici braketi — seçilen 32'lik dilim sıfırlanıyordu
**Bug:** >32 oyunculu braket 32'lik sekmelere bölünüyor. Kullanıcı 2. dilimi seçince, bir
sonraki canlı atış geldiğinde `socket.on('state')` → `render()` → `renderBracket()` tüm
braketi sıfırdan çiziyor, sekme id'leri (`bt1`, `bt2`…) `_btSeq`'in artmasıyla değiştiği
için seçim **varsayılan 0. dilime** dönüyordu.
**Fix (`viewer.js`):** (a) `renderBracket()` başında `_btSeq = 0` — sekme id'leri her
render'da aynı sırayla üretilsin (kararlı). (b) Yeni `_btSelected` map'i `bt id → seçili
index`; `renderBracketWithTabs` aktif dilimi `_btSelected[id] ?? 0`'dan okur, `selectBracketTab`
seçimi map'e yazar. Dilim sayısı azalırsa güvenli 0'a düşer.

### 2. Organizatör braketi — aynı sorun, aynı düzeltme
Organizatör ekranı zaten aynı sekme yapısına sahipti ama aynı sıfırlanma bug'ını taşıyordu.
`organizer.js`'e birebir aynı düzeltme uygulandı: `render()` başında `_btSeq = 0`, `_btSelected`
map'i, `renderBracketWithTabs` + `selectBracketTab` güncellemesi.

> **Kural:** Sekme/state hatırlamalı bir liste DOM'u her `state` yayınında yeniden çiziliyorsa,
> id üretimini render başında sıfırla (kararlı id) + seçimi modül-seviye map'te sakla. Aksi
> halde her canlı güncellemede kullanıcının seçimi kaybolur.

### 3. Sezon/lig oturum braketi (`session.html`) izleyici görünümüne geçirildi
**Önceki durum:** `session.html` kendi basit braketini çiziyordu (`renderBracketSimple` — düz
CSS kolonlar, bağlantı çizgisi yok, 32'lik dilim yok, kutuya sığma yok, yatay scroll).
**Fix:** `viewer.js`'teki SVG braket motoru (`renderElimBracketSVG`, `renderBracketMatch`,
`renderBracketWithTabs`, `selectBracketTab`, `fitBrackets`, `btBtnStyle`, `_btSeq`/`_btSelected`)
bu sayfanın maç veri şekline uyarlanmış kopyası olarak `session.html` içine taşındı. **Tek
fark:** session maçları `entry1`/`entry2` objesi yerine `p1_name`/`p2_name` taşıyor
(`/api/matches/for-tournament/:tid` enrich'i), bu yüzden `renderBracketMatch` `entryLabel`
yerine `p1_name`/`p2_name` kullanır. `renderBracketSimple` artık maçlardan kolonları kurup
tek/çift eleme ayrımı yapan ince bir sarmalayıcı (RR → tek kolon liste, çift eleme → üst/alt
taraf/büyük final bölümleri). `splitBracketColumns` için `<script src="/js/pdf-print.js">`
eklendi; `content.innerHTML` sonrası `fitBrackets()` çağrısı eklendi.

**GÜNCELLEME (Haziran 2026):** Yukarıdaki duplikasyon **giderildi** — braket layout motoru artık
tek dosya: `public/js/bracket-shared.js`. Aşağıdaki "Braket motoru tekilleştirme + çift eleme
loser düzeltmeleri" bölümüne bak.

## Braket motoru tekilleştirme + çift eleme loser düzeltmeleri (Haziran 2026)

Canlı bir çift eleme turnuvasında iki sorun çıktı, kapatıldı; ardından braket render motoru
tek paylaşımlı dosyaya toplandı. Korumalı modüllerden yalnız `tournament.js` + `db.js`
değişti (kullanıcı onayıyla — loser bug + çapraz); görünüm/refactor tarafı korumasız dosyalarda.

### 1. Loser braket ilerlemiyordu — bye'lı kadrolar (`src/tournament.js`, `src/db.js`)
Kök neden: oyuncu sayısı 2'nin kuvveti değilse (5/6/7…) WB-1'deki **bye** maçlarının kaybedeni
yok; ama kod o "olmayan kaybedeni" düşürmeye çalıştığı için LB kutuları tek-oyunculu kalıyor,
eşleşme oluşmuyor, LB hiç ilerlemiyordu. Çözüm: `buildDoubleElim` sonunda yeni `resolveLbByes()`
adımı — bye yüzünden boş kalacak LB kutularını "şeffaf" yapar (tek gerçek oyuncuyu bir sonraki
LB turuna doğrudan bağlar, ölü kutuyu `db.deleteMatch` ile siler). Yeni helper: `db.deleteMatch(id)`
(throws + match_stats + match satırını temizler). 4–16 kişi (bye'lı dahil) yapı + tam oynanış
simülasyonunda temiz.

### 2. WB üst-tur kaybedenleri çapraz düşüyor (`src/tournament.js`)
Standart çift-eleme davranışı: WB R≥2 kaybedenleri LB turuna **ters/çapraz** sırayla yerleştirilir
(erken rövanşı önler). `next_loser` hedef indeksi `lbr.length - 1 - i` ile ters çevrildi.
8 kişide PrintYourBrackets referansıyla birebir eşleşir.

### 3. Loser/Grand Final görünümü artık winners ile aynı + TEK motor
**Önceki tutarsızlık:** winners braketi yeni SVG (bağlantı-çizgili, hizalı) ile, losers braketi
eski `div.bracket` CSS-kolon ("acayip kutular") ile çiziliyordu. Düzeltildi + tüm layout motoru
`public/js/bracket-shared.js`'e taşındı (bkz. TUTARLILIK KURALI bölümü). LB/GF için bağlantı
çizgileri gerçek `next_winner_match_id`'ye göre çizen `renderLinkedBracketSVG` kullanılır.
`viewer.js`, `organizer.js` yerel kopyalarını bıraktı; sadece kendi `renderBracketMatch`'lerini
sağlıyor. `bracket-shared.js` script include'u `viewer.html` + `organizer.html`'e eklendi
(`pdf-print.js`'ten sonra). **`session.html` + `sezon.html` (lig/sezon) BİLEREK ortak motora
bağlanmadı** — kullanıcının devam eden, oynanmış oturumları olan canlı sezonu olduğu için
lig/sezon koduna dokunulmadı; ikisi de kendi bağımsız braket kopyalarını (loser-SVG düzeltmesi
dahil) korur. `tv.js` (kiosk) + `pdf-print.js` ayrı renderer'larını korur.

### Etkilenen dosyalar
`src/tournament.js`, `src/db.js`, `public/js/bracket-shared.js` (yeni), `public/js/viewer.js`,
`public/js/organizer.js`, `public/viewer.html`, `public/organizer.html`.
(`session.html` refactor sırasında geçici bağlandı, sonra kullanıcı isteğiyle TAMAMEN orijinal
HEAD haline döndürüldü — loser-SVG düzeltmesi dahil hiçbir değişiklik kalmadı, lig/sezon
sayfaları sıfır değişiklikle korundu.)
Doğrulama: `node --check` tüm JS temiz; session inline script parse; bye/çapraz/oynanış
in-process simülasyonla doğrulandı. Henüz commit/deploy edilmedi.

### 4. Bracket reset için yedek buton (`public/js/organizer.js`)
Motor, GF'i LB oyuncusu kazanınca `onMatchFinished` → server `tournament:reset_needed` socket
olayı zaten doğru üretiyor (simülasyonla doğrulandı: 4/5/6/7/8 kişi, hep LB→GF slot 2, sinyal
geliyor). **Ama** modal yalnız canlı socket olayıyla açılıyordu; GF board/tablet'ten bitirilip
organizatör ekranı o an açık değilse olay kaçıyor ve geri dönüş yolu yoktu — turnuva "GF bitti,
LB kazanan görünüyor ama reset yok" halinde takılı kalıyordu. Çözüm (additive): `pendingResetFinal(t)`
helper'ı + `renderTournament` içinde yedek buton. Koşul: turnuva `running` + reset maçı yok +
GF (`bracket='final'`, `!is_reset_final`) `finished` ve `winner_entry_id === entry2_id` (LB slotu).
Buton mevcut `showResetFinalModal()` → `/api/tournament/:id/create-reset-final` akışını çağırır.
Kaçan olayı kurtarır; sayfa yenilenince görünür.

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

## X01 skor girişi — kalan-dokun, gerçek BUST, leg skoru flash (Haziran 2026)

Canlı turnuva geri bildirimleriyle X01 skor giriş ekranına üç ekleme yapıldı. Skor motoru
mantığına (leg/set akışı) dokunulmadı; eklemeler additive. Kod konvansiyonu #0 gereği
**board.js ↔ scorer.html eşitliği korundu** — üçü de iki yerde birebir uygulandı.

### 1. Kalan-dokun (checkout kolaylığı)
Checkout'a yakınken atılan skoru hesaplamak yerine, keypad'e **yeni kalanı** yazıp sırası
gelen oyuncunun ismi altındaki kalan sayısına (`.dp-rem`) dokununca sistem
`atılan skor = mevcut kalan − yazılan kalan` diye hesaplar ve normal gönderim akışına verir.
- `board.js` `submitRemaining()` + `scorer.html` `x01SubmitRemaining()`. İkisi de
  hesapladığı skoru `currentInput`'a yazıp mevcut `submitScore()` / `x01Submit()`'i çağırır
  → checkout/bust/flash/leg-özeti kuralları **otomatik aynen** geçerli (kod tekrarı yok).
- Yeni kalan 0 → checkout → mevcut "kaçıncı ok" promptu çıkar. Yeni kalan > mevcut kalan
  veya hesaplanan visit > 180 → uyarı, işlem yok.
- Sadece **aktif** oyuncunun `.dp-rem`'ine `onclick` eklendi (readonly/izleme modunda yok).
- Görsel ipucu **bilinçli olarak eklenmedi** (kullanıcı istemedi) — CSS değişmedi.
- Atış flash'ı atılan (hesaplanan) skoru gösterir, yazılan kalanı değil.

### 2. BUST tuşu artık gerçek bust kaydeder
**Eski bug:** BUST tuşu `setScore(0)` ile skor 0 gönderiyordu; motor bunu bust değil sıradan
bir 0 visit olarak kaydediyordu (tabloda "0" görünüyordu). Gerçek over-throw (kalan eksiye
düşmek) zaten otomatik bust olarak yakalanıyordu; sorun yalnızca tuşun kendisindeydi.
- `match-engine.js` `recordThrow(..., forceBust)` parametresi eklendi. `forceBust` true ise
  `bust=true, isFinish=false` zorlanır; kalan değişmez. **İstatistik:** mevcut bust path'i
  zaten 3 ok + 0 puan sayıyor (kullanıcı kararı: "bust ve 0, ikisi de 3 ok atıldı 0 puan
  demek, ortalamaya 0 katkı"). Bu yüzden istatistik tarafı değişmedi.
- `server.js` `/api/matches/:id/throw` body'den `bust` alıp `recordThrow`'a `!!bust` geçirir.
- `board.js` `submitBust()` → `{score:0, bust:true}` POST eder, "Bust" flash'ı gösterir.
- `scorer.html` (local engine, server yok) → `x01Bust()` + `recordX01ForceBust(slot)`:
  history'ye `bust:true` push, `darts+=3`, `totalScore+=0`, kalan sabit, sıra rakibe.

### 3. Leg skoru flash modalı
Leg bitince (checkout sonrası leg özeti kapanınca / Hızlı Skor'da yeni leg'e geçerken)
maçın leg skoru — örn. `0-1`, `3-2` — ekran ortasında ~1.2 sn büyük flash'ta belirir.
Maç biten leg'de gösterilmez (zaten sonuç ekranı açılıyor).
- `board.js` `showLegScoreFlash(p1,p2)` — dört oyun modunun leg-bitiş noktasında
  (`await showLegSummary(...)` sonrası, `!matchFinished` ise) çağrılır. Veri:
  `res.legSummary.p1_legs/p2_legs`.
- `scorer.html` `showLegScoreFlash(p1,p2)` — `x01Submit`'te leg bittiyse (`legFinished &&
  !G.finished`) `G.legs[1]`/`G.legs[2]` ile çağrılır.
- Nötr renkli (`.score-flash-modal.leg-flash`); `.bust` kırmızısından ayrı. `.leg-flash`
  için ayrı CSS kuralı yok, base `.score-flash-modal` stilini kullanır.

### Flash modal boyutu büyütüldü
`style.css` `.score-flash-num`: yükseklik `clamp(96px,20vmin,200px)`, min-genişlik
`clamp(140px,32vmin,300px)`, yazı `clamp(56px,14vmin,130px)` (eski tavan 96px → 130px).
Hem atış hem leg skoru flash'ını etkiler (ortak kural).

### Etkilenen dosyalar
`src/match-engine.js` (forceBust), `server.js` (throw bust flag), `public/js/board.js`,
`public/scorer.html`, `public/css/style.css`. Commit `70e0f3b` (Haziran 2026), `main`'e push'landı.

## Klasman/Braket PDF + 32'lik braket dilimleri (Haziran 2026)

Klasman ve braketler tarayıcının "PDF olarak kaydet" özelliğiyle yazdırılabiliyor; ayrıca
büyük braketler hem PDF'te hem ekranda 32'lik (16 maç) dilimlere bölünüyor. Yeni paket /
bağımlılık YOK, korumalı modüllere (board.js, scorer.html, match-engine, tournament,
scheduler) dokunulmadı — tamamen additive, salt-okuma veri alır.

### Ortak motor — `public/js/pdf-print.js` (yeni)
- `window.printStandings(meta, headers, rows, aligns?)` — dikey A4, çok sayfa. `thead`
  `table-header-group` ile başlık her sayfada tekrar eder, satırlar kendiliğinden taşar.
- `window.printBracket(meta, matches)` — yatay A4. Braketi 32'lik dilim sayfalarına böler.
  meta: `{title, subtitle, format}` (format: single_elim | double_elim | round_robin).
  matches: entry1/entry2 objeli maç dizisi (viewer/organizer `renderBracketMatch` ile aynı veri).
  Kendi bağımsız kompakt SVG braketini çizer (uygulama CSS'inden bağımsız, beyaz zemin/siyah
  yazı), her sayfayı A4-yatay alanına `transform: scale()` ile sığdırır.
- `window.splitBracketColumns(cols, prefix)` — ekran tarafı (viewer/tv) için sütun bölücü;
  PDF ile **aynı** bölme mantığını paylaşır → tek kaynak.

### 32'lik bölme kuralı
- ≤32 oyuncu (firstCount ≤ 16 maç) → tek sayfa/sekme, bölme yok.
- \>32 → her 32 oyuncu (16 ilk-tur maçı) bir "Bölüm". Etiket aralıklı: "1. Bölüm (1–32)",
  "2. Bölüm (33–64)"… Her bölüm kendi çeyrek-finaline (1 maç) kadar gider; ardından
  "Finaller (Çeyrek Final → Final)" sayfası birleşimi gösterir.
- Çift elemede: winners 32'lik bölünür, Grand Final finaller sayfasına eklenir,
  **alt taraf (losers) ayrı sayfa/sekme** (bölünmez, ölçeklenerek sığar).

### Butonlar
- `competition.html` Klasman sekmesi → 🖨️ Klasman PDF (`printCompetitionStandings`,
  `competition.js`). Sezon/lig birikimli klasman, atış istatistikleri dahil.
- `organizer.html` her turnuva kartı (draft hariç) → 🖨️ Braket PDF (`printTournamentBracket`).
- `viewer.html` her turnuva kartı → 🖨️ Braket PDF.
- TV'ye PDF butonu **bilinçli olarak konmadı** (kiosk, tıklanamaz). RR turnuvalarının ayrı
  klasman PDF'i yok — braket PDF'inde RR maçları liste olarak çıkar (ileride eklenebilir).

### Ekranda 32'lik sekmeler
- **viewer (`viewer.js`):** `renderBracketWithTabs(columns, prefix)` — >32 ise sekme barı +
  `bt-pane` panelleri üretir. `window.selectBracketTab(id, idx)` paneli değiştirir ve
  `fitBrackets()` çağırır (gizli panel clientWidth=0 olduğu için sekme açılınca yeniden
  ölçeklenir). Tek eleme + çift elemenin winners bölümü sekmeli; losers/final tek görünüm.
- **TV (`tv.js`):** Tıklama yok → **rotasyonla** ilerler. `_tvBracketPage` modül sayacı,
  `nextSection()` braketten ayrılırken artar; `renderBracket` o anki dilimi gösterir, başlıkta
  "1. Bölüm · 1/N" rozeti. Birkaç rotasyon turunda tüm dilimler sırayla ekrana gelir. TV kendi
  CSS-kolon renderer'ını kullandığı için `splitBracketColumns` ile sütunları bölüp aynı
  pair/last-col markup'ıyla çizer.

### Maç listesi sıralaması (`viewer.js` → "Tüm Maçlar")
Yukarıdan aşağı: (1) CANLI, (2) başlamamış ama board'a atanmış (oynanmaya hazır),
(3) bitmiş (en yeni üstte), (4) sırası gelecek (board'a atanmamış bekleyenler). Board ataması
maçta alan olarak yok → `state.boards`'taki `current_match_id` set'inden türetiliyor.

### HTML script include'ları
`competition.html`, `organizer.html`, `viewer.html`, `tv.html` → `common.js`'ten sonra
`<script src="/js/pdf-print.js">` eklendi (pdf-print, `window.entryLabel`'a bağımlı).

## Takım Maçı — Yarın Yapılacaklar (öncelik sırası)

1. **Tablet entegrasyonu**: Phase maçlarını board'lara gönder. Tablet üzerinden oyna, maç bitince sonuç otomatik team_phase_match'e yazılsın ve sıradaki maça geçilsin.
2. **Katılımcı yönetimi**: `team.html` sol menüsüne "Katılımcılar" sekmesi. İki takım adı girilir, her takıma oyuncu listesi eklenir (takım bazlı, turnuva player pool'undan ayrı).
3. **Maç oluştururken takım bazlı seçim**: Tekli/eşli/bira maç ekleme satırlarında serbest metin yerine takıma göre filtrelenmiş oyuncu dropdown'u.
4. **Bracket yeniden tasarımı**: Mevcut bracket görünümü çirkin, sıfırdan düzgün görsel bracket (bağlantı çizgileri, dikey hizalama).

---

## Organizatör yetki kilidi — DÜZELTME (Haziran 2026)

**Bug:** Katılımcı/organizatör ayrımı tasarlanmıştı (rol + admin onay akışı) ama
**zorlanmıyordu** — turnuva/lig/takım oluşturma uçları sadece `auth.requireAuth` ile
korunduğu için giriş yapan **herkes** (varsayılan `player` rolü) turnuva düzenleyebiliyordu.

**Fix (additive, korumalı modüllere dokunulmadı — `auth.js`/`server.js` korumalı değil):**
- `src/auth.js` yeni **`requireOrganizer`** middleware: `role === 'admin'` **veya**
  `organizer_status === 'approved'` değilse `403` + Türkçe "Organizatör Ol başvurusu yapın"
  mesajı (+ `organizer_status` döner). `module.exports`'a eklendi.
- `server.js`'de 27 yönetim ucu `requireAuth → requireOrganizer`: `POST /api/tournaments`,
  `/start`, event-settings, confirm, entries, sil; tüm `/api/competitions` yazma uçları
  (oluştur/güncelle/sil, players, sessions, plan, start-round, finalize, move, backfill);
  tüm `/api/team-events` + `/api/team-phases` + `/api/team-phase-matches` yazma uçları.
- **Katılımcı uçları `requireAuth` kaldı** (kasten): `POST /api/tournaments/:id/register`,
  `/withdraw` — normal kullanıcıya açık olmalı. Profil/my-registrations da aynı.

**Yetkilendirme akışı (zaten canlıydı, burada belgeleniyor):** Admin hesabı (`role='admin'`,
`scripts/seed-admin.js` ile tohumlanmış) gelen "Organizatör Ol" başvurularını **admin
panelinden** (`admin.html`) onay/red eder. Onaylanan kullanıcı `organizer_status='approved'`
olur ve artık turnuva düzenleyebilir. Yeni kayıtlar varsayılan `player` kalır.

`node --check server.js src/auth.js` temiz.

---

## Turnuva Kayıt Sistemi — UYGULANDI (Dilim A–G, Haziran 2026)

> **Durum:** Tüm dilimler (A–G) kodlandı, yerelde test edildi, `node --check` temiz. Korumalı
> modüllere (`match-engine.js`, `tournament.js`/`entries`/`stages`/`matches` ŞEMASI, `scheduler.js`,
> `board.js`, `scorer.html`) hiç dokunulmadı — her şey additive: yeni tablolar, yeni kolonlar
> (yalnız korumasız `users` ve `players`), yeni endpoint'ler, yeni sayfalar.

### Ne yapıldı (dilim dilim)

- **A — Rol altyapısı:** `users` tablosuna `role` (DEFAULT 'player'), `organizer_status`
  (DEFAULT 'none' — none|pending|approved|rejected), `organizer_note` (migrasyon + CREATE).
  db helper'lar: `setUserRole`, `setOrganizerStatus`, `usersByOrganizerStatus`, `usersByRole`,
  `countAdmins`. `auth.requireAdmin` middleware. `scripts/seed-admin.js` (zaten vardı; env
  `ADMIN_EMAIL`/`ADMIN_PASSWORD` ile çalışır, kullanıcı yoksa oluşturur).
- **B — Organizatör başvurusu:** `auth.applyOrganizerHandler` + `POST /auth/organizer-apply`.
  `mailer.sendOrganizerRequestEmail` (tüm admin'lere). `index.html` kullanıcı menüsünde
  "🎫 Organizatör Ol" (duruma göre etiket/kilit) + admin'lere "🛡️ Yönetici Paneli" linki.
- **C — Admin paneli (`public/admin.html`, yalnız role='admin'):** Endpoint'ler `requireAdmin`:
  `GET /api/admin/organizer-requests`, `.../:userId/approve|reject`, `GET /api/admin/organizers`,
  `.../:userId/revoke`, `GET /api/admin/tournaments`, `.../:id/finish`, `DELETE .../:id`.
  db: `adminAllTournaments()` (users join'li). Onay/red'de başvurana mail YOK (panelden görür).
- **D — Etkinlik ayarları (AYRI TABLO):** `tournaments`'a DOKUNULMADAN `tournament_event_settings`
  (1:1, `tournament_id` PK+FK): `reg_enabled`, `checkin_enabled`, `stats_to_profile`, `category`,
  `capacity`, `reg_deadline`, `checkin_time`, `event_date`, `description`. db: `eventSettings`,
  `upsertEventSettings`. Endpoint: `GET/PUT /api/tournaments/:id/event-settings` (sahiplik).
  organizer.js: turnuva kartında "🎫 Etkinlik" modalı (`showEventSettings`). **Kullanıcı kararı:
  tournaments tablosuna kolon eklemek istemedi, ayrı tablo tercih edildi.**
- **E — Online kayıt + yedek liste:** `registrations` tablosu (UNIQUE(tournament_id,user_id),
  status: registered|waitlisted|checked_in|confirmed|withdrawn|no_show, `reg_order`, `player_id`).
  db: `createRegistration` (kontenjan doluysa otomatik yedek), `withdrawRegistration` (iptalde ilk
  yedeği otomatik terfi), `registrationsForUser`, `upcomingTournaments` (sayaçlı), `registrationsForTournament`.
  Endpoint'ler: `GET /api/public/upcoming-tournaments`, `POST .../register`, `POST .../withdraw`,
  `GET /api/my-registrations`, `GET /api/tournaments/:id/registrations`. Sayfa: `public/turnuvalar.html`
  (Gelecek Turnuvalar + Turnuvalarım sekmeleri). `index.html` nav'ında "Turnuvalar" linki.
- **F — Check-in + Confirm (motora aktarım):** `players` tablosuna `account_user_id` (korumasız,
  migrasyon+CREATE). db: `confirmRegistrations(tid, ownerUserId, checkinEnabled)` — transaction;
  aktif kayıtları `createPlayer`+`addEntry` ile mevcut motora aktarır, **idempotent** (yalnız
  `player_id` boş olanlar; check-in açıksa sadece `checked_in`). `registrationById`, `setRegistrationStatus`,
  `playerByAccountUser`. Endpoint'ler: `POST .../registrations/:regId/status`, `POST .../confirm`
  (sadece draft, `scheduleBroadcast`). organizer.js: draft kartında "📋 Kayıtlar" modalı
  (`showRegistrations`) — asıl/yedek/iptal grupları + check-in butonları + "✓ Katılımcıları Onayla".
- **G — Katılımcı profili (canlı, koşullu):** db `playerCareerProfile(accountUserId)` — ayrı tablo
  YOK, mevcut maç verisinden (`players.account_user_id` → entries → matches + match_stats) canlı
  hesaplar. **Koşul:** yalnız `stats_to_profile=1` + `reg_enabled=1` turnuvalar dahil (gating doğal
  filtreyle). Endpoint `GET /api/my-profile`. Sayfa `public/profil.html` (özet kartlar + turnuva
  listesi). `index.html` menüsünde "Performans & Başarımlar" artık `/profil.html`'e bağlı.

### Dummy oyuncu sorunu + entry çıkarma (önemli pratik not)

Mevcut motor turnuva oluşturmak için **en az 2 entry** istiyor (`tournament.createTournament`,
korumalı). Saf kayıt-etkinliği turnuvasında oluşturma anında katılımcı yok → organizatör 2 "dolgu"
(dummy) oyuncuyla oluşturup, kayıtları Confirm'le ekleyince dummy'ler listede kalıyor (ör. 2 dummy +
4 onaylı = 6 kişi). Çözüm: **draft turnuvadan katılımcı çıkarma** eklendi.
- db: `removeEntry(tournamentId, entryId)` — entry'yi siler; o entry online kayıttan geldiyse ilgili
  `registrations` kaydını `registered`'a + `player_id=NULL`'a geri alır (tekrar onaylanabilsin).
- Endpoint: `DELETE /api/tournaments/:id/entries/:entryId` (draft only, sahiplik).
- organizer.js: draft kartında "👥 Katılımcılar (N)" modalı (`showParticipants`) — her satırda × ile çıkarma.
- **İleride:** kayıt-etkinliği turnuvasını dummy olmadan oluşturmak `tournament.createTournament`'ın
  ≥2 şartını gevşetmeyi (korumalı modül) gerektirir; kullanıcı onayıyla ayrıca yapılabilir.

### Test araçları (scripts/)

- `scripts/seed-test-registrations.js` — 8 İngiliz isimli sahte hesap (email_verified=1, şifre
  `test1234`) oluşturup verilen turnuvaya kaydeder. id'siz çalıştırınca kayıt-açık turnuvaları
  listeler. Kullanım: `TOURNAMENT_ID=<id> node scripts/seed-test-registrations.js`. Idempotent.
  (Organizatörün tek başına kayıt akışını test edebilmesi için — gerçek katılımcı simülasyonu.)
- Hızlı id öğrenme / kaydı elle açma örnekleri: `db.upcomingTournaments()`, `db.adminAllTournaments()`,
  `db.upsertEventSettings(id,{reg_enabled:1})` tek-satır node komutlarıyla.

### Yeni dosyalar
`public/admin.html`, `public/turnuvalar.html`, `public/profil.html`, `scripts/seed-test-registrations.js`.

### Bekleyen
Canlıya deploy (git push → Render) + production'da `seed-admin.js` ile admin tohumlama. Dummy'siz
kayıt-etkinliği akışı (opsiyonel, motor şartı gevşetme gerektirir).

---

## Turnuva Kayıt Sistemi — Tasarım (orijinal beyin fırtınası, Haziran 2026)

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

### E-posta durumu — ✅ CANLIDA ÇALIŞIYOR (Haziran 2026, doğrulandı)
`src/mailer.js` Resend ile production'da **çalışıyor**. Resend gönderim logunda kayıt doğrulama ("E-posta Doğrulama") ve şifre sıfırlama ("Şifre Sıfırlama") mailleri gerçek kullanıcılara **"Delivered"** olarak gidiyor.

Production yapılandırması (Render panelinde **elle** ayarlı — `render.yaml` blueprint'ten değil):
- `RESEND_API_KEY` — geçerli, "Onboarding" anahtarı (sending access). Render env'de set.
- `EMAIL_FROM` = `Dart Core Pro <noreply@dartcorepro.com>` — domain Resend'de **verified** (~Mayıs 2026).
- `BASE_URL` = `https://dartcorepro.com` (Haziran 2026'da www'den www'siz canonical'a çekildi — mail linkleri 301 sıçraması yapmasın diye).

Not: Deploy repo'su `aozbek2026/dartpulse` (branch `main`); env değişkenleri dashboard'dan yönetiliyor, `render.yaml` sadece dökümantasyon. Yerelde `.env` yok → yerel testte mail gitmez (beklenen).

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

### Faz 2: Production hardening — ✅ NEREDEYSE TAMAM (8 Temmuz 2026)
- E-posta onayı ✅ (Resend, canlıda "Delivered")
- Şifre sıfırlama akışı ✅ (token + e-posta link)
- Captcha ✅ (Cloudflare Turnstile — canlıda aktif, bkz. aşağıdaki bölüm)
- Rate limiting ✅ (`express-rate-limit` — login/register/şifre uçları)
- Helmet.js ✅ (güvenlik header'ları, CSP kapalı)
- Yasal sayfalar ✅ (`gizlilik.html` / `kosullar.html` / `cerezler.html` — KVKK)
- Çerez consent banner'ı ✅ (`js/cookie-consent.js`)
- Hesap silme ✅ (`/auth/delete-account`) + veri indirme ✅ (`/auth/export-data`)
- Otomatik yedekleme ✅ (Backblaze B2, günlük — canlıda çalışıyor, bkz. aşağıdaki bölüm)
- **KALAN (Faz 3'e taşındı):** Cloudflare proxy — kullanıcı isteğiyle sakin bir zamana
  (canlı turnuva yokken) bırakıldı; DNS/mail nameserver değişimi riski nedeniyle.

### Faz 3: Public launch hazırlığı
- **Cloudflare proxy (DDoS + cache + bant genişliği azaltma) — SIRADAKİ İŞ.** Domaini
  Cloudflare'e ekle → nameserver'ları registrar'da değiştir → tüm DNS kayıtlarını (özellikle
  Resend/e-posta doğrulama TXT/CNAME + Render'a işaret eden kayıtlar) birebir taşı → proxy
  (turuncu bulut) aç → SSL modu **Full (strict)**. **Socket.IO (canlı skor) WebSocket** kullandığı
  için proxy açılınca canlı turnuvada test et. Riskli değil ama DNS yayılması + mail kesintisi
  ihtimali için canlı etkinlik olmayan zamanda yapılmalı. Kullanıcının Cloudflare + Backblaze
  hesabı zaten var (aozbek@gmail.com / hesap adı "aozbek").
- Sentry (hata izleme, ücretsiz tier)
- Plausible ya da Google Analytics
- Özel domain (~₺200-300/yıl)

### Faz 4: Gelir modeli
- AdSense başvurusu (1000+ ziyaret/ay sonrası)
- Premium altyapısı: Stripe Checkout, $3-5/yıl, ek özellikler (turnuva arşivi, custom branding, daha fazla oyuncu sınırı)
- Kullanıcı modelinde `tier: 'free' | 'premium'` kolonu — şimdiden ekleyebiliriz

## Faz 2 hardening — güvenlik + yedekleme + KVKK (8 Temmuz 2026)

Faz 2'nin büyük kısmı bu oturumda tamamlandı. Hepsi **additive**, korumalı modüllere
dokunulmadı. Opsiyonel paketler `try/require/catch` ile sarıldı (compression/resend kalıbı) —
paket/anahtar yoksa sistem eskisi gibi çalışır (graceful degradation).

### 1. Güvenlik üçlüsü (canlıda)
- **Helmet** — `server.js` compression bloğundan sonra. `contentSecurityPolicy: false`
  (uygulama çok inline script + dış CDN kullanıyor, CSP açılırsa sayfalar kırılır) +
  `crossOriginEmbedderPolicy: false` (tanıtım iframe'leri için). Diğer header'lar aktif.
- **Rate limiting** — `express-rate-limit`. `server.js`'te iki limiter: `authLimiter`
  (login/register, 15dk/20) + `passwordLimiter` (forgot/reset/resend, 1sa/5). Paket yoksa
  no-op geçirgen fonksiyona düşer. 429'da Türkçe mesaj. **Skor/socket uçlarına dokunulmadı.**
- **Captcha (Cloudflare Turnstile)** — `src/auth.js` `verifyTurnstile(token, ip)` helper'ı;
  `TURNSTILE_SECRET` env yoksa doğrulama ATLANIR (graceful). `registerHandler`/`loginHandler`
  artık `async` ve captcha token'ını Cloudflare'e doğrulatıyor. `server.js` `GET /api/config`
  ucu `TURNSTILE_SITE_KEY`'i (public) döndürür. `login.html` config'i çekip site key varsa
  Turnstile widget'ını (dark tema) yükler, token'ı POST body'sine `captcha` olarak ekler,
  hatada `resetCaptcha()`. **Render env:** `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET` girildi,
  Cloudflare'de "Dart Core Pro" widget (Managed mod, hostname'ler: `dartcorepro.com` +
  `www.dartcorepro.com`). Canlıda aktif.

### 2. Bulut yedekleme (Backblaze B2 — canlıda)
- Kod zaten hazırdı (`src/backup.js`, `YEDEKLEME-KURULUM.md`). Bu oturumda **Render env'e
  anahtarlar girildi** ve aktifleştirildi. Loglarda doğrulandı: `[backup] aktif — her 24 saatte
  bir yedek alınacak` + `[backup] OK -> backups/data-...db.gz`.
- **Render env değişkenleri (girildi):** `BACKUP_S3_ENDPOINT=https://s3.eu-central-003.backblazeb2.com`,
  `BACKUP_S3_REGION=eu-central-003`, `BACKUP_S3_BUCKET=dartcorepro-yedek`, `BACKUP_S3_KEY_ID`,
  `BACKUP_S3_SECRET` (Backblaze application key — bucket'a scope'lu, Read/Write).
- Backblaze bucket `dartcorepro-yedek` (Private, EU/Almanya). App key adı `dartcorepro-render2`.
  `BACKUP_INTERVAL_HOURS` default 24. `@aws-sdk/client-s3` zaten dependency.
- Not: AWS SDK "Node 22'ye geç" uyarısı verir — zararsız, işlevi etkilemez.
- **GÜNCELLEME (Ağustos 2026):** Günde-tek yedek yetersiz kaldı (bkz. aşağıdaki "Hafta 9 veri
  kaybı" bölümü) → **olay-tetikli + temizlikli** sisteme geçildi. Ayrıntı aşağıda.

### 3. Yasal sayfalar + KVKK (canlıya deploy edilecek)
- Üç yeni statik sayfa (Türkçe, site stilinde, kendi inline CSS'i + `/css/style.css`):
  `public/gizlilik.html` (KVKK aydınlatma + gizlilik politikası — **veri sorumlusu: Ahmet Özbek
  (şahıs)**, iletişim **dartcorepro@gmail.com**, hizmet sağlayıcı tablosu: Render/Backblaze/
  Resend/Cloudflare, KVKK m.11 hakları), `public/kosullar.html` (kullanım koşulları),
  `public/cerezler.html` (çerez politikası). Karar: **sadece Türkçe** (site TR-öncelikli).
- `public/index.html` footer'ına üç link eklendi (gizlilik/koşullar/çerezler).

### 4. Çerez consent banner
- `public/js/cookie-consent.js` — bağımsız, kendi HTML+CSS'ini enjekte eder. Yalnız zorunlu
  oturum çerezi kullanıldığı için "rıza" değil **bilgilendirme** banner'ı (alt şerit + "Tamam").
  `localStorage.dcp_cookie_ok=1` ile hatırlar. Reklam/analytics eklenirse gerçek rıza seçeneğine
  yükseltilecek.
- **12 sayfaya `<script src="/js/cookie-consent.js">` eklendi:** index, login, turnuvalar,
  viewer, organizer, forgot-password, reset-password, verify-email, profil + 3 yasal sayfa.
  **Tablet sayfalarına (board/tv/scorer) BİLİNÇLİ eklenmedi** (canlı skor ekranında rahatsız edici).
- **Tabletlerde ASLA gösterilmez — üç katmanlı koruma (kullanıcı isteği, Tem 2026):**
  (1) board/tv/scorer.html'e script hiç eklenmedi; (2) `cookie-consent.js` başında yol kontrolü
  — `location.pathname` `board|tv|scorer.html` ise `return`; (3) PWA standalone kontrolü —
  `matchMedia('(display-mode: standalone)')` veya iOS `navigator.standalone` true ise `return`
  (board/scorer tabletten "ana ekrana ekle" ile açılınca). Yani script ileride yanlışlıkla bu
  sayfalara eklense bile banner çıkmaz. Yeni bir tablet/kiosk sayfası eklenirse yol regex'ine
  ekle.

### 5. Veri indirme (KVKK erişim hakkı)
- `src/auth.js` `exportDataHandler` (module.exports'a eklendi) → `server.js` `GET /auth/export-data`.
  Kullanıcının hesap + turnuvalar + ligler/sezonlar + kayıtlar + oyuncu profilini JSON dosyası
  olarak indirir (`Content-Disposition: attachment`). **Hassas alanlar çıkarılır** (`password_hash`,
  `verify_token`, `reset_token`). `db.allTournaments/allCompetitions/registrationsForUser/
  playerCareerProfile` helper'larını kullanır (hepsi userId scope'lu, try/catch'li).
- `public/profil.html`'e "Verilerim & Gizlilik" bölümü + "⬇ Verilerimi İndir (JSON)" butonu.

### Bilinmesi gereken
- **Render env yönetimi elle** (dashboard.render.com → servis `dartcorepro`
  (srv-d7mttbapmmbs73c6cm5g) → Environment). `render.yaml` sadece dökümantasyon.
- Turnstile/Backblaze **secret** değerleri repoda YOK, sadece Render panelinde.
- `package.json`'a `helmet` + `express-rate-limit` eklendi; `npm install` + `npm audit fix`
  çalıştırıldı (qs/ws açıkları kapandı; `xlsx` açığı "no fix available" — kullanım yazma-only
  olduğu için pratik risk yok, bırakıldı).
- Deploy dosyaları (kullanıcı Mac'te git ekler): `server.js`, `src/auth.js`, `package.json`,
  `package-lock.json`, `public/index.html`, `public/profil.html`, `public/login.html`,
  `public/turnuvalar.html`, `public/viewer.html`, `public/organizer.html`,
  `public/forgot-password.html`, `public/reset-password.html`, `public/verify-email.html`,
  `public/gizlilik.html`, `public/kosullar.html`, `public/cerezler.html`,
  `public/js/cookie-consent.js`.

## Git / Deploy — kilit (.lock) sorununu önleme (KALICI KURAL, Haz 2026)

**Belirti:** Her deploy denemesinde `fatal: Unable to create '.git/index.lock' (veya HEAD.lock): File exists` → commit oluşmaz, `git push` "Everything up-to-date" der.

**Kök neden:** Bu proje klasörü Cowork'e **FUSE ile bağlı**. Cowork ajanı (sandbox) klasör
üzerinde `git add/commit/reset/checkout` gibi **yazma** komutu çalıştırırsa, yarıda kalan işlem
`.git/index.lock` / `.git/HEAD.lock` bırakır ve sandbox bunları **silemez** ("Operation not
permitted" — FUSE izni). Sonra kullanıcının Mac'indeki git bu artıklara takılır. Stale lock'lar
gün/tarih olarak eskidir (ör. hepsi aynı eski tarih).

**KALICI KURALLAR:**
1. **Ajan (Claude) bu repoda git YAZMA komutu ÇALIŞTIRMAZ.** Sadece dosyaları düzenler
   (Read/Write/Edit). `git add/commit/reset/checkout/merge/rebase` → **yalnız kullanıcı, kendi
   Mac'inde.** Ajan en fazla **salt-okuma** git komutu kullanabilir: `git --no-optional-locks status/diff/log`.
   (Salt-okuma için bile `--no-optional-locks` ile çalış ki index.lock yaratma riski olmasın.)
2. **Kilit hatası çıkarsa** kullanıcı Mac'te, proje kökünde: `find .git -name "*.lock" -print -delete`.
   (Sadece `index.lock` silmek YETMEZ — `commit` ardından `HEAD.lock`'a takılır; ikisini de sil.)
3. **`git add -A` KULLANMA.** FUSE klasöründe `.fuse_hidden*` çöp dosyaları + test sırasında
   alınan `data.db.yedek` gibi dosyalar staged olur. Dosyaları **tek tek** ekle. (Bunlar artık
   `.gitignore`'da, ama yine de açık liste güvenli.)
4. Tipik temiz deploy dizisi (kullanıcı, Mac):
   `find .git -name "*.lock" -delete` → `git add <değişen dosyalar>` → `git commit -m "..."` → `git push`.

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

## Tablet offline atış kuyruğu + idempotency (Temmuz 2026)

Kullanıcı isteği: internet dalgalanmasında gönderilemeyen atış kaybolmasın; ama **çift sayma
kesinlikle olmasın**. İki katmanlı çözüm — sunucu idempotency + tablet kuyruğu.

### Sunucu tarafı (korumasız — `server.js` + `db.js`)
- Yeni tablo `applied_client_throws(client_id TEXT PK, match_id, created_at)` (CREATE IF NOT
  EXISTS; şema değişikliği değil, yeni tablo — Kod konvansiyonu #8'e uygun).
- Yeni helper `db.applyThrowIdempotent(clientId, matchId, fn)`: clientId varsa **tek
  transaction** içinde — daha önce işlenmişse `fn`'i ÇALIŞTIRMADAN `{duplicate:true}` döner;
  değilse `fn()` (engine.recordThrow / recordCricketVisit / recordFBCezaliVisit /
  recordKarambolVisit) çalışır, clientId işaretlenir, sonuç döner. clientId yoksa eski
  davranış (sadece `fn()`). **match-engine.js'e DOKUNULMADI** — kontrol endpoint'te.
- **Dört atış ucu da idempotent:** `/throw`, `/cricket-throw`, `/fb-cezali-throw`,
  `/karambol-throw`. Hepsi `clientThrowId`'yi body'den okur; duplicate ise `{duplicate:true}`
  döner + `match:update` yayınlar (state tazelensin).

### Tablet tarafı (KORUMALI — `board.js`, kullanıcı onayıyla)
- Offline kuyruk: `_throwQueue` (localStorage `board.throwQueue.v1` — kalıcı, tablet/uygulama
  kapanıp açılsa bile kaybolmaz). Her atışa `_genThrowId()` (crypto.randomUUID, fallback'li)
  ile benzersiz `clientThrowId` eklenir.
- `sendThrow(url, body)`: atışı kuyruğa ekler + `flushThrowQueue(id)` çağırır. Dönüş: sunucu
  cevabı (delivered) veya offline ise `{_queued:true}`.
- `flushThrowQueue`: kuyruğu **FIFO** gönderir; `_network` hatası → durur (kuyruk kalır),
  diğer durumda (başarı/duplicate/uygulama-hatası) kuyruktan çıkar. `_flushingQueue` kilidi
  eşzamanlı akışı önler.
- Otomatik boşaltma: `socket.on('connect')` + her 5 sn timer + `window load`.
- Bekleyen atış rozeti (`#pending-throws`) dinamik oluşturulur — **board.html'e dokunulmadı**.
- **Dört submit yolu da kuyruğa bağlı:** `submitScore`, `submitBust` (X01, `/throw`),
  `submitCricketDarts`, `submitFBCezaliDarts`, `submitKarambolDarts`. Her biri: `res._queued`
  → offline flash + return; `res.duplicate` → sessiz return (zaten sayıldı); değilse eski akış.
- **Offline sınırı:** yerel skor motoru yok → kopukken kalan/sıra ekranda güncellenmez (atış
  kuyrukta, bağlantı gelince uygulanır ve socket ile ekran oturur). Kısa blip'lerde saniyeler
  içinde çözülür; conn-banner + rozet kullanıcıyı uyarır.
- `scorer.html` (Hızlı Skor) sunucusuz/local olduğu için **etkilenmez** — kuyruk ağ katmanı.

### Doğrulama
İzole node:sqlite shim'iyle (bkz. Doğrulama tarzı) gerçek `db.js`+`match-engine.js`'e karşı:
idempotency (aynı clientThrowId 2. kez uygulanmaz, farklı normal, clientId yok=eski davranış)
+ kuyruk (online normal, offline bekleme, reconnect otomatik boşaltma, **ACK-kayıp → yeniden
gönderim çift saymaz**, localStorage kalıcılık) — hepsi geçti. `node --check` temiz.

## Tabletlere hafif snapshot — büyük paketi kesme (Temmuz 2026)

Kullanıcı isteği: "büyük paketi tablete göndermeyi keselim." Tabletler `state` yayınındaki
dev snapshot'ı (512 kişilik turnuvada 511 maç + entry başı `report`) her atışta indirip
çöpe atıyordu; `board.js` bu paketten yalnız `boards` + turnuvaların `name`/`status`/
`game_mode`/`entries` alanlarını kullanıyor (`matches`/`report`/`stages`/`players` HİÇ
kullanılmıyor — grep'le doğrulandı).

**Çözüm (sadece `server.js` — korumasız; `board.js`'e DOKUNULMADI):**
- Yeni `getBoardSnapshot(userId)` — `matches`, `report`, `stages` ve `players`'ı atlar;
  `boards` + hafif turnuva nesneleri (`...t` + `entries`) döndürür. `entries` korunuyor
  çünkü skorer dropdown'ı (`board.js` renderMatch) ona bağlı.
- `board:subscribe` handler'ı socket'i işaretler: `socket.data.boardId = +boardId`.
- `flushBroadcast` artık `boardMode` socket'lere `getBoardSnapshot`, diğerlerine (organizatör/
  izleyici/TV) tam `getSnapshot` gönderir. Cache anahtarı `'b:'|'f:' + uid` ile ayrıldı.
- Bağlantı anındaki ilk `socket.emit('state', getSnapshot(uid))` tam kalır (tek seferlik,
  abone olmadan önce). Sonraki tüm yayınlar tablet için hafif.

Skoru giren tablet zaten `board:state` + `match:update` ile anlık güncelleniyor → bu
değişiklikten etkilenmez. Board picker sayfası (henüz abone değil) hâlâ tam snapshot alır,
ama geçici bir ekran olduğu için önemsiz.

**Bekleyen (kullanıcıyla konuşulacak):** Bağlantı kopması sırasında gönderilemeyen atışın
kaybolmaması için tablet tarafında offline kuyruk + retry. Bu ayrı bir iş — debounce/snapshot
ile ilgisi yok.

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

### Cowork sandbox'ta gerçek motoru koşturma (better-sqlite3 native binary sorunu)
Cowork/Linux sandbox'taki `node_modules/better-sqlite3` **Mac derlemesi** olduğu için
`require('./src/db')` sandbox'ta "invalid ELF header" ile patlar; kaynaktan yeniden derleme
de ağ kısıtı (node headers 403) yüzünden olmaz. Bu yüzden ajan, gerçek `db.js`/`match-engine.js`
kodunu doğrulamak için **izole bir kopyada node:sqlite shim'i** kullanır (kullanıcının
klasörüne / node_modules'ına DOKUNMADAN):
1. `src/`'yi `/tmp/...`'a kopyala.
2. `node_modules/better-sqlite3/index.js` olarak ince bir shim yaz: `node:sqlite`'ın
   `DatabaseSync`'ini better-sqlite3 API'sine (`prepare().run/get/all`, `.pluck()`, `exec`,
   `pragma`, `transaction(fn)`) sarmalar. `run()` `lastInsertRowid`'i Number'a çevirmeli.
3. Geçici `DB_PATH` ile gerçek `db.init()` + `tournament`/`engine` fonksiyonlarını çağırıp
   assert et. (Örnek: Temmuz 2026 Geri Al düzeltmesi bu yöntemle iki senaryoda doğrulandı.)
Bu, Mac'te `scripts/smoke-*.js` çalıştırmanın yerine geçer; yine de kritik işlerde kullanıcının
Mac'te de koşturması önerilir. node:sqlite "experimental" uyarısı verir — zararsız.

## Tarz tercihleri

- Türkçe konuş, Türkçe commit yaz, Türkçe yorum yaz.
- Kullanıcı non-technical — her büyük adımı kısaca açıkla, "neden" göster.
- Aşırı liste/madde ile boğma; kısa paragraflar tercih.
- Görsel feedback değerli — büyük UI değişikliklerinden sonra mockup widget göstermek faydalı oluyor (kullanıcı "scorer ekranı nasıl görünüyor" gibi sorularla istiyor).
- Yeni özellik eklemeden önce kısa bir plan paylaş, onay al, sonra uygula.

---

## Hafta 9 veri kaybı + yedekleme sıklaştırma (Ağustos 2026)

Canlı SMDN sezonunda **Hafta 9 turnuvası silindi** (organizatör bugün öğleden sonra kurup
yarı finale kadar oynatmış, sonra kazara/refactor sırasında turnuva satırları silinmiş).
Belirti: `liga.html`'de sezon duruyordu ama Hafta 9 oturumu (`competition_sessions.id=28`)
`tournament_id=NULL` + `status=pending`'e düşmüştü; turnuva id'leri 82→87 atlıyordu (83-86 silinmiş).

### Teşhis (ileride benzer durumda izlenecek yol)
1. `liga.html` + `/api/competitions` → sezon/lig kaydı duruyor mu?
2. `/api/competitions/:id/sessions` → hangi oturum `tournament_id=NULL` / `pending`?
3. `/api/tournaments` → beklenen turnuva var mı? **id boşlukları** silinmeye işaret eder.
4. `/api/matches/for-tournament/:id` → silinen id'ler `403 "Erişim yok"` döner (satır yok = sahiplik bulunamaz).

### Yedekten kurtarma DENENDİ, olmadı — neden (kritik ders)
- Backblaze'de o günün **tek yedeği sabah** alınmıştı (`data-2026-08-03_0829.db.gz`; dosya adı
  UTC, uploaded sütunu TR = UTC+3). Hafta 9 **öğleden sonra** kurulup akşam silindiği için
  **hiçbir yedeğe hiç girmemişti**. Günde-tek yedek, gün içi kurulup silinen veriyi kaçırır.
- Sandbox'ta `sqlite3` CLI yok, `.recover` yapılamadı; adli kurtarma da (silinen sayfaların
  Lucky Loser 9'un aktif yazımıyla üzerine yazılma riski) belirsizdi. Kullanıcı sonuçları
  bildiği için **yeniden kurma** yolu seçildi.

### Kurtarma yöntemi — bracket'i yeniden kur + hükmen sonuç işle (çalıştı)
Kullanıcı silinmeden önceki **boş bracket ekran görüntüsünü** (Son 32 kurası) gönderdi.
Adımlar (hepsi tarayıcıdan, authenticated `fetch` ile — production endpoint'leri):
1. **Kura reprodüksiyonu (dikkat!):** `seedWithByes` girişleri `buildSeedOrder` ile STANDART
   tohumlama pozisyonlarına yerleştirir (1vN), ekrandaki ARDIŞIK eşleşmeyi (satır 1v2) doğrudan
   vermez. Ekran görüntüsündeki slot sırasını birebir üretmek için **ters permütasyon** gerekir:
   `entryIds[buildSeedOrder(32)[slot]-1] = slotOyuncu[slot]`, seed=null (sıra korunur). Bu,
   yerel `node:sqlite` shim'iyle gerçek `tournament.js`'e karşı doğrulandı (16/16 eşleşme tuttu).
2. `DELETE /api/competitions/6/sessions/28` (boştaki dangling oturumu sil).
3. `POST /api/competitions/6/sessions` — `format:single_elim`, `participant_player_ids` (32 pid),
   `entries:[{player_id,seed:null}]` ters-permütasyon sırasında, `round_overrides:{"final-5":{legs:4}}`.
4. `POST /api/tournaments/:tid/start` (maçlar burada kurulur — `createTournament` DRAFT bırakır,
   `startTournament` bracket'i kurar).
5. Her turu (R1→R5) sırayla `POST /api/matches/:id/walkover {winnerSlot}` ile işle. Walkover
   `is_walkover=1` + leg skoru (kazanan `legs_to_win`, rakip 0) yazar; **pozisyon/puan tam doğru**
   olur, ama 3DA/180 gibi atış istatistikleri bu maçlar için gelmez (zaten silinmişti). `winnerSlot`,
   `/api/matches/for-tournament/:tid`'deki `p1_name`/`p2_name` ile eşleştirilerek bulundu.
6. `POST /api/competitions/6/sessions/:sid/finalize` — klasmana işle (idempotent). Puan haritası
   `positionToStage` (1→birinci, 2→final, 3-4→yari_final, 5-8→ceyrek_final, 9-16→son_16, 17-32→son_32).
   32 kişi, 87 puan dağıtıldı. Şampiyon: Serhan Özkebapçı.
7. **Temizlik:** Oturum oluşturma idle boardları turnuvaya claim'ler; iş bitince
   `PATCH /api/boards/:id {tournament_id:null}` ile Hafta 9 boardları serbest bırakıldı.

**Board güvenliği:** Kurtarma sırasında tüm boardlar idle'dı (Lucky Loser 9 çalışıyordu ama o an
tabletlerde canlı maç yoktu) → kesinti olmadı. Benzer işlemde önce `/api/boards`'tan idle olduğunu
teyit et.

### Kalıcı çözüm — olay-tetikli yedek + temizlik (deploy edildi)
Kök sebep günde-tek yedekti. `src/backup.js` + `server.js` değiştirildi (additive, korumalı
modüllere dokunulmadı):
- **`backup.triggerBackup()`** — debounce'lu (env `BACKUP_MIN_INTERVAL_MIN`, varsayılan 15 dk).
  `server.js`'de dört atış ucuna (`/throw`, `/cricket-throw`, `/fb-cezali-throw`, `/karambol-throw`)
  + `/walkover`'a eklendi. Turnuva oynanırken (tabletlerden atış geldikçe) en fazla 15 dk'da bir
  gerçek yedek; boştayken hiç. `_lastBackupAt`/`_pendingTimer` modül-seviye debounce durumu.
- **Güvenlik ağı:** `startSchedule` varsayılan aralık 24s → **3s** (`BACKUP_INTERVAL_HOURS`).
- **`pruneOldBackups(client)`** — her başarılı yükleme sonrası `LastModified` > `BACKUP_RETENTION_DAYS`
  (varsayılan 60) olan yedekleri siler (S3 `ListObjectsV2`/`DeleteObject`). Depolama birikmez.
- Üç değer de kod varsayılanlı → ekstra Render env gerekmez, sadece deploy.
- Canlı doğrulama: deploy sonrası log `[backup] OK -> backups/data-2026-08-03_2241.db.gz (814 KB)`
  — boyut 666→814 KB, çünkü artık Hafta 9 verisi de yedeğin içinde.

**Ders:** Gün içi kurulup silinen veri günde-tek yedeğe girmez. Canlı turnuva sistemi için yedek,
**aktivite anında** (atış geldikçe) alınmalı. Ayrıca sandbox'ta `sqlite3` CLI yok — adli kurtarma
gerekirse ya CLI kur ya da ham DB'yi (online-backup DEĞİL, gerçek dosya) çıkar; online-backup
silinen/freelist sayfaları almaz.
