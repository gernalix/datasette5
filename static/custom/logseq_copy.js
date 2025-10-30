// logseq_copy.js
(function () {
  function attachHandlers(root = document) {
    const tables = root.querySelectorAll('table');
    tables.forEach((table) => {
      const headerCells = table.querySelectorAll('thead th');
      if (!headerCells.length) return;

      let logseqIndex = -1;
      headerCells.forEach((th, idx) => {
        const name = (th.textContent || "").trim().toLowerCase();
        if (name === "logseq") logseqIndex = idx;
      });
      if (logseqIndex === -1) return;

      const bodyRows = table.querySelectorAll('tbody tr');
      bodyRows.forEach((tr) => {
        const td = tr.children[logseqIndex];
        if (!td || td.dataset.logseqCopyAttached === "1") return;
        td.dataset.logseqCopyAttached = "1";

        td.style.cursor = "copy";
        if (!td.title) td.title = "Clic per copiare su clipboard";

        td.addEventListener(
          "click",
          (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();

            const text =
              td.getAttribute("data-raw") ||
              td.getAttribute("data-original") ||
              td.getAttribute("data-value") ||
              (td.textContent || "");
            const cleaned = (text || "").trim();
            if (!cleaned) {
              showToast("Niente da copiare");
              return;
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(cleaned).then(
                () => showToast("Copiato: " + cleaned),
                () => {
                  fallbackCopy(cleaned);
                  showToast("Copiato: " + cleaned);
                }
              );
            } else {
              fallbackCopy(cleaned);
              showToast("Copiato: " + cleaned);
            }
          },
          true
        );
      });
    });
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

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      attachHandlers();
    });
  } else {
    attachHandlers();
  }

  const mo = new MutationObserver(() => attachHandlers());
  mo.observe(document.body, { subtree: true, childList: true });
})();