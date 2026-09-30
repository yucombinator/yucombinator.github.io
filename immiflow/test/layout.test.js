import test from "node:test";
import assert from "node:assert/strict";
import { edgeLabelAnchor, edgePath, placeEdgeLabel } from "../js/layout.js";

test("edgePath emits an absolute path through the given points", () => {
  const d = edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 5 }]);
  assert.equal(d, "M0,0 L10,0 L10,5 L20,5");
});

test("edgePath on a single point is still valid SVG", () => {
  assert.equal(edgePath([{ x: 3, y: 4 }]), "M3,4");
});

test("an edge label anchors on the midpoint of an edge's longest leg", () => {
  assert.deepEqual(edgeLabelAnchor([{ x: 0, y: 0 }, { x: 100, y: 0 }]), { x: 50, y: 0, nx: 0, ny: 1 });
  assert.deepEqual(edgeLabelAnchor([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }]),
    { x: 0, y: 50, nx: 1, ny: 0 }, "a vertical leg labels to its right, never on it");
  assert.deepEqual(edgeLabelAnchor([{ x: 0, y: 0 }, { x: 0, y: 20 }, { x: 200, y: 20 }]),
    { x: 100, y: 20, nx: 0, ny: 1 }, "the long leg wins, so the label clears the stub at the corner");
  assert.deepEqual(edgeLabelAnchor([{ x: 5, y: 5 }]), { x: 5, y: 5, nx: 0, ny: 1 }, "a one-point polyline labels in place");
});

test("an edge label sits in the gap between its two nodes, clear of the line and of any label already placed", () => {
  const from = { l: 0, r: 100, t: 0, b: 100 };
  const to = { l: 212, r: 300, t: 0, b: 100 };
  const ink = { width: 96, top: -8, bottom: 4 };
  const at = placeEdgeLabel([{ x: 100, y: 50 }, { x: 200, y: 50 }, { x: 212, y: 50 }], ink, from, to);
  assert.ok(at.box.l > from.r, "the label never sits on the node it leaves");
  assert.ok(at.box.r < to.l, "the label never sits on the node it points at");
  assert.ok(at.box.t > 50, "it is pushed off the line it belongs to");
  assert.ok(at.box.b - 50 >= 6, "and far enough off to be readable beside the line");
  const taken = placeEdgeLabel([{ x: 100, y: 150 }, { x: 212, y: 150 }], ink, from, to);
  const second = placeEdgeLabel([{ x: 100, y: 50 }, { x: 212, y: 50 }], ink, from, to, [taken.box]);
  assert.ok(second.box.b <= taken.box.t || second.box.t >= taken.box.b, "two labels on the same line do not overlap");
});
