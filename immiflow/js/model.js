export const TRACKS = [
  { id: "student", label: "Student", hue: "#1f78b4" },
  { id: "employment", label: "Job offer", hue: "#0c5237" },
  { id: "family", label: "Family", hue: "#8a6512" },
  { id: "humanitarian", label: "Humanitarian", hue: "#9a3412" },
];

export const AGENCIES = ["USCIS", "DOL", "State Dept"];

export function headlineWait(node) {
  for (const row of node.waits ?? []) {
    for (const field of ["regular", "bulletin", "backlogs"]) {
      if (row[field]) return row[field];
    }
  }
  return null;
}

export function chipText(node) {
  if (node.chip) return node.chip;
  const wait = headlineWait(node);
  if (node.form && wait) return `${node.form} · ${wait}`;
  if (node.form) return node.form;
  return "";
}

export function isInTrack(node, track) {
  if (!track) return true;
  if (node.track === track) return true;
  return (node.sharedWith ?? []).includes(track);
}

nodeSize.MAX_LABEL_W = 210;

export function nodeSize(node, measure) {
  const m = measure(node.label, node.chipText ?? "");
  const content = Math.max(m.labelW, m.chipW) + 28;
  // `rows` is optional: a measure fn reporting only widths describes a single-line label.
  const rows = m.rows ?? 1;
  return { w: Math.min(Math.max(content, 130), nodeSize.MAX_LABEL_W + 28), h: rows * 22 + 26 };
}

export function detailModel(node) {
  return {
    id: node.id,
    label: node.label,
    form: node.form,
    agency: node.agency,
    gate: node.gate ?? null,
    chip: chipText(node),
    hasWaits: (node.waits ?? []).length > 0,
    rows: (node.waits ?? []).map(r => ({
      category: r.category,
      regular: r.regular ?? null,
      premium: r.premium ?? null,
      bulletin: r.bulletin ?? null,
      backlogs: r.backlogs ?? null,
      note: r.note ?? "",
    })),
  };
}

export function makeTextMeasurer(font = "15px Georgia") {
  const ctx = document.createElement("canvas").getContext("2d");
  ctx.font = font;
  return (label, chip) => {
    const width = (s) => ctx.measureText(s).width;
    // labels longer than the cap wrap; estimate the wrapped line count
    const lines = Math.max(1, Math.ceil(width(label) / nodeSize.MAX_LABEL_W));
    return { labelW: Math.min(width(label), nodeSize.MAX_LABEL_W), chipW: width(chip), rows: lines };
  };
}
