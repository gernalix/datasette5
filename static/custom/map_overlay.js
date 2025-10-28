
// ==================== Pulsante geolocalizzazione ====================
// Aggiungi pulsante 📍 dopo che la mappa Leaflet è pronta
(function waitForMap() {
  const tryAdd = () => {
    // Trova oggetto map se globale o assegnato a window
    const m = window.map || window._map || window.MAP;
    if (!m || typeof L === "undefined") {
      // se non ancora pronto, riprova fra 500ms
      setTimeout(tryAdd, 500);
      return;
    }

    // Evita duplicati
    if (m._geolocButtonAdded) return;
    m._geolocButtonAdded = true;

    const locateBtn = L.control({ position: "topleft" });
    locateBtn.onAdd = function () {
      const btn = L.DomUtil.create("button", "leaflet-bar leaflet-control leaflet-control-custom");
      btn.innerHTML = "📍";
      btn.title = "Mostra la mia posizione";
      btn.style.backgroundColor = "white";
      btn.style.width = "34px";
      btn.style.height = "34px";
      btn.style.cursor = "pointer";
      btn.style.fontSize = "20px";
      btn.style.lineHeight = "28px";
      btn.style.textAlign = "center";
      btn.style.border = "none";
      btn.style.outline = "none";
      btn.style.borderRadius = "4px";

      btn.onclick = () => {
        if (!navigator.geolocation) {
          alert("Geolocalizzazione non supportata dal browser.");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          pos => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const marker = L.marker([lat, lon], {
              title: "La tua posizione",
              opacity: 0.9
            }).addTo(m);
            marker.bindPopup("📍 La tua posizione").openPopup();
            m.setView([lat, lon], 14);
          },
          err => {
            console.warn("Errore geolocalizzazione:", err.message);
            alert("Impossibile ottenere la posizione.");
          }
        );
      };

      return btn;
    };
    locateBtn.addTo(m);
  };
  tryAdd();
})();
