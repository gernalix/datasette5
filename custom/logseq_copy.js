
// logseq_copy.js v2
// Registers a *document-level* capture listener early, so it runs before click_to_filter.js.
// If the click is inside the 'logseq' column, it blocks filtering and copies the text.

(function () {
  function getCellAndHeaderInfo(target) {
    const td = target.closest && target.closest('td');
    if (!td) return null;
    const tr = td.parentElement;
    if (!tr) return null;
    const table = tr.closest('table');
    if (!table) return null;

    const cells = Array.from(tr.children);
    const colIndex = cells.indexOf(td);
    if (colIndex < 0) return null;

    const th = table.querySelectorAll('thead th')[colIndex];
    if (!th) return null;

    const colName = (th.textContent || "").trim().toLowerCase();
    return { td, colName };
  }

  function extractCellText(td) {
    return (
      td.getAttribute("data-raw") ||
      td.getAttribute("data-original") ||
      td.getAttribute("data-value") ||
      (td.textContent || "")
    ).trim();
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error("Clipboard API not available"));
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "absolute";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function showToast(message) {
    let toast = document.getElementById("logseq-copy-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "logseq-copy-toast";
      Object.assign(toast.style, {
        position: "fixed",
        bottom: "20px",
        left: "50%",
        transform: "translateX(-50%)",
        padding: "8px 12px",
        background: "#333",
        color: "#fff",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        zIndex: "9999",
        opacity: "0",
        transition: "opacity 0.2s",
        pointerEvents: "none",
        fontSize: "12px",
      });
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.style.opacity = "1";
    setTimeout(() => (toast.style.opacity = "0"), 900);
  }

  // 1) EARLY: document-level capture listener (blocks filtering for 'logseq' before other handlers)
  document.addEventListener('click', function(ev){
    const info = getCellAndHeaderInfo(ev.target);
    if (!info) return;

    if (info.colName === 'logseq') {
      ev.preventDefault();
      ev.stopPropagation();
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();

      const value = extractCellText(info.td);
      if (!value) {
        showToast("Niente da copiare");
        return;
      }
      (navigator.clipboard && navigator.clipboard.writeText
        ? copyText(value)
        : (fallbackCopy(value), Promise.resolve()))
      .then(() => showToast("Copiato: " + value))
      .catch(() => { fallbackCopy(value); showToast("Copiato: " + value); });
    }
  }, true); // capture!

  // 2) Enhance affordance on cells after DOM ready
  function tagCells(root = document) {
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
      const headers = table.querySelectorAll('thead th');
      let idx = -1;
      headers.forEach((th, i) => {
        if ((th.textContent || '').trim().toLowerCase() === 'logseq') idx = i;
      });
      if (idx < 0) return;
      table.querySelectorAll('tbody tr').forEach(tr => {
        const td = tr.children[idx];
        if (!td || td.dataset.logseqAffordance === '1') return;
        td.dataset.logseqAffordance = '1';
        td.style.cursor = 'copy';
        if (!td.title) td.title = 'Clic per copiare su clipboard';
      });
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => tagCells(), {once:true});
  } else {
    tagCells();
  }
  new MutationObserver(() => tagCells()).observe(document.body, { childList: true, subtree: true });
})();
