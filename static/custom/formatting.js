
(function(){
  const isInt = v => /^-?\d+$/.test(v);
  const isFloat = v => /^-?\d+\.\d+$/.test(v);
  const isISODate = v => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|Z)?)?$/.test(v);
  const isNullLike = v => v==="" || v==="null" || v==="None" || v==="NULL" || v==="NaN";

  // --- NEW: config-aware skip for link_columns.txt ---
  let LINK_CFG = null;
  async function loadLinkCfg(){
    if (LINK_CFG) return LINK_CFG;
    try{
      const r = await fetch("/custom/link_columns.txt", {cache:"no-store"});
      if(!r.ok) return LINK_CFG = {};
      const txt = await r.text();
      const map = {};
      txt.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith("#")).forEach(line=>{
        const dot = line.indexOf(".");
        if (dot === -1) return;
        const t = line.slice(0,dot), c=line.slice(dot+1);
        (map[t] ||= new Set()).add(c);
      });
      return LINK_CFG = map;
    }catch(e){ return LINK_CFG = {}; }
  }
  function currentTable(){
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "output") return decodeURIComponent(parts[1]);
    return parts.length ? decodeURIComponent(parts[parts.length-1]) : null;
  }
  function headerMap(tableEl){
    const m=new Map();
    tableEl.querySelectorAll("thead th, thead td").forEach((th, i)=>{
      const name=(th.getAttribute("data-column")||th.textContent||"").trim();
      if(name) m.set(name,i);
    });
    return m;
  }
  function isTargetedLinkCell(td, head, tableName){
    if(!LINK_CFG || !tableName || !LINK_CFG[tableName]) return false;
    const cellIdx = Array.prototype.indexOf.call(td.parentElement.children, td);
    for(const [name, idx] of head.entries()){
      if(idx === cellIdx && LINK_CFG[tableName].has(name)) return true;
    }
    return false;
  }
  // --- END NEW ---

  function classifyCell(td) {
    const raw = (td.textContent || "").trim();
    if (isNullLike(raw)) { td.classList.add("null"); td.textContent = raw ? raw : "—"; return; }
    if (isInt(raw) || isFloat(raw)) { td.classList.add("num"); return; }
    if (isISODate(raw)) { td.classList.add("mono"); return; }
    if (raw === "0" || raw.toLowerCase() === "false" ) { td.classList.add("bool"); td.innerHTML = '<span class="badge ko">No</span>'; return; }
    if (raw === "1" || raw.toLowerCase() === "true" ) { td.classList.add("bool"); td.innerHTML = '<span class="badge ok">Si</span>'; return; }
    if (raw.startsWith("/output/") || raw.startsWith("http")) { td.classList.add("link"); td.innerHTML = '<span class="badge link">'+raw+'</span>'; return; }
  }

  async function apply() {
    const tableEl = document.querySelector('#rows-and-columns table, .rows-and-columns table, main table');
    if(!tableEl) return;

    // NEW
    await loadLinkCfg();
    const tname = currentTable();
    const head = headerMap(tableEl);

    document.querySelectorAll('#rows-and-columns table tbody tr, .rows-and-columns table tbody tr, main table tbody tr').forEach(tr => {
      tr.querySelectorAll('td').forEach(td => {
        if (td.dataset.formatted === "1") return;

        // NEW: skip cells that belong to link_columns.txt targets
        if (isTargetedLinkCell(td, head, tname)) { td.dataset.formatted = "skip-link-columns"; return; }

        td.dataset.formatted = "1";
        classifyCell(td);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", apply);
  window.addEventListener("load", apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(apply, 1200);
})();