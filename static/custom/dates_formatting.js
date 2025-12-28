/* AUTO v5: dates_formatting.js — robust timestamp formatting (incl. Memento mm/dd/yy) */
(() => {
  // ---------- helpers ----------
  function currentTable() {
    try {
      const seg = location.pathname.split("/").filter(Boolean);
      const i = seg.indexOf("output");
      if (i >= 0 && i + 1 < seg.length) {
        return decodeURIComponent((seg[i + 1] || "").replace(/\+/g, " "));
      }
      return seg[seg.length - 1] || "";
    } catch {
      return "";
    }
  }

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function wildcardToRegExp(pattern) {
    // supports '*' wildcard (match any, including empty)
    const p = String(pattern || "").trim();
    if (!p) return null;
    if (p === "*") return /^.*$/i;
    const re = "^" + escapeRegExp(p).replace(/\\\*/g, ".*") + "$";
    return new RegExp(re, "i");
  }

  // Parse timestamp_columns.txt rules:
  //   <tablePattern>: <colPattern1>, <colPattern2>, ...
  // Wildcards allowed via '*'. Special table name '*' applies to all.
  async function loadRules() {
    try {
      const res = await fetch("/custom/timestamp_columns.txt", { cache: "no-store" });
      if (!res.ok) return [];
      const txt = await res.text();
      const rules = [];
      txt.split(/\r?\n/).forEach((line) => {
        const s = line.trim();
        if (!s || s.startsWith("#") || !s.includes(":")) return;
        const [t, cols] = s.split(":", 2);
        const tablePattern = (t || "").trim();
        const colPatterns = (cols || "")
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean);
        if (!tablePattern || !colPatterns.length) return;
        const tableRe = wildcardToRegExp(tablePattern);
        const colRes = colPatterns.map(wildcardToRegExp).filter(Boolean);
        if (!tableRe || !colRes.length) return;
        rules.push({ tableRe, colRes });
      });
      return rules;
    } catch {
      return [];
    }
  }

  // Column-name fallback if the rules file is missing / empty
  const FALLBACK_COL_RE = /^(quando|data|timestamp|date|datetime|created_at|updated_at)$/i;

  // ---------- parsing / formatting ----------
  // Output format: dd-mm-yy HH:mm (seconds dropped)
  function formatDMYHM(dd, mm, yyyy, HH, Min) {
    const YY = String(yyyy).slice(-2);
    const d2 = String(dd).padStart(2, "0");
    const m2 = String(mm).padStart(2, "0");
    const h2 = String(HH ?? 0).padStart(2, "0");
    const n2 = String(Min ?? 0).padStart(2, "0");
    return `${d2}-${m2}-${YY} ${h2}:${n2}`;
  }

  function normalizeYear2(yy) {
    // 00-69 => 2000-2069, 70-99 => 1970-1999 (common heuristic)
    const n = Number(yy);
    return n <= 69 ? 2000 + n : 1900 + n;
  }

  function parseKnownTimestamp(raw) {
    const s = String(raw || "").trim();
    if (!s) return null;

    // Memento: MM/DD/YY [HH:MM[:SS]]
    let m = s.match(/^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$/);
    if (m) {
      const month = Number(m[1]);
      const day = Number(m[2]);
      const yearRaw = m[3];
      const year = yearRaw.length === 2 ? normalizeYear2(yearRaw) : Number(yearRaw);
      const HH = m[4] != null ? Number(m[4]) : 0;
      const Min = m[5] != null ? Number(m[5]) : 0;
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        return { day, month, year, HH, Min };
      }
    }

    // ISO-ish: YYYY-MM-DD[ HH:MM[:SS]] or YYYY-MM-DDTHH:MM...
    m = s.match(/^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?\s*$/);
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      const HH = m[4] != null ? Number(m[4]) : 0;
      const Min = m[5] != null ? Number(m[5]) : 0;
      return { day, month, year, HH, Min };
    }

    // Last resort: Date() for other formats. If it parses, convert.
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return {
        day: d.getDate(),
        month: d.getMonth() + 1,
        year: d.getFullYear(),
        HH: d.getHours(),
        Min: d.getMinutes(),
      };
    }

    return null;
  }

  // ---------- table traversal ----------
  function getHeaders(tableEl) {
    const heads = [];
    tableEl.querySelectorAll("thead tr th").forEach((th) => {
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

  function shouldFormatColumn(colName, rules, tableName) {
    if (!colName) return false;
    const col = String(colName).trim();
    if (!col) return false;
    const t = String(tableName || "");

    // rules-based
    for (const r of rules) {
      if (!r.tableRe.test(t)) continue;
      for (const cRe of r.colRes) {
        if (cRe.test(col)) return true;
      }
    }
    // fallback-based
    return FALLBACK_COL_RE.test(col);
  }

  function processTable(tableEl, rules, tableName) {
    if (!tableEl || tableEl.dataset.datesFormatted === "1") return;
    tableEl.dataset.datesFormatted = "1";

    const headers = getHeaders(tableEl);

    tableEl.querySelectorAll("tbody tr td").forEach((td) => {
      // avoid re-processing cells across observers / reflows
      if (td.dataset.datesFormatted === "1") return;

      const col = inferColumnNameByIndex(headers, td);
      if (!shouldFormatColumn(col, rules, tableName)) return;

      const raw = td.getAttribute("data-value") || td.getAttribute("data-raw") || td.textContent;
      if (!raw) return;
      const parsed = parseKnownTimestamp(raw);
      if (!parsed) return;

      td.textContent = formatDMYHM(parsed.day, parsed.month, parsed.year, parsed.HH, parsed.Min);
      td.dataset.datesFormatted = "1";
    });
  }

  async function run() {
    const tableEl = document.querySelector("table.rows-and-columns") || document.querySelector("table");
    if (!tableEl) return;
    const tableName = currentTable();
    const rules = await loadRules();
    processTable(tableEl, rules, tableName);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
