(function(){
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
          const [t, c] = line.split(".");
          if(t && c) (map[t.trim()] ||= new Set()).add(c.trim());
        }
      }
      return map;
    }catch(e){ console.warn("loadMap fail",url,e); return {}; }
  }

  function currentTable(){
    const parts = location.pathname.split("/").filter(Boolean);
    if(parts.length>=2 && parts[0]==="output") return decodeURIComponent(parts[1]);
    return parts.length ? decodeURIComponent(parts[parts.length-1]) : null;
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

  function makeEmojiLink(href){
    const a=document.createElement("a");
    a.href=href;
    a.textContent="➡️";
    a.title=href;
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
        if(LINKS[tname] && LINKS[tname].has(colName)){
          const a=td.querySelector("a[href]");
          if(a){
            const href=a.getAttribute("href");
            td.innerHTML="";
            td.appendChild(makeEmojiLink(href));
            td.dataset.unified="1";
          }else{
            td.innerHTML="";
            td.dataset.unified="1";
          }
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
      loadMap("/custom/link_columns.txt"),
      loadMap("/custom/not_booleans.txt")
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