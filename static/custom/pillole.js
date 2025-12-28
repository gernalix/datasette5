// v2
// static/custom/pillole.js

(function () {
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function formatDdMmYyHhMm(iso) {
    // iso like 2025-12-28T18:01:02
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const dd = pad2(d.getDate());
    const mm = pad2(d.getMonth() + 1);
    const yy = pad2(d.getFullYear() % 100);
    const hh = pad2(d.getHours());
    const mi = pad2(d.getMinutes());
    return `${dd}-${mm}-${yy} ${hh}:${mi}`;
  }

  async function postAdd(farmaco, dose) {
    const body = new URLSearchParams({ farmaco, dose: dose ?? "" });
    const r = await fetch("/-/pillole/add", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
      throw new Error(j.error || `HTTP ${r.status}`);
    }
    return j.row;
  }

  async function loadRecent(limit = 30) {
    const r = await fetch(`/-/pillole/recent.json?limit=${encodeURIComponent(limit)}`);
    const j = await r.json();
    if (!j.ok) throw new Error("recent failed");
    return j.rows || [];
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function renderRecent(rows) {
    const tbody = document.querySelector("#pillole-recent tbody");
    if (!tbody) return;
    tbody.innerHTML = rows
      .map((r) => {
        const quando = formatDdMmYyHhMm(r.quando);
        return `<tr>
          <td>${escapeHtml(quando)}</td>
          <td>${escapeHtml(r.farmaco)}</td>
          <td>${escapeHtml(r.dose || "")}</td>
        </tr>`;
      })
      .join("");
  }

  async function refresh() {
    try {
      const rows = await loadRecent(50);
      renderRecent(rows);
    } catch (e) {
      const tbody = document.querySelector("#pillole-recent tbody");
      if (tbody) {
        const msg = String((e && e.message) ? e.message : e);
        tbody.innerHTML = "<tr><td colspan="3" style="opacity:.75">errore caricamento: " + escapeHtml(msg) + "</td></tr>";
      }
    }
  }

  function attachCardHandlers() {
    document.querySelectorAll("[data-pillole-card]").forEach((card) => {
      const farmaco = card.getAttribute("data-farmaco") || "";
      const doseDefault = card.getAttribute("data-dose-default") || "";

      const btnQuick = card.querySelector("[data-action='quick']");
      const btnPlus = card.querySelector("[data-action='plus']");
      const box = card.querySelector("[data-dose-box]");
      const input = card.querySelector("[data-dose-input]");

      if (btnQuick) {
        btnQuick.addEventListener("click", async () => {
          btnQuick.disabled = true;
          try {
            await postAdd(farmaco, doseDefault);
            await refresh();
          } catch (e) {
            alert(String(e.message || e));
          } finally {
            btnQuick.disabled = false;
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
          input.disabled = true;
          try {
            await postAdd(farmaco, dose);
            box.hidden = true;
            input.value = "";
            await refresh();
          } catch (e) {
            alert(String(e.message || e));
          } finally {
            input.disabled = false;
          }
        });
      }
    });
  }

  async function init() {
    attachCardHandlers();
    await refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
