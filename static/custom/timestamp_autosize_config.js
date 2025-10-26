
/*! Timestamp Auto-Width (selector fix) */
(function () {
  const CONFIG_URL = '/custom/timestamp_columns.txt';
  const FALLBACK_PATTERNS = ['inizio','fine','*_at','*_timestamp','*_time','*_date'];

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function wildcard(name, pattern){
    name = (name||'').toLowerCase(); pattern = (pattern||'').toLowerCase();
    const esc = s => s.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*');
    return new RegExp('^'+esc(pattern)+'$').test(name);
  }
  function parseCfg(txt){
    const out = {'*':[]};
    txt.split(/\r?\n/).forEach(l=>{
      l=l.trim(); if(!l || l.startsWith('#')) return;
      const [t,...rest]=l.split(':'); if(!t||!rest.length) return;
      const cols=rest.join(':').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      const key=t.trim().toLowerCase(); (out[key] ||= []).push(...cols);
    });
    return out;
  }
  function tableName(){
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length>=2) return decodeURIComponent(parts[1]).toLowerCase();
    const h1=document.querySelector('h1'); return h1?(h1.textContent||'').trim().toLowerCase():'';
  }
  function targetCols(headers, tname, cfg){
    const pats = (cfg[tname]||[]).concat(cfg['*']||[]);
    const patterns = pats.length ? pats : FALLBACK_PATTERNS;
    const idx = new Set();
    headers.forEach((th,i)=>{
      const n=(th.textContent||'').trim().toLowerCase();
      if (patterns.some(p=>wildcard(n,p))) idx.add(i);
    });
    return idx;
  }
  function unbreak(td){ td.querySelectorAll('br').forEach(br=>br.replaceWith(document.createTextNode(' '))); }
  function visLen(node){ const a=node.querySelector?node.querySelector('a'):null;
    const s=a?(a.textContent||a.href||''):(node.textContent||''); return s.trim().length; }
  function apply(table, idxs){
    const heads=table.querySelectorAll('thead th');
    idxs.forEach(i=>{
      const th=heads[i]; let max=Math.max(visLen(th),0);
      const cells=table.querySelectorAll('tbody tr td:nth-child('+(i+1)+')');
      cells.forEach(td=>{ unbreak(td); max=Math.max(max, visLen(td)); td.classList.add('ts-no-wrap'); });
      const width=Math.max(18, Math.min(36, max+2));
      th.classList.add('ts-no-wrap'); th.style.minWidth=width+'ch';
      cells.forEach(td=> td.style.minWidth=width+'ch');
    });
  }
  function strongCSS(){
    const s=document.createElement('style');
    s.textContent=`
      table.rows-and-columns th.ts-no-wrap, table.rows-and-columns td.ts-no-wrap,
      table.table th.ts-no-wrap,           table.table td.ts-no-wrap {
        white-space: nowrap !important;
        word-break: normal !important;
        overflow-wrap: normal !important;
        hyphens: manual !important;
      }
      .table-wrapper, .content, table.rows-and-columns, table.table { overflow-x:auto; }
    `;
    document.head.appendChild(s);
  }

  async function loadCfg(){ try{ const r=await fetch(CONFIG_URL,{cache:'no-store'}); if(r.ok) return parseCfg(await r.text()); }catch(e){} return {'*':[]}; }

  function readyForMeasure(table, idxs){
    // it's ok to compute immediately; if your own formatter runs later, this still forces nowrap + min-width
    return true;
  }

  async function run(){
    strongCSS();
    const table = document.querySelector('table.rows-and-columns') || document.querySelector('table.table');
    if(!table) return;
    const headers=[...table.querySelectorAll('thead th')];
    const cfg=await loadCfg();
    const idxs=targetCols(headers, (function(){const p=location.pathname.split('/').filter(Boolean);return p.length>=2?decodeURIComponent(p[1]).toLowerCase():'';})(), cfg);
    if (idxs.size) apply(table, idxs);
  }

  onReady(run);
  window.addEventListener('load', run);
})();
