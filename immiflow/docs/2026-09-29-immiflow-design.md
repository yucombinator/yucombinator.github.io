# US immigration system flowchart — Design Spec

**Date:** 2026-09-29
**Status:** Approved for build
**Path:** `~/dev/yucombinator.github.io/immiflow`

## Problem

The US immigration system is a queue, and the queue is invisible. Someone
standing in it — undocumented, in the country, wanting to stay — cannot see the
shape of it. They know they need a "green card." They do not know that getting
one means choosing between a company that will sponsor them and a school that
will enroll them, that the H-1B is a lottery before it is a form, that
employment-based applicants wait on a *Department of Labor* form that USCIS does
not even process, and that the published wait on that path is measured in years
while the family-based path for the *same person* is measured in months.
The information all exists, but it is spread across two tables on a law firm's
blog, in a monthly government bulletin nobody reads, and in a body of folklore.
Nothing draws the shape.

## Goal

A single-page interactive flowchart that follows one person — inside the US, no
legal status, wanting to stay — through every mainstream path the system offers
them. Each step names the form it requires, which agency processes it, and how
long the wait actually is. The page makes the system legible as a system: parallel
queues, gated steps, and waits measured in different units competing for the
same reader.

The page is a *map*, not a guide. It does not tell anyone which path to take or
whether they qualify.

## Scope

**In:**
- Four tracks: student, direct employment, family/marriage, humanitarian.
- Every step that requires a form, petition, or certification, with the form
  number, the processing agency, and an approximate wait.
- The two distinct waits a green-card applicant faces — the visa-bulletin queue
  and the USCIS processing time — shown as separate figures, never summed.
- Country-specific backlogs (India, China, Mexico, Philippines) wherever they
  change a category's answer.
- Premium processing wherever it exists, as its own column.
- Non-timetable gates: the H-1B cap lottery, employer sponsorship, the degree
  requirement, the fact that immediate relatives skip the queue entirely.

**Out:**
- Anything resembling legal advice, eligibility screening, or a recommendation.
- Extremely marginal cases: CSPA derivative petitions, waiver-of-ineligibility
  mechanics, J-1 exchange-waiver procedure, removal-proceeding adjudication.
- Consular processing times. The data is not reliably available and would double
  the page's size.
- Fees. Real and important, but a different question from "how long".
- Live data, and source-level citation per figure. See "Approximate by design".

## Approximate by design

**This is an explainer, not a reference.** The page exists to make the shape of
the system legible. It is not a lookup table, and it does not pretend to the
precision of one. Two consequences:

**Figures are rounded to a period, not to the decimal.** "about 4 months", "over
a year", "around 3 years" — not "3.7 mo". The underlying sources disagree with
each other (the two Boundless articles put I-140 at 3.7 and 8.1 months), and
both are curated snapshots that go stale in a month. A reader does not need the
fifth decimal; they need to know that one queue is weeks and another is years.
What the page must never do is imply a precision it does not have.

**One honesty note, said once, prominently.** USCIS publishes the time within
which it completed **80% of cases** — not a median, not a promise. A figure of
"about 4 months" means "80% finished inside 4 months." This appears in a panel
visible without interaction, in the footer, not in a tooltip nobody opens. It is
the one caveat worth interrupting the reader for; the rest is a single footer
line: *figures compiled September 2026 from public USCIS and Department of Labor
processing times, rounded, and not live.*

**The temptation we are refusing:** adding the visa-bulletin wait and the USCIS
processing time together to produce one reassuring "about X years to green card"
number. The two are different queues with different failure modes — the bulletin
can retrogress, the processing time is office-specific — and a single total would
hide exactly the structure the page exists to show. The detail panel shows them
side by side and never adds them.

## Architecture

```
immiflow/
  index.html                single page, no build step
  css/immiflow.css          pud tokens + graph rules
  js/graph.js               load + shape-check data/flow.json
  js/layout.js              dagre ranking -> node boxes, edge paths
  js/render.js              d3 SVG: nodes, edges, wait chips, dimming
  js/detail.js              detail panel from a node's wait rows
  js/main.js                state (selected node, active track) + repaint
  data/flow.json            nodes, edges, per-node forms and waits
  tools/validate_data.py    structural assertions over flow.json
  docs/2026-09-29-immiflow-design.md
  README.md
```

