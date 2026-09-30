// Entry point: load data, wire the map and the panels.

import { initMap, restyle, setSelection, getSelected, setBasemap, getMap } from "./map.js";
import { setRates, setBenchmark, benchmarkId, utilityById, headlineCents, hasRate } from "./rates.js";
import { initControls, initUtility, syncUtility, renderDetail, renderList, setView, showError, clearError, updateBenchmarkCopy } from "./ui.js";

const state = { period: "flat", usage: 1000, hour: 19 };

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
    loadJson("data/utilities.json").catch(() => ({ utilities: [] })),
  ]);
  setRates(rates);
  clearError();

  setBasemap("light");   // choropleth has to read over the basemap
  // the legend is a summary; on a phone it competes with the map for space
  if (window.matchMedia("(max-width: 860px)").matches) {
    document.querySelector("#legend")?.removeAttribute("open");
  }
  initMap(boundaries, {
    onSelect: (props) => renderDetail(props, state),
  }, state);

  // dev hook: inspect the live map from the console
  window.__pud = { map: getMap(), boundaries, rates };

  // second line in the list: the official service-area name
  const areasById = {};
  for (const f of boundaries.features) {
    if (!areasById[f.properties.id]) {
      areasById[f.properties.id] = f.properties.official_name || f.properties.county || "";
    }
  }


  // every control funnels through here: map, list and detail card are always
  // rendered from the same state, so they cannot disagree
  const repaint = () => {
    restyle();
    const sel = getSelected();
    if (sel) renderDetail(sel, state);
    renderList(state, areasById);
  };

  // one benchmark setter, so the map, the list and the picker can never
  // disagree about who "yours" is
  const useBenchmark = (id) => {
    setBenchmark(id);
    syncUtility(id);
    updateBenchmarkCopy();
    repaint();
  };

  initUtility(useBenchmark);
  syncUtility(benchmarkId());   // preselect the starting benchmark

  initControls(state, repaint, setBasemap);

  const view = document.querySelector("#view");
  view.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    for (const b of view.querySelectorAll("button")) b.setAttribute("aria-pressed", "false");
    btn.setAttribute("aria-pressed", "true");
    const isList = setView(btn.dataset.view);
    if (isList) renderList(state, areasById);
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
