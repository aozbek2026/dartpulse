// SQLite veritabanı katmanı - better-sqlite3 ile senkron erişim
const path = require('path');
const Database = require('better-sqlite3');

// Güvenlik: production'da DB_PATH AÇIK olmak zorunda. Yoksa kalıcı diske değil
// geçici filesystem'e yazardık — her deploy'da kullanıcılar/turnuvalar uçar.
// Bu kontrol o regresyonu kalıcı olarak engeller (eski sürüm canlı kalır).
if (process.env.NODE_ENV === 'production' && !process.env.DB_PATH) {
  console.error('[FATAL] DB_PATH env var production\'da set değil. Geçici filesystem kullanılırsa kullanıcı/turnuva kayıtları uçar.');
  console.error('[FATAL] Render: render.yaml -> envVars.DB_PATH = /data/data.db olmalı ve disk mount /data duruyor olmalı.');
  process.exit(1);
}

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');

// Açılışta yolu logla — Render Logs'unda her deploy sonrası DB nerede görünür.
console.log(`[db] DB_PATH = ${DB_PATH}`);

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      nickname TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS boards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      tournament_id INTEGER,        -- null = "Genel" (her turnuvaya atanabilir)
      name TEXT NOT NULL,
      status TEXT DEFAULT 'idle',  -- idle | busy
      current_match_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      game_mode TEXT NOT NULL,        -- '501' | '701' | '1001' | 'cricket'
      team_mode TEXT NOT NULL,        -- 'singles' | 'doubles'
      legs_to_win INTEGER DEFAULT 2,  -- best of (2*legs_to_win - 1)
      sets_to_win INTEGER DEFAULT 1,  -- 1 = legs only, >1 = sets mode
      status TEXT DEFAULT 'draft',    -- draft | running | finished
      config_json TEXT,               -- extra config
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      slot INTEGER NOT NULL,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER,  -- doubles
      seed INTEGER,        -- seri başı (null = kurayla yerleşen)
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      stage_index INTEGER NOT NULL,
      format TEXT NOT NULL,           -- 'single_elim' | 'double_elim' | 'round_robin'
      status TEXT DEFAULT 'pending',  -- pending | running | finished
      qualifier_count INTEGER,        -- RR stage için kaç kişi bir sonraki stage'e geçer
      config_json TEXT,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      stage_id INTEGER NOT NULL,
      bracket TEXT,                   -- winners | losers | final | group | rr
      round INTEGER,
      match_index INTEGER,
      entry1_id INTEGER,
      entry2_id INTEGER,
      winner_entry_id INTEGER,
      status TEXT DEFAULT 'pending',  -- pending | ready | live | finished
      board_id INTEGER,
      current_leg INTEGER DEFAULT 1,
      current_set INTEGER DEFAULT 1,
      p1_sets INTEGER DEFAULT 0,
      p2_sets INTEGER DEFAULT 0,
      p1_legs INTEGER DEFAULT 0,
      p2_legs INTEGER DEFAULT 0,
      p1_leg_score INTEGER,           -- remaining score (for 501/701/1001)
      p2_leg_score INTEGER,
      starter_slot INTEGER DEFAULT 1, -- which player throws first this leg
      current_turn INTEGER DEFAULT 1, -- 1 | 2
      cricket_state_json TEXT,        -- Cricket için marks durumu
      cricket_undo_json TEXT,         -- Son visit öncesi snapshot (GERİ AL için)
      next_winner_match_id INTEGER,   -- bracket ilerletme
      next_winner_slot INTEGER,
      next_loser_match_id INTEGER,    -- double-elim
      next_loser_slot INTEGER,
      scorer_entry_id INTEGER,        -- yazıcı-hakem olarak atanan entry
      legs_to_win INTEGER,            -- null → turnuva varsayılanı; round başına override
      sets_to_win INTEGER,            -- null → turnuva varsayılanı; round başına override
      is_reset_final INTEGER DEFAULT 0, -- çift elemede 2. grand final (reset match)
      is_walkover INTEGER DEFAULT 0,   -- 1 = rakip gelmedi, istatistiklere sayılmaz
      team_phase_match_id INTEGER,     -- takım maçına bağlıysa
      finished_at TEXT,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
      FOREIGN KEY(stage_id) REFERENCES stages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS throws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_id INTEGER NOT NULL,
      leg_index INTEGER NOT NULL,
      set_index INTEGER NOT NULL,
      player_slot INTEGER NOT NULL,   -- 1 | 2
      score INTEGER NOT NULL,         -- 0..180 (3-dart toplamı)
      remaining_after INTEGER,
      bust INTEGER DEFAULT 0,
      is_finish INTEGER DEFAULT 0,
      darts_used INTEGER DEFAULT 3,   -- visit'te kullanılan ok sayısı (1/2/3); checkout'ta < 3 olabilir
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS _migrations (
      key TEXT PRIMARY KEY,
      applied_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      team1_name TEXT NOT NULL,
      team2_name TEXT NOT NULL,
      status TEXT DEFAULT 'draft',     -- draft | running | finished
      team1_score REAL DEFAULT 0,
      team2_score REAL DEFAULT 0,
      teams_json TEXT,                 -- {"team1":["Ali","Mehmet"], "team2":["Fatma",...]}
      bracket_json TEXT,               -- opsiyonel playoff bracket
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS team_phases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_event_id INTEGER NOT NULL,
      user_id INTEGER,
      phase_type TEXT NOT NULL,         -- 'singles' | 'beer' | 'doubles'
      phase_order INTEGER NOT NULL,     -- 1, 2, 3
      enabled INTEGER DEFAULT 1,
      point_value REAL DEFAULT 1,       -- her maç galibi kazanır (beer'de toplam)
      match_count INTEGER DEFAULT 0,    -- kaç 1v1 / çift eşleşmesi
      legs_to_win INTEGER DEFAULT 3,
      sets_to_win INTEGER DEFAULT 1,
      game_mode TEXT DEFAULT '501',
      game_config_json TEXT,
      status TEXT DEFAULT 'pending',    -- pending | running | finished
      FOREIGN KEY(team_event_id) REFERENCES team_events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS team_phase_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_phase_id INTEGER NOT NULL,
      user_id INTEGER,
      match_order INTEGER NOT NULL,
      team1_player TEXT,                -- serbest metin (oyuncu adı)
      team2_player TEXT,
      game_mode TEXT DEFAULT '501',
      legs_to_win INTEGER DEFAULT 3,
      sets_to_win INTEGER DEFAULT 1,
      game_config_json TEXT,
      winner_slot INTEGER,              -- 1 | 2 | null
      team1_legs INTEGER DEFAULT 0,
      team2_legs INTEGER DEFAULT 0,
      walkover INTEGER DEFAULT 0,       -- 1 = hükmen
      status TEXT DEFAULT 'pending',    -- pending | live | finished
      match_id INTEGER,                 -- board maçına bağlı ise FK
      FOREIGN KEY(team_phase_id) REFERENCES team_phases(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS match_stats (
      match_id INTEGER NOT NULL,
      player_slot INTEGER NOT NULL,
      total_score INTEGER DEFAULT 0,   -- toplanan tüm puan (atılan)
      darts_thrown INTEGER DEFAULT 0,  -- her el 3 dart varsayılır
      turns INTEGER DEFAULT 0,
      legs_won INTEGER DEFAULT 0,
      sets_won INTEGER DEFAULT 0,
      best_checkout INTEGER DEFAULT 0,
      tons INTEGER DEFAULT 0,          -- 100-139 atışlar
      ton_plus INTEGER DEFAULT 0,      -- 140-179
      one_eighty INTEGER DEFAULT 0,    -- 180
      high_outs INTEGER DEFAULT 0,     -- 100+ checkout sayısı
      darts_in_finished_legs INTEGER DEFAULT 0, -- kazanılan legler için toplam dart
      PRIMARY KEY(match_id, player_slot),
      FOREIGN KEY(match_id) REFERENCES matches(id) ON DELETE CASCADE
    );

    -- =========================================================
    --  LIG & SEZON SISTEMI (Dilim 1: temel tablolar)
    -- =========================================================
    -- Bir competition: ya bir sezon (acik katilim) ya da bir lig (kapali kadro).
    -- Birden fazla oturum (session) icerir. Her oturum mevcut tournaments tablosuna baglanir.
    CREATE TABLE IF NOT EXISTS competitions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'season',     -- 'season' | 'league'
      category TEXT,                           -- 'Erkekler' | 'Kadinlar' | 'Genc Erkekler' | ... (federasyon)
      planned_sessions INTEGER DEFAULT 1,      -- kac oturum yapilacak
      meet_count INTEGER DEFAULT 1,            -- (sadece lig) herkes birbiriyle kac kez
      game_mode TEXT DEFAULT '501',            -- varsayilan oyun modu (her oturumda override edilebilir)
      team_mode TEXT DEFAULT 'singles',        -- 'singles' | 'doubles'
      legs_to_win INTEGER DEFAULT 2,           -- varsayilan
      sets_to_win INTEGER DEFAULT 1,
      points_json TEXT,                        -- {"1":10,"2":7,"3":5,"default":1}
      status TEXT DEFAULT 'draft',             -- draft | running | finished
      config_json TEXT,                        -- ek opsiyonel ayarlar
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Bu competition'a kayitli oyuncu havuzu. Sezonda dinamik (oturumda eklenir),
    -- ligde bastan sabit. Birikimli puan & istatistikler burada tutulur.
    CREATE TABLE IF NOT EXISTS competition_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      joined_session INTEGER DEFAULT 1,        -- ilk katildigi oturum numarasi
      total_points REAL DEFAULT 0,
      sessions_played INTEGER DEFAULT 0,
      matches_won INTEGER DEFAULT 0,
      matches_lost INTEGER DEFAULT 0,
      legs_won INTEGER DEFAULT 0,
      legs_lost INTEGER DEFAULT 0,
      first_place INTEGER DEFAULT 0,
      second_place INTEGER DEFAULT 0,
      third_place INTEGER DEFAULT 0,
      stats_json TEXT,                         -- atis istatistikleri (3DA, 180, vs)
      UNIQUE(competition_id, player_id),
      FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    -- Bir oturum: bir competition icindeki tek bir gun/hafta.
    -- NOT: Tablo adi 'competition_sessions' (kasitli) - express-session'in
    --      kendi 'sessions' tablosu ile cakismamasi icin.
    -- Bracket mevcut tournaments tablosunda yasar; biz sadece referans tutariz.
    CREATE TABLE IF NOT EXISTS competition_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      user_id INTEGER,
      session_number INTEGER NOT NULL,
      tournament_id INTEGER,                   -- bu oturumun bracket'inin oldugu turnuva
      name TEXT,                               -- "1. Oturum", "Hafta 2", vs
      session_date TEXT,                       -- planlanan tarih (TEXT YYYY-MM-DD)
      status TEXT DEFAULT 'pending',           -- pending | running | finished
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      finished_at TEXT,
      points_override_json TEXT,               -- Dilim 5c-1: Ustalar oturumu icin ozel puan tablosu (null ise comp.points_json)
      is_masters INTEGER DEFAULT 0,            -- 1 ise rozet ve "Ustalar" etiketi gosterilir
      FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    );

    -- Oturum bitince her oyuncunun aldigi pozisyon ve puan.
    CREATE TABLE IF NOT EXISTS session_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL,             -- competition_sessions.id
      competition_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      position INTEGER,                        -- 1, 2, 3, ...
      points REAL DEFAULT 0,
      UNIQUE(session_id, player_id),
      FOREIGN KEY(session_id) REFERENCES competition_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
    );

    -- Sadece lig formatinda ozet: kimin kiminle kac kez oynadi (istatistik).
    CREATE TABLE IF NOT EXISTS league_matchups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER NOT NULL,
      meetings_played INTEGER DEFAULT 0,
      meetings_planned INTEGER DEFAULT 0,
      UNIQUE(competition_id, player1_id, player2_id),
      FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE
    );

    -- Lig planinin detayi: Berger ile uretilen her eslesme.
    -- session_id: round hangi competition_session'da oynatildi (baslayinca dolar).
    -- tournament_id: round'un matchlerinin oldugu turnuva (baslayinca dolar).
    CREATE TABLE IF NOT EXISTS league_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      competition_id INTEGER NOT NULL,
      round_number INTEGER NOT NULL,
      meeting_number INTEGER DEFAULT 1,
      player1_id INTEGER NOT NULL,
      player2_id INTEGER NOT NULL,
      session_id INTEGER,
      tournament_id INTEGER,
      results_recorded INTEGER DEFAULT 0,
      shot_stats_recorded INTEGER DEFAULT 0,
      FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES competition_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    );

    -- Sezon/lig sonu playoff veya Ustalar etkinligi.
    CREATE TABLE IF NOT EXISTS playoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      playoff_type TEXT DEFAULT 'standard',    -- 'standard' | 'masters'
      source_competition_id INTEGER,           -- standart playoff: kaynak sezon/lig
      source_competitions_json TEXT,           -- masters: birden fazla competition birlesimi
      participants_json TEXT,                  -- manuel secilen oyuncu ID'leri
      points_json TEXT,                        -- bu playoff'a ozel puan tablosu
      tournament_id INTEGER,                   -- bracket'in oldugu turnuva
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(tournament_id) REFERENCES tournaments(id) ON DELETE SET NULL
    );
  `);

  // Mevcut DB'ler için kolon ekle (yeni install'lar CREATE TABLE'dan alır)
  const entryCols = db.prepare("PRAGMA table_info(entries)").all().map(c => c.name);
  if (!entryCols.includes('seed')) {
    try { db.exec('ALTER TABLE entries ADD COLUMN seed INTEGER'); } catch {}
  }
  const statCols = db.prepare("PRAGMA table_info(match_stats)").all().map(c => c.name);
  if (!statCols.includes('high_outs')) {
    try { db.exec('ALTER TABLE match_stats ADD COLUMN high_outs INTEGER DEFAULT 0'); } catch {}
  }
  if (!statCols.includes('darts_in_finished_legs')) {
    try { db.exec('ALTER TABLE match_stats ADD COLUMN darts_in_finished_legs INTEGER DEFAULT 0'); } catch {}
  }
  const matchCols = db.prepare("PRAGMA table_info(matches)").all().map(c => c.name);
  if (!matchCols.includes('scorer_entry_id')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN scorer_entry_id INTEGER'); } catch {}
  }
  // Round başına farklı leg/set sayısı için: nullable kolonlar.
  // Null → turnuvanın varsayılan değeri kullanılır (geriye dönük uyum).
  if (!matchCols.includes('legs_to_win')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN legs_to_win INTEGER'); } catch {}
  }
  if (!matchCols.includes('sets_to_win')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN sets_to_win INTEGER'); } catch {}
  }
  if (!matchCols.includes('is_reset_final')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN is_reset_final INTEGER DEFAULT 0'); } catch {}
  }
  if (!matchCols.includes('is_walkover')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN is_walkover INTEGER DEFAULT 0'); } catch {}
  }
  if (!matchCols.includes('team_phase_match_id')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN team_phase_match_id INTEGER'); } catch {}
  }
  if (!matchCols.includes('group_index')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN group_index INTEGER DEFAULT NULL'); } catch {}
  }
  if (!matchCols.includes('p1_sub_turn')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN p1_sub_turn INTEGER DEFAULT 1'); } catch {}
  }
  if (!matchCols.includes('p2_sub_turn')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN p2_sub_turn INTEGER DEFAULT 1'); } catch {}
  }
  // Cricket/FB/Karambol GERİ AL: son visit öncesi snapshot
  if (!matchCols.includes('cricket_undo_json')) {
    try { db.exec('ALTER TABLE matches ADD COLUMN cricket_undo_json TEXT'); } catch {}
  }
  // Board turnuvaya bağlama (boş = genel)
  const boardCols0 = db.prepare("PRAGMA table_info(boards)").all().map(c => c.name);
  if (!boardCols0.includes('tournament_id')) {
    try { db.exec('ALTER TABLE boards ADD COLUMN tournament_id INTEGER'); } catch {}
  }

  // Visit başına dart sayısı: bitiren visit için 1/2/3 olabilir; eski kayıtlar için varsayılan 3.
  const throwCols = db.prepare("PRAGMA table_info(throws)").all().map(c => c.name);
  if (!throwCols.includes('darts_used')) {
    try { db.exec('ALTER TABLE throws ADD COLUMN darts_used INTEGER DEFAULT 3'); } catch {}
  }

  // Multi-organizer: user_id FK'lerini ekle (mevcut DB için migration)
  const playerCols = db.prepare("PRAGMA table_info(players)").all().map(c => c.name);
  if (!playerCols.includes('user_id')) {
    try { db.exec('ALTER TABLE players ADD COLUMN user_id INTEGER'); } catch {}
  }
  const boardCols = db.prepare("PRAGMA table_info(boards)").all().map(c => c.name);
  if (!boardCols.includes('user_id')) {
    try { db.exec('ALTER TABLE boards ADD COLUMN user_id INTEGER'); } catch {}
  }
  const tournCols = db.prepare("PRAGMA table_info(tournaments)").all().map(c => c.name);
  if (!tournCols.includes('user_id')) {
    try { db.exec('ALTER TABLE tournaments ADD COLUMN user_id INTEGER'); } catch {}
  }
  // Takım maçı kolon migrasyonları
  const teamEvCols = db.prepare("PRAGMA table_info(team_events)").all().map(c => c.name);
  if (!teamEvCols.includes('bracket_json')) {
    try { db.exec('ALTER TABLE team_events ADD COLUMN bracket_json TEXT'); } catch {}
  }
  if (!teamEvCols.includes('teams_json')) {
    try { db.exec('ALTER TABLE team_events ADD COLUMN teams_json TEXT'); } catch {}
  }

  // Users: e-posta doğrulama + şifre sıfırlama
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('email_verified')) {
    try { db.exec("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0"); } catch {}
  }
  if (!userCols.includes('verify_token')) {
    try { db.exec("ALTER TABLE users ADD COLUMN verify_token TEXT"); } catch {}
  }
  if (!userCols.includes('reset_token')) {
    try { db.exec("ALTER TABLE users ADD COLUMN reset_token TEXT"); } catch {}
  }
  if (!userCols.includes('reset_token_expires')) {
    try { db.exec("ALTER TABLE users ADD COLUMN reset_token_expires INTEGER"); } catch {}
  }

  // --- Lig & Sezon migrasyonlari ---
  //
  // ONEMLI HOTFIX (Mayis 2026): 'sessions' tablosu, express-session middleware
  // tarafindan oturum cookie depolama icin kullanilir. Bu tablonun semasi
  // BetterSQLiteStore (server.js icinde) tarafindan tanimlanan tam set olmali:
  //    sid TEXT PRIMARY KEY, sess TEXT NOT NULL, expired_at INTEGER NOT NULL
  //
  // Mevcut DB'de eski bir session library'sinden kalma yanlis semayla tablo
  // olabilir (ornek: 'sid, expired, sess' - connect-sqlite3 stili).
  // Bu durumda DROP edip yeniden yaratiyoruz.
  // Yan etki: aktif oturum cookie'leri gecersiz olur, kullanicilar yeniden giris yapar.
  try {
    const sessRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").all();
    if (sessRows.length > 0) {
      const sessCols = db.prepare("PRAGMA table_info(sessions)").all().map(c => c.name);
      const isCorrect = sessCols.includes('sid')
                     && sessCols.includes('sess')
                     && sessCols.includes('expired_at');
      if (!isCorrect) {
        console.warn(`[db] HOTFIX: "sessions" tablosu yanlis sema (kolonlar: ${sessCols.join(', ')}). DROP + yeniden yarat.`);
        db.exec('DROP TABLE sessions');
        db.exec(`CREATE TABLE sessions (
          sid TEXT PRIMARY KEY,
          sess TEXT NOT NULL,
          expired_at INTEGER NOT NULL
        )`);
        console.warn('[db] HOTFIX: "sessions" tablosu express-session semasiyla yeniden yaratildi. Eski cookie\'ler gecersiz - tekrar giris yapilmali.');
      }
    }
  } catch (e) {
    console.error('[db] sessions tablo hotfix hatasi:', e.message);
  }

  // HOTFIX-2: session_results tablosu, ilk surumde 'sessions(id)' tablosuna
  // FK ile bagliydi. Sonra 'sessions' tablosu express-session semasiyla yeniden
  // yaratildi (id kolonu yok, sid var). Bu yuzden session_results'in FK
  // tanimi gecersiz — express-session INSERT'lerinde "foreign key mismatch"
  // hatasi atiyor. session_results bos oldugu icin DROP + yeniden yarat.
  try {
    const srRows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_results'").all();
    if (srRows.length > 0) {
      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_results'").pluck().get() || '';
      const referencesOldSessions = /REFERENCES\s+sessions\s*\(/i.test(sql)
                                  && !/REFERENCES\s+competition_sessions\s*\(/i.test(sql);
      if (referencesOldSessions) {
        console.warn('[db] HOTFIX-2: session_results tablosu eski sessions(id) FK ile yaratilmis. Yeniden yaratiliyor.');
        db.exec('DROP TABLE session_results');
        db.exec(`
          CREATE TABLE session_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id INTEGER NOT NULL,
            competition_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            position INTEGER,
            points REAL DEFAULT 0,
            UNIQUE(session_id, player_id),
            FOREIGN KEY(session_id) REFERENCES competition_sessions(id) ON DELETE CASCADE,
            FOREIGN KEY(competition_id) REFERENCES competitions(id) ON DELETE CASCADE,
            FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
          )
        `);
        console.warn('[db] HOTFIX-2: session_results yeniden yaratildi, FK artik competition_sessions(id) gosteriyor.');
      }
    }
  } catch (e) {
    console.error('[db] session_results FK hotfix hatasi:', e.message);
  }

  // Lig & Sezon: competition_sessions'a yeni kolonlar (round_number, session_type)
  const compSessCols = db.prepare("PRAGMA table_info(competition_sessions)").all().map(c => c.name);
  if (!compSessCols.includes('round_number')) {
    try { db.exec('ALTER TABLE competition_sessions ADD COLUMN round_number INTEGER'); } catch {}
  }
  if (!compSessCols.includes('session_type')) {
    try { db.exec("ALTER TABLE competition_sessions ADD COLUMN session_type TEXT DEFAULT 'bracket'"); } catch {}
  }
  // Dilim 5c-1 — Ustalar (Masters) oturumlari: bu oturuma ozel puan tablosu (override)
  // + Ustalar isaretleyici flag'i. is_masters=1 ise frontend rozet gosterir, finalize
  // points_override_json'i kullanir; yoksa competition.points_json'a duser.
  if (!compSessCols.includes('points_override_json')) {
    try { db.exec('ALTER TABLE competition_sessions ADD COLUMN points_override_json TEXT'); } catch {}
  }
  if (!compSessCols.includes('is_masters')) {
    try { db.exec('ALTER TABLE competition_sessions ADD COLUMN is_masters INTEGER DEFAULT 0'); } catch {}
  }
  // competitions'a plan_generated kolonu
  const compCols2 = db.prepare("PRAGMA table_info(competitions)").all().map(c => c.name);
  if (!compCols2.includes('plan_generated')) {
    try { db.exec('ALTER TABLE competitions ADD COLUMN plan_generated INTEGER DEFAULT 0'); } catch {}
  }
  // league_schedule kolonlari: eski DB'lerde session_id/tournament_id/meeting_number
  // hic eklenmemis olabilir. Her birini eksikse ekle (geriye donuk uyumlu).
  const lsCols = db.prepare("PRAGMA table_info(league_schedule)").all().map(c => c.name);
  if (!lsCols.includes('meeting_number')) {
    try { db.exec('ALTER TABLE league_schedule ADD COLUMN meeting_number INTEGER DEFAULT 1'); } catch {}
  }
  if (!lsCols.includes('session_id')) {
    try { db.exec('ALTER TABLE league_schedule ADD COLUMN session_id INTEGER'); } catch {}
  }
  if (!lsCols.includes('tournament_id')) {
    try { db.exec('ALTER TABLE league_schedule ADD COLUMN tournament_id INTEGER'); } catch {}
  }
  if (!lsCols.includes('results_recorded')) {
    try { db.exec('ALTER TABLE league_schedule ADD COLUMN results_recorded INTEGER DEFAULT 0'); } catch {}
  }
  if (!lsCols.includes('shot_stats_recorded')) {
    try { db.exec('ALTER TABLE league_schedule ADD COLUMN shot_stats_recorded INTEGER DEFAULT 0'); } catch {}
  }

  // HOTFIX-3 (Mayis 2026): Orphan board_id temizligi.
  // Onceki deleteBoard() sadece boards satirini siliyor, maclarin board_id'sini
  // temizlemiyordu. Sonuc: silinen board'a atanmis aktif mac, scheduler
  // tarafindan yeniden atanamaz hale geliyordu (pendingReadyMatches !m.board_id
  // istiyor). Bu blok, var olmayan board'lara referans veren tum mac satirlarini
  // NULL'a ceker. deleteBoard() artik bu temizligi inline yapiyor, ama mevcut
  // DB'lerdeki birikmis orphan'lari kurtarmak icin tek seferlik bu migrasyon.
  try {
    const orphanCount = db.prepare(`
      SELECT COUNT(*) AS c FROM matches
      WHERE board_id IS NOT NULL
        AND board_id NOT IN (SELECT id FROM boards)
    `).get().c;
    if (orphanCount > 0) {
      db.prepare(`
        UPDATE matches SET board_id = NULL
        WHERE board_id IS NOT NULL
          AND board_id NOT IN (SELECT id FROM boards)
      `).run();
      console.warn(`[db] HOTFIX-3: ${orphanCount} mac silinen board'a referans veriyordu, board_id NULL'a cekildi. Scheduler bir sonraki tick'te yeniden atayacak.`);
    }
  } catch (e) {
    console.error('[db] HOTFIX-3 orphan board_id temizligi hatasi:', e.message);
  }

  // (Diger lig/sezon tablolari yenidir; CREATE TABLE IF NOT EXISTS bloklari halleder.
  //  Ileride competitions/competition_sessions/competition_players tablolarina
  //  kolon eklenecek olursa buraya geriye donuk uyumlu ALTER TABLE'lar eklenmeli.)
  // Ornek pattern:
  //   const compCols = db.prepare("PRAGMA table_info(competitions)").all().map(c => c.name);
  //   if (!compCols.includes('yeni_kolon')) {
  //     try { db.exec('ALTER TABLE competitions ADD COLUMN yeni_kolon TEXT'); } catch {}
  //   }
}

