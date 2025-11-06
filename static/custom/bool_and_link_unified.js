(function(){
  // ===== Robust loader for /-/static/custom/*.txt with fallbacks =====
  async function fetchTextMulti(paths){
    for(const p of paths){
      try{
        const r = await fetch(p, {cache:"no-store"});
        if(r.ok) return await r.text();
      }catch(e){}
    }
    return null;
  }
  function customPaths(rel){
    const clean = rel.replace(/^\/+/, "");
    const candidates = [
      "/" + clean,
      "/-/static/" + clean,
      "/-/static/custom/" + clean.replace(/^custom\//,""),
      "/static/" + clean,
      "/static/custom/" + clean.replace(/^custom\//,""),
    ];
    return [...new Set(candidates)];
  }
  async function loadMap(relUrl){
    const txt = await fetchTextMulti(customPaths(relUrl));
    if(!txt) return {};
    const map = {};
    const lines = txt.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines){
      if(line.startsWith("#")) continue;
      if(line.includes(":")){
        const [t, rest] = line.split(":");
        const cols = (rest||"").split(",").map(s=>s.trim()).filter(Boolean);
        for(const c of cols){ (map[t.trim().toLowerCase()] ||= new Set()).add(c.trim().toLowerCase()); }
      } else if(line.includes(".")){
        const [t, c] = line.split(".");
        if(t && c) (map[t.trim().toLowerCase()] ||= new Set()).add(c.trim().toLowerCase());
      }
    }
    return map;
  }

  function currentTable(){
    const parts = location.pathname.split("/").filter(Boolean);
    // typical: /<db>/<table>
    return parts.length ? decodeURIComponent(parts[parts.length-1]).toLowerCase() : null;
  }
  function findMainTable(){
    return document.querySelector(".rows-and-columns table, #rows-and-columns table, main table, .content table, table");
  }
  function headerMap(tableEl){
    const m=new Map();
    tableEl.querySelectorAll("thead th, thead td").forEach((th,i)=>{
      const name=(th.getAttribute("data-column")||th.textContent||"").trim();
      if(name) m.set(name,i);
    });
    return m;
  }
  function extractUrlFromTd(td){
    const a = td.querySelector("a[href]");
    if(a) return a.getAttribute("href");
    const raw=(td.getAttribute("data-value")||td.getAttribute("data-raw")||td.textContent||"").trim();
    let m = raw.match(/https?:\/\/[^\s"')<>]+/i);
    if(m) return m[0];
    m = raw.match(/\bwww\.[^\s"')<>]+/i);
    if(m) return "https://" + m[0];
    return null;
  }
  function makeEmojiLink(href){
    const a=document.createElement("a");
    a.href=href;
    a.textContent="➡️";
    a.setAttribute("data-unified","1");
    a.setAttribute("data-emoji-link","1");
    if(/^(https?:|mailto:|tel:|ftp:|magnet:)/i.test(href)){
      a.target="_blank";
      a.rel="noopener";
    }
    return a;
  }

  async function applyOnce(LINKS, NOTBOOL){
    const table=findMainTable();
    if(!table) return;
    const tname=currentTable();
    if(!tname) return;
    const head=headerMap(table);
    const rows=table.querySelectorAll("tbody tr");
    rows.forEach(tr=>{
      const tds=tr.children;
      for(const [colName, colIdx] of head.entries()){
        const td=tds[colIdx];
        if(!td || td.dataset.unified==="1") continue;

        // LINK columns
        const colNameLower=(colName||"").toLowerCase();
        if(LINKS[tname] && LINKS[tname].has(colNameLower)){
          const href = extractUrlFromTd(td);
          td.innerHTML="";
          if(href) td.appendChild(makeEmojiLink(href));
          td.dataset.unified="1";
          continue;
        }

        // BOOLEAN columns (not in not_booleans)
        const isNotBool = (NOTBOOL[tname] && NOTBOOL[tname].has(colName));
        if(!isNotBool){
          const raw=(td.textContent||"").trim();
          td.textContent=(raw==="1")?"✅":"❌";
          td.dataset.unified="1";
        }
      }
    });
  }

  async function run(){
    const [LINKS, NOTBOOL] = await Promise.all([
      loadMap("custom/link_columns.txt"),
      loadMap("custom/not_booleans.txt")
    ]);
    const apply=()=>applyOnce(LINKS,NOTBOOL);
    apply();
    const target=document.querySelector(".rows-and-columns, #rows-and-columns, main, .content, body")||document.body;
    const mo=new MutationObserver(apply);
    mo.observe(target,{childList:true,subtree:true});
    setInterval(apply,1200);
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",run);
  else run();
})();