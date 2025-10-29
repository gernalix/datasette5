
/* AUTO: link_columns.js v2 — force external links for configured columns, with MutationObserver */
(() => {
  function currentTable() {
    try {
      const seg = location.pathname.split("/").filter(Boolean);
      const i = seg.indexOf("output");
      if (i >= 0 && i + 1 < seg.length) return decodeURIComponent(seg[i+1]);
      return seg[seg.length-1] || "";
    } catch { return ""; }
  }

  async function loadLinkSpec() {
    try {
      const res = await fetch("/custom/link_columns.txt", { cache: "no-store" });
      if (!res.ok) return new Set();
      const txt = await res.text();
      const set = new Set();
      txt.split(/\r?\n/).forEach(line => {
        const s = line.trim();
        if (!s || s.startsWith("#")) return;
        if (s.includes(".")) set.add(s.toLowerCase());
      });
      return set;
    } catch {
      return new Set();
    }
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

  function isExternal(href) {
    return /^https?:\/\//i.test(href || "");
  }

  function extractExternalUrl(td) {
    // 1) Look for existing external anchors
    const anchors = td.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = (a.getAttribute("href") || "").trim();
      if (isExternal(href)) return href;
    }
    // 2) Try from data-value / data-raw / text
    const raw = td.getAttribute("data-value") || td.getAttribute("data-raw") || td.textContent || "";
    // Prefer explicit URLs
    const m = raw.match(/https?:\/\/[^\s"')<>]+/i);
    if (m) return m[0];
    const m2 = raw.match(/\bwww\.[^\s"')<>]+/i);
    if (m2) return "https://" + m2[0];
    return null;
  }

  function renderArrow(td, url) {
    if (!url) return;
    td.innerHTML = "";
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = "➡️";
    a.title = url;
    td.appendChild(a);
    td.dataset.linkColumnsApplied = "1";
  }

  function applyOnce(tableEl, spec) {
    const headers = getHeaders(tableEl);
    const tname = currentTable().toLowerCase();
    tableEl.querySelectorAll("tbody tr td").forEach(td => {
      const col = inferColumnNameByIndex(headers, td);
      if (!col) return;
      const key = `${tname}.${col}`.toLowerCase();
      if (!spec.has(key)) return;

      // If we've already applied, skip
      if (td.dataset.linkColumnsApplied === "1") return;

      const external = extractExternalUrl(td);
      if (external) {
        renderArrow(td, external);
      } else {
        // If there's an internal link currently, we still want to try to remove it only if we can find an external URL.
        // If no external URL can be found, we leave it untouched (user asked to avoid internal fallback).
      }
    });
  }

  function observeAndEnforce(tableEl, spec) {
    const obs = new MutationObserver(() => {
      applyOnce(tableEl, spec);
    });
    obs.observe(tableEl, { childList: true, subtree: true, characterData: true, attributes: true });
    // Initial apply
    applyOnce(tableEl, spec);
  }

  async function run() {
    const table = document.querySelector("table.rows-and-columns, table");
    if (!table) return;
    const spec = await loadLinkSpec();
    observeAndEnforce(table, spec);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