// --- Users ---
function createUser(email, passwordHash, name) {
  const info = db.prepare(
    'INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)'
  ).run(email, passwordHash, name || null);
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?')
    .get(info.lastInsertRowid);
}
function userByEmail(email) {
  return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
}
function userById(id) {
  if (!id) return null;
  return db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(id);
}
function allUsers() {
  return db.prepare('SELECT id, email, name, created_at FROM users ORDER BY id').all();
}

// --- Player ---
// userId: multi-organizer izolasyonu için opsiyonel (null = legacy)
function createPlayer(name, nickname, userId = null) {
  const info = db.prepare(
    'INSERT INTO players (user_id, name, nickname) VALUES (?, ?, ?)'
  ).run(userId, name, nickname);
  return db.prepare('SELECT * FROM players WHERE id = ?').get(info.lastInsertRowid);
}
function allPlayers(userId = null) {
  if (userId == null) {
    return db.prepare('SELECT * FROM players ORDER BY name').all();
  }
  return db.prepare('SELECT * FROM players WHERE user_id = ? ORDER BY name').all(userId);
}
function playerById(id) {
  return db.prepare('SELECT * FROM players WHERE id = ?').get(id);
}
function deletePlayer(id) {
  db.prepare('DELETE FROM players WHERE id = ?').run(id);
}

