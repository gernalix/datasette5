(function(){
  // performance-optimized formatting: neutral only + booleans via not_booleans
  // no intervals; debounced observer scoped to table body

  function debounce(fn, ms){
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,args), ms); };
  }

  async function loadMap(url){
    try{
      const r = await fetch(url, {cache:"no-store"});
      if(!r.ok) return {};
      const txt = await r.text();
      const map = {};
      const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for(const line of lines){
        if(line.startsWith("#")) continue;
        if(line.includes(":")){
          const [t, rest] = line.split(":");
          const cols = (rest||"").split(",").map(s=>s.trim()).filter(Boolean);
          for(const c of cols){ (map[t.trim()] ||= new Set()).add(c); }
        } else if(line.includes(".")){
          const [t,c] = line.split(".");
          if(t && c) (map[t.trim()] ||= new Set()).add(c.trim());
        }
      }
      return map;
    }catch(e){ console.warn("[formatting] loadMap failed:", url, e); return {}; }
  }

  function currentTable(){
    const parts = location.pathname.split("/").filter(Boolean);
    if(parts.length>=2 && parts[0]==="output") return decodeURIComponent(parts[1]);
    return parts.length ? decodeURIComponent(parts[parts.length-1]) : null;
  }
  function findMainTable(){
    return document.querySelector(".rows-and-columns table, #rows-and-columns table, main table, .content table");
  }
  function headerMap(tableEl){
    const map=new Map();
    tableEl.querySelectorAll("thead th, thead td").forEach((th,i)=>{
      const name=(th.getAttribute("data-column")||th.textContent||"").trim();
      if(name) map.set(name,i);
    });
    return map;
  }

  const isInt   = v => /^-?\d+$/.test(v);
  const isFloat = v => /^-?\d+\.\d+$/.test(v);
  const isISODate = v => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|Z)?)?$/.test(v);
  const isNullLike = v => v==="" || /^(null|none|nan)$/i.test(v);

  let LINKS={}, NOTBOOL={};
  async function apply(){
    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = tableEl.tBodies && tableEl.tBodies[0] ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;

    const tname = currentTable();
    const head = headerMap(tableEl);

    const rows = tbody.rows;
    for(let r=0; r<rows.length; r++){
      const tr = rows[r];
      if (tr.dataset.fmtDone === "1") continue; // processed row
      const tds = tr.children;
      for(const [colName, colIdx] of head.entries()){
        const td = tds[colIdx];
        if(!td) continue;
        if (td.dataset && td.dataset.unified === "1") continue;
        if (tname && LINKS[tname] && LINKS[tname].has(colName)) continue;

        const raw = (td.textContent || "").trim();
        const isNotBool = (tname && NOTBOOL[tname] && NOTBOOL[tname].has(colName));
        if (!isNotBool){
          td.textContent = (raw === "1") ? "✅" : "❌";
          continue;
        }
        if (isNullLike(raw)){ td.textContent = "—"; continue; }
        if (isInt(raw) || isFloat(raw)){ td.classList.add("num"); continue; }
        if (isISODate(raw)){ td.classList.add("mono"); continue; }
      }
      tr.dataset.fmtDone = "1";
    }
  }

  async function run(){
    [LINKS, NOTBOOL] = await Promise.all([
      loadMap("/custom/link_columns.txt"),
      loadMap("/custom/not_booleans.txt")
    ]);

    const applyDebounced = debounce(apply, 60);
    applyDebounced();

    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = tableEl.tBodies && tableEl.tBodies[0] ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;

    const mo = new MutationObserver(applyDebounced);
    mo.observe(tbody, {childList: true, subtree: true});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();