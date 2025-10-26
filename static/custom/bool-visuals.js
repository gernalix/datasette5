
(function(){
  function isBoolish(name){ return /\b(bool|flag|active|enabled|vero|true|false)\b/i.test(name||''); }
  function headers(t){ return [...t.querySelectorAll('thead th')].map(th=>(th.getAttribute('data-column')||th.textContent||'').trim()); }
  function asEmoji(txt){ const t=(txt||'').trim().toLowerCase(); if(['1','true','yes','y','si','sì'].includes(t)) return '✅'; if(['0','false','no','n',''].includes(t)) return ''; return null; }
  function process(table){
    const hs=headers(table);
    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      [...tr.querySelectorAll('td')].forEach((td,i)=>{
        if(td.dataset.boolVisualized==='1')return;
        if(td.querySelector('a'))return;
        if(td.querySelector('input,button,select,textarea'))return;
        const col=(hs[i]||'').trim(); if(!(isBoolish(col) || /\btype-bool\b/i.test(td.className||''))) return;
        const raw=td.getAttribute('data-raw')||td.getAttribute('aria-label')||(td.textContent||'');
        const emoji=asEmoji(raw); if(emoji!==null){ if(!td.getAttribute('data-raw')) td.setAttribute('data-raw',(td.textContent||'').trim()); td.textContent=emoji; td.dataset.boolVisualized='1'; }
      });
    });
  }
  function sweep(){ document.querySelectorAll('.table-wrapper table, table.rows-and-columns').forEach(process); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',sweep,{once:true}); window.addEventListener('load',sweep,{once:true}); } else { sweep(); }
  try{ new MutationObserver(sweep).observe(document.documentElement,{childList:true,subtree:true}); setInterval(sweep,1200);}catch(e){}
})();
