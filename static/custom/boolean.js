
/* boolean.js — unica autorità per rilevamento/render/click booleane
   Regole:
   - NON usa whitelist fissa; esclude solo colonne presenti in not_booleans.txt
   - Riconosce booleane se tutte le celle visibili sono in {1,0,"1","0","true","false","✅","❌","",NULL}
   - Visualizza: 1→✅, 0→❌, NULL→— (trattato come sconosciuto)
   - Click: ✅ → ?col=1 ; ❌ → ?col=0 ; — → ?col__isnull=1
   - NON altera il valore grezzo: lo conserva in data attributes per i filtri
*/
(function(){
  // Flag globale per disattivare la logica duplicata in altri file
  window.__BOOLEANS_JS_IS_AUTHORITY__ = true;

  const TRUE_TOKENS  = new Set(["1","true","✓","✔","✔️","✅"]);
  const FALSE_TOKENS = new Set(["0","false","✗","✖","✖️","❌"]);
  const NULL_TOKENS  = new Set(["", "null", "none", "nan", "undefined"]);
  const ISO_LIKE_RE  = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/i;

  // Colonne UI/sistema di Datasette che non devono MAI diventare booleane
  const ALWAYS_SKIP_COLS = new Set(["link", "rowid"]);

  // Carica esclusioni da /custom/not_booleans.txt (supporta 2 formati)
  async function loadNotBooleans(){
    try{
      const res = await fetch("/custom/not_booleans.txt", {cache:"no-store"});
      if(!res.ok) return {};
      const txt = await res.text();
      const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
      const map = {}; // {table -> Set(cols)}
      for(const line of lines){
        if(line.includes(":")){
          // "table: a, b, c"
          const [t, rest] = line.split(":",2).map(s=>s.trim());
          if(!t || !rest) continue;
          const cols = rest.split(",").map(s=>s.trim()).filter(Boolean);
          if(!map[t.toLowerCase()]) map[t.toLowerCase()] = new Set();
          for(const c of cols) map[t.toLowerCase()].add(c.toLowerCase());
        } else if(line.includes(".")){
          // "table.col"
          const [t,c] = line.split(".",2).map(s=>s.trim());
          if(!t || !c) continue;
          if(!map[t.toLowerCase()]) map[t.toLowerCase()] = new Set();
          map[t.toLowerCase()].add(c.toLowerCase());
        }
      }
      return map;
    }catch(_){ return {}; }
  }

  function currentTableName(){
    // Robusto: usa l'URL (supporta spazi -> '+')
    try {
      const parts = location.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("output");
      if (i >= 0 && i + 1 < parts.length) {
        return decodeURIComponent((parts[i+1] || "").replace(/\+/g, " ")).toLowerCase();
      }
      return decodeURIComponent((parts[parts.length-1] || "").replace(/\+/g, " ")).toLowerCase();
    } catch(_){
      return null;
    }
  }

  function headerNames(table){
    const hdr = table.querySelector("thead tr"); if(!hdr) return [];
    const names = [];
    hdr.querySelectorAll("th").forEach((th,i)=>{
      let n = th.getAttribute("data-column") || th.textContent.trim();
      const col = th.querySelector(".col"); if(col) n = col.textContent.trim();
      names[i] = n;
    });
    return names;
  }

  function normalizeToken(t){
    const x = String(t==null?"":t).trim().toLowerCase();
    if(TRUE_TOKENS.has(x))  return "1";
    if(FALSE_TOKENS.has(x)) return "0";
    if(NULL_TOKENS.has(x))  return null;
    return "__OTHER__"; // qualsiasi altro valore rende la colonna NON booleana
  }

  function looksBooleanColumn(values){
    // tutti i valori visibili devono essere in {1,0,null} dopo normalizzazione
    for(const v of values){
      const norm = normalizeToken(v);
      if(norm === "__OTHER__") return false;
      if(!(norm==="1" || norm==="0" || norm===null)) return false;
    }
    return true;
  }

  function enhanceOneTable(table, notBoolMap){
    const tname = currentTableName() || "";
    const names = headerNames(table);
    const rows  = Array.from(table.querySelectorAll("tbody tr"));
    if(!rows.length) return;

    // raccogli valori per colonna
    const visVals = names.map((_n,i)=>{
      return rows.map(tr => {
        const td = tr.querySelectorAll("td")[i];
        if(!td) return "";
        // preferisci valore grezzo
        const raw = (td.dataset && (td.dataset.rawValue || td.dataset.filterValue)) || td.textContent;
        return (raw||"").trim();
      });
    });

    // decidi booleane rispettando esclusioni
    const excluded = (notBoolMap[tname] || new Set());
    const boolCols = new Set();
    names.forEach((name, i)=>{
      const low = (name||"").toLowerCase();
      if(ALWAYS_SKIP_COLS.has(low)) return; // mai booleana
      if(excluded.has(low)) return; // esclusa
      if(ISO_LIKE_RE.test(names[i])) return; // mai: protezione inutile, ma safe
      const values = visVals[i];
      if(looksBooleanColumn(values)) boolCols.add(i);
    });

    // applica rendering + click
    rows.forEach(tr=>{
      const tds = tr.querySelectorAll("td");
      tds.forEach((td, i)=>{
        if(!boolCols.has(i)) return;
        const name = names[i];
        const raw  = (td.dataset && (td.dataset.rawValue || td.dataset.filterValue)) || td.textContent;
        const norm = normalizeToken(raw);

        // set dataset per i click
        if(norm === "1") {
          td.dataset.boolVal = "1";
          td.textContent = "✅";
        } else if (norm === "0") {
          td.dataset.boolVal = "0";
          td.textContent = "❌";
        } else {
          td.dataset.boolVal = "null";
          td.textContent = "—";
        }

        // segnala colonna booleana
        td.classList.add("bool-cell");
      });
    });

    // handler unico per click booleani
    table.addEventListener("click", function(e){
      const td = e.target.closest("td.bool-cell"); 
      if(!td) return;
      const tr = td.closest("tr"); if(!tr || tr.parentElement.tagName.toLowerCase()!=="tbody") return;

      // trova indice e nome colonna
      const all = Array.from(tr.children);
      const idx = all.indexOf(td);
      const colName = names[idx];
      if(!colName) return;

      const v = td.dataset.boolVal;
      const url = new URL(window.location.href);
      url.searchParams.delete(colName);
      url.searchParams.delete(colName + "__isnull");
      if(v === "1"){
        url.searchParams.set(colName, "1");
      } else if (v === "0"){
        url.searchParams.set(colName, "0");
      } else {
        url.searchParams.set(colName + "__isnull", "1");
      }
      window.location.assign(url.toString());
    });
  }

  async function boot(){
    try{
      const notBoolMap = await loadNotBooleans();
      const tables = document.querySelectorAll("table.ds-table");
      tables.forEach(t=>enhanceOneTable(t, notBoolMap));
    }catch(e){
      console.warn("boolean.js init error", e);
    }
  }
  document.addEventListener("DOMContentLoaded", boot);
  document.addEventListener("datasette:render-complete", boot, {once:false});
})();
