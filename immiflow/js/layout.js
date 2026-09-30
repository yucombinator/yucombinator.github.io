import { chipText, nodeSize } from "./model.js";

export function edgePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

// The middle of the polyline's longest straight leg, on the line, with its unit
// normal. The longest leg is the one dagre drew as a run; the short legs at each end
// are stubs out of the node, and a label centred on one of those crosses the corner.
// The normal is biased downwards (SVG y grows down) so a left-to-right edge prefers
// to label underneath itself, clear of the arrow and of the node it points at.
export function edgeLabelAnchor(points) {
  let seg = null;
  for (let i = 1; i < points.length; i++) {
    const len = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (len > 0 && (!seg || len > seg.len)) seg = { a: points[i - 1], b: points[i], len };
  }
  if (!seg) return { x: points[0].x, y: points[0].y, nx: 0, ny: 1 };
  const dx = (seg.b.x - seg.a.x) / seg.len, dy = (seg.b.y - seg.a.y) / seg.len;
  // The left-hand normal of the leg, biased downwards (SVG y grows down) so a
  // left-to-right edge labels underneath itself. A vertical leg has no "below" to
  // prefer, so it takes the right. `|| 0` drops the -0 a horizontal leg carries.
  const [nx, ny] = Math.abs(dx) < 1e-9 ? [1, 0] : dx > 0 ? [-dy || 0, dx] : [dy, -dx];
  return { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2, nx, ny };
}

// How far off its line a label's ink may sit, nearest first.
const LABEL_GAPS = [16, 26];
const LABEL_SIDES = [1, -1];

const overlaps = (a, b) => !(a.r <= b.l || a.l >= b.r || a.b <= b.t || a.t >= b.b);

// Where an edge label can go. It has to dodge three things at once: the node boxes
// its edge runs between, the line it belongs to, and every label already placed.
// Candidates run along the edge's longest leg, clamped into the gap between the two
// endpoint boxes, first on one side of the line then the other, and further out if
// the first distance is taken. `ink` is the label's measured width and its ink
// extent relative to a baseline at y = 0.
export function placeEdgeLabel(points, ink, from, to, taken = []) {
  const a = edgeLabelAnchor(points);
  const tx = -a.ny, ty = a.nx;
  const half = ink.width / 2;
  const span = (b) => {
    const p = [b.l * tx + b.t * ty, b.l * tx + b.b * ty, b.r * tx + b.t * ty, b.r * tx + b.b * ty];
    return [Math.min(...p), Math.max(...p)];
  };
  const [s0, s1] = span(from), [t0, t1] = span(to);
  const [lo, hi] = s1 <= t0 ? [s1, t0] : t1 <= s0 ? [t1, s0] : [a.x * tx + a.y * ty, a.x * tx + a.y * ty];
  const here = a.x * tx + a.y * ty;
  const centre = half * 2 <= hi - lo
    ? Math.min(Math.max(here, lo + half), hi - half)
    : (lo + hi) / 2;
  const crosses = (box) => {
    for (let i = 1; i < points.length; i++) {
      for (let k = 0; k <= 64; k++) {
        const u = k / 64;
        const x = points[i - 1].x + (points[i].x - points[i - 1].x) * u;
        const y = points[i - 1].y + (points[i].y - points[i - 1].y) * u;
        if (x >= box.l && x <= box.r && y >= box.t && y <= box.b) return true;
      }
    }
    return false;
  };
  let fallback = null;
  for (const gap of LABEL_GAPS) for (const side of LABEL_SIDES) {
    const x = a.x + tx * (centre - here) + a.nx * gap * side;
    const y = a.y + ty * (centre - here) + a.ny * gap * side;
    const box = { l: x - half, r: x + half, t: y + ink.top, b: y + ink.bottom };
    fallback = fallback ?? { x, y, box };
    if (crosses(box)) continue;
    if (overlaps(box, from) || overlaps(box, to)) continue;
    if (taken.some(b => overlaps(box, b))) continue;
    return { x, y, box };
  }
  return fallback;
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
