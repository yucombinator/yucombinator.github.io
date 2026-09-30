// Entry point: load data, wire the map and the panels.

import { initMap, restyle, setSelection, getSelected, setBasemap, getMap } from "./map.js";
import { setRates, setBenchmark, benchmarkId, utilityById, headlineCents, hasRate } from "./rates.js";
import { initControls, initCounty, initUtility, syncUtility, renderDetail, renderList, setView, showError, clearError, updateBenchmarkCopy } from "./ui.js";

const state = { period: "flat", usage: 1000, hour: 19, county: "King" };

async function loadJson(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path} is not valid JSON — ${err.message}`);
  }
}

async function main() {
  // destructure in the same order as the fetches below — mismatched order here
  // silently hands rates.json to initMap, which Leaflet rejects as bad GeoJSON
  const [rates, boundaries, roster] = await Promise.all([
    loadJson("data/rates.json").catch((e) => {
      showError(`Could not load rates: ${e.message}. The map below shows territories without prices.`);
      return { utilities: [], benchmark: "pse" };
    }),
    loadJson("data/boundaries.geojson"),
    loadJson("data/utilities.json").catch(() => ({ utilities: [], county_default: {} })),
  ]);
  setRates(rates);
  clearError();

  setBasemap("light");   // choropleth has to read over the basemap
  initMap(boundaries, {
    onSelect: (props) => renderDetail(props, state),
  }, state);

  // dev hook: inspect the live map from the console
  window.__pud = { map: getMap(), boundaries, rates };

  // One row per county. The benchmark is the largest PUBLIC-POWER utility with
  // territory in that county, because that is the utility a resident
  // recognises as "mine". The roster's county_default is only a fallback: 27 of
  // 41 counties default to Puget Sound Energy, so benchmarking on that made the
  // selector a no-op for two thirds of the state.
  // Seed from the roster so every county appears, even one whose only
  // operators we have no rate for: the picker must never lose a county.
  const areas = {};
  for (const c of Object.keys(roster.county_default || {})) areas[c] = {};
  for (const f of boundaries.features) {
    const c = f.properties.county;
    if (!c) continue;
    const a = ringArea(f);
    areas[c] = areas[c] || {};
    areas[c][f.properties.id] = Math.max(areas[c][f.properties.id] || 0, a);
  }

  const counties = Object.keys(areas).map((county) => {
    const byUtil = areas[county];
    const fallback = roster.county_default?.[county];
    const publicIds = new Set(roster.utilities.map((u) => u.id));
    // only utilities we actually have a price for, otherwise the map goes gray
    const priced = (uid) => hasRate(uid);
    const publicHere = Object.entries(byUtil)
      .filter(([uid]) => publicIds.has(uid) && priced(uid))
      .sort((a, b) => b[1] - a[1]);
    const pricedAnywhere = Object.entries(byUtil)
      .filter(([uid]) => priced(uid))
      .sort((a, b) => b[1] - a[1]);
    const chosen = publicHere.length
      ? publicHere[0][0]
      : (pricedAnywhere.length ? pricedAnywhere[0][0] : (fallback || Object.entries(byUtil)[0][0]));
    const u = utilityById(chosen);
    return {
      county,
      id: chosen,
      utilityName: u ? shortLabel(u.name, chosen) : chosen,
      isPublic: publicHere.length > 0,
      hasPrice: priced(chosen),
    };
  }).sort((a, b) => a.county.localeCompare(b.county));

  const countiesById = {};
  for (const f of boundaries.features) {
    const id = f.properties.id;
    if (!countiesById[id]) countiesById[id] = `${f.properties.county} County`;
  }

  // every control funnels through here: map, list and detail card are always
  // rendered from the same state, so they cannot disagree
  const repaint = () => {
    restyle();
    const sel = getSelected();
    if (sel) renderDetail(sel, state);
    renderList(state, countiesById);
  };

  // one benchmark setter: county, utility picker and initial state all use it,
  // so the map, list and both dropdowns can never disagree about who "yours" is
  const useBenchmark = (id) => {
    setBenchmark(id);
    syncUtility(id);
    updateBenchmarkCopy();
    repaint();
  };

  initCounty(counties, state, (row) => useBenchmark(row.id));
  initUtility(useBenchmark);
  syncUtility(benchmarkId());   // show the starting benchmark in the utility picker

  initControls(state, repaint, setBasemap);

  const view = document.querySelector("#view");
  view.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    for (const b of view.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    const isList = setView(btn.dataset.view);
    if (isList) renderList(state, countiesById);
  });

  const missing = boundaries.features
    .map((f) => f.properties.id)
    .filter((id) => !utilityById(id)?.residential || headlineCents(utilityById(id)) == null);
  const missingCount = new Set(missing).size;
  if (missingCount) {
    console.warn(`${missingCount} utilities have no collected rate yet:`, [...new Set(missing)].join(", "));
  }
}

function ringArea(f) {
  const ring = f.geometry && f.geometry.coordinates && f.geometry.coordinates[0];
  if (!ring) return 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return Math.abs(a / 2);
}

function shortLabel(name, id) {
  return name
    .replace(/ County PUD( No\. \d+)?/, " PUD")
    .replace(/ Public Utilities| Energy Services| Light( & Power| Department)?/g, "")
    .replace(/^City of /, "") || id;
}

main().catch((err) => showError(err.message));
