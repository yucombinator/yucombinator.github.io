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
  // The label and the chip are stacked inside the box, not alternatives, so the box
  // has to be tall enough for both blocks. A measure fn that reports only `rows`
  // describes a single-line label and no chip.
  const rows = m.labelRows === undefined ? (m.rows ?? 1) : m.labelRows + (m.chipRows ?? 0);
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
    countries: node.countries ?? null,
  };
}

// The chip is painted uppercase, 700 9.5px sans, .06em letter-spaced (see
// css/immiflow.css). Measuring it in the label's 15px Georgia over-counts its width,
// and over-counted chip rows are what push a chip out through the bottom of its box.
const CHIP_FONT = '700 9.5px -apple-system, "Segoe UI", sans-serif';
const CHIP_LETTER_SPACING = 0.06 * 9.5;

export function makeTextMeasurer(labelFont = "15px Georgia", chipFont = CHIP_FONT) {
  const ctx = document.createElement("canvas").getContext("2d");
  return (label, chip) => {
    const width = (s, font, extra = 0) => { ctx.font = font; return ctx.measureText(s).width + extra * s.length; };
    // The label and the chip both wrap at the width cap. The chip is load-bearing text —
    // "no published figure", "not a path to a card" — so it must grow the box, not overflow it.
    const cap = nodeSize.MAX_LABEL_W;
    const raw = chip.toUpperCase();
    const labelW = width(label, labelFont);
    const chipW = width(raw, chipFont, CHIP_LETTER_SPACING);
    // Ceil, so a line the SVG measurer wraps is never a hair wider than the box it wraps into.
    const labelRows = Math.max(1, Math.ceil(labelW / cap));
    const chipRows = raw ? Math.max(1, Math.ceil(chipW / cap)) : 0;
    return {
      labelW: Math.min(Math.ceil(labelW), cap),
      chipW: Math.min(Math.ceil(chipW), cap),
      labelRows, chipRows, rows: labelRows + chipRows,
    };
  };
}
