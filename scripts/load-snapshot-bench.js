#!/usr/bin/env node
// Yük testi: snapshot/broadcast maliyeti — "aynı anda kaç turnuva?" sorusunu
// sayıyla yanıtlamak için. GERÇEK db sorgularıyla ölçer (production'la aynı
// kod yolu), ama GEÇİCİ bir DB üzerinde çalışır — data.db'ye dokunmaz.
//
// Kullanım:
//   node scripts/load-snapshot-bench.js [turnuvaSayisi] [oyuncu] [cihaz]
//   örn: node scripts/load-snapshot-bench.js 4 512 40
//
// Ölçtüğü şey: getSnapshot() bir kez kurulma maliyeti (db sorgu + obje).
// broadcastState eskiden bunu bağlı HER socket için yeniden kuruyordu;
// optimizasyon sonrası yayın başına uid başına TEK SEFER + report 1.5sn cache.

const os = require('os');
const path = require('path');
const fs = require('fs');

// Geçici DB — data.db'ye dokunma
const TMP_DB = path.join(os.tmpdir(), `dcp-bench-${Date.now()}.db`);
process.env.DB_PATH = TMP_DB;
process.env.NODE_ENV = 'test';

const db = require('../src/db');
db.init();

const T = parseInt(process.argv[2] || '4', 10);    // eş zamanlı turnuva
const S = parseInt(process.argv[3] || '512', 10);   // turnuva başına oyuncu
const D = parseInt(process.argv[4] || '40', 10);    // organizatöre bağlı cihaz (tablet+izleyici+TV)
const USER = 1;

console.log(`\n=== Snapshot yük testi ===`);
console.log(`Turnuva: ${T} | Oyuncu/turnuva: ${S} | Bağlı cihaz: ${D} | DB: ${TMP_DB}\n`);

// --- Seed: gerçekçi, tamamen oynanmış turnuvalar (en ağır snapshot durumu) ---
const t0 = Date.now();
const players = [];
for (let i = 0; i < S; i++) players.push(db.createPlayer(`Oyuncu ${i}`, null, USER).id);