// --- Board ---
function createBoard(name, userId = null, tournamentId = null) {
  const info = db.prepare(
    'INSERT INTO boards (user_id, name, tournament_id) VALUES (?, ?, ?)'
  ).run(userId, name, tournamentId || null);
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(info.lastInsertRowid);
}
function setBoardTournament(boardId, tournamentId) {
  db.prepare('UPDATE boards SET tournament_id = ? WHERE id = ?')
    .run(tournamentId || null, boardId);
}
function allBoards(userId = null) {
  if (userId == null) {
    return db.prepare('SELECT * FROM boards ORDER BY id').all();
  }
  return db.prepare('SELECT * FROM boards WHERE user_id = ? ORDER BY id').all(userId);
}
function boardById(id) {
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(id);
}
function deleteBoard(id) {
  // Board silmeden once o board'a atanmis maclarin board_id'sini NULL yap.
  // Aksi halde silinen board'a "bagli" gorunen mac, scheduler tarafindan
  // yeniden atanmaz (pendingReadyMatches filtresi !m.board_id istiyor).
  db.prepare('UPDATE matches SET board_id = NULL WHERE board_id = ?').run(id);
  db.prepare('DELETE FROM boards WHERE id = ?').run(id);
}
function setBoardMatch(boardId, matchId) {
  db.prepare('UPDATE boards SET current_match_id = ?, status = ? WHERE id = ?')
    .run(matchId, matchId ? 'busy' : 'idle', boardId);
}

