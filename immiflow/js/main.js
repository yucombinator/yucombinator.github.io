import { loadGraph } from "./graph.js";
import { layoutGraph } from "./layout.js";
import { renderGraph, updateHighlight } from "./render.js";
import { detailModel, makeTextMeasurer, TRACKS } from "./model.js";
import { renderDetail } from "./detail.js";

const err = document.getElementById("err");
const fail = (msg) => { err.textContent = msg; err.classList.add("show"); };

// Imported here, not at module top level: a static import of an unreachable esm.sh
// fails module resolution before a single line of this file runs, which is exactly
// when the banner is needed.
const cdn = async (lib, url) => {
  try { return await import(url); }
  catch (e) { throw new Error(`could not load ${lib} from ${url}: ${e.message}`); }
};

try {
  const dagre = await cdn("dagre", "https://esm.sh/dagre@0.8.5");
  const d3 = await cdn("d3", "https://esm.sh/d3@7.9.0");
  const graph = await loadGraph("data/flow.json");
  const laid = layoutGraph(graph, dagre, { measure: makeTextMeasurer() });
  const state = { selected: null, track: null };
  renderGraph(document.getElementById("graph"), laid, d3, state);

  const detail = document.getElementById("detail");
  window.addEventListener("node:select", (e) => {
    state.selected = e.detail;
    paint();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { state.selected = null; paint(); }
  });

  const seg = document.getElementById("track");
  const mk = (id, label, hue) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.track = id ?? "";
    if (hue) b.style.setProperty("--track-hue", hue);
    b.setAttribute("aria-pressed", String(state.track === id));
    b.addEventListener("click", () => { state.track = id; paint(); });
    return b;
  };
  seg.append(mk(null, "All"), ...TRACKS.map(t => mk(t.id, t.label, t.hue)));
  const rows = document.getElementById("legend-rows");
  for (const t of TRACKS) {
    const s = document.createElement("span");
    s.innerHTML = `<i class="swatch" style="background:${t.hue}"></i>${t.label}`;
    rows.append(s);
  }
  function paint() {
    updateHighlight(document.getElementById("graph"), d3, state);
    for (const b of seg.children) b.setAttribute("aria-pressed", String((b.dataset.track || null) === state.track));
    const node = graph.nodes.get(state.selected);
    renderDetail(detail, node ? detailModel(node) : null);
  }
} catch (e) {
  fail(`Could not draw the flowchart: ${e.message}`);
}
