const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cell = (v) => v ? esc(v) : '<span class="na">—</span>';

export function renderDetail(el, model) {
  if (!model) { el.innerHTML = ""; return; }
  const rows = model.rows.map(r => `
    <tr>
      <td class="cat">${esc(r.category)}</td>
      <td>${cell(r.regular)}</td>
      <td>${cell(r.premium)}</td>
      <td>${cell(r.bulletin)}</td>
    </tr>
    ${r.backlogs ? `<tr><td></td><td colspan="3" class="bnote">${esc(r.backlogs)}</td></tr>` : ""}
    ${r.note ? `<tr><td></td><td colspan="3" class="bnote">${esc(r.note)}</td></tr>` : ""}`).join("");

  el.innerHTML = `
    <h2>${esc(model.label)}</h2>
    ${model.form ? `<p class="formline">${esc(model.form)}</p>` : ""}
    ${model.agency ? `<p class="agency">${esc(model.agency)}</p>` : ""}
    ${model.chip && !model.form ? `<p class="formline">${esc(model.chip)}</p>` : ""}
    ${model.gate ? `<p class="gate">${esc(model.gate)}</p>` : ""}
    ${model.hasWaits ? `
      <table>
        <thead><tr><th>Category</th><th>Processing</th><th>Premium</th><th>Queue</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="bnote">The processing wait and the queue wait are different queues. They are shown
      side by side and never added together.</p>` : `
      <p class="gate">No form, no wait — this step is a decision, not a filing.</p>`}
    ${countryTable(model.countries)}`;
}

// A per-country grid for the two visa-bulletin nodes. Each cell is the delay
// relative to the worldwide cut-off for that row, so a cell that reads "current"
// next to a country that reads "over a decade" is the whole story of the page.
function countryTable(c) {
  if (!c) return "";
  const head = c.columns.map(h => `<th>${esc(h)}</th>`).join("");
  const body = c.rows.map(r => `<tr>${r.map((cell, i) =>
    `<td${i === 0 ? ' class="cat"' : ""}>${esc(cell)}</td>`).join("")}</tr>`).join("");
  return `
    <h3 class="chead">By country of birth <span class="casof">${esc(c.asOf)}</span></h3>
    <table class="ctable">
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
    <p class="bnote">${esc(c.note)}</p>`;
}
