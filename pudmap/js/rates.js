// Rate lookup, color mapping, and bill math.
//
// Rates are curated inputs (data/rates.json). Everything computed here is
// derived: blended cost for a usage profile, time-of-day period selection,
// and the delta versus the comparison utility. Nothing is fetched live, and
// the UI says so.

export let RATES = { utilities: [], benchmark: "pse" };

// Residential load shape: share of monthly kWh by hour of day. Peaks in the
// evening, a morning bump, low overnight. Used only to estimate a TOD bill.
export const LOAD_SHAPE = buildShape();

function buildShape() {
  const raw = [
    0.45, 0.40, 0.38, 0.36, 0.36, 0.40, // 00-05
    0.55, 0.85, 1.05, 1.05, 1.00, 1.00, // 06-11
    1.05, 1.00, 0.95, 1.05, 1.55, 1.95, // 12-17
    2.20, 2.10, 1.80, 1.50, 1.20, 0.80, // 18-23
  ];
  const total = raw.reduce((a, b) => a + b, 0);
  return raw.map((v) => v / total);
}

export function setRates(payload) {
  RATES = payload;
}

/** Point every comparison at a different benchmark utility. */
export function setBenchmark(id) {
  if (utilityById(id)) RATES = { ...RATES, benchmark: id };
}

export function benchmarkId() {
  return RATES.benchmark;
}

export function utilityById(id) {
  return RATES.utilities.find((u) => u.id === id) || null;
}

/** The single number used to color the map for the current period. */
export function headlineCents(u) {
  if (!u || !u.residential) return null;
  const r = u.residential;
  // the standard residential rate: every time-of-day schedule we collected is
  // an opt-in product, so TOD never drives the headline number
  if (u.standard === "tod" && u.tod) {
    const p = periodAt(u.tod, 19, state_month);
    return p ? p.cents_kwh : null;
  }
  if (r.energy_cents_kwh != null) return r.energy_cents_kwh;
  if (r.tiers && r.tiers.length) return r.tiers[0].cents_kwh;
  return null;
}

/** Full 24h period lookup for a TOD schedule; flat schedules return one band. */
export function periodsFor(u) {
  if (!u || !u.residential) return [];
  const r = u.residential;
  if (u.tod && u.tod.periods && u.tod.periods.length) return seasonPeriods(u.tod, state_month);
  const c = headlineCents(u);
  return c == null ? [] : [{ name: "Flat", start: "00:00", end: "24:00", cents_kwh: c }];
}

export function periodAt(tod, hour, month = state_month) {
  const hhmm = `${String(hour).padStart(2, "0")}:00`;
  const hits = seasonPeriods(tod, month).filter((p) => inWindow(hhmm, p.start, p.end));
  if (!hits.length) return null;
  hits.sort((a, b) => windowWidth(a) - windowWidth(b));
  return hits[0];
}

function windowWidth(p) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const w = toMin(p.end) - toMin(p.start);
  return w <= 0 ? w + 1440 : w;   // wraps midnight
}

/** PSE and Avista publish separate summer and winter period sets, so the
 *  period names collide. Keep only the periods that apply to the chosen month. */
export function seasonPeriods(tod, month = state_month) {
  const all = tod.periods || [];
  const hasSeasons = all.some((p) => /winter|summer|shoulder/i.test(p.name || ""));
  if (!hasSeasons) return all;
  const want = /winter/i.test(all.map((p) => p.name).join(" ")) ? seasonFor(month) : null;
  const filtered = all.filter((p) => {
    const n = p.name || "";
    if (/winter/i.test(n)) return want === "winter";
    if (/summer/i.test(n)) return want === "summer";
    return !/(shoulder)/i.test(n) || want === "winter";
  });
  return filtered.length ? filtered : all;
}

function seasonFor(month) {
  return (month >= 4 && month <= 9) ? "summer" : "winter";
}

function inWindow(t, start, end) {
  if (start === end) return true;
  if (start < end) return t >= start && t < end;
  return t >= start || t < end;   // wraps midnight
}

/** Cents/kWh a utility charges at a given hour (flat or TOD). */
export function centsAtHour(u, hour) {
  if (!u || !u.residential) return null;
  const r = u.residential;
  if (u.tod) {
    const p = periodAt(u.tod, hour, state_month);
    return p ? p.cents_kwh : null;
  }
  return headlineCents(u);
}

/** Fixed monthly surcharges a typical residential customer actually pays. */
export function monthlyFees(u) {
  if (!u) return 0;
  const fees = u.extra_fees || [];
  return fees
    .filter((f) => f.unit === "mo" && !/optional/i.test(f.name))
    .reduce((a, f) => a + (f.amount || 0), 0);
}

