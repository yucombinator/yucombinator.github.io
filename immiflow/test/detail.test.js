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

test("a node with no country data renders no country table", () => {
  const el = { innerHTML: "" };
  renderDetail(el, { ...model, countries: null });
  assert.doesNotMatch(el.innerHTML, /ctable/);
  assert.doesNotMatch(el.innerHTML, /By country of birth/);
});

test("the country grid renders one row per category and labels the snapshot month", () => {
  const el = { innerHTML: "" };
  renderDetail(el, {
    ...model,
    countries: {
      asOf: "October 2026",
      columns: ["Category", "Worldwide", "India"],
      rows: [
        ["EB-1", "current", "a few years"],
        ["EB-2", "a few years", "over a decade"],
      ],
      note: "these move monthly",
    },
  });
  assert.match(el.innerHTML, /class="ctable"/);
  assert.match(el.innerHTML, /October 2026/);
  assert.match(el.innerHTML, /these move monthly/);
  const grid = el.innerHTML.split('class="ctable"')[1].split("</table>")[0];
  assert.equal((grid.match(/<tr>/g) ?? []).length, 3, "one header row plus two categories");
});

test("a country cell containing markup is escaped, not injected", () => {
  const el = { innerHTML: "" };
  renderDetail(el, {
    ...model,
    countries: {
      asOf: "October 2026",
      columns: ["Category", "Worldwide"],
      rows: [[`EB-1 ${payload}`, "current"]],
      note: "n",
    },
  });
  assert.doesNotMatch(el.innerHTML, /<script/);
  assert.match(el.innerHTML, /&lt;script&gt;/);
});
