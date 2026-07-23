// Maç motoru - skor girişi, leg/set takibi, bitiş tespiti
const db = require('./db');

const START_SCORES = { '501': 501, '701': 701, '1001': 1001 };

// ---- Cricket sabitleri ----
const CRICKET_NUMBERS = [20, 19, 18, 17, 16, 15, 25];
function initCricketState() {
  const marks = {};
  for (const n of CRICKET_NUMBERS) marks[n] = { p1: 0, p2: 0 };
  return { marks, p1_score: 0, p2_score: 0 };
}
function parseCricketState(json) {
  try { return json ? JSON.parse(json) : null; } catch { return null; }
}

// ---- Cricket Full Board Cezalı sabitleri ----
// Hedefler: sayılar (10-20 + 25/Bull) + DOUBLE + TRIPLE + HOUSE
// includeLow: 10 ve 11 dahil mi
const FB_NUMBERS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 25]; // 25 = Bull
const FB_NUMBERS_LOW = [11, 10];                               // opsiyonel
const FB_SPECIALS = ['D', 'T', 'H'];                           // Double, Triple, House

function fbTargets(includeLow) {
  const nums = includeLow ? [...FB_NUMBERS, ...FB_NUMBERS_LOW] : [...FB_NUMBERS];
  return [...nums, ...FB_SPECIALS];
}

function initFBCezaliState(includeLow) {
  const marks = {};
  for (const t of fbTargets(includeLow)) marks[String(t)] = { p1: 0, p2: 0 };
  return { marks, p1_score: 0, p2_score: 0, include_low: !!includeLow };
}

// allocation: { marks: { '20': 2, 'D': 1, ... }, score: 40 }
// Auto-score: kapanma sonrası fazla mark'lar (rakip açıksa) puana otomatik döner
// (klasik cricket gibi). Sayı hedefleri için target değeri = sayının kendisi.
// Meta hedefler (D, T, H) puan üretmez. score alanı manual override için durur.
function fbTargetValue(key) {
  const n = parseInt(key);
  return isNaN(n) ? null : n;  // 10-20 ve 25 (Bull) → numerik, D/T/H → null
}

