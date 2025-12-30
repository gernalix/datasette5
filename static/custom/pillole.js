// v14
// static/custom/pillole.js
// CSRF fix (Datasette): support both 'ds_csrftoken' and 'csrftoken' cookies,
// and send token as BOTH header and form field(s).
// Robust init + basic UX feedback

(() => {
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function readUrls() {
    const el = qs("#pillole-urls");
    if (!el) return { add: "./-/pillole/add", recent: "./-/pillole/recent.json" };
    try {
      const obj = JSON.parse(el.textContent || "{}");
      return {
        add: obj.add || "./-/pillole/add",
        recent: obj.recent || "./-/pillole/recent.json",
      };
    } catch {
      return { add: "./-/pillole/add", recent: "./-/pillole/recent.json" };
    }
  }

  const URLS = readUrls();

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getCookie(name) {
    const esc = name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
    const m = document.cookie.match(new RegExp("(^|;\s*)" + esc + "=([^;]*)"));
    return m ? decodeURIComponent(m[2]) : "";
  }

  function getCsrfToken() {
    // Datasette commonly uses ds_csrftoken
    const a = getCookie("ds_csrftoken");
    if (a) return { token: a, cookieName: "ds_csrftoken" };

    // Some installs/plugins might use csrftoken
    const b = getCookie("csrftoken");
    if (b) return { token: b, cookieName: "csrftoken" };

    // Fallbacks if present in page
    const m = qs('meta[name="csrf-token"]');
    if (m && m.getAttribute("content")) return { token: m.getAttribute("content"), cookieName: "" };

    const hidden = qs('input[name="csrftoken"], input[name="ds_csrftoken"]');
    if (hidden && hidden.value) return { token: hidden.value, cookieName: "" };

    return { token: "", cookieName: "" };
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      if (!btn.dataset._oldText) btn.dataset._oldText = btn.textContent || "";
      btn.textContent = "…";
      btn.disabled = true;
    } else {
      if (btn.dataset._oldText) btn.textContent = btn.dataset._oldText;
      btn.disabled = false;
    }
  }

  async function apiPostForm(url, fields) {
    const { token } = getCsrfToken();
    const headers = {};
    if (token) headers["x-csrftoken"] = token;

    const body = new URLSearchParams();

    // Datasette checks "POST field did not match cookie" — depending on cookie name.
    // Send both, harmless if one is ignored.
    if (token) {
      body.set("csrftoken", token);
      body.set("ds_csrftoken", token);
    }

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
    return r.json().catch(() => ({}));
  }

  async function refresh() {
    const table = qs("#pillole-recent");
    if (!table) return;
    const tbody = qs("tbody", table);
    if (!tbody) return;

    const r = await fetch(`${URLS.recent}?limit=20`, { credentials: "same-origin" });
    if (!r.ok) return;

    const data = await r.json().catch(() => null);
    const rows = (data && Array.isArray(data.rows)) ? data.rows : [];

    tbody.innerHTML = "";

    if (!rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="3" style="opacity:.65">— nessuna entry —</td>';
      tbody.appendChild(tr);
      return;
    }

    for (const row of rows) {
      const tr = document.createElement("tr");
      const quando = row.quando ?? "";
      const farmaco = row.farmaco ?? "";
      const dose = row.dose ?? "";
      tr.innerHTML = `<td>${escapeHtml(quando)}</td><td>${escapeHtml(farmaco)}</td><td>${escapeHtml(dose)}</td>`;
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
        } else {
          return;
        }

        try {
          setBusy(btn, true);
          await apiPostForm(URLS.add, { farmaco, dose });
          await refresh();
        } catch (e) {
          console.error(e);
          alert(String(e.message || e));
        } finally {
          setBusy(btn, false);
        }
      });
    });
  }

  function init() {
    bindButtons();
    refresh();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
