// Otomatik board atama servisi
const db = require('./db');
const tournament = require('./tournament');

let ioRef = null;

function init(io) {
  ioRef = io;
}

// Tek kullanıcı için board atama. userId null ise tüm kullanıcılar için döner.
// Kısıt: bir oyuncu aynı anda YA MAÇ oynar YA da yazıcı-hakemlik yapar.
// Multi-organizer izolasyonu: bir kullanıcının maçı SADECE kendi board'larına
// atanır; başka kullanıcının board'ları görünmez.
function assignPendingMatches(io = ioRef, userId = null) {
  if (userId == null) {
    // Tüm kullanıcılar için tek tek çalıştır + legacy (user_id NULL) veriler
    const userIds = db.db.prepare(
      "SELECT DISTINCT user_id FROM tournaments"
    ).all().map(r => r.user_id);
    for (const uid of userIds) {
      assignForUser(io, uid);
    }
    return;
  }
  assignForUser(io, userId);
}

function assignForUser(io, userId) {
  const boards = db.allBoards(userId).filter(b => b.status === 'idle' || !b.current_match_id);
  if (boards.length === 0) return;

  // Halihazırda aktif (ready/live) olan oyuncuları ve scorer'ları meşgul say
  const busy = new Set();
  for (const m of db.activeMatches(userId)) {
    if (m.entry1_id) busy.add(m.entry1_id);
    if (m.entry2_id) busy.add(m.entry2_id);
    if (m.scorer_entry_id) busy.add(m.scorer_entry_id);
  }

  // AŞAMA 1: maçları board'lara ata (sadece oyuncu çakışması kontrolü)
  const readyMatches = db.pendingReadyMatches(userId).filter(m => !m.board_id);
  const newlyAssigned = [];
  let boardIx = 0;
  for (const match of readyMatches) {
    if (boardIx >= boards.length) break;
    if ((match.entry1_id && busy.has(match.entry1_id)) ||
        (match.entry2_id && busy.has(match.entry2_id))) continue;

    const board = boards[boardIx++];
    const patch = { board_id: board.id };
    db.updateMatch(match.id, patch);
    db.setBoardMatch(board.id, match.id);
    if (match.entry1_id) busy.add(match.entry1_id);
    if (match.entry2_id) busy.add(match.entry2_id);
    newlyAssigned.push({ match, board });
  }

  // AŞAMA 2: yeni atanan maçlara scorer ata (boşta kalan entry'lerden)
  // Scorer opsiyonel — bulunamazsa maç scorer'sız oynar.
  for (const { match, board } of newlyAssigned) {
    if (!match.scorer_entry_id) {
      const scorer = tournament.pickScorerEntry(match.tournament_id, match.id);
      if (scorer) {
        db.updateMatch(match.id, { scorer_entry_id: scorer.id });
        busy.add(scorer.id);
      }
    }
    if (io) {
      io.to(`board:${board.id}`).emit('board:state', {
        board: db.boardById(board.id),
        match: db.matchById(match.id),
      });
      io.emit('match:assigned', { matchId: match.id, boardId: board.id });
    }
  }
}

module.exports = { init, assignPendingMatches };
