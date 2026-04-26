// Maç motoru - skor girişi, leg/set takibi, bitiş tespiti
const db = require('./db');

const START_SCORES = { '501': 501, '701': 701, '1001': 1001 };

// Kullanıcı bir el (3 dart toplamı) girdiğinde çağrılır.
// finishDarts: leg'i bitiren visit'te kaç ok atıldığı (1, 2 veya 3) — sadece checkout'ta anlamlı.
// Sağlanmazsa varsayılan 3 (eski davranış). 3-ok ortalaması ve leg-başına-dart hesabı buna göre düzelir.
function recordThrow(matchId, playerSlot, score, finishDarts) {
  const match = db.matchById(matchId);
  if (!match) throw new Error('Maç bulunamadı');
  if (match.status !== 'live') throw new Error('Maç başlamadı. Önce "MAÇA BAŞLA" deyin.');
  if (playerSlot !== match.current_turn) throw new Error('Sıra diğer oyuncuda');
  if (score < 0 || score > 180) throw new Error('Skor 0-180 aralığında olmalı');

  const tournament = db.tournamentById(match.tournament_id);
  const mode = tournament.game_mode;

  if (mode === 'cricket') return recordCricketThrow(match, playerSlot, score, tournament);

  // X01 modes
  const startScore = START_SCORES[mode];
  if (!startScore) throw new Error('Bilinmeyen oyun modu');

  const remCol = playerSlot === 1 ? 'p1_leg_score' : 'p2_leg_score';
  const currentRem = match[remCol] ?? startScore;
  const newRem = currentRem - score;

  let bust = false;
  let isFinish = false;

  if (newRem < 0 || newRem === 1) {
    // Bust: over zero or leaves 1 (cannot finish on double)
    bust = true;
  } else if (newRem === 0) {
    // Must check out on a double - we trust user reporting (can't verify from total only)
    isFinish = true;
  }

  const remainingAfter = bust ? currentRem : newRem;

  // Bu visit'te kaç ok atıldı? Bitirmeyen visit'lerde her zaman 3.
  // Bitiren visit'te kullanıcı 1, 2 veya 3 belirtebilir; geçersizse 3'e düşeriz.
  let dartsUsed = 3;
  if (isFinish) {
    const fd = +finishDarts;
    if (fd === 1 || fd === 2 || fd === 3) dartsUsed = fd;
  }

  // Save throw (darts_used kolonuyla)
  db.addThrow({
    match_id: matchId,
    leg_index: match.current_leg,
    set_index: match.current_set,
    player_slot: playerSlot,
    score: bust ? 0 : score,
    remaining_after: remainingAfter,
    bust,
    is_finish: isFinish,
    darts_used: dartsUsed,
  });

  // Stats
  const scoreValue = bust ? 0 : score;
  const stats = {
    total_score: scoreValue,
    darts_thrown: dartsUsed,
    turns: 1,
    tons: scoreValue >= 100 && scoreValue < 140 ? 1 : 0,
    ton_plus: scoreValue >= 140 && scoreValue < 180 ? 1 : 0,
    one_eighty: scoreValue === 180 ? 1 : 0,
    high_outs: 0,
  };
  if (isFinish) {
    stats.best_checkout = score;
    if (score >= 100) stats.high_outs = 1;
    // Bu leg içinde bu oyuncu kaç dart attı?
    // Önceki tüm visit'leri tam 3 olarak topla, son (az önce eklenen) visit için dartsUsed kullan.
    const legThrows = db.throwsForMatch(matchId).filter(t =>
      t.leg_index === match.current_leg && t.set_index === match.current_set && t.player_slot === playerSlot);
    const priorVisits = Math.max(0, legThrows.length - 1);
    const dartsThisLeg = priorVisits * 3 + dartsUsed;
    stats.darts_in_finished_legs = dartsThisLeg;
  }
  db.updateStats(matchId, playerSlot, stats);

  // Update remaining
  db.updateMatch(matchId, { [remCol]: remainingAfter });

  const result = { matchFinished: false, legFinished: false, setFinished: false, bust, isFinish };

  if (isFinish) {
    result.legFinished = true;
    // Leg özeti — finishLeg'den önce hesapla (throws kayıtları değişmez ama kavramsal olarak temiz)
    result.legSummary = computeLegSummary(matchId, match.current_leg, match.current_set, playerSlot);
    finishLeg(matchId, playerSlot);
    const updatedMatch = db.matchById(matchId);
    if (updatedMatch.status === 'finished') {
      result.matchFinished = true;
    } else {
      // Yeni leg başladı — bilgilendirme için leg/set sayaçlarını döndür
      result.legSummary.next_leg = updatedMatch.current_leg;
      result.legSummary.next_set = updatedMatch.current_set;
      result.legSummary.p1_legs = updatedMatch.p1_legs;
      result.legSummary.p2_legs = updatedMatch.p2_legs;
      result.legSummary.p1_sets = updatedMatch.p1_sets;
      result.legSummary.p2_sets = updatedMatch.p2_sets;
    }
  } else {
    // Switch turn
    const nextTurn = playerSlot === 1 ? 2 : 1;
    db.updateMatch(matchId, { current_turn: nextTurn });
  }

  return result;
}