/** Energy riders billed in cents/kWh on top of the base energy rate. */
export function energyRiders(u) {
  if (!u) return 0;
  return (u.extra_fees || [])
    .filter((f) => f.unit === "cent_kwh" && !/optional/i.test(f.name))
    .reduce((a, f) => a + (f.amount || 0), 0);
}

/** Bill-level taxes as a percentage (utility taxes that vary by city). */
export function billTaxPct(u) {
  if (!u) return 0;
  return (u.extra_fees || [])
    .filter((f) => f.unit === "pct" && !/optional/i.test(f.name))
    .reduce((a, f) => a + (f.amount || 0), 0);
}

/** Monthly bill in USD for a usage profile, including riders, fees and taxes. */
export function monthlyBill(u, kwhPerMonth) {
  if (!u || !u.residential) return null;
  const r = u.residential;
  const fixed = r.fixed_charge_monthly_usd || 0;
  if (u.standard === "tod" && u.tod) {
    // weight each hour's rate by the load shape; the profile is a monthly total
    let cents = 0;
    for (let h = 0; h < 24; h++) {
      const rate = centsAtHour(u, h);
      if (rate == null) return null;
      cents += rate * kwhPerMonth * LOAD_SHAPE[h];
    }
    return finishBill((cents + energyRiders(u) * kwhPerMonth) / 100 + fixed, u);
  }
  if (r.tiers && r.tiers.length) {
    let cents = 0;
    let remaining = kwhPerMonth;
    for (const tier of r.tiers) {
      if (remaining <= 0) break;
      const block = Math.min(remaining, tier.up_to_kwh);
      cents += block * tier.cents_kwh;
      remaining -= block;
    }
    if (remaining > 0) {
      const last = r.tiers[r.tiers.length - 1].cents_kwh;
      cents += remaining * last;
    }
    return finishBill((cents + energyRiders(u) * kwhPerMonth) / 100 + fixed, u);
  }
  if (r.energy_cents_kwh == null) return null;
  const withRiders = (r.energy_cents_kwh + energyRiders(u)) * kwhPerMonth;
  return finishBill(withRiders / 100 + fixed, u);
}

/** Add fixed surcharges then bill-level taxes to a subtotal. */
function finishBill(subtotal, u) {
  const withFees = subtotal + monthlyFees(u);
  const pct = billTaxPct(u);
  return pct ? withFees * (1 + pct / 100) : withFees;
}

let state_month = 9;   // September, overridable from the UI

export function setMonth(m) {
  state_month = m;
}

export function benchmarkCents(hour, mode = "flat") {
  const b = utilityById(RATES.benchmark);
  if (!b) return null;
  return mode === "flat" ? headlineCents(b) : centsAtHour(b, hour);
}

/**
 * One scale, one meaning: how a territory's price compares with the selected
 * benchmark. Ownership is deliberately NOT encoded — a PUD and an
 * investor-owned utility land in the same colour when they cost the same,
 * which is the entire point of the comparison.
 */
export function colorForRate(cents, bench) {
  if (cents == null) return { fill: "#d9ddd3", stroke: "#b9bdb3" };
  const ratio = bench == null || bench <= 0 ? 0.7 : cents / bench;
  if (ratio < 0.45) return { fill: "#1b5e3a", stroke: "#0c5237" };  // far cheaper
  if (ratio < 0.65) return { fill: "#2f7d4f", stroke: "#1a6b4a" };
  if (ratio < 0.82) return { fill: "#7fb894", stroke: "#2f7d4f" };
  if (ratio < 0.95) return { fill: "#cfe3d2", stroke: "#4caf7d" };
  if (ratio < 1.01) return { fill: "#f4f1e2", stroke: "#a89a68" };  // the benchmark
  if (ratio < 1.10) return { fill: "#e8dfae", stroke: "#8a6512" };
  if (ratio < 1.25) return { fill: "#e2a45f", stroke: "#a3530b" };
  if (ratio < 1.5) return { fill: "#d9722f", stroke: "#9a3412" };
  return { fill: "#b83c1c", stroke: "#7d2c0e" };                    // much more expensive
}

function ramp(v, lo, hi) {
  const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
  const a = [27, 94, 58], b = [201, 80, 47];
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function rateStyle(props, state) {
  const u = utilityById(props.id);
  const flat = state.period === "flat";
  const cents = flat ? headlineCents(u) : centsAtHour(u, state.hour);
  const bench = benchmarkCents(state.hour, state.period);
  const { fill, stroke } = colorForRate(cents, bench);
  return { color: stroke, weight: 1.1, fillColor: fill, fillOpacity: 0.86 };
}

export function labelStyle() {
  return { color: "#18362d", font: "600 11px -apple-system, 'Segoe UI', sans-serif" };
}

export function hasRate(id) {
  const u = utilityById(id);
  return !!(u && u.residential && headlineCents(u) != null);
}
