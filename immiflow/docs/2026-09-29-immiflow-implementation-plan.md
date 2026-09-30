# US Immigration System Flowchart — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/immiflow/`, a single-page interactive flowchart that follows an undocumented person in the US through every mainstream immigration path, naming the form, the processing agency, and an approximate wait at each step.

**Architecture:** A hand-authored graph in `data/flow.json` is ranked left-to-right by dagre and painted as SVG by d3. Pure logic (validation, node sizing, chip text, track filtering, detail model, edge geometry) lives in dependency-free modules that run under `node --test`; only `layout.js`/`render.js` touch the DOM. State is `{selected, track}` and every visual change goes through one `paint()`, so the graph and the detail panel can never disagree.

**Tech Stack:** Vanilla ES modules, `dagre@0.8.5` + `d3@7.9.0` from `https://esm.sh/`, no build step, no framework. `node --test` (Node 24 built-in) for JS units. `python3` for the data validator.

**Spec:** `immiflow/docs/2026-09-29-immiflow-design.md` — read it before starting; this plan implements it and the two disagree nowhere.

## Global Constraints

- Everything lives under `~/dev/yucombinator.github.io/immiflow/`. The site repo is the dev copy; there is no separate source tree and no deploy sync step.
- Vanilla ES modules. No build step, no bundler, no framework, no new npm dependency. `node:test` and `python3` are the only tools.
- The only runtime CDN imports are `https://esm.sh/dagre@0.8.5` and `https://esm.sh/d3@7.9.0`.
- Design tokens are copied **verbatim** from `pudmap/css/pud.css`: `--ink #18362d`, `--ink-soft #4a6b58`, `--accent #0c5237`, `--accent-mid #1a6b4a`, `--accent-soft #eef6ef`, `--accent-strong #2f7d4f`, `--surface #eef2ec`, `--surface-raised #f7faf6`, `--line #d9ddd3`, `--sans -apple-system, "Segoe UI", sans-serif`, `--serif Georgia, "Times New Roman", serif`, and the `--shadow` pair. Do not invent new colors.
- Track hues, held constant across node border, track filter, and legend: student `#1f78b4`, employment `#0c5237`, family `#8a6512`, humanitarian `#9a3412`. Origin/terminal nodes use `--ink`.
- **Approximate periods only.** "about 4 months", "over a year", "around 3 years". Never "3.7 mo", never a decimal, never a day count.
- **Exception — posted service guarantees.** A published service standard is not an estimate and is
  not rounded. Premium processing's "15 business days" (45 for EB-1C and EB-2 NIW) is a USCIS
  commitment, shown verbatim. Rendering it as "about 2 to 3 weeks" would dress a guarantee as a
  guess, which misleads in the other direction.
- `waits` is either a non-empty list of wait rows or the empty list `[]`; there is no third state. A
  node whose `waits` is `[]` states its situation in words via `chip` — every such node carries one.
- Absent values are `null`, never `""`. An empty string and `null` would otherwise both mean
  "nothing here", and a renderer cannot tell them apart.
- **Never sum** a visa-bulletin wait and a USCIS processing wait into one figure. They are separate columns and stay separate.
- A step with no known wait says so **in words** ("No published figure", "lottery", "depends on the bulletin"). It never renders `0`, `null`, an empty cell, or a dash.
- `agency` is one of `USCIS`, `DOL`, `State Dept`, or `null`. `null` is correct for a decision or gate node that has no form yet.
- Every wait row's `regular` / `premium` / `bulletin` / `backlogs` is either a string or `null`. No numbers, no dates.
- Honesty copy, stated once in a panel visible without interaction: USCIS publishes the time within which it completed **80% of cases** — not a median, not a promise.

---

## File Structure

```
immiflow/
  index.html                 page shell, honesty panel, track filter, legend, footer
  css/immiflow.css           pud tokens + graph/panel chrome
  js/model.js                PURE. chip text, headline wait, track predicate, node size, detail model
  js/graph.js                load + shape-check flow.json  (no dagre/d3 import)
  js/layout.js               dagre ranking + edge path geometry
  js/render.js               d3 SVG painting + highlight updates
  js/detail.js               detail panel DOM
  js/main.js                 state, wiring, single paint()
  data/flow.json             the graph: nodes, edges
  test/model.test.js
  test/graph.test.js
  test/layout.test.js
  tools/validate_data.py     structural assertions over flow.json
  README.md
```

Boundary rule: `model.js` imports nothing. `graph.js` imports nothing but `model.js`. `layout.js` imports nothing but `model.js`. `render.js` imports `model.js` + d3. `detail.js` imports `model.js`. `main.js` imports all of the above. Nothing imports `main.js`. This is what lets Task 2 test the logic without a browser.

### Locked interfaces

```js
// js/model.js — no imports
export const TRACKS;            // [{id,label,hue}] student|employment|family|humanitarian
export const AGENCIES;          // ['USCIS','DOL','State Dept']
export function chipText(node); // -> string. Explicit node.chip wins; else form + headline wait; else ''.
export function headlineWait(node);        // -> string | null
export function isInTrack(node, track);    // track null => true for everything
export function nodeSize(node, measure);   // -> {w, h}; measure(label, chip) -> {labelW, chipW}
export function detailModel(node);         // -> {id,label,form,agency,gate,chip,rows,hasWaits}
export function makeTextMeasurer(font);    // browser only; returns a measure fn via canvas

// js/graph.js
export class GraphError extends Error {}
export function parseGraph(raw);   // -> {nodes:Map, edges:[...]}; throws GraphError
export async function loadGraph(url); // fetch + parseGraph

// js/layout.js
export function edgePath(points);                      // -> "d" string. PURE, no deps.
export function layoutGraph(graph, dagreLib, opts);     // -> {nodes, edges, width, height}

// js/render.js
export function renderGraph(svg, laidOut, d3, state);   // paints once
export function updateHighlight(svg, state);            // selection + dimming only

// js/detail.js
export function renderDetail(el, model);   // model null => closes/clears
```

---

### Task 1: The graph data

The substance of the page. Four tracks, every form, every wait.

**Files:**
- Create: `immiflow/data/flow.json`
- Create: `immiflow/tools/validate_data.py`

**Interfaces:**
- Consumes: nothing.
- Produces: `data/flow.json` with top-level `{"nodes": [...], "edges": [...]}`. A node is `{id, track, label, form, agency, gate, chip, sharedWith, waits}`, an edge is `{v, w, label?, conditional?}`. Consumed by Task 2's `parseGraph`.

- [ ] **Step 1: Write `tools/validate_data.py` before the data exists**

