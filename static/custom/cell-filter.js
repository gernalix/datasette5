
(function(){
  function headers(t){ return [...t.querySelectorAll('thead th')].map(th=>(th.getAttribute('data-column')||th.textContent||'').trim()); }
  function hasA(td){ return !!td.querySelector('a'); }
  function raw(td){ const r=td.getAttribute('data-raw'); if(r&&r.trim()) return r.trim(); const a=td.getAttribute('aria-label'); if(a&&a.trim()) return a.trim(); return (td.textContent||'').trim(); }
  function valFor(col,td){ const txt=raw(td); const t=txt.toLowerCase(); const looksBool=/\b(bool|flag|active|enabled|vero|true|false)\b/i.test(col)||/\btype-bool\b/i.test(td.className||''); const isT=/✅|☑️|✔️/.test(txt); const isF=/❌|✖️|✕/.test(txt); if(looksBool||isT||isF||txt===''){ if(isT) return '1'; if(txt===''||isF||/^(false|0|no|n)$/.test(t)) return '0'; if(/^(true|1|yes|y|si|sì)$/.test(t)) return '1'; } return txt; }
  function urlFor(col,val){ try{ const u=new URL(location.href); const p=u.pathname.split('/').filter(Boolean); if(p.length>=2) u.pathname=`/${p[0]}/${p[1]}`; u.searchParams.set(col,val); return u.toString(); }catch(e){ return null; } }
  function bind(table){
    const hs=headers(table);
    [...table.querySelectorAll('tbody tr')].forEach(tr=>{
      [...tr.querySelectorAll('td')].forEach((td,i)=>{
        if(td.dataset.cellFilterBound==='1') return;
        if(hasA(td)) return;
        const col=(hs[i]||'').trim(); if(!col||col.toLowerCase()==='link') return;
        const val=valFor(col,td); if(!val && val!=='0') return;
        td.classList.add('cell-filter-clickable');
        if(!td.title) td.title=`Filtra per ${col} = ${val}`;
        td.addEventListener('click',ev=>{ const u=urlFor(col,val); if(!u) return; location.assign(u); ev.preventDefault(); ev.stopPropagation(); },{passive:false});
        td.dataset.cellFilterBound='1';
      });
    });
  }
  function sweep(){ document.querySelectorAll('.table-wrapper table, table.rows-and-columns').forEach(bind); }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded',sweep,{once:true}); window.addEventListener('load',sweep,{once:true}); } else { sweep(); }
  try{ new MutationObserver(sweep).observe(document.documentElement,{childList:true,subtree:true}); setInterval(sweep,1200);}catch(e){}
})();