// --- Tournaments ---
function createTournament(data) {
  const info = db.prepare(`
    INSERT INTO tournaments (user_id, name, game_mode, team_mode, legs_to_win, sets_to_win, config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.user_id || null,
    data.name,
    data.game_mode,
    data.team_mode,
    data.legs_to_win || 2,
    data.sets_to_win || 1,
    data.config_json || null,
  );
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(info.lastInsertRowid);
}
function allTournaments(userId = null) {
  // __team_pool_*__ turnuvalarını gizle (organizatör listesinden)
  if (userId == null) {
    return db.prepare("SELECT * FROM tournaments WHERE name NOT LIKE '__team_pool_%' ORDER BY id DESC").all();
  }
  return db.prepare(
    "SELECT * FROM tournaments WHERE user_id = ? AND name NOT LIKE '__team_pool_%' ORDER BY id DESC"
  ).all(userId);
}
function tournamentById(id) {
  return db.prepare('SELECT * FROM tournaments WHERE id = ?').get(id);
}
function updateTournamentStatus(id, status) {
  db.prepare('UPDATE tournaments SET status = ? WHERE id = ?').run(status, id);
}
// Draft turnuva ayarlarını güncelle (name, game_mode, legs_to_win, sets_to_win)
function updateTournament(id, fields) {
  const allowed = ['name', 'game_mode', 'legs_to_win', 'sets_to_win'];
  const updates = Object.keys(fields).filter(k => allowed.includes(k));
  if (!updates.length) return;
  const sql = `UPDATE tournaments SET ${updates.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...updates.map(k => fields[k]), id);
}
function deleteTournament(id) {
  // Bu turnuvanın maçlarına bağlı board'ları temizle (current_match_id NULL, idle)
  // ÖNEMLİ: matches CASCADE ile silinmeden ÖNCE board ID'lerini topla
  const matchIds = db.prepare('SELECT id FROM matches WHERE tournament_id = ?').all(id).map(r => r.id);
  if (matchIds.length) {
    const placeholders = matchIds.map(() => '?').join(',');
    db.prepare(
      `UPDATE boards SET current_match_id = NULL, status = 'idle' WHERE current_match_id IN (${placeholders})`
    ).run(...matchIds);
  }
  // Bu turnuvaya direkt bağlı board'ların tournament_id'sini de NULL'la (FK SET NULL var ama emin olalım)
  db.prepare('UPDATE boards SET tournament_id = NULL WHERE tournament_id = ?').run(id);
  // Şimdi turnuva (ve CASCADE ile maçlar/entries/stages) silinir
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
}

// --- Entries ---
function addEntry(tournamentId, slot, player1Id, player2Id = null, seed = null) {
  const info = db.prepare(
    'INSERT INTO entries (tournament_id, slot, player1_id, player2_id, seed) VALUES (?, ?, ?, ?, ?)'
  ).run(tournamentId, slot, player1Id, player2Id, seed);
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
}
// entry sıralamasını güncelle: orderedEntryIds dizisindeki sıra → slot 1, 2, 3, ...
function updateEntrySlots(tournamentId, orderedEntryIds) {
  const update = db.prepare('UPDATE entries SET slot = ? WHERE id = ? AND tournament_id = ?');
  const tx = db.transaction(() => {
    orderedEntryIds.forEach((id, i) => update.run(i + 1, id, tournamentId));
  });
  tx();
}

function entriesForTournament(tournamentId) {
  const rows = db.prepare('SELECT * FROM entries WHERE tournament_id = ? ORDER BY slot').all(tournamentId);
  return rows.map(r => ({
    ...r,
    player1: playerById(r.player1_id),
    player2: r.player2_id ? playerById(r.player2_id) : null,
  }));
}
function entryById(id) {
  if (!id) return null;
  const r = db.prepare('SELECT * FROM entries WHERE id = ?').get(id);
  if (!r) return null;
  return {
    ...r,
    player1: playerById(r.player1_id),
    player2: r.player2_id ? playerById(r.player2_id) : null,
  };
}

// --- Stages ---
function createStage(tournamentId, stageIndex, format, qualifierCount = null, configJson = null) {
  const info = db.prepare(`
    INSERT INTO stages (tournament_id, stage_index, format, qualifier_count, config_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(tournamentId, stageIndex, format, qualifierCount, configJson);
  return db.prepare('SELECT * FROM stages WHERE id = ?').get(info.lastInsertRowid);
}
function stagesForTournament(tournamentId) {
  return db.prepare('SELECT * FROM stages WHERE tournament_id = ? ORDER BY stage_index').all(tournamentId);
}
function stageById(id) {
  return db.prepare('SELECT * FROM stages WHERE id = ?').get(id);
}
function updateStageStatus(id, status) {
  db.prepare('UPDATE stages SET status = ? WHERE id = ?').run(status, id);
}

// --- Matches ---
function createMatch(m) {
  const info = db.prepare(`
    INSERT INTO matches
    (tournament_id, stage_id, bracket, round, match_index, entry1_id, entry2_id, status,
     next_winner_match_id, next_winner_slot, next_loser_match_id, next_loser_slot,
     p1_leg_score, p2_leg_score, legs_to_win, sets_to_win, group_index,
     p1_sub_turn, p2_sub_turn, is_reset_final)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.tournament_id, m.stage_id, m.bracket, m.round, m.match_index,
    m.entry1_id || null, m.entry2_id || null, m.status || 'pending',
    m.next_winner_match_id || null, m.next_winner_slot || null,
    m.next_loser_match_id || null, m.next_loser_slot || null,
    m.start_score || null, m.start_score || null,
    m.legs_to_win || null, m.sets_to_win || null,
    m.group_index ?? null,
    1, 1,
    m.is_reset_final ? 1 : 0,
  );
  const id = info.lastInsertRowid;
  // Match stats init
  db.prepare('INSERT INTO match_stats (match_id, player_slot) VALUES (?, 1), (?, 2)').run(id, id);
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
}
function matchById(id) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (!m) return null;
  return {
    ...m,
    entry1: entryById(m.entry1_id),
    entry2: entryById(m.entry2_id),
    scorer: m.scorer_entry_id ? entryById(m.scorer_entry_id) : null,
  };
}
function matchesForTournament(tournamentId) {
  return db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? ORDER BY stage_id, round, match_index'
  ).all(tournamentId).map(m => ({
    ...m,
    entry1: entryById(m.entry1_id),
    entry2: entryById(m.entry2_id),
    scorer: m.scorer_entry_id ? entryById(m.scorer_entry_id) : null,
  }));
}
function matchesForStage(stageId) {
  return db.prepare(
    'SELECT * FROM matches WHERE stage_id = ? ORDER BY round, match_index'
  ).all(stageId);
}
function activeMatches(userId = null) {
  const rows = userId == null
    ? db.prepare(`
        SELECT * FROM matches WHERE status IN ('ready','live') AND board_id IS NOT NULL ORDER BY id
      `).all()
    : db.prepare(`
        SELECT m.* FROM matches m
        JOIN tournaments t ON t.id = m.tournament_id
        WHERE m.status IN ('ready','live') AND m.board_id IS NOT NULL AND t.user_id = ?
        ORDER BY m.id
      `).all(userId);
  return rows.map(m => ({
    ...m,
    entry1: entryById(m.entry1_id),
    entry2: entryById(m.entry2_id),
    scorer: m.scorer_entry_id ? entryById(m.scorer_entry_id) : null,
  }));
}
function pendingReadyMatches(userId = null) {
  if (userId == null) {
    return db.prepare(`
      SELECT * FROM matches WHERE status = 'ready' ORDER BY stage_id, round, match_index
    `).all();
  }
  return db.prepare(`
    SELECT m.* FROM matches m
    JOIN tournaments t ON t.id = m.tournament_id
    WHERE m.status = 'ready' AND t.user_id = ?
    ORDER BY m.stage_id, m.round, m.match_index
  `).all(userId);
}
function updateMatch(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return;
  const sql = 'UPDATE matches SET ' + keys.map(k => `${k} = ?`).join(', ') + ' WHERE id = ?';
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}
function setMatchEntry(id, slot, entryId) {
  const col = slot === 1 ? 'entry1_id' : 'entry2_id';
  db.prepare(`UPDATE matches SET ${col} = ? WHERE id = ?`).run(entryId, id);
  // if both slots filled and status was pending -> ready
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
  if (m.entry1_id && m.entry2_id && m.status === 'pending') {
    db.prepare("UPDATE matches SET status = 'ready' WHERE id = ?").run(id);
  }
}

