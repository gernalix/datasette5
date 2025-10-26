
(function () {
  const HEADER_PATTERNS = ['inizio','fine','timestamp','datetime','date','time'];
  const HEADER_REGEX = /(_at|_time|_timestamp|_date|_dt|^ts$|^time$|^date$)/i;

  function onReady(fn){ if(document.readyState!=='loading') fn(); else document.addEventListener('DOMContentLoaded', fn); }
  function isTsHeader(n){ if(!n) return false; n=n.trim().toLowerCase(); return HEADER_PATTERNS.includes(n)||HEADER_REGEX.test(n); }
  function textLen(node){
    // prefer anchor text if present, else textContent;
    const a = node.querySelector ? node.querySelector('a') : null;
    const s = a ? (a.textContent || a.href || '') : (node.textContent || '');
    return s.trim().length;
  }

  function unbreakBr(td){
    // Replace <br> with a space to prevent forced wrapping
    const brs = td.querySelectorAll('br');
    if(brs.length){
      brs.forEach(br => { br.replaceWith(document.createTextNode(' ')); });
    }
  }

  function fit(table){
    const heads = table.querySelectorAll('thead th');
    heads.forEach((th, idx)=>{
      const name=(th.textContent||'').trim();
      if(!isTsHeader(name)) return;

      let maxLen = Math.max(textLen(th), 0);
      const cells = table.querySelectorAll('tbody tr td:nth-child('+(idx+1)+')');
      cells.forEach(td=>{
        unbreakBr(td);
        td.classList.add('ts-no-wrap');
        maxLen = Math.max(maxLen, textLen(td));
      });

      const minCh = 18, maxCh = 34;
      const computed = Math.max(minCh, Math.min(maxCh, maxLen + 2));

      th.classList.add('ts-no-wrap');
      th.style.minWidth = computed + 'ch';
      cells.forEach(td=>{ td.style.minWidth = computed + 'ch'; });
    });
  }

  onReady(function(){
    const table = document.querySelector('table.table');
    if(!table) return;
    fit(table);
  });
})();
