
(function(){
  const isInt = v => /^-?\d+$/.test(v);
  const isFloat = v => /^-?\d+\.\d+$/.test(v);
  const isISODate = v => /^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}:\d{2}(?:\+\d{2}:\d{2}|Z)?)?$/.test(v);
  const isNullLike = v => v==="" || v==="null" || v==="None" || v==="NULL" || v==="NaN";

  function classifyCell(td) {
    const raw = (td.textContent || "").trim();
    if (isNullLike(raw)) { td.classList.add("null"); td.textContent = raw ? raw : "—"; return; }
    if (isInt(raw) || isFloat(raw)) { td.classList.add("num"); return; }
    if (isISODate(raw)) { td.classList.add("mono"); return; }
    if (raw === "0" || raw.toLowerCase() === "false" ) { td.classList.add("bool-no"); td.innerHTML = '<span class="badge ko">No</span>'; return; }
    if (raw === "1" || raw.toLowerCase() === "true" ) { td.classList.add("bool-yes"); td.innerHTML = '<span class="badge ok">Si</span>'; return; }
    if (raw.startsWith("/output/") || raw.startsWith("http")) { td.innerHTML = '<span class="badge link">'+raw+'</span>'; return; }
  }

  function apply() {
    document.querySelectorAll('#rows-and-columns table tbody tr').forEach(tr => {
      tr.querySelectorAll('td').forEach(td => {
        if (td.dataset.formatted === "1") return;
        td.dataset.formatted = "1";
        classifyCell(td);
      });
    });
  }

  document.addEventListener("DOMContentLoaded", apply);
  window.addEventListener("load", apply);
  new MutationObserver(apply).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(apply, 1200);
})();
