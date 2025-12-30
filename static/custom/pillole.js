// pillole.js v7
// Fix: gestisce correttamente recent.json con rows = []

(() => {
  function qs(sel, root = document) {
    return root.querySelector(sel);
  }
  function qsa(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  async function apiGet(url) {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(`GET ${url} → ${r.status}`);
    return r.json();
  }

  async function apiPost(url, body) {
    const r = await fetch(url, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`POST ${url} → ${r.status}`);
    return r.json();
  }

  async function refresh() {
    const table = qs("#pillole-recent");
    if (!table) return;

    const tbody = qs("tbody", table);
    if (!tbody) return;

    // stato iniziale
    tbody.innerHTML = `
      <tr>
        <td colspan="3" style="opacity:.65; cursor:pointer">
          caricamento…
        </td>
      </tr>
    `;

    let data;
    try {
      data = await apiGet(`${window.PILLOLE_API.recent}?limit=100`);
    } catch (e) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="color:#b00">
            errore caricamento
          </td>
        </tr>
      `;
      console.error(e);
      return;
    }

    const rows = data.rows || [];

    // ✅ FIX FONDAMENTALE
    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="3" style="opacity:.6">
            nessuna entry
          </td>
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

        let dose = null;
        if (action === "plus") {
          const input = qs("[data-dose-input]", card);
          dose = input && input.value ? Number(input.value) : null;
        }

        try {
          await apiPost(window.PILLOLE_API.add, { farmaco, dose });
          refresh();
        } catch (e) {
          console.error(e);
          alert("Errore inserimento");
        }
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    bindButtons();
    refresh();
  });
})();
