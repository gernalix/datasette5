// Nasconde i blocchi SQL "CREATE VIEW ..." da qualsiasi tabella/view.
(function() {
  const pattern = /CREATE\s+VIEW/i;
  function hideBlocks() {
    document.querySelectorAll('pre, code').forEach(el => {
      const txt = el.textContent || "";
      if (pattern.test(txt)) {
        const container = el.closest('section, div, article, details, pre, code');
        if (container) container.remove();
        else el.remove();
      }
    });
  }
  hideBlocks();
  new MutationObserver(hideBlocks).observe(document.body, { childList: true, subtree: true });
})();
