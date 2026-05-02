// Turnuva motoru - bracket üretimi ve ilerletme
const db = require('./db');

const START_SCORES = { '501': 501, '701': 701, '1001': 1001, 'cricket': 0 };

// --- Public API ---

function createTournament(data) {
  const { name, game_mode, team_mode, legs_to_win, sets_to_win, entries, stages, user_id } = data;
  if (!name || !game_mode || !team_mode) throw new Error('Turnuva ismi, oyun ve takım modu gerekli');
  if (!entries || entries.length < 2) throw new Error('En az 2 katılımcı gerekli');
  if (!stages || stages.length === 0) throw new Error('En az bir aşama gerekli');

  const t = db.createTournament({
    user_id: user_id || null,
    name,
    game_mode,
    team_mode,
    legs_to_win: legs_to_win || 2,
    sets_to_win: sets_to_win || 1,
  });

  // Seri başı + kura yerleştirmesi:
  //   - seed'li olanlar seed değerine göre sıralanır (1, 2, 3, ...)
  //   - seed'siz olanlar karıştırılıp (kura) arkaya eklenir
  //   - buildSeedOrder standart tohumlamayla pozisyonlara dağıtır
  //     (entries[0] → seed 1 pozisyonu, entries[1] → seed 2 pozisyonu, vs.)
  const orderedEntries = orderEntriesBySeed(entries);

  // Add entries
  orderedEntries.forEach((e, i) => {
    db.addEntry(t.id, i + 1, e.player1_id, e.player2_id || null, e.seed || null);
  });

  // Add stages (but do not build matches yet - we build at start)
  stages.forEach((s, i) => {
    db.createStage(t.id, i, s.format, s.qualifier_count || null,
      JSON.stringify(s.config || {}));
  });

  return t;
}

function startTournament(tournamentId) {
  const t = db.tournamentById(tournamentId);
  if (!t) throw new Error('Turnuva bulunamadı');
  if (t.status !== 'draft') throw new Error('Zaten başlamış veya bitmiş');

  const stages = db.stagesForTournament(tournamentId);
  const entries = db.entriesForTournament(tournamentId);

  // Build first stage
  const first = stages[0];
  buildStageMatches(t, first, entries.map(e => e.id));
  db.updateStageStatus(first.id, 'running');
  db.updateTournamentStatus(t.id, 'running');
}

function onMatchFinished(matchId) {
  const m = db.matchById(matchId);
  if (!m) return;

  const t = db.tournamentById(m.tournament_id);
  const stage = db.stageById(m.stage_id);

  // Çift eleme Grand Final reset: WB oyuncusu (slot 1) eğer LB oyuncusu (slot 2) kazanırsa
  // ikinci/belirleyici bir maç oynanır. Bu reset finalden sonra kazanan kim olursa olsun turnuva biter.
  if (m.bracket === 'final' && stage.format === 'double_elim' && !m.is_reset_final) {
    // entry1 = WB'den gelen; entry2 = LB'den gelen
    // LB oyuncusu kazandıysa (entry2 = winner) → reset match oluştur
    if (m.winner_entry_id && m.winner_entry_id === m.entry2_id) {
      const start_score = START_SCORES[t.game_mode] ?? null;
      const resetMatch = db.createMatch({
        tournament_id: t.id,
        stage_id: stage.id,
        bracket: 'final',
        round: (m.round || 1) + 1,
        match_index: (m.match_index || 0) + 1,
        entry1_id: m.entry1_id, // WB oyuncusu (her iki oyuncu da 0 kaybıyla)
        entry2_id: m.entry2_id, // LB oyuncusu
        status: 'ready',
        start_score,
        legs_to_win: m.legs_to_win || null,
        sets_to_win: m.sets_to_win || null,
        is_reset_final: 1,
      });
      // Reset match stats satırlarını ekle
      // (db.createMatch zaten match_stats ekliyor)
      return; // Sahneyi bitmiş sayma — reset maçı bekle
    }
  }

  // Propagate winner / loser to next match
  if (m.next_winner_match_id && m.winner_entry_id) {
    db.setMatchEntry(m.next_winner_match_id, m.next_winner_slot, m.winner_entry_id);
  }
  if (m.next_loser_match_id) {
    const loserEntryId = m.entry1_id === m.winner_entry_id ? m.entry2_id : m.entry1_id;
    if (loserEntryId) {
      db.setMatchEntry(m.next_loser_match_id, m.next_loser_slot, loserEntryId);
    }
  }

  // Check if stage done
  const stageMatches = db.matchesForStage(stage.id);
  const allDone = stageMatches.every(mm => mm.status === 'finished');
  if (allDone) {
    db.updateStageStatus(stage.id, 'finished');
    // Start next stage if exists
    const allStages = db.stagesForTournament(t.id);
    const next = allStages.find(s => s.stage_index === stage.stage_index + 1);
    if (next) {
      const qualifiers = computeStageQualifiers(stage, stageMatches);
      buildStageMatches(t, next, qualifiers);
      db.updateStageStatus(next.id, 'running');
    } else {
      db.updateTournamentStatus(t.id, 'finished');
    }
  }
}

