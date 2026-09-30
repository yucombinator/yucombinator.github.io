import * as dagre from "https://esm.sh/dagre@0.8.5";
import * as d3 from "https://esm.sh/d3@7.9.0";
import { loadGraph } from "./graph.js";
import { layoutGraph } from "./layout.js";
import { renderGraph, updateHighlight } from "./render.js";
import { makeTextMeasurer, TRACKS } from "./model.js";
import { renderDetail } from "./detail.js";
import { detailModel } from "./model.js";

const err = document.getElementById("err");
const fail = (msg) => { err.textContent = msg; err.classList.add("show"); };

try {
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
  const mk = (id, label) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.track = id;
    b.setAttribute("aria-pressed", String(state.track === id));
    b.addEventListener("click", () => { state.track = id; paint(); });
    return b;
  };
  seg.append(mk(null, "All"), ...TRACKS.map(t => mk(t.id, t.label)));
  const rows = document.getElementById("legend-rows");
  for (const t of TRACKS) {
    const s = document.createElement("span");
    s.innerHTML = `<i class="swatch" style="background:${t.hue}"></i>${t.label}`;
    rows.append(s);
  }
  function paint() {
    updateHighlight(document.getElementById("graph"), d3, state);
    for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.track === state.track));
    renderDetail(detail, state.selected ? detailModel(graph.nodes.get(state.selected)) : null);
  }
} catch (e) {
  fail(`Could not draw the flowchart: ${e.message}`);
}
