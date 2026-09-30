import test from "node:test";
import assert from "node:assert/strict";
import { parseGraph, GraphError } from "../js/graph.js";

const good = {
  nodes: [
    { id: "start", track: "origin", label: "s", form: null, agency: null, waits: [] },
    { id: "a", track: "student", label: "a", form: "I-765", agency: "USCIS",
      waits: [{ category: "c", regular: "about 4 months", premium: null, bulletin: null, backlogs: null, note: "" }] },
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
});

test("a form with no agency or no waits is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "DOL", waits: [] }] }), GraphError);
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: null }] }), GraphError);
});

test("an unknown agency is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "ICE" }] }), GraphError);
});