```python
#!/usr/bin/env python3
"""Structural checks on immiflow/data/flow.json. Exit 1 on any failure."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / "data" / "flow.json"
TRACKS = {"student", "employment", "family", "humanitarian", "origin"}
AGENCIES = {"USCIS", "DOL", "State Dept", None}


def fail(errors, msg):
    errors.append(msg)


def validate(flow):
    errors = []
    nodes = {}
    for n in flow["nodes"]:
        if n["id"] in nodes:
            fail(errors, f"duplicate node id: {n['id']}")
        nodes[n["id"]] = n

    for n in flow["nodes"]:
        if n["track"] not in TRACKS:
            fail(errors, f"{n['id']}: unknown track {n['track']!r}")
        if n.get("agency") not in AGENCIES:
            fail(errors, f"{n['id']}: bad agency {n.get('agency')!r}")
        if n.get("form") and not n.get("waits"):
            fail(errors, f"{n['id']}: has a form but no wait rows")
        if n.get("form") and n.get("agency") is None:
            fail(errors, f"{n['id']}: has a form but no agency")
        for shared in n.get("sharedWith", []):
            if shared not in TRACKS:
                fail(errors, f"{n['id']}: bad sharedWith {shared!r}")
        for w in n.get("waits", []):
            if not w.get("category"):
                fail(errors, f"{n['id']}: wait row with no category")
            for field in ("regular", "premium", "bulletin", "backlogs"):
                if field in w and not isinstance(w[field], (str, type(None))):
                    fail(errors, f"{n['id']}/{w.get('category')}: {field} must be a string or null")

    for e in flow["edges"]:
        for end in (e["v"], e["w"]):
            if end not in nodes:
                fail(errors, f"edge {e['v']}->{e['w']}: unknown node {end!r}")

    # reachability from the start node
    adj = {}
    for e in flow["edges"]:
        adj.setdefault(e["v"], []).append(e["w"])
    seen, stack = set(), ["start"]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(adj.get(cur, []))
    for nid in nodes:
        if nid not in seen:
            fail(errors, f"{nid} is unreachable from 'start'")

    return errors


def main():
    if not FLOW.exists():
        print(f"FAIL: {FLOW} does not exist", file=sys.stderr)
        return 1
    try:
        flow = json.loads(FLOW.read_text())
    except json.JSONDecodeError as exc:
        print(f"FAIL: flow.json is not valid JSON: {exc}", file=sys.stderr)
        return 1
    errors = validate(flow)
    if errors:
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(f"FAIL: {len(errors)} problem(s)", file=sys.stderr)
        return 1
    print(f"OK: {len(flow['nodes'])} nodes, {len(flow['edges'])} edges, all reachable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/dev/yucombinator.github.io/immiflow && python3 tools/validate_data.py`
Expected: `FAIL: .../data/flow.json does not exist`, exit 1.

- [ ] **Step 3: Write `data/flow.json`**

Full content below. Three correctness rules are load-bearing and encoded here: **TPS and DACA are terminal** (neither leads to permanent residence), **CPT is terminal**, and **no node ever sums a bulletin wait with a processing wait**.

