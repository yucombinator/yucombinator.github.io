import test from "node:test";
import assert from "node:assert/strict";
import { edgePath } from "../js/layout.js";

test("edgePath emits an absolute path through the given points", () => {
  const d = edgePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 5 }]);
  assert.equal(d, "M0,0 L10,0 L10,5 L20,5");
});

test("edgePath on a single point is still valid SVG", () => {
  assert.equal(edgePath([{ x: 3, y: 4 }]), "M3,4");
});
