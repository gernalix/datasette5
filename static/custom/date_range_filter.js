// date_range_filter.js — robusto e auto-contenuto
(function () {
  function onReady(fn){ if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',fn);} else {fn();} }

  // Mini CSS inline (fallback se manca il .css)
  function injectStylesOnce(){
    if (document.getElementById('drf-inline-style')) return;
    const s = document.createElement('style');
    s.id = 'drf-inline-style';
    s.textContent = `
      .date-range-bar{display:flex;flex-direction:column;gap:6px;padding:10px 12px;margin:8px 0 12px;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:rgba(250,250,250,.8)}
      .date-range-bar .date-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
      .date-range-bar label{font-size:14px}
      .date-range-bar input[type="date"], .date-range-bar input[type="text"]{padding:6px 8px;border-radius:8px;border:1px solid rgba(0,0,0,.2)}
      .date-range-bar button{padding:6px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.15);cursor:pointer}
      .date-range-bar .date-hint{font-size:12px;opacity:.7}
    `;
    document.head.appendChild(s);
  }

  // Trova la tabella principale Datasette
  function findMainTable(){
    return document.querySelector('table.rows-and-columns, table.table');
  }

  // True se esiste una colonna "inizio"
  function hasInizioColumn(table){
    if (!table) return false;
    // 1) Datasette mette data-column su th
    if (table.querySelector('thead th[data-column="inizio"]')) return true;
    // 2) Match sul testo del th (case-insensitive, ignorando spazi)
    const ths = table.querySelectorAll('thead th');
    for (const th of ths) {
      const t = (th.getAttribute('data-column') || th.textContent || '').trim().toLowerCase();
      if (t === 'inizio') return true;
    }
    return false;
  }

  function buildUrlWith(u, kv) {
    const url = new URL(u);
    for (const [k,v] of Object.entries(kv)) {
      if (v === null || v === undefined || v === '') url.searchParams.delete(k);
      else url.searchParams.set(k, v);
    }
    return url.toString();
  }

  function ensureBar(){
    if (document.querySelector('.date-range-bar')) return; // già presente
    const table = findMainTable();
    if (!table) return;
    if (!hasInizioColumn(table)) return; // non siamo in una tabella con "inizio"

    injectStylesOnce();

    const bar = document.createElement('div');
    bar.className = 'date-range-bar';
    bar.innerHTML = `
      <div class="date-row">
        <label>Da</label>
        <input type="date" id="dr-start" inputmode="numeric" pattern="\\d{4}-\\d{2}-\\d{2}" placeholder="YYYY-MM-DD">
        <label>A</label>
        <input type="date" id="dr-end" inputmode="numeric" pattern="\\d{4}-\\d{2}-\\d{2}" placeholder="YYYY-MM-DD">
        <button id="dr-apply" type="button">Applica</button>
        <button id="dr-clear" type="button" title="Rimuovi filtro">Pulisci</button>
      </div>
      <div class="date-hint">Suggerimento: puoi digitare la data o usare il calendario (YYYY-MM-DD).</div>
    `;

    // Mettiamo la barra subito sopra la tabella
    table.parentNode.insertBefore(bar, table);

    // Prefill da URL
    const url = new URL(window.location.href);
    const startEl = bar.querySelector('#dr-start');
    const endEl = bar.querySelector('#dr-end');
    const gte = url.searchParams.get('inizio__gte');
    const lte = url.searchParams.get('inizio__lte') || url.searchParams.get('inizio__lt');
    if (gte) startEl.value = gte;
    if (lte) endEl.value = lte;

    // Applica / Pulisci
    function apply(){
      const s = startEl.value || null;
      const e = endEl.value || null;
      const href = buildUrlWith(window.location.href, {
        'inizio__gte': s,
        'inizio__lte': e
      });
      window.location.assign(href);
    }
    function clearAll(){
      const href = buildUrlWith(window.location.href, {
        'inizio__gte': null,
        'inizio__lte': null,
        'inizio__lt':  null
      });
      window.location.assign(href);
    }
    bar.querySelector('#dr-apply').addEventListener('click', apply);
    bar.querySelector('#dr-clear').addEventListener('click', clearAll);
    startEl.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
    endEl.addEventListener('keydown', e => { if (e.key === 'Enter') apply(); });
  }

  function boot(){
    // Prima iniezione
    ensureBar();
    // Se Datasette ricarica la tabella via navigazione interna, riprova
    try {
      const mo = new MutationObserver(() => ensureBar());
      mo.observe(document.body, { childList:true, subtree:true });
    } catch(e){}
  }

  // Per debuggare da console
  window.__DRF = { ensureBar, hasInizioColumn, findMainTable };

  onReady(boot);
})();