function recordFBCezaliVisit(matchId, playerSlot, allocation) {
  const match = db.matchById(matchId);
  if (!match) throw new Error('Maç bulunamadı');
  if (match.status !== 'live') throw new Error('Maç başlamadı');
  if (playerSlot !== match.current_turn) throw new Error('Sıra diğer oyuncuda');

  const pKey = `p${playerSlot}`;
  const oppKey = playerSlot === 1 ? 'p2' : 'p1';

  let state = parseCricketState(match.cricket_state_json) || initFBCezaliState(false);
  const targets = fbTargets(state.include_low);

  // Mark ekle + auto-score (kapanma sonrası fazla mark'lar puana döner)
  const marksAlloc = allocation.marks || {};
  let autoScored = 0;
  for (const [target, count] of Object.entries(marksAlloc)) {
    if (!targets.map(String).includes(String(target))) continue;
    const key = String(target);
    if (!state.marks[key]) state.marks[key] = { p1: 0, p2: 0 };
    const current  = state.marks[key][pKey] || 0;
    const oppMarks = state.marks[key][oppKey] || 0;
    const addMarks = count || 0;
    const newMarks = current + addMarks;
    state.marks[key][pKey] = Math.min(3, newMarks);

    // Fazla mark (rakip açıksa) puana döner
    if (oppMarks < 3 && newMarks > 3) {
      const tval = fbTargetValue(key);
      if (tval !== null) {
        const extraMarks = newMarks - Math.max(3, current);
        autoScored += extraMarks * tval;
      }
    }
  }
  if (autoScored > 0) {
    state[`${pKey}_score`] = (state[`${pKey}_score`] || 0) + autoScored;
  }

  // Manual puan override (nadir kullanım — yeni UI'da kapalı)
  const addScore = Math.max(0, +(allocation.score) || 0);
  if (addScore > 0) {
    state[`${pKey}_score`] = (state[`${pKey}_score`] || 0) + addScore;
  }

  // Kazanma: tüm hedefler kapalı (>= 3 mark) VE skor >= rakip
  const allClosed = targets.every(t => (state.marks[String(t)]?.[pKey] || 0) >= 3);
  const myScore   = state[`${pKey}_score`] || 0;
  const oppScore  = state[`${oppKey}_score`] || 0;
  const won = allClosed && myScore >= oppScore;

  db.updateMatch(matchId, { cricket_state_json: JSON.stringify(state) });

  const result = { matchFinished: false, legFinished: false };

  if (won) {
    result.legFinished = true;
    result.legSummary = {
      winner_slot: playerSlot,
      is_cricket: true,
      p1: { total: state.p1_score, avg: 0 },
      p2: { total: state.p2_score, avg: 0 },
      checkout: null,
    };
    finishLeg(matchId, playerSlot);
    const updated = db.matchById(matchId);
    if (updated.status === 'finished') {
      result.matchFinished = true;
    } else {
      // Yeni leg: state sıfırla (include_low koruyarak)
      db.updateMatch(matchId, {
        cricket_state_json: JSON.stringify(initFBCezaliState(state.include_low)),
      });
      result.legSummary.next_leg   = updated.current_leg;
      result.legSummary.p1_legs    = updated.p1_legs;
      result.legSummary.p2_legs    = updated.p2_legs;
      result.legSummary.p1_sets    = updated.p1_sets;
      result.legSummary.p2_sets    = updated.p2_sets;
    }
  } else {
    // Sıra değiştir
    const nextTurn = playerSlot === 1 ? 2 : 1;
    const turnUpdate = { current_turn: nextTurn };
    // Doubles sub_turn
    const entry1 = match.entry1_id ? db.entryById(match.entry1_id) : null;
    if (entry1 && entry1.player2_id) {
      const subCol = `p${playerSlot}_sub_turn`;
      turnUpdate[subCol] = (match[subCol] === 1) ? 2 : 1;
    }
    db.updateMatch(matchId, turnUpdate);
  }

  return result;
}

// Kullanıcı bir el (3 dart toplamı) girdiğinde çağrılır.
// finishDarts: leg'i bitiren visit'te kaç ok atıldığı (1, 2 veya 3) — sadece checkout'ta anlamlı.
// Sağlanmazsa varsayılan 3 (eski davranış). 3-ok ortalaması ve leg-başına-dart hesabı buna göre düzelir.
function recordThrow(matchId, playerSlot, score, finishDarts, forceBust) {
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

  // BUST tuşu: kullanıcı açıkça bust işaretledi (skor 0 gelir, kalan değişmez).
  // İstatistik: 3 ok atıldı, 0 puan (mevcut bust path'i bunu zaten yapar) — ortalamaya 0 katkı.
  if (forceBust) { bust = true; isFinish = false; }

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
    const turnUpdate = { current_turn: nextTurn };
    // Doubles: atış yapan takımın sub_turn'ünü ilerlet (bust dahil her atışta)
    const entry1 = match.entry1_id ? db.entryById(match.entry1_id) : null;
    if (entry1 && entry1.player2_id) {
      const subCol = `p${playerSlot}_sub_turn`;
      turnUpdate[subCol] = (match[subCol] === 1) ? 2 : 1;
    }
    db.updateMatch(matchId, turnUpdate);
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
  if (startScore !== undefined) {
    update.p1_leg_score = startScore;
    update.p2_leg_score = startScore;
  }
  // Doubles: yeni leg'de her takım player1'den başlar
  update.p1_sub_turn = 1;
  update.p2_sub_turn = 1;

  db.updateMatch(matchId, update);
}