// Bitirilen leg için her iki oyuncunun toplam puanı, attıkları dart, leg ortalaması.
// finishLeg throws kayıtlarına dokunmaz; leg_index ve set_index'e göre filtreliyoruz.
function computeLegSummary(matchId, legIndex, setIndex, winnerSlot) {
  const all = db.throwsForMatch(matchId).filter(t =>
    t.leg_index === legIndex && t.set_index === setIndex);
  const agg = { 1: { total: 0, darts: 0, visits: 0, hi180: 0, hi140: 0, hi100: 0 },
                2: { total: 0, darts: 0, visits: 0, hi180: 0, hi140: 0, hi100: 0 } };
  for (const t of all) {
    const s = agg[t.player_slot]; if (!s) continue;
    s.total += t.score || 0;
    s.darts += (t.darts_used || 3);
    s.visits += 1;
    if (t.score === 180) s.hi180 += 1;
    else if (t.score >= 140) s.hi140 += 1;
    else if (t.score >= 100) s.hi100 += 1;
  }
  const finishThrow = all.find(t => t.is_finish && t.player_slot === winnerSlot);
  return {
    leg_index: legIndex,
    set_index: setIndex,
    winner_slot: winnerSlot,
    checkout: finishThrow ? finishThrow.score : null,
    p1: { ...agg[1], avg: agg[1].darts ? +((agg[1].total / agg[1].darts) * 3).toFixed(2) : 0 },
    p2: { ...agg[2], avg: agg[2].darts ? +((agg[2].total / agg[2].darts) * 3).toFixed(2) : 0 },
  };
}

function finishLeg(matchId, winnerSlot) {
  const match = db.matchById(matchId);
  const tournament = db.tournamentById(match.tournament_id);
  const legsCol = winnerSlot === 1 ? 'p1_legs' : 'p2_legs';
  const newLegs = (match[legsCol] || 0) + 1;
  const update = { [legsCol]: newLegs };

  db.updateStats(matchId, winnerSlot, { legs_won: 1 });

  // Reset remaining scores for next leg
  const startScore = START_SCORES[tournament.game_mode];

  // Maç-seviyesinde override varsa onu kullan (round başına farklı best-of için);
  // yoksa turnuvanın varsayılanına düş.
  const legsToWinSet = match.legs_to_win || tournament.legs_to_win; // per set
  const setsToWin = match.sets_to_win || tournament.sets_to_win || 1;

  let setWon = false;
  let matchWon = false;

  if (setsToWin > 1) {
    if (newLegs >= legsToWinSet) {
      // set won
      setWon = true;
      const setsCol = winnerSlot === 1 ? 'p1_sets' : 'p2_sets';
      const newSets = (match[setsCol] || 0) + 1;
      update[setsCol] = newSets;
      update.p1_legs = 0;
      update.p2_legs = 0;
      update.current_set = (match.current_set || 1) + 1;
      db.updateStats(matchId, winnerSlot, { sets_won: 1 });
      if (newSets >= setsToWin) matchWon = true;
    }
  } else {
    // legs-only mode
    if (newLegs >= legsToWinSet) matchWon = true;
  }

  if (matchWon) {
    update.status = 'finished';
    update.winner_entry_id = winnerSlot === 1 ? match.entry1_id : match.entry2_id;
    update.finished_at = new Date().toISOString();
    db.updateMatch(matchId, update);
    // NOT: Board hâlâ bu maça bağlı kalır (post-match bilgi ekranı için).
    // Organizer/scorer "Sonraki Maç" butonuna bastığında serbest bırakılacak.
    return;
  }

  // Next leg starts: starter alternates
  const newStarter = match.starter_slot === 1 ? 2 : 1;
  update.current_leg = (match.current_leg || 1) + 1;
  update.starter_slot = newStarter;
  update.current_turn = newStarter;
  update.p1_leg_score = startScore;
  update.p2_leg_score = startScore;

  db.updateMatch(matchId, update);
}

