# LAN Test Rehberi (4 Tablet)

Bu rehber, evdeki Wi-Fi'da bir laptop + 4 tablet ile gerçek-koşul testi yapmak için.

---

## 1. Ön hazırlık (laptop)

```bash
cd dart-tournament
npm install     # ilk seferde
npm run seed-demo  # opsiyonel: 8 oyuncu + 4 board + 1 demo turnuva
npm start
```

Açılışta sunucu kendi LAN IP'sini de basar:

```
🎯 Dart Tournament sunucusu çalışıyor
   Yerel:        http://localhost:3000
   ...
📱 Tabletlerden bağlanmak için (aynı Wi-Fi'da olmalı):
   en0          http://192.168.1.42:3000
   Tablet → Board:  http://192.168.1.42:3000/board.html
   TV/salon ekranı: http://192.168.1.42:3000/tv.html
```

> Bu IP'yi (örn. `192.168.1.42`) tabletlere yazacaksın. Aynı Wi-Fi
> ağında olmaları **şart**; misafir ağı / cihaz izolasyonu açıksa engellenir.

---

## 2. Firewall'ı aç (yalnız bir kez)

### macOS
Sistem Ayarları → Ağ → Güvenlik Duvarı:
- Güvenlik Duvarı **açıksa**, "Seçenekler"den `node` için "Gelen bağlantılara izin ver" seç. Veya:
  ```bash
  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
  sudo /usr/libexec/ApplicationFirewall/socketfilterfw --unblockapp /usr/local/bin/node
  ```

### Windows
Windows Defender Güvenlik Duvarı → "Bir uygulamaya izin ver" → `node.exe` için **Özel ağ**'da kutucuk işaretli olmalı. Veya PowerShell (admin):
```powershell
New-NetFirewallRule -DisplayName "Dart Tournament 3000" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Linux (ufw)
```bash
sudo ufw allow 3000/tcp
```

---

## 3. Tablet rolleri (4 tablet)

Önerilen dağılım:

| Tablet | Rol | URL | Notlar |
|---|---|---|---|
| **T1** | Organizatör (sen) | `/organizer.html` | Hesap oluştur, turnuvayı başlat, kontrol et |
| **T2** | Board 1 skor girişi | `/board.html` → **Board 1** seç | Oyun anında "yazıcı-hakem" yapan kişi tablete dokunur |
| **T3** | Board 2 skor girişi | `/board.html` → **Board 2** seç | Aynı |
| **T4** | TV/salon ekranı | `/tv.html` | Büyük ekran/TV bağlıysa orada da açabilirsin |

> **2 board ile başlayabilirsin** (T1=organizer, T2=board1, T3=board2, T4=tv).
> Daha fazla board olunca scheduler otomatik atar.

---

## 4. Test sırası (10 dakikada uçtan uca)

1. **Laptop**: `npm start` → terminalde LAN URL görünene kadar bekle
2. **T1 (organizer)**: tarayıcıdan `http://<LAN-IP>:3000`
   - Kayıt olmadıysan: `seed-demo` scriptini çalıştırdıysan → email `demo@dart.local`, şifre `demo123` ile gir
   - Kayıt olduysan: kendin oluştur (Türkçe formdan)
3. **T1**: Eğer `seed-demo` çalıştırdıysan → "Turnuvalar" sekmesi → **Demo Turnuva**'yı **Başlat**
4. **T2, T3**: tarayıcıdan `/board.html` → kendine ait board'u seç (Board 1, Board 2 …)
   - "Bu board'a maç atanmasını bekliyor" yazısını görür
   - Birkaç saniye sonra organizer'da "Başlat" basıldıysa otomatik bir maç düşer
5. **T4 (TV)**: `/tv.html` aç → ekran tam-ekran kiosk moduna alır, 15sn'de bir bölümler döner
6. **T2**: ilk maç düşünce ekranda kim atacak/kim yazıcı olacak görünür → "Maça Başla" → keypad açılır
7. **Skor gir**: 60, 26, 100, … düğmelerine bas. T4'teki TV ekranı **gerçek zamanlı** günceller

---

## 5. Pre-flight checklist

- [ ] Laptop ve 4 tablet **aynı Wi-Fi**'da (hotspot/misafir ağı değil)
- [ ] Laptop'un IP'si terminalde görünüyor
- [ ] Tabletlerden `http://<IP>:3000` açılıyor (ping testi)
- [ ] Firewall node'a izin veriyor
- [ ] `seed-demo` çalıştırıldıysa Demo Turnuva organizer'da görünüyor
- [ ] Tabletlerin ekran-uyutma süresi **"Hiçbir Zaman"**'a alındı (özellikle T4-TV için)
- [ ] Tabletler şarjda veya yeterli pille
- [ ] Wi-Fi sinyali her board'un yanında dolu çekiyor

---

## 6. Bilinen kısıtlar

### TV modunda Wake Lock
TV modu (`/tv.html`) ekranı uyutmamak için Wake Lock API kullanır.
Bu API yalnızca **HTTPS** veya **localhost**'ta çalışır — LAN üzerinden HTTP ile
bağlandığında **çalışmaz**. Çözüm:
- Tabletin sistem ayarından "Ekran kapanma süresi" → "Hiçbir Zaman"
- Veya laptop'u TV'ye HDMI ile bağla, `localhost`'tan TV modunu aç (Wake Lock çalışır)

### Tablet uyandırma
Tabletler kilitlenince Socket.IO bağlantısı kopabilir; uyandırınca otomatik
yeniden bağlanır ama tarayıcıyı kapatma. Bilinen bir Safari kısıtı: arka plana
düşen sekmelerde WebSocket askıya alınır → öne alınca anında recover eder.

### iPad keypad zoom'u
iOS Safari, input'a focus olunca otomatik zoom yapabilir. Skor giriş ekranında
keypad button'ları kullanıldığı için input yok — sorun yaşamazsın.

---

## 7. Sorun çözme

**"Tabletten siteye giremiyorum"**
→ 1) Aynı Wi-Fi mı? 2) Firewall? 3) `ping <LAN-IP>` çalışıyor mu?

**"Maç atanmadı, board ekranı bekliyor"**
→ Organizer'da turnuva **başlatıldı mı**? "Turnuvalar → Başlat".

**"Skor giriyorum ama TV'ye yansımıyor"**
→ T4'te tarayıcı konsolunu aç (Safari: Ayarlar → Safari → Gelişmiş → Web denetçisi).
WebSocket connection error yazıyorsa → laptop ile aynı ağda mı bak.

**"Veritabanını sıfırlamak istiyorum"**
→ Sunucuyu durdur, `tournament.db` dosyasını sil, `npm start` ile tekrar başlat.
   Veya organizer arayüzündeki "Reset" tuşu (sadece kendi hesabını siler).

---

## 8. Hızlı erişim URL'leri

LAN IP = `192.168.1.42` varsayalım, kendi IP'nle değiştir:

| Sayfa | URL |
|---|---|
| Organizer | `http://192.168.1.42:3000/organizer.html` |
| Login | `http://192.168.1.42:3000/login.html` |
| Board | `http://192.168.1.42:3000/board.html` |
| İzleyici | `http://192.168.1.42:3000/viewer.html` |
| TV/Kiosk | `http://192.168.1.42:3000/tv.html` |
