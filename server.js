// Dart Tournament Server - Express + Socket.IO + SQLite
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

app.use(express.json());

// Session — multi-organizer için kimlik izolasyonu
// SQLite tabanlı session store: server yeniden başlayınca oturumlar kaybolmaz
const SQLiteStore = require('connect-sqlite3')(session);
const DB_PATH_FOR_SESSION = process.env.DB_PATH || path.join(__dirname, 'data.db');
const SESSION_SECRET = process.env.SESSION_SECRET
  || 'dev-secret-please-set-SESSION_SECRET-in-prod';
app.use(session({
  store: new SQLiteStore({
    db: path.basename(DB_PATH_FOR_SESSION),
    dir: path.dirname(DB_PATH_FOR_SESSION),
    concurrentDB: true,
  }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 30, // 30 gün
  },
}));
app.use(auth.optionalAuth);

app.use(express.static(path.join(__dirname, 'public')));

// --- Auth routes ---
app.post('/auth/register', auth.registerHandler);
app.post('/auth/login', auth.loginHandler);
app.post('/auth/logout', auth.logoutHandler);
app.get('/auth/me', auth.meHandler);

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
  const p = db.createPlayer(name.trim(), nickname?.trim() || null, req.user.id);
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
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Board ismi gerekli' });
  const b = db.createBoard(name.trim(), req.user.id);
  broadcastState();
  res.json(b);
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
      tournament.onMatchFinished(matchId);
      // Maçın sahibi olan kullanıcı için scheduler çalıştır
      const m = db.matchById(matchId);
      const t = m ? db.tournamentById(m.tournament_id) : null;
      // Turnuva bittiyse board'ları serbest bırak ve tabletlere bildir
      if (t && t.status === 'finished') {
        const boards = db.allBoards(t.user_id);
        db.clearUserBoards(t.user_id);
        for (const b of boards) {
          io.to(`board:${b.id}`).emit('board:state', { board: { ...b, current_match_id: null, status: 'idle' }, match: null });
        }
      } else {
        scheduler.assignPendingMatches(io, t?.user_id || null);
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
// Express session'ı socket handshake'ine bağla — her socket kendi userId'sini bilsin.
const sessionMiddleware = session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
});
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

// --- Start ---
const PORT = process.env.PORT || 3000;
db.init();
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
