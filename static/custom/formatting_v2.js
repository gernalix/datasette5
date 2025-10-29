(function(){
  console.log("[formatting_v2] applied");

  // Load config maps from files that accept either "table.column" or "table: col1, col2"
  async function loadMap(url){
    try{
      const r = await fetch(url, {cache:"no-store"});
      if(!r.ok) return {};
      const txt = await r.text();
      const map = {};
      const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      for(const line of lines){
        if (line.startsWith("#")) continue;
        if (line.includes(":")){
          const [t, rest] = line.split(":");
          const cols = (rest||"").split(",").map(s=>s.trim()).filter(Boolean);
          for(const c of cols){ (map[t.trim()] ||= new Set()).add(c); }
        } else if (line.includes(".")){
          const [t, c] = line.split(".");
          if(t && c) (map[t.trim()] ||= new Set()).add(c.trim());
        }
      }
      return map;
    }catch(e){ console.warn("[formatting_v2] loadMap failed:", url, e); return {}; }
  }

  function currentTable(){
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length>=2 && parts[0]==="output") return decodeURIComponent(parts[1]);
    return parts.length ? decodeURIComponent(parts[parts.length-1]) : null;
  }

  function findMainTable(){
    return (
      document.querySelector(".rows-and-columns table") ||
      document.querySelector("#rows-and-columns table") ||
      document.querySelector("main table, .content table, table")
    );
  }

  function headerMap(tableEl){
    const map = new Map();
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

  async function applyOnce(LINKS, NOTBOOL){
    const tableEl = findMainTable();
    if(!tableEl) return;

    const tname = currentTable();
    const head = headerMap(tableEl);

    const rows = tableEl.querySelectorAll("tbody tr");
    rows.forEach(tr => {
      const tds = tr.children;
      for (const [colName, colIdx] of head.entries()){
        const td = tds[colIdx];
        if (!td) continue;

        // Never touch cells already unified (links/booleans handled elsewhere)
        if (td.dataset && td.dataset.unified === "1") continue;

        // Skip columns in link_columns.txt
        if (tname && LINKS[tname] && LINKS[tname].has(colName)) continue;

        // Skip columns that are considered booleans (i.e., NOT listed in not_booleans.txt)
        const isNotBool = (tname && NOTBOOL[tname] && NOTBOOL[tname].has(colName));
        if (!isNotBool) continue;

        // Neutral presentation formatting only
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
        // everything else: leave as-is
      }
    });
  }

  async function run(){
    const [LINKS, NOTBOOL] = await Promise.all([
      loadMap("/custom/link_columns.txt"),
      loadMap("/custom/not_booleans.txt")
    ]);
    const apply = () => applyOnce(LINKS, NOTBOOL);
    apply();
    const target = document.querySelector(".rows-and-columns, #rows-and-columns, main, .content, body") || document.body;
    const mo = new MutationObserver(apply);
    mo.observe(target, {childList:true, subtree:true});
    setInterval(apply, 1500);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();