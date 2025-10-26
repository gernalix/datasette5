// static/custom/calendar_range_map.js  (uses calendar_range.indirizzo)
(function(){
  function onReady(fn){
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }
  function isCalendarRange(){ return /\/calendar_range(?:$|[/?#])/.test(location.pathname); }
  function addButton(){
    const h1=document.querySelector("h1");
    if(!h1) return;
    const b=document.createElement("button");
    b.textContent="🗺️ Mappa indirizzi";
    b.className="btn btn-sm";
    b.style.marginLeft="1rem";
    b.addEventListener("click", run);
    h1.appendChild(b);
  }
  function jsonURL(){
    const u=new URL(location.href);
    u.pathname=u.pathname.replace(/\/$/,"") + ".json";
    u.searchParams.set("_shape","objects");
    u.searchParams.set("_size","max");
    return u.toString();
  }
  function ensureLeaflet(){
    if (window.L && L.map) return Promise.resolve();
    const link=document.createElement("link");
    link.rel="stylesheet";
    link.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
    return new Promise((res,rej)=>{
      const s=document.createElement("script");
      s.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload=res; s.onerror=rej;
      document.head.appendChild(s);
    });
  }
  function asRows(data){
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.rows)) return data.rows;
    return [];
  }
  async function geocode(addr){
    const url = "https://nominatim.openstreetmap.org/search?format=json&q=" + encodeURIComponent(addr);
    const r = await fetch(url, {headers: {'Accept':'application/json'}});
    if(!r.ok) throw new Error("geocode fetch failed: " + r.status);
    const j = await r.json();
    return (j && j.length) ? {lat: +j[0].lat, lon: +j[0].lon, name: j[0].display_name} : null;
  }
  async function run(){
    try{
      const resp = await fetch(jsonURL(), {credentials:"same-origin"});
      if(!resp.ok) { alert("Impossibile leggere i dati della vista."); return; }
      const data = await resp.json();
      const rows = asRows(data);
      const addrs = [...new Set(rows.map(r => (r.indirizzo || '').trim()).filter(Boolean))];
      if(!addrs.length){ alert("Nessun indirizzo trovato nella selezione."); return; }
      await ensureLeaflet();
      const modal=document.createElement("div");
      Object.assign(modal.style, {position:"fixed", inset:"5%", background:"white", border:"1px solid #ccc", zIndex:9999, boxShadow:"0 10px 30px rgba(0,0,0,.3)"});
      const close=document.createElement("button"); close.textContent="✖"; Object.assign(close.style, {position:"absolute", top:"8px", right:"8px"}); close.onclick=()=>modal.remove();
      const mapDiv=document.createElement("div"); Object.assign(mapDiv.style, {position:"absolute", top:"48px", left:0, right:0, bottom:0});
      modal.appendChild(close); modal.appendChild(mapDiv); document.body.appendChild(modal);
      const m=L.map(mapDiv).setView([55.6761,12.5683], 11);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap'}).addTo(m);
      for(const addr of addrs){
        try{
          const g = await geocode(addr);
          if(!g) continue;
          L.marker([g.lat, g.lon]).addTo(m).bindPopup(addr);
        }catch(e){ console.warn("geocode failed", addr, e); }
      }
      try{ m.fitBounds(m.getBounds().pad(0.2)); }catch(e){}
    }catch(e){
      console.error("Errore mappa indirizzi", e);
      alert("Errore durante la geocodifica.");
    }
  }
  onReady(function(){ if(isCalendarRange()) addButton(); });
})();