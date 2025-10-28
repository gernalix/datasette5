// static/custom/calendar_range_split.js
// fetch-render with formatting + fixed width for 'inizio'/'fine'
(function(){
  function isCalendarRange(){ return /\/calendar_range(?:$|[/?#])/.test(location.pathname); }
  const qs  = (s, r)=> (r||document).querySelector(s);
  const qsa = (s, r)=> Array.from((r||document).querySelectorAll(s));

  function parseIdFromHref(href){
    try{ const u=new URL(href, location.origin);
      const seg=u.pathname.split("/").filter(Boolean);
      const last=seg.pop(); if(/^\d+$/.test(last)) return last;
      const id=u.searchParams.get("id"); if(id) return id;
    }catch(e){} return null;
  }

  function fmtDate(s){
    if(!s) return "";
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
    if(!m) return String(s);
    const [_,Y,Mo,D,h,mi] = m;
    const yy = String(+Y).slice(-2);
    return `${D}-${Mo}-${yy} ${h}:${mi}`;
  }

  async function waitForBase(timeout=2500){
    const start=Date.now();
    while(Date.now()-start<timeout){
      const tbl=qs("table.rows-and-columns");
      if(tbl && qsa("tbody tr", tbl).length) return tbl;
      await new Promise(r=>setTimeout(r,100));
    }
    return null;
  }
  function getDbName(){ const p=location.pathname.split("/").filter(Boolean); return p[0]||""; }

  async function fetchColumns(db, table){
    const sql = "select * from pragma_table_info('" + table.replace(/'/g,"''") + "') order by cid";
    const url = `/${db}.json?sql=` + encodeURIComponent(sql) + `&_shape=objects`;
    const r = await fetch(url);
    if(!r.ok) throw new Error("columns "+r.status);
    const data = await r.json();
    const rows = Array.isArray(data?.rows)?data.rows:(Array.isArray(data)?data:[]);
    return rows.map(x=>x.name);
  }

  async function fetchRows(db, table, ids){
    const where="id in ("+ids.join(",")+")";
    const params=new URLSearchParams({_shape:"objects",_size:"max",_where:where,_labels:"on"});
    const url=`/${db}/${encodeURIComponent(table)}.json?`+params.toString();
    const r=await fetch(url); if(!r.ok) throw new Error("rows "+r.status);
    const data=await r.json();
    return Array.isArray(data?.rows)?data.rows:(Array.isArray(data)?data:[]);
  }

  function renderValue(col, val, db, table){
    const lower = col.toLowerCase();
    if(lower === "link" && typeof val === "string"){
      const a=document.createElement("a"); a.href=val; a.target="_blank"; a.rel="noopener"; a.textContent="➡️"; return a;
    }
    if(lower === "id" && val != null){
       const a=document.createElement("a"); a.href=`/${db}/${encodeURIComponent(table)}/${val}`; a.textContent=String(val); return a;
    }
    if(/^(inizio|fine)$/i.test(lower) || /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(String(val||""))){
      const span=document.createElement("span"); span.textContent=fmtDate(val); return span;
    }
    if(val === 1 || val === 0 || val === "1" || val === "0" || val === true || val === false){
      const span=document.createElement("span");
      const truthy = (val === 1 || val === "1" || val === true);
      span.textContent = truthy ? "✅" : "❌";
      span.setAttribute("aria-label", truthy ? "true" : "false");
      return span;
    }
    if(val && typeof val === "object"){
      const label = val.label ?? val.title ?? val.name;
      const value = val.value ?? val.id;
      const text = (label != null ? label : (value != null ? value : ""));
      const span=document.createElement("span"); span.textContent=String(text ?? ""); return span;
    }
    const span=document.createElement("span");
    span.textContent = (val == null) ? "" : String(val);
    return span;
  }

  function applyNowrapStyles(tbl, columns){
    const lower = columns.map(c => String(c).toLowerCase());
    const inizioIdx = lower.indexOf("inizio");
    const fineIdx   = lower.indexOf("fine");
    function styleCell(td){
      td.style.whiteSpace = "nowrap";
      td.style.width = "14ch";
      td.style.minWidth = "14ch";
      td.style.maxWidth = "14ch";
      td.style.textAlign = "left";
      td.style.paddingRight = "8px";
    }
    const theadCells = tbl.querySelectorAll("thead th");
    [inizioIdx, fineIdx].forEach(idx => {
      if(idx >= 0 && theadCells[idx]) styleCell(theadCells[idx]);
    });
    tbl.querySelectorAll("tbody tr").forEach(tr => {
      const tds = tr.querySelectorAll("td");
      [inizioIdx, fineIdx].forEach(idx => {
        if(idx >= 0 && tds[idx]) styleCell(tds[idx]);
      });
    });
  }

  function renderTable(title, columns, rows, db, table){
    const frag=document.createDocumentFragment();
    const h=document.createElement("h2"); h.textContent=title; h.style.fontSize="1.15rem"; h.style.margin="1.2rem 0 0.5rem"; frag.appendChild(h);
    const tbl=document.createElement("table"); tbl.className="rows-and-columns";
    const thead=document.createElement("thead"); const hr=document.createElement("tr");
    columns.forEach(c=>{ const th=document.createElement("th"); th.textContent=c; hr.appendChild(th); });
    thead.appendChild(hr); tbl.appendChild(thead);
    const tbody=document.createElement("tbody");
    rows.forEach(row=>{
      const tr=document.createElement("tr");
      columns.forEach(col=>{
        const td=document.createElement("td");
        td.appendChild(renderValue(col, row[col], db, table));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tbl.appendChild(tbody);
    applyNowrapStyles(tbl, columns);
    frag.appendChild(tbl);
    return frag;
  }

  function removeAdvanced(){
    qsa("pre.sql, .sql").forEach(el=>el.remove());
    qsa("details, section, aside, div").forEach(el=>{ const t=(el.textContent||"").trim(); if(/^Advanced export/i.test(t)) el.remove(); });
  }

  async function run(){
    if(!isCalendarRange()) return;
    const base = await (async function(){
      const start=Date.now();
      while(Date.now()-start<2500){
        const t=qs("table.rows-and-columns"); if(t && qsa("tbody tr", t).length) return t;
        await new Promise(r=>setTimeout(r,100));
      }
      return null;
    })();
    if(!base) return;

    const db=getDbName();
    const headers=qsa("thead th", base).map(th=>(th.textContent||"").trim().toLowerCase());
    const tabIdx=headers.indexOf("tab"); const linkIdx=headers.indexOf("link"); if(tabIdx===-1||linkIdx===-1) return;
    const groups=new Map();
    qsa("tbody tr", base).forEach(tr=>{
      const tds=tr.querySelectorAll("td");
      const tab=(tds[tabIdx]?.textContent||"").trim();
      const a=tds[linkIdx]?.querySelector("a");
      const id=a?parseIdFromHref(a.href):null;
      if(!tab||!id) return;
      if(!groups.has(tab)) groups.set(tab,new Set());
      groups.get(tab).add(id);
    });
    if(!groups.size) return;

    const container=document.createElement("div"); container.id="cr-split-container"; container.style.marginTop="1rem";
    for(const [tab, idSet] of groups){
      const ids=[...idSet];
      try{
        const cols=await fetchColumns(db, tab);
        const rows=await fetchRows(db, tab, ids);
        container.appendChild(renderTable(tab, cols, rows, db, tab));
      }catch(e){ console.error("calendar_range render failed", tab, e); }
    }
    base.insertAdjacentElement("afterend", container);
    base.style.display="none";
    removeAdvanced();
  }

  function getDbName(){ const p=location.pathname.split("/").filter(Boolean); return p[0]||""; }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", run); else run();
})();