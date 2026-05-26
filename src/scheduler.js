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
  const allIdleBoards = db.allBoards(userId).filter(b => b.status === 'idle' || !b.current_match_id);
  if (allIdleBoards.length === 0) return;

  // Halihazırda aktif (ready/live) olan oyuncuları ve scorer'ları meşgul say
  const busy = new Set();
  for (const m of db.activeMatches(userId)) {
    if (m.entry1_id) busy.add(m.entry1_id);
    if (m.entry2_id) busy.add(m.entry2_id);
    if (m.scorer_entry_id) busy.add(m.scorer_entry_id);
  }

  // AŞAMA 1: maçları board'lara ata
  // KURAL (Mayıs 2026 sonrası): Bir maç YALNIZCA kendi turnuvasına atanmış
  // board'lara gider. Atanmamış (tournament_id=NULL) board'lar pasif kalır;
  // hiçbir maç almaz. Tek board, birden fazla turnuva arasında paylaşılmaz.
  //
  // Eski "Genel" (tournament_id=NULL) fallback davranışı kaldırıldı — federasyon
  // (çok-turnuvalı) senaryoda yanlış turnuvanın maçının yanlış tablete düşmesine
  // sebep oluyordu. Tek-turnuvalı kullanım için: organizer'da board'u o turnuvaya
  // atamak yeterli.
  const readyMatches = db.pendingReadyMatches(userId).filter(m => !m.board_id);
  const newlyAssigned = [];
  const usedBoards = new Set();
  for (const match of readyMatches) {
    if ((match.entry1_id && busy.has(match.entry1_id)) ||
        (match.entry2_id && busy.has(match.entry2_id))) continue;

    // Yalnızca bu turnuvaya atanmış boş board'lar uygundur
    const board = allIdleBoards.find(b =>
      !usedBoards.has(b.id) && b.tournament_id === match.tournament_id
    );
    if (!board) continue; // bu turnuva için atanmış boş board yok

    usedBoards.add(board.id);
    db.updateMatch(match.id, { board_id: board.id });
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
