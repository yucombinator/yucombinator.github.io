import { AGENCIES, TRACKS } from "./model.js";

export class GraphError extends Error {
  constructor(message) { super(message); this.name = "GraphError"; }
}

// Derived from TRACKS so adding a track cannot leave this validator behind.
// "origin" is the pre-track starting node, not one of the four reader-facing tracks.
const TRACK_IDS = new Set([...TRACKS.map(t => t.id), "origin"]);

export function parseGraph(raw) {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new GraphError("flow.json must have `nodes` and `edges` arrays");
  }
  const nodes = new Map();
  for (const n of raw.nodes) {
    if (nodes.has(n.id)) throw new GraphError(`duplicate node id: ${n.id}`);
    if (!TRACK_IDS.has(n.track)) throw new GraphError(`${n.id}: unknown track ${n.track}`);
    if (n.agency !== null && !AGENCIES.includes(n.agency)) {
      throw new GraphError(`${n.id}: unknown agency ${n.agency}`);
    }
    if (n.form && !n.agency) throw new GraphError(`${n.id}: has a form but no agency`);
    if (n.form && !(n.waits ?? []).length) throw new GraphError(`${n.id}: has a form but no wait rows`);
    nodes.set(n.id, n);
  }
  for (const e of raw.edges) {
    if (!nodes.has(e.v)) throw new GraphError(`edge ${e.v}->${e.w}: unknown node ${e.v}`);
    if (!nodes.has(e.w)) throw new GraphError(`edge ${e.v}->${e.w}: unknown node ${e.w}`);
  }
  return { nodes, edges: raw.edges };
}

export async function loadGraph(url) {
  let raw;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    throw new GraphError(`could not load ${url}: ${err.message}`);
  }
  return parseGraph(raw);
}
