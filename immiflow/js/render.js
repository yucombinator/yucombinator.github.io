import { isInTrack } from "./model.js";

const HUE = { student: "#1f78b4", employment: "#0c5237", family: "#8a6512", humanitarian: "#9a3412", origin: "#18362d" };

function wrap(text, perLine) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine && line) { lines.push(line); line = w; }
    else line = (line + " " + w).trim();
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
    .append("path").attr("d", "M0,-4L9,0L0,4").attr("fill", "#d9ddd3");

  const gEdges = S.append("g");
  gEdges.selectAll("path").data(laid.edges).join("path")
    .attr("class", d => `edge${d.conditional ? " conditional" : ""}`)
    .attr("d", d => d.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "))
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
    const lines = wrap(d.label, Math.floor(d.w / 8));
    const perLine = Math.max(1, lines.length);
    sel.append("text").attr("class", "label")
      .attr("x", 14).attr("y", 22)
      .selectAll("tspan").data(lines).join("tspan")
      .attr("x", 14).attr("dy", 19).text(t => t);
    if (d.chipText) {
      const chipLines = wrap(d.chipText, Math.floor((d.w - 28) / 5.6));
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
