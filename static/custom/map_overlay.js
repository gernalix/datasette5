
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

    






/* GEOLOCATE CTRL START */
(function(){ 
  if (!window.__geo_css_added){
    window.__geo_css_added = true;
    var st=document.createElement('style'); st.textContent='.geolocate-control .geolocate-btn{width:34px;height:34px;line-height:34px;text-align:center;display:block;text-decoration:none;background:#fff;font-size:18px}.geolocate-control .geolocate-btn.busy{animation:geo-pulse .9s infinite ease-in-out}@keyframes geo-pulse{0%{transform:scale(1)}50%{transform:scale(.92)}100%{transform:scale(1)}}.geo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:6px;font:14px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s ease}.geo-toast.show{opacity:1}'; document.head.appendChild(st);
  }

  // 1) SCANSIONE INIZIALE (dopo creazione mappa) PER CATTURARE TUTTI I MARKER GIÀ PRESENTI
  setTimeout(function(){ try { 
    var b = L.latLngBounds();
    map.eachLayer(function(layer){
      try{
        if (layer && typeof layer.getLatLng === 'function'){ 
          var ll = layer.getLatLng(); if (ll) b.extend(ll);
        } else if (layer && typeof layer.getBounds === 'function'){ 
          var gb = layer.getBounds(); if (gb && gb.isValid()) b.extend(gb);
        }
      }catch(e){}
    });
    if (b.isValid()) map.__dataBounds = b;
  } catch(e){ console.warn('init bounds error', e); } }, 800);

  // 2) HOOK SUCCESSIVI: intercetta marker aggiunti DOPO
  if (L && L.Marker && !L.Marker.prototype.__geo_addToPatched){
    L.Marker.prototype.__geo_addToPatched = true;
    var _addTo = L.Marker.prototype.addTo;
    L.Marker.prototype.addTo = function(m){
      var r = _addTo.call(this, m);
      try{ 
        if (!this.options || !this.options.__geoUser){
          if (!m.__dataBounds) m.__dataBounds = L.latLngBounds();
          var ll = this.getLatLng && this.getLatLng();
          if (ll && typeof ll.lat==='number' && typeof ll.lng==='number') m.__dataBounds.extend(ll);
        }
      }catch(e){}
      return r;
    };
  }
  if (L && L.FeatureGroup && !L.FeatureGroup.prototype.__geo_addLayerPatched){
    L.FeatureGroup.prototype.__geo_addLayerPatched = true;
    var _addLayer = L.FeatureGroup.prototype.addLayer;
    L.FeatureGroup.prototype.addLayer = function(layer){
      var r = _addLayer.call(this, layer);
      try{
        var m = this._map || (this.getLayers && this.getLayers()[0] && this.getLayers()[0]._map);
        if (m){
          if (!m.__dataBounds) m.__dataBounds = L.latLngBounds();
          if (layer && typeof layer.getBounds === 'function'){ var bb = layer.getBounds(); if (bb && bb.isValid()) m.__dataBounds.extend(bb); }
          else if (layer && typeof layer.getLatLng === 'function'){ var ll = layer.getLatLng(); if (ll) m.__dataBounds.extend(ll); }
        }
      }catch(e){}
      return r;
    };
  }

  // 3) CONTROLLO 📍 (topright) che fa fitBounds(data + user)
  var Geo = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function(){
      var c = L.DomUtil.create('div','leaflet-control leaflet-bar geolocate-control');
      var a = L.DomUtil.create('a','geolocate-btn',c); 
      a.href='#'; a.title='Centrati + dati'; a.innerHTML='📍';
      L.DomEvent.on(a,'click',L.DomEvent.stop).on(a,'click',function(){
        if (!navigator.geolocation){ toast('Geolocalizzazione non supportata'); return; }
        a.classList.add('busy');
        navigator.geolocation.getCurrentPosition(function(p){
  a.classList.remove('busy');
  var lat=p.coords.latitude, lng=p.coords.longitude, acc=p.coords.accuracy||0;

  // user marker + circle (flag for exclusion in scans)
  if (!map.__geo_marker) map.__geo_marker = L.marker([lat,lng], {title:'Tu sei qui', __geoUser:true}).addTo(map);
  else map.__geo_marker.setLatLng([lat,lng]);
  if (!map.__geo_circle) map.__geo_circle = L.circle([lat,lng], {radius: acc}).addTo(map);
  else map.__geo_circle.setLatLng([lat,lng]).setRadius(acc);

  // Recompute bounds LIVE: all current layers (excluding user marker), plus user location
  var b = L.latLngBounds();
  map.eachLayer(function(layer){
    try{
      if (layer && typeof layer.getLatLng === 'function'){
        if (layer.options && layer.options.__geoUser) return; // skip user marker
        var ll = layer.getLatLng();
        if (ll) b.extend(ll);
      } else if (layer && typeof layer.getBounds === 'function'){
        var gb = layer.getBounds();
        if (gb && gb.isValid()) b.extend(gb);
      }
    }catch(e){}
  });
  b.extend([lat, lng]);

  if (b.isValid()) map.fitBounds(b, { padding:[24,24], maxZoom: 16 });
  else {
    try { var z=map.getZoom(); if (typeof z==='number' && z<16) map.flyTo([lat,lng],16,{duration:.6}); else map.panTo([lat,lng]); }
    catch(e){ map.setView([lat,lng],16); }
  }
}, function(err){
          a.classList.remove('busy');
          toast('Posizione non ottenibile: ' + (err && err.message ? err.message : ''));
        }, { enableHighAccuracy:true, timeout:12000, maximumAge:0 });
      });
      return c;
    }
  });
  map.addControl(new Geo());

  function toast(txt){
    var t=document.getElementById('geo-toast');
    if (!t){ t=document.createElement('div'); t.id='geo-toast'; t.className='geo-toast'; document.body.appendChild(t); }
    t.textContent=txt; t.classList.add('show'); setTimeout(function(){ t.classList.remove('show'); }, 2600);
  }
})();
/* GEOLOCATE CTRL END */
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


