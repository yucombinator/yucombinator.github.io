// Panel wiring: controls, detail card, legend, error banner.

import {
  utilityById, headlineCents, centsAtHour, periodsFor, monthlyBill,
  benchmarkCents, benchmarkId, RATES, periodAt, colorForRate,
} from "./rates.js";

/** Blend a map colour toward white so text on top of it stays readable. */
function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(c + (255 - c) * amount);
  const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

const $ = (sel) => document.querySelector(sel);

export function showError(msg) {
  const el = $("#err");
  el.textContent = msg;
  el.classList.add("show");
}

export function clearError() {
  $("#err").classList.remove("show");
}

const TYPE_ORDER = ["pud", "municipal", "iou"];

/** Every utility, grouped by who owns it, so Seattle City Light is reachable
 *  even though it is not King County's default supplier. */
export function initUtility(onPick) {
  const sel = $("#utility");
  const groups = { pud: [], municipal: [], iou: [] };
  for (const u of RATES.utilities) (groups[u.type] || groups.pud).push(u);

  sel.innerHTML = `<option value="">Choose a utility\u2026</option>` + TYPE_ORDER
    .filter((t) => groups[t].length)
    .map((t) => `<optgroup label="${TYPE_LABEL[t]}">${groups[t]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((u) => `<option value="${u.id}">${escapeOption(optionLabel(u))}</option>`)
      .join("")}</optgroup>`)
    .join("");

  sel.addEventListener("change", () => {
    if (sel.value) onPick(sel.value);
  });
}

/** Trim the registry suffixes so the control stays one tidy line. */
function optionLabel(u) {
  return u.name
    .replace(/ \([^)]*\)/g, "")
    .replace(/ ?(Public )?(Utility District|PUD)( No\. \d+)?/i, " PUD")
    .replace(/ (Light & Power|Light Department|Electric (Department|Division|Utility))$/, "")
    .replace(/,? City of /, "")
    .replace(/, Town of$/, "");
}

function escapeOption(name) {
  return String(name).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

export function syncUtility(id) {
  const sel = $("#utility");
  if (sel) sel.value = id || "";
}

export function updateBenchmarkCopy() {
  const b = utilityById(benchmarkId());
  const el = $("#legend-basis");
  if (el && b) {
    el.textContent = `Shaded against ${b.name}. Green is cheaper, red dearer, gray is no rate on file.`;
  }
  buildRamp();
}

/**
 * List view: every utility as a sortable row, priced exactly the way the map
 * is — same benchmark, same usage, same hour — so the two views never disagree.
 */
/** Which list row is expanded, if any. */
let expandedId = null;

export function renderList(state, countiesById, onPick) {
  const panel = $("#list");
  if (panel.hidden) return;
  const bench = utilityById(benchmarkId());
  const flat = state.period === "flat";

  const rows = RATES.utilities
    .map((u) => {
      const cents = flat ? headlineCents(u) : centsAtHour(u, state.hour);
      const bill = monthlyBill(u, state.usage);
      const benchBill = bench ? monthlyBill(bench, state.usage) : null;
      const delta = (bill != null && benchBill != null) ? bill - benchBill : null;
      return { u, cents, bill, delta, county: countiesById[u.id] || "" };
    })
    .sort((a, b) => {
      if (a.cents == null && b.cents == null) return a.u.name.localeCompare(b.u.name);
      if (a.cents == null) return 1;              // unpriced always last
      if (b.cents == null) return -1;
      return a.cents - b.cents;                   // cheapest first
    });

  const benchTotal = bench ? monthlyBill(bench, state.usage) : null;
  const body = rows.map(({ u, cents, bill, delta, county }) => {
    const open = u.id === expandedId;
    const cheaper = delta != null && delta < 0;
    const same = delta != null && Math.abs(delta) < 0.5;
    const cls = same ? "even" : cheaper ? "good" : "bad";
    const pct = (delta != null && benchTotal > 0) ? Math.round(Math.abs(delta) / benchTotal * 100) : null;
    const word = same ? "same" : `${pct}% ${cheaper ? "cheaper" : "more expensive"}`;
    const sign = cheaper ? "\u2212" : "+";
    const { fill } = colorForRate(cents, benchmarkCents(state.hour, state.period));
    const rowTint = cents == null ? "transparent" : tint(fill, 0.82);
    return `<tr data-id="${u.id}" tabindex="0" style="background:${rowTint}">
      <td class="c-swatch"><i style="background:${fill}"></i></td>
      <td class="c-name">
        <a href="${u.site || "#"}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">${esc(u.name)}</a>
        <span class="c-county">${esc(county || TYPE_LABEL[u.type] || u.type)}</span>
      </td>
      <td class="c-num">${cents == null ? "&mdash;" : cents.toFixed(2) + "\u00A2"}</td>
      <td class="c-num">${bill == null ? "&mdash;" : "$" + bill.toFixed(2)}</td>
      <td class="c-delta ${cls}">${delta == null ? "&mdash;" : `${word} ${sign}$${Math.abs(delta).toFixed(2)}`}</td>
    </tr>
    ${open ? `<tr class="c-expand"><td colspan="5">${detailHtml({ id: u.id, type: u.type, county }, state)}</td></tr>` : ""}`;
  }).join("");

  const benchCents = bench ? benchmarkCents(state.hour, state.period) : null;
  const lo = benchCents ? (benchCents * 0.45).toFixed(1) : "\u2014";
  const hi = benchCents ? (benchCents * 1.5).toFixed(1) : "\u2014";

  panel.innerHTML = `
    <header>
      <h2>${state.usage.toLocaleString()} kWh a month, cheapest first</h2>
      <p>Against <b>${esc(bench ? short(bench.name) : "your utility")}</b>. Click a row for detail.</p>
      <div class="list-legend">
        <div class="legend-bar"></div>
        <div class="legend-scale"><span>${lo}\u00A2</span><span class="legend-mid">${benchCents ? benchCents.toFixed(2) + "\u00A2" : ""}</span><span>${hi}\u00A2</span></div>
        <div class="legend-ends"><span>cheaper than yours</span><span>more expensive</span></div>
        <div class="legend-none"><i class="swatch" style="background:#d9ddd3"></i><span>no rate collected</span></div>
      </div>
    </header>
    <table>
      <thead><tr><th>Utility</th><th>per kWh</th><th>${state.usage.toLocaleString()} kWh</th><th>vs yours</th></tr></thead>
      <tbody>${body}</tbody>
    </table>`;

  for (const tr of panel.querySelectorAll("tbody tr[data-id]")) {
    const toggle = () => {
      expandedId = expandedId === tr.dataset.id ? null : tr.dataset.id;
      renderList(state, countiesById, onPick);
    };
    tr.addEventListener("click", toggle);
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
    });
  }
}