// --- Throws ---
function addThrow(t) {
  const info = db.prepare(`
    INSERT INTO throws (match_id, leg_index, set_index, player_slot, score, remaining_after, bust, is_finish, darts_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    t.match_id, t.leg_index, t.set_index, t.player_slot, t.score, t.remaining_after,
    t.bust ? 1 : 0, t.is_finish ? 1 : 0,
    Number.isInteger(t.darts_used) && t.darts_used >= 1 && t.darts_used <= 3 ? t.darts_used : 3
  );
  return info.lastInsertRowid;
}
function throwsForMatch(matchId) {
  return db.prepare('SELECT * FROM throws WHERE match_id = ? ORDER BY id').all(matchId);
}
function lastThrow(matchId) {
  return db.prepare('SELECT * FROM throws WHERE match_id = ? ORDER BY id DESC LIMIT 1').get(matchId);
}
function deleteThrow(id) {
  db.prepare('DELETE FROM throws WHERE id = ?').run(id);
}

// --- Match stats ---
function getStats(matchId, slot) {
  return db.prepare('SELECT * FROM match_stats WHERE match_id = ? AND player_slot = ?').get(matchId, slot);
}
function updateStats(matchId, slot, delta) {
  const cur = getStats(matchId, slot);
  const next = { ...cur };
  for (const k of Object.keys(delta)) {
    if (k === 'best_checkout') next[k] = Math.max(cur[k] || 0, delta[k]);
    else next[k] = (cur[k] || 0) + delta[k];
  }
  db.prepare(`UPDATE match_stats SET
    total_score = ?, darts_thrown = ?, turns = ?,
    legs_won = ?, sets_won = ?, best_checkout = ?,
    tons = ?, ton_plus = ?, one_eighty = ?,
    high_outs = ?, darts_in_finished_legs = ?
    WHERE match_id = ? AND player_slot = ?`)
    .run(next.total_score, next.darts_thrown, next.turns,
         next.legs_won, next.sets_won, next.best_checkout,
         next.tons, next.ton_plus, next.one_eighty,
         next.high_outs || 0, next.darts_in_finished_legs || 0,
         matchId, slot);
}
function statsForMatch(matchId) {
  return db.prepare('SELECT * FROM match_stats WHERE match_id = ? ORDER BY player_slot').all(matchId);
}

// Turnuva boyunca bir oyuncunun tüm maçlarındaki istatistiklerini topla.
// Doubles modunda entry'ler iki oyuncudan oluşur; istatistikler entry bazlı kalır
// ama rapor oyuncu bazlı istendiğinde entry'yi iki oyuncuya da yayıyoruz.
function tournamentPlayerReport(tournamentId) {
  // Her entry için slot-1/slot-2 istatistiklerini toplar
  // Sonra oyuncu bazında grupla
  const rows = db.prepare(`
    SELECT
      m.id AS match_id,
      CASE WHEN s.player_slot = 1 THEN m.entry1_id ELSE m.entry2_id END AS entry_id,
      s.total_score, s.darts_thrown, s.turns,
      s.legs_won, s.sets_won, s.best_checkout,
      s.tons, s.ton_plus, s.one_eighty,
      s.high_outs, s.darts_in_finished_legs,
      m.status AS match_status,
      m.winner_entry_id,
      CASE WHEN s.player_slot = 1 THEN m.entry1_id ELSE m.entry2_id END = m.winner_entry_id AS is_winner
    FROM matches m
    JOIN match_stats s ON s.match_id = m.id
    WHERE m.tournament_id = ? AND m.is_walkover = 0
  `).all(tournamentId);

  // entry -> aggregated stats
  const byEntry = {};
  for (const r of rows) {
    if (!r.entry_id) continue;
    if (!byEntry[r.entry_id]) {
      byEntry[r.entry_id] = {
        entry_id: r.entry_id,
        matches_played: 0,
        matches_won: 0,
        total_score: 0,
        darts_thrown: 0,
        turns: 0,
        legs_won: 0,
        sets_won: 0,
        best_checkout: 0,
        tons: 0,
        ton_plus: 0,
        one_eighty: 0,
        high_outs: 0,
        darts_in_finished_legs: 0,
      };
    }
    const agg = byEntry[r.entry_id];
    if (r.match_status === 'finished' || r.match_status === 'live') {
      agg.matches_played += (r.match_status === 'finished') ? 1 : 0;
    }
    if (r.is_winner) agg.matches_won += 1;
    agg.total_score += r.total_score || 0;
    agg.darts_thrown += r.darts_thrown || 0;
    agg.turns += r.turns || 0;
    agg.legs_won += r.legs_won || 0;
    agg.sets_won += r.sets_won || 0;
    agg.best_checkout = Math.max(agg.best_checkout, r.best_checkout || 0);
    agg.tons += r.tons || 0;
    agg.ton_plus += r.ton_plus || 0;
    agg.one_eighty += r.one_eighty || 0;
    agg.high_outs += r.high_outs || 0;
    agg.darts_in_finished_legs += r.darts_in_finished_legs || 0;
  }

  // Entry bilgisini ve türetilmiş metrikleri ekle
  const out = [];
  for (const entryId of Object.keys(byEntry)) {
    const agg = byEntry[entryId];
    const entry = entryById(+entryId);
    if (!entry) continue;
    const avg3 = agg.darts_thrown > 0 ? (agg.total_score / agg.darts_thrown) * 3 : 0;
    const dartsPerLeg = agg.legs_won > 0 ? agg.darts_in_finished_legs / agg.legs_won : 0;
    out.push({
      ...agg,
      entry,
      label: entry.player1?.nickname || entry.player1?.name || '?',
      label_full: entry.player2
        ? `${entry.player1?.name || '?'} / ${entry.player2?.name || '?'}`
        : entry.player1?.name || '?',
      average_3dart: +avg3.toFixed(2),
      darts_per_leg: +dartsPerLeg.toFixed(1),
    });
  }
  // Sıralama: kazanılan maç → kazanılan leg → 3-ok ortalaması
  out.sort((a, b) =>
    b.matches_won - a.matches_won ||
    b.legs_won - a.legs_won ||
    b.average_3dart - a.average_3dart
  );
  return out;
}

// --- Reset ---
function resetAll(userId = null) {
  if (userId == null) {
    // Legacy global reset
    db.exec(`
      DELETE FROM throws;
      DELETE FROM match_stats;
      DELETE FROM matches;
      DELETE FROM stages;
      DELETE FROM entries;
      DELETE FROM tournaments;
      UPDATE boards SET current_match_id = NULL, status = 'idle';
    `);
    return;
  }
  // Per-user reset: yalnızca o kullanıcıya ait turnuvaları temizle.
  // tournaments CASCADE ile stages/entries/matches'i düşürür; matches CASCADE throws/match_stats'i düşürür.
  // Kullanıcının board'larını idle'a çek.
  db.prepare(`DELETE FROM tournaments WHERE user_id = ?`).run(userId);
  db.prepare(
    `UPDATE boards SET current_match_id = NULL, status = 'idle' WHERE user_id = ?`
  ).run(userId);
}

// Walkover: rakip gelmedi, winnerSlot (1|2) kazanır — dart atılmaz, istatistik sayılmaz
function walkoverMatch(matchId, winnerSlot) {
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
  if (!m) return null;
  const winnerEntryId = winnerSlot === 1 ? m.entry1_id : m.entry2_id;
  db.prepare(`
    UPDATE matches SET
      status = 'finished',
      winner_entry_id = ?,
      is_walkover = 1,
      finished_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(winnerEntryId, matchId);
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);
}

// ─── Team Pool ───────────────────────────────────────────────────────────────
// Her game_mode için gizli bir havuz turnuvası tutar (board'da oynanacak takım maçları için).
function getOrCreateTeamPool(userId, gameMode) {
  const POOL_NAME = `__team_pool_${gameMode}__`;
  const existing = db.prepare(
    'SELECT * FROM tournaments WHERE user_id = ? AND name = ? LIMIT 1'
  ).get(userId, POOL_NAME);

  if (existing) {
    const stage = db.prepare('SELECT * FROM stages WHERE tournament_id = ? LIMIT 1').get(existing.id);
    if (stage) return { tournamentId: existing.id, stageId: stage.id };
    const ns = createStage(existing.id, 0, 'single_elim');
    return { tournamentId: existing.id, stageId: ns.id };
  }
  const info = db.prepare(
    `INSERT INTO tournaments (user_id, name, game_mode, team_mode, legs_to_win, sets_to_win)
     VALUES (?, ?, ?, 'singles', 2, 1)`
  ).run(userId, POOL_NAME, gameMode);
  const stage = createStage(info.lastInsertRowid, 0, 'single_elim');
  return { tournamentId: info.lastInsertRowid, stageId: stage.id };
}

// Oyuncuyu isimle bul; yoksa oluştur. null → null döner.
function getOrCreatePlayerByName(userId, name) {
  if (!name) return null;
  const existing = db.prepare(
    'SELECT id FROM players WHERE user_id = ? AND (name = ? OR nickname = ?) LIMIT 1'
  ).get(userId, name, name);
  if (existing) return existing.id;
  const info = db.prepare('INSERT INTO players (user_id, name) VALUES (?, ?)').run(userId, name);
  return info.lastInsertRowid;
}

// match_id ile team_phase_match bul (finish hook için).
function teamPhaseMatchByMatchId(matchId) {
  return db.prepare(
    `SELECT tpm.*, te.user_id AS team_user_id, tp.team_event_id AS event_id
     FROM team_phase_matches tpm
     JOIN team_phases tp ON tpm.team_phase_id = tp.id
     JOIN team_events te ON tp.team_event_id = te.id
     WHERE tpm.match_id = ? LIMIT 1`
  ).get(matchId);
}

