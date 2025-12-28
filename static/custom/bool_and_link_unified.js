// v3
(function () {
  // ===== Robust loader for /-/static/custom/*.txt with fallbacks =====
  async function fetchTextMulti(paths) {
    for (const p of paths) {
      try {
        const r = await fetch(p, { cache: "no-store" });
        if (r.ok) return await r.text();
      } catch (e) {}
    }
    return null;
  }

  function customPaths(rel) {
    const clean = rel.replace(/^\/+/, "");
    const candidates = [
      "/" + clean,
      "/-/static/" + clean,
      "/-/static/custom/" + clean.replace(/^custom\//, ""),
      "/static/" + clean,
      "/static/custom/" + clean.replace(/^custom\//, ""),
    ];
    return [...new Set(candidates)];
  }

  // Legge file tipo:
  //   tabella: col1, col2
  //   tabella.col3
  // Restituisce: { tabella -> Set{col1, col2, col3} } tutto in lowercase
  async function loadMap(relUrl) {
    const txt = await fetchTextMulti(customPaths(relUrl));
    if (!txt) return {};
    const map = {};
    const lines = txt
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (line.startsWith("#")) continue;

      if (line.includes(":")) {
        const [t, rest] = line.split(":");
        const cols = (rest || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        for (const c of cols) {
          (map[t.trim().toLowerCase()] ||= new Set()).add(
            c.trim().toLowerCase()
          );
        }
      } else if (line.includes(".")) {
        const [t, c] = line.split(".");
        if (t && c) {
          (map[t.trim().toLowerCase()] ||= new Set()).add(
            c.trim().toLowerCase()
          );
        }
      }
    }
    return map;
  }

  // Ricava il nome della tabella dall’URL (Datasette):
  //   /output/<tabella>
  //   /output/<tabella>/<pk>
  // Supporta nomi con spazi: Datasette usa '+' nel path.
  function currentTable() {
    try {
      const parts = location.pathname.split("/").filter(Boolean);
      const i = parts.indexOf("output");
      if (i >= 0 && i + 1 < parts.length) {
        return decodeURIComponent((parts[i + 1] || "").replace(/\+/g, " ")).toLowerCase();
      }
      // fallback
      return decodeURIComponent((parts[parts.length - 1] || "").replace(/\+/g, " ")).toLowerCase();
    } catch (e) {
      return null;
    }
  }

  function findMainTable() {
    return (
      document.querySelector(
        ".rows-and-columns table, #rows-and-columns table, main table, .content table, table"
      ) || null
    );
  }

  function headerMap(tableEl) {
    const m = new Map();
    tableEl
      .querySelectorAll("thead th, thead td")
      .forEach((th, i) => {
        const name = (th.getAttribute("data-column") || th.textContent || "")
          .trim();
        if (name) m.set(name, i);
      });
    return m;
  }

  function extractUrlFromTd(td) {
    const a = td.querySelector("a[href]");
    if (a) return a.getAttribute("href");

    const raw = (
      td.getAttribute("data-value") ||
      td.getAttribute("data-raw") ||
      td.textContent ||
      ""
    ).trim();

    let m = raw.match(/https?:\/\/[^\s"')<>]+/i);
    if (m) return m[0];

    m = raw.match(/\bwww\.[^\s"')<>]+/i);
    if (m) return "https://" + m[0];

    return null;
  }

  function makeEmojiLink(href) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = "➡️";
    a.setAttribute("data-unified", "1");
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function applyOnce(LINKS, NOTBOOL) {
    const table = findMainTable();
    if (!table) return;

    const tname = currentTable();
    if (!tname) return;

    const head = headerMap(table);
    const rows = table.querySelectorAll("tbody tr");

    rows.forEach((tr) => {
      const tds = tr.children;

      for (const [colName, colIdx] of head.entries()) {
        const td = tds[colIdx];
        if (!td || td.dataset.unified === "1") continue;

        const colNameLower = (colName || "").toLowerCase();

        // Colonne LINK
        if (LINKS[tname] && LINKS[tname].has(colNameLower)) {
          const href = extractUrlFromTd(td);
          td.innerHTML = "";
          if (href) td.appendChild(makeEmojiLink(href));
          td.dataset.unified = "1";
          continue;
        }

        // Colonne BOOLEAN (eccetto quelle in not_booleans)
        // IMPORTANTE: mai toccare colonne UI/sistema di Datasette.
        if (colNameLower === "link" || colNameLower === "rowid") continue;

        const isNotBool = NOTBOOL[tname] && NOTBOOL[tname].has(colNameLower);
        if (isNotBool) continue;

        // Non convertire celle che contengono HTML (es. link, bottoni ecc.)
        if (td.querySelector("a, button, input, select, textarea")) continue;

        const raw = (td.textContent || "").trim();
        if (raw === "0" || raw === "1") {
          td.textContent = raw === "1" ? "✅" : "❌";
          td.dataset.unified = "1";
        }
      }
    });
  }

  async function run() {
    const [LINKS, NOTBOOL] = await Promise.all([
      loadMap("custom/link_columns.txt"),
      loadMap("custom/not_booleans.txt"),
    ]);

    const apply = () => applyOnce(LINKS, NOTBOOL);
    apply();

    const target =
      document.querySelector(
        ".rows-and-columns, #rows-and-columns, main, .content, body"
      ) || document.body;

    const mo = new MutationObserver(apply);
    mo.observe(target, { childList: true, subtree: true });

    setInterval(apply, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