// --- Stage building ---

function buildStageMatches(tournament, stage, entryIds) {
  const start_score = START_SCORES[tournament.game_mode] ?? null;

  // Stage config_json içinde round_overrides var mı? Format:
  //   { "winners-1": { legs: 3, sets: 1 }, "final-3": { legs: 6 }, "rr": { legs: 4 }, ... }
  // Bunlar bu stage'de oluşturulan her maça (bracket+round'a göre) yedirilir.
  let roundOverrides = {};
  try {
    const cfg = stage.config_json ? JSON.parse(stage.config_json) : {};
    roundOverrides = cfg.round_overrides || {};
  } catch (_) { roundOverrides = {}; }

  const common = {
    tournament_id: tournament.id,
    stage_id: stage.id,
    start_score,
    _roundOverrides: roundOverrides,
  };

  if (stage.format === 'single_elim') {
    buildSingleElim(common, entryIds);
  } else if (stage.format === 'double_elim') {
    buildDoubleElim(common, entryIds);
  } else if (stage.format === 'round_robin') {
    buildRoundRobin(common, entryIds);
  } else {
    throw new Error('Bilinmeyen stage formatı: ' + stage.format);
  }
}

// Tournament builder içinden çağrılan tüm createMatch'lerin sarmalayıcısı.
// _roundOverrides varsa, maçın bracket+round'una karşılık gelen leg/set sayısını yedirir.
function _createMatch(common, m) {
  const ov = (common._roundOverrides || {})[
    m.bracket === 'rr' ? 'rr' : `${m.bracket}-${m.round}`
  ];
  return db.createMatch({
    ...m,
    legs_to_win: ov?.legs || null,
    sets_to_win: ov?.sets || null,
  });
}

// Single elimination -------------------------------------------------
function buildSingleElim(common, entryIds) {
  const n = entryIds.length;
  const bracketSize = nextPow2(n);
  const seeded = seedWithByes(entryIds, bracketSize);
  const rounds = Math.log2(bracketSize);

  // Round 1 matches first, then subsequent rounds
  const createdPerRound = {};
  let matchIndex = 0;

  // Round 1
  createdPerRound[1] = [];
  for (let i = 0; i < bracketSize; i += 2) {
    const e1 = seeded[i];
    const e2 = seeded[i + 1];
    const status = (e1 && e2) ? 'ready' : (e1 || e2) ? 'pending' : 'pending';
    const m = _createMatch(common, {
      ...common,
      bracket: 'winners',
      round: 1,
      match_index: matchIndex++,
      entry1_id: e1,
      entry2_id: e2,
      status: 'pending', // set below
    });
    createdPerRound[1].push(m.id);
  }

  // Subsequent rounds (empty)
  for (let r = 2; r <= rounds; r++) {
    createdPerRound[r] = [];
    const count = bracketSize / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      const m = _createMatch(common, {
        ...common,
        bracket: r === rounds ? 'final' : 'winners',
        round: r,
        match_index: matchIndex++,
      });
      createdPerRound[r].push(m.id);
    }
  }

  // Wire winners forward
  for (let r = 1; r < rounds; r++) {
    const cur = createdPerRound[r];
    const nxt = createdPerRound[r + 1];
    for (let i = 0; i < cur.length; i++) {
      const target = nxt[Math.floor(i / 2)];
      const slot = (i % 2) + 1;
      db.updateMatch(cur[i], { next_winner_match_id: target, next_winner_slot: slot });
    }
  }

  // Auto-advance byes
  createdPerRound[1].forEach(mid => {
    const m = db.matchById(mid);
    if (m.entry1_id && !m.entry2_id) {
      db.updateMatch(mid, { status: 'finished', winner_entry_id: m.entry1_id, finished_at: new Date().toISOString() });
      if (m.next_winner_match_id) db.setMatchEntry(m.next_winner_match_id, m.next_winner_slot, m.entry1_id);
    } else if (m.entry2_id && !m.entry1_id) {
      db.updateMatch(mid, { status: 'finished', winner_entry_id: m.entry2_id, finished_at: new Date().toISOString() });
      if (m.next_winner_match_id) db.setMatchEntry(m.next_winner_match_id, m.next_winner_slot, m.entry2_id);
    } else if (m.entry1_id && m.entry2_id) {
      db.updateMatch(mid, { status: 'ready' });
    }
  });

  // Cascade bye advances (entry1 auto-filled upstream might need marking)
  propagateFills(common.stage_id);
}

