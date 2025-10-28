(function() {
  function pickText(td){
    if(!td) return "";
    const a = td.querySelector ? td.querySelector("a") : null;
    return (a ? a.textContent : td.textContent || "").trim();
  }
  function parseSmartDate(s){
    if(!s) return null;
    s = s.replace(/\u00A0/g, ' ').trim();

    // 2025-09-30 13:03 or 2025-09-30T13:03[:ss]
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [_,Y,M,D,h,mi,ss] = m;
      return new Date(Date.UTC(+Y, +M-1, +D, +h, +mi, ss?+ss:0));
    }

    // 30-09-25 13:03 -> assume 20yy
    m = s.match(/^(\d{2})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      let [_,d,mo,yy,h,mi,ss] = m;
      const Y = 2000 + (+yy);
      return new Date(Date.UTC(Y, +mo-1, +d, +h, +mi, ss?+ss:0));
    }

    // 30/09/2025 13:03
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (m) {
      const [_,d,mo,Y,h,mi,ss] = m;
      return new Date(Date.UTC(+Y, +mo-1, +d, +h, +mi, ss?+ss:0));
    }

    return null;
  }
  function diffHours(a,b){
    const da = parseSmartDate(a);
    const db = parseSmartDate(b);
    if (!da || !db) return null;
    const ms = db - da;
    if (!Number.isFinite(ms)) return null;
    return ms / 3600000;
  }
  function addDurataSum(){
    const tbl = document.querySelector("table.rows-and-columns");
    if(!tbl) return;

    const headers = [...tbl.querySelectorAll("th")].map(th => (th.textContent||"").trim().toLowerCase());
    const idxInizio = headers.indexOf("inizio");
    const idxFine   = headers.indexOf("fine");
    if (idxInizio === -1 || idxFine === -1) return;

    const rows = [...tbl.querySelectorAll("tbody tr")];
    let total = 0, used = 0;
    for (const tr of rows){
      const tds = tr.querySelectorAll("td");
      const a = pickText(tds[idxInizio]);
      const b = pickText(tds[idxFine]);
      const dur = diffHours(a,b);
      if (dur != null){ total += dur; used++; }
    }

    const p = document.createElement("div");
    let days = Math.floor(total / 24);
    let hours = Math.round(total - days * 24);
    if (hours === 24) { days += 1; hours = 0; }

    if (used > 0) {
      if (days === 0) {
        p.textContent = `Totale: ${hours} ore`;
      } else {
        p.textContent = `Totale: ${days} giorni e ${hours} ore`;
      }
    } else {
      p.textContent = `Totale: 0 ore`;
    }

    p.style = "margin:10px 0;font-weight:bold;";
    tbl.insertAdjacentElement("afterend", p);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", addDurataSum);
  else addDurataSum();
})();
