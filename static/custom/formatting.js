/* v1: formatting.js — neutral formatting ONLY (no boolean rendering)
   - Render NULL-like cells as em dash
   - Add numeric/date CSS classes
   Booleans are handled elsewhere (boolean.js / bool_and_link_unified.js).
*/
(function(){
  function debounce(fn, ms){
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(null, args), ms);
    };
  }

  function findMainTable(){
    return document.querySelector(
      ".rows-and-columns table, #rows-and-columns table, main table, .content table"
    );
  }

  function headerMap(tableEl){
    const map = new Map();
    tableEl.querySelectorAll("thead th, thead td").forEach((th, i) => {
      const name = (th.getAttribute("data-column") || th.textContent || "").trim();
      if (name) map.set(name, i);
    });
    return map;
  }

  const isInt      = v => /^-?\d+$/.test(v);
  const isFloat    = v => /^-?\d+\.\d+$/.test(v);
  const isISODate  = v => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|Z)?)?$/.test(v);
  const isNullLike = v => v === "" || /^(null|none|nan)$/i.test(v);

  function apply(){
    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = (tableEl.tBodies && tableEl.tBodies[0]) ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;

    const head = headerMap(tableEl);
    const rows = tbody.rows;

    for(let r = 0; r < rows.length; r++){
      const tr = rows[r];
      if (tr.dataset.fmtDone === "1") continue;

      const tds = tr.children;
      for (const [_colName, colIdx] of head.entries()){
        const td = tds[colIdx];
        if(!td) continue;
        if (td.dataset && td.dataset.unified === "1") continue; // unified link/bool handlers own this cell

        // Don't clobber Datasette UI cells
        if (td.querySelector("a, button, input, select, textarea")) continue;

        const raw = (td.textContent || "").trim();
        if (isNullLike(raw)){
          td.textContent = "—";
          continue;
        }
        if (isInt(raw) || isFloat(raw)){
          td.classList.add("num");
          continue;
        }
        if (isISODate(raw)){
          td.classList.add("mono");
          continue;
        }
      }

      tr.dataset.fmtDone = "1";
    }
  }

  function run(){
    const applyDebounced = debounce(apply, 60);
    applyDebounced();

    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = (tableEl.tBodies && tableEl.tBodies[0]) ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;

    const mo = new MutationObserver(applyDebounced);
    mo.observe(tbody, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
