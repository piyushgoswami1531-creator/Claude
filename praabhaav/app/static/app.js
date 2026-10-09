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

  // ---------- print / save as PDF ----------
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-print]")) window.print();
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

  // ---------- views-over-time line chart ----------
  // Single series: 2px accent line, 10% area wash, hairline grid, value label at the
  // line's end, crosshair + tooltip that snaps to the nearest day (mouse, touch, keys).
  const SVG_NS = "http://www.w3.org/2000/svg";
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  function svgEl(tag, attrs, parent) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    if (parent) parent.appendChild(el);
    return el;
  }
  function niceStep(raw) {
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
  }
  function dayLabel(d, long) {
    const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
    return long ? `${WEEKDAYS[d.getUTCDay()]}, ${base}` : base;
  }

  function renderLineChart(fig) {
    let series;
    try { series = JSON.parse(fig.dataset.series || "[]"); } catch { return; }
    if (!series.length) return;
    fig.textContent = "";
    const pts = series.map((p) => ({ ...p, date: new Date(p.day + "T00:00:00Z") }));
    const W = Math.max(fig.clientWidth, 280);
    const H = W < 520 ? 210 : 260;
    const m = { l: 48, r: 64, t: 18, b: 30 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;

    const maxV = Math.max(...pts.map((p) => p.views), 1);
    const step = niceStep(maxV / 4);
    const top = Math.ceil(maxV / step) * step;
    const t0 = pts[0].date.getTime(), t1 = pts[pts.length - 1].date.getTime();
    const x = (p) => (t1 === t0 ? m.l + pw / 2 : m.l + ((p.date.getTime() - t0) / (t1 - t0)) * pw);
    const y = (v) => m.t + ph - (v / top) * ph;

    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img",
      tabindex: "0", "aria-label": fig.getAttribute("aria-label") || "Views over time" }, fig);

    // hairline grid + y ticks (clean round numbers, compact labels)
    const grid = svgEl("g", { class: "grid" }, svg);
    const axis = svgEl("g", { class: "axis" }, svg);
    for (let v = 0; v <= top + 1e-9; v += step) {
      svgEl("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, grid);
      const t = svgEl("text", { x: m.l - 8, y: y(v) + 4, "text-anchor": "end" }, axis);
      t.textContent = compact(v);
    }
    // x labels: first, last and evenly spaced ones that fit
    const maxLabels = Math.max(2, Math.floor(pw / 74));
    const every = Math.max(1, Math.ceil(pts.length / maxLabels));
    pts.forEach((p, i) => {
      const isLast = i === pts.length - 1;
      if (i % every !== 0 && !isLast) return;
      if (!isLast && pts.length > 1 && x(pts[pts.length - 1]) - x(p) < 72) return;  // keep clear of the final date label
      const t = svgEl("text", { x: x(p), y: H - 8, "text-anchor": "middle" }, axis);
      t.textContent = dayLabel(p.date);
    });

    // area + line
    if (pts.length > 1) {
      const line = pts.map((p, i) => `${i ? "L" : "M"}${x(p).toFixed(1)},${y(p.views).toFixed(1)}`).join("");
      svgEl("path", { class: "area", d: `${line}L${x(pts[pts.length - 1])},${y(0)}L${x(pts[0])},${y(0)}Z` }, svg);
      svgEl("path", { class: "line", d: line }, svg);
    }
    // end dot + direct value label at the line's end
    const last = pts[pts.length - 1];
    svgEl("circle", { class: "end-dot", cx: x(last), cy: y(last.views), r: 4.5 }, svg);
    const endLabel = svgEl("text", { class: "end-label", x: x(last) + 10, y: y(last.views) + 4 }, svg);
    endLabel.textContent = compact(last.views);

    // hover layer
    const cross = svgEl("line", { class: "crosshair", y1: m.t, y2: m.t + ph, visibility: "hidden" }, svg);
    const dot = svgEl("circle", { class: "hover-dot", r: 5, visibility: "hidden" }, svg);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;
    fig.appendChild(tip);
    const hit = svgEl("rect", { class: "hit", x: m.l - 10, y: 0, width: pw + 20, height: H }, svg);

    let current = -1;
    function show(i) {
      current = i;
      const p = pts[i];
      const px = x(p), py = y(p.views);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
      dot.setAttribute("cx", px); dot.setAttribute("cy", py); dot.setAttribute("visibility", "visible");
      tip.textContent = "";
      const strong = document.createElement("strong");
      strong.textContent = `${p.views.toLocaleString("en-IN")} views`;
      const meta = document.createElement("span");
      let text = `${dayLabel(p.date, true)} · ${p.reels} reel${p.reels === 1 ? "" : "s"}`;
      if (i > 0) {
        const diff = p.views - pts[i - 1].views;
        text += ` · ${diff >= 0 ? "+" : "−"}${compact(Math.abs(diff))} since ${dayLabel(pts[i - 1].date)}`;
      }
      meta.textContent = text;
      const key = document.createElement("i");
      key.className = "key";
      tip.append(strong, key, meta);
      tip.hidden = false;
      const scale = fig.clientWidth / W;
      const left = Math.min(Math.max(px * scale, 80), fig.clientWidth - 80);
      tip.style.left = `${left}px`;
      tip.style.top = `${py * scale}px`;
    }
    function hide() {
      current = -1;
      cross.setAttribute("visibility", "hidden");
      dot.setAttribute("visibility", "hidden");
      tip.hidden = true;
    }
    function nearest(evt) {
      const rect = svg.getBoundingClientRect();
      const sx = ((evt.clientX - rect.left) / rect.width) * W;
      let best = 0;
      pts.forEach((p, i) => { if (Math.abs(x(p) - sx) < Math.abs(x(pts[best]) - sx)) best = i; });
      return best;
    }
    hit.addEventListener("pointermove", (e) => show(nearest(e)));
    hit.addEventListener("pointerdown", (e) => show(nearest(e)));
    hit.addEventListener("pointerleave", hide);
    svg.addEventListener("focus", () => show(pts.length - 1));
    svg.addEventListener("blur", hide);
    svg.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const next = (current < 0 ? pts.length - 1 : current) + (e.key === "ArrowLeft" ? -1 : 1);
        show(Math.min(Math.max(next, 0), pts.length - 1));
      } else if (e.key === "Escape") {
        hide();
      }
    });
  }

  function renderCharts(root = document) {
    root.querySelectorAll(".line-chart[data-series]").forEach(renderLineChart);
  }
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCharts(), 150);
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
        const chartBox = document.getElementById("views-chart");
        if (job.chart_html && chartBox) { chartBox.innerHTML = job.chart_html; renderCharts(chartBox); }
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
    renderCharts();
    initTracker();
    document.querySelectorAll("[data-toast]").forEach((el) => toast(el.dataset.toast));
  });
})();
