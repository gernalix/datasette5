
(function () {
  const ABS_BASE = "https://daniele.tail6b4058.ts.net:8001";

  function colIndexByHeader(table, colName) {
    const ths = table.querySelectorAll('thead th');
    let idx = -1;
    ths.forEach((th, i) => {
      const name = (th.getAttribute('data-column') || th.textContent || '').trim().toLowerCase();
      if (name === colName) idx = i;
      if (th.classList.contains('col-' + colName)) idx = i;
    });
    return idx;
  }

  function absolutize(raw) {
    const s = (raw || '').trim();
    if (!s) return null;
    return s.startsWith('http') ? s : (ABS_BASE + s);
  }

  function applyOnce(td, url) {
    if (td.dataset.fixed === "1") return;
    td.dataset.fixed = "1";
    td.innerHTML = '<a href="'+url+'" target="_blank" title="'+url+'" style="text-decoration:none;font-size:1.25em;">➡️</a>';
  }

  function apply() {
    try {
      // Direct selectors first
      document.querySelectorAll('td[data-column="link"], td.col-link').forEach(td => {
        const url = absolutize(td.textContent);
        if (url) applyOnce(td, url);
      });
      // Header-index fallback
      document.querySelectorAll('#rows-and-columns table').forEach(table => {
        const idx = colIndexByHeader(table, 'link');
        if (idx < 0) return;
        table.querySelectorAll('tbody tr').forEach(tr => {
          const tds = tr.querySelectorAll('td');
          if (idx >= tds.length) return;
          const td = tds[idx];
          const url = absolutize(td.textContent);
          if (url) applyOnce(td, url);
        });
      });
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', apply);
  window.addEventListener('load', apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(apply, 1000);
})();
