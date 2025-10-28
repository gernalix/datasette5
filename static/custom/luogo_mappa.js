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

    
    /* GEOLOCATE CTRL START */
    (function(){ 
      if (!window.__geo_css_added){ window.__geo_css_added=true; var st=document.createElement('style'); st.textContent='.geolocate-control .geolocate-btn{width:34px;height:34px;line-height:34px;text-align:center;display:block;text-decoration:none;background:#fff;font-size:18px}.geolocate-control .geolocate-btn.busy{animation:geo-pulse .9s infinite ease-in-out}@keyframes geo-pulse{0%{transform:scale(1)}50%{transform:scale(.92)}100%{transform:scale(1)}}.geo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:6px;font:14px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s ease}.geo-toast.show{opacity:1}'; document.head.appendChild(st); }
      var Geo = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function(){ 
          var c=L.DomUtil.create('div','leaflet-control leaflet-bar geolocate-control');
          var a=L.DomUtil.create('a','geolocate-btn',c); a.href='#'; a.title='Centrati qui'; a.innerHTML='📍';
          L.DomEvent.on(a,'click',L.DomEvent.stop).on(a,'click',function(){
            if(!navigator.geolocation){toast('Geolocalizzazione non supportata');return;}
            a.classList.add('busy');
            navigator.geolocation.getCurrentPosition(function(p){ 
              a.classList.remove('busy');
              var lat=p.coords.latitude,lng=p.coords.longitude,acc=p.coords.accuracy||0;
              if(!map.__geo_marker) map.__geo_marker=L.marker([lat,lng],{title:'Tu sei qui'}).addTo(map); else map.__geo_marker.setLatLng([lat,lng]);
              if(!map.__geo_circle) map.__geo_circle=L.circle([lat,lng],{radius:acc}).addTo(map); else map.__geo_circle.setLatLng([lat,lng]).setRadius(acc);
              try{ var z=map.getZoom(); if(typeof z==='number'&&z<16) map.flyTo([lat,lng],16,{duration:.6}); else map.panTo([lat,lng]); }catch(e){ map.setView([lat,lng],16); }
            }, function(err){ a.classList.remove('busy'); toast('Posizione non ottenibile: '+(err&&err.message?err.message:'')); }, {enableHighAccuracy:true,timeout:12000,maximumAge:0});
          });
          return c;
        }
      });
      map.addControl(new Geo());
      function toast(txt){ var t=document.getElementById('geo-toast'); if(!t){t=document.createElement('div');t.id='geo-toast';t.className='geo-toast';document.body.appendChild(t);}
        t.textContent=txt; t.classList.add('show'); setTimeout(function(){t.classList.remove('show');},2600); }
    })();
    /* GEOLOCATE CTRL END */
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