```json
{
  "nodes": [
    { "id": "start", "track": "origin", "label": "In the US, no legal status, wants to stay",
      "form": null, "agency": null, "gate": null, "chip": "the starting point", "waits": [] },

    { "id": "study-enroll", "track": "student", "label": "Enroll in a school that sponsors F-1 students",
      "form": null, "agency": null, "chip": "a school has to agree to sponsor you",
      "gate": "The school must be certified to sponsor international students. Most community colleges are not. You need a real degree, not a certificate mill — the government audits for exactly that.", "waits": [] },
    { "id": "f1-status", "track": "student", "label": "F-1 student status",
      "form": "I-539 + I-901", "agency": "USCIS",
      "gate": "The school files the SEVIS I-901 for you and requests the status change; you do not file alone.",
      "chip": null,
      "waits": [ { "category": "Change of status to F-1", "regular": "about 2 to 3 months", "premium": null,
        "bulletin": null, "backlogs": null, "note": "The I-901 fee is paid by the school; the I-539 is filed with USCIS." } ] },
    { "id": "cpt", "track": "student", "label": "Co-op or internship (CPT)",
      "form": null, "agency": null, "chip": "dead end",
      "gate": "Curricular practical training: work tied directly to your coursework, no extension, and no route to a green card. Useful while studying, useless afterwards.", "waits": [] },
    { "id": "opt", "track": "student", "label": "Optional Practical Training (OPT)",
      "form": "I-765", "agency": "USCIS",
      "gate": "Requires one full academic year, or two if your English was not your native language.",
      "chip": null,
      "waits": [ { "category": "OPT, post-completion", "regular": "about 4 months", "premium": null,
        "bulletin": null, "backlogs": null, "note": "You get at most 12 months, and 90 days of unemployment." } ] },
    { "id": "stem-opt", "track": "student", "label": "24-month STEM OPT extension",
      "form": "I-765", "agency": "USCIS",
      "gate": "Requires a degree in a STEM field on the eligible list.",
      "chip": null,
      "waits": [ { "category": "STEM OPT extension", "regular": "about 4 months", "premium": null,
        "bulletin": null, "backlogs": null, "note": "Adds 24 months. The longest runway a student gets." } ] },
    { "id": "h1b-cap", "track": "employment", "sharedWith": ["student"],
      "label": "H-1B cap registration", "form": null, "agency": null, "chip": "lottery",
      "gate": "Registration is a lottery, once a year, and not everyone who registers is picked. Being picked only buys you time in the country — it is not a green card. If you are already inside the US, the odds you were not picked in an earlier round are the odds you face now.",
      "waits": [] },

    { "id": "job-offer", "track": "employment", "label": "Get a job offer from a willing employer",
      "form": null, "agency": null, "chip": "sponsorship required",
      "gate": "The employer has to agree to sponsor you, and to stay with you. Most employers will not. Sponsorship attaches to the job, so you cannot freely switch employers the way a citizen can.", "waits": [] },
    { "id": "h1b-petition", "track": "employment", "label": "H-1B petition",
      "form": "I-129", "agency": "USCIS", "chip": null,
      "waits": [ { "category": "H-1B, regular processing", "regular": "about 5 months", "premium": "15 business days",
        "bulletin": null, "backlogs": null, "note": "Premium processing is a large extra fee and only buys speed, not eligibility." } ] },
    { "id": "l1", "track": "employment", "label": "L-1 intracompany transferee",
      "form": "I-129", "agency": "USCIS", "chip": null,
      "gate": "Requires you to have worked for the parent company abroad for a full year in the last three. This is the only employment visa that skips the lottery.",
      "waits": [ { "category": "L-1, regular processing", "regular": "about 5 months", "premium": "15 business days",
        "bulletin": null, "backlogs": null, "note": "" } ] },
    { "id": "o1", "track": "employment", "label": "O-1 extraordinary ability",
      "form": "I-129", "agency": "USCIS", "chip": null,
      "gate": "A high bar: sustained acclaim, awards, publications, or recognition. Not a category most people qualify for, and the file is expensive to build.",
      "waits": [ { "category": "O-1, regular processing", "regular": "about 5 months", "premium": "15 business days",
        "bulletin": null, "backlogs": null, "note": "" } ] },
    { "id": "eb-category", "track": "employment", "label": "Choose an immigrant category (EB-1 to EB-5)",
      "form": null, "agency": null, "chip": "the categories are numbered by how little you are worth",
      "gate": "Five categories, ordered by what the government thinks your labour is worth. EB-1 is extraordinary ability, EB-5 is a $800,000 investment. Where you land decides how long you wait.",
      "waits": [] },
    { "id": "perm", "track": "employment", "label": "PERM labor certification",
      "form": "ETA-9089", "agency": "DOL", "chip": "filed with Labor, not USCIS",
      "gate": "The employer must run a recruitment process first: pick a wage level, post the ad, wait out the 30 and 60 day minimums, sift resumes. Months of employer admin before the government even looks at it.",
      "waits": [ { "category": "PERM labor certification", "regular": "over a year, often considerably more",
        "premium": null, "bulletin": null, "backlogs": null,
        "note": "A Department of Labor form, not a USCIS one. Audit reviews take substantially longer than analyst reviews. Not eligible for premium processing." } ] },
    { "id": "i140", "track": "employment", "label": "Immigrant petition for an alien worker",
      "form": "I-140", "agency": "USCIS", "chip": null,
      "gate": "This is the step that sets your priority date. Everything you wait afterwards is counted from the day this is filed, not from the day you get the card.",
      "waits": [ { "category": "I-140, regular processing", "regular": "about 4 months", "premium": "15 business days",
        "bulletin": null, "backlogs": null,
        "note": "45 business days for EB-1C and EB-2 National Interest Waiver under premium processing." } ] },
    { "id": "bulletin-eb", "track": "employment", "label": "Wait in the visa-bulletin queue",
      "form": "Visa Bulletin", "agency": "State Dept", "chip": "years",
      "gate": "This is a different queue from the one USCIS is processing you in, and it is the one that turns into a decade. It is also the one that can move backwards when the government publishes an update.",
      "waits": [
        { "category": "EB-1", "regular": null, "premium": null, "bulletin": "current — no wait", "backlogs": null, "note": "" },
        { "category": "EB-2", "regular": null, "premium": null, "bulletin": "several years", "backlogs": "China and India far longer — Indian EB-2 dates date from 2013", "note": "" },
        { "category": "EB-3", "regular": null, "premium": null, "bulletin": "several years", "backlogs": "China and India far longer — Indian EB-3 dates date from 2013", "note": "" },
        { "category": "EB-4", "regular": null, "premium": null, "bulletin": "not currently being issued", "backlogs": null, "note": "The government is not granting these at all right now." },
        { "category": "EB-5", "regular": null, "premium": null, "bulletin": "current — no wait", "backlogs": "Longer for Chinese and Indian investors, since 2014 and 2019 respectively", "note": "" }
      ] },
    { "id": "i485-eb", "track": "employment", "label": "Adjustment of status to permanent residence",
      "form": "I-485", "agency": "USCIS", "chip": null,
      "waits": [ { "category": "I-485, employment-based", "regular": "about 6 months", "premium": null,
        "bulletin": null, "backlogs": null, "note": "You can only file once your priority date is current. This wait is separate from the queue above and does not include it." } ] },

    { "id": "family-relative", "track": "family", "label": "A relative files for you",
      "form": null, "agency": null, "chip": "needs a qualifying relative",
      "gate": "A US citizen or a green card holder has to petition for you. Someone with no qualifying relative in the US has no family path at all — this is the single largest fork in the whole system.",
      "waits": [] },
    { "id": "i130", "track": "family", "label": "Petition for an alien relative",
      "form": "I-130", "agency": "USCIS", "chip": null,
      "waits": [
        { "category": "I-130, US citizen sponsor", "regular": "about 13 months", "premium": null, "bulletin": null, "backlogs": null, "note": "" },
        { "category": "I-130, green card holder sponsor", "regular": "three years or more", "premium": null, "bulletin": null, "backlogs": null, "note": "The same form, four times the wait, because the sponsor is waiting their own turn to become a citizen." }
      ] },
    { "id": "immediate-relative", "track": "family", "label": "Immediate relative — no queue",
      "form": null, "agency": null, "chip": "skips the queue entirely",
      "gate": "Spouse, parent, or unmarried child under 21 of a US citizen. This is the only kind of applicant who never waits in the visa bulletin. Everyone on every other path is behind someone.",
      "waits": [ { "category": "Immediate relatives", "regular": "about 8 months inside the US", "premium": null,
        "bulletin": "no wait — exempt from the bulletin", "backlogs": null,
        "note": "The bulletin wait and the processing wait are shown separately on purpose; only one of them applies here." } ] },
    { "id": "family-preference", "track": "family", "label": "Family preference category — you are in line",
      "form": null, "agency": null, "chip": "behind everyone ahead of you",
      "gate": "Everyone who is not an immediate relative is in a numbered preference category, and the number decides which queue you are in.",
      "waits": [] },
    { "id": "bulletin-family", "track": "family", "label": "Wait in the visa-bulletin queue",
      "form": "Visa Bulletin", "agency": "State Dept", "chip": "years to decades",
      "waits": [
        { "category": "F1 — adult children of citizens", "regular": null, "premium": null, "bulletin": "about 8 years", "backlogs": "Longer for Mexico", "note": "" },
        { "category": "F2A — spouses of green card holders", "regular": null, "premium": null, "bulletin": "about 3 years", "backlogs": null, "note": "" },
        { "category": "F2B — adult children of green card holders", "regular": null, "premium": null, "bulletin": "about 8 years", "backlogs": "Longer for Mexico", "note": "" },
        { "category": "F3 — married children of citizens", "regular": null, "premium": null, "bulletin": "about 13 years", "backlogs": "Longer for Mexico", "note": "" },
        { "category": "F4 — siblings of citizens", "regular": null, "premium": null, "bulletin": "roughly 18 years, and far longer for some countries", "backlogs": "Indian siblings date from 2006, Mexican from 2001, Philippine from 2008", "note": "The longest ordinary wait in the system." }
      ] },
    { "id": "i485-fam", "track": "family", "label": "Adjustment of status to permanent residence",
      "form": "I-485", "agency": "USCIS", "chip": null,
      "waits": [ { "category": "I-485, family-based", "regular": "about 6 months", "premium": null,
        "bulletin": null, "backlogs": null,
        "note": "Filed only once the bulletin date is current. This wait does not include the queue." } ] },
    { "id": "k1", "track": "family", "label": "Fiancé(e) of a US citizen",
      "form": "I-129F", "agency": "USCIS", "chip": "half the wait",
      "gate": "This petition is only half of it. The visa interview at a US consulate abroad is the other half, and that part is not shown on this page because we do not have reliable figures for it.",
      "waits": [ { "category": "I-129F fiancé(e) petition", "regular": "about 8 months", "premium": null,
        "bulletin": null, "backlogs": null, "note": "USCIS approval only. Consular processing follows." } ] },

    { "id": "asylum", "track": "humanitarian", "label": "Apply for asylum",
      "form": "I-589", "agency": "USCIS", "chip": "no published figure",
      "gate": "You must apply within a year of arriving, or within 180 days if you are already in removal proceedings. Missing that deadline is usually fatal to the claim.",
      "waits": [ { "category": "Asylum application", "regular": "No published figure", "premium": null,
        "bulletin": null, "backlogs": null,
        "note": "Timing depends entirely on the adjudication schedule, and an approved grant is not a green card — it is protection plus work permission." } ] },
    { "id": "tps", "track": "humanitarian", "label": "Temporary Protected Status",
      "form": "I-765", "agency": "USCIS", "chip": "temporary — not a path to a card",
      "gate": "Only if your country of origin is currently designated, and you have been continuously present in the US since the designation. The designation is reviewed every year and can end.",
      "waits": [ { "category": "TPS employment authorization", "regular": "about 4 months", "premium": null,
        "bulletin": null, "backlogs": null,
        "note": "TPS is not a route to permanent residence. It defers the question; it does not answer it." } ] },
    { "id": "u-visa", "track": "humanitarian", "label": "U visa — crime victim",
      "form": "I-918", "agency": "USCIS", "chip": "no published wait",
      "gate": "Requires cooperation with law enforcement in a qualifying crime investigation. After four years you can adjust to permanent residence.",
      "waits": [ { "category": "U visa petition", "regular": "No published figure", "premium": null,
        "bulletin": null, "backlogs": null, "note": "A path to a green card, unlike TPS and DACA." } ] },
    { "id": "daca", "track": "humanitarian", "label": "DACA",
      "form": "I-765", "agency": "USCIS", "chip": "temporary — not a path to a card",
      "gate": "Arrived in the US before 16, under 31 today, in school or graduated, and no felony conviction on record. Every one of those has to be true at once.",
      "waits": [ { "category": "DACA work permit", "regular": "about 4 months", "premium": null,
        "bulletin": null, "backlogs": null,
        "note": "DACA gives work permission. It does not lead to a green card." } ] },

    { "id": "green-card", "track": "origin", "label": "Lawful permanent resident",
      "form": null, "agency": null, "chip": "the point", "waits": [] }
  ],

  "edges": [
    { "v": "start", "w": "study-enroll" },
    { "v": "start", "w": "job-offer" },
    { "v": "start", "w": "family-relative" },
    { "v": "start", "w": "asylum" },
    { "v": "start", "w": "tps" },
    { "v": "start", "w": "u-visa" },
    { "v": "start", "w": "daca" },

    { "v": "study-enroll", "w": "f1-status" },
    { "v": "f1-status", "w": "cpt" },
    { "v": "f1-status", "w": "opt" },
    { "v": "opt", "w": "stem-opt" },
    { "v": "opt", "w": "h1b-cap", "conditional": true },
    { "v": "stem-opt", "w": "h1b-cap", "conditional": true },

    { "v": "job-offer", "w": "h1b-cap", "conditional": true },
    { "v": "job-offer", "w": "h1b-petition" },
    { "v": "job-offer", "w": "l1" },
    { "v": "job-offer", "w": "o1" },
    { "v": "job-offer", "w": "eb-category" },
    { "v": "h1b-cap", "w": "h1b-petition" },
    { "v": "h1b-petition", "w": "green-card" },
    { "v": "l1", "w": "green-card" },
    { "v": "o1", "w": "green-card" },
    { "v": "eb-category", "w": "perm", "label": "most EB-2 and EB-3", "conditional": true },
    { "v": "eb-category", "w": "i140", "label": "EB-1, EB-4, EB-5, EB-2 NIW", "conditional": true },
    { "v": "perm", "w": "i140" },
    { "v": "i140", "w": "bulletin-eb" },
    { "v": "bulletin-eb", "w": "i485-eb" },
    { "v": "i485-eb", "w": "green-card" },

    { "v": "family-relative", "w": "i130" },
    { "v": "family-relative", "w": "k1" },
    { "v": "i130", "w": "immediate-relative" },
    { "v": "i130", "w": "family-preference" },
    { "v": "immediate-relative", "w": "green-card" },
    { "v": "family-preference", "w": "bulletin-family" },
    { "v": "bulletin-family", "w": "i485-fam" },
    { "v": "i485-fam", "w": "green-card" },
    { "v": "k1", "w": "green-card" },

    { "v": "asylum", "w": "green-card" },
    { "v": "u-visa", "w": "green-card" }
  ]
}
```

