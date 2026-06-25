// ============================================================================
// bracket-shared.js — TEK braket render motoru (TÜM sayfalar bunu kullanır)
// ----------------------------------------------------------------------------
// Daha önce bu fonksiyonlar viewer.js, organizer.js ve session.html içinde
// BİREBİR kopya olarak yaşıyordu. Artık tek kaynak burada. Braket görünümünü
// değiştirmek istersen SADECE bu dosyayı düzenle — her yer otomatik güncellenir.
//
// Sayfaya özel kalan tek şey: renderBracketMatch(m) — tek bir maç kutusunun
// içeriği (viewer/organizer entry tabanlı, session p1_name tabanlı). Layout
// fonksiyonları bu kutuyu `matchFn` parametresiyle ya da `window.renderBracketMatch`
// üzerinden çağırır.
//
// Bağımlılık: window.splitBracketColumns (pdf-print.js) — 32'lik dilim bölme.
// Bu dosya pdf-print.js'ten SONRA, sayfanın ana scriptinden ÖNCE yüklenmeli.
//
// NOT (TV): tv.js kendi CSS-kolon kiosk renderer'ını kullanır (farklı paradigma),
// bu motoru kullanmaz; sadece splitBracketColumns'u paylaşır.
// ============================================================================
(function () {
  'use strict';

  let _btSeq = 0;
  const _btSelected = {}; // bt id → seçili dilim index'i (yeniden render'da korunur)

  // Render başında çağır: sekme id'leri her render'da aynı sırayla üretilsin
  // (kullanıcının seçtiği 32'lik dilim, canlı güncellemede sıfırlanmasın).
  function bracketResetTabs() { _btSeq = 0; }

  function btBtnStyle(active) {
    return 'font-size:0.8rem;padding:0.3rem 0.7rem;border-radius:6px;cursor:pointer;border:1px solid var(--border);'
      + (active ? 'background:var(--accent);color:#000;font-weight:700;'
                : 'background:var(--bg-2);color:var(--text-dim);font-weight:400;');
  }

  // Braketi içinde bulunduğu kutuya yatayda sığacak şekilde ölçekler.
  // Sayfadaki TÜM .bracket-fit'leri tarar (eskiden her sayfa kendi #host'unu tarıyordu).
  function fitBrackets() {
    document.querySelectorAll('.bracket-fit').forEach(wrap => {
      const inner = wrap.querySelector('.bracket-fit-inner');
      if (!inner) return;
      inner.style.transform = 'none';
      wrap.style.height = '';
      const avail = wrap.clientWidth;
      const contentW = inner.scrollWidth;
      if (!avail || !contentW) return;
      const scale = Math.min(1, avail / contentW);
      inner.style.transform = `scale(${scale})`;
      // Ölçeklenince yükseklik de küçülür; boş alan kalmasın diye kutuyu daralt.
      wrap.style.height = (inner.scrollHeight * scale) + 'px';
    });
  }

  // Tek eleme / WB bölümleri için ikili-ağaç SVG çizgili, hizalamalı görünüm.
  function renderElimBracketSVG(columns, matchFn) {
    if (!columns.length) return '';
    // Boş sütunları ele — son maç (Final) gerçekten en sağda kalsın, hayalet sütun olmasın.
    columns = columns.filter(c => c.matches && c.matches.length);
    if (!columns.length) return '';
    const MW = 180, MH = 64, CS = 225, LH = 24, UH = 72;
    const firstCount = columns[0].matches.length;
    const cy = (r, i) => i * UH * Math.pow(2, r) + UH * Math.pow(2, r) / 2;
    const totalW = (columns.length - 1) * CS + MW;
    const totalH = firstCount * UH + LH + 8;

    let svgLines = '';
    for (let r = 0; r < columns.length - 1; r++) {
      const prevCount = columns[r].matches.length;
      const nextCount = columns[r + 1].matches.length;
      const xR = r * CS + MW, xN = (r + 1) * CS, xM = (xR + xN) / 2;
      for (let i = 0; i < nextCount; i++) {
        // Bu çocuk maçın iki ebeveyni: 2i ve 2i+1. Sadece GERÇEKTEN var olan
        // ebeveynler için çizgi çiz — yoksa boşluğa sarkan çizgiler kalıyor.
        const p1 = i * 2, p2 = i * 2 + 1;
        const has1 = p1 < prevCount, has2 = p2 < prevCount;
        if (!has1 && !has2) continue;
        const c1 = cy(r, p1), c2 = cy(r, p2), cm = (c1 + c2) / 2;
        if (has1) svgLines += `<line x1="${xR}" y1="${c1}" x2="${xM}" y2="${c1}" stroke="var(--border)" stroke-width="1.5"/>`;
        if (has2) svgLines += `<line x1="${xR}" y1="${c2}" x2="${xM}" y2="${c2}" stroke="var(--border)" stroke-width="1.5"/>`;
        if (has1 && has2) svgLines += `<line x1="${xM}" y1="${c1}" x2="${xM}" y2="${c2}" stroke="var(--border)" stroke-width="1.5"/>`;
        // Çocuğa giden yatay çizgi: tek ebeveyn varsa onun hizasından gitsin.
        const yChild = (has1 && has2) ? cm : (has1 ? c1 : c2);
        svgLines += `<line x1="${xM}" y1="${yChild}" x2="${xN}" y2="${yChild}" stroke="var(--border)" stroke-width="1.5"/>`;
      }
    }

    let html = '';
    columns.forEach((col, r) => {
      html += `<div style="position:absolute;top:0;left:${r * CS}px;width:${MW}px;text-align:center;font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;line-height:${LH}px;">${col.label}</div>`;
      col.matches.forEach((m, i) => {
        const top = Math.round(cy(r, i) - MH / 2 + LH);
        html += `<div style="position:absolute;top:${top}px;left:${r * CS}px;width:${MW}px;">${matchFn(m)}</div>`;
      });
    });

    // Braket kutuya sığsın diye: sabit px'li iç katman, dışarıda ölçeklenir (fitBrackets).
    return `<div class="bracket-fit" style="padding-bottom:0.5rem;overflow:hidden;">
      <div class="bracket-fit-inner" style="position:relative;width:${totalW}px;height:${totalH}px;transform-origin:top left;">
        <svg style="position:absolute;top:${LH}px;left:0;width:${totalW}px;height:${totalH - LH}px;pointer-events:none;overflow:visible;">${svgLines}</svg>
        ${html}
      </div>
    </div>`;
  }

  // Losers-braketi / Grand Final gibi ikili-ağaç OLMAYAN sütunları çizer.
  // Bağlantı çizgileri her maçın GERÇEK hedefine (next_winner_match_id) göre çizilir;
  // winners'taki 2^r varsayımı burada geçerli değil. Kutular sütun içinde eşit aralıklı.
  function renderLinkedBracketSVG(columns, matchFn) {
    columns = columns.filter(c => c.matches && c.matches.length);
    if (!columns.length) return '';
    const MW = 180, MH = 64, CS = 225, LH = 24, UH = 72;
    const counts = columns.map(c => c.matches.length);
    const maxCount = Math.max(...counts);
    const bodyH = maxCount * UH;
    const totalW = (columns.length - 1) * CS + MW;
    const totalH = bodyH + LH + 8;
    const yOf = (c, i) => (bodyH - counts[c] * UH) / 2 + i * UH + UH / 2;
    const pos = {};
    columns.forEach((col, c) => col.matches.forEach((m, i) => { if (m && m.id != null) pos[m.id] = { c, i }; }));

    let svgLines = '';
    columns.forEach((col, c) => {
      if (c === columns.length - 1) return;
      col.matches.forEach((m, i) => {
        const tgt = m && m.next_winner_match_id;
        if (tgt == null || !pos[tgt]) return;
        const { c: tc, i: ti } = pos[tgt];
        if (tc <= c) return;
        const x1 = c * CS + MW, x2 = tc * CS, xm = (x1 + x2) / 2;
        const y1 = yOf(c, i), y2 = yOf(tc, ti);
        svgLines += `<line x1="${x1}" y1="${y1}" x2="${xm}" y2="${y1}" stroke="var(--border)" stroke-width="1.5"/>`;
        svgLines += `<line x1="${xm}" y1="${y1}" x2="${xm}" y2="${y2}" stroke="var(--border)" stroke-width="1.5"/>`;
        svgLines += `<line x1="${xm}" y1="${y2}" x2="${x2}" y2="${y2}" stroke="var(--border)" stroke-width="1.5"/>`;
      });
    });

    let html = '';
    columns.forEach((col, c) => {
      html += `<div style="position:absolute;top:0;left:${c * CS}px;width:${MW}px;text-align:center;font-size:0.7rem;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.07em;line-height:${LH}px;">${col.label}</div>`;
      col.matches.forEach((m, i) => {
        const top = Math.round(yOf(c, i) - MH / 2 + LH);
        html += `<div style="position:absolute;top:${top}px;left:${c * CS}px;width:${MW}px;">${matchFn(m)}</div>`;
      });
    });

    return `<div class="bracket-fit" style="padding-bottom:0.5rem;overflow:hidden;">
      <div class="bracket-fit-inner" style="position:relative;width:${totalW}px;height:${totalH}px;transform-origin:top left;">
        <svg style="position:absolute;top:${LH}px;left:0;width:${totalW}px;height:${totalH - LH}px;pointer-events:none;overflow:visible;">${svgLines}</svg>
        ${html}
      </div>
    </div>`;
  }

  // >32 oyuncu → 32'lik dilim sekmeleri (bölme mantığı pdf-print.js ile ortak).
  // matchFn verilmezse window.renderBracketMatch kullanılır (sayfaya özel kutu).
  function renderBracketWithTabs(columns, prefix, matchFn) {
    matchFn = matchFn || window.renderBracketMatch;
    const split = window.splitBracketColumns
      ? window.splitBracketColumns(columns, prefix || '')
      : [{ label: '', cols: columns }];
    if (split.length <= 1) return renderElimBracketSVG(columns, matchFn);
    const id = 'bt' + (++_btSeq);
    let active = _btSelected[id] ?? 0;
    if (active >= split.length) active = 0; // dilim sayısı azaldıysa güvenli düş
    _btSelected[id] = active;
    const bar = split.map((p, i) =>
      `<button class="bt-btn" data-bt="${id}" data-i="${i}" onclick="selectBracketTab('${id}',${i})" style="${btBtnStyle(i === active)}">${p.label}</button>`
    ).join('');
    const panes = split.map((p, i) =>
      `<div class="bt-pane" data-bt="${id}" data-i="${i}" ${i === active ? '' : 'hidden'}>${renderElimBracketSVG(p.cols, matchFn)}</div>`
    ).join('');
    return `<div class="bracket-tabs" data-bt="${id}">
      <div style="display:flex;flex-wrap:wrap;gap:0.4rem;margin-bottom:0.6rem;">${bar}</div>
      ${panes}</div>`;
  }

  function selectBracketTab(id, idx) {
    _btSelected[id] = idx; // seçimi hatırla — state yenilenince geri dönmesin
    document.querySelectorAll('.bt-btn[data-bt="' + id + '"]').forEach(b => {
      b.style.cssText = btBtnStyle(+b.dataset.i === idx);
    });
    document.querySelectorAll('.bt-pane[data-bt="' + id + '"]').forEach(p => {
      p.hidden = +p.dataset.i !== idx;
    });
    fitBrackets();
  }

  // Pencere yeniden boyutlanınca (TV/izleyici döndürme vb.) yeniden sığdır.
  window.addEventListener('resize', () => {
    clearTimeout(window.__fitBracketsTO);
    window.__fitBracketsTO = setTimeout(fitBrackets, 150);
  });

  // Dışa aç
  window.bracketResetTabs = bracketResetTabs;
  window.btBtnStyle = btBtnStyle;
  window.fitBrackets = fitBrackets;
  window.renderElimBracketSVG = renderElimBracketSVG;
  window.renderLinkedBracketSVG = renderLinkedBracketSVG;
  window.renderBracketWithTabs = renderBracketWithTabs;
  window.selectBracketTab = selectBracketTab;
})();
