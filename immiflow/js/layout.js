import { chipText, nodeSize } from "./model.js";

export function edgePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

export function layoutGraph(graph, dagreLib, opts = {}) {
  const { measure, rankSep = 90, nodeSep = 28, margin = 40 } = opts;
  const g = new dagreLib.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", ranksep: rankSep, nodesep: nodeSep, marginx: margin, marginy: margin });
  g.setDefaultEdgeLabel(() => ({}));

  const laid = new Map();
  for (const n of graph.nodes.values()) {
    const text = chipText(n);
    const { w, h } = nodeSize({ ...n, chipText: text }, measure);
    laid.set(n.id, { ...n, chipText: text, w, h });
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of graph.edges) g.setEdge(e.v, e.w, { label: e.label ?? "" }, e.conditional ? "cond" : undefined);

  dagreLib.layout(g);

  const nodes = [...laid.values()].map(n => {
    const p = g.node(n.id);
    return { ...n, x: p.x, y: p.y };
  });
  const edges = graph.edges.map(e => {
    const p = g.edge(e.v, e.w, e.conditional ? "cond" : undefined);
    const v = graph.nodes.get(e.v), w = graph.nodes.get(e.w);
    return {
      ...e,
      points: p.points.map(pt => ({ x: pt.x, y: pt.y })),
      vTrack: v.track, wTrack: w.track,
      vShared: v.sharedWith ?? [], wShared: w.sharedWith ?? [],
    };
  });
  const size = g.graph();
  return { nodes, edges, width: size.width, height: size.height };
}
