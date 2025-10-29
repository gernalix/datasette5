(function(){
  // performance-optimized: no intervals; debounced observer; only target link columns
  function debounce(fn, ms){
    let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn.apply(null,args), ms); };
  }

  async function loadConfig(){
    try{
      const r = await fetch("/custom/link_columns.txt", {cache:"no-store"});
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
    }catch(e){ console.warn("[link_columns] load fail", e); return {}; }
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
  function makeEmojiLink(href){
    const a=document.createElement("a");
    a.href=href;
    a.textContent="➡️";
    a.title=href;
    a.setAttribute("data-unified","1");
    a.setAttribute("data-emoji-link","1");
    if(/^(https?:|mailto:|tel:|ftp:|magnet:)/i.test(href)){
      a.target="_blank"; a.rel="noopener";
    }
    return a;
  }

  let CFG={};
  async function apply(){
    const tname = currentTable();
    if(!tname || !CFG[tname]) return;
    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = tableEl.tBodies && tableEl.tBodies[0] ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;
    const head = headerMap(tableEl);
    const idx = [];
    CFG[tname].forEach(c => { if(head.has(c)) idx.push(head.get(c)); });
    if(!idx.length) return;

    const rows = tbody.rows;
    for(let r=0; r<rows.length; r++){
      const tr = rows[r];
      for(const i of idx){
        const td = tr.children[i];
        if(!td || td.dataset.unified==="1") continue;
        const a = td.querySelector("a[href]");
        td.innerHTML = "";
        if(a){
          const href = a.getAttribute("href");
          td.appendChild(makeEmojiLink(href));
        }
        td.dataset.unified = "1";
      }
    }
  }

  async function run(){
    CFG = await loadConfig();
    const applyDebounced = debounce(apply, 60);
    applyDebounced();

    const tableEl = findMainTable();
    if(!tableEl) return;
    const tbody = tableEl.tBodies && tableEl.tBodies[0] ? tableEl.tBodies[0] : tableEl.querySelector("tbody");
    if(!tbody) return;
    const mo = new MutationObserver(applyDebounced);
    mo.observe(tbody, {childList:true, subtree:true});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();