`cpt`, `tps` and `daca` deliberately have no outgoing edge. That is the point, not an omission.

- [ ] **Step 4: Run the validator to verify it passes**

Run: `cd ~/dev/yucombinator.github.io/immiflow && python3 tools/validate_data.py`
Expected: `OK: 28 nodes, 39 edges, all reachable`

If the counts differ from 28 nodes / 39 edges you have added or dropped something — recount against the
list above before continuing. The only nodes with no outgoing edge are `cpt`, `tps`, `daca` and
`green-card`; that is the design, not an omission.

- [ ] **Step 5: Prove the validator actually catches breakage**

```sh
cd ~/dev/yucombinator.github.io/immiflow
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("data/flow.json")
d = json.loads(p.read_text())
d["edges"].append({"v": "start", "w": "does-not-exist"})
pathlib.Path("/tmp/flow-broken.json").write_text(json.dumps(d))
PY
python3 -c "
import sys, json, pathlib
sys.path.insert(0, 'tools')
import validate_data as v
flow = json.loads(pathlib.Path('/tmp/flow-broken.json').read_text())
errs = v.validate(flow)
print('\n'.join(errs))
raise SystemExit(1 if errs else 0)
"
```
Expected: prints `edge start->does-not-exist: unknown node 'does-not-exist'`, exit 1. Then `rm /tmp/flow-broken.json`.

- [ ] **Step 6: Commit**

```sh
cd ~/dev/yucombinator.github.io
git add immiflow/data immiflow/tools
git commit -m "Add immigration flow graph data and structural validator"
```

---

### Task 2: Pure logic — model, validation, sizing, filtering

Everything testable without a browser. This is the layer where a plausible bug actually costs a reader the truth.

**Files:**
- Create: `immiflow/js/model.js`
- Create: `immiflow/js/graph.js`
- Create: `immiflow/test/model.test.js`
- Create: `immiflow/test/graph.test.js`

**Interfaces:**
- Consumes: `data/flow.json` shape from Task 1.
- Produces: every `model.js` and `graph.js` export listed under "Locked interfaces". Task 4 and Task 5 depend on them by name.

- [ ] **Step 1: Write the failing tests**

`immiflow/test/model.test.js`:

```js
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
  const node = { ...opt, form: "Visa Bulletin", chip: null,
    waits: [{ category: "F4", regular: null, premium: null, bulletin: "roughly 18 years", backlogs: null, note: null }] };
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
```

