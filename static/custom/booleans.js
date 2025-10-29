
/**
 * Unified Boolean Formatter & Click-to-Filter for Datasette tables
 * File: /static/custom/booleans.js
 *
 * Features
 * - Detects boolean-like columns automatically (1/0, true/false, ✓/✗, ✅/❌)
 * - Renders ✅ for truthy, ❌ for falsy, leaves NULL/empty truly empty (no em-dash)
 * - Clicking ✅ filters <column>=1; clicking ❌ filters <column>=0
 * - Columns that are entirely NULL/empty or entirely falsy (0/false/❌) are hidden
 * - Respects an optional /static/custom/not_booleans.txt file to skip specific columns
 *   Format of that file (per line):
 *     <table>: col1, col2, col3
 *
 * Notes
 * - Designed to work on default Datasette table pages.
 * - If a native filter form is present (#filters form), we will use query-string fallback (?col=1).
 */

(function() {
  // --- Configuration ---------------------------------------------------------
  const TRUE_TOKENS = new Set(["1", "true", "TRUE", "True", "✓", "✔", "✔️", "✅"]);
  const FALSE_TOKENS = new Set(["0", "false", "FALSE", "False", "✗", "✖", "✖️", "❌"]);

  const NOT_BOOLEAN_URLS = ["/custom/not_booleans.txt", "/static/custom/not_booleans.txt"]; // optional

  // --- Helpers ---------------------------------------------------------------
  function getCurrentTableFromURL() {
    // Expect URLs like: /<db>/<table> or /output/<table>
    const path = window.location.pathname.replace(/\/+$/,"");
    const parts = path.split("/").filter(Boolean);
    // last part is table, previous is db
    if (parts.length >= 2) {
      return decodeURIComponent(parts[parts.length - 1]);
    }
    return null;
  }

  function parseNotBooleans(text) {
    // "<table>: col1, col2" per line
    const map = {};
    text.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const m = trimmed.match(/^([^:]+):\s*(.+)$/);
      if (!m) return;
      const table = m[1].trim().toLowerCase();
      const cols = m[2].split(",").map(s => s.trim()).filter(Boolean);
      map[table] = new Set(cols.map(c => c.toLowerCase()));
    });
    return map;
  }

  function isNullishText(t) {
    if (t == null) return true;
    const s = String(t).trim();
    if (!s) return true;
    // Consider common placeholders as nullish
    return s === "—" || s === "–" || s === "-" || s.toLowerCase() === "null" || s.toLowerCase() === "none";
  }

  function classifyToken(text) {
    const s = String(text).trim();
    if (TRUE_TOKENS.has(s)) return "true";
    if (FALSE_TOKENS.has(s)) return "false";
    return "other";
  }

  function buildFilteredURL(col, val) {
    const url = new URL(window.location.href);
    // Remove any previous instances for this column
    url.searchParams.delete(col);
    // Also remove Datasette advanced filter params for that same column if they exist
    const toDelete = [];
    url.searchParams.forEach((v, k) => {
      if (k.startsWith("_filter_")) {
        // crude but safe: reset all advanced filters, since our simple filter will be explicit
        toDelete.push(k);
      }
    });
    toDelete.forEach(k => url.searchParams.delete(k));

    url.searchParams.set(col, String(val)); // simplest, SQL exact match in most setups
    return url.toString();
  }

  function hideColumn(tableEl, colIndex) {
    const ths = tableEl.querySelectorAll("thead th");
    if (ths[colIndex]) ths[colIndex].style.display = "none";
    tableEl.querySelectorAll(`tbody tr`).forEach(tr => {
      const tds = tr.children;
      if (tds[colIndex]) tds[colIndex].style.display = "none";
    });
  }

  function wrapBadge(cell, badge) {
    // Clean cell and insert badge element
    cell.textContent = ""; // wipe original
    const span = document.createElement("span");
    span.textContent = badge; // '✅' or '❌'
    span.style.cursor = "pointer";
    span.setAttribute("role", "button");
    span.setAttribute("aria-label", badge === "✅" ? "filter true" : "filter false");
    // larger touch target
    span.style.display = "inline-block";
    span.style.padding = "2px 4px";
    cell.appendChild(span);
    return span;
  }

  async function loadNotBooleans(){
    for (const url of NOT_BOOLEAN_URLS){
      try{
        const r = await fetch(url, {cache:"no-store"});
        if (r && r.ok){
          const txt = await r.text();
          const map = parseNotBooleans(txt);
          console.debug("[booleans.js] loaded not_booleans from", url, map);
          return map;
        }
      }catch(e){
        console.warn("[booleans.js] fetch failed for", url, e);
      }
    }
    console.warn("[booleans.js] not_booleans.txt NOT FOUND via any URL, treating ALL columns as boolean — check path!");
    return {};
  }

  function processTable(tableEl, tableName, notBoolMap) {
    const thead = tableEl.querySelector("thead");
    const tbody = tableEl.querySelector("tbody");
    if (!thead || !tbody) return;

    const headers = Array.from(thead.querySelectorAll("th"));
    const rows = Array.from(tbody.querySelectorAll("tr"));

    const colNames = headers.map(h => (h.textContent || "").trim());
    const lowerTable = (tableName || "").toLowerCase();
    const notSet = notBoolMap[lowerTable] || new Set();

    // Pre-scan columns
    const colScan = colNames.map(() => ({
      nonNullCount: 0,
      trueCount: 0,
      falseCount: 0,
      otherCount: 0,
      nullCount: 0,
    }));

    rows.forEach(tr => {
      Array.from(tr.children).forEach((td, idx) => {
        const raw = td.textContent;
        if (isNullishText(raw)) {
          colScan[idx].nullCount++;
          return;
        }
        const cls = classifyToken(raw);
        if (cls === "true") {
          colScan[idx].trueCount++;
          colScan[idx].nonNullCount++;
        } else if (cls === "false") {
          colScan[idx].falseCount++;
          colScan[idx].nonNullCount++;
        } else {
          colScan[idx].otherCount++;
          colScan[idx].nonNullCount++;
        }
      });
    });

    // Decide which columns are boolean-like
    const isBooleanCol = colScan.map((scan, idx) => {
      const col = (colNames[idx] || "").toLowerCase();
      if (notSet.has(col)) return false;
      // Boolean if all non-null tokens are in true/false sets (no "other")
      return scan.nonNullCount > 0 && scan.otherCount === 0;
    });

    // Hide columns that are all null/empty or entirely falsy
    isBooleanCol.forEach((isBool, idx) => {
      const scan = colScan[idx];
      const allNull = scan.nonNullCount === 0;
      const allFalse = scan.nonNullCount > 0 && scan.trueCount === 0 && scan.falseCount > 0 && (scan.falseCount + scan.nullCount) >= (scan.falseCount + scan.nullCount);
      if (allNull || allFalse) {
        hideColumn(tableEl, idx);
      }
    });

    // Render ✅/❌ and attach click-to-filter
    rows.forEach(tr => {
      Array.from(tr.children).forEach((td, idx) => {
        if (!isBooleanCol[idx]) {
          // But ensure nulls remain empty (remove em-dash or placeholder)
          if (isNullishText(td.textContent)) td.textContent = "";
          return;
        }
        const txt = (td.textContent || "").trim();
        if (isNullishText(txt)) {
          td.textContent = ""; // leave empty
          return;
        }
        const cls = classifyToken(txt);
        if (cls === "true" || cls === "false") {
          const badge = cls === "true" ? "✅" : "❌";
          const span = wrapBadge(td, badge);
          const colName = colNames[idx];
          const value = cls === "true" ? 1 : 0;
          span.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.href = buildFilteredURL(colName, value);
          }, {passive: true});
        } else {
          // Safety: leave as-is
        }
      });
    });
  }

  async function main() {
    const tableName = getCurrentTableFromURL();
    const notBooleansMap = await loadNotBooleans();

    // Support multiple tables per page (Datasette detail pages can have more than one)
    const tables = Array.from(document.querySelectorAll("table"));
    tables.forEach(t => processTable(t, tableName, notBooleansMap));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main, {once: true});
  } else {
    main();
  }
})();
