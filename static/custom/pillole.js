// v18
// static/custom/pillole.js
// Pillole UI: robust POST + visible debug log, no AbortController.

(function () {
  "use strict";

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function ts() {
    try { return new Date().toISOString().replace("T"," ").replace("Z",""); } catch(e){ return ""; }
  }

  function getUrls() {
    const el = document.getElementById("pillole-urls");
    if (!el) return null;
    try { return JSON.parse(el.textContent || "{}"); } catch (e) { return null; }
  }

  function readCookie(name) {
    const m = document.cookie.match(new RegExp("(^|;\s*)" + name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&") + "=([^;]+)"));
    return m ? decodeURIComponent(m[2]) : null;
  }

  function readCsrf() {
    // Datasette commonly uses ds_csrftoken cookie + hidden form field / meta tags
    return (
      readCookie("ds_csrftoken") ||
      readCookie("csrftoken") ||
      (document.querySelector('meta[name="csrf-token"]') && document.querySelector('meta[name="csrf-token"]').getAttribute("content")) ||
      (document.querySelector('meta[name="ds-csrftoken"]') && document.querySelector('meta[name="ds-csrftoken"]').getAttribute("content")) ||
      null
    );
  }

  function ensureDebug() {
    let wrap = document.getElementById("pillole-debug");
    if (!wrap) return null;
    let pre = wrap.querySelector("pre");
    return pre || null;
  }

  function log(line) {
    const pre = ensureDebug();
    const s = `${ts()} — ${line}`;
    if (pre) {
      pre.textContent = (s + "\n") + pre.textContent;
    }
    // also to console
    try { console.log("[pillole]", line); } catch(e) {}
  }

  function showCardError(card, msg) {
    let box = card.querySelector("[data-error]");
    if (!box) {
      box = document.createElement("div");
      box.setAttribute("data-error", "1");
      box.style.marginTop = "10px";
      box.style.padding = "10px 12px";
      box.style.border = "1px solid rgba(220, 53, 69, .35)";
      box.style.background = "rgba(220, 53, 69, .06)";
      box.style.color = "#b02a37";
      box.style.borderRadius = "10px";
      card.appendChild(box);
    }
    box.textContent = msg;
    box.hidden = false;
  }

  function clearCardError(card) {
    const box = card.querySelector("[data-error]");
    if (box) box.hidden = true;
  }

  function setBusy(btn, busy) {
    if (!btn) return;
    if (busy) {
      btn.dataset._orig = btn.textContent;
      btn.textContent = "...";
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset._orig || btn.textContent;
      btn.disabled = false;
    }
  }

  function renderRecent(rows) {
    const tbody = $("#pillole-recent tbody");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!rows || !rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="3" style="opacity:.65">nessuna entry</td>';
      tbody.appendChild(tr);
      return;
    }
    for (const r of rows) {
      const tr = document.createElement("tr");
      const quando = (r.quando ?? "").toString();
      const farmaco = (r.farmaco ?? "").toString();
      const dose = (r.dose === null || r.dose === undefined) ? "" : r.dose.toString();
      tr.innerHTML = `<td>${escapeHtml(quando)}</td><td>${escapeHtml(farmaco)}</td><td>${escapeHtml(dose)}</td>`;
      tbody.appendChild(tr);
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  async function fetchRecent(urls) {
    try {
      log(`GET recent → ${urls.recent}`);
      const r = await fetch(urls.recent, { credentials: "same-origin", cache: "no-store" });
      const ct = (r.headers.get("content-type") || "").toLowerCase();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      if (!ct.includes("application/json")) {
        const t = await r.text();
        throw new Error(`recent non-JSON (${ct}): ${t.slice(0, 160)}`);
      }
      const j = await r.json();
      renderRecent(j.rows || []);
    } catch (e) {
      log(`ERRORE recent: ${e && e.message ? e.message : String(e)}`);
    }
  }

  async function postAdd(urls, farmaco, dose) {
    const csrf = readCsrf();
    const payload = { farmaco: farmaco, dose: dose };
    const headers = { "content-type": "application/json" };
    if (csrf) headers["x-csrftoken"] = csrf;

    log(`POST → ${urls.add} farmaco=${farmaco} dose=${dose} csrf=${csrf ? "ok" : "no"}`);

    const r = await fetch(urls.add, {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "manual",
      headers,
      body: JSON.stringify(payload),
    });

    const ct = (r.headers.get("content-type") || "").toLowerCase();
    // Datasette might respond with HTML on auth/CSRF errors; surface it
    if (!ct.includes("application/json")) {
      const t = await r.text();
      throw new Error(`risposta non-JSON (HTTP ${r.status}, ${ct}): ${t.slice(0, 220)}`);
    }
    const j = await r.json();
    if (!r.ok || !j || j.ok !== true) {
      throw new Error((j && j.error) ? j.error : `HTTP ${r.status}`);
    }
    return j;
  }

  function wireCard(card, urls) {
    const farmaco = (card.dataset.farmaco || "").trim();
    const doseDefaultRaw = (card.dataset.doseDefault || "").trim();
    const doseDefault = doseDefaultRaw ? Number(doseDefaultRaw) : null;

    const btnQuick = card.querySelector('button[data-action="quick"]');
    const btnPlus  = card.querySelector('button[data-action="plus"]');
    const doseBox  = card.querySelector("[data-dose-box]");
    const doseIn   = card.querySelector("[data-dose-input]");

    async function doPost(btn, dose) {
      clearCardError(card);
      setBusy(btnQuick, true);
      setBusy(btnPlus, true);
      try {
        await postAdd(urls, farmaco, dose);
        log(`OK farmaco=${farmaco}`);
        await fetchRecent(urls);
      } catch (e) {
        const msg = (e && e.message) ? e.message : String(e);
        showCardError(card, "Errore: " + msg);
        log(`ERRORE: ${msg}`);
      } finally {
        setBusy(btnQuick, false);
        setBusy(btnPlus, false);
      }
    }

    if (btnQuick) {
      btnQuick.addEventListener("click", async () => {
        const d = (doseDefault !== null && !Number.isNaN(doseDefault)) ? doseDefault : null;
        await doPost(btnQuick, d);
      });
    }

    if (btnPlus) {
      btnPlus.addEventListener("click", async () => {
        // toggle input box
        if (doseBox) {
          doseBox.hidden = !doseBox.hidden;
          if (!doseBox.hidden && doseIn) doseIn.focus();
        }
      });
    }

    if (doseIn) {
      doseIn.addEventListener("keydown", async (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          const v = (doseIn.value || "").replace(",", ".").trim();
          const d = v ? Number(v) : null;
          await doPost(btnPlus || btnQuick, (Number.isNaN(d) ? null : d));
          if (doseBox) doseBox.hidden = true;
          doseIn.value = "";
        }
        if (ev.key === "Escape") {
          if (doseBox) doseBox.hidden = true;
          doseIn.value = "";
        }
      });
    }
  }

  function main() {
    const urls = getUrls();
    if (!urls || !urls.add || !urls.recent) {
      console.error("pillole: missing urls");
      return;
    }
    log(`init add=${urls.add} recent=${urls.recent}`);
    $all("[data-pillole-card]").forEach((card) => wireCard(card, urls));
    fetchRecent(urls);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
