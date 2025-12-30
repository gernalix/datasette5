// pillole.js v10
// Fix definitivo: CSRF via meta + POST form-urlencoded (compatibile con Datasette 0.65.x) + rows=[]

(() => {
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  // URL relative: base_url-safe
  const URL_RECENT = "./-/pillole/recent.json";
  const URL_ADD = "./-/pillole/add";

  function getCsrfToken() {
    const el = document.querySelector('meta[name="ds-csrftoken"]');
    return el ? (el.getAttribute("content") || "") : "";
  }

  async function apiGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`GET ${url} → ${r.status} ${t.slice(0, 200)}`);
    }
    return r.json();
  }

  async function apiPostForm(url, fields) {
    const token = getCsrfToken();
    const headers = {};
    if (token) headers["x-csrftoken"] = token;

    // Usa application/x-www-form-urlencoded: Datasette 0.65.x lo gestisce via request.post_vars()
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined || v === null) continue;
      body.set(k, String(v));
    }

    const r = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers,
      body,
    });

    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`POST ${url} → ${r.status} ${t.slice(0, 200)}`);
    }
    return r.json();
  }

  async function refresh() {
    const table = qs("#pillole-recent");
    if (!table) return;

    const tbody = qs("tbody", table);
    if (!tbody) return;

    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="opacity:.65; cursor:pointer">caricamento…</td>
      </tr>
    `;

    let data;
    try {
      data = await apiGet(`${URL_RECENT}?limit=100`);
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="opacity:.85; color:#b00">${String(e.message || e)}</td>
        </tr>
      `;
      return;
    }

    const rows = (data && Array.isArray(data.rows)) ? data.rows : [];

    // ✅ tabella vuota
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="opacity:.6">nessuna entry</td>
        </tr>
      `;
      return;
    }

    // render righe
    tbody.innerHTML = "";
    for (const r of rows) {
      const tr = document.createElement("tr");

      const tdQuando = document.createElement("td");
      tdQuando.textContent = r.quando ?? "";
      tr.appendChild(tdQuando);

      const tdFarmaco = document.createElement("td");
      tdFarmaco.textContent = r.farmaco ?? "";
      tdFarmaco.style.display = "none";
      tr.appendChild(tdFarmaco);

      const tdDose = document.createElement("td");
      tdDose.textContent = r.dose ?? "";
      tdDose.style.display = "none";
      tr.appendChild(tdDose);

      tbody.appendChild(tr);
    }
  }

  function bindButtons() {
    qsa("[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const card = btn.closest("[data-farmaco]");
        if (!card) return;

        const farmaco = card.dataset.farmaco;
        const action = btn.dataset.action;

        let dose = "";
        if (action === "quick") {
          dose = card.dataset.doseDefault || "";
        } else if (action === "plus") {
          const box = qs("[data-dose-box]", card);
          const input = qs("[data-dose-input]", card);
          if (box && box.hasAttribute("hidden")) {
            box.removeAttribute("hidden");
            input && input.focus();
            return;
          }
          dose = input && input.value ? String(input.value).trim() : "";
        }

        try {
          await apiPostForm(URL_ADD, { farmaco, dose });
          await refresh();
        } catch (e) {
          console.error(e);
          alert(String(e.message || e));
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    refresh();
  });
})();