// Double elimination -------------------------------------------------
function buildDoubleElim(common, entryIds) {
  // Basit ama çalışan bir çift eleme: winners bracket + losers bracket + grand final
  const n = entryIds.length;
  const bracketSize = nextPow2(n);
  const seeded = seedWithByes(entryIds, bracketSize);
  const wbRounds = Math.log2(bracketSize);

  // Winners bracket
  const W = {}; // round -> [matchIds]
  let matchIndex = 0;
  W[1] = [];
  for (let i = 0; i < bracketSize; i += 2) {
    const m = _createMatch(common, {
      ...common,
      bracket: 'winners',
      round: 1,
      match_index: matchIndex++,
      entry1_id: seeded[i],
      entry2_id: seeded[i + 1],
    });
    W[1].push(m.id);
  }
  for (let r = 2; r <= wbRounds; r++) {
    W[r] = [];
    const count = bracketSize / Math.pow(2, r);
    for (let i = 0; i < count; i++) {
      const m = _createMatch(common, { ...common, bracket: 'winners', round: r, match_index: matchIndex++ });
      W[r].push(m.id);
    }
  }

  // Losers bracket: 2*(wbRounds-1) rounds in LB
  // Simplified model: LB round structure follows a standard interleaved pattern
  const L = {}; // round -> [matchIds]
  const lbRounds = wbRounds === 1 ? 0 : 2 * (wbRounds - 1);
  // LB round counts:
  // LB-1: bracketSize/4 (from WB-1 losers meeting each other)
  // LB-2: bracketSize/4 (WB-2 losers drop in paired with LB-1 winners)
  // ...alternating
  const lbRoundSizes = [];
  if (wbRounds >= 2) {
    let size = bracketSize / 4;
    for (let r = 1; r <= lbRounds; r++) {
      lbRoundSizes.push(size);
      if (r % 2 === 0) size = size / 2;
    }
  }
  for (let r = 1; r <= lbRounds; r++) {
    L[r] = [];
    const count = lbRoundSizes[r - 1];
    for (let i = 0; i < count; i++) {
      const m = _createMatch(common, { ...common, bracket: 'losers', round: r, match_index: matchIndex++ });
      L[r].push(m.id);
    }
  }

  // Grand final
  const gf = _createMatch(common, { ...common, bracket: 'final', round: wbRounds + lbRounds + 1, match_index: matchIndex++ });

  // Wire winners: WB winners forward; WB losers drop to LB
  for (let r = 1; r < wbRounds; r++) {
    const cur = W[r];
    const nxt = W[r + 1];
    for (let i = 0; i < cur.length; i++) {
      const target = nxt[Math.floor(i / 2)];
      const slot = (i % 2) + 1;
      db.updateMatch(cur[i], { next_winner_match_id: target, next_winner_slot: slot });
    }
  }
  // WB final winner -> GF slot 1
  if (W[wbRounds] && W[wbRounds].length === 1) {
    db.updateMatch(W[wbRounds][0], { next_winner_match_id: gf.id, next_winner_slot: 1 });
  }

  // WB losers -> LB
  if (lbRounds > 0) {
    // WB-1 losers both drop into LB-1
    W[1].forEach((mid, i) => {
      const target = L[1][Math.floor(i / 2)];
      const slot = (i % 2) + 1;
      db.updateMatch(mid, { next_loser_match_id: target, next_loser_slot: slot });
    });
    // WB-r losers (r>=2) drop into LB-(2r-2) slot 2 typically
    for (let r = 2; r <= wbRounds; r++) {
      const lbRound = 2 * (r - 1);
      if (!L[lbRound]) continue;
      W[r].forEach((mid, i) => {
        const target = L[lbRound][i];
        if (!target) return;
        db.updateMatch(mid, { next_loser_match_id: target, next_loser_slot: 2 });
      });
    }

    // LB round progression: LB-r winners advance
    for (let r = 1; r < lbRounds; r++) {
      const cur = L[r];
      const nxt = L[r + 1];
      if (r % 2 === 1) {
        // odd LB round: winners pair with WB drops next round - target slot 1
        cur.forEach((mid, i) => {
          const target = nxt[i];
          if (!target) return;
          db.updateMatch(mid, { next_winner_match_id: target, next_winner_slot: 1 });
        });
      } else {
        // even LB round: winners fold together
        cur.forEach((mid, i) => {
          const target = nxt[Math.floor(i / 2)];
          if (!target) return;
          db.updateMatch(mid, { next_winner_match_id: target, next_winner_slot: (i % 2) + 1 });
        });
      }
    }
    // LB final winner -> GF slot 2
    const lbFinal = L[lbRounds][0];
    db.updateMatch(lbFinal, { next_winner_match_id: gf.id, next_winner_slot: 2 });
  }

  // Handle byes in WB round 1
  W[1].forEach(mid => {
    const m = db.matchById(mid);
    if (m.entry1_id && !m.entry2_id) {
      db.updateMatch(mid, { status: 'finished', winner_entry_id: m.entry1_id, finished_at: new Date().toISOString() });
      if (m.next_winner_match_id) db.setMatchEntry(m.next_winner_match_id, m.next_winner_slot, m.entry1_id);
    } else if (m.entry2_id && !m.entry1_id) {
      db.updateMatch(mid, { status: 'finished', winner_entry_id: m.entry2_id, finished_at: new Date().toISOString() });
      if (m.next_winner_match_id) db.setMatchEntry(m.next_winner_match_id, m.next_winner_slot, m.entry2_id);
    } else if (m.entry1_id && m.entry2_id) {
      db.updateMatch(mid, { status: 'ready' });
    }
  });
  propagateFills(common.stage_id);
}