Vanilla ES modules, dagre + d3 from esm.sh, served by a static server. No
framework, no bundler. dagre's left-to-right ranking is what a flowchart wants;
the cost is a CDN dependency, accepted because it buys an editable graph.

**Rendering note.** dagre computes the layout, but node *content* is not laid out
by dagre — each node's width is measured from its label and chip text before
ranking, so dagre ranks real boxes rather than guessing at uniform widths.

## Design language

Shares `css/pud.css`'s tokens verbatim (`--ink #18362d`, `--accent #0c5237`,
`--accent-soft #eef6ef`, `--line #d9ddd3`, `--sans`/`--serif`, the `--shadow`
pair) so the two pages read as one family.

| Element | Treatment |
|---|---|
| Node | raised surface, 1px hairline, 6px radius, soft shadow |
| Node label | Georgia 15px |
| Wait chip | uppercase 9px letterspaced label, serif value, on a soft fill |
| Edge | 1.5px `--line`, arrowhead; dotted where the edge is conditional (a lottery, a requirement) |
| Track colors | student `#1f78b4`, employment `#0c5237`, family `#8a6512`, humanitarian `#9a3412` |
| Selected node | 2px `--accent-strong` outline, chip fill to `--accent-soft` |
| Dimmed (track filtered out) | opacity .28 |

Each track gets one hue, held constant across the node border chip, the track
filter, and the legend, so a reader can identify a path by color alone.

## Graph model

```json
{
  "id": "f1-opt",
  "track": "student",
  "label": "Optional Practical Training (OPT)",
  "form": "I-765",
  "agency": "USCIS",
  "gate": "You must have completed one full academic year to qualify",
  "waits": [
    {
      "category": "OPT (post-completion)",
      "regular": "about 4 months",
      "premium": null,
      "bulletin": null,
      "backlogs": null,
      "note": ""
    }
  ]
}
```

`agency` is `USCIS`, `DOL`, or `State Dept` and is rendered on the chip. The
USCIS/DOL distinction matters: PERM is a Department of Labor form, and a reader
who files it with USCIS wastes a year. That fact is a node annotation, not a
footnote.

`gate` is prose on the node, for the steps where paperwork is not the obstacle —
the H-1B lottery, needing a willing employer, needing an actual degree. A step
with a `gate` gets a dashed border so it reads as conditional even before the
detail panel is opened.

## Interaction

- **Click a node** → detail panel: the form, the agency, every wait row with
  regular / premium / bulletin columns, country backlogs, and the gate explained.
  Nodes with no known wait say so in words; they never render a zero or a blank.
- **Track filter** — four chips above the canvas, plus "All". Selecting a track
  dims every node not on it rather than removing them, so the reader still sees
  what the other paths were.
- **Keyboard** — nodes are focusable in rank order, Enter/Space opens the
  detail panel, Escape closes it.
- **One repaint path.** State is `{selected, track}`; every visual change goes
  through a single `paint()` so the graph and the panel can never disagree.

## Failure handling

- `flow.json` fails to load or fails shape validation → the page shows a visible
  error banner explaining that the data is malformed. Never a blank canvas.
- esm.sh unreachable (dagre or d3) → banner naming the failed import. The page
  does not half-render.
- A node with no wait data → chip reads "not published", grey, same neutral the
  pudmap uses for an uncollected rate.
- A node whose only wait is a lottery or an uncounted queue → the chip says what
  actually happens ("lottery", "depends on the bulletin") rather than a number.

## Testing

- `tools/validate_data.py` asserts: every edge endpoint resolves to a real node;
  no duplicate ids; every node declares a known `track`; every `agency` is one of
  the three known values; every node is reachable from the start node; every node
  with a `form` has at least one wait row.
- Visual check in a real browser at 1440×900 and at a narrow viewport: graph
  renders, click opens the correct panel, track filter dims correctly, keyboard
  traversal works.

## Deliverables

1. `index.html` working from a local static server out of the site repo.
2. `data/flow.json` covering the four tracks, passing `validate_data.py`.
3. `tools/validate_data.py` re-runnable.
4. `README.md` naming the source articles, explaining the 80%-not-median
   convention, and stating plainly that figures are rounded and not live.
5. A link from the site calling card at `index.html`, matching the `/pudmap/`
   entry.