function fmtHourLabel(h) {
  const ampm = h < 12 ? "am" : "pm";
  return `${h % 12 === 0 ? 12 : h % 12}:00 ${ampm}`;
}

export function setView(which) {
  const map = $("#map"), list = $("#list");
  const isList = which === "list";
  list.hidden = !isList;
  map.style.display = isList ? "none" : "";
  $("#legend").hidden = isList;
  $("#detail").classList.toggle("forced-hide", isList);
  // the list carries its own title, so the site header card only gets in the way
  $("#head").style.display = isList ? "none" : "";
  if (!isList) requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
  return isList;
}

export function initControls(state, onChange, onBasemap) {
  const usage = $("#usage");
  usage.value = String(state.usage);
  usage.addEventListener("change", () => {
    state.usage = Number(usage.value);
    onChange();
  });

  const hour = $("#hour");
  const read = $("#hour-read");
  const paintHour = () => {
    const h = Number(hour.value);
    const ampm = h < 12 ? "am" : "pm";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    read.textContent = `${h12}:00 ${ampm}`;
    state.hour = h;
  };
  // The hour only means anything in "This hour" mode, so moving the slider
  // takes you there instead of leaving a dead control sitting in the panel.
  hour.addEventListener("input", () => {
    paintHour();
    if (state.period === "flat") {
      state.period = "tod";
      for (const b of mode.querySelectorAll("button")) {
        b.setAttribute("aria-pressed", String(b.dataset.mode === "tod"));
      }
      setTodNote(state.period);
    }
    onChange();
  });
  paintHour();

  const mode = $("#mode");
  mode.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-mode]");
    if (!btn) return;
    for (const b of mode.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    state.period = btn.dataset.mode;
    setTodNote(state.period);
    onChange();
  });
  setTodNote(state.period);

  const base = $("#base");
  base.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-base]");
    if (!btn) return;
    for (const b of base.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    onBasemap(btn.dataset.base);
  });

  buildRamp();
}

/** The hour slider and its caveat only belong in "This hour" view. */
function setTodNote(period) {
  const note = $("#tod-note");
  if (note) note.hidden = period !== "tod";
  const field = $("#hour-field");
  if (field) field.hidden = period !== "tod";
}

function buildRamp() {
  // The bar itself is a CSS gradient; only the numbers need filling in, and
  // they are the benchmark's own cents so the scale always means something.
  const bench = benchmarkCents(19, "flat");
  const fmt = (v) => v.toFixed(1) + "\u00A2";
  $("#ramp-lo").textContent = bench ? fmt(bench * 0.45) : "\u2014";
  $("#ramp-mid").textContent = bench ? `you: ${bench.toFixed(2)}\u00A2` : "";
  $("#ramp-hi").textContent = bench ? fmt(bench * 1.5) : "\u2014";
}

