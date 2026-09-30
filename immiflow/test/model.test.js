import test from "node:test";
import assert from "node:assert/strict";
import { chipText, headlineWait, isInTrack, nodeSize, detailModel, TRACKS } from "../js/model.js";

const opt = {
  id: "opt", track: "student", label: "Optional Practical Training (OPT)",
  form: "I-765", agency: "USCIS", gate: "one academic year", chip: null,
  waits: [{ category: "OPT", regular: "about 4 months", premium: null, bulletin: null, backlogs: null, note: "" }],
};
const cap = { id: "h1b-cap", track: "employment", sharedWith: ["student"], label: "H-1B cap registration",
  form: null, agency: null, gate: "it is a lottery", chip: "lottery", waits: [] };

test("headline wait prefers regular, then bulletin, then backlogs", () => {
  assert.equal(headlineWait(opt), "about 4 months");
  assert.equal(headlineWait({ ...opt, waits: [{ category: "EB-1", regular: null, premium: null,
    bulletin: "current — no wait", backlogs: null, note: "" }] }), "current — no wait");
  assert.equal(headlineWait({ ...opt, waits: [] }), null);
});

test("an explicit chip overrides the derived form+wait text", () => {
  assert.equal(chipText(cap), "lottery");
  assert.equal(chipText(opt), "I-765 · about 4 months");
  assert.equal(chipText({ id: "start", form: null, chip: null, waits: [] }), "");
});

test("a bulletin-only node never merges its bulletin and processing waits", () => {
  const node = { ...opt, form: "Visa Bulletin", chip: "years",
    waits: [{ category: "F4", regular: null, premium: null, bulletin: "roughly 18 years", backlogs: null, note: "" }] };
  const text = chipText(node);
  assert.equal(text, "Visa Bulletin · roughly 18 years");
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
  const measure = (label) => ({ labelW: label.length * 7, chipW: 0 });
  const a = nodeSize({ label: "ab", chip: "" }, measure);
  const b = nodeSize({ label: "a much longer label", chip: "" }, measure);
  assert.ok(b.w > a.w);
  assert.ok(a.h > 0);
  const capped = nodeSize({ label: "x".repeat(400), chip: "" }, measure);
  assert.ok(capped.w <= nodeSize.MAX_LABEL_W + 40, "long labels wrap, they do not stretch the graph");
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
