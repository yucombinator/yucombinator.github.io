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
      <p class="gate">No form, no wait — this step is a decision, not a filing.</p>`}`;
}
