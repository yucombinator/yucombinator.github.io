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

Figures are **rounded and approximate**, compiled October 2026 from:

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
