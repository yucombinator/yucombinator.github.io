# WA PUD rate map

An interactive map of Washington electric utility service territories, colored by
what a residential customer actually pays — so you can see at a glance that the
public utility next door is usually cheaper than Puget Sound Energy.

Open `index.html` through any static server:

```sh
cd ~/dev/pudmap && /tmp/transitenv/bin/python tools/serve.py 8848
# http://127.0.0.1:8848/
```

Use `tools/serve.py` rather than `python3 -m http.server` while developing:
the plain server sends no cache headers, so browsers silently keep serving
yesterday's ES modules after an edit.

## What it shows

- **County selector** at the top. Pick your county and the map re-prices every
  territory, the legend thresholds, and the tooltips against that county's own
  public utility. The dropdown names that utility, so "Douglas County" means
  Douglas PUD at 2.35¢, not the Puget Sound Energy that covers most of the
  state. Counties whose main utility has no published rate are labelled
  `(no rate)` and say so when selected.
- **Choropleth** of every electric utility territory in Washington, colored
  relative to your chosen benchmark at the selected hour. Green is cheaper,
  red is more expensive, gray is a rate we have not collected yet. Hue says
  who owns the wire — orange is investor-owned, green is public power.
- **Monthly usage** selector (300–3,000 kWh) and a **time-of-day** slider.
  Only 4 of the 40 utilities publish a time-of-day schedule (Puget Sound
  Energy, City Light, Avista, Pacific Power) and all four sell it as an opt-in
  product, so the other 36 charge one price at every hour and the slider cannot
  move them. Moving the slider switches the map to "This hour" for you, since
  the hour means nothing in "All-hours". Bills
  include the basic charge, any separately published monthly surcharges (like
  Skamania's $3.85 CETA fee), energy riders (like Pacific Power's 1.217¢ CETA
  allocation), and bill-level utility taxes. Optional fees and discounts are
  shown but never added to a total.
- **Hover verdict**: every territory states in words whether it is cheaper or
  dearer than your selected utility, by percentage and by dollars.
  "All-hours" colors the standard residential rate; "This hour" shows the
  published time-of-day rate where one exists.
- **Detail card** per utility: cents/kWh, an estimated monthly bill, the fixed
  charge, the delta versus PSE, the effective date, who sets the rate, and a
  link to the source tariff.
- **Colour legend** — a single green-to-red bar showing the actual cents per
  kWh, with your selected utility's rate marked in the middle, so the shading
  is readable as numbers rather than vibes.
- **Basemap toggle** — Esri light gray (default, so the colors read) or
  OpenTopoMap terrain.

## Reading the comparison

**Energy rates are not the whole bill.** The basic monthly charge is where the
order changes. At 300 kWh, Douglas PUD's 2.35¢ is the cheapest energy in the
state, yet its $17.57 basic charge is 71% of your bill and a Snohomish PUD
customer still pays over twice as much. Conversely Snohomish PUD's 10.61¢ looks
expensive next to Douglas until its $14.90 charge — a 45 km territory with a
small fixed cost — pulls the bill to $46.74. At 1,000 kWh the energy rate
dominates again. Pick your real usage before drawing conclusions.

**Each utility has one statewide residential rate.** We model a single rate
per utility, not a rate that varies by county — a PUD or IOU in Washington
publishes one residential schedule for all its customers. What changes across a
map is *which utility serves you*, not what that utility charges per kWh. The
exception is city utility tax, which some districts add only inside city limits
(Ferry PUD's 4% in Republic), so an address inside a city can pay slightly more
than the published rate.

## The two honesty caveats

Both are surfaced in the UI, not buried here.

**Territories are approximate.** Washington does not publish PUD service
boundaries as open data. `tools/assign_territories.py` builds a *nearest
service center* model: each county is clipped from census geometry, split by the
perpendicular bisectors between the utilities serving it (a Voronoi partition,
so shared borders are straight lines that meet exactly), and each public
utility is limited to a 45 km rounded-square claim around its office. Whatever
is left goes to the county's default supplier. The partition is disjoint and
gap-free by construction. It is still not a legal boundary map — most PUDs serve
only a fraction of their namesake county — so treat the shapes as a fair
approximation and the labels as the truth.

**Rates are curated, not live.** There is no public API for Washington retail
electricity rates. Every number in `data/rates.json` came from a utility's own
tariff, rate schedule, or board resolution, and carries a `source` URL and an
`effective` date. They do not update on their own. The page's *computation* is
live — bills, TOD selection, and deltas are all calculated in the browser — but
the inputs are a snapshot.

A third thing worth knowing: Washington has **three** investor-owned utilities
(Puget Sound Energy, Avista, Pacific Power). NorthWestern Energy has no
Washington territory. And every time-of-day schedule we collected — PSE, Seattle
City Light, Avista, Pacific Power — is an **opt-in** product, not the standard
residential rate. That is why "All-hours" never colors by TOD.

## Data files

| File | What it is |
|---|---|
| `data/utilities.json` | Roster: 41 utilities with type, counties, service city, and which counties are their default supplier |
| `data/centers.json` | Geocoded service centers (Nominatim, cached) |
| `data/boundaries.geojson` | Generated territory polygons — 76 polygons across 40 utilities |
| `data/rates.json` | Per-utility residential rates, tiers, TOD schedules, sources |
| `data/raw/*.json` | Unnormalized research output, one file per research batch, kept for provenance |

## Regenerating

```sh
/tmp/transitenv/bin/python tools/geocode.py            # refresh service-center coords
/tmp/transitenv/bin/python tools/assign_territories.py # rebuild boundaries.geojson
/tmp/transitenv/bin/python tools/normalize_rates.py   # rebuild rates.json from data/raw/
```

`normalize_rates.py` unwraps the subagent JSON envelope, coerces the string
numbers back to numbers, and reports which utilities still have no rate.

## Coverage

40 utilities with territory, 33 with a collected rate. Gray areas are utilities
we know exist but have not collected: Cheney, Chewelah, Cashmere, Coulee Dam,
Blaine, Sumas, McCleary, Milton, Eatonville, Ruston, Steilacoom.

Six "PUDs" from the original roster are **deliberately absent** because they do
not distribute electricity — Asotin, Skagit, Whatcom (industrial only), Kitsap
(water/fiber, still studying electric service), Stevens, and Thurston. Drawing
territory for them would put a lie on the map.

Washington also has a dozen or so electric co-ops and mutuals (Kootenai Electric,
OPALCO, Tanner, Clearwater Power, the Pierce County mutuals) whose residential
rates are not publicly filed. They are not on the map; that is a known gap.

## Stack

Leaflet, vanilla ES modules, no build step, no framework. Design language is
shared with [hikewithyu.com/algonquin](https://hikewithyu.com/algonquin/) —
same basemap pair, same forest palette, same panel chrome.