`immiflow/test/graph.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { parseGraph, GraphError } from "../js/graph.js";

const good = {
  nodes: [
    { id: "start", track: "origin", label: "s", form: null, agency: null, waits: [] },
    { id: "a", track: "student", label: "a", form: "I-765", agency: "USCIS",
      waits: [{ category: "c", regular: "about 4 months", premium: null, bulletin: null, backlogs: null, note: "" }] },
  ],
  edges: [{ v: "start", w: "a" }],
};

test("a well-formed graph parses", () => {
  const g = parseGraph(good);
  assert.equal(g.nodes.size, 2);
  assert.equal(g.edges.length, 1);
});

test("duplicate ids are rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], good.nodes[0]] }), GraphError);
});

test("an edge to a node that does not exist is rejected", () => {
  assert.throws(() => parseGraph({ ...good, edges: [{ v: "start", w: "ghost" }] }), GraphError);
});

test("a form with no agency or no waits is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "DOL", waits: [] }] }), GraphError);
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: null }] }), GraphError);
});

test("an unknown agency is rejected", () => {
  assert.throws(() => parseGraph({ ...good, nodes: [good.nodes[0], { ...good.nodes[1], agency: "ICE" }] }), GraphError);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ~/dev/yucombinator.github.io/immiflow && node --test`
Expected: FAIL — `Cannot find module .../js/model.js`.

- [ ] **Step 3: Write `js/model.js`**

```js
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
  return { w: Math.min(Math.max(content, 130), nodeSize.MAX_LABEL_W + 28), h: m.rows * 22 + 26 };
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
```

- [ ] **Step 4: Write `js/graph.js`**

```js
import { AGENCIES } from "./model.js";

export class GraphError extends Error {
  constructor(message) { super(message); this.name = "GraphError"; }
}

const TRACK_IDS = new Set([...["student", "employment", "family", "humanitarian"], "origin"]);

export function parseGraph(raw) {
  if (!raw || !Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) {
    throw new GraphError("flow.json must have `nodes` and `edges` arrays");
  }
  const nodes = new Map();
  for (const n of raw.nodes) {
    if (nodes.has(n.id)) throw new GraphError(`duplicate node id: ${n.id}`);
    if (!TRACK_IDS.has(n.track)) throw new GraphError(`${n.id}: unknown track ${n.track}`);
    if (n.agency !== null && !AGENCIES.includes(n.agency)) {
      throw new GraphError(`${n.id}: unknown agency ${n.agency}`);
    }
    if (n.form && !n.agency) throw new GraphError(`${n.id}: has a form but no agency`);
    if (n.form && !(n.waits ?? []).length) throw new GraphError(`${n.id}: has a form but no wait rows`);
    nodes.set(n.id, n);
  }
  for (const e of raw.edges) {
    if (!nodes.has(e.v)) throw new GraphError(`edge ${e.v}->${e.w}: unknown node ${e.v}`);
    if (!nodes.has(e.w)) throw new GraphError(`edge ${e.v}->${e.w}: unknown node ${e.w}`);
  }
  return { nodes, edges: raw.edges };
}

export async function loadGraph(url) {
  let raw;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    raw = await res.json();
  } catch (err) {
    throw new GraphError(`could not load ${url}: ${err.message}`);
  }
  return parseGraph(raw);
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ~/dev/yucombinator.github.io/immiflow && node --test`
Expected: PASS, all 12 tests, exit 0.

- [ ] **Step 6: Commit**

```sh
cd ~/dev/yucombinator.github.io
git add immiflow/js immiflow/test
git commit -m "Add pure graph logic: model, parsing, validation"
```

---

### Task 3: Layout and rendering — the graph on screen

**Files:**
- Create: `immiflow/js/layout.js`
- Create: `immiflow/js/render.js`
- Create: `immiflow/css/immiflow.css`
- Create: `immiflow/index.html`
- Create: `immiflow/test/layout.test.js`
- Modify: `immiflow/js/main.js` (does not exist yet — this task creates the first working version)

**Interfaces:**
- Consumes: `model.js` exports, `data/flow.json`, dagre + d3 from esm.sh.
- Produces: a page that renders the full graph with chips, correct track hues, and a 60-second visual verification in a real browser.

- [ ] **Step 1: Write the failing test for edge geometry**

`immiflow/test/layout.test.js`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd ~/dev/yucombinator.github.io/immiflow && node --test test/layout.test.js`
Expected: FAIL — `Cannot find module .../js/layout.js`.

- [ ] **Step 3: Write `js/layout.js`**

```js
import { chipText, nodeSize } from "./model.js";

export function edgePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
}

export function layoutGraph(graph, dagreLib, opts = {}) {
  const { measure, rankSep = 90, nodeSep = 28, margin = 40 } = opts;
  const g = new dagreLib.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", ranksep: rankSep, nodesep: nodeSep, marginx: margin, marginy: margin });
  g.setDefaultEdgeLabel(() => ({}));

  const laid = new Map();
  for (const n of graph.nodes.values()) {
    const text = chipText(n);
    const { w, h } = nodeSize({ ...n, chipText: text }, measure);
    laid.set(n.id, { ...n, chipText: text, w, h });
    g.setNode(n.id, { width: w, height: h });
  }
  for (const e of graph.edges) g.setEdge(e.v, e.w, { label: e.label ?? "" }, e.conditional ? "cond" : undefined);

  dagreLib.layout(g);

  const nodes = [...laid.values()].map(n => {
    const p = g.node(n.id);
    return { ...n, x: p.x, y: p.y };
  });
  const edges = graph.edges.map(e => {
    const p = g.edge(e.v, e.w, e.conditional ? "cond" : undefined);
    const v = graph.nodes.get(e.v), w = graph.nodes.get(e.w);
    return {
      ...e,
      points: p.points.map(pt => ({ x: pt.x, y: pt.y })),
      vTrack: v.track, wTrack: w.track,
      vShared: v.sharedWith ?? [], wShared: w.sharedWith ?? [],
    };
  });
  const size = g.graph();
  return { nodes, edges, width: size.width, height: size.height };
}

```

`nodeSize` is imported from `model.js` — do not define a second width formula here. It is the one
Task 2's tests cover, and a second copy is exactly the kind of drift that makes a graph lie about
its own geometry.

- [ ] **Step 4: Write `css/immiflow.css`**

Copy the `:root` block from `pudmap/css/pud.css:3-19` verbatim, then add:

```css
html, body { margin: 0; background: var(--surface); color: var(--ink); font: 13px/1.45 var(--sans); }
#graph-wrap { position: relative; height: 100vh; overflow: auto; background: var(--surface); }
#graph { display: block; }
.panel { position: absolute; z-index: 10; background: var(--surface-raised);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--line); border-radius: 6px; box-shadow: var(--shadow); }
#head { top: 14px; left: 14px; max-width: 330px; padding: 13px 15px 12px; }
#head h1 { margin: 0; font: 600 19px/1.2 var(--serif); letter-spacing: -.01em; }
#head .sub { margin: 3px 0 0; font-size: 11.5px; color: var(--ink-soft); }
#honesty { top: 14px; right: 14px; width: 290px; padding: 12px 14px; }
#honesty h2, #detail h2, #legend h2 { margin: 0 0 8px; font: 700 10px/1 var(--sans);
  letter-spacing: .1em; text-transform: uppercase; color: var(--accent-mid); }
