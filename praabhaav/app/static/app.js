// Praabhaav interactivity: toasts, copy, live search, sortable tables, count-up
// stats, busy buttons, confirmations and the inline-editing campaign tracker.
(() => {
  "use strict";

  // ---------- toasts ----------
  function toast(message, kind = "good") {
    const box = document.getElementById("toasts");
    if (!box || !message) return;
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 320); }, 3200);
  }
  window.toast = toast;

  // ---------- number formatting (matches the server's filters) ----------
  function inr(n) {
    const s = String(Math.round(Math.abs(n)));
    if (s.length <= 3) return (n < 0 ? "-" : "") + s;
    const head = s.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ",");
    return (n < 0 ? "-" : "") + head + "," + s.slice(-3);
  }
  function compact(n) {
    for (const [div, suffix] of [[1e6, "M"], [1e3, "K"]]) {
      if (Math.abs(n) >= div) return (n / div).toFixed(1).replace(/\.0$/, "") + suffix;
    }
    return String(Math.round(n));
  }

  // ---------- count-up stat values ----------
  function countUp(root = document) {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.querySelectorAll("[data-count]").forEach((el) => {
      const target = Number(el.dataset.count);
      if (!Number.isFinite(target) || target === 0 || reduce) return;
      const fmt = el.dataset.format;
      const render = (v) => (fmt === "inr" ? "₹" + inr(v) : fmt === "compact" ? compact(v) : String(Math.round(v)));
      const start = performance.now();
      const dur = 900;
      const step = (now) => {
        const t = Math.min(1, (now - start) / dur);
        el.textContent = render(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  // ---------- copy buttons ----------
  document.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-copy]");
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      toast("Copied to clipboard");
    } catch {
      window.prompt("Copy this:", btn.dataset.copy);
    }
  });

  // ---------- confirm + busy forms ----------
  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.dataset.confirm && !window.confirm(form.dataset.confirm)) {
      e.preventDefault();
      return;
    }
    if (form.hasAttribute("data-busy")) {
      const btn = form.querySelector("button[type=submit], button:not([type])");
      if (btn) {
        btn.disabled = true;
        btn.insertAdjacentHTML("afterbegin", '<span class="spinner"></span>');
      }
    }
  });

  // ---------- live table search ----------
  document.addEventListener("input", (e) => {
    const input = e.target.closest("[data-search]");
    if (!input) return;
    const table = document.querySelector(input.dataset.search);
    if (!table) return;
    const q = input.value.trim().toLowerCase();
    table.querySelectorAll("tbody tr").forEach((tr) => {
      const text = (tr.textContent + " " + [...tr.querySelectorAll("input")].map((i) => i.value).join(" ")).toLowerCase();
      tr.hidden = q !== "" && !text.includes(q);
    });
  });

  // ---------- sortable columns ----------
  document.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const table = th.closest("table");
    const idx = [...th.parentElement.children].indexOf(th);
    const dir = th.dataset.dir === "asc" ? "desc" : "asc";
    table.querySelectorAll("th[data-sort]").forEach((h) => delete h.dataset.dir);
    th.dataset.dir = dir;
    const numeric = th.dataset.sort === "num";
    const key = (tr) => {
      const td = tr.children[idx];
      if (!td) return "";
      const raw = td.dataset.sortValue ?? td.textContent.trim();
      return numeric ? Number(raw) || 0 : raw.toLowerCase();
    };
    const body = table.tBodies[0];
    const rows = [...body.rows].filter((r) => !r.classList.contains("empty-row"));
    rows.sort((a, b) => {
      const ka = key(a), kb = key(b);
      return (ka > kb ? 1 : ka < kb ? -1 : 0) * (dir === "asc" ? 1 : -1);
    });
    rows.forEach((r) => body.appendChild(r));
  });

  // ---------- campaign tracker ----------
  function initTracker() {
    const tracker = document.getElementById("tracker");
    if (!tracker) return;
    const campaignId = tracker.dataset.campaignId;
    const body = document.querySelector("#roster tbody");
    const totals = document.getElementById("roster-totals");
    const jobBox = document.getElementById("job-status");

    async function api(method, url, data) {
      const res = await fetch(url, {
        method,
        headers: data ? { "Content-Type": "application/json" } : {},
        body: data ? JSON.stringify(data) : undefined,
        credentials: "same-origin",
      });
      let json = {};
      try { json = await res.json(); } catch { /* empty body */ }
      if (res.status === 401) { window.location = "/login?next=" + encodeURIComponent(location.pathname); }
      if (!res.ok) throw new Error(json.error || "Something went wrong");
      return json;
    }

    function swapTotals(html) {
      if (html && totals) { totals.innerHTML = html; countUp(totals); }
    }
    function rowFromHtml(html) {
      const t = document.createElement("tbody");
      t.innerHTML = html.trim();
      return t.firstElementChild;
    }

    // Add a creator
    const addForm = document.getElementById("add-row");
    addForm?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const data = Object.fromEntries(new FormData(addForm));
      const btn = addForm.querySelector("button");
      btn.disabled = true;
      try {
        const res = await api("POST", `/admin/api/campaigns/${campaignId}/rows`, data);
        body.querySelector(".empty-row")?.remove();
        const tr = rowFromHtml(res.row_html);
        tr.classList.add("flash");
        body.prepend(tr);
        swapTotals(res.totals_html);
        addForm.reset();
        addForm.querySelector("input").focus();
        toast(`Added ${data.profile_url}`);
      } catch (err) {
        toast(err.message, "error");
      } finally {
        btn.disabled = false;
      }
    });

    // Inline edits: save when a cell loses focus (or Enter is pressed)
    body.addEventListener("focusin", (e) => {
      if (e.target.matches(".cell-input")) e.target.dataset.original = e.target.value;
    });
    body.addEventListener("keydown", (e) => {
      if (!e.target.matches(".cell-input")) return;
      if (e.key === "Enter") { e.preventDefault(); e.target.blur(); }
      if (e.key === "Escape") { e.target.value = e.target.dataset.original ?? e.target.value; e.target.blur(); }
    });
    body.addEventListener("focusout", async (e) => {
      const input = e.target;
      if (!input.matches(".cell-input") || input.value === input.dataset.original) return;
      const tr = input.closest("tr");
      const field = input.dataset.field;
      input.classList.add("saving");
      try {
        const res = await api("PATCH", `/admin/api/rows/${tr.dataset.rowId}`, { [field]: input.value });
        const fresh = rowFromHtml(res.row_html);
        tr.replaceWith(fresh);
        fresh.querySelector(`[data-field="${field}"]`)?.classList.add("saved");
        swapTotals(res.totals_html);
      } catch (err) {
        input.classList.remove("saving");
        input.classList.add("invalid");
        input.value = input.dataset.original ?? input.value;
        setTimeout(() => input.classList.remove("invalid"), 1500);
        toast(err.message, "error");
      }
    });

    // Delete a row
    body.addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-delete-row]");
      if (!btn) return;
      const tr = btn.closest("tr");
      if (!window.confirm("Remove this creator from the campaign tracker?")) return;
      try {
        const res = await api("DELETE", `/admin/api/rows/${tr.dataset.rowId}`);
        tr.remove();
        swapTotals(res.totals_html);
        toast("Creator removed");
      } catch (err) {
        toast(err.message, "error");
      }
    });

    // Live views / followers via Apify (background job + polling)
    function setRefreshButtons(disabled) {
      tracker.querySelectorAll("[data-refresh]").forEach((b) => {
        if (!b.title) b.disabled = disabled;
      });
    }
    async function poll() {
      jobBox.hidden = false;
      setRefreshButtons(true);
      try {
        const job = await api("GET", `/admin/api/campaigns/${campaignId}/job`);
        if (job.state === "running") { setTimeout(poll, 2500); return; }
        jobBox.hidden = true;
        setRefreshButtons(false);
        if (job.body_html) { body.innerHTML = job.body_html; swapTotals(job.totals_html); }
        toast(job.message, job.state === "error" ? "error" : "good");
      } catch (err) {
        jobBox.hidden = true;
        setRefreshButtons(false);
        toast(err.message, "error");
      }
    }
    tracker.querySelectorAll("[data-refresh]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api("POST", `/admin/api/campaigns/${campaignId}/refresh?kind=${btn.dataset.refresh}`);
          jobBox.querySelector(".msg").textContent = btn.dataset.refresh === "views"
            ? "Fetching live views from Instagram via Apify… this takes 20–60 seconds."
            : "Fetching follower counts via Apify… this takes 20–60 seconds.";
          poll();
        } catch (err) {
          toast(err.message, "error");
        }
      });
    });
    if (tracker.dataset.jobState === "running") poll();
  }

  document.addEventListener("DOMContentLoaded", () => {
    countUp();
    initTracker();
    document.querySelectorAll("[data-toast]").forEach((el) => toast(el.dataset.toast));
  });
})();