const TYPE_LABEL = {
  pud: "Public utility district",
  municipal: "Municipal utility",
  iou: "Investor-owned utility",
};

/** The shared body: the map's detail card and the list's expanded row. */
export function detailHtml(props, state) {
  const u = utilityById(props.id);
  if (!u) {
    return `<h3>${esc(props.name)}</h3>
      <div class="kind">${TYPE_LABEL[props.type] || ""}</div>
      <p class="meta">No rate on file.</p>`;
  }

  const r = u.residential || {};
  const bench = utilityById(RATES.benchmark);
  const bill = monthlyBill(u, state.usage);
  const benchBill = bench ? monthlyBill(bench, state.usage) : null;
  const delta = (bill != null && benchBill != null) ? bill - benchBill : null;
  const cents = state.period === "flat" ? headlineCents(u) : centsAtHour(u, state.hour);

  const chips = [];
  if (cents != null) chips.push(`<span class="chip">now<b>${cents.toFixed(2)}¢</b></span>`);
  if (u.tod) chips.push(`<span class="chip">time-of-day<b>${periodsFor(u).length} periods</b></span>`);
  if (delta != null) {
    const cls = delta < 0 ? "good" : "warn";
    const sign = delta < 0 ? "−" : "+";
    chips.push(`<span class="chip ${cls}">vs ${esc(short(bench.name))}<b>${sign}$${Math.abs(delta).toFixed(2)}</b></span>`);
  }

  const rows = [];
  if (bill != null) rows.push(["Est. bill", `$${bill.toFixed(2)} / mo`]);
  if (r.fixed_charge_monthly_usd) rows.push(["Basic charge", `$${r.fixed_charge_monthly_usd.toFixed(2)} / mo`]);
  const extras = (u.extra_fees || []).filter((f) => !/optional/i.test(f.name));
  for (const f of extras) {
    const val = f.unit === "pct" ? `${f.amount}% of bill`
      : f.unit === "cent_kwh" ? `${f.amount}\u00A2/kWh`
      : `$${f.amount.toFixed(2)} / mo`;
    rows.push([f.name, val]);
  }
  if (r.includes_bpa) rows.push(["BPA power", "included in rate"]);
  if (r.effective) rows.push(["Effective", r.effective]);
  rows.push(["Rate set by", r.rate_set_by || (u.type === "iou" ? "WUTC" : "Utility board")]);

  let tod = "";
  if (u.tod) {
    const at = periodAt(u.tod, state.hour);
    tod = `<table class="todtable">${periodsFor(u).map((p) => {
      const active = at && p.name === at.name;
      const mark = active ? " ◀ now" : "";
      return `<tr><td>${esc(p.name)} ${p.start}–${p.end}${mark}</td><td>${p.cents_kwh.toFixed(2)}¢</td></tr>`;
    }).join("")}</table>`;
  } else if (r.tiers && r.tiers.length > 1) {
    tod = `<table class="todtable">${r.tiers.map((t) =>
      `<tr><td>First ${t.up_to_kwh.toLocaleString()} kWh</td><td>${t.cents_kwh.toFixed(2)}¢</td></tr>`).join("")}</table>`;
  }

  return `
    <h3>${esc(u.name)}</h3>
    <div class="kind">${TYPE_LABEL[u.type] || u.type}</div>
    <p class="meta">${esc(u.service_area || props.official_name || "")}</p>
    <div class="chips">${chips.join("")}</div>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("")}</div>
    ${tod}
    <p class="src">${u.site
      ? `<a href="${u.site}" target="_blank" rel="noopener noreferrer">${esc(short(u.name))} website</a> &middot; `
      : ""}Source: ${r.source
      ? `<a href="${r.source}" target="_blank" rel="noopener noreferrer">utility tariff</a>`
      : "not yet published"}</p>
    ${u.notes ? `<details class="notes"><summary>Rate notes</summary><p>${esc(u.notes)}</p></details>` : ""}
  `;
}

export function renderDetail(props, state) {
  const panel = $("#detail");
  if (!props) { panel.classList.remove("open"); return; }
  panel.classList.add("open");
  panel.innerHTML = detailHtml(props, state);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function short(n) {
  if (!n) return "";
  if (n === "Puget Sound Energy") return "PSE";
  return n.replace(/ County PUD( No\. \d+)?/, " PUD")
          .replace(/ Public Utilities| Energy Services| Light( & Power| Department)?/g, "")
          .replace(/^City of /, "");
}