// Round robin -------------------------------------------------------
function buildRoundRobin(common, entryIds) {
  // Grup konfigürasyonunu oku
  const stage = db.stageById(common.stage_id);
  let rrCfg = {};
  try { rrCfg = stage.config_json ? JSON.parse(stage.config_json) : {}; } catch (_) {}

  const totalPlayers = entryIds.length;
  const groupSize = (rrCfg.group_size && rrCfg.group_size >= 2) ? rrCfg.group_size : totalPlayers;
  const groupCount = Math.ceil(totalPlayers / groupSize);

  // Oyuncuları gruplara dağıt (mümkün olduğunca eşit)
  // Örn: 14 oyuncu, 4'lük grup → groupCount=4 → [4,4,3,3]
  const floorSize = Math.floor(totalPlayers / groupCount);
  const extraCount = totalPlayers % groupCount; // ilk extraCount grup floorSize+1 oyuncu alır
  const groups = [];
  let pi = 0;
  for (let g = 0; g < groupCount; g++) {
    const size = g < extraCount ? floorSize + 1 : floorSize;
    groups.push(entryIds.slice(pi, pi + size));
    pi += size;
  }

  // Her grup için circle method ile maçları oluştur
  let matchIndex = 0;
  for (let g = 0; g < groups.length; g++) {
    const players = [...groups[g]];
    if (players.length % 2 === 1) players.push(null); // bye
    const rounds = players.length - 1;
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < players.length / 2; i++) {
        const e1 = players[i];
        const e2 = players[players.length - 1 - i];
        if (!e1 || !e2) continue;
        _createMatch(common, {
          ...common,
          bracket: 'rr',
          round: r + 1,
          match_index: matchIndex++,
          entry1_id: e1,
          entry2_id: e2,
          status: 'ready',
          group_index: g,
        });
      }
      // rotate (keep first fixed)
      const fixed = players[0];
      const rest = players.slice(1);
      rest.unshift(rest.pop());
      players.splice(0, players.length, fixed, ...rest);
    }
  }
}