// Gerçek cricket visit kaydı: hits = {20: 2, 19: 1, ...}
function recordCricketVisit(matchId, playerSlot, hits) {
  const match = db.matchById(matchId);
  if (!match) throw new Error('Maç bulunamadı');
  if (match.status !== 'live') throw new Error('Maç başlamadı');
  if (playerSlot !== match.current_turn) throw new Error('Sıra diğer oyuncuda');

  const pKey = `p${playerSlot}`;
  const oppKey = playerSlot === 1 ? 'p2' : 'p1';

  let state = parseCricketState(match.cricket_state_json) || initCricketState();
  let scored = 0;

  for (const [numStr, markCount] of Object.entries(hits)) {
    const num = +numStr;
    if (!CRICKET_NUMBERS.includes(num) || !markCount || markCount < 1) continue;

    const myMarks = state.marks[num][pKey] || 0;
    const oppMarks = state.marks[num][oppKey] || 0;
    const newMarks = myMarks + markCount;
    state.marks[num][pKey] = newMarks;

    // Kapatıldıktan fazla atışlar → rakip kapatmamışsa puan
    if (oppMarks < 3) {
      const scoringMarks = Math.max(0, newMarks - 3) - Math.max(0, myMarks - 3);
      scored += scoringMarks * num; // BULL (25) da 25 puan
    }
  }

  if (scored > 0) state[`${pKey}_score`] = (state[`${pKey}_score`] || 0) + scored;

  // Kazanma: tüm sayılar kapalı VE skor >= rakip
  const allClosed = CRICKET_NUMBERS.every(n => (state.marks[n][pKey] || 0) >= 3);
  const myScore = state[`${pKey}_score`] || 0;
  const oppScore = state[`${oppKey}_score`] || 0;
  const won = allClosed && myScore >= oppScore;

  db.updateMatch(matchId, { cricket_state_json: JSON.stringify(state) });

  const result = { matchFinished: false, legFinished: false };

  if (won) {
    result.legFinished = true;
    result.legSummary = {
      winner_slot: playerSlot,
      is_cricket: true,
      p1: { total: state.p1_score, avg: 0, hi180: 0, hi140: 0, hi100: 0 },
      p2: { total: state.p2_score, avg: 0, hi180: 0, hi140: 0, hi100: 0 },
      checkout: null,
    };
    finishLeg(matchId, playerSlot);
    const updated = db.matchById(matchId);
    if (updated.status === 'finished') {
      result.matchFinished = true;
    } else {
      // Yeni leg: cricket state sıfırla
      db.updateMatch(matchId, { cricket_state_json: JSON.stringify(initCricketState()) });
      result.legSummary.next_leg = updated.current_leg;
      result.legSummary.p1_legs = updated.p1_legs;
      result.legSummary.p2_legs = updated.p2_legs;
    }
  } else {
    db.updateMatch(matchId, { current_turn: playerSlot === 1 ? 2 : 1 });
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

  // Roll back stats — silinen visit'in dart'ı + kategori sayaçları kadar geri al.
  // Eski kayıtlarda darts_used null olabilir; bu durumda 3 varsay.
  // NOT: throws.score bust'ta zaten 0 saklanır (recordThrow), bu yüzden sayaç
  // kontrolleri için doğrudan last.score kullanmak güvenli — busted atış hiçbir
  // ton/180 sayacına girmez, total_score'dan da 0 düşer.
  const removedDarts = last.darts_used || 3;
  const s = last.score;
  const statDelta = {
    total_score: -s,
    darts_thrown: -removedDarts,
    turns: -1,
    // 100+/140+/180 sayaçları girişte artırılıyordu ama eski undo bunları geri
    // ALMIYORDU → yanlış girilip geri alınan "180" hayalet olarak kalıyordu.
    tons:       (s >= 100 && s < 140) ? -1 : 0,
    ton_plus:   (s >= 140 && s < 180) ? -1 : 0,
    one_eighty: (s === 180)           ? -1 : 0,
    high_outs:  (last.is_finish && s >= 100) ? -1 : 0,
  };
  db.updateStats(matchId, last.player_slot, statDelta);

  // best_checkout "en yüksek" değeri olduğu için delta ile düşürülemez; kalan
  // finish atışlarından yeniden hesapla (silinen yüksek çıkış hayalet kalmasın).
  db.recomputeBestCheckout(matchId, last.player_slot);

  return { ok: true };
}

function average(stats) {
  if (!stats || !stats.darts_thrown) return 0;
  return (stats.total_score / stats.darts_thrown) * 3;
}


// ---- Cricket Full Board Karambol ----
// Cezalı ile aynı hedefler, fark: puan yok, tüm tahtanın D/T/H'ı geçerli (honor system),
// kazanma = tüm hedefleri ilk kapatan (skor karşılaştırması yok).
function initKarambolState(includeLow) {
  const marks = {};
  for (const t of fbTargets(includeLow)) marks[String(t)] = { p1: 0, p2: 0 };
  return { marks, include_low: !!includeLow };
}

// allocation: { marks: { 'D': 1, '20': 2, ... } }  — score alanı yok
function recordKarambolVisit(matchId, playerSlot, allocation) {
  const match = db.matchById(matchId);
  if (!match) throw new Error('Maç bulunamadı');
  if (match.status !== 'live') throw new Error('Maç başlamadı');
  if (playerSlot !== match.current_turn) throw new Error('Sıra diğer oyuncuda');

  const pKey = `p${playerSlot}`;

  let state = parseCricketState(match.cricket_state_json) || initKarambolState(false);
  const targets = fbTargets(state.include_low);

  // Mark ekle
  const marksAlloc = allocation.marks || {};
  for (const [target, count] of Object.entries(marksAlloc)) {
    if (!targets.map(String).includes(String(target))) continue;
    const key = String(target);
    if (!state.marks[key]) state.marks[key] = { p1: 0, p2: 0 };
    const current = state.marks[key][pKey] || 0;
    state.marks[key][pKey] = Math.min(3, current + (count || 0));
  }

  // Kazanma: tüm hedefler kapalı — skor karşılaştırması yok
  const allClosed = targets.every(t => (state.marks[String(t)]?.[pKey] || 0) >= 3);

  db.updateMatch(matchId, { cricket_state_json: JSON.stringify(state) });

  const result = { matchFinished: false, legFinished: false };

  if (allClosed) {
    result.legFinished = true;
    result.legSummary = {
      winner_slot: playerSlot,
      is_cricket: true,
      p1: { total: 0, avg: 0 },
      p2: { total: 0, avg: 0 },
      checkout: null,
    };
    finishLeg(matchId, playerSlot);
    const updated = db.matchById(matchId);
    if (updated.status === 'finished') {
      result.matchFinished = true;
    } else {
      db.updateMatch(matchId, {
        cricket_state_json: JSON.stringify(initKarambolState(state.include_low)),
      });
      result.legSummary.next_leg = updated.current_leg;
      result.legSummary.p1_legs = updated.p1_legs;
      result.legSummary.p2_legs = updated.p2_legs;
      result.legSummary.p1_sets = updated.p1_sets;
      result.legSummary.p2_sets = updated.p2_sets;
    }
  } else {
    const nextTurn = playerSlot === 1 ? 2 : 1;
    const turnUpdate = { current_turn: nextTurn };
    const entry1 = match.entry1_id ? db.entryById(match.entry1_id) : null;
    if (entry1 && entry1.player2_id) {
      const subCol = `p${playerSlot}_sub_turn`;
      turnUpdate[subCol] = (match[subCol] === 1) ? 2 : 1;
    }
    db.updateMatch(matchId, turnUpdate);
  }

  return result;
}

module.exports = { recordThrow, undoLastThrow, average, recordCricketVisit, initCricketState, recordFBCezaliVisit, initFBCezaliState, fbTargets, recordKarambolVisit, initKarambolState };
