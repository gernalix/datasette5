// static/custom/luogo_mappa.js
(function () {
  function $(sel){ return document.querySelector(sel); }
  function toNum(x){
    if (x == null) return null;
    if (typeof x === "number") return isFinite(x) ? x : null;
    if (typeof x === "string"){ const n = Number(x.replace(",", ".").trim()); return isFinite(n) ? n : null; }
    return null;
  }

  // Forza SEMPRE la CDN di Leaflet (evita 404 su /-/static)
  async function loadLeaflet(){
    if (typeof window.L !== "undefined" && window.L.map) return;
    console.log("[mappa] loading Leaflet from CDN…");
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);

    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => { console.log("[mappa] Leaflet ready"); resolve(); };
      s.onerror = () => reject(new Error("Leaflet CDN failed"));
      document.head.appendChild(s);
    });
  }

  function popupHtml(row){
    const id = row.id;
    const addr = (row.indirizzo || "").trim();
    const shown = addr ? addr + ", Copenhagen" : "Copenhagen";
    const url = "/output/luogo/" + id;
    return "<strong>" + shown + "</strong><br><a href=\"" + url + "\">Apri riga #" + id + "</a>";
  }

  function renderMap(rows){
    const el = $("#map");
    if (!el) return;
    if (!el.style.height) el.style.height = "70vh";

    const map = L.map(el);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>',
      maxZoom: 19
    }).addTo(map);

    const bounds = [];
    let count = 0;
    rows.forEach(r => {
      const lat = toNum(r.lat), lon = toNum(r.lon);
      if (lat == null || lon == null) return;
      L.marker([lat, lon]).addTo(map).bindPopup(popupHtml(r));
      bounds.push([lat, lon]); count++;
    });

    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20] });
    else map.setView([55.6761, 12.5683], 12); // Copenhagen fallback

    console.log("[mappa] markers:", count);
  }

  async function getRows(){
    const url = location.pathname.replace(/\/$/, "") + ".json?_shape=objects";
    console.log("[mappa] fetching:", url);
    const resp = await fetch(url);
    if (!resp.ok){ console.error("[mappa] fetch error", resp.status, resp.statusText); return []; }
    const data = await resp.json();
    if (Array.isArray(data?.rows)) return data.rows;
    if (Array.isArray(data)) return data;
    return [];
  }

  async function start(){
    const container = $("#map");
    if (!container) return;
    try {
      await loadLeaflet();
      const rows = await getRows();
      renderMap(rows);
    } catch (e){
      console.error("[mappa] failure:", e);
      container.innerHTML = "<p>Errore nel caricare Leaflet o i dati.</p>";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