// --- Stage qualifiers for multi-stage progression ---
function computeStageQualifiers(stage, stageMatches) {
  if (stage.format === 'round_robin') {
    let rrCfg = {};
    try { rrCfg = stage.config_json ? JSON.parse(stage.config_json) : {}; } catch (_) {}
    const totalQualifiers = stage.qualifier_count;

    if (rrCfg.group_size) {
      // Grup aşaması: her gruptan direkt çıkanlar + lucky loser'lar
      const standingsByGroup = computeRRStandingsByGroup(stageMatches);
      const groupIndices = Object.keys(standingsByGroup).map(Number).sort((a, b) => a - b);
      const groupCount = groupIndices.length;

      if (!totalQualifiers) {
        // Fallback: her gruptan ilk yarısı
        return groupIndices.flatMap(g =>
          standingsByGroup[g].slice(0, Math.ceil(standingsByGroup[g].length / 2)).map(r => r.entryId)
        );
      }

      const directPerGroup = Math.floor(totalQualifiers / groupCount);
      const luckyLoserCount = totalQualifiers - groupCount * directPerGroup;

      const directQualifiers = [];
      const luckyLoserCandidates = [];

      for (const g of groupIndices) {
        const standings = standingsByGroup[g];
        for (let i = 0; i < standings.length; i++) {
          if (i < directPerGroup) {
            directQualifiers.push(standings[i]);
          } else if (i === directPerGroup && luckyLoserCount > 0) {
            luckyLoserCandidates.push(standings[i]);
          }
        }
      }

      // Lucky loser'ları puana göre sırala
      luckyLoserCandidates.sort((a, b) =>
        b.points - a.points ||
        (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst) ||
        b.legsFor - a.legsFor
      );

      return [
        ...directQualifiers.map(r => r.entryId),
        ...luckyLoserCandidates.slice(0, luckyLoserCount).map(r => r.entryId),
      ];
    } else {
      // Tek grup (eski davranış)
      const table = computeRRStandings(stageMatches);
      const count = totalQualifiers || Math.ceil(table.length / 2);
      return table.slice(0, count).map(row => row.entryId);
    }
  }
  // Elim aşaması
  const final = stageMatches.find(m => m.bracket === 'final' || (m.bracket === 'winners' && m.round === maxRound(stageMatches)));
  return final?.winner_entry_id ? [final.winner_entry_id] : [];
}

// Per-grup sıralama tablosu: { groupIndex → [{ entryId, W, L, legsFor, legsAgainst, points }] }
function computeRRStandingsByGroup(matches) {
  const groups = {};
  // Tüm entry'leri gruplarına kaydet (bitmemiş maçlar dahil)
  for (const m of matches) {
    const g = m.group_index ?? 0;
    if (!groups[g]) groups[g] = {};
    for (const eid of [m.entry1_id, m.entry2_id]) {
      if (eid && !groups[g][eid]) {
        groups[g][eid] = { entryId: eid, W: 0, L: 0, legsFor: 0, legsAgainst: 0, points: 0 };
      }
    }
  }
  // Biten maçları işle
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    const g = m.group_index ?? 0;
    for (const slot of [1, 2]) {
      const eid = slot === 1 ? m.entry1_id : m.entry2_id;
      if (!eid || !groups[g]?.[eid]) continue;
      const legsFor = slot === 1 ? (m.p1_legs || 0) : (m.p2_legs || 0);
      const legsAgainst = slot === 1 ? (m.p2_legs || 0) : (m.p1_legs || 0);
      groups[g][eid].legsFor += legsFor;
      groups[g][eid].legsAgainst += legsAgainst;
      if (m.winner_entry_id === eid) { groups[g][eid].W++; groups[g][eid].points += 3; }
      else { groups[g][eid].L++; }
    }
  }
  // Her grubu sırala
  const result = {};
  for (const [g, table] of Object.entries(groups)) {
    result[+g] = Object.values(table).sort((a, b) =>
      b.points - a.points ||
      (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst) ||
      b.legsFor - a.legsFor
    );
  }
  return result;
}

