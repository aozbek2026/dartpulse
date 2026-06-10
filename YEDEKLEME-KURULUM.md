# Bulut Yedekleme — Kurulum Rehberi (Backblaze B2)

Bu rehber, turnuva veritabanının (`data.db`) otomatik olarak Backblaze B2'ye
(ücretsiz 10 GB, kredi kartı istemez) yedeklenmesi içindir. Kurulum bittiğinde
sunucu, veritabanının sıkıştırılmış bir kopyasını düzenli aralıklarla (varsayılan
24 saatte bir) buluta yükler. Render diski tamamen kaybolsa bile verin güvende olur.

> **Önemli:** Anahtarları Render'a girene kadar hiçbir şey değişmez. Kod, anahtar
> yoksa yedeklemeyi sessizce kapalı tutar — sistem aynen çalışmaya devam eder.

Kodda yapılanlar **tamamlandı**. Senin yapman gereken sadece aşağıdaki adımlar.

---

## 1. Backblaze hesabı aç
1. https://www.backblaze.com/sign-up/cloud-storage adresine git, ücretsiz hesap aç.
   (E-posta + şifre yeterli, kredi kartı istemez.)
2. E-postanı doğrula ve giriş yap.

## 2. Bucket oluştur
1. Sol menüden **B2 Cloud Storage** → **Buckets** → **Create a Bucket**.
2. Bucket adı: `dartcorepro-yedek` (benzersiz olmalı; alınmışsa sonuna sayı ekle).
3. **Files in Bucket are:** **Private** seç.
4. Oluştur.
5. Oluşan bucket'ın detayında **Endpoint** yazar, ör:
   `s3.us-west-004.backblazeb2.com`
   - Buradan iki bilgi çıkar:
     - **Endpoint (tam):** başına `https://` ekle → `https://s3.us-west-004.backblazeb2.com`
     - **Region (bölge):** ortadaki kısım → `us-west-004`

## 3. Uygulama anahtarı (Application Key) oluştur
1. Sol menüden **Account** → **Application Keys**.
2. **Add a New Application Key**.
3. **Name:** `dartcorepro-render` (serbest).
4. **Allow access to Bucket(s):** sadece `dartcorepro-yedek` seç.
5. **Type of Access:** **Read and Write**.
6. **Create New Key**.
7. Sana iki değer verir — **hemen kopyala** (`applicationKey` bir daha gösterilmez):
   - **keyID**
   - **applicationKey**

## 4. Render paneline anahtarları gir
1. https://dashboard.render.com → servisin (`dart-tournament`) → **Environment**.
2. **Add Environment Variable** ile şunları tek tek ekle:

   | Key | Value | Nereden |
   |---|---|---|
   | `BACKUP_S3_ENDPOINT` | `https://s3.us-west-004.backblazeb2.com` | Adım 2.5 (kendi bölgenle) |
   | `BACKUP_S3_REGION` | `us-west-004` | Adım 2.5 (kendi bölgen) |
   | `BACKUP_S3_BUCKET` | `dartcorepro-yedek` | Adım 2.2 |
   | `BACKUP_S3_KEY_ID` | (keyID) | Adım 3.7 |
   | `BACKUP_S3_SECRET` | (applicationKey) | Adım 3.7 |

   > Not: `us-west-004` örnektir — kendi endpoint'inde hangi bölge yazıyorsa onu kullan.
   > `BACKUP_INTERVAL_HOURS` zaten 24 olarak ayarlı, değiştirmen gerekmez.
3. Kaydet. Render otomatik yeniden başlatır.

## 5. Çalıştığını doğrula
- Render → servisin → **Logs** sekmesine bak. Açılışta şu satırı görmelisin:
  `[backup] aktif — her 24 saatte bir yedek alınacak`
- ~30 saniye sonra: `[backup] OK -> backups/data-...db.gz (.. KB)`
- Backblaze → bucket'ında `backups/` klasöründe dosyayı görürsün.

Bu satırları görüyorsan yedekleme çalışıyor demektir.

---

## Bir yedeği geri yüklemek gerekirse
Yedek dosyası gzip'lenmiş bir SQLite veritabanıdır. Geri yükleme nadir ve dikkat
gerektiren bir iştir — gerektiğinde bana söyle, adım adım birlikte yaparız.
Yanlış yapılırsa mevcut veri üzerine yazılabileceği için tek başına denememeni öneririm.

## Notlar
- Yedekleme veritabanını sadece **okur** — canlı turnuvayı kesmez.
- Anahtarlar repoya yazılmaz, sadece Render panelinde durur.
- Yerelde (kendi bilgisayarında) çalışırken yedekleme kapalıdır — bu normaldir.
