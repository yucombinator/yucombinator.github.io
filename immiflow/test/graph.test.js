import test from "node:test";
import assert from "node:assert/strict";
import { parseGraph, loadGraph, GraphError } from "../js/graph.js";

const good = {
  nodes: [
    { id: "start", track: "origin", label: "s", form: null, agency: null, waits: [] },
    { id: "a", track: "student", label: "a", form: "I-765", agency: "USCIS",
      waits: [{ category: "c", regular: "about 4 months", premium: null, bulletin: null, backlogs: null, note: null }] },
  ],
  edges: [{ v: "start", w: "a" }],
};

test("a well-formed graph parses", () => {
  const g = parseGraph(good);
  assert.equal(g.nodes.size, 2);
  assert.equal(g.edges.length, 1);
});

test("duplicate ids are rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], good.nodes[0]] }), GraphError);
});

test("an edge to a node that does not exist is rejected", () => {
  assert.throws(() => parseGraph({ ...good, edges: [{ v: "start", w: "ghost" }] }), GraphError);
  assert.throws(() => parseGraph({ ...good, edges: [{ v: "ghost", w: "start" }] }), GraphError);
});

test("a form with no agency or no waits is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "DOL", waits: [] }] }), GraphError);
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: null }] }), GraphError);
});

test("an unknown agency is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "ICE" }] }), GraphError);
});

test("an unknown track is rejected, and origin stays legal", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], track: "space" }] }), GraphError);
  assert.doesNotThrow(() => parseGraph(good));
});

test("loadGraph reports an HTTP failure as a GraphError naming the url", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 404 });
  try {
    await assert.rejects(() => loadGraph("data/flow.json"), (err) =>
      err instanceof GraphError && /data\/flow\.json/.test(err.message) && /404/.test(err.message));
  } finally {
    globalThis.fetch = real;
  }
});

test("loadGraph reports unparseable JSON as a GraphError", async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token"); } });
  try {
    await assert.rejects(() => loadGraph("data/flow.json"), GraphError);
  } finally {
    globalThis.fetch = real;
  }
});