const insStats = db.db.prepare(`
  INSERT INTO match_stats (match_id, player_slot, total_score, darts_thrown, turns,
    legs_won, sets_won, best_checkout, tons, ton_plus, one_eighty, high_outs, darts_in_finished_legs)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const setFinished = db.db.prepare(`UPDATE matches SET status='finished', winner_entry_id=? WHERE id=?`);

for (let ti = 0; ti < T; ti++) {
  const tour = db.createTournament({
    user_id: USER, name: `Turnuva ${ti}`, game_mode: '501', team_mode: 'single',
    legs_to_win: 3, sets_to_win: 1,
  });
  db.updateTournamentStatus(tour.id, 'running');
  const stage = db.createStage(tour.id, 0, 'single_elim');
  const entries = [];
  for (let s = 0; s < S; s++) {
    entries.push(db.addEntry(tour.id, s + 1, players[s]).id);
  }
  // S-1 maç (single elim toplamı), hepsi oynanmış + istatistikli
  for (let mi = 0; mi < S - 1; mi++) {
    const e1 = entries[mi % S], e2 = entries[(mi + 1) % S];
    const m = db.createMatch({
      tournament_id: tour.id, stage_id: stage.id, bracket: 'winners',
      round: 1 + Math.floor(mi / 64), match_index: mi,
      entry1_id: e1, entry2_id: e2, status: 'pending', start_score: 501,
      legs_to_win: 3, sets_to_win: 1,
    });
    setFinished.run(e1, m.id);
    // iki slot için gerçekçi istatistik satırı
    insStats.run(m.id, 1, 1503, 60, 20, 3, 1, 121, 4, 7, 1, 1, 45);
    insStats.run(m.id, 2, 1402, 63, 21, 2, 0, 96, 3, 5, 0, 0, 0);
  }
}
console.log(`Seed tamam: ${T * (S - 1)} maç, ${T * (S - 1) * 2} istatistik satırı (${Date.now() - t0} ms)\n`);

// --- getSnapshot replikası (server.js ile aynı db çağrıları) ---
function rawReport(tid) { return db.tournamentPlayerReport(tid); }

const _cache = new Map();
const TTL = 1500;
function cachedReport(tid) {
  const now = Date.now();
  const c = _cache.get(tid);
  if (c && now - c.at < TTL) return c.report;
  const r = db.tournamentPlayerReport(tid);
  _cache.set(tid, { at: now, report: r });
  return r;
}

function buildSnapshot(reportFn) {
  return {
    players: db.allPlayers(USER),
    tournaments: db.allTournaments(USER).map(t => ({
      ...t,
      stages: db.stagesForTournament(t.id),
      matches: db.matchesForTournament(t.id),
      entries: db.entriesForTournament(t.id),
      report: t.status !== 'draft' ? reportFn(t.id) : [],
    })),
    boards: db.allBoards(USER).map(b => ({ ...b, currentMatch: null })),
    activeMatches: db.activeMatches(USER),
  };
}

function bench(label, fn, iters) {
  fn(); // warmup
  const start = process.hrtime.bigint();
  for (let i = 0; i < iters; i++) fn();
  const ns = Number(process.hrtime.bigint() - start);
  const ms = ns / 1e6 / iters;
  console.log(`  ${label.padEnd(42)} ${ms.toFixed(2)} ms/kez`);
  return ms;
}

console.log(`--- Tek snapshot kurulma maliyeti (1 organizatör, ${T} turnuva) ---`);
const rawMs = bench('raw report (cache yok)', () => buildSnapshot(rawReport), 30);
_cache.clear(); cachedReport; // ısıt
buildSnapshot(cachedReport);
const cachedMs = bench('report cache sıcak', () => buildSnapshot(cachedReport), 30);

console.log(`\n--- Yayın (broadcast) maliyeti: ${D} bağlı cihaz ---`);
const oldBroadcast = D * rawMs;          // ESKİ: her socket için yeniden kur
const newBroadcast = cachedMs;           // YENİ: uid başına 1 kez + report cache
console.log(`  ESKİ (socket başına yeniden kur):        ${oldBroadcast.toFixed(1)} ms/yayın`);
console.log(`  YENİ (uid başına 1 kez + report cache):  ${newBroadcast.toFixed(1)} ms/yayın`);
console.log(`  Kazanç:                                  ${(oldBroadcast / newBroadcast).toFixed(0)}x`);

// --- Kapasite projeksiyonu ---
// Render Starter ~0.5 vCPU. Tek çekirdeğin ~%40'ını snapshot'a ayırmak güvenli
// (geri kalan: db yazma, socket I/O, HTTP). 0.5 core × 0.40 = 200 ms CPU/sn.
const CPU_BUDGET_MS_PER_SEC = 200;
// 300ms debounce → organizatör başına en fazla ~3.3 yayın/sn
const MAX_BROADCASTS_PER_SEC = 1000 / 300;

console.log(`\n--- Kapasite projeksiyonu (Render Starter ~0.5 vCPU varsayımı) ---`);
console.log(`  CPU bütçesi (snapshot için):  ${CPU_BUDGET_MS_PER_SEC} ms/sn`);
console.log(`  Debounce tavanı:              ${MAX_BROADCASTS_PER_SEC.toFixed(1)} yayın/sn (organizatör başına)`);

function maxOrgs(perBroadcastMs) {
  const costPerOrgPerSec = perBroadcastMs * MAX_BROADCASTS_PER_SEC;
  return Math.max(0, Math.floor(CPU_BUDGET_MS_PER_SEC / costPerOrgPerSec));
}
console.log(`\n  Eş zamanlı bağımsız organizatör (her biri ${T}×${S} kişilik, ${D} cihaz):`);
console.log(`    ESKİ kod:  ~${maxOrgs(oldBroadcast)} organizatör`);
console.log(`    YENİ kod:  ~${maxOrgs(newBroadcast)} organizatör`);
console.log(`\n  (Tek organizatör altında ${T} turnuva zaten yukarıdaki tek-snapshot`);
console.log(`   maliyetine dahil — federasyon senaryosu: 1 organizatör, ${T} kategori.)\n`);

// temizlik
try { fs.unlinkSync(TMP_DB); } catch {}
try { fs.unlinkSync(TMP_DB + '-wal'); } catch {}
try { fs.unlinkSync(TMP_DB + '-shm'); } catch {}