// --- Team Events ---
function createTeamEvent(data) {
  const info = db.prepare(`
    INSERT INTO team_events (user_id, name, team1_name, team2_name)
    VALUES (?, ?, ?, ?)
  `).run(data.user_id || null, data.name, data.team1_name, data.team2_name);
  return db.prepare('SELECT * FROM team_events WHERE id = ?').get(info.lastInsertRowid);
}
function allTeamEvents(userId = null) {
  if (userId == null) return db.prepare('SELECT * FROM team_events ORDER BY id DESC').all();
  return db.prepare('SELECT * FROM team_events WHERE user_id = ? ORDER BY id DESC').all(userId);
}
function teamEventById(id) {
  return db.prepare('SELECT * FROM team_events WHERE id = ?').get(id);
}
function updateTeamEvent(id, fields) {
  const allowed = ['name', 'team1_name', 'team2_name', 'status', 'team1_score', 'team2_score', 'bracket_json', 'teams_json'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const sql = `UPDATE team_events SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}
function deleteTeamEvent(id) {
  db.prepare('DELETE FROM team_events WHERE id = ?').run(id);
}

// --- Team Phases ---
function createTeamPhase(data) {
  const info = db.prepare(`
    INSERT INTO team_phases
    (team_event_id, user_id, phase_type, phase_order, enabled, point_value,
     match_count, legs_to_win, sets_to_win, game_mode, game_config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.team_event_id, data.user_id || null,
    data.phase_type, data.phase_order,
    data.enabled !== undefined ? data.enabled : 1,
    data.point_value !== undefined ? data.point_value : 1,
    data.match_count || 0,
    data.legs_to_win || 3,
    data.sets_to_win || 1,
    data.game_mode || '501',
    data.game_config_json || null
  );
  return db.prepare('SELECT * FROM team_phases WHERE id = ?').get(info.lastInsertRowid);
}
function phasesForEvent(teamEventId) {
  return db.prepare('SELECT * FROM team_phases WHERE team_event_id = ? ORDER BY phase_order').all(teamEventId);
}
function teamPhaseById(id) {
  return db.prepare('SELECT * FROM team_phases WHERE id = ?').get(id);
}
function updateTeamPhase(id, fields) {
  const allowed = ['enabled', 'point_value', 'match_count', 'legs_to_win', 'sets_to_win',
                   'game_mode', 'game_config_json', 'status'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const sql = `UPDATE team_phases SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}

// --- Team Phase Matches ---
function createTeamPhaseMatch(data) {
  const info = db.prepare(`
    INSERT INTO team_phase_matches
    (team_phase_id, user_id, match_order, team1_player, team2_player,
     game_mode, legs_to_win, sets_to_win, game_config_json, walkover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.team_phase_id, data.user_id || null,
    data.match_order, data.team1_player || null, data.team2_player || null,
    data.game_mode || '501',
    data.legs_to_win || 3,
    data.sets_to_win || 1,
    data.game_config_json || null,
    data.walkover ? 1 : 0
  );
  return db.prepare('SELECT * FROM team_phase_matches WHERE id = ?').get(info.lastInsertRowid);
}
function matchesForPhase(teamPhaseId) {
  return db.prepare(
    'SELECT * FROM team_phase_matches WHERE team_phase_id = ? ORDER BY match_order'
  ).all(teamPhaseId);
}
function teamPhaseMatchById(id) {
  return db.prepare('SELECT * FROM team_phase_matches WHERE id = ?').get(id);
}
function updateTeamPhaseMatch(id, fields) {
  const allowed = ['team1_player', 'team2_player', 'game_mode', 'legs_to_win', 'sets_to_win',
                   'game_config_json', 'winner_slot', 'team1_legs', 'team2_legs',
                   'walkover', 'status', 'match_id'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  const sql = `UPDATE team_phase_matches SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...keys.map(k => fields[k]), id);
}
function deleteTeamPhaseMatch(id) {
  db.prepare('DELETE FROM team_phase_matches WHERE id = ?').run(id);
}

// Takım maçı puanlarını yeniden hesapla (tüm bitmiş phase maçlarından)
function recalcTeamScores(teamEventId) {
  const phases = phasesForEvent(teamEventId);
  let t1 = 0, t2 = 0;
  for (const ph of phases) {
    if (!ph.enabled) continue;
    const phMatches = matchesForPhase(ph.id);
    for (const pm of phMatches) {
      if (pm.status === 'finished' && pm.winner_slot) {
        if (pm.winner_slot === 1) t1 += ph.point_value;
        else t2 += ph.point_value;
      }
    }
  }
  updateTeamEvent(teamEventId, { team1_score: t1, team2_score: t2 });
  return { team1_score: t1, team2_score: t2 };
}

// Turnuva bitince board'ları serbest bırak (veri silmeden)
function clearUserBoards(userId) {
  if (!userId) return;
  db.prepare(
    `UPDATE boards SET current_match_id = NULL, status = 'idle' WHERE user_id = ?`
  ).run(userId);
}

// =========================================================
//  LIG & SEZON helper fonksiyonlari
//  Hepsi multi-tenant: user_id ile scope edilir.
// =========================================================

// --- Competitions ---
function createCompetition(data) {
  const info = db.prepare(`
    INSERT INTO competitions
      (user_id, name, type, category, planned_sessions, meet_count,
       game_mode, team_mode, legs_to_win, sets_to_win, points_json, config_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.user_id || null,
    data.name,
    data.type || 'season',
    data.category || null,
    data.planned_sessions || 1,
    data.meet_count || 1,
    data.game_mode || '501',
    data.team_mode || 'singles',
    data.legs_to_win || 2,
    data.sets_to_win || 1,
    typeof data.points_json === 'string'
      ? data.points_json
      : JSON.stringify(data.points_json || { '1': 10, '2': 7, '3': 5, 'default': 1 }),
    data.config_json || null,
  );
  return db.prepare('SELECT * FROM competitions WHERE id = ?').get(info.lastInsertRowid);
}

function allCompetitions(userId = null) {
  if (userId == null) {
    return db.prepare('SELECT * FROM competitions ORDER BY id DESC').all();
  }
  return db.prepare(
    'SELECT * FROM competitions WHERE user_id = ? ORDER BY id DESC'
  ).all(userId);
}

function competitionById(id, userId = null) {
  if (userId == null) {
    return db.prepare('SELECT * FROM competitions WHERE id = ?').get(id);
  }
  return db.prepare(
    'SELECT * FROM competitions WHERE id = ? AND user_id = ?'
  ).get(id, userId);
}

function updateCompetition(id, userId, fields) {
  const allowed = ['name', 'category', 'planned_sessions', 'meet_count',
                   'game_mode', 'team_mode', 'legs_to_win', 'sets_to_win',
                   'points_json', 'status', 'config_json'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return null;
  const vals = keys.map(k => {
    const v = fields[k];
    // points_json/config_json: obje gelirse stringle
    if ((k === 'points_json' || k === 'config_json') && v && typeof v !== 'string') {
      return JSON.stringify(v);
    }
    return v;
  });
  const sql = `UPDATE competitions SET ${keys.map(k => `${k} = ?`).join(', ')}
               WHERE id = ? AND user_id = ?`;
  db.prepare(sql).run(...vals, id, userId);
  return competitionById(id, userId);
}

function deleteCompetition(id, userId) {
  db.prepare('DELETE FROM competitions WHERE id = ? AND user_id = ?').run(id, userId);
}

// --- Competition Players ---
function addCompetitionPlayer(competitionId, playerId, joinedSession = 1) {
  try {
    const info = db.prepare(`
      INSERT INTO competition_players (competition_id, player_id, joined_session)
      VALUES (?, ?, ?)
    `).run(competitionId, playerId, joinedSession);
    return db.prepare('SELECT * FROM competition_players WHERE id = ?').get(info.lastInsertRowid);
  } catch (e) {
    // UNIQUE constraint: zaten eklenmis
    return db.prepare(
      'SELECT * FROM competition_players WHERE competition_id = ? AND player_id = ?'
    ).get(competitionId, playerId);
  }
}

function competitionPlayers(competitionId) {
  return db.prepare(`
    SELECT cp.*, p.name AS player_name, p.nickname AS player_nickname
    FROM competition_players cp
    JOIN players p ON p.id = cp.player_id
    WHERE cp.competition_id = ?
    ORDER BY cp.total_points DESC, p.name ASC
  `).all(competitionId);
}

function removeCompetitionPlayer(competitionId, playerId) {
  db.prepare(
    'DELETE FROM competition_players WHERE competition_id = ? AND player_id = ?'
  ).run(competitionId, playerId);
}

// --- Competition Sessions (oturumlar) ---
// NOT: Tablo adi 'competition_sessions' - express-session'in 'sessions'
//      tablosuyla cakismamasi icin. JS API'leri kisa adda kalir.
// ---- Lig Planı (Berger / circle method) ----

// Circle yöntemiyle tüm round'ları üretir.
// playerIds: oyuncu ID dizisi (en az 2)
// meetCount: herkes birbirleriyle kaç kez oynasın
// Dönüş: [ { roundNumber, meeting, pairs: [{p1,p2}] }, ... ]
function bergerRounds(playerIds, meetCount) {
  const mc = meetCount || 1;
  const base = [...playerIds];
  if (base.length % 2 === 1) base.push(null); // BYE
  const n = base.length;
  const roundsPerMeeting = n - 1;
  const allRounds = [];

  for (let m = 0; m < mc; m++) {
    const players = [...base];
    // 2. karşılaşmada ev/deplasman ters
    const swap = m % 2 === 1;
    const fixed = players[0];
    const rotating = players.slice(1);
    for (let r = 0; r < roundsPerMeeting; r++) {
      const circle = [fixed, ...rotating];
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = circle[i];
        const b = circle[n - 1 - i];
        if (a !== null && b !== null) {
          pairs.push(swap ? { p1: b, p2: a } : { p1: a, p2: b });
        }
      }
      allRounds.push({
        roundNumber: m * roundsPerMeeting + r + 1,
        meeting: m + 1,
        pairs,
      });
      // Döndür: son eleman ikinci sıraya girer
      rotating.unshift(rotating.pop());
    }
  }
  return allRounds;
}

// Lig planını üretir: sadece league_schedule doldurur (competition_sessions yaratmaz).
// Varsa eski planı temizler (sadece henüz başlatılmamış — session_id NULL — satırlar silinir).
function generateLeaguePlan(competitionId, userId) {
  const comp = db.prepare('SELECT * FROM competitions WHERE id = ? AND user_id = ?').get(competitionId, userId);
  if (!comp) throw new Error('Competition bulunamadı');
  if (comp.type !== 'league') throw new Error('Sadece lig formatında plan üretilebilir');

  const players = db.prepare(
    'SELECT player_id FROM competition_players WHERE competition_id = ? ORDER BY id ASC'
  ).all(competitionId).map(r => r.player_id);
  if (players.length < 2) throw new Error('Lig planı için en az 2 oyuncu gerekli');

  const meetCount = comp.meet_count || 1;
  const rounds = bergerRounds(players, meetCount);

  // Henüz başlatılmamış (session_id NULL) eski plan satırlarını sil
  db.prepare('DELETE FROM league_schedule WHERE competition_id = ? AND session_id IS NULL').run(competitionId);

  const insertSchedule = db.prepare(
    'INSERT INTO league_schedule (competition_id, round_number, meeting_number, player1_id, player2_id) VALUES (?,?,?,?,?)'
  );
  db.transaction(() => {
    for (const round of rounds) {
      for (const pair of round.pairs) {
        insertSchedule.run(competitionId, round.roundNumber, round.meeting, pair.p1, pair.p2);
      }
    }
  })();

  db.prepare('UPDATE competitions SET plan_generated = 1 WHERE id = ?').run(competitionId);
  return { rounds: rounds.length, matchups: rounds.reduce((s, r) => s + r.pairs.length, 0) };
}

// Lig planını döndürür: her round + eşleşmeleri + session/tournament bilgisi
function leagueSchedule(competitionId) {
  const rows = db.prepare(`
    SELECT ls.*, p1.name AS p1_name, p2.name AS p2_name,
           t.status AS tournament_status
    FROM league_schedule ls
    LEFT JOIN players p1 ON p1.id = ls.player1_id
    LEFT JOIN players p2 ON p2.id = ls.player2_id
    LEFT JOIN tournaments t ON t.id = ls.tournament_id
    WHERE ls.competition_id = ?
    ORDER BY ls.round_number ASC, ls.id ASC
  `).all(competitionId);

  // Round'lara grupla (aynı round_number'daki tüm eşleşmeler bir arada)
  const roundMap = new Map();
  for (const row of rows) {
    if (!roundMap.has(row.round_number)) {
      // session_status: tournament_status'tan türet
      let session_status = 'planned';
      if (row.tournament_status === 'finished') session_status = 'finished';
      else if (row.tournament_status === 'running') session_status = 'running';
      else if (row.session_id) session_status = 'planned'; // oturuma bağlı ama henüz başlamadı

      roundMap.set(row.round_number, {
        round_number: row.round_number,
        meeting_number: row.meeting_number,
        session_id: row.session_id,
        tournament_id: row.tournament_id,
        tournament_status: row.tournament_status,
        session_status,
        results_recorded: !!row.results_recorded,
        pairs: [],
      });
    }
    roundMap.get(row.round_number).pairs.push({
      player1_id: row.player1_id,
      player2_id: row.player2_id,
      p1_name: row.p1_name,
      p2_name: row.p2_name,
    });
  }
  return [...roundMap.values()];
}

// Bir round'u oturuma ve turnuvaya bağlar.
// tournamentId NULL ise sadece session_id güncellenir (henüz başlatılmamış round'u güne taşımak için).
function linkRoundToSession(competitionId, roundNumber, sessionId, tournamentId) {
  if (tournamentId == null) {
    db.prepare(
      'UPDATE league_schedule SET session_id = ? WHERE competition_id = ? AND round_number = ?'
    ).run(sessionId, competitionId, roundNumber);
  } else {
    db.prepare(
      'UPDATE league_schedule SET session_id = ?, tournament_id = ? WHERE competition_id = ? AND round_number = ?'
    ).run(sessionId, tournamentId, competitionId, roundNumber);
  }
}

// Round-bazlı finalize destek: lig için bir round'un mini turnuvasından
// her oyuncunun (wins, losses, legs_won, legs_lost) çıkarıp klasmana yansıtır.
// Idempotent: results_recorded=1 ise hiçbir şey yapmaz, false döner.
// Dönüş: { ok, recorded, perPlayer: [{player_id, wins, losses, legs_won, legs_lost, points}] }
function recordLeagueRoundResults(competitionId, roundNumber, userId, opts = {}) {
  const comp = db.prepare('SELECT * FROM competitions WHERE id = ? AND user_id = ?').get(competitionId, userId);
  if (!comp) throw new Error('Competition bulunamadı');
  if (comp.type !== 'league') throw new Error('Sadece lig formatında round finalize edilebilir');

  const row = db.prepare(
    'SELECT * FROM league_schedule WHERE competition_id = ? AND round_number = ? LIMIT 1'
  ).get(competitionId, roundNumber);
  if (!row) throw new Error(`Round ${roundNumber} planda yok`);
  if (!row.tournament_id) throw new Error(`Round ${roundNumber} henüz başlatılmadı`);
  if (row.results_recorded) {
    return { ok: false, already: true };
  }

  const t = db.prepare('SELECT * FROM tournaments WHERE id = ?').get(row.tournament_id);
  if (!t) throw new Error('Round turnuvası bulunamadı');
  if (t.status !== 'finished') throw new Error('Round henüz bitmedi — önce tüm maçları tamamla');

  // Maçlar + entry → player haritası
  const matches = db.prepare(
    'SELECT * FROM matches WHERE tournament_id = ? AND status = ?'
  ).all(row.tournament_id, 'finished');
  const entries = db.prepare(
    'SELECT * FROM entries WHERE tournament_id = ?'
  ).all(row.tournament_id);
  const entryToPlayer = new Map();
  for (const e of entries) entryToPlayer.set(e.id, e.player1_id);

  // Per-player toplama
  const perPlayer = new Map(); // player_id → { wins, losses, legs_won, legs_lost }
  function ensure(pid) {
    if (!perPlayer.has(pid)) perPlayer.set(pid, { wins: 0, losses: 0, legs_won: 0, legs_lost: 0 });
    return perPlayer.get(pid);
  }
  for (const m of matches) {
    const p1 = entryToPlayer.get(m.entry1_id);
    const p2 = entryToPlayer.get(m.entry2_id);
    if (!p1 || !p2) continue;
    const a = ensure(p1);
    const b = ensure(p2);
    a.legs_won  += m.p1_legs || 0;
    a.legs_lost += m.p2_legs || 0;
    b.legs_won  += m.p2_legs || 0;
    b.legs_lost += m.p1_legs || 0;
    if (m.winner_entry_id === m.entry1_id) { a.wins++; b.losses++; }
    else if (m.winner_entry_id === m.entry2_id) { b.wins++; a.losses++; }
  }

  // Maç başına puan: points_json['match'] varsa onu kullan, yoksa 3 (default)
  let matchPoints = 3;
  try {
    const pj = comp.points_json ? JSON.parse(comp.points_json) : {};
    if (pj && pj.match != null && !isNaN(+pj.match)) matchPoints = +pj.match;
  } catch (_) {}

  // Atış istatistiklerini topla (tournamentPlayerReport entry-bazlı agreggate döner)
  // ve player_id -> shotStats haritası kur.
  const shotByPlayer = {};
  try {
    const report = tournamentPlayerReport(row.tournament_id);
    for (const r of report) {
      const m3da = (r.darts_thrown > 0) ? (r.total_score / r.darts_thrown) * 3 : 0;
      const sStats = {
        total_score:   r.total_score   || 0,
        darts_thrown:  r.darts_thrown  || 0,
        tons:          r.tons          || 0,
        ton_plus:      r.ton_plus      || 0,
        one_eighty:    r.one_eighty    || 0,
        high_outs:     r.high_outs     || 0,
        best_checkout: r.best_checkout || 0,
        match_3da:     m3da,
      };
      const p1id = r.entry?.player1?.id;
      const p2id = r.entry?.player2?.id;
      if (p1id) shotByPlayer[p1id] = sStats;
      if (p2id) shotByPlayer[p2id] = sStats;
    }
  } catch (err) {
    console.warn('[recordLeagueRoundResults] shot stats warning:', err.message);
  }

  const result = [];
  const tx = db.transaction(() => {
    for (const [pid, st] of perPlayer.entries()) {
      const pts = (st.wins || 0) * matchPoints;
      addToCompetitionPlayerStats(competitionId, pid, {
        total_points: pts,
        // Bir round = bir "oturum katılımı" sayılmaz; gün/oturum konteyner.
        // Klasmandaki "Oturum" sutununu sezon ile tutarli tutmak icin 0.
        sessions_played: 0,
        matches_won:  st.wins,
        matches_lost: st.losses,
        legs_won:     st.legs_won,
        legs_lost:    st.legs_lost,
      });
      // Atış istatistikleri (sezonda olduğu gibi birikimli)
      if (shotByPlayer[pid]) {
        addShotStatsToCompetitionPlayer(competitionId, pid, shotByPlayer[pid]);
      }
      result.push({ player_id: pid, ...st, points: pts });
    }
    db.prepare(
      'UPDATE league_schedule SET results_recorded = 1, shot_stats_recorded = 1 WHERE competition_id = ? AND round_number = ?'
    ).run(competitionId, roundNumber);
  });
  tx();

  return { ok: true, recorded: result.length, perPlayer: result, match_points: matchPoints };
}

// Eski finalize edilmiş round'ların atış istatistiklerini geriye dönük yazar.
// results_recorded=1 + shot_stats_recorded=0 satırları işler. Idempotent.
// Maç G/M ve leg G/M YAZILMAZ (zaten yazıldı, double sayım olmaz).
function backfillShotStatsForCompetition(competitionId, userId) {
  const comp = db.prepare('SELECT * FROM competitions WHERE id = ? AND user_id = ?').get(competitionId, userId);
  if (!comp) throw new Error('Competition bulunamadı');
  if (comp.type !== 'league') throw new Error('Sadece lig için backfill');

  const rows = db.prepare(
    'SELECT * FROM league_schedule WHERE competition_id = ? AND results_recorded = 1 AND shot_stats_recorded = 0 AND tournament_id IS NOT NULL'
  ).all(competitionId);

  let totalRoundsBackfilled = 0;
  let totalPlayersTouched = 0;

  for (const row of rows) {
    let report;
    try {
      report = tournamentPlayerReport(row.tournament_id);
    } catch (err) {
      console.warn(`[backfill] R${row.round_number} report hatası:`, err.message);
      continue;
    }

    const tx = db.transaction(() => {
      for (const r of report) {
        const m3da = (r.darts_thrown > 0) ? (r.total_score / r.darts_thrown) * 3 : 0;
        const sStats = {
          total_score:   r.total_score   || 0,
          darts_thrown:  r.darts_thrown  || 0,
          tons:          r.tons          || 0,
          ton_plus:      r.ton_plus      || 0,
          one_eighty:    r.one_eighty    || 0,
          high_outs:     r.high_outs     || 0,
          best_checkout: r.best_checkout || 0,
          match_3da:     m3da,
        };
        const p1id = r.entry?.player1?.id;
        const p2id = r.entry?.player2?.id;
        if (p1id) { addShotStatsToCompetitionPlayer(competitionId, p1id, sStats); totalPlayersTouched++; }
        if (p2id) { addShotStatsToCompetitionPlayer(competitionId, p2id, sStats); totalPlayersTouched++; }
      }
      db.prepare(
        'UPDATE league_schedule SET shot_stats_recorded = 1 WHERE id = ?'
      ).run(row.id);
    });
    tx();
    totalRoundsBackfilled++;
  }

  return { rounds: totalRoundsBackfilled, players_touched: totalPlayersTouched };
}

// Bir round'un finalize edilip edilmediğini hızlıca döner
function leagueRoundResultsRecorded(competitionId, roundNumber) {
  const r = db.prepare(
    'SELECT results_recorded FROM league_schedule WHERE competition_id = ? AND round_number = ? LIMIT 1'
  ).get(competitionId, roundNumber);
  return !!(r && r.results_recorded);
}

function createSession(data) {
  // points_override_json: JSON string olarak saklanir. Caller object verirse stringle.
  let pOver = data.points_override_json;
  if (pOver != null && typeof pOver !== 'string') {
    try { pOver = JSON.stringify(pOver); } catch { pOver = null; }
  }
  const info = db.prepare(`
    INSERT INTO competition_sessions
      (competition_id, user_id, session_number, tournament_id, name, session_date,
       status, round_number, session_type, points_override_json, is_masters)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.competition_id,
    data.user_id || null,
    data.session_number,
    data.tournament_id || null,
    data.name || null,
    data.session_date || null,
    data.status || 'pending',
    data.round_number || null,
    data.session_type || 'bracket',
    pOver || null,
    data.is_masters ? 1 : 0,
  );
  return db.prepare('SELECT * FROM competition_sessions WHERE id = ?').get(info.lastInsertRowid);
}

function sessionsForCompetition(competitionId) {
  return db.prepare(
    'SELECT * FROM competition_sessions WHERE competition_id = ? ORDER BY session_number ASC'
  ).all(competitionId);
}

function sessionById(id) {
  return db.prepare('SELECT * FROM competition_sessions WHERE id = ?').get(id);
}

function updateSession(id, fields) {
  const allowed = ['session_number', 'tournament_id', 'name', 'session_date',
                   'status', 'finished_at', 'round_number', 'session_type',
                   'points_override_json', 'is_masters'];
  const keys = Object.keys(fields).filter(k => allowed.includes(k));
  if (!keys.length) return;
  // points_override_json object verilirse stringle
  const values = keys.map(k => {
    let v = fields[k];
    if (k === 'points_override_json' && v != null && typeof v !== 'string') {
      try { v = JSON.stringify(v); } catch { v = null; }
    }
    if (k === 'is_masters') v = v ? 1 : 0;
    return v;
  });
  const sql = `UPDATE competition_sessions SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...values, id);
}

function deleteSession(id) {
  db.prepare('DELETE FROM competition_sessions WHERE id = ?').run(id);
}

// --- Session Results ---
function recordSessionResult(sessionId, competitionId, playerId, position, points) {
  // INSERT OR REPLACE (UNIQUE on session_id+player_id)
  db.prepare(`
    INSERT INTO session_results (session_id, competition_id, player_id, position, points)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(session_id, player_id) DO UPDATE SET
      position = excluded.position,
      points = excluded.points
  `).run(sessionId, competitionId, playerId, position, points);
}

function resultsForSession(sessionId) {
  return db.prepare(
    'SELECT * FROM session_results WHERE session_id = ? ORDER BY position ASC'
  ).all(sessionId);
}

// Belirli bir oturumun session_results kaydi olup olmadigini hizlica dondurur.
// finalize endpoint'i + sessions listesi flag'i icin.
function sessionHasResults(sessionId) {
  const row = db.prepare(
    'SELECT 1 AS x FROM session_results WHERE session_id = ? LIMIT 1'
  ).get(sessionId);
  return !!row;
}

// Birikimli competition_players istatistik artirimi.
// delta: { total_points, sessions_played, matches_won, matches_lost, legs_won, legs_lost,
//         first_place, second_place, third_place }
// Eksik anahtarlar 0 sayilir. Tek bir UPDATE'le tum alanlari artirir.
function addToCompetitionPlayerStats(competitionId, playerId, delta) {
  const d = delta || {};
  db.prepare(`
    UPDATE competition_players SET
      total_points     = COALESCE(total_points, 0)     + ?,
      sessions_played  = COALESCE(sessions_played, 0)  + ?,
      matches_won      = COALESCE(matches_won, 0)      + ?,
      matches_lost     = COALESCE(matches_lost, 0)     + ?,
      legs_won         = COALESCE(legs_won, 0)         + ?,
      legs_lost        = COALESCE(legs_lost, 0)        + ?,
      first_place      = COALESCE(first_place, 0)      + ?,
      second_place     = COALESCE(second_place, 0)     + ?,
      third_place      = COALESCE(third_place, 0)      + ?
    WHERE competition_id = ? AND player_id = ?
  `).run(
    +d.total_points || 0,
    +d.sessions_played || 0,
    +d.matches_won || 0,
    +d.matches_lost || 0,
    +d.legs_won || 0,
    +d.legs_lost || 0,
    +d.first_place || 0,
    +d.second_place || 0,
    +d.third_place || 0,
    competitionId, playerId
  );
}

// Atis istatistiklerini stats_json icine birikimli yaz.
// shotStats: { total_score, darts_thrown, tons (100+), ton_plus (140+),
//              one_eighty (180), high_outs (yuksek finish sayisi),
//              best_checkout (max), matches_in_avg (avg agirligi icin) }
// stats_json yapisi: {
//   total_score, darts_thrown,                  // 3DA hesabi icin birikimli
//   tons, ton_plus, one_eighty, high_outs,      // sayilar
//   best_checkout, highest_match_3da,           // maks degerler
// }
function addShotStatsToCompetitionPlayer(competitionId, playerId, shotStats) {
  const s = shotStats || {};
  const row = db.prepare(
    'SELECT stats_json FROM competition_players WHERE competition_id = ? AND player_id = ?'
  ).get(competitionId, playerId);
  if (!row) return;
  let cur = {};
  try { cur = row.stats_json ? JSON.parse(row.stats_json) : {}; } catch { cur = {}; }
  cur.total_score   = (+cur.total_score || 0)   + (+s.total_score || 0);
  cur.darts_thrown  = (+cur.darts_thrown || 0)  + (+s.darts_thrown || 0);
  cur.tons          = (+cur.tons || 0)          + (+s.tons || 0);
  cur.ton_plus      = (+cur.ton_plus || 0)      + (+s.ton_plus || 0);
  cur.one_eighty    = (+cur.one_eighty || 0)    + (+s.one_eighty || 0);
  cur.high_outs     = (+cur.high_outs || 0)     + (+s.high_outs || 0);
  cur.best_checkout = Math.max(+cur.best_checkout || 0, +s.best_checkout || 0);
  cur.highest_match_3da = Math.max(+cur.highest_match_3da || 0, +s.match_3da || 0);
  db.prepare(
    'UPDATE competition_players SET stats_json = ? WHERE competition_id = ? AND player_id = ?'
  ).run(JSON.stringify(cur), competitionId, playerId);
}

// --- User token fonksiyonları ---
function setVerifyToken(userId, token) {
  db.prepare('UPDATE users SET verify_token = ? WHERE id = ?').run(token, userId);
}
function verifyEmailToken(token) {
  const user = db.prepare('SELECT * FROM users WHERE verify_token = ?').get(token);
  if (!user) return null;
  db.prepare('UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?').run(user.id);
  return user;
}
function setResetToken(userId, token, expires) {
  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(token, expires, userId);
}
function getUserByResetToken(token) {
  return db.prepare('SELECT * FROM users WHERE reset_token = ? AND reset_token_expires > ?').get(token, Date.now());
}
function clearResetToken(userId) {
  db.prepare('UPDATE users SET reset_token = NULL, reset_token_expires = NULL WHERE id = ?').run(userId);
}
function updatePassword(userId, passwordHash) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, userId);
}
function deleteUser(userId) {
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
}

module.exports = {
  db, init,
  createUser, userByEmail, userById, allUsers,
  setVerifyToken, verifyEmailToken,
  setResetToken, getUserByResetToken, clearResetToken,
  updatePassword, deleteUser,
  createPlayer, allPlayers, playerById, deletePlayer,
  createBoard, allBoards, boardById, deleteBoard, setBoardMatch, clearUserBoards, setBoardTournament,
  createTournament, allTournaments, tournamentById, updateTournamentStatus, updateTournament, deleteTournament,
  addEntry, entriesForTournament, entryById, updateEntrySlots,
  createStage, stagesForTournament, stageById, updateStageStatus,
  createMatch, matchById, matchesForTournament, matchesForStage,
  activeMatches, pendingReadyMatches, updateMatch, setMatchEntry, walkoverMatch,
  addThrow, throwsForMatch, lastThrow, deleteThrow,
  getStats, updateStats, statsForMatch, tournamentPlayerReport,
  resetAll,
  createTeamEvent, allTeamEvents, teamEventById, updateTeamEvent, deleteTeamEvent,
  createTeamPhase, phasesForEvent, teamPhaseById, updateTeamPhase,
  createTeamPhaseMatch, matchesForPhase, teamPhaseMatchById, updateTeamPhaseMatch,
  deleteTeamPhaseMatch, recalcTeamScores,
  getOrCreateTeamPool, getOrCreatePlayerByName, teamPhaseMatchByMatchId,
  // Lig & Sezon
  createCompetition, allCompetitions, competitionById, updateCompetition, deleteCompetition,
  addCompetitionPlayer, competitionPlayers, removeCompetitionPlayer,
  createSession, sessionsForCompetition, sessionById, updateSession, deleteSession,
  recordSessionResult, resultsForSession, sessionHasResults,
  addToCompetitionPlayerStats, addShotStatsToCompetitionPlayer,
  generateLeaguePlan, leagueSchedule, linkRoundToSession,
  recordLeagueRoundResults, leagueRoundResultsRecorded, backfillShotStatsForCompetition,
};