function recordCricketThrow(match, playerSlot, score, tournament) {
  // For cricket, score input represents points scored this turn (positive integer)
  // Simplified: we just add points, first to reach target wins (configurable), or we use turns-based
  // To keep it simple but functional: Cricket mode uses score as a running point total.
  // A proper cricket needs per-number marks - out of scope for MVP.
  // We'll store score as "points" and end leg when a player reaches config target (default 500).
  const remCol = playerSlot === 1 ? 'p1_leg_score' : 'p2_leg_score';
  const currentPoints = match[remCol] ?? 0;
  const newPoints = currentPoints + score;
  const target = 500;

  db.addThrow({
    match_id: match.id,
    leg_index: match.current_leg,
    set_index: match.current_set,
    player_slot: playerSlot,
    score,
    remaining_after: newPoints,
    bust: 0,
    is_finish: newPoints >= target ? 1 : 0,
  });
  db.updateStats(match.id, playerSlot, {
    total_score: score,
    darts_thrown: 3,
    turns: 1,
  });
  db.updateMatch(match.id, { [remCol]: newPoints });

  const result = { matchFinished: false, legFinished: false, bust: false, isFinish: false };
  if (newPoints >= target) {
    result.legFinished = true;
    result.isFinish = true;
    finishLeg(match.id, playerSlot);
    const updated = db.matchById(match.id);
    if (updated.status === 'finished') result.matchFinished = true;
  } else {
    db.updateMatch(match.id, { current_turn: playerSlot === 1 ? 2 : 1 });
  }
  return result;
}

function undoLastThrow(matchId) {
  const last = db.lastThrow(matchId);
  if (!last) throw new Error('Geri alınacak atış yok');
  const match = db.matchById(matchId);
  const tournament = db.tournamentById(match.tournament_id);
  const startScore = START_SCORES[tournament.game_mode];

  // Simple undo: delete throw, restore remaining, swap turn back, adjust stats approximately.
  // Note: does not unwind leg/set transitions - keep usage to "last throw in current leg".
  db.deleteThrow(last.id);

  // Recompute remaining from scratch for the leg
  const throwsLeft = db.throwsForMatch(matchId).filter(t =>
    t.leg_index === match.current_leg && t.set_index === match.current_set);
  const bySlot = { 1: 0, 2: 0 };
  for (const t of throwsLeft) bySlot[t.player_slot] += t.score;

  if (tournament.game_mode !== 'cricket') {
    db.updateMatch(matchId, {
      p1_leg_score: startScore - bySlot[1],
      p2_leg_score: startScore - bySlot[2],
      current_turn: last.player_slot,
    });
  } else {
    db.updateMatch(matchId, {
      p1_leg_score: bySlot[1],
      p2_leg_score: bySlot[2],
      current_turn: last.player_slot,
    });
  }

  // Roll back stats (yaklaşık) — silinen visit'in dart'ı kadar geri al.
  // Eski kayıtlarda darts_used null olabilir; bu durumda 3 varsay.
  const removedDarts = last.darts_used || 3;
  const statDelta = {
    total_score: -last.score,
    darts_thrown: -removedDarts,
    turns: -1,
  };
  db.updateStats(matchId, last.player_slot, statDelta);

  return { ok: true };
}

function average(stats) {
  if (!stats || !stats.darts_thrown) return 0;
  return (stats.total_score / stats.darts_thrown) * 3;
}

module.exports = { recordThrow, undoLastThrow, average };
