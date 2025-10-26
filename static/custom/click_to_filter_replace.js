// static/custom/click_to_filter_replace.js
(function () {
  // Esegui solo sulle pagine riga-singola di ex_sex / ex_negozi
  const { origin, pathname } = window.location;
  const m = pathname.match(/^\/output\/(ex_sex|ex_negozi)\/([^\/]+)$/);
  if (!m) return;
  const tableName = m[1]; // "ex_sex" | "ex_negozi"

  // Trova la tabella principale (quella con i dati della riga)
  // Funziona sia col DOM standard di Datasette che con temi custom
  const table = document.querySelector("table");
  if (!table) return;

  // Header -> nomi colonne
  const headers = Array.from(table.querySelectorAll("thead th, tbody tr:first-child th"));
  // Fallback: se non c'è thead, prova a ricavarli dalla prima riga dell'header della tabella a 2 colonne
  if (headers.length === 0) {
    // Datasette in vista "record" usa una tabella 2-colonne: th=colonna, td=valore per riga
    // In tal caso gestiamo click su ogni riga <tr>
  }

  // Utility: crea URL /output/<table>?<col>=<val> (sostituisce tutto il resto)
  function buildFilterUrl(col, val) {
    const base = `${origin}/output/${tableName}`;
    const qs = `${encodeURIComponent(col)}=${encodeURIComponent(val)}`;
    return `${base}?${qs}`;
  }

  // Se la tabella è “record style” (th + td per riga)
  const isRecordStyle = (() => {
    // tipico record: più <tr>, ognuno con TH=nome colonna e TD=valore
    const rows = table.querySelectorAll("tbody tr");
    if (!rows.length) return false;
    // se c'è almeno una riga con th e td, trattiamola da record-style
    return Array.from(rows).some(tr => tr.querySelector("th") && tr.querySelector("td"));
  })();

  if (isRecordStyle) {
    table.addEventListener("click", function (ev) {
      // trova il <tr> più vicino
      const tr = ev.target.closest("tr");
      if (!tr) return;
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (!th || !td) return;

      // evita click su link che NON sono valori della cella (es. "json", breadcrumb, ecc.)
      const a = ev.target.closest("a");
      if (a && !td.contains(a)) return;

      const col = (th.textContent || "").trim();
      let val = "";

      // se c'è un <a> nella cella, prendi il suo testo; altrimenti il testo puro della cella
      const linkInTd = td.querySelector("a");
      val = (linkInTd ? linkInTd.textContent : td.textContent || "").trim();

      if (!col || !val) return;

      ev.preventDefault();
      ev.stopPropagation();
      window.location.assign(buildFilterUrl(col, val));
    }, true);
    return;
  }

  // Tabella “classica” (header thead e righe con td)
  table.addEventListener("click", function (ev) {
    const td = ev.target.closest("td");
    if (!td) return;

    // evita click su link extra (breadcrumb, json, ecc.)
    const a = ev.target.closest("a");
    if (a && !td.contains(a)) return;

    const cellIndex = td.cellIndex;
    const th = headers[cellIndex];
    if (!th) return;

    const col = (th.textContent || "").trim();
    let val = "";

    const linkInTd = td.querySelector("a");
    val = (linkInTd ? linkInTd.textContent : td.textContent || "").trim();

    if (!col || !val) return;

    ev.preventDefault();
    ev.stopPropagation();
    window.location.assign(buildFilterUrl(col, val));
  }, true);
})();
