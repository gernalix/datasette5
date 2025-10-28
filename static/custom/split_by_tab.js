// static/custom/split_by_tab.js
(function(){
  function onReady(fn){
    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function isCalendarRange(){
    return /\/calendar_range(?:$|[/?#])/.test(location.pathname);
  }
  function splitByTab(){
    const baseTable = document.querySelector("table.rows-and-columns");
    if(!baseTable) return;

    // Find header names and index of 'tab'
    const headers = Array.from(baseTable.querySelectorAll("thead th")).map(th => (th.textContent || "").trim().toLowerCase());
    const tabIdx = headers.indexOf("tab");
    if(tabIdx === -1) return;

    const groups = new Map(); // tabName -> [cloned TRs]
    const rows = Array.from(baseTable.querySelectorAll("tbody tr"));
    if(!rows.length) return;

    for(const tr of rows){
      const tds = tr.querySelectorAll("td");
      if(!tds[tabIdx]) continue;
      const tabName = (tds[tabIdx].textContent || "").trim();
      if(!groups.has(tabName)) groups.set(tabName, []);
      // clone the row so we keep original for any other scripts
      const clone = tr.cloneNode(true);
      groups.get(tabName).push(clone);
    }

    // Build container
    const container = document.createElement("div");
    container.id = "calendar-range-tab-split";
    container.style.marginTop = "1rem";

    // Build a table for each group
    for(const [tabName, trs] of groups){
      // Title
      const h = document.createElement("h2");
      h.textContent = tabName;
      h.style.fontSize = "1.1rem";
      h.style.margin = "1.2rem 0 0.4rem 0";
      container.appendChild(h);

      // New table with same headers
      const newTable = document.createElement("table");
      newTable.className = baseTable.className; // keep datasette classes
      // Build thead
      const thead = document.createElement("thead");
      const headRow = document.createElement("tr");
      for(const th of baseTable.querySelectorAll("thead th")){
        const thClone = th.cloneNode(true);
        headRow.appendChild(thClone);
      }
      thead.appendChild(headRow);
      newTable.appendChild(thead);
      // Build tbody
      const tbody = document.createElement("tbody");
      trs.forEach(tr => tbody.appendChild(tr));
      newTable.appendChild(tbody);

      container.appendChild(newTable);
    }

    // Insert container after base table and hide the base table
    baseTable.insertAdjacentElement("afterend", container);
    baseTable.style.display = "none";
  }

  onReady(function(){
    if(!isCalendarRange()) return;
    try { splitByTab(); } catch(e){ console.error("split_by_tab error", e); }
  });
})();