// static/custom/ex_super_emoji_links.js (v2)
// - Mostra 🤗 / 🍇 come link cliccabile verso ex_sex / ex_negozi
// - Nasconde la colonna figlia_id
// - Protegge i click sui link dall'essere intercettati da altri script (filtri celle)

(function () {
  const { protocol, hostname, pathname } = window.location;
  // Attivo solo su /output/ex_super (lista o record)
  if (!/^\/output\/ex_super(\/|$)/.test(pathname)) return;

  const table = document.querySelector("table");
  if (!table) return;

  // Base URL con porta fissa 8001
  function baseUrl() {
    return `${protocol}//${hostname}:8001`;
  }

  function makeUrl(figlia, figlia_id) {
    const tableName = figlia === "sex" ? "ex_sex" : "ex_negozi";
    return `${baseUrl()}/output/${tableName}/${encodeURIComponent(figlia_id)}`;
  }

  // Evita che altri listener “a cattura” blocchino il click sui nostri link
  // NB: non chiamiamo preventDefault, lasciamo la navigazione di default.
  table.addEventListener(
    "click",
    function (ev) {
      const a = ev.target.closest('a[data-direct-link="1"]');
      if (a) {
        // Impedisci ad altri handler di intercettare e trasformare il click in filtro
        ev.stopImmediatePropagation();
      }
    },
    true // capture
  );

  // Rileva record-view (TH a sinistra, TD a destra) vs table-view classica
  const isRecordStyle = (() => {
    const rows = table.querySelectorAll("tbody tr");
    if (!rows.length) return false;
    return Array.from(rows).some(tr => tr.querySelector("th") && tr.querySelector("td"));
  })();

  if (isRecordStyle) {
    const rows = Array.from(table.querySelectorAll("tbody tr"));
    let figlia = null, figliaId = null, linkTd = null, figliaIdTr = null;
    for (const tr of rows) {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) continue;
      const col = (th.textContent || "").trim();
      if (col === "figlia") figlia = (td.textContent || "").trim();
      if (col === "figlia_id") { figliaId = (td.textContent || "").trim(); figliaIdTr = tr; }
      if (col === "link") linkTd = td;
    }
    if (figlia && figliaId && linkTd) {
      const emoji = figlia === "sex" ? "🤗" : "🍇";
      const url = makeUrl(figlia, figliaId);
      linkTd.innerHTML = `<a href="${url}" data-direct-link="1" rel="noopener">${emoji}</a>`;
    }
    if (figliaIdTr) figliaIdTr.style.display = "none";
    return;
  }

  // Table-view classica
  const ths = Array.from(table.querySelectorAll("thead th"));
  const colIndex = (name) => ths.findIndex(th => (th.textContent || "").trim() === name);
  const figliaIdx = colIndex("figlia");
  const figliaIdIdx = colIndex("figlia_id");
  const linkIdx = colIndex("link");

  if (figliaIdIdx !== -1) {
    ths[figliaIdIdx].style.display = "none";
    Array.from(table.querySelectorAll("tbody tr")).forEach(tr => {
      const td = tr.children[figliaIdIdx];
      if (td) td.style.display = "none";
    });
  }

  if (figliaIdx === -1 || linkIdx === -1) return;

  Array.from(table.querySelectorAll("tbody tr")).forEach(tr => {
    const tds = tr.children;
    const figlia = (tds[figliaIdx]?.textContent || "").trim();
    const fid = (figliaIdIdx !== -1 ? tds[figliaIdIdx]?.textContent : "")?.trim();
    const linkCell = tds[linkIdx];
    if (!figlia || !fid || !linkCell) return;
    const emoji = figlia === "sex" ? "🤗" : "🍇";
    const url = makeUrl(figlia, fid);
    linkCell.innerHTML = `<a href="${url}" data-direct-link="1" rel="noopener">${emoji}</a>`;
  });
})();
