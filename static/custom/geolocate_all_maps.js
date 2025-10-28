// Auto-add a 📍 geolocate control to ALL Leaflet maps on the page
(function(){
  function setupOnceFor(map){
    if (!map || map.__geo_setup_done) return;
    map.__geo_setup_done = true;

    // Control definition
    const GeoCtrl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function() {
        const container = L.DomUtil.create('div', 'leaflet-control leaflet-bar geolocate-control');
        const btn = L.DomUtil.create('a', 'geolocate-btn', container);
        btn.href = '#';
        btn.title = 'Centrati qui';
        btn.innerHTML = '📍';
        L.DomEvent.on(btn, 'click', L.DomEvent.stop)
                  .on(btn, 'click', function(){
                    geolocate(map, btn);
                  });
        return container;
      }
    });
    const control = new GeoCtrl();
    map.addControl(control);
  }

  function geolocate(map, btn){
    const setBusy = (b)=>{ if(btn){ b?btn.classList.add('busy'):btn.classList.remove('busy'); } };
    const toast = (txt)=>{
      let t = document.getElementById('geo-toast');
      if (!t){ t = document.createElement('div'); t.id = 'geo-toast'; t.className = 'geo-toast'; document.body.appendChild(t); }
      t.textContent = txt; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2600);
    };
    const isSecure = ()=> window.isSecureContext || location.protocol==='https:' || location.hostname==='localhost';
    if (!navigator.geolocation){ toast('Geolocalizzazione non supportata'); return; }
    if (!isSecure()){ toast('Serve HTTPS o localhost'); /* proseguiamo comunque: il browser probabilmente bloccherà */ }

    setBusy(true);
    navigator.geolocation.getCurrentPosition(function(pos){
      setBusy(false);
      const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = pos.coords.accuracy||0;
      if (!map.__geo_marker){
        map.__geo_marker = L.marker([lat,lng], {title:'Tu sei qui'}).addTo(map);
      } else {
        map.__geo_marker.setLatLng([lat,lng]);
      }
      if (!map.__geo_circle){
        map.__geo_circle = L.circle([lat,lng], {radius: acc}).addTo(map);
      } else {
        map.__geo_circle.setLatLng([lat,lng]).setRadius(acc);
      }
      try{
        const z = map.getZoom();
        if (typeof z==='number' && z<16) map.flyTo([lat,lng], 16, {duration:0.6}); else map.panTo([lat,lng]);
      }catch(e){ map.setView([lat,lng], 16); }
      console.log('Geolocate OK', {lat,lng,accuracy:acc});
    }, function(err){
      setBusy(false);
      toast('Impossibile ottenere la posizione: ' + (err && err.message ? err.message : ''));
      console.warn('Geolocate error', err);
    }, { enableHighAccuracy:true, timeout:12000, maximumAge:0 });
  }

  function hookLeaflet(){
    if (!window.L || !L.Map || L.Map.__geo_hooked) return !!(window.L && L.Map);
    L.Map.__geo_hooked = true;

    const init = L.Map.prototype.initialize;
    L.Map.prototype.initialize = function(a, b){
      init.call(this, a, b);
      // when map is ready, add control
      const m = this;
      if (m._loaded) setupOnceFor(m);
      else m.once('load', function(){ setupOnceFor(m); });
    };

    // Also cover maps already created before hook
    setTimeout(function(){
      try{
        document.querySelectorAll('.leaflet-container').forEach(function(el){
          if (el._leaflet_id){
            const map = el._leaflet ? el._leaflet : (el._leaflet_id && L && L.map ? null : null);
          }
        });
      }catch(e){}
    }, 0);
  }

  function waitForLeafletThenHook(retries){
    if (hookLeaflet()) return;
    if ((retries||0) > 100) { console.warn('Geolocate: Leaflet non trovato'); return; }
    setTimeout(function(){ waitForLeafletThenHook((retries||0)+1); }, 50);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ waitForLeafletThenHook(0); });
  } else {
    waitForLeafletThenHook(0);
  }
})();
