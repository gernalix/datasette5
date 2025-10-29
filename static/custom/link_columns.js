(function () {
  async function loadConfig() {
    try {
      const resp = await fetch("/custom/link_columns.txt", { cache: "no-store" });
      if (!resp.ok) return {};
      const txt = await resp.text();
      const lines = txt.split(/\r?\n/).map(s => s.trim()).filter(s => s && !s.startsWith("#"));
      const map = {};
      for (const line of lines) {
        const dot = line.indexOf(".");
        if (dot === -1) continue;
        const table = line.slice(0, dot);
        const col = line.slice(dot + 1);
        if (!map[table]) map[table] = new Set();
        map[table].add(col);
      }
      return map;
    } catch (e) {
      console.warn("[link_columns] errore config:", e);
      return {};
    }
  }

  function getTableFromURL() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length >= 2 && parts[0] === "output") return decodeURIComponent(parts[1]);
    return parts.length ? decodeURIComponent(parts[parts.length - 1]) : null;
  }

  function findMainTable() {
    return (
      document.querySelector(".rows-and-columns table") ||
      document.querySelector("main table, .content table, table")
    );
  }

  function headerMap(tableEl) {
    const map = new Map();
    const ths = tableEl.querySelectorAll("thead th, thead td");
    ths.forEach((th, idx) => {
      const name = (th.getAttribute("data-column") || th.textContent || "").trim();
      if (name) map.set(name, idx);
    });
    return map;
  }

  function detectURL(text) {
    if (!text) return null;
    const re = /(https?:\/\/\S+|ftp:\/\/\S+|mailto:[^\s]+|tel:[^\s]+|magnet:\?[^\s]+|www\.[^\s]+)/i;
    const m = text.match(re);
    if (!m) return null;
    let href = m[0].replace(/[)\],.;]+$/, "");
    if (/^www\./i.test(href)) href = "https://" + href;
    return href;
  }

  function makeEmojiLink(href) {
    const a = document.createElement("a");
    a.setAttribute("data-emoji-link", "1");
    a.href = href;
    a.textContent = "➡️";
    a.title = href;
    if (/^(https?:|mailto:|tel:|ftp:|magnet:)/i.test(href)) {
      a.target = "_blank";
      a.rel = "noopener";
    }
    return a;
  }

  function processCellsOnce(cfg, tableName) {
    const tableEl = findMainTable();
    if (!tableEl) return;

    const head = headerMap(tableEl);
    const targetIdx = [];
    (cfg[tableName] || []).forEach(c => { if (head.has(c)) targetIdx.push(head.get(c)); });
    if (!targetIdx.length) return;

    const rows = tableEl.querySelectorAll("tbody tr");
    rows.forEach(tr => {
      const cells = tr.children;
      targetIdx.forEach(i => {
        const td = cells[i];
        if (!td) return;

        // Se già processata, "ripulisci" eventuali elementi aggiunti dopo
        const emoji = td.querySelector("a[data-emoji-link]");
        if (emoji) {
          // elimina tutto tranne l'emoji link
          Array.from(td.childNodes).forEach(n => { if (n !== emoji) td.removeChild(n); });
          return;
        }

        const rawText = (td.textContent || "").trim();
        if (!rawText || rawText.toLowerCase() === "null") return;

        const href = detectURL(rawText);
        if (!href) return;

        td.textContent = ""; // rimuovi tutto
        td.appendChild(makeEmojiLink(href));
      });
    });
  }

  async function bootstrap() {
    const cfg = await loadConfig();
    const tableName = getTableFromURL();
    if (!tableName || !cfg[tableName]) return;

    const apply = () => processCellsOnce(cfg, tableName);
    apply();

    // Re-applica su ogni mutazione (es. quando Datasette rimpopola le celle)
    const target = document.querySelector(".rows-and-columns, main, .content, body") || document.body;
    const mo = new MutationObserver(() => apply());
    mo.observe(target, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap);
  else bootstrap();
})();