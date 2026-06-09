// pdf-print.js — Klasman ve braket PDF (yazdırma) yardımcıları.
// Tarayıcının "PDF olarak kaydet" özelliğini kullanır; yeni paket / bağımlılık yok.
// window.printStandings(meta, headers, rows)  → dikey A4, çok sayfa, başlık her sayfada tekrar
// window.printBracket(meta, matches)          → yatay A4, braket 32'lik (= 16 maç) dilimlere bölünür
//
// KORUMALI MODÜLLERE DOKUNMAZ. Salt-okuma veri alır, ayrı pencerede render eder.
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // entryLabel common.js'ten gelir; yoksa basit fallback.
  const lbl = (entry) => (window.entryLabel ? window.entryLabel(entry) : (entry?.player1?.name || '—'));

  function openPrintWindow(docHtml) {
    const w = window.open('', '_blank');
    if (!w) {
      alert('Yazdırma penceresi açılamadı. Lütfen tarayıcı pop-up engelleyicisini bu site için kapat.');
      return;
    }
    w.document.open();
    w.document.write(docHtml);
    w.document.close();
  }

  // ---- Ortak sayfa stilleri --------------------------------------------------
  const BASE_CSS = `
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
           color: #111; margin: 0; padding: 0; background: #fff; }
    .doc-head { display:flex; justify-content:space-between; align-items:baseline;
                border-bottom: 2px solid #ff3860; padding: 0 0 6px; margin: 0 0 10px; }
    .doc-head h1 { font-size: 16px; margin: 0; }
    .doc-head .sub { font-size: 11px; color: #555; }
    @media print { .no-print { display: none !important; } }
    .toolbar { position: fixed; top: 8px; right: 8px; z-index: 99; }
    .toolbar button { font-size: 13px; padding: 7px 14px; margin-left: 6px; cursor: pointer;
                      border: 0; border-radius: 6px; background: #ff3860; color: #fff; }
    .toolbar button.sec { background: #444; }
  `;

  const TOOLBAR = `
    <div class="toolbar no-print">
      <button onclick="window.print()">🖨️ Yazdır / PDF</button>
      <button class="sec" onclick="window.close()">Kapat</button>
    </div>`;

  // ============================================================================
  //  KLASMAN  (dikey A4, çok sayfa)
  // ============================================================================
  // meta: { title, subtitle }
  // headers: ["Sıra","Oyuncu",...]
  // rows: [["1","Ahmet",...], ...]   (her hücre düz metin)
  // aligns: opsiyonel ["center","left",...] (varsayılan center, 2. sütun left)
  window.printStandings = function (meta, headers, rows, aligns) {
    aligns = aligns || headers.map((_, i) => (i === 1 ? 'left' : 'center'));
    const today = new Date().toLocaleDateString('tr-TR');
    const thead = headers.map((h, i) =>
      `<th style="text-align:${aligns[i]}">${esc(h)}</th>`).join('');
    const tbody = rows.map((r, ri) => {
      const cells = r.map((c, i) =>
        `<td style="text-align:${aligns[i]}">${esc(c)}</td>`).join('');
      return `<tr class="${ri % 2 ? 'alt' : ''}">${cells}</tr>`;
    }).join('');

    const css = BASE_CSS + `
      @page { size: A4 portrait; margin: 14mm; }
      table { width: 100%; border-collapse: collapse; font-size: 11px; }
      thead { display: table-header-group; }   /* her sayfada başlık tekrar */
      tr { page-break-inside: avoid; }
      th { background: #ff3860; color: #fff; padding: 6px 5px; border: 1px solid #e0445f;
           font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
      td { padding: 5px 5px; border: 1px solid #ddd; }
      tr.alt td { background: #f7f7f9; }
      tbody tr:nth-child(1) td, tbody tr:nth-child(2) td, tbody tr:nth-child(3) td { font-weight: 600; }
    `;

    const doc = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
      <title>${esc(meta.title || 'Klasman')}</title><style>${css}</style></head>
      <body>${TOOLBAR}
        <div class="doc-head">
          <h1>${esc(meta.title || 'Klasman')}</h1>
          <span class="sub">${esc(meta.subtitle || '')} ${esc(meta.subtitle ? '·' : '')} ${today}</span>
        </div>
        <table><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>
        <script>window.addEventListener('load',function(){setTimeout(function(){try{window.print();}catch(e){}},250);});<\/script>
      </body></html>`;
    openPrintWindow(doc);
  };

  // ============================================================================
  //  BRAKET  (yatay A4, 32'lik dilim sayfaları)
  // ============================================================================
  // Print için bağımsız (uygulama CSS'inden bağımsız) kompakt SVG braket.
  const MW = 150, MH = 44, CS = 178, UH = 52, LH = 18;

  function matchBox(m) {
    const w1 = m.winner_entry_id && m.winner_entry_id === m.entry1_id;
    const w2 = m.winner_entry_id && m.winner_entry_id === m.entry2_id;
    const hasSets = (m.p1_sets > 0 || m.p2_sets > 0);
    const s1 = m.entry1_id ? (hasSets ? `${m.p1_sets}(${m.p1_legs})` : `${m.p1_legs ?? ''}`) : '';
    const s2 = m.entry2_id ? (hasSets ? `${m.p2_sets}(${m.p2_legs})` : `${m.p2_legs ?? ''}`) : '';
    const row = (name, score, win) =>
      `<div style="display:flex;justify-content:space-between;gap:4px;padding:3px 6px;
        ${win ? 'font-weight:700;background:#fff0f3;' : ''}border-bottom:1px solid #eee;">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(name)}</span>
        <span style="color:#ff3860;font-weight:600;flex:0 0 auto;">${esc(score)}</span></div>`;
    return `<div style="border:1px solid #ccc;border-radius:4px;overflow:hidden;font-size:10px;background:#fff;">
      ${row(lbl(m.entry1), s1, w1)}
      ${row(lbl(m.entry2), s2, w2)}</div>`;
  }

  // cols: [{label, matches:[...]}]  → sabit px'li braket HTML (svg bağlantı çizgili)
  function bracketHTML(cols) {
    cols = cols.filter(c => c.matches && c.matches.length);
    if (!cols.length) return { html: '', w: 0, h: 0 };
    const firstCount = cols[0].matches.length;
    const cy = (r, i) => i * UH * Math.pow(2, r) + UH * Math.pow(2, r) / 2;
    const totalW = (cols.length - 1) * CS + MW;
    const totalH = firstCount * UH + LH + 8;

    let svg = '';
    for (let r = 0; r < cols.length - 1; r++) {
      const prevCount = cols[r].matches.length;
      const nextCount = cols[r + 1].matches.length;
      const xR = r * CS + MW, xN = (r + 1) * CS, xM = (xR + xN) / 2;
      for (let i = 0; i < nextCount; i++) {
        const p1 = i * 2, p2 = i * 2 + 1;
        const has1 = p1 < prevCount, has2 = p2 < prevCount;
        if (!has1 && !has2) continue;
        const c1 = cy(r, p1), c2 = cy(r, p2), cm = (c1 + c2) / 2;
        if (has1) svg += `<line x1="${xR}" y1="${c1}" x2="${xM}" y2="${c1}" stroke="#bbb" stroke-width="1"/>`;
        if (has2) svg += `<line x1="${xR}" y1="${c2}" x2="${xM}" y2="${c2}" stroke="#bbb" stroke-width="1"/>`;
        if (has1 && has2) svg += `<line x1="${xM}" y1="${c1}" x2="${xM}" y2="${c2}" stroke="#bbb" stroke-width="1"/>`;
        const yC = (has1 && has2) ? cm : (has1 ? c1 : c2);
        svg += `<line x1="${xM}" y1="${yC}" x2="${xN}" y2="${yC}" stroke="#bbb" stroke-width="1"/>`;
      }
    }
    let boxes = '';
    cols.forEach((col, r) => {
      boxes += `<div style="position:absolute;top:0;left:${r * CS}px;width:${MW}px;text-align:center;
        font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.06em;line-height:${LH}px;">${esc(col.label)}</div>`;
      col.matches.forEach((m, i) => {
        const top = Math.round(cy(r, i) - MH / 2 + LH);
        boxes += `<div style="position:absolute;top:${top}px;left:${r * CS}px;width:${MW}px;">${matchBox(m)}</div>`;
      });
    });
    const html = `<div style="position:relative;width:${totalW}px;height:${totalH}px;">
      <svg style="position:absolute;top:${LH}px;left:0;width:${totalW}px;height:${totalH - LH}px;overflow:visible;">${svg}</svg>
      ${boxes}</div>`;
    return { html, w: totalW, h: totalH };
  }

  // Maçları bracket-round'a göre sütunlara çevir (round artan).
  function toColumns(matches, labelFn) {
    const byRound = {};
    for (const m of matches) (byRound[m.round] = byRound[m.round] || []).push(m);
    const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b);
    return rounds.map(rn => ({ label: labelFn(byRound[rn].length, rn), matches: byRound[rn] }));
  }

  const elimLabel = (cnt, rn) =>
    cnt === 1 ? 'Final' : cnt === 2 ? 'Yarı Final' : cnt === 4 ? 'Çeyrek Final'
    : cnt === 8 ? 'Son 16' : cnt === 16 ? 'Son 32' : `Tur ${rn}`;

  // Tek bracket'in sütunlarını 32'lik (16 maç) dilim sayfalarına böl.
  // prefix: sayfa başlığı öneki ("Üst Taraf" / "" gibi). Tek sayfaya sığıyorsa böl­me.
  function splitPages(cols, prefix) {
    if (!cols.length) return [];
    const firstCount = cols[0].matches.length;
    const totalPlayers = firstCount * 2;
    if (firstCount <= 16) {
      // 32 oyuncu veya az → tek sayfa (final dahil tüm sütunlar)
      return [{ label: prefix || '', cols }];
    }
    const PAGE_FIRST = 16;                       // 32 oyuncu = 16 maç
    const splitIdx = Math.round(Math.log2(PAGE_FIRST)); // 4 → bu sütunda dilim 1 maça iner
    const chunks = Math.ceil(firstCount / PAGE_FIRST);
    const pages = [];
    for (let c = 0; c < chunks; c++) {
      const chunkCols = [];
      for (let r = 0; r <= splitIdx && r < cols.length; r++) {
        const div = Math.pow(2, r);
        const start = Math.floor(c * PAGE_FIRST / div);
        const end = Math.floor((c + 1) * PAGE_FIRST / div);
        const ms = cols[r].matches.slice(start, end);
        if (ms.length) chunkCols.push({ label: cols[r].label, matches: ms });
      }
      if (!chunkCols.length) continue;
      const lo = c * 32 + 1, hi = Math.min((c + 1) * 32, totalPlayers);
      const pfx = prefix ? prefix + ' — ' : '';
      pages.push({ label: `${pfx}${c + 1}. Bölüm (${lo}–${hi})`, cols: chunkCols });
    }
    // Finaller sayfası: çeyrek finalden (splitIdx) sonuna kadar — dilimlerin nasıl birleştiğini gösterir
    const finalCols = cols.slice(splitIdx);
    if (finalCols.length > 1) {
      pages.push({ label: 'Finaller (Çeyrek Final → Final)', cols: finalCols, _finals: true });
    }
    return pages;
  }

  // Ekran tarafı (viewer/tv) için: sütunları 32'lik dilimlere böler, [{label, cols}] döner.
  // Tek sayfaya sığıyorsa (≤32 oyuncu) tek elemanlı dizi döner.
  window.splitBracketColumns = function (cols, prefix) {
    return splitPages(cols, prefix);
  };

  // meta: { title, subtitle, format }   format: 'single_elim' | 'double_elim' | 'round_robin'
  // matches: maç dizisi (entry1/entry2 objeleriyle, bracket/round/skor alanlarıyla)
  window.printBracket = function (meta, matches) {
    if (!matches || !matches.length) {
      alert('Bu turnuvada gösterilecek braket maçı yok.');
      return;
    }
    const fmt = meta.format || 'single_elim';
    let pages = [];

    if (fmt === 'round_robin') {
      // RR: braket yok — maçları tek sayfada liste/tek sütun olarak göster (gruplara göre)
      const groups = {};
      for (const m of matches) {
        const g = (m.group_index == null ? 0 : m.group_index);
        (groups[g] = groups[g] || []).push(m);
      }
      const gi = Object.keys(groups).map(Number).sort((a, b) => a - b);
      const cols = gi.map(g => ({
        label: gi.length > 1 ? String.fromCharCode(65 + g) + ' Grubu' : 'Round Robin',
        matches: groups[g],
        _list: true,
      }));
      pages = [{ label: '', cols, _rr: true }];
    } else {
      const wb = matches.filter(m => m.bracket === 'winners' || !m.bracket || m.bracket === 'main');
      const lb = matches.filter(m => m.bracket === 'losers');
      const fb = matches.filter(m => m.bracket === 'final');
      const isDouble = lb.length > 0 || fb.length > 0;

      const wbCols = toColumns(wb, elimLabel);
      const wbPrefix = isDouble ? 'Üst Taraf (Winners)' : '';
      pages = splitPages(wbCols, wbPrefix);

      if (isDouble) {
        // Grand Final'i kazanan tarafının finaller sayfasına ekle, yoksa ayrı.
        const fbCols = toColumns(fb, (cnt) => 'Grand Final');
        const finalsPage = pages.find(p => p._finals);
        if (finalsPage && fbCols.length) finalsPage.cols = finalsPage.cols.concat(fbCols);
        else if (fbCols.length) pages.push({ label: 'Grand Final', cols: fbCols });

        // Alt taraf (Losers) — kendi sayfası (bölmeden, ölçeklenerek sığar)
        if (lb.length) {
          const lbCols = toColumns(lb, (cnt, rn) => `LB Tur ${rn}`);
          pages.push({ label: 'Alt Taraf (Losers)', cols: lbCols });
        }
      }
    }

    renderBracketDoc(meta, pages);
  };

  // RR liste sütunu (braket çizgisiz, alt alta maç kutuları)
  function listColumnsHTML(cols) {
    const inner = cols.map(col => {
      const boxes = col.matches.map(m =>
        `<div style="margin-bottom:5px;width:${MW + 30}px;">${matchBox(m)}</div>`).join('');
      return `<div style="margin-right:18px;">
        <div style="font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px;">${esc(col.label)}</div>
        ${boxes}</div>`;
    }).join('');
    const w = cols.length * (MW + 48);
    return { html: `<div style="display:flex;align-items:flex-start;">${inner}</div>`, w, h: 0 };
  }

  function renderBracketDoc(meta, pages) {
    const today = new Date().toLocaleDateString('tr-TR');
    const total = pages.length;
    const pagesHTML = pages.map((p, idx) => {
      const built = p._rr ? listColumnsHTML(p.cols) : bracketHTML(p.cols);
      const subLabel = p.label
        ? `<div class="page-sub">${esc(p.label)}</div>` : '';
      return `<section class="page">
        <div class="doc-head">
          <h1>${esc(meta.title || 'Braket')}</h1>
          <span class="sub">${esc(meta.subtitle || '')} · ${today} · Sayfa ${idx + 1}/${total}</span>
        </div>
        ${subLabel}
        <div class="scale" data-w="${built.w}" data-h="${built.h}">
          <div class="scale-inner">${built.html}</div>
        </div>
      </section>`;
    }).join('');

    const css = BASE_CSS + `
      @page { size: A4 landscape; margin: 10mm; }
      .page { page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .page-sub { display:inline-block; font-size: 11px; font-weight: 600; color:#fff;
                  background:#444; padding: 3px 9px; border-radius: 5px; margin: 0 0 8px; }
      .scale { overflow: hidden; }
      .scale-inner { transform-origin: top left; }
    `;

    // Yazdırmadan önce her sayfanın braketini A4-yatay alanına sığacak şekilde ölçekle.
    const fitScript = `
      function fit(){
        // A4 yatay yazdırılabilir alan (~277-20=257mm gen, ~190-baş=170mm yük) px karşılığı
        var PW=960, PH=590;
        document.querySelectorAll('.scale').forEach(function(s){
          var w=+s.dataset.w||1, h=+s.dataset.h||0;
          var inner=s.querySelector('.scale-inner');
          var sc = w>0 ? PW/w : 1;
          if(h>0) sc=Math.min(sc, PH/h);
          if(sc>1) sc=1;
          inner.style.transform='scale('+sc+')';
          if(h>0){ s.style.height=Math.ceil(h*sc)+'px'; }
        });
      }
      window.addEventListener('load',function(){ fit(); setTimeout(function(){try{window.print();}catch(e){}},350); });
    `;

    const doc = `<!doctype html><html lang="tr"><head><meta charset="utf-8">
      <title>${esc(meta.title || 'Braket')}</title><style>${css}</style></head>
      <body>${TOOLBAR}${pagesHTML}<script>${fitScript}<\/script></body></html>`;
    openPrintWindow(doc);
  }
})();
