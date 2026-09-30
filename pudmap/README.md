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

- **Benchmark selector** at the top, two ways. Pick your county and the map
  re-prices against that county's own public utility, so "Douglas County" means
  Douglas PUD at 2.35¢, not the Puget Sound Energy that covers most of the
  state. Or pick any of the 40 utilities directly — a county often holds more
  than one, and King County has both Puget Sound Energy and Seattle City Light.
  Counties whose main utility has no published rate are labelled `(no rate)`.
  Both dropdowns stay in sync, so the map, the list and the legend can never
  disagree about who "yours" is.
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
  more expensive than your selected utility, by percentage and by dollars.
  "All-hours" colors the standard residential rate; "This hour" shows the
  published time-of-day rate where one exists.
- **Detail card** per utility: cents/kWh, an estimated monthly bill, the fixed
  charge, the delta versus PSE, the effective date, who sets the rate, and a
  link to the source tariff.
- **List view** — the same numbers as a table: every utility sorted cheapest
  first, with its per-kWh rate, the bill at your chosen usage, and the gap
  against your county's utility. Rows are tinted and swatched with the same
  green-to-red scale as the map, with the legend repeated above the table.
  Click a row to expand its full rate breakdown in place — service area, chips,
  bill, basic charge, surcharges, tiers or time-of-day periods, and links to the
  utility's site and its published tariff. The two views always agree because
  they read the same state through a single repaint path.
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

**Territories are the real thing.** The map is drawn from the *Electric Utility
Service Areas* layer published by the Washington Utilities and Transportation
Commission and the Department of Ecology — 65 polygons covering every electric
distribution operator in the state, including co-ops, mutuals and the naval
bases. `tools/build_service_areas.py` downloads it and maps each polygon onto our
rate record. Where a county holds several operators (King County has both Puget
Sound Energy and Seattle City Light) each has its own boundary, which is why
the county picker is only a shortcut and the utility picker is the real control.

**Utilities with no rate render gray, not missing.** Twenty-five of the 65
operators have no collected residential rate — mostly co-ops and mutuals whose
rates are not publicly filed (Nespelem Valley Elec Coop, Inland Power & Light,
Orcas Power & Light, Tanner, the Pierce County mutuals), plus three naval
installations. They are on the map, selectable, and honest about the gap.

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
/tmp/transitenv/bin/python tools/build_service_areas.py # rebuild boundaries.geojson from WUTC/Ecology
/tmp/transitenv/bin/python tools/fetch_city_boundaries.py  # OSM city limits (kept for reference)
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

## Deploying

The site is plain static files served by GitHub Pages from the repo root, so the
map lives at `pudmap/` inside the site repo and needs no build step.

```sh
tools/deploy_site.sh          # sync into the site repo and print a preview URL
tools/deploy_site.sh --push   # sync, commit and push
```

Live at <https://yuchenhou.com/pudmap/>, linked from the calling card at
<https://yuchenhou.com/>. The sync excludes `data/us_counties.geojson` (a 3 MB
build input for the territory generator) and the deploy script itself; the site
only needs the 112 KB generated `boundaries.geojson`.

The development copy stays in `~/dev/pudmap`; edit there and re-run the script.

## Stack

Leaflet, vanilla ES modules, no build step, no framework. Design language is
shared with [hikewithyu.com/algonquin](https://hikewithyu.com/algonquin/) —
same basemap pair, same forest palette, same panel chrome.
