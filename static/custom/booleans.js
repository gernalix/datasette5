/* AUTO: booleans.js (authority) — not_booleans.txt ONLY */
(() => {
  const TRUE_TOKENS = new Set(["1","true","t","yes","y","✓","✔","✔️","✅"]);
  const FALSE_TOKENS = new Set(["0","false","f","no","n","✗","✖","✖️","❌","","null","none","nan"]);

  function normStr(x) {
    if (x == null) return "";
    if (typeof x === "string") return x.trim().toLowerCase();
    return String(x).trim().toLowerCase();
  }

  function parseTableFromPath() {
    try {
      const p = location.pathname.split("/").filter(Boolean);
      const i = p.indexOf("output");
      if (i >= 0 && i + 1 < p.length) return decodeURIComponent(p[i+1]);
      return p[p.length-1] || "";
    } catch { return ""; }
  }

  function getHeaders(tableEl) {
    const heads = [];
    tableEl.querySelectorAll("thead tr th").forEach(th => {
      const name = th.getAttribute("data-column") || th.textContent;
      heads.push((name || "").trim());
    });
    return heads;
  }

  async function loadNotBooleans() {
    try {
      const res = await fetch("/custom/not_booleans.txt", { cache: "no-store" });
      if (!res.ok) return {};
      const txt = await res.text();
      const map = {};
      txt.split(/\r?\n/).forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith("#") || !s.includes(":")) return;
        const [table, cols] = s.split(":", 2);
        const t = table.trim().toLowerCase();
        const set = new Set(cols.split(",").map(c => c.trim()).filter(Boolean));
        map[t] = set;
      });
      return map;
    } catch {
      return {};
    }
  }

  function asBoolToken(raw) {
    const s = normStr(raw);
    if (TRUE_TOKENS.has(s)) return true;
    if (FALSE_TOKENS.has(s)) return false;
    return null;
  }

  function inferColumnNameByIndex(headers, td) {
    const tr = td.closest("tr");
    if (!tr) return null;
    const tds = Array.from(tr.children);
    const idx = tds.indexOf(td);
    if (idx < 0 || idx >= headers.length) return null;
    return headers[idx] || null;
  }

  function renderBoolCell(td, b) {
    td.classList.add("bool-cell");
    td.dataset.bool = b ? "1" : "0";
    td.textContent = b ? "✅" : "❌";
    td.style.cursor = "pointer";
    td.title = b ? "true (1)" : "false (0)";
    td.addEventListener("click", (ev) => {
      ev.stopPropagation();
      const headers = getHeaders(td.closest("table"));
      const col = inferColumnNameByIndex(headers, td);
      if (!col) return;
      try {
        const url = new URL(location.href);
        const val = b ? "1" : "0";
        url.searchParams.set("_where", `${col}=${val}`);
        location.href = url.toString();
      } catch {}
    });
  }

  function extractRaw(td) {
    const raw = td.getAttribute("data-value") || td.getAttribute("data-raw");
    if (raw != null) return raw;
    return td.textContent || "";
  }

  async function main() {
    const tableName = parseTableFromPath().toLowerCase();
    const notBoolMap = await loadNotBooleans();
    const exclude = notBoolMap[tableName] || new Set();

    const table = document.querySelector("table.rows-and-columns, table");
    if (!table) return;
    const headers = getHeaders(table);

    table.querySelectorAll("tbody tr td").forEach(td => {
      const col = inferColumnNameByIndex(headers, td);
      if (!col) return;
      if (exclude.has(col)) return; // adhere strictly to file
      const token = asBoolToken(extractRaw(td));
      if (token === null) return;
      renderBoolCell(td, token);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
