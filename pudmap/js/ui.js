// Panel wiring: controls, detail card, legend, error banner.

import {
  utilityById, headlineCents, centsAtHour, periodsFor, monthlyBill,
  benchmarkCents, benchmarkId, RATES, periodAt,
} from "./rates.js";

const $ = (sel) => document.querySelector(sel);

export function showError(msg) {
  const el = $("#err");
  el.textContent = msg;
  el.classList.add("show");
}

export function clearError() {
  $("#err").classList.remove("show");
}

/** County selector: choosing a county re-benchmarks the whole map. */
export function initCounty(counties, current, onPick) {
  const sel = $("#county");
  sel.innerHTML = counties
    .map((c) => `<option value="${c.county}">${c.county} County — ${c.utilityName}`
      + `${c.isPublic ? "" : " (no public power)"}${c.hasPrice ? "" : " (no rate)"}</option>`)
    .join("");
  sel.value = current.county;
  sel.addEventListener("change", () => {
    const row = counties.find((c) => c.county === sel.value);
    current.county = row.county;
    if (!row.hasPrice) {
      showError(`${row.county} County's main utility has no published residential rate in our data, so prices cannot be compared against it. Pick another county or ignore the colours.`);
    } else {
      clearError();
    }
    onPick(row);
  });
  updateBenchmarkCopy();
}

export function updateBenchmarkCopy() {
  const b = utilityById(benchmarkId());
  const el = $("#legend-basis");
  if (el && b) {
    el.textContent = `Every territory is shaded by how its price compares with ${b.name} at the selected hour. Green is cheaper, red is dearer, gray is a rate we have not collected.`;
  }
  buildRamp();
}

export function initControls(state, onChange, onBasemap) {
  const usage = $("#usage");
  usage.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-kwh]");
    if (!btn) return;
    for (const b of usage.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    state.usage = Number(btn.dataset.kwh);
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

/** Say plainly how much of the state can move with the hour slider. */
function setTodNote(period) {
  const el = $("#tod-note");
  if (el) el.hidden = period !== "tod";
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

export function renderDetail(props, state) {
  const panel = $("#detail");
  if (!props) { panel.classList.remove("open"); return; }
  const u = utilityById(props.id);
  panel.classList.add("open");
  if (!u) {
    panel.innerHTML = `<h3>${esc(props.name)}</h3>
      <div class="kind">${TYPE_LABEL[props.type] || ""}</div>
      <p class="meta">Rate not yet collected for this utility.</p>`;
    return;
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

  panel.innerHTML = `
    <h3>${esc(u.name)}</h3>
    <div class="kind">${TYPE_LABEL[u.type] || u.type}</div>
    <p class="meta">${esc(u.service_area || props.county + " County")}</p>
    <div class="chips">${chips.join("")}</div>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join("")}</div>
    ${tod}
    <p class="src">Source: ${r.source
      ? `<a href="${r.source}" target="_blank" rel="noopener">utility tariff</a>`
      : "not yet published"}</p>
    ${u.notes ? `<details class="notes"><summary>Rate notes</summary><p>${esc(u.notes)}</p></details>` : ""}
  `;
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
