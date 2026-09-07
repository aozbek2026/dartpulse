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
  const allBoardsList = db.allBoards(userId);
  const idleBoards = allBoardsList.filter(b => b.status === 'idle' || !b.current_match_id);
  if (idleBoards.length === 0) return;

  // Halihazırda aktif (ready/live) olan oyuncuları ve scorer'ları meşgul say
  const busy = new Set();
  for (const m of db.activeMatches(userId)) {
    if (m.entry1_id) busy.add(m.entry1_id);
    if (m.entry2_id) busy.add(m.entry2_id);
    if (m.scorer_entry_id) busy.add(m.scorer_entry_id);
  }

  // Turnuva başına board listesi (id sırasıyla) — grup→board sabit eşleme için.
  const boardsByTour = {};
  for (const b of allBoardsList) {
    if (b.tournament_id) (boardsByTour[b.tournament_id] = boardsByTour[b.tournament_id] || []).push(b);
  }
  for (const k of Object.keys(boardsByTour)) boardsByTour[k].sort((a, b) => a.id - b.id);

  // RR aşama seçenekleri (pin_groups / winner_scores) — stage config_json'dan, cache'li.
  const stageCfgCache = {};
  function cfgFor(m) {
    if (m.bracket !== 'rr') return { pin: false, winner: false };
    if (stageCfgCache[m.stage_id] !== undefined) return stageCfgCache[m.stage_id];
    let c = { pin: false, winner: false };
    try {
      const st = db.stageById(m.stage_id);
      const j = st && st.config_json ? JSON.parse(st.config_json) : {};
      c = { pin: !!j.pin_groups, winner: !!j.winner_scores };
    } catch (_) {}
    stageCfgCache[m.stage_id] = c;
    return c;
  }

  // Grup→board sabit eşlemede sıralılık: bir board index'i için "aktif grup" =
  // o index'e düşen (g % N === idx) ve HENÜZ bitmemiş maçı olan en küçük grup.
  const activeGroupCache = {};
  function activeGroupForBoardIndex(tid, idx) {
    if (!activeGroupCache[tid]) {
      const boards = boardsByTour[tid] || [];
      const N = boards.length;
      const map = {};
      if (N > 0) {
        const rrAll = db.matchesForTournament(tid).filter(m => m.bracket === 'rr');
        const unfinished = {};
        const groupsSet = new Set();
        for (const m of rrAll) {
          const g = m.group_index == null ? 0 : m.group_index;
          groupsSet.add(g);
          if (m.status !== 'finished') unfinished[g] = true;
        }
        const groups = [...groupsSet].sort((a, b) => a - b);
        for (let i = 0; i < N; i++) {
          map[i] = null;
          for (const g of groups) { if (g % N === i && unfinished[g]) { map[i] = g; break; } }
        }
      }
      activeGroupCache[tid] = map;
    }
    return activeGroupCache[tid][idx];
  }

  // AŞAMA 1: maçları board'lara ata. Bir maç YALNIZCA kendi turnuvasına atanmış
  // board'lara gider (federasyon izolasyonu). pin_groups açıksa RR maçı grup→board
  // sabit eşlemeyle o board'a gider (g % N); kapalıysa boş board havuzuna dağıtılır.
  const readyMatches = db.pendingReadyMatches(userId).filter(m => !m.board_id);
  const newlyAssigned = [];
  const usedBoards = new Set();
  for (const match of readyMatches) {
    if ((match.entry1_id && busy.has(match.entry1_id)) ||
        (match.entry2_id && busy.has(match.entry2_id))) continue;

    const cfg = cfgFor(match);
    let board = null;
    if (cfg.pin) {
      const boards = boardsByTour[match.tournament_id] || [];
      const N = boards.length;
      if (N === 0) continue;
      const g = match.group_index == null ? 0 : match.group_index;
      const idx = g % N;
      // Sıralılık: bu board index'i şu an bu gruba mı bakıyor?
      if (activeGroupForBoardIndex(match.tournament_id, idx) !== g) continue;
      const target = boards[idx];
      if (usedBoards.has(target.id)) continue;
      if (!(target.status === 'idle' || !target.current_match_id)) continue;
      board = target;
    } else {
      board = idleBoards.find(b => !usedBoards.has(b.id) && b.tournament_id === match.tournament_id);
    }
    if (!board) continue;

    usedBoards.add(board.id);
    db.updateMatch(match.id, { board_id: board.id });
    db.setBoardMatch(board.id, match.id);
    if (match.entry1_id) busy.add(match.entry1_id);
    if (match.entry2_id) busy.add(match.entry2_id);
    newlyAssigned.push({ match, board, cfg });
  }

  // AŞAMA 2: yeni atanan maçlara scorer ata.
  // winner_scores açıksa: bu board'da son biten maçın galibi (board.last_winner_entry_id)
  // uygunsa (maçta oynamıyor + boşta) scorer olur. Değilse normal pickScorerEntry.
  for (const { match, board, cfg } of newlyAssigned) {
    if (!match.scorer_entry_id) {
      let scorer = null;
      if (cfg.winner && board.last_winner_entry_id) {
        const w = board.last_winner_entry_id;
        if (w !== match.entry1_id && w !== match.entry2_id && !busy.has(w)) scorer = { id: w };
      }
      if (!scorer) scorer = tournament.pickScorerEntry(match.tournament_id, match.id);
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
