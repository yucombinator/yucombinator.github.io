import { isInTrack } from "./model.js";
import { edgePath } from "./layout.js";

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
    const lines = wrap(d.label, d.w - 28, measureLabel);
    const perLine = Math.max(1, lines.length);
    sel.append("text").attr("class", "label")
      .attr("x", 14).attr("y", 22)
      .selectAll("tspan").data(lines).join("tspan")
      .attr("x", 14).attr("dy", 19).text(t => t);
    if (d.chipText) {
      const chipLines = wrap(d.chipText, d.w - 28, measureChip);
      sel.append("text").attr("class", "chip")
        .attr("x", 14).attr("y", 22 + perLine * 19 + 4)
        .attr("fill", HUE[d.track] ?? HUE.origin)
        .selectAll("tspan").data(chipLines).join("tspan")
        .attr("x", 14).attr("dy", 12).text(t => t);
    }
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

export function updateHighlight(svg, d3, state) {
  const S = d3.select(svg);
  S.selectAll("g.node")
    .classed("sel", d => d.id === state.selected)
    .classed("dim", d => !isInTrack(d, state.track));
  S.selectAll("path.edge")
    .classed("dim", d => {
      const on = (t, s) => !state.track || t === state.track || s.includes(state.track);
      return !(on(d.vTrack, d.vShared) || on(d.wTrack, d.wShared));
    });
}
