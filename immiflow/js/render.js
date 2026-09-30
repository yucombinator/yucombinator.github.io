import { isInTrack } from "./model.js";
import { edgePath, placeEdgeLabel } from "./layout.js";

const LABEL_LH = 19;
const CHIP_LH = 12;
const CHIP_GAP = 4;

const HUE = { student: "#1f78b4", employment: "#0c5237", family: "#8a6512", humanitarian: "#9a3412", origin: "#18362d" };

function makeMeasurer(S, className) {
  const temp = S.append("text").attr("class", className);
  return (s) => { temp.text(s); return temp.node().getComputedTextLength(); };
}

function wrap(text, maxW, measure) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    const candidate = line ? line + " " + w : w;
    if (measure(candidate) > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function renderGraph(svg, laid, d3, state) {
  const S = d3.select(svg);
  S.selectAll("*").remove();
  S.attr("viewBox", `0 0 ${laid.width} ${laid.height}`)
    .attr("width", laid.width).attr("height", laid.height);

  S.append("defs").append("marker")
    .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
    .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L9,0L0,4").attr("class", "arrowhead");
  const measureLabel = makeMeasurer(S, "measure-label");
  const measureChip = makeMeasurer(S, "measure-chip");

  const gEdges = S.append("g");
  gEdges.selectAll("path").data(laid.edges).join("path")
    .attr("class", d => `edge${d.conditional ? " conditional" : ""}`)
    .attr("d", d => edgePath(d.points))
    .attr("marker-end", "url(#arrow)");
  const nodeBox = (n) => ({ l: n.x - n.w / 2, r: n.x + n.w / 2, t: n.y - n.h / 2, b: n.y + n.h / 2 });
  const boxes = new Map(laid.nodes.map(n => [n.id, nodeBox(n)]));
  const placed = [];
  gEdges.selectAll("text").data(laid.edges.filter(e => e.label)).join("text")
    .attr("class", "edge-label")
    .attr("text-anchor", "middle")
    .attr("x", 0).attr("y", 0)
    .text(d => d.label)
    .each(function (d) {
      const ink = this.getBBox();
      const at = placeEdgeLabel(d.points, { width: ink.width, top: ink.y, bottom: ink.y + ink.height },
        boxes.get(d.v), boxes.get(d.w), placed);
      d3.select(this).attr("x", at.x).attr("y", at.y);
      placed.push(at.box);
    });

  const gNodes = S.append("g");
  const g = gNodes.selectAll("g").data(laid.nodes, d => d.id).join("g")
    .attr("class", d => `node${d.gate ? " gated" : ""}`)
    .attr("tabindex", 0).attr("role", "button")
    .attr("aria-label", d => `${d.label}${d.chipText ? ", " + d.chipText : ""}`)
    .attr("transform", d => `translate(${d.x - d.w / 2},${d.y - d.h / 2})`);

  g.append("rect").attr("class", "box")
    .attr("width", d => d.w).attr("height", d => d.h)
    .attr("stroke", d => HUE[d.track] ?? HUE.origin);

  g.each(function (d) {
    const sel = d3.select(this);
    const labelLines = wrap(d.label, d.w - 28, measureLabel);
    // Every tspan's `dy` is measured from the previous baseline, so the first one is
    // 0 and sits on the <text> element's own y. Then the whole block is centred in
    // the box by its measured height, instead of starting at a guessed offset.
    const block = sel.append("g").attr("class", "block");
    block.append("text").attr("class", "label")
      .attr("x", 14).attr("y", 0)
      .selectAll("tspan").data(labelLines).join("tspan")
      .attr("x", 14).attr("dy", (t, i) => i * LABEL_LH).text(t => t);
    if (d.chipText) {
      const chipLines = wrap(d.chipText, d.w - 28, measureChip);
      block.append("text").attr("class", "chip")
        .attr("x", 14).attr("y", 0)
        .attr("fill", HUE[d.track] ?? HUE.origin)
        .selectAll("tspan").data(chipLines).join("tspan")
        .attr("x", 14)
        .attr("dy", (t, i) => i === 0 ? labelLines.length * LABEL_LH + CHIP_GAP : CHIP_LH)
        .text(t => t);
    }
    const box = sel.select("rect.box").node().getBBox();
    const ink = block.node().getBBox();
    block.attr("transform", `translate(0,${((box.height - ink.height) / 2 - ink.y).toFixed(2)})`);
  });

  g.on("click", (event, d) => window.dispatchEvent(
    new CustomEvent("node:select", { detail: d.id })));
  g.on("keydown", (event, d) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("node:select", { detail: d.id }));
    }
  });

  S.selectAll("text.measure-label, text.measure-chip").remove();

  updateHighlight(svg, d3, state);
}

function edgeDimmed(d, track) {
  const on = (t, s) => !track || t === track || s.includes(track);
  return !(on(d.vTrack, d.vShared) || on(d.wTrack, d.wShared));
}

export function updateHighlight(svg, d3, state) {
  const S = d3.select(svg);
  S.selectAll("g.node")
    .classed("sel", d => d.id === state.selected)
    .classed("dim", d => !isInTrack(d, state.track));
  S.selectAll("path.edge, text.edge-label")
    .classed("dim", d => edgeDimmed(d, state.track));
}