#honesty p { margin: 0 0 7px; font-size: 11.5px; color: var(--ink-soft); }
#honesty p:last-child { margin-bottom: 0; }
#filters { top: 150px; right: 14px; width: 290px; padding: 12px 14px; }
#filters .seg { display: flex; flex-wrap: wrap; gap: 4px; }
.seg button { padding: 5px 9px; font: 600 11px/1 var(--sans); color: var(--ink);
  background: var(--surface); border: 1px solid var(--line); border-radius: 4px; cursor: pointer; }
.seg button:hover { background: var(--accent-soft); }
.seg button[aria-pressed="true"] { background: var(--accent-soft); border-color: var(--accent-strong);
  color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent-strong); }
#detail { top: 230px; right: 14px; width: 290px; padding: 12px 14px; max-height: 62vh; overflow: auto; }
#detail .formline { font: 600 12px var(--sans); margin: 0 0 2px; }
#detail .agency { font: 700 9px var(--sans); letter-spacing: .09em; text-transform: uppercase; margin: 0 0 8px; }
#detail .gate { font-size: 11.5px; color: var(--ink-soft); margin: 0 0 10px; }
#detail table { width: 100%; border-collapse: collapse; font-size: 11px; }
#detail th { text-align: left; font: 700 9px var(--sans); letter-spacing: .08em;
  text-transform: uppercase; color: var(--ink-soft); padding: 3px 4px; border-bottom: 1px solid var(--line); }
#detail td { padding: 5px 4px; border-bottom: 1px solid var(--line); vertical-align: top; }
#detail td.cat { font-weight: 600; }
#detail td.na { color: #9aa79f; }
#detail tr.dormant td:not(.cat) { color: #9aa79f; }
#detail .bnote { margin: 7px 0 0; font-size: 10.5px; color: var(--ink-soft); }
#legend { left: 14px; bottom: 14px; padding: 10px 12px; }
#legend .row { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; }
#legend .swatch { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 5px; }
footer { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 10;
  max-width: 560px; font-size: 10.5px; line-height: 1.4; color: var(--ink-soft); text-align: center; }

/* --- graph primitives --- */
.node rect.box { fill: var(--surface-raised); stroke: var(--line); stroke-width: 1; rx: 6; }
.node.gated rect.box { stroke-dasharray: 4 3; stroke: var(--accent-strong); }
.node text.label { font: 15px var(--serif); fill: var(--ink); }
.node text.chip { font: 700 9.5px var(--sans); letter-spacing: .06em; text-transform: uppercase; }
.node.sel rect.box { stroke: var(--accent-strong); stroke-width: 2; }
.node { cursor: pointer; }
.node:focus { outline: none; }
.node:focus rect.box { stroke: var(--accent-strong); stroke-width: 2.5; }
.node.dim { opacity: .28; }
.edge path { stroke: var(--line); stroke-width: 1.5; fill: none; }
.edge.conditional path { stroke-dasharray: 3 3; }
.edge.dim { opacity: .2; }
#err { display: none; position: absolute; top: 0; left: 0; right: 0; z-index: 100; padding: 12px 16px;
  background: #9a3412; color: #fff; font-weight: 600; }
#err.show { display: block; }
```

- [ ] **Step 5: Write `js/render.js`**

```js
import { isInTrack } from "./model.js";

const HUE = { student: "#1f78b4", employment: "#0c5237", family: "#8a6512", humanitarian: "#9a3412", origin: "#18362d" };

function wrap(text, perLine) {
  const words = text.split(" ");
  const lines = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > perLine && line) { lines.push(line); line = w; }
    else line = (line + " " + w).trim();
  }
  if (line) lines.push(line);
  return lines;
}

export function renderGraph(svg, laid, d3, state) {
  const S = d3.select(svg);
  S.selectAll("*").remove();
  S.attr("viewBox", `0 0 ${laid.width} ${laid.height}`)
    .attr("width", laid.width).attr("height", laid.height);

  S.append("defs").append("marker")
    .attr("id", "arrow").attr("viewBox", "0 -5 10 10").attr("refX", 9).attr("refY", 0)
    .attr("markerWidth", 5).attr("markerHeight", 5).attr("orient", "auto")
    .append("path").attr("d", "M0,-4L9,0L0,4").attr("fill", "#d9ddd3");

  const gEdges = S.append("g");
  gEdges.selectAll("path").data(laid.edges).join("path")
    .attr("class", d => `edge${d.conditional ? " conditional" : ""}`)
    .attr("d", d => d.points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" "))
    .attr("marker-end", "url(#arrow)");

  const gNodes = S.append("g");
  const g = gNodes.selectAll("g").data(laid.nodes, d => d.id).join("g")
    .attr("class", d => `node${d.gate ? " gated" : ""}`)
    .attr("tabindex", 0).attr("role", "button")
    .attr("aria-label", d => `${d.label}${d.chipText ? ", " + d.chipText : ""}`)
    .attr("transform", d => `translate(${d.x - d.w / 2},${d.y - d.h / 2})`);

  g.append("rect").attr("class", "box")
    .attr("width", d => d.w).attr("height", d => d.h)
    .attr("stroke", d => HUE[d.track] ?? HUE.origin);

  g.each(function (d) {
    const sel = d3.select(this);
    const lines = wrap(d.label, Math.floor(d.w / 8));
    const perLine = Math.max(1, lines.length);
    sel.append("text").attr("class", "label")
      .attr("x", 14).attr("y", 22)
      .selectAll("tspan").data(lines).join("tspan")
      .attr("x", 14).attr("dy", 19).text(t => t);
    if (d.chipText) {
      const chipLines = wrap(d.chipText, Math.floor((d.w - 28) / 5.6));
      sel.append("text").attr("class", "chip")
        .attr("x", 14).attr("y", 22 + perLine * 19 + 4)
        .attr("fill", HUE[d.track] ?? HUE.origin)
        .selectAll("tspan").data(chipLines).join("tspan")
        .attr("x", 14).attr("dy", 12).text(t => t);
    }
  });

  g.on("click", (event, d) => window.dispatchEvent(
    new CustomEvent("node:select", { detail: d.id })));
  g.on("keydown", (event, d) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      window.dispatchEvent(new CustomEvent("node:select", { detail: d.id }));
    }
  });

  updateHighlight(svg, state);
}

