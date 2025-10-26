
// static/custom/map_overlay.js
(function(){
  // Config
  const MAX_FETCH_SIZE = "max"; // ask Datasette for up to max rows
  const TARGET_COL = "luogo_id";

  function onReady(fn){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function ensureLeaflet(){
    if (window.L && L.map) return Promise.resolve();
    // Load via CDN
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    return new Promise((resolve, reject)=>{
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = resolve;
      s.onerror = ()=>reject(new Error("Leaflet CDN failed"));
      document.head.appendChild(s);
    });
  }

  function toNum(x){
    if (x == null) return null;
    if (typeof x === "number") return Number.isFinite(x) ? x : null;
    if (typeof x === "string"){ const n = Number(x.replace(",", ".").trim()); return Number.isFinite(n) ? n : null; }
    return null;
  }

  function getDatabaseAndTable(){
    // URL like /<db>/<table> or /<db>/<view>
    const parts = location.pathname.split("/").filter(Boolean);
    // ['', 'output', 'sex'] -> ['output','sex']
    if (parts.length >= 2) return {db: parts[0], table: parts[1]};
    return {db:null, table:null};
  }

  function hasLuogoIdColumn(){
    // Try to detect from table header cells
    const headers = Array.from(document.querySelectorAll("table th, .rows-and-columns th, .sql-table th"));
    return headers.some(th => (th.getAttribute("data-column") || th.textContent || "").trim() === TARGET_COL);
  }

  function currentJsonUrl(){
    // Current page JSON with same filters + _size and objects
    const base = location.pathname.replace(/\/$/, "") + ".json";
    const query = new URLSearchParams(location.search);
    query.set("_shape", "objects"); query.set("_size", MAX_FETCH_SIZE);
    return base + "?" + query.toString();
  }

  async function fetchCurrentRows(){
    const url = currentJsonUrl();
    const r = await fetch(url);
    if (!r.ok) throw new Error("Fetch table JSON failed: " + r.status);
    const data = await r.json();
    const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
    return rows;
  }

  function unique(arr){ return Array.from(new Set(arr)); }

  
  async function fetchLuoghiByIds(db, ids){
    if (!ids.length) return [];
    // Use SQL-style filter via _where to avoid 400 on id__in
    // Build chunks to keep URLs short
    const CHUNK = 200;
    let results = [];
    for (let i = 0; i < ids.length; i += CHUNK){
      const chunk = ids.slice(i, i + CHUNK);
      const where = "id in (" + chunk.join(",") + ")";
      const params = new URLSearchParams({
        "_shape": "objects",
        "_size": "max",
        "_where": where
      });
      const url = `/${db}/luogo.json?` + params.toString();
      const r = await fetch(url);
      if (!r.ok) throw new Error("Fetch luogo failed: " + r.status);
      const data = await r.json();
      const rows = Array.isArray(data?.rows) ? data.rows : (Array.isArray(data) ? data : []);
      results = results.concat(rows);
    }
    return results;
  }


  function buildOverlayIfNeeded(){
    if (document.getElementById("map-overlay")) return;
    const backdrop = document.createElement("div");
    backdrop.id = "map-overlay-backdrop";
    backdrop.addEventListener("click", closeOverlay);

    const root = document.createElement("div");
    root.id = "map-overlay";
    root.innerHTML = `<header>
        <h3>📍 Mappa indirizzi (Copenhagen)</h3>
        <div><button type="button" id="map-overlay-close">Chiudi</button></div>
      </header>
      <div class="map-body"><div id="overlay-map"></div></div>`;
    document.body.appendChild(backdrop);
    document.body.appendChild(root);
    document.getElementById("map-overlay-close").addEventListener("click", closeOverlay);
  }

  function openOverlay(){ 
    buildOverlayIfNeeded();
    document.getElementById("map-overlay-backdrop").style.display = "block";
    document.getElementById("map-overlay").style.display = "block";
  }
  function closeOverlay(){
    const b = document.getElementById("map-overlay-backdrop");
    const r = document.getElementById("map-overlay");
    if (b) b.style.display = "none";
    if (r) r.style.display = "none";
  }

  function renderMap(items){
    const el = document.getElementById("overlay-map");
    el.innerHTML = ""; // reset
    const map = L.map(el);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(map);

    const bounds = [];
    let count = 0;
    items.forEach(r => {
      const lat = toNum(r.lat), lon = toNum(r.lon);
      if (lat == null || lon == null) return;
      const shown = (r.indirizzo ? (r.indirizzo + ", Copenhagen") : "Copenhagen");
      const url = `/${r._db || "output"}/luogo/${r.id}`;
      const html = `<strong>${shown}</strong><br><a href="${url}">Apri riga #${r.id}</a>`;
      L.marker([lat, lon]).addTo(map).bindPopup(html);
      bounds.push([lat, lon]); count++;
    });
    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    else map.setView([55.6761, 12.5683], 12);
    console.log("[map-button] plotted markers:", count);
  }

  async function onClick(){
    try {
      const {db} = getDatabaseAndTable();
      if (!db) return alert("Impossibile determinare il database dalla URL.");
      openOverlay();
      await ensureLeaflet();

      const rows = await fetchCurrentRows();
      const luogoIds = unique(rows.map(r => r[TARGET_COL]).filter(v => v != null));
      if (!luogoIds.length){
        document.getElementById("overlay-map").innerHTML = "<p style='padding:12px'>Nessun luogo_id nella selezione corrente.</p>";
        return;
      }
      // Avoid too long querystring: chunk to 500 ids per call
      const chunks = [];
      for (let i=0;i<luogoIds.length;i+=500) chunks.push(luogoIds.slice(i, i+500));
      let all = [];
      for (const ch of chunks){
        const part = await fetchLuoghiByIds(db, ch);
        // annotate db for link
        part.forEach(p => p._db = db);
        all = all.concat(part);
      }
      renderMap(all);
    } catch(e){
      console.error(e);
      alert("Errore durante il caricamento della mappa: " + e.message);
    }
  }

  function insertButton(){
    // Insert near page title or in toolbar
    const target = document.querySelector(".content h1, h1") || document.querySelector("header");
    if (!target) return;
    const btn = document.createElement("button");
    btn.className = "ds-map-button";
    btn.type = "button";
    btn.title = "Mostra mappa degli indirizzi";
    btn.innerHTML = "🗺️ Mappa indirizzi";
    btn.addEventListener("click", onClick);
    // Place after title
    const wrapper = document.createElement("div");
    wrapper.style.margin = "6px 0 12px";
    wrapper.appendChild(btn);
    target.parentNode.insertBefore(wrapper, target.nextSibling);
  }

  function shouldActivate(){
    // Only activate on table/view pages (presence of luogo_id column)
    return hasLuogoIdColumn();
  }

  onReady(function(){
    if (!shouldActivate()) return;
    // Inject CSS
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "/custom/map_overlay.css";
    document.head.appendChild(css);
    insertButton();
  });
})();
