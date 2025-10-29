
/* AUTO: dates_formatting.js — restores date formatting only */
(() => {
  // Utility: parse table name from /output/<table>
  function currentTable() {
    try {
      const seg = location.pathname.split("/").filter(Boolean);
      const i = seg.indexOf("output");
      if (i >= 0 && i + 1 < seg.length) return decodeURIComponent(seg[i+1]);
      return seg[seg.length-1] || "";
    } catch { return ""; }
  }

  // Load timestamp_columns.txt mapping: expects lines like "table: col1, col2"
  async function loadTimestampMap() {
    try {
      const res = await fetch("/custom/timestamp_columns.txt", { cache: "no-store" });
      if (!res.ok) return {};
      const txt = await res.text();
      const map = {};
      txt.split(/\r?\n/).forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith("#") || !s.includes(":")) return;
        const [t, cols] = s.split(":", 2);
        const table = t.trim().toLowerCase();
        map[table] = new Set(cols.split(",").map(c => c.trim()).filter(Boolean));
      });
      return map;
    } catch {
      return {};
    }
  }

  // Format: dd-mm-yy HH:mm (24h)
  function formatDMYHM(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso; // leave as-is if not parsable
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const HH = String(d.getHours()).padStart(2, "0");
    const Min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}-${mm}-${yy} ${HH}:${Min}`;
  }

  function getHeaders(tableEl) {
    const heads = [];
    tableEl.querySelectorAll("thead tr th").forEach(th => {
      const name = th.getAttribute("data-column") || th.textContent;
      heads.push((name || "").trim());
    });
    return heads;
  }

  function inferColumnNameByIndex(headers, td) {
    const tr = td.closest("tr");
    if (!tr) return null;
    const tds = Array.from(tr.children);
    const idx = tds.indexOf(td);
    if (idx < 0 || idx >= headers.length) return null;
    return headers[idx] || null;
  }

  async function run() {
    const table = document.querySelector("table.rows-and-columns, table");
    if (!table) return;
    const headers = getHeaders(table);
    const tname = currentTable().toLowerCase();
    const tsMap = await loadTimestampMap();
    const cols = tsMap[tname] || new Set();

    if (!cols.size) return; // nothing to format for this table

    table.querySelectorAll("tbody tr td").forEach(td => {
      const col = inferColumnNameByIndex(headers, td);
      if (!col || !cols.has(col)) return;
      const raw = td.getAttribute("data-value") || td.getAttribute("data-raw") || td.textContent;
      if (!raw) return;
      const formatted = formatDMYHM(raw);
      td.textContent = formatted;
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