export function updateHighlight(svg, state) {
  const S = d3.select(svg);
  S.selectAll("g.node")
    .classed("sel", d => d.id === state.selected)
    .classed("dim", d => !isInTrack(d, state.track));
  S.selectAll("path.edge")
    .classed("dim", d => {
      const on = (t, s) => !state.track || t === state.track || s.includes(state.track);
      return !(on(d.vTrack, d.vShared) || on(d.wTrack, d.wShared));
    });
}
```

`updateHighlight` dims an edge when *neither* endpoint is on the active track, using the
`vTrack`/`wTrack`/`vShared`/`wShared` fields that `layoutGraph` puts on every edge. An edge is
visible if either end is visible, which keeps a shared node like the H-1B cap connected to both
the student and employment branches when either is filtered on.

- [ ] **Step 6: Write `index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The US immigration system, as a queue</title>
<meta name="description" content="An interactive flowchart of the US immigration system: every form, which agency processes it, and roughly how long you wait.">
<link rel="stylesheet" href="css/immiflow.css">
</head>
<body>

<div id="graph-wrap">
  <svg id="graph" role="img" aria-label="Flowchart of the US immigration system"></svg>
</div>
<div id="err" role="alert"></div>

<header id="head" class="panel">
  <h1>The US immigration system, as a queue</h1>
  <p class="sub">One person, no legal status, every path out. Each step names the form, the agency
  that processes it, and roughly how long the wait is.</p>
</header>

<section id="honesty" class="panel">
  <h2>About these numbers</h2>
  <p>USCIS publishes the time within which it completed <b>80% of cases</b> for each form. That is not a
  median and not a promise. <b>About 4 months</b> means 80% finished inside 4 months.</p>
  <p>Figures are rounded and compiled September 2026 from public USCIS and Department of Labor
  processing times. They do not update themselves.</p>
</section>

<section id="filters" class="panel">
  <h2>Show one path</h2>
  <div class="seg" id="track" role="group" aria-label="Filter by path"></div>
</section>

<section id="detail" class="panel" aria-live="polite"></section>

<section id="legend" class="panel">
  <h2>Paths</h2>
  <div class="row" id="legend-rows"></div>
</section>

<footer>Times are approximate and not live. The visa-bulletin wait and the USCIS processing wait are
two different queues and are never added together. TPS and DACA are temporary and are not routes to a
green card. This page is an explainer, not legal advice.</footer>

<script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 7: Write a first `js/main.js` that renders and nothing else**

```js
import * as dagre from "https://esm.sh/dagre@0.8.5";
import * as d3 from "https://esm.sh/d3@7.9.0";
import { loadGraph } from "./graph.js";
import { layoutGraph } from "./layout.js";
import { renderGraph, updateHighlight } from "./render.js";
import { makeTextMeasurer, TRACKS } from "./model.js";

const err = document.getElementById("err");
const fail = (msg) => { err.textContent = msg; err.classList.add("show"); };

try {
  const graph = await loadGraph("data/flow.json");
  const laid = layoutGraph(graph, dagre, { measure: makeTextMeasurer() });
  const state = { selected: null, track: null };
  renderGraph(document.getElementById("graph"), laid, d3, state);

  const seg = document.getElementById("track");
  const mk = (id, label) => {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = label; b.dataset.track = id;
    b.setAttribute("aria-pressed", String(state.track === id));
    b.addEventListener("click", () => { state.track = id; paint(); });
    return b;
  };
  seg.append(mk(null, "All"), ...TRACKS.map(t => mk(t.id, t.label)));
  const rows = document.getElementById("legend-rows");
  for (const t of TRACKS) {
    const s = document.createElement("span");
    s.innerHTML = `<i class="swatch" style="background:${t.hue}"></i>${t.label}`;
    rows.append(s);
  }
  function paint() {
    updateHighlight(document.getElementById("graph"), state);
    for (const b of seg.children) b.setAttribute("aria-pressed", String(b.dataset.track === state.track));
  }
} catch (e) {
  fail(`Could not draw the flowchart: ${e.message}`);
}
```

- [ ] **Step 8: Run the unit tests**

Run: `cd ~/dev/yucombinator.github.io/immiflow && node --test`
Expected: PASS including the two `edgePath` tests.

- [ ] **Step 9: Verify in a real browser**

```sh
cd ~/dev/yucombinator.github.io/immiflow && python3 -m http.server 8899 >/tmp/immiflow-serve.log 2>&1 &
```

Open `http://127.0.0.1:8899/` in a browser tab. Confirm and screenshot:
- the full graph renders — all four tracks visible, no `#err` banner;
- every node carries a colored border matching its track hue;
- nodes with `gate` text have a dashed border;
- the header, honesty panel, filter chips, legend and footer are all visible;
- at 900px wide the graph scrolls horizontally rather than squashing.

If dagre or d3 fails to import, the `#err` banner names it — fix the import before going further.

- [ ] **Step 10: Commit**

```sh
cd ~/dev/yucombinator.github.io
git add immiflow
git commit -m "Render the immigration flow graph with dagre and d3"
```

---

### Task 4: The detail panel

Clicking a node has to show the whole truth about that step.

**Files:**
- Create: `immiflow/js/detail.js`
- Modify: `immiflow/js/main.js`

**Interfaces:**
- Consumes: `detailModel(node)` from Task 2, `renderGraph` node ids.
- Produces: clicking or pressing Enter on a node renders its detail panel; Escape closes it.

- [ ] **Step 1: Write `js/detail.js`**

```js
const esc = (s) => String(s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
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
```

- [ ] **Step 2: Wire selection into `main.js`**

Add to `main.js`, before the `try` block:

```js
import { renderDetail } from "./detail.js";
import { detailModel } from "./model.js";
```

Inside the `try`, after `renderGraph(...)`:

```js
const detail = document.getElementById("detail");
window.addEventListener("node:select", (e) => {
  state.selected = e.detail;
  paint();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { state.selected = null; paint(); }
});
```

and inside `paint()`:

```js
renderDetail(detail, state.selected ? detailModel(graph.nodes.get(state.selected)) : null);
```

- [ ] **Step 3: Verify in a real browser**

With the server from Task 3 still running, open `http://127.0.0.1:8899/`:
- click the PERM node → the panel shows `ETA-9089`, the `DOL` agency label, the gate about the 30/60-day recruitment minimums, and "over a year" in the processing column;
- click the EB-1/EB-5 visa-bulletin node → the Queue column is populated and the Processing column reads a dash, never a number;
- click a decision node like `job-offer` → the panel shows its chip ("sponsorship required"), the
  gate, and the "no form, no wait" line;
- press Escape → the panel empties;
- Tab to a node and press Enter → the panel opens for that node.

Screenshot the PERM panel open as the visual proof.

- [ ] **Step 4: Commit**

```sh
cd ~/dev/yucombinator.github.io
git add immiflow/js
git commit -m "Add node detail panel with per-category wait breakdown"
```

---

### Task 5: Chrome, docs, and the calling-card link

**Files:**
- Modify: `immiflow/index.html`
- Create: `immiflow/README.md`
- Modify: `index.html` (site root, add the link beside the `/pudmap/` entry at line 142)

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: the page as shipped, documented, and linked from the site.

- [ ] **Step 1: Add the page-level framing to `index.html`**

