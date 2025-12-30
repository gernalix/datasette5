// pillole.js v9
// Fix: supporta CSRF Datasette per POST + messaggio errore utile + rows=[].

(() => {
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }
  function getCookie(name) {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[$()*+.?[\]^{|}]/g, '\\$&') + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : "";
  }

  const URL_RECENT = "./-/pillole/recent.json";
  const URL_ADD = "./-/pillole/add";

  async function apiGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      throw new Error(`GET ${url} → ${r.status} ${t.slice(0, 200)}`);
    }
    return r.json();
  }

  async function apiPost(url, body) {
    const csrftoken = getCookie("ds_csrftoken") || getCookie("csrftoken");
    const r = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(csrftoken ? { "x-csrftoken": csrftoken } : {}),
      },
      body: JSON.stringify(body),
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
      <tr><td colspan="3" style="opacity:.65; cursor:pointer">caricamento…</td></tr>
    `;

    let data;
    try {
      data = await apiGet(`${URL_RECENT}?limit=100`);
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `
        <tr><td colspan="3" style="opacity:.85; color:#b00">errore caricamento</td></tr>
      `;
      return;
    }

    const rows = (data && Array.isArray(data.rows)) ? data.rows : [];
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr><td colspan="3" style="opacity:.6">nessuna entry</td></tr>
      `;
      return;
    }

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

        let dose = null;
        if (action === "plus") {
          const input = qs("[data-dose-input]", card);
          const v = input && input.value != null ? String(input.value).trim() : "";
          dose = v === "" ? null : Number(v);
        }

        try {
          await apiPost(URL_ADD, { farmaco, dose });
          await refresh();
        } catch (e) {
          console.error(e);
          alert(`Errore inserimento\n${e.message}`);
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    refresh();
  });
})();
