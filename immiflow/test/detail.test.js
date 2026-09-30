import test from "node:test";
import assert from "node:assert/strict";
import { renderDetail } from "../js/detail.js";

const payload = '<script>alert("x")</script>';

const model = {
  label: `Test ${payload}`,
  form: `I-765 ${payload}`,
  agency: "USCIS",
  chip: null,
  gate: `one academic year ${payload}`,
  hasWaits: true,
  rows: [{
    category: `OPT ${payload}`,
    regular: "about 4 months",
    premium: null,
    bulletin: null,
    backlogs: `India ${payload}`,
    note: `Note ${payload}`,
  }],
};

test("renderDetail escapes script payloads in every interpolated field", () => {
  const el = { innerHTML: "" };
  renderDetail(el, model);
  assert.ok(!el.innerHTML.includes("<script"), "raw <script> must not appear in innerHTML");
  assert.ok(el.innerHTML.includes("&lt;script&gt;"), "payload must appear escaped");
  assert.ok(el.innerHTML.includes("&quot;"), "double quotes must be escaped");
});

test("renderDetail with a null model clears the element", () => {
  const el = { innerHTML: "<h2>old</h2>" };
  renderDetail(el, null);
  assert.equal(el.innerHTML, "");
});
