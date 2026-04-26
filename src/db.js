// SQLite veritabanı katmanı - better-sqlite3 ile senkron erişim
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.db');
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
      name TEXT NOT NULL,
      status TEXT DEFAULT 'idle',  -- idle | busy
      current_match_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
      next_winner_match_id INTEGER,   -- bracket ilerletme
      next_winner_slot INTEGER,
      next_loser_match_id INTEGER,    -- double-elim
      next_loser_slot INTEGER,
      scorer_entry_id INTEGER,        -- yazıcı-hakem olarak atanan entry
      legs_to_win INTEGER,            -- null → turnuva varsayılanı; round başına override
      sets_to_win INTEGER,            -- null → turnuva varsayılanı; round başına override
      is_reset_final INTEGER DEFAULT 0, -- çift elemede 2. grand final (reset match)
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
function createBoard(name, userId = null) {
  const info = db.prepare(
    'INSERT INTO boards (user_id, name) VALUES (?, ?)'
  ).run(userId, name);
  return db.prepare('SELECT * FROM boards WHERE id = ?').get(info.lastInsertRowid);
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
  if (userId == null) {
    return db.prepare('SELECT * FROM tournaments ORDER BY id DESC').all();
  }
  return db.prepare('SELECT * FROM tournaments WHERE user_id = ? ORDER BY id DESC').all(userId);
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
  db.prepare('DELETE FROM tournaments WHERE id = ?').run(id);
}

// --- Entries ---
function addEntry(tournamentId, slot, player1Id, player2Id = null, seed = null) {
  const info = db.prepare(
    'INSERT INTO entries (tournament_id, slot, player1_id, player2_id, seed) VALUES (?, ?, ?, ?, ?)'
  ).run(tournamentId, slot, player1Id, player2Id, seed);
  return db.prepare('SELECT * FROM entries WHERE id = ?').get(info.lastInsertRowid);
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
     p1_leg_score, p2_leg_score, legs_to_win, sets_to_win)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.tournament_id, m.stage_id, m.bracket, m.round, m.match_index,
    m.entry1_id || null, m.entry2_id || null, m.status || 'pending',
    m.next_winner_match_id || null, m.next_winner_slot || null,
    m.next_loser_match_id || null, m.next_loser_slot || null,
    m.start_score || null, m.start_score || null,
    m.legs_to_win || null, m.sets_to_win || null,
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
    WHERE m.tournament_id = ?
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

module.exports = {
  db, init,
  createUser, userByEmail, userById, allUsers,
  createPlayer, allPlayers, playerById, deletePlayer,
  createBoard, allBoards, boardById, deleteBoard, setBoardMatch,
  createTournament, allTournaments, tournamentById, updateTournamentStatus, updateTournament, deleteTournament,
  addEntry, entriesForTournament, entryById,
  createStage, stagesForTournament, stageById, updateStageStatus,
  createMatch, matchById, matchesForTournament, matchesForStage,
  activeMatches, pendingReadyMatches, updateMatch, setMatchEntry,
  addThrow, throwsForMatch, lastThrow, deleteThrow,
  getStats, updateStats, statsForMatch, tournamentPlayerReport,
  resetAll,
};
