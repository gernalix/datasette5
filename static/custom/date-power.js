
(function(){
  const STRICT=/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(?:Z|[+\-]\d{2}:?\d{2})?$/;
  const pad=n=>(n<10?'0':'')+n;
  const fmt=(y,m,d,hh,mi)=>`${pad(d)}-${pad(m)}-${String(y).slice(-2)} ${pad(hh)}:${pad(mi)}`;
  function tryFmt(s){const m=(s||'').trim().match(STRICT);if(!m)return null;const[y,mo,da,hh,mi]=[+m[1],+m[2],+m[3],+m[4],+m[5]];if([y,mo,da,hh,mi].some(Number.isNaN))return null;return fmt(y,mo,da,hh,mi);}
  function processCell(td){
    if(td.dataset.datePower==='1')return;
    let raw=(td.textContent||'').trim();
    const a=td.querySelector(':scope > a'); if(a&&a.textContent&&STRICT.test(a.textContent.trim())) raw=a.textContent.trim();
    const out=tryFmt(raw); if(out){ td.title=raw; td.textContent=out; td.dataset.datePower='1'; td.classList.add('cell-date-any'); return; }
  }
  function sweep(){ document.querySelectorAll('table tbody td, table.rows-and-columns td.value').forEach(processCell); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',sweep,{once:true}); window.addEventListener('load',sweep,{once:true}); } else { sweep(); }
  try{ new MutationObserver(sweep).observe(document.documentElement,{childList:true,subtree:true}); setInterval(sweep,1000);}catch(e){}
})();
