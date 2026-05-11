// Dart Tournament Server - Express + Socket.IO + SQLite

// Başlangıçta yakalanmayan hatalar loglanır — Render crash'lerini görünür yapar
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason);
  process.exit(1);
});
const path = require('path');
const express = require('express');
const session = require('express-session');
const http = require('http');
const { Server } = require('socket.io');

const db = require('./src/db');
const tournament = require('./src/tournament');
const engine = require('./src/match-engine');
const scheduler = require('./src/scheduler');
const auth = require('./src/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// Render ve benzeri proxy'lerin arkasında çalışmak için — session cookie'lerin
// "secure" flag'i doğru çalışsın diye proxy'e güven.
app.set('trust proxy', 1);

// Prod'da HTTP ile gelen istekleri HTTPS'e yönlendir
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    return res.redirect(301, 'https://' + req.headers.host + req.url);
  }
  next();
});

// Canonical host: production'da sadece CANONICAL_HOST üzerinden serve et,
// diğer host'lardan (örn. *.onrender.com, eski domain) 301 ile yönlendir.
// Env var ile değiştirilebilir; default dartcorepro.com.
const CANONICAL_HOST = (process.env.CANONICAL_HOST || 'dartcorepro.com').toLowerCase();
app.use((req, res, next) => {
  if (process.env.NODE_ENV !== 'production') return next();
  const raw = req.headers.host || '';
  const host = raw.split(':')[0].toLowerCase();
  // hem apex hem www kabul
  if (host === CANONICAL_HOST || host === 'www.' + CANONICAL_HOST) return next();
  // Sağlık kontrolü için /healthz hep cevap versin (Render check'leri için)
  if (req.url === '/healthz') return next();
  return res.redirect(301, 'https://' + CANONICAL_HOST + req.url);
});

app.use(express.json());

// Session — multi-organizer için kimlik izolasyonu
// better-sqlite3 ile yazılmış özel session store: connect-sqlite3 çakışması yok,
// session'lar kalıcı disk üzerindeki aynı data.db içinde saklanır.
const SESSION_SECRET = process.env.SESSION_SECRET
  || 'dev-secret-please-set-SESSION_SECRET-in-prod';

class BetterSQLiteStore extends session.Store {
  constructor() {
    super();
    // db.db = ham better-sqlite3 instance
    const raw = db.db;
    raw.exec(`CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired_at INTEGER NOT NULL
    )`);
    setInterval(() => {
      try { raw.prepare('DELETE FROM sessions WHERE expired_at < ?').run(Date.now()); } catch {}
    }, 60 * 60 * 1000).unref();
    this._raw = raw;
  }
  get(sid, cb) {
    try {
      const row = this._raw.prepare('SELECT sess, expired_at FROM sessions WHERE sid = ?').get(sid);
      if (!row || row.expired_at < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie && sess.cookie.maxAge ? sess.cookie.maxAge * 1000 : 86400000 * 30;
      const expiredAt = Date.now() + maxAge;
      this._raw.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)')
        .run(sid, JSON.stringify(sess), expiredAt);
      cb(null);
    } catch (e) { cb(e); }
  }
  destroy(sid, cb) {
    try {
      this._raw.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch (e) { cb(e); }
  }
}

const sessionMiddleware = session({
  store: new BetterSQLiteStore(),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün
  },
});
app.use(sessionMiddleware);
app.use(auth.optionalAuth);

app.use(express.static(path.join(__dirname, 'public')));

// --- Auth routes ---
app.post('/auth/register', auth.registerHandler);
app.post('/auth/login', auth.loginHandler);
app.post('/auth/logout', auth.logoutHandler);
app.get('/auth/me', auth.meHandler);
app.post('/auth/forgot-password', auth.forgotPasswordHandler);
app.post('/auth/reset-password', auth.resetPasswordHandler);
app.get('/auth/verify-email', auth.verifyEmailHandler);
app.post('/auth/resend-verify', auth.resendVerifyHandler);
app.post('/auth/delete-account', auth.deleteAccountHandler);

// --- Helpers ---
// Multi-organizer: her bağlı socket için (userId varsa) o kullanıcıya özel
// snapshot yayınla. userId yoksa (login olmamış izleyici) public snapshot.
function broadcastState() {
  for (const [, socket] of io.sockets.sockets) {
    const uid = socket.data && socket.data.userId ? socket.data.userId : null;
    socket.emit('state', getSnapshot(uid));
  }
}

