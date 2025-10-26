// custom/date_range_filter_patch.js
(function () {
  function onReady(fn){
    if(document.readyState==='loading'){
      document.addEventListener('DOMContentLoaded',fn);
    } else {fn();}
  }
  function hasCol(name){
    return Array.from(document.querySelectorAll("table th"))
      .some(th => (th.textContent || "").trim() === name);
  }
  function extend(){
    if (!window.__DRF) return; // __DRF exposed by date_range_filter.js
    const orig = window.__DRF.hasInizioColumn || function(){ return false; };
    // Extend to also recognize 'giorno' and 'ts'
    window.__DRF.hasInizioColumn = function(){
      try { return orig() || hasCol("giorno") || hasCol("ts"); }
      catch(e){ return hasCol("giorno") || hasCol("ts"); }
    };
    // Try to render the bar again
    try { window.__DRF.ensureBar(); } catch(e){}
  }
  onReady(extend);
})();