/* ===== Geolocate control injected (universal) ===== */
(function(){
  if (!window.L) return;
  if (L.Map && !L.Map.__geo_patched){
    L.Map.__geo_patched = true;
    const init = L.Map.prototype.initialize;
    L.Map.prototype.initialize = function (a,b){
      init.call(this,a,b);
      const map = this;
      const addBtn = function(){
        if (map.__geo_btn_added) return;
        map.__geo_btn_added = true;
        const GeoCtrl = L.Control.extend({
          options: { position: 'topleft' },
          onAdd: function(){
            const container = L.DomUtil.create('div','leaflet-control leaflet-bar geolocate-control');
            const btn = L.DomUtil.create('a','geolocate-btn',container);
            btn.href = '#'; btn.title = 'Centrati qui'; btn.innerHTML = '📍';
            L.DomEvent.on(btn,'click',L.DomEvent.stop).on(btn,'click',function(){
              if (!navigator.geolocation){ toast('Geolocalizzazione non supportata'); return; }
              btn.classList.add('busy');
              navigator.geolocation.getCurrentPosition(function(pos){
                btn.classList.remove('busy');
                const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy||0;
                if (!map.__geo_marker) map.__geo_marker = L.marker([lat,lng],{title:'Tu sei qui'}).addTo(map);
                else map.__geo_marker.setLatLng([lat,lng]);
                if (!map.__geo_circle) map.__geo_circle = L.circle([lat,lng],{radius:acc}).addTo(map);
                else map.__geo_circle.setLatLng([lat,lng]).setRadius(acc);
                try{ const z = map.getZoom(); if (typeof z==='number' && z<16) map.flyTo([lat,lng],16,{duration:.6}); else map.panTo([lat,lng]); }
                catch(e){ map.setView([lat,lng],16); }
              }, function(err){
                btn.classList.remove('busy');
                toast('Posizione non ottenibile: ' + (err && err.message ? err.message : ''));
              }, {enableHighAccuracy:true, timeout:12000, maximumAge:0});
            });
            return container;
          }
        });
        map.addControl(new GeoCtrl());
      };
      if (map._loaded) addBtn(); else map.once('load', addBtn);
    };
  }
  function toast(txt){
    let t = document.getElementById('geo-toast');
    if (!t){ t = document.createElement('div'); t.id='geo-toast'; t.className='geo-toast'; document.body.appendChild(t); }
    t.textContent = txt; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2600);
  }
  const style = document.createElement('style');
  style.textContent = '.geolocate-control .geolocate-btn{width:34px;height:34px;line-height:34px;text-align:center;display:block;text-decoration:none;background:#fff;font-size:18px}.geolocate-control .geolocate-btn.busy{animation:geo-pulse .9s infinite ease-in-out}@keyframes geo-pulse{0%{transform:scale(1)}50%{transform:scale(.92)}100%{transform:scale(1)}}.geo-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgba(0,0,0,.78);color:#fff;padding:8px 12px;border-radius:6px;font:14px/1.1 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;opacity:0;pointer-events:none;transition:opacity .2s ease}.geo-toast.show{opacity:1}';
  document.head.appendChild(style);
})();
/* ===== end geolocate control ===== */
