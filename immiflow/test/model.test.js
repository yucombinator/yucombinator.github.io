import test from "node:test";
import assert from "node:assert/strict";
import { chipText, headlineWait, isInTrack, nodeSize, detailModel, makeTextMeasurer, TRACKS } from "../js/model.js";

const opt = {
  id: "opt", track: "student", label: "Optional Practical Training (OPT)",
  form: "I-765", agency: "USCIS", gate: "one academic year", chip: null,
  waits: [{ category: "OPT", regular: "about 4 months", premium: null, bulletin: null, backlogs: null, note: null }],
};
const cap = { id: "h1b-cap", track: "employment", sharedWith: ["student"], label: "H-1B cap registration",
  form: null, agency: null, gate: "it is a lottery", chip: "lottery", waits: [] };

test("headline wait prefers regular, then bulletin, then backlogs", () => {
  assert.equal(headlineWait(opt), "about 4 months");
  assert.equal(headlineWait({ ...opt, waits: [{ category: "EB-1", regular: null, premium: null,
    bulletin: "current — no wait", backlogs: null, note: null }] }), "current — no wait");
  assert.equal(headlineWait({ ...opt, waits: [] }), null);
});

test("an explicit chip overrides the derived form+wait text", () => {
  assert.equal(chipText(cap), "lottery");
  assert.equal(chipText(opt), "I-765 · about 4 months");
  assert.equal(chipText({ id: "start", form: null, chip: null, waits: [] }), "");
});

test("a bulletin-only node never merges its bulletin and processing waits", () => {
  const node = { ...opt, form: "Visa Bulletin", chip: null, waits: [
    { category: "F4", regular: "about 11 months", premium: null, bulletin: null, backlogs: null, note: null },
    { category: "F4 — consular processing", regular: null, premium: null,
      bulletin: "roughly 18 years", backlogs: null, note: null },
  ] };
  const text = chipText(node);
  assert.equal(text, "Visa Bulletin · about 11 months");
  assert.ok(!text.includes("roughly 18 years"), "chip must not pull in a second queue's figure");
  assert.doesNotMatch(text, /\d.*\+\s*\d/, "chip must not sum two queues");
});

test("shared nodes belong to both tracks", () => {
  assert.equal(isInTrack(cap, "employment"), true);
  assert.equal(isInTrack(cap, "student"), true);
  assert.equal(isInTrack(cap, "family"), false);
  assert.equal(isInTrack(opt, "student"), true);
  assert.equal(isInTrack(cap, null), true);
});

test("node size grows with its longest line", () => {
  const measure = (label, chip) => ({
    labelW: label.length * 7,
    chipW: chip.length * 7,
    rows: Math.max(1, Math.ceil(Math.max(label.length, chip.length) * 7 / nodeSize.MAX_LABEL_W)),
  });
  const a = nodeSize({ label: "ab", chipText: "" }, measure);
  const b = nodeSize({ label: "a much longer label", chipText: "" }, measure);
  assert.ok(b.w > a.w);
  assert.ok(a.h > 0);
  const capped = nodeSize({ label: "x".repeat(400), chipText: "" }, measure);
  assert.ok(capped.w <= nodeSize.MAX_LABEL_W + 40, "long labels wrap, they do not stretch the graph");
});

test("a long chip grows the box's height instead of overflowing it", () => {
  const measure = (label, chip) => ({
    labelW: label.length * 7,
    chipW: chip.length * 7,
    rows: Math.max(1, Math.ceil(Math.max(label.length, chip.length) * 7 / nodeSize.MAX_LABEL_W)),
  });
  const brief = nodeSize({ label: "TPS", chipText: "renew" }, measure);
  const warning = nodeSize({ label: "TPS", chipText: "temporary — not a path to a card" }, measure);
  assert.ok(warning.h > brief.h, "an honesty warning must not spill outside its rectangle");
  assert.ok(warning.w <= nodeSize.MAX_LABEL_W + 28, "the chip wraps; the box never outgrows the cap");
  const wider = nodeSize({ label: "TPS", chipText: "filed with Labor, not USCIS" }, measure);
  assert.ok(wider.w > brief.w, "a chip wider than its label widens the box");
});

test("a node holding both a wrapped label and a wrapped chip is tall enough for the two stacked", () => {
  const both = nodeSize({ label: "x", chipText: "y" }, () => ({ labelW: 400, chipW: 400, labelRows: 2, chipRows: 2 }));
  const labelOnly = nodeSize({ label: "x", chipText: "" }, () => ({ labelW: 400, chipW: 0, labelRows: 2, chipRows: 0 }));
  const chipOnly = nodeSize({ label: "x", chipText: "y" }, () => ({ labelW: 0, chipW: 400, labelRows: 1, chipRows: 2 }));
  assert.ok(both.h > labelOnly.h, "the chip block adds height below the label block, not beside it");
  assert.ok(both.h > chipOnly.h, "the label block adds height above the chip block, not beside it");
  assert.equal(both.h, (2 + 2) * 22 + 26, "rows is the sum of the two blocks, not the larger one");
});

test("the measurer wraps an over-long chip into more rows", () => {
  const real = globalThis.document;
  globalThis.document = { createElement: () => ({ getContext: () => ({ font: "", measureText: (s) => ({ width: s.length * 10 }) }) }) };
  try {
    const measure = makeTextMeasurer();
    const warning = measure("TPS", "temporary — not a path to a card");
    const brief = measure("TPS", "renew");
    assert.ok(warning.rows > brief.rows, "a chip too long for one line must wrap");
    assert.equal(warning.labelRows, 1, "the short label stays on one line");
    assert.equal(warning.chipRows, 2, "the over-long chip wraps to two lines");
    assert.equal(warning.rows, warning.labelRows + warning.chipRows, "rows is the sum of the two blocks");
    assert.equal(warning.chipW, nodeSize.MAX_LABEL_W, "the chip is capped at the box width");
  } finally {
    globalThis.document = real;
  }
});

test("detail model carries the gate and every wait column", () => {
  const m = detailModel(opt);
  assert.equal(m.form, "I-765");
  assert.equal(m.agency, "USCIS");
  assert.equal(m.gate, "one academic year");
  assert.equal(m.rows.length, 1);
  assert.equal(m.rows[0].bulletin, null);
  assert.equal(m.hasWaits, true);
  assert.equal(detailModel({ ...opt, waits: [] }).hasWaits, false);
});

test("the four tracks carry the spec hues", () => {
  assert.deepEqual(Object.fromEntries(TRACKS.map(t => [t.id, t.hue])),
    { student: "#1f78b4", employment: "#0c5237", family: "#8a6512", humanitarian: "#9a3412" });
});