function getSnapshot(userId = null) {
  return {
    players: db.allPlayers(userId),
    tournaments: db.allTournaments(userId).map(t => ({
      ...t,
      stages: db.stagesForTournament(t.id),
      matches: db.matchesForTournament(t.id),
      entries: db.entriesForTournament(t.id),
      // Klasman için entry başına agregat istatistikler (3-ok ort, leg, 180 vs.)
      report: t.status !== 'draft' ? db.tournamentPlayerReport(t.id) : [],
    })),
    boards: db.allBoards(userId).map(b => ({
      ...b,
      currentMatch: b.current_match_id ? db.matchById(b.current_match_id) : null,
    })),
    activeMatches: db.activeMatches(userId),
  };
}

// --- REST API ---

// Players
app.get('/api/players', (req, res) => {
  const uid = req.user ? req.user.id : null;
  res.json(db.allPlayers(uid));
});
app.post('/api/players', auth.requireAuth, (req, res) => {
  const { name, nickname } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });
  const trimmed = name.trim();
  // Aynı kullanıcıya ait aynı isimde oyuncu varsa engelle (büyük/küçük harf farkı yok)
  const existing = db.allPlayers(req.user.id);
  const dupe = existing.find(p => p.name.toLowerCase() === trimmed.toLowerCase());
  if (dupe) return res.status(400).json({ error: `"${trimmed}" isimli oyuncu zaten mevcut` });
  const p = db.createPlayer(trimmed, nickname?.trim() || null, req.user.id);
  broadcastState();
  res.json(p);
});
app.delete('/api/players/:id', auth.requireAuth, (req, res) => {
  const p = db.playerById(+req.params.id);
  if (p && p.user_id && p.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  db.deletePlayer(+req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// Boards
app.get('/api/boards', (req, res) => {
  const uid = req.user ? req.user.id : null;
  res.json(db.allBoards(uid));
});
app.post('/api/boards', auth.requireAuth, (req, res) => {
  const { name, tournament_id } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Board ismi gerekli' });
  let tid = null;
  if (tournament_id != null && tournament_id !== '') {
    const t = db.tournamentById(+tournament_id);
    if (!t || (t.user_id && t.user_id !== req.user.id)) {
      return res.status(403).json({ error: 'Geçersiz turnuva' });
    }
    tid = +tournament_id;
  }
  const b = db.createBoard(name.trim(), req.user.id, tid);
  broadcastState();
  res.json(b);
});
app.patch('/api/boards/:id', auth.requireAuth, (req, res) => {
  const b = db.boardById(+req.params.id);
  if (!b) return res.status(404).json({ error: 'Board bulunamadı' });
  if (b.user_id && b.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  if ('tournament_id' in (req.body || {})) {
    let tid = null;
    if (req.body.tournament_id != null && req.body.tournament_id !== '') {
      const t = db.tournamentById(+req.body.tournament_id);
      if (!t || (t.user_id && t.user_id !== req.user.id)) {
        return res.status(403).json({ error: 'Geçersiz turnuva' });
      }
      tid = +req.body.tournament_id;
    }
    db.setBoardTournament(b.id, tid);
  }
  broadcastState();
  res.json({ ok: true });
});
app.delete('/api/boards/:id', auth.requireAuth, (req, res) => {
  const b = db.boardById(+req.params.id);
  if (b && b.user_id && b.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  db.deleteBoard(+req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// Tournaments
app.get('/api/tournaments', (req, res) => {
  const uid = req.user ? req.user.id : null;
  res.json(db.allTournaments(uid));
});
app.post('/api/tournaments', auth.requireAuth, (req, res) => {
  try {
    const t = tournament.createTournament({ ...req.body, user_id: req.user.id });
    broadcastState();
    res.json(t);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.post('/api/tournaments/:id/start', auth.requireAuth, (req, res) => {
  try {
    const t = db.tournamentById(+req.params.id);
    if (t && t.user_id && t.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Yetkiniz yok' });
    }
    tournament.startTournament(+req.params.id);
    scheduler.assignPendingMatches(io, req.user.id);
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
// Turnuva ayarlarını güncelle — sadece draft durumunda
app.patch('/api/tournaments/:id', auth.requireAuth, (req, res) => {
  try {
    const t = db.tournamentById(+req.params.id);
    if (!t) return res.status(404).json({ error: 'Turnuva bulunamadı' });
    if (t.user_id !== req.user.id) return res.status(403).json({ error: 'Yetkisiz' });
    if (t.status !== 'draft') return res.status(400).json({ error: 'Sadece taslak turnuvalar düzenlenebilir' });
    const { name, game_mode, legs_to_win, sets_to_win } = req.body;
    db.updateTournament(t.id, { name, game_mode, legs_to_win, sets_to_win });
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.delete('/api/tournaments/:id', auth.requireAuth, (req, res) => {
  const t = db.tournamentById(+req.params.id);
  if (t && t.user_id && t.user_id !== req.user.id) {
    return res.status(403).json({ error: 'Yetkiniz yok' });
  }
  db.deleteTournament(+req.params.id);
  broadcastState();
  res.json({ ok: true });
});

// Turnuva boyunca oyuncu performans raporu
app.get('/api/tournaments/:id/report', (req, res) => {
  const id = +req.params.id;
  const t = db.tournamentById(id);
  if (!t) return res.status(404).json({ error: 'Turnuva bulunamadı' });
  const report = db.tournamentPlayerReport(id);
  res.json({ tournament: t, report });
});

// Match control (from board / tablet)
app.get('/api/matches/:id', (req, res) => {
  const m = db.matchById(+req.params.id);
  if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
  const t = db.tournamentById(m.tournament_id);
  const stage = db.stageById(m.stage_id);
  const stageMatches = db.matchesForStage(m.stage_id);
  const bracketSize = tournament.computeBracketSize(stage, stageMatches);
  const round_label = tournament.roundLabel(m, { bracketSize, format: stage?.format });
  res.json({
    ...m,
    throws: db.throwsForMatch(m.id),
    stats: db.statsForMatch(m.id),
    tournament_name: t?.name,
    game_mode: t?.game_mode,
    round_label,
  });
});

// Maça Başla: ready → live. Opsiyonel: scorer_entry_id override.
app.post('/api/matches/:id/begin', (req, res) => {
  try {
    const id = +req.params.id;
    const m = db.matchById(id);
    if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
    if (m.status === 'live') return res.json({ ok: true, already: true });
    if (m.status !== 'ready') return res.status(400).json({ error: `Maç ${m.status} durumunda, başlatılamaz` });
    if (!m.entry1_id || !m.entry2_id) return res.status(400).json({ error: 'Oyuncular henüz belli değil' });
    const patch = { status: 'live' };
    if (req.body && req.body.scorer_entry_id !== undefined) {
      patch.scorer_entry_id = req.body.scorer_entry_id || null;
    }
    // İlk atan oyuncu seçimi (1 ya da 2)
    const st = req.body?.starting_turn;
    if (st === 1 || st === 2) {
      patch.current_turn = st;
      patch.starter_slot = st;
    }
    // Doubles: pair içi başlayan oyuncu (1 ya da 2)
    const s1 = req.body?.p1_sub_turn;
    const s2 = req.body?.p2_sub_turn;
    if (s1 === 1 || s1 === 2) patch.p1_sub_turn = s1;
    if (s2 === 1 || s2 === 2) patch.p2_sub_turn = s2;
    // Cricket / FB Cezalı: state'i başlat
    const tour = db.tournamentById(m.tournament_id);
    if (tour?.game_mode === 'cricket' && !m.cricket_state_json) {
      patch.cricket_state_json = JSON.stringify(engine.initCricketState());
    }
    if (tour?.game_mode === 'cricket_fb_cezali' && !m.cricket_state_json) {
      let cfg = {};
      try { cfg = tour.config_json ? JSON.parse(tour.config_json) : {}; } catch {}
      // İstek body'sinde explicit gelirse onu kullan, yoksa tournament config, yoksa true
      const includeLow = (req.body && typeof req.body.include_low === 'boolean')
        ? req.body.include_low
        : (cfg.include_low !== false);
      patch.cricket_state_json = JSON.stringify(engine.initFBCezaliState(includeLow));
    }
    if (tour?.game_mode === 'cricket_fb_karambol' && !m.cricket_state_json) {
      let cfg = {};
      try { cfg = tour.config_json ? JSON.parse(tour.config_json) : {}; } catch {}
      const includeLow = (req.body && typeof req.body.include_low === 'boolean')
        ? req.body.include_low
        : (cfg.include_low !== false);
      patch.cricket_state_json = JSON.stringify(engine.initKarambolState(includeLow));
    }
    db.updateMatch(id, patch);
    if (m.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: db.matchById(id),
      });
    }
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cricket/FB/Karambol için son visit öncesi snapshot — GERİ AL için
function cricketUndoSnapshot(matchId) {
  const m = db.matchById(matchId);
  if (!m) return;
  const snap = {
    cricket_state_json: m.cricket_state_json || null,
    current_turn: m.current_turn,
    p1_legs: m.p1_legs,
    p2_legs: m.p2_legs,
    current_leg: m.current_leg,
    p1_sets: m.p1_sets,
    p2_sets: m.p2_sets,
    current_set: m.current_set,
    status: m.status,
    winner_entry_id: m.winner_entry_id,
    p1_sub_turn: m.p1_sub_turn,
    p2_sub_turn: m.p2_sub_turn,
  };
  db.updateMatch(matchId, { cricket_undo_json: JSON.stringify(snap) });
}

// Cricket: bir visit (3 ok) kaydı — hits: {20: 2, 19: 1, ...}
app.post('/api/matches/:id/cricket-throw', (req, res) => {
  try {
    const id = +req.params.id;
    const { playerSlot, hits } = req.body;
    if (!hits || typeof hits !== 'object') return res.status(400).json({ error: 'hits gerekli' });
    cricketUndoSnapshot(id); // önce snapshot
    const result = engine.recordCricketVisit(id, playerSlot, hits);
    const m = db.matchById(id);
    if (m?.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: m,
      });
    }
    broadcastState();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cricket Full Board Cezalı: bir visit kaydı — allocation: { marks: {target: count}, score: N }
app.post('/api/matches/:id/fb-cezali-throw', (req, res) => {
  try {
    const id = +req.params.id;
    const { playerSlot, allocation } = req.body;
    if (!allocation || typeof allocation !== 'object') return res.status(400).json({ error: 'allocation gerekli' });
    cricketUndoSnapshot(id);
    const result = engine.recordFBCezaliVisit(id, playerSlot, allocation);
    const m = db.matchById(id);
    if (m?.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: m,
      });
    }
    broadcastState();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cricket Full Board Karambol: bir visit kaydı — allocation: { marks: {target: count} }
app.post('/api/matches/:id/karambol-throw', (req, res) => {
  try {
    const id = +req.params.id;
    const { playerSlot, allocation } = req.body;
    if (!allocation || typeof allocation !== 'object') return res.status(400).json({ error: 'allocation gerekli' });
    cricketUndoSnapshot(id);
    const result = engine.recordKarambolVisit(id, playerSlot, allocation);
    const m = db.matchById(id);
    if (m?.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: m,
      });
    }
    broadcastState();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Cricket/FB/Karambol — son visit'i geri al (snapshot'tan restore)
app.post('/api/matches/:id/cricket-undo', (req, res) => {
  try {
    const id = +req.params.id;
    const m = db.matchById(id);
    if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
    if (!m.cricket_undo_json) return res.status(400).json({ error: 'Geri alınacak visit yok' });
    let snap;
    try { snap = JSON.parse(m.cricket_undo_json); } catch { return res.status(400).json({ error: 'Snapshot bozuk' }); }
    db.updateMatch(id, {
      cricket_state_json: snap.cricket_state_json,
      current_turn:      snap.current_turn,
      p1_legs:           snap.p1_legs,
      p2_legs:           snap.p2_legs,
      current_leg:       snap.current_leg,
      p1_sets:           snap.p1_sets,
      p2_sets:           snap.p2_sets,
      current_set:       snap.current_set,
      status:            snap.status,
      winner_entry_id:   snap.winner_entry_id,
      p1_sub_turn:       snap.p1_sub_turn,
      p2_sub_turn:       snap.p2_sub_turn,
      cricket_undo_json: null, // tek seviye undo, kullanıldı
    });
    const updated = db.matchById(id);
    if (updated?.board_id) {
      io.to(`board:${updated.board_id}`).emit('board:state', {
        board: db.boardById(updated.board_id),
        match: updated,
      });
    }
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Doubles: yeni leg başında her takımdan ilk atan oyuncuyu güncelle.
app.post('/api/matches/:id/set-sub-starters', (req, res) => {
  try {
    const id = +req.params.id;
    const m = db.matchById(id);
    if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
    if (m.status !== 'live') return res.status(400).json({ error: 'Maç canlı değil' });
    const patch = {};
    const s1 = req.body?.p1_sub_turn;
    const s2 = req.body?.p2_sub_turn;
    if (s1 === 1 || s1 === 2) patch.p1_sub_turn = s1;
    if (s2 === 1 || s2 === 2) patch.p2_sub_turn = s2;
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'Geçersiz değer' });
    db.updateMatch(id, patch);
    if (m.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: db.matchById(id),
      });
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Sonraki Maç: bitmiş maçı board'dan serbest bırak, scheduler'ı tetikle.
// Tablet endpoint'i — auth gerekmez ama scheduler board'un sahibi için çalışır.
app.post('/api/boards/:id/next', (req, res) => {
  try {
    const boardId = +req.params.id;
    const board = db.boardById(boardId);
    if (!board) return res.status(404).json({ error: 'Board bulunamadı' });
    const mid = board.current_match_id;
    if (mid) {
      const m = db.matchById(mid);
      if (m && m.status === 'finished') {
        db.updateMatch(mid, { board_id: null });
        db.setBoardMatch(boardId, null);
      } else if (m && m.status !== 'finished') {
        return res.status(400).json({ error: 'Maç henüz bitmemiş' });
      }
    }
    // Board'un sahibi için (varsa) scope; yoksa global (legacy)
    scheduler.assignPendingMatches(io, board.user_id || null);
    const refreshed = db.boardById(boardId);
    io.to(`board:${boardId}`).emit('board:state', {
      board: refreshed,
      match: refreshed.current_match_id ? db.matchById(refreshed.current_match_id) : null,
    });
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Maçın yazıcı-hakemini değiştir (organizer override)
app.patch('/api/matches/:id/scorer', (req, res) => {
  try {
    const id = +req.params.id;
    const m = db.matchById(id);
    if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
    const sid = req.body.scorer_entry_id;
    db.updateMatch(id, { scorer_entry_id: sid || null });
    if (m.board_id) {
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: db.boardById(m.board_id),
        match: db.matchById(id),
      });
    }
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/matches/:id/throw', (req, res) => {
  try {
    const { playerSlot, score, finishDarts } = req.body;
    const matchId = +req.params.id;
    const result = engine.recordThrow(matchId, playerSlot, +score, finishDarts ? +finishDarts : null);
    io.emit('match:update', { matchId });
    if (result.matchFinished) {
      const m = db.matchById(matchId);
      if (m && m.team_phase_match_id) {
        // Takım maçı — ayrı işleyici
        onTeamMatchFinished(matchId, m);
      } else {
        tournament.onMatchFinished(matchId);
        const t = m ? db.tournamentById(m.tournament_id) : null;
        if (t && t.status === 'finished') {
          const boards = db.allBoards(t.user_id);
          db.clearUserBoards(t.user_id);
          for (const b of boards) {
            io.to(`board:${b.id}`).emit('board:state', { board: { ...b, current_match_id: null, status: 'idle' }, match: null });
          }
        } else {
          scheduler.assignPendingMatches(io, t?.user_id || null);
        }
      }
      broadcastState();
    } else {
      broadcastState();
    }
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Walkover: rakip gelmedi / çekildi — dart atılmadan kazanan belirlenir
app.post('/api/matches/:id/walkover', (req, res) => {
  try {
    const matchId = +req.params.id;
    const { winnerSlot } = req.body; // 1 | 2
    if (winnerSlot !== 1 && winnerSlot !== 2) return res.status(400).json({ error: 'winnerSlot 1 veya 2 olmalı' });
    const m = db.matchById(matchId);
    if (!m) return res.status(404).json({ error: 'Maç bulunamadı' });
    if (m.status === 'finished') return res.status(400).json({ error: 'Maç zaten bitti' });
    // Walkover olarak bitir
    db.walkoverMatch(matchId, winnerSlot);
    const updated = db.matchById(matchId);
    if (updated && updated.team_phase_match_id) {
      onTeamMatchFinished(matchId, updated);
    } else {
      tournament.onMatchFinished(matchId);
      const t = updated ? db.tournamentById(updated.tournament_id) : null;
      if (t && t.status === 'finished') {
        const boards = db.allBoards(t.user_id);
        db.clearUserBoards(t.user_id);
        for (const b of boards) {
          io.to(`board:${b.id}`).emit('board:state', { board: { ...b, current_match_id: null, status: 'idle' }, match: null });
        }
      } else {
        scheduler.assignPendingMatches(io, t?.user_id || null);
      }
    }
    io.emit('match:update', { matchId });
    broadcastState();
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/matches/:id/undo', (req, res) => {
  try {
    const result = engine.undoLastThrow(+req.params.id);
    broadcastState();
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Reset — yalnızca giriş yapan organizatörün verisini siler (per-user)
app.post('/api/reset', auth.requireAuth, (req, res) => {
  db.resetAll(req.user.id);
  broadcastState();
  res.json({ ok: true });
});

// --- Socket.IO ---
// Express session'ı socket handshake'ine bağla — HTTP ile aynı store kullanılıyor.
io.engine.use((req, res, next) => sessionMiddleware(req, res, next));

io.on('connection', (socket) => {
  const sess = socket.request && socket.request.session;
  const uid = sess && sess.userId ? sess.userId : null;
  socket.data = socket.data || {};
  socket.data.userId = uid;

  socket.emit('state', getSnapshot(uid));

  socket.on('board:subscribe', (boardId) => {
    socket.join(`board:${boardId}`);
    const board = db.boardById(+boardId);
    if (board) socket.emit('board:state', {
      board,
      match: board.current_match_id ? db.matchById(board.current_match_id) : null,
    });
  });
});

// ─── Team Events ────────────────────────────────────────────────────────────

// Tüm takım maçlarını listele
app.get('/api/team-events', auth.requireAuth, (req, res) => {
  const events = db.allTeamEvents(req.session.userId);
  // her event için aşama özetini ekle
  const out = events.map(ev => {
    const phases = db.phasesForEvent(ev.id).map(ph => ({
      ...ph,
      matches: db.matchesForPhase(ph.id),
    }));
    return { ...ev, phases };
  });
  res.json(out);
});

// Yeni takım maçı oluştur
app.post('/api/team-events', auth.requireAuth, (req, res) => {
  const { name, team1_name, team2_name, phases } = req.body;
  if (!name || !team1_name || !team2_name) {
    return res.status(400).json({ error: 'name, team1_name, team2_name zorunlu' });
  }
  const ev = db.createTeamEvent({ user_id: req.session.userId, name, team1_name, team2_name });

  // Varsayılan 3 aşamayı oluştur (disabled=0 ile gelebilir)
  const defaultPhases = phases || [
    { phase_type: 'singles', phase_order: 1, enabled: 1, point_value: 1,
      match_count: 0, legs_to_win: 3, sets_to_win: 1, game_mode: '501' },
    { phase_type: 'beer', phase_order: 2, enabled: 1, point_value: 1,
      match_count: 1, legs_to_win: 1, sets_to_win: 1, game_mode: '1001' },
    { phase_type: 'doubles', phase_order: 3, enabled: 0, point_value: 1,
      match_count: 0, legs_to_win: 3, sets_to_win: 1, game_mode: '501' },
  ];
  for (const ph of defaultPhases) {
    db.createTeamPhase({ ...ph, team_event_id: ev.id, user_id: req.session.userId });
  }

  const full = { ...ev, phases: db.phasesForEvent(ev.id).map(ph => ({ ...ph, matches: [] })) };
  io.emit('team:update', full);
  res.json(full);
});

// Tek takım maçı getir
app.get('/api/team-events/:id', auth.requireAuth, (req, res) => {
  const ev = db.teamEventById(+req.params.id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(404).json({ error: 'bulunamadı' });
  const phases = db.phasesForEvent(ev.id).map(ph => ({ ...ph, matches: db.matchesForPhase(ph.id) }));
  res.json({ ...ev, phases });
});

// Takım maçı güncelle (isim, statü vb.)
app.patch('/api/team-events/:id', auth.requireAuth, (req, res) => {
  const ev = db.teamEventById(+req.params.id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(404).json({ error: 'bulunamadı' });
  db.updateTeamEvent(ev.id, req.body);
  const updated = db.teamEventById(ev.id);
  const phases = db.phasesForEvent(ev.id).map(ph => ({ ...ph, matches: db.matchesForPhase(ph.id) }));
  io.emit('team:update', { ...updated, phases });
  res.json({ ...updated, phases });
});

// Takım maçı sil
app.delete('/api/team-events/:id', auth.requireAuth, (req, res) => {
  const ev = db.teamEventById(+req.params.id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(404).json({ error: 'bulunamadı' });
  db.deleteTeamEvent(ev.id);
  io.emit('team:deleted', { id: ev.id });
  res.json({ ok: true });
});

// Aşama güncelle (etkin/devre dışı, puan değeri, oyun modu vb.)
app.patch('/api/team-phases/:id', auth.requireAuth, (req, res) => {
  const ph = db.teamPhaseById(+req.params.id);
  if (!ph) return res.status(404).json({ error: 'bulunamadı' });
  const ev = db.teamEventById(ph.team_event_id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(403).json({ error: 'yetkisiz' });
  db.updateTeamPhase(ph.id, req.body);
  const updated = db.teamPhaseById(ph.id);
  const phases = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
  io.emit('team:update', { ...ev, phases });
  res.json({ ...ev, phases });
});

// Aşamaya maç ekle
app.post('/api/team-phases/:id/matches', auth.requireAuth, (req, res) => {
  const ph = db.teamPhaseById(+req.params.id);
  if (!ph) return res.status(404).json({ error: 'bulunamadı' });
  const ev = db.teamEventById(ph.team_event_id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(403).json({ error: 'yetkisiz' });

  const existing = db.matchesForPhase(ph.id);
  const nextOrder = existing.length + 1;
  const pm = db.createTeamPhaseMatch({
    ...req.body,
    team_phase_id: ph.id,
    user_id: req.session.userId,
    match_order: nextOrder,
  });
  // match_count güncelle
  db.updateTeamPhase(ph.id, { match_count: nextOrder });

  const phases = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
  io.emit('team:update', { ...ev, phases });
  res.json(pm);
});

// Toplu maç ekleme (liste ile)
app.post('/api/team-phases/:id/matches/bulk', auth.requireAuth, (req, res) => {
  const ph = db.teamPhaseById(+req.params.id);
  if (!ph) return res.status(404).json({ error: 'bulunamadı' });
  const ev = db.teamEventById(ph.team_event_id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(403).json({ error: 'yetkisiz' });

  // Önce mevcut maçları sil, sonra yeniden ekle
  const existing = db.matchesForPhase(ph.id);
  for (const m of existing) db.deleteTeamPhaseMatch(m.id);

  const matchList = req.body.matches || [];
  for (let i = 0; i < matchList.length; i++) {
    db.createTeamPhaseMatch({
      ...matchList[i],
      team_phase_id: ph.id,
      user_id: req.session.userId,
      match_order: i + 1,
    });
  }
  db.updateTeamPhase(ph.id, { match_count: matchList.length });

  const phases = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
  io.emit('team:update', { ...ev, phases });
  res.json({ ok: true, count: matchList.length });
});

// Bireysel maç sonucu güncelle
app.patch('/api/team-phase-matches/:id', auth.requireAuth, (req, res) => {
  const pm = db.teamPhaseMatchById(+req.params.id);
  if (!pm) return res.status(404).json({ error: 'bulunamadı' });
  const ph = db.teamPhaseById(pm.team_phase_id);
  const ev = db.teamEventById(ph.team_event_id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(403).json({ error: 'yetkisiz' });

  db.updateTeamPhaseMatch(pm.id, req.body);

  // Sonuç girildiyse maç biter
  if (req.body.winner_slot !== undefined) {
    const status = req.body.winner_slot ? 'finished' : 'pending';
    db.updateTeamPhaseMatch(pm.id, { status });
  }

  // Takım puanlarını yeniden hesapla
  db.recalcTeamScores(ev.id);
  const updatedEv = db.teamEventById(ev.id);
  const phases = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
  io.emit('team:update', { ...updatedEv, phases });
  res.json({ ok: true });
});

// Bireysel maç sil
app.delete('/api/team-phase-matches/:id', auth.requireAuth, (req, res) => {
  const pm = db.teamPhaseMatchById(+req.params.id);
  if (!pm) return res.status(404).json({ error: 'bulunamadı' });
  const ph = db.teamPhaseById(pm.team_phase_id);
  const ev = db.teamEventById(ph.team_event_id);
  if (!ev || ev.user_id !== req.session.userId) return res.status(403).json({ error: 'yetkisiz' });
  db.deleteTeamPhaseMatch(pm.id);
  db.recalcTeamScores(ev.id);
  const updatedEv = db.teamEventById(ev.id);
  const phases = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
  io.emit('team:update', { ...updatedEv, phases });
  res.json({ ok: true });
});

// ── Takım maçını board'a gönder ───────────────────────────────────────────────
app.post('/api/team-phase-matches/:id/send-to-board', auth.requireAuth, (req, res) => {
  try {
    const userId = req.session.userId;
    const pm = db.teamPhaseMatchById(+req.params.id);
    if (!pm) return res.status(404).json({ error: 'Maç bulunamadı' });
    const ph = db.teamPhaseById(pm.team_phase_id);
    const ev = db.teamEventById(ph?.team_event_id);
    if (!ev || ev.user_id !== userId) return res.status(403).json({ error: 'Yetkisiz' });
    if (pm.status === 'finished') return res.status(400).json({ error: 'Maç zaten bitti' });

    const { boardId } = req.body;
    const board = boardId ? db.boardById(+boardId) : null;
    if (boardId && !board) return res.status(404).json({ error: 'Board bulunamadı' });

    const gameMode = ph.game_mode || '501';
    const legsToWin = ph.legs_to_win || 3;

    // Havuz turnuvası / stage
    const { tournamentId, stageId } = db.getOrCreateTeamPool(userId, gameMode);

    // Oyuncuları bul/oluştur
    const p1Id = db.getOrCreatePlayerByName(userId, pm.team1_player);
    const p2Id = db.getOrCreatePlayerByName(userId, pm.team2_player);
    if (!p1Id || !p2Id) return res.status(400).json({ error: 'Geçerli oyuncu adları gerekli' });

    // Entry slot
    const nextSlot = (db.db.prepare(
      'SELECT COALESCE(MAX(slot),0) FROM entries WHERE tournament_id = ?'
    ).pluck().get(tournamentId) || 0) + 1;
    const e1 = db.addEntry(tournamentId, nextSlot,     p1Id);
    const e2 = db.addEntry(tournamentId, nextSlot + 1, p2Id);

    // Start score (cricket için null)
    const startScores = { '501': 501, '701': 701, '1001': 1001 };
    const startScore  = startScores[gameMode] || null;

    // Maç oluştur
    const match = db.createMatch({
      tournament_id: tournamentId,
      stage_id:      stageId,
      bracket:       'team',
      round:         0,
      match_index:   0,
      entry1_id:     e1.id,
      entry2_id:     e2.id,
      status:        board ? 'ready' : 'pending',
      legs_to_win:   legsToWin,
      start_score:   startScore,
    });
    // team_phase_match ile ilişkilendir
    db.updateMatch(match.id, { team_phase_match_id: pm.id });

    // Board'a ata (varsa)
    if (board) {
      db.updateMatch(match.id, { board_id: board.id });
      db.setBoardMatch(board.id, match.id);
      io.to(`board:${board.id}`).emit('board:state', {
        board: db.boardById(board.id),
        match: db.matchById(match.id),
      });
    }

    // Team phase match güncelle
    db.updateTeamPhaseMatch(pm.id, { match_id: match.id, status: board ? 'live' : 'pending' });

    // Team event emit
    const updatedEv = db.teamEventById(ev.id);
    const phases    = db.phasesForEvent(ev.id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
    io.emit('team:update', { ...updatedEv, phases });

    res.json({ matchId: match.id, boardUrl: board ? `/board.html?id=${board.id}` : null });
  } catch (e) {
    console.error('send-to-board hatası:', e);
    res.status(500).json({ error: e.message });
  }
});

// Takım maçı bitiş işleyici (internal)
function onTeamMatchFinished(matchId, m) {
  try {
    const tpm = db.teamPhaseMatchByMatchId(matchId);
    if (!tpm) return;
    const winnerSlot = m.winner_entry_id === m.entry1_id ? 1 : 2;
    db.updateTeamPhaseMatch(tpm.id, {
      winner_slot: winnerSlot,
      team1_legs:  m.p1_legs || 0,
      team2_legs:  m.p2_legs || 0,
      status:      'finished',
    });
    db.recalcTeamScores(tpm.event_id);
    // Board serbest bırak
    if (m.board_id) {
      db.setBoardMatch(m.board_id, null);
      io.to(`board:${m.board_id}`).emit('board:state', {
        board: { ...db.boardById(m.board_id), current_match_id: null, status: 'idle' },
        match: null,
      });
      scheduler.assignPendingMatches(io, tpm.team_user_id || null);
    }
    // Team update emit
    const teamEv = db.teamEventById(tpm.event_id);
    const phases  = db.phasesForEvent(tpm.event_id).map(p => ({ ...p, matches: db.matchesForPhase(p.id) }));
    io.emit('team:update', { ...teamEv, phases });
  } catch (e) {
    console.error('onTeamMatchFinished hatası:', e);
  }
}

// --- Start ---
const PORT = process.env.PORT || 3000;
db.init();

// Açılış özet log'u — her deploy sonrası DB sağlam mı görmek için.
// Eğer kullanıcı sayısı sıfıra düşerse (önceki deploy'da > 0 idi), kalıcı disk
// devre dışı kalmış demektir. Logları izleyerek erken yakalanır.
try {
  const userCount  = db.db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  const tourCount  = db.db.prepare('SELECT COUNT(*) AS n FROM tournaments').get().n;
  const playerCount = db.db.prepare('SELECT COUNT(*) AS n FROM players').get().n;
  console.log(`[db] Snapshot — users: ${userCount}, tournaments: ${tourCount}, players: ${playerCount}`);
} catch (e) {
  console.error('[db] Snapshot log hatası:', e.message);
}

scheduler.init(io);

function getLanAddresses() {
  const os = require('os');
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const ni of ifs[name] || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push({ iface: name, addr: ni.address });
    }
  }
  return out;
}

server.listen(PORT, '0.0.0.0', () => {
  const lan = getLanAddresses();
  console.log(`\n🎯 Dart Tournament sunucusu çalışıyor`);
  console.log(`   Yerel:        http://localhost:${PORT}`);
  console.log(`   Organizatör:  http://localhost:${PORT}/organizer.html`);
  console.log(`   Board:        http://localhost:${PORT}/board.html`);
  console.log(`   İzleyici:     http://localhost:${PORT}/viewer.html`);
  console.log(`   TV modu:      http://localhost:${PORT}/tv.html`);
  if (lan.length) {
    console.log(`\n📱 Tabletlerden bağlanmak için (aynı Wi-Fi'da olmalı):`);
    for (const { iface, addr } of lan) {
      console.log(`   ${iface.padEnd(12)} http://${addr}:${PORT}`);
    }
    console.log(`   Tablet → Board:  http://${lan[0].addr}:${PORT}/board.html`);
    console.log(`   TV/salon ekranı: http://${lan[0].addr}:${PORT}/tv.html`);
  } else {
    console.log(`\n⚠️  Aktif LAN arayüzü bulunamadı — kabloya/Wi-Fi'a bağlı mısın?`);
  }
  console.log('');
});
