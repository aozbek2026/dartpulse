#!/usr/bin/env node
// Snapshot BANT GENİŞLİĞİ tahmini — gerçek tablo şemalarıyla birebir nesneler
// kurup getSnapshot() çıktısının kaç byte olduğunu ve bir turnuva boyunca
// TV/izleyici cihazlarına toplam ne kadar veri gittiğini hesaplar.
// DB gerekmez (native modülden bağımsız).
//
// Kullanım: node scripts/bench-snapshot-bytes.js [oyuncu] [gecmisTurnuva] [cihaz]
const zlib = require('zlib');
const S = parseInt(process.argv[2] || '128', 10);
const PAST = parseInt(process.argv[3] || '0', 10);
const DEV = parseInt(process.argv[4] || '4', 10);

let pid = 0, eid = 0, mid = 0;
const player = () => ({ id: ++pid, user_id: 1, name: 'Oyuncu Isim', nickname: 'Lakap', created_at: '2026-06-01 12:00:00' });
const entry = (tid) => ({ id: ++eid, tournament_id: tid, slot: 1, player1_id: pid, player2_id: null, seed: null, player1: player(), player2: null });
function match(tid, sid) {
  const e1 = entry(tid), e2 = entry(tid);
  return {
    id: ++mid, tournament_id: tid, stage_id: sid, bracket: 'winners', round: 1, match_index: 0,
    entry1_id: e1.id, entry2_id: e2.id, winner_entry_id: e1.id, status: 'finished', board_id: null,
    current_leg: 1, current_set: 1, p1_sets: 1, p2_sets: 0, p1_legs: 3, p2_legs: 2,
    p1_leg_score: 0, p2_leg_score: 32, starter_slot: 1, current_turn: 1,
    cricket_state_json: null, cricket_undo_json: null, next_winner_match_id: null, next_winner_slot: null,
    next_loser_match_id: null, next_loser_slot: null, scorer_entry_id: null, legs_to_win: null, sets_to_win: null,
    is_reset_final: 0, is_walkover: 0, team_phase_match_id: null, finished_at: '2026-06-10 14:30:00',
    entry1: e1, entry2: e2, scorer: null,
  };
}
const reportRow = (id) => ({ entry_id: id, player_id: id, name: 'Oyuncu Isim', matches_played: 4, matches_won: 3,
  total_score: 6012, darts_thrown: 240, turns: 80, legs_won: 12, sets_won: 4, best_checkout: 121,
  tons: 16, ton_plus: 28, one_eighty: 4, high_outs: 4, darts_in_finished_legs: 180, three_dart_avg: 75.15,
  checkout_pct: 0, high_turn: 140 });

function tournament(size, status) {
  const tid = Math.floor(mid / 1000) + 1;
  const sid = tid;
  const entries = []; for (let i = 0; i < size; i++) entries.push(entry(tid));
  const matches = []; for (let i = 0; i < size - 1; i++) matches.push(match(tid, sid));
  const report = []; for (let i = 0; i < size; i++) report.push(reportRow(i + 1));
  return {
    id: tid, user_id: 1, name: 'Turnuva Adi', game_mode: '501', team_mode: 'single',
    legs_to_win: 3, sets_to_win: 1, status, config_json: null, created_at: '2026-06-10 09:00:00',
    stages: [{ id: sid, tournament_id: tid, stage_index: 0, format: 'single_elim', status, qualifier_count: null, config_json: null }],
    matches, entries, report: status !== 'draft' ? report : [],
  };
}

const tournaments = [];
for (let i = 0; i < PAST; i++) { mid = (i + 1) * 1000; tournaments.push(tournament(S, 'finished')); }
mid = (PAST + 1) * 1000; tournaments.push(tournament(S, 'running'));
const players = []; for (let i = 0; i < S; i++) players.push(player());

const snap = { players, tournaments, boards: [], activeMatches: [] };
const json = JSON.stringify(snap);
const raw = Buffer.byteLength(json, 'utf8');
const gz = zlib.gzipSync(json).length;
const kb = b => (b / 1024).toFixed(1) + ' KB';

console.log(`\n=== Snapshot byte ölçümü (temsili) ===`);
console.log(`Aktif turnuva: ${S} oyuncu | Geçmiş turnuva: ${PAST} | Açık TV/izleyici: ${DEV}\n`);
console.log(`Tek snapshot JSON:      ${kb(raw)}`);
console.log(`Tek snapshot gzip:      ${kb(gz)}`);

const throwsPerMatch = 60;
const broadcasts = (S - 1) * throwsPerMatch;
console.log(`\n--- Bir turnuva boyunca toplam (≈${S-1} maç × ${throwsPerMatch} atış = ${broadcasts} yayın) ---`);
for (const [lbl, bytes] of [['sıkıştırmasız', raw], ['gzip', gz]]) {
  const total = bytes * broadcasts * DEV;
  console.log(`  ${lbl.padEnd(14)} ${broadcasts} × ${kb(bytes)} × ${DEV} cihaz = ${(total/1048576).toFixed(0)} MB  (${(total/1073741824).toFixed(2)} GB)`);
}
