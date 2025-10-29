
/* AUTO: hide_false_empty_columns.js v2 */
(() => {
  const FALSE_TOKENS = new Set(["0","false","f","no","n","✗","✖","✖️","❌","","null","none","nan"]);
  const MAX_RETRIES = 10;
  const RETRY_MS = 80;

  function normStr(s) {
    if (s == null) return "";
    return String(s).replace(/\u200B|\u200C|\u200D|\u00A0/g, " ").trim().toLowerCase();
  }

  function isFalseOrEmpty(td) {
    // If booleans.js set a definitive flag, use it
    const flag = td?.dataset?.bool;
    if (flag === "0") return true;   // false counts as hideable
    if (flag === "1") return false;  // true makes the column visible

    // Else infer from text
    const raw = td.getAttribute("data-value") || td.getAttribute("data-raw") || td.textContent;
    const s = normStr(raw);
    if (s === "") return true;            // empty
    if (FALSE_TOKENS.has(s)) return true; // false-like
    return false;
  }

  function getHeaderCount(tableEl) {
    const ths = tableEl.querySelectorAll("thead tr th");
    if (ths.length) return ths.length;
    // fallback: use first row cells
    const firstRow = tableEl.querySelector("tbody tr");
    return firstRow ? firstRow.children.length : 0;
  }

  function hideColumn(tableEl, idx) {
    tableEl.querySelectorAll(`thead tr th:nth-child(${idx+1})`).forEach(th => th.classList.add("col-hidden-auto"));
    tableEl.querySelectorAll(`tbody tr`).forEach(tr => {
      const td = tr.children[idx];
      if (td) td.classList.add("col-hidden-auto");
    });
  }

  function showAll(tableEl) {
    tableEl.querySelectorAll(".col-hidden-auto").forEach(el => el.classList.remove("col-hidden-auto"));
  }

  function analyze(tableEl) {
    const rows = Array.from(tableEl.querySelectorAll("tbody tr"));
    if (!rows.length) return;
    const cols = getHeaderCount(tableEl);
    if (!cols) return;

    for (let c = 0; c < cols; c++) {
      let hideable = true;
      for (const tr of rows) {
        const td = tr.children[c];
        if (!td) continue;
        if (!isFalseOrEmpty(td)) { hideable = false; break; }
      }
      if (hideable) hideColumn(tableEl, c);
    }
  }

  function styleOnce() {
    if (document.getElementById("auto-hide-cols-style")) return;
    const st = document.createElement("style");
    st.id = "auto-hide-cols-style";
    st.textContent = `.col-hidden-auto{display:none !important;}`;
    document.head.appendChild(st);
  }

  function anyBoolTagged(tableEl) {
    return !!tableEl.querySelector("td[data-bool]");
  }

  function runWithRetries(tableEl, retries=MAX_RETRIES) {
    showAll(tableEl);
    // If booleans.js hasn't tagged anything yet, wait a little, but don't block forever
    if (!anyBoolTagged(tableEl) && retries > 0) {
      return setTimeout(() => runWithRetries(tableEl, retries-1), RETRY_MS);
    }
    analyze(tableEl);
  }

  function setup() {
    styleOnce();
    const table = document.querySelector("table.rows-and-columns, table");
    if (!table) return;

    // Observe for dynamic updates
    const obs = new MutationObserver(() => runWithRetries(table));
    obs.observe(table, { childList: true, subtree: true, characterData: true, attributes: true });

    // Initial run
    runWithRetries(table);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
