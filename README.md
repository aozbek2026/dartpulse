# 🎯 Dart Turnuva Sistemi

Çok cihazlı, gerçek zamanlı dart turnuva yönetim sistemi. Katılımcı kaydı, otomatik board atama, tabletten skor girişi ve otomatik bracket ilerletme.

## Özellikler

- **Turnuva formatları:** Tek eleme, çift eleme (winners + losers bracket), round-robin
- **Çok aşamalı turnuva:** Birden fazla stage zincirlenebilir (örn: önce round-robin gruplar → üst sıralardakiler tek elemeye geçer)
- **Oyun modları:** 501 / 701 / 1001 double-out + basit Cricket
- **Takım modu:** Teklik (singles) ve çiftli (doubles)
- **Otomatik board ataması:** Bir board boşaldığında sıradaki hazır maç otomatik yerleştirilir
- **Tablet skor girişi:** 3-dart toplamı olarak hızlı giriş + hızlı tuşlar (60/80/100/120/140/180/26/Bust)
- **Real-time:** Socket.IO ile tüm ekranlar (organizatör, board, izleyici) anlık senkron
- **İstatistikler:** 3-dart ortalaması, best checkout, 180'ler, 100+ / 140+ sayıları
- **Undo:** Aynı leg içinde son atışı geri alma

## Kurulum

Node.js 18+ gerekli.

```bash
cd dart-tournament
npm install
npm start
```

Sunucu `http://localhost:3000` adresinde başlar.

## Ekranlar

Aynı makinedeki tarayıcıdan veya aynı Wi-Fi'daki tabletlerden:

- **Organizatör:** `/organizer.html` — katılımcı kaydı, board yönetimi, turnuva kurulumu, bracket görüntüsü
- **Board (tablet):** `/board.html` — önce board seçilir, sonra aktif maç ekranı açılır. Skor girişi bu ekrandan
- **İzleyici:** `/viewer.html` — canlı bracket, aktif maçlar, round-robin tabloları

## Kullanım akışı

1. **Organizatör ekranını aç** (`/organizer.html`)
2. **Katılımcılar** sekmesinden oyuncuları ekle
3. **Board'lar** sekmesinden dart tahtalarını kaydet (örn: "Board 1", "Board 2", ...)
4. Her tableti kendi board'unun linkiyle aç (`/board.html?id=1` vs.) — bir kere seçince bu sayfa o board'un ekranı olur
5. **Yeni Turnuva** sekmesinden turnuvayı kur:
   - İsim, oyun modu (501/701/1001/Cricket), takım modu (singles/doubles)
   - Leg ve set hedefleri (örn: Best of 5 leg → leg kazanmak için 3)
   - Aşamaları ekle (tek aşama veya RR → elim zinciri)
   - Katılımcıları seç
6. **Turnuvalar** sekmesinden turnuvayı **Başlat** — sistem otomatik olarak maçları boş board'lara dağıtmaya başlar
7. Her board'da tablet ekranında aktif maç görünür. Skor giriş tuş takımı ile her el için 3-dart toplamını gir
8. Maç bitince kazanan bracket'te ilerletilir, board boşalır, sıradaki maç atanır

## Lokal ağ (LAN) dağıtımı

Etkinlik yerinde bir laptop'u sunucu yap:

```bash
npm start
```

Laptop'un yerel IP'sini öğren (örn: macOS `ifconfig`, Windows `ipconfig`). Tabletler aynı Wi-Fi'dan `http://<laptop-ip>:3000/board.html?id=<boardId>` adresini açsın.

## Bulut dağıtımı

Bir VPS / Railway / Render'a deploy için:

```bash
# PORT env değişkeniyle platform portunu kullanır
PORT=$PORT npm start
```

`better-sqlite3` SQLite'i dosya olarak saklar (`data.db`). Bulut deployında persistent disk kullan veya her deployda veritabanı sıfırlanır.

## Proje yapısı

```
dart-tournament/
├── server.js              # Express + Socket.IO giriş
├── src/
│   ├── db.js              # SQLite şeması ve sorgu katmanı
│   ├── tournament.js      # Bracket üretimi + stage ilerletme
│   ├── match-engine.js    # Skor girişi, leg/set takibi, bust/finish
│   └── scheduler.js       # Otomatik board atama
└── public/
    ├── index.html         # Rol seçimi
    ├── organizer.html     # Organizatör paneli
    ├── board.html         # Board/tablet ekranı
    ├── viewer.html        # İzleyici/leaderboard
    ├── css/style.css
    └── js/
        ├── common.js
        ├── organizer.js
        ├── board.js
        └── viewer.js
```

## Bilinen sınırlamalar / yapılacaklar

Bu bir MVP. Aşağıdakiler ilerleyen sürümlerde eklenebilir:

- **Cricket için detaylı marks takibi** — şu an basit puan toplama olarak çalışır (ilk 500'e ulaşan kazanır)
- **Dart-by-dart giriş modu** — şu an yalnızca 3-dart toplamı; D/T/S dilim bazlı detaylı istatistik için gerekli
- **Finish önerisi (checkout suggestion)** — kalan skor için olası finish kombinasyonları
- **Kimlik doğrulama** — şu an herkesin her şeye erişimi var; etkinlik içi LAN'da sorun değil
- **PDF/CSV ihracat** — turnuva sonrası rapor
- **Çift eleme wiring'i daha sağlam test edilmeli** — standart çoğu senaryoda çalışır, kenar durumlarda kontrol edilmeli
- **Tek bir maçın yeniden oynatılması / manuel düzeltme** — şu an sadece son atış undo var

## Geliştirme

```bash
npm run dev   # --watch ile otomatik restart
```

Veritabanını sıfırlamak için:

```bash
rm data.db && npm start
```

Ya da API'den: `POST /api/reset`

## Lisans

MIT
