// v6
// static/custom/pillole.js

(function () {
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDdMmYyHhMm(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yy = pad2(d.getFullYear() % 100);
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${dd}-${mm}-${yy} ${hh}:${mi}`;
  }

  function getCookie(name) {
    const parts = document.cookie.split(";").map((x) => x.trim());
    for (const p of parts) {
      if (p.startsWith(name + "=")) return decodeURIComponent(p.slice(name.length + 1));
    }
    return null;
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  async function apiPost(url, payload) {
    const csrftoken = getCookie("csrftoken");
    const headers = { "content-type": "application/json" };
    if (csrftoken) headers["x-csrftoken"] = csrftoken;

    const res = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body: JSON.stringify(payload || {}),
    });

    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* ignore */ }

    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  async function apiGet(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (e) { /* ignore */ }
    if (!res.ok) {
      const msg = (data && (data.error || data.message)) || text || `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  function getUrls() {
    // Prefer JSON config injected by template (base_url-safe)
    const el = document.getElementById("pillole-urls");
    if (el) {
      try {
        const obj = JSON.parse(el.textContent || "{}");
        if (obj && obj.recent && obj.add) return obj;
      } catch (e) {
        /* ignore */
      }
    }
    // Fallback to root-based paths
    return {
      recent: "/-/pillole/recent.json",
      add: "/-/pillole/add",
    };
  }

  function renderRows(rows) {
    const tbody = qs("#pillole-recent tbody");
    if (!tbody) return;

    if (!rows || !rows.length) {
      tbody.innerHTML = `<tr><td colspan="3" style="opacity:.65">nessuna entry</td></tr>`;
      return;
    }

    const html = rows
      .map((r) => {
        const quando = r.quando ? formatDdMmYyHhMm(r.quando) : "";
        const farmaco = (r.farmaco || "").toString();
        const dose = r.dose == null ? "" : (r.dose || "").toString();
        return `<tr>
          <td>${escapeHtml(quando)}</td>
          <td>${escapeHtml(farmaco)}</td>
          <td>${escapeHtml(dose)}</td>
        </tr>`;
      })
      .join("");

    tbody.innerHTML = html;
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  async function refresh() {
    const tbody = qs("#pillole-recent tbody");
    if (tbody) tbody.innerHTML = `<tr><td colspan="3" style="opacity:.65">caricamento…</td></tr>`;
    const urls = getUrls();
    const data = await apiGet(`${urls.recent}?limit=100`);
    renderRows((data && data.rows) || []);
  }

  async function addEntry(farmaco, dose) {
    const urls = getUrls();
    await apiPost(urls.add, { farmaco, dose });
    await refresh();
  }

  function attachCardHandlers() {
    qsa(".pillole-card").forEach((card) => {
      const farmaco = card.getAttribute("data-farmaco") || "";
      const doseDefault = card.getAttribute("data-dose-default") || "";

      const btnZap = qs('[data-action="quick"]', card);
      const btnPlus = qs('[data-action="plus"]', card);
      const box = qs("[data-dose-box]", card);
      const input = qs("[data-dose-input]", card);

      if (btnZap) {
        btnZap.addEventListener("click", async () => {
          btnZap.disabled = true;
          try {
            await addEntry(farmaco, doseDefault || null);
          } catch (e) {
            alert(`Errore: ${e.message}`);
          } finally {
            btnZap.disabled = false;
          }
        });
      }

      if (btnPlus && box && input) {
        btnPlus.addEventListener("click", () => {
          box.hidden = !box.hidden;
          if (!box.hidden) {
            input.value = "";
            input.placeholder = doseDefault ? `Dose (default: ${doseDefault})` : "Dose";
            input.focus();
          }
        });

        input.addEventListener("keydown", async (ev) => {
          if (ev.key !== "Enter") return;
          ev.preventDefault();
          const dose = (input.value || "").trim();
          if (!dose) return;
          input.disabled = true;
          try {
            await addEntry(farmaco, dose);
            input.value = "";
            box.hidden = true;
          } catch (e) {
            alert(`Errore: ${e.message}`);
          } finally {
            input.disabled = false;
          }
        });
      }
    });
  }

  async function init() {
    attachCardHandlers();
    try {
      await refresh();
    } catch (e) {
      const tbody = qs("#pillole-recent tbody");
      if (tbody) tbody.innerHTML = `<tr><td colspan="3">Errore caricamento: ${escapeHtml(e.message)}</td></tr>`;
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