Add a `<noscript>` line inside `#graph-wrap` before the `<svg>`:

```html
<noscript><p style="padding:20px">This flowchart needs JavaScript. The short version: it is a queue,
and most of it is longer than people think.</p></noscript>
```

Confirm the honesty panel (`#honesty`) text says what Task 3 wrote and that the footer carries the
TPS/DACA and never-summed-queues lines. Both are already in Task 3's `index.html`; leave them.

- [ ] **Step 2: Write `README.md`**

````markdown
# US immigration system flowchart

An interactive flowchart of the US immigration system, built for one person: inside the country,
no legal status, trying to stay. It traces every mainstream path — student, job offer, family,
humanitarian — and names the form, the processing agency, and roughly how long each step takes.

Open it through any static server:

```sh
cd ~/dev/yucombinator.github.io/immiflow && python3 -m http.server 8899
# http://127.0.0.1:8899/
```

## How to read it

Each node is one step. The border colour is the path; the chip under the label is the headline wait
(`I-765 · about 4 months`). Click any node for the full breakdown by category.

Two columns that look like they should be added are not: **processing** is the time the agency takes
to review your form, and **queue** is the visa-bulletin wait before you are allowed to file at all.
They are different queues with different failure modes — the bulletin can move backwards — and
summing them into one "about X years" number is the single most misleading thing this page could do.

**TPS and DACA are dead ends, on purpose.** Neither is a route to permanent residence. So is
curricular practical training. The graph draws those nodes without outgoing edges because that is
the fact, not because the author ran out of road.

**H-1B is a lottery before it is a form.** The cap-registration node has no wait time because there
is no queue to join — there is a draw, once a year, and being picked only buys time in the country.

## Where the numbers come from

Figures are **rounded and approximate**, compiled September 2026 from:

- [Boundless — USCIS Processing Times](https://www.boundless.com/immigration-resources/uscis-processing-times) (updated August 2026)
- [Boundless — Average Green Card Wait Times](https://www.boundless.com/immigration-resources/average-green-card-wait-times) (updated April 2025)

The two disagree with each other on several forms, and neither is authoritative — these are a law
firm's summaries of government figures, not the government figures. The page rounds hard enough
("about 4 months", "over a year") that the disagreement does not change what a reader concludes.

USCIS publishes the time within which it completed **80% of cases**. That is not a median and not a
promise. Nothing on this page is live.

**This is an explainer, not legal advice, and not a reference table.** It is a map of the shape of
the queue. Do not file anything on the strength of it.

## Editing the graph

Everything lives in `data/flow.json` — nodes with their forms and waits, and edges between them.
The layout is computed at runtime by dagre, so adding a node means adding data and reloading.

```sh
python3 tools/validate_data.py    # edge endpoints, duplicate ids, agencies, reachability
node --test                 # the pure logic: parsing, chips, filtering, geometry
```

## Stack

dagre for layout, d3 for SVG, vanilla ES modules, no build step. The design language is the same one
as [the WA rate map](../pudmap/) — same tokens, same panel chrome, same track colours used the same
way in both places.
````

- [ ] **Step 3: Link it from the calling card**

In the site root `index.html`, add after the `/pudmap/` anchor (currently at line 142):

```html
<a href="/immiflow/" class="link immiflow-link" target="_blank" rel="noopener noreferrer">
    <i class="bi bi-diagram-3-fill"></i>
    Immigration Queues
</a>
```

Use a `bi` icon that exists in Bootstrap Icons 1.11.3; `bi-diagram-3-fill` is one. Verify the icon
renders by loading the site root in a browser.

- [ ] **Step 4: Final verification**

Run the full check, then look at the page one last time:

```sh
cd ~/dev/yucombinator.github.io/immiflow
python3 tools/validate_data.py && node --test
```
Expected: `OK: 28 nodes, 39 edges, all reachable` and all tests passing.

In the browser: filter to "Student" and confirm only the student track plus the shared H-1B cap node
stay bright; filter to "Family" and confirm the two multi-year bulletin rows render; switch back to
"All" and confirm nothing stays dimmed. Screenshot the filtered student view.

- [ ] **Step 5: Commit**

```sh
cd ~/dev/yucombinator.github.io
git add immiflow index.html
git commit -m "Document the immigration flowchart and link it from the calling card"
```

---

## Self-review

**Spec coverage.** Problem/Goal → Task 3 renders the shape, Task 1 encodes the queue. Scope "In"
bullet 1 (four tracks) → Task 1. Bullet 2 (form, agency, wait) → Tasks 1 and 4. Bullet 3 (two waits,
never summed) → Global Constraints, Task 1's data, Task 4's panel copy, asserted by a test in Task 2
and verified in Task 5. Bullet 4 (country backlogs) → Task 1's `backlogs` field, rendered in Task 4. Bullet 5 (premium) → Task 1, Task 4's Premium column. Bullet 6 (gates: lottery, sponsorship, degree, immediate-relative exemption) → Task 1's `gate` and `chip`, dashed border in Task 3's CSS. Scope "Out" → respected; consular processing appears only as a named omission in the K-1 and I-485 nodes. "Approximate by design" → Global Constraints, the honesty panel in Task 3, the README in Task 5. Design language table → Task 3's CSS and the track hues in `TRACKS`. Graph model → Task 1, validated by `parseGraph`. Interaction (click, filter, hover, keyboard, one paint path) → Task 4 for click/keys, Task 3 for the single `paint()`; **hover is not implemented** — the CSS has no tooltip and no task builds one. Fix: drop "Hover" from the spec's Interaction list, since the chip already carries the headline figure and a tooltip would duplicate it. Failure handling (bad data, CDN down, no wait, no wait data) → Task 1's validator, Task 3's `#err` banner, Task 4's "no form, no wait" line, Task 2's `headlineWait` returning `null`. The spec's "stale after 90 days" rule was removed in the revision and has no task, correctly. Testing → Tasks 2, 3, 4, 5. Deliverables 1–5 → Tasks 3, 1, 1, 5, 5.

**Placeholder scan.** No TBD or TODO. The plan's earlier draft contained a knowingly-broken
`updateHighlight` and a duplicated node-width formula; both were removed during the pre-flight
scan and the plan now carries only the working version. Task 1 states its node and edge counts so a
drifted file is caught at Step 4, and names the four terminal nodes so their missing out-edges read
as design rather than omission.

**Type consistency.** `chipText`, `headlineWait`, `isInTrack`, `nodeSize`, `detailModel`, `TRACKS` are used by the same names in Tasks 2, 3, 4, 5. `detail.rows[].{regular,premium,bulletin,backlogs,note}` is defined in Task 2 and read in Task 4. `laid.nodes[].{x,y,w,h,chipText,gate,track,id}` and `laid.edges[].{v,w,points,conditional,vTrack,wTrack,vShared,wShared}` are produced in Task 3 and consumed by `renderGraph` in the same task. `state = {selected, track}` is consistent across Tasks 3 and 4.
