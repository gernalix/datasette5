/* link_columns.js (robust) — turn configured link columns into an "➡️" emoji link */
(() => {
  async function fetchTextMulti(paths){
    for(const p of paths){
      try{
        const r = await fetch(p, {cache:"no-store"});
        if(r.ok) return await r.text();
      }catch(e){}
    }
    return null;
  }
  function customPaths(rel){
    const clean = rel.replace(/^\/+/, "");
    const candidates = [
      "/" + clean,
      "/-/static/" + clean,
      "/-/static/custom/" + clean.replace(/^custom\//,""),
      "/static/" + clean,
      "/static/custom/" + clean.replace(/^custom\//,""),
    ];
    return [...new Set(candidates)];
  }
  async function loadLinkSpec() {
    try {
      const txt = await fetchTextMulti(customPaths("custom/link_columns.txt"));
      if (!txt) return new Set();
      const set = new Set();
      txt.split(/\r?\n/).forEach(line => {
        line = line.trim();
        if (!line || line.startsWith("#")) return;
        if (line.includes(":")) {
          const [t, rest] = line.split(":");
          rest.split(",").forEach(c => {
            c = c.trim();
            if (t && c) set.add(t.trim().toLowerCase() + "." + c.trim().toLowerCase());
          });
        } else if (line.includes(".")) {
          set.add(line.trim().toLowerCase());
        }
      });
      return set;
    } catch (e) {
      console.warn("loadLinkSpec failed", e);
      return new Set();
    }
  }
  function tableAndHeaders(table) {
    const ths = Array.from(table.querySelectorAll("thead th, thead td"));
    return ths.map(th => (th.getAttribute("data-column") || th.textContent || "").trim());
  }
  function findTdMeta(td) {
    const tr = td.parentElement;
    if (!tr) return null;
    const table = tr.closest("table");
    if (!table) return null;
    const headers = tableAndHeaders(table);
    const tds = Array.from(tr.children);
    const idx = tds.indexOf(td);
    if (idx < 0 || idx >= headers.length) return null;
    return headers[idx] || null;
  }
  function isExternal(href) { return /^https?:\/\//i.test(href || ""); }
  function extractExternalUrl(td) {
    const anchors = td.querySelectorAll("a[href]");
    for (const a of anchors) {
      const href = (a.getAttribute("href") || "").trim();
      if (isExternal(href)) return href;
    }
    const raw = td.getAttribute("data-value") || td.getAttribute("data-raw") || td.textContent || "";
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
    const ths = Array.from(tableEl.querySelectorAll("thead th, thead td"));
    const bodyTds = Array.from(tableEl.querySelectorAll("tbody td"));
    bodyTds.forEach(td => {
      if (td.dataset.linkColumnsApplied === "1") return;
      const colName = findTdMeta(td);
      if (!colName) return;
      const tr = td.parentElement;
      if (!tr) return;
      const table = tr.closest("table");
      if (!table) return;
      const pathParts = location.pathname.split("/").filter(Boolean);
      const tname = pathParts.length ? decodeURIComponent(pathParts[pathParts.length-1]).toLowerCase() : "";
      if (!tname) return;
      // allowed spec key format is "table.col"
      const key = `${tname}.${colName}`.toLowerCase(); if (!spec.has(key)) return;
      const external = extractExternalUrl(td);
      if (external) renderArrow(td, external);
    });
  }
  function observeAndEnforce(tableEl, spec) {
    const obs = new MutationObserver(() => { applyOnce(tableEl, spec); });
    obs.observe(tableEl, { childList: true, subtree: true, characterData: true, attributes: true });
    applyOnce(tableEl, spec);
  }
  async function run() {
    const table = document.querySelector("table.rows-and-columns, table");
    if (!table) return;
    const spec = await loadLinkSpec();
    observeAndEnforce(table, spec);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();