// custom/date_range_calendar_shim.js
// Minimal activator for the date filter on /calendar_range only, using the 'giorno' column exclusively.
(function(){
  function onReady(fn){
    if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', fn); }
    else { fn(); }
  }
  function isCalendarRange(){
    return /\/calendar_range(?:$|[/?#])/.test(location.pathname);
  }
  function hasGiorno(){
    return Array.from(document.querySelectorAll('table th'))
      .some(th => (th.textContent || '').trim() === 'giorno');
  }
  function activate(){
    if(!isCalendarRange()) return;
    if(!window.__DRF || typeof window.__DRF.ensureBar !== 'function') return;
    // Save original (if any) and override to only consider 'giorno'
    var orig = window.__DRF.hasInizioColumn || function(){ return false; };
    window.__DRF.hasInizioColumn = function(){
      try { return orig() || hasGiorno(); }
      catch(e){ return hasGiorno(); }
    };
    try { window.__DRF.ensureBar(); } catch(e){}
  }
  onReady(activate);
})();