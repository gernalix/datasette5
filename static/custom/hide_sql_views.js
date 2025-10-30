// Nasconde SOLO il testo dell'SQL delle view senza toccare le altre sezioni
// Limitato a /output/calendar_range per evitare effetti collaterali (es. "Referenced by").
(function() {
  function hideBlocks() {
    if (!/\/output\/calendar_range(\/|$)/.test(location.pathname)) return;
    const pattern = /CREATE\s+VIEW|AS\s+SELECT/i;
    document.querySelectorAll('pre, code').forEach(el => {
      const txt = el.textContent || "";
      if (pattern.test(txt)) {
        // Non rimuovere il container: nascondi solo il blocco corrente
        el.style.display = 'none';
      }
    });
    // Nascondi link "View and edit SQL" sulla stessa pagina
    Array.from(document.querySelectorAll('a, button')).forEach(el => {
      const txt = (el.textContent || '').trim().toLowerCase();
      if (txt === 'view and edit sql' || txt === 'view sql' || txt === 'sql') {
        el.style.display = 'none';
      }
    });
  }
  hideBlocks();
  new MutationObserver(hideBlocks).observe(document.body, { childList: true, subtree: true });
})();