function computeRRStandings(matches) {
  const table = {};
  for (const m of matches) {
    if (m.status !== 'finished') continue;
    for (const slot of [1, 2]) {
      const eid = slot === 1 ? m.entry1_id : m.entry2_id;
      if (!eid) continue;
      if (!table[eid]) table[eid] = { entryId: eid, W: 0, L: 0, legsFor: 0, legsAgainst: 0, points: 0 };
      const legsFor = slot === 1 ? m.p1_legs : m.p2_legs;
      const legsAgainst = slot === 1 ? m.p2_legs : m.p1_legs;
      table[eid].legsFor += legsFor;
      table[eid].legsAgainst += legsAgainst;
      if (m.winner_entry_id === eid) {
        table[eid].W++;
        table[eid].points += 3;
      } else {
        table[eid].L++;
      }
    }
  }
  return Object.values(table).sort((a, b) =>
    b.points - a.points ||
    (b.legsFor - b.legsAgainst) - (a.legsFor - a.legsAgainst) ||
    b.legsFor - a.legsFor
  );
}

// --- Helpers ---

function nextPow2(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

// Seri başı + kura: seed'liler seed değerine göre sıralı,
// seed'sizler Fisher-Yates ile karıştırılıp arkaya eklenir
function orderEntriesBySeed(entries) {
  const seeded = entries.filter(e => e.seed).slice().sort((a, b) => a.seed - b.seed);
  const unseeded = entries.filter(e => !e.seed).slice();
  // Fisher-Yates shuffle (kura)
  for (let i = unseeded.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [unseeded[i], unseeded[j]] = [unseeded[j], unseeded[i]];
  }
  return [...seeded, ...unseeded];
}

// Seeds an array of entryIds into bracket positions with byes filled as null
function seedWithByes(entryIds, bracketSize) {
  // Standard seeding order for bracketSize
  const seeds = buildSeedOrder(bracketSize);
  const result = new Array(bracketSize).fill(null);
  for (let i = 0; i < bracketSize; i++) {
    const seed = seeds[i]; // 1..bracketSize
    if (seed <= entryIds.length) {
      result[i] = entryIds[seed - 1];
    } else {
      result[i] = null; // bye
    }
  }
  return result;
}

// Standard tournament seeding positions (1, N, ...)
function buildSeedOrder(n) {
  if (n === 1) return [1];
  const prev = buildSeedOrder(n / 2);
  const result = [];
  for (const s of prev) {
    result.push(s);
    result.push(n + 1 - s);
  }
  return result;
}

function maxRound(matches) {
  return matches.reduce((mx, m) => Math.max(mx, m.round || 0), 0);
}

// Bir maç için insan-okuyabilir round etiketi üretir:
//  - single_elim finali "FİNAL"
//  - 4 oyunculu round "Yarı Final (Son 4)"
//  - 8 oyunculu round "Çeyrek Final (Son 8)"
//  - 16+ oyunculu round "Son N"
//  - losers bracket "Losers Round X"
//  - grand final "Büyük Final"
//  - round robin "Grup Maçı — Round X"
function roundLabel(match, options = {}) {
  if (!match) return '';
  if (match.bracket === 'rr' || match.bracket === 'group') {
    const groupLetter = match.group_index != null ? ` — ${String.fromCharCode(65 + match.group_index)} Grubu` : '';
    return `Grup Maçı${groupLetter} — Round ${match.round}`;
  }
  if (match.bracket === 'final' && options.format === 'double_elim') {
    return 'Büyük Final';
  }
  if (match.bracket === 'losers') {
    return `Losers Round ${match.round}`;
  }
  // winners or final (single_elim)
  const { bracketSize } = options;
  if (!bracketSize) {
    // fallback: sadece "Round X"
    return `Round ${match.round}`;
  }
  const playersInRound = bracketSize / Math.pow(2, match.round - 1);
  if (playersInRound <= 2) return 'FİNAL';
  if (playersInRound === 4) return 'Yarı Final (Son 4)';
  if (playersInRound === 8) return 'Çeyrek Final (Son 8)';
  return `Son ${playersInRound}`;
}

// Bir maç için yazıcı-hakem (scorer) seç.
// Kural: başka bir aktif (ready/live) maçta oyuncu VEYA scorer olmayan
// entry'lerden birini seç. Tercihen en son kaybeden (finished_at'e göre),
// yoksa henüz oynamamış entry. Hiç uygun yoksa null döner.
function pickScorerEntry(tournamentId, excludeMatchId = null) {
  const entries = db.entriesForTournament(tournamentId);
  const allMatches = db.matchesForTournament(tournamentId);
  const busy = new Set();
  for (const m of allMatches) {
    // Busy: (a) hedef maçın oyuncuları (kimse kendi maçını yazamaz), VEYA
    // (b) board'a atanmış başka bir aktif (ready/live) maçın oyuncusu/scorer'ı.
    const isTarget = m.id === excludeMatchId;
    if (isTarget) {
      if (m.entry1_id) busy.add(m.entry1_id);
      if (m.entry2_id) busy.add(m.entry2_id);
      continue;
    }
    if ((m.status === 'ready' || m.status === 'live') && m.board_id) {
      if (m.entry1_id) busy.add(m.entry1_id);
      if (m.entry2_id) busy.add(m.entry2_id);
      if (m.scorer_entry_id) busy.add(m.scorer_entry_id);
    }
  }
  const available = entries.filter(e => !busy.has(e.id));
  if (available.length === 0) return null;

  // Tercih:
  //   - İlk maçlarda hiç biten yok → boştaki ilk entry
  //   - RR grup fazında: son biten maçın KAZANANI (sonraki RR turunu bekliyor, zaten board başında)
  //   - Elemede: son biten maçın KAYBEDENİ (kazanan üst tura geçer, boşta değildir)
  const target = excludeMatchId ? allMatches.find(x => x.id === excludeMatchId) : null;
  const targetStage = target && target.stage_id ? db.stageById(target.stage_id) : null;
  const preferWinner = targetStage && targetStage.format === 'round_robin';

  const finished = allMatches
    .filter(m => m.status === 'finished' && m.winner_entry_id && m.finished_at)
    .sort((a, b) => String(b.finished_at).localeCompare(String(a.finished_at)));
  for (const m of finished) {
    const preferredId = preferWinner
      ? m.winner_entry_id
      : (m.entry1_id === m.winner_entry_id ? m.entry2_id : m.entry1_id);
    if (preferredId && available.some(e => e.id === preferredId)) {
      return available.find(e => e.id === preferredId);
    }
  }
  // Hiç uygun tercih yok → boştaki ilk entry
  return available[0];
}

// Bir stage'in turnuva boyutunu (bracketSize) hesaplar. Round label için gerekli.
function computeBracketSize(stage, matches) {
  if (!matches || matches.length === 0) return null;
  // İlk round'daki maç sayısı * 2 = bracketSize
  const r1 = matches.filter(m => m.bracket !== 'losers' && m.bracket !== 'final' && m.round === 1);
  if (r1.length > 0) return r1.length * 2;
  // fallback
  const anyR1 = matches.filter(m => m.round === 1);
  return anyR1.length * 2;
}

function propagateFills(stageId) {
  // After byes, some round-2 matches may have both entries from byes (unlikely normal but possible).
  // Mark such matches 'ready'.
  const all = db.matchesForStage(stageId);
  for (const m of all) {
    if (m.status === 'pending' && m.entry1_id && m.entry2_id) {
      db.updateMatch(m.id, { status: 'ready' });
    }
  }
}

module.exports = {
  createTournament,
  startTournament,
  onMatchFinished,
  computeRRStandings,
  orderEntriesBySeed,
  roundLabel,
  computeBracketSize,
  pickScorerEntry,
};
