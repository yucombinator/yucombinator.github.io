# WA PUD Rate Map — Design Spec

**Date:** 2026-09-29
**Status:** Approved for build
**Path:** `~/dev/pudmap`

## Problem

Washington's public power utilities (PUDs) are invisible in a rate comparison. A
customer can see a Puget Sound Energy bill but has no way to look across a
county line and see that the neighbouring PUD is cheaper, or how the gap changes
by time of day.

## Goal

An interactive web map where each Washington electric utility's territory is
colored by what a typical residential customer actually pays, segmented by time
of day where the utility offers time-of-day (TOD) rates, with the
investor-owned utilities (Puget Sound Energy, Avista, NorthWestern, PacifiCorp)
included as the comparison baseline.

## Scope

**In:**
- All Washington PUDs, plus Seattle City Light and Tacoma Power (municipal
  utilities that compete directly with PUDs), plus the four investor-owned
  utilities (PSE, Avista, NorthWestern, PacifiCorp) as comparison lines.
- Residential rates: energy charge (¢/kWh), fixed/basic charge, TOD periods
  where offered, effective date, source URL.
- Choropleth by rate for a selected period; live in-browser bill calculation.
- Per-territory delta versus Puget Sound Energy, the headline comparison.

**Out:**
- Commercial and industrial rates (not comparable across utilities without
  normalization).
- Billing history or time-series rates.
- Any legal or authoritative claim about service-territory boundaries.

## The data honesty problem

Two constraints shape the whole design, and both are surfaced in the UI:

1. **No live rate API exists.** Retail rates come from each utility's published
   tariff. They are curated into `data/rates.json` with a source URL and an
   effective date per utility, and refreshed by `tools/refresh_rates.py`, which
   re-fetches sources and writes a diff. "Live" in this project means the
   *computation* is live — the page computes a blended bill in-browser for any
   usage profile and hour from the rate inputs — not that rates update by
   themselves.
2. **PUD service boundaries are not open data.** Most utilities publish service
   area maps as PDFs or images, not GeoJSON. The map therefore uses census
   county boundaries as its base layer, with hand-authored carve-out polygons
   for counties that a single utility does not serve alone. It is labelled as
   approximate everywhere it appears.

## Architecture

```
~/dev/pudmap
  index.html            single page, no build step
  css/pud.css           design tokens + layout
  js/map.js             Leaflet setup, choropleth, tooltips
  js/rates.js           rate math, TOD selection, bill estimate
  js/ui.js              panels, legend, controls, deltas
  data/boundaries.geojson  utility territories (county base + carve-outs)
  data/rates.json          per-utility rate records
  tools/refresh_rates.py   re-fetch + diff rate sources
  tools/build_boundaries.py  county base + carve-outs -> boundaries.geojson
  README.md
```

Vanilla JS and ES modules, served by `python3 -m http.server`. No framework, no
bundler — the map is a static artifact anyone can host.

## Design language

Mirrors hikewithyu.com/algonquin/ so the two projects read as one family.

| Token | Value |
|---|---|
| Basemap | OpenTopoMap primary, CARTO Light secondary, Leaflet `preferCanvas` |
| Body font | `-apple-system, 'Segoe UI', sans-serif`, 13px/1.45 |
| Display font | Georgia, serif — headings, stat values |
| Ink | `#18362d` |
| Accent | `#0c5237` → `#4caf7d` green ramp |
| Surface | `#eef6ef`, raised `#eef2ec` |
| Hairline | `#d9ddd3` |
| Water / selected | `#1f78b4`, `#3182bd` |
| Expensive | `#d95f02`, `#b30000` |

Chrome: 4px radii, `backdrop-filter: blur(8px)` panels, collapsible legend
bottom-right, stat chips (uppercase 10px letterspaced label over a serif value
on a soft accent fill), Georgia-serif popup headings with a letterspaced
uppercase eyebrow.

## Rate model

```json
{
  "id": "snopud",
  "name": "Snohomish PUD",
  "type": "pud",
  "service_area": "Snohomish County (excl. ...) + ...",
  "residential": {
    "energy_cents_kwh": 7.42,
    "fixed_charge_monthly_usd": 21.50,
    "effective": "2026-04-01",
    "tod": null,
    "source": "https://..."
  },
  "tiered": [ { "up_to_kwh": 500, "cents_kwh": 7.42 } ],
  "notes": ""
}
```

TOD record:

```json
"tod": {
  "seasons": ["summer", "winter"],
  "periods": [
    { "name": "Off-peak", "start": "22:00", "end": "06:00", "cents_kwh": 6.20 },
    { "name": "Mid-peak", "start": "06:00", "end": "17:00", "cents_kwh": 9.10 },
    { "name": "On-peak", "start": "17:00", "end": "22:00", "cents_kwh": 14.30 }
  ]
}
```

A utility without TOD gets a single flat period, so the map always has a value
to paint.

## Bill calculation

For a selected usage profile (300 / 500 / 1,000 / 2,000 / 3,000 kWh per month)
and a selected hour, the page computes a monthly estimate:

- Flat rate: `usage * cents + fixed_charge`
- TOD: `sum over hours of (rate_for_hour * monthly_kwh * load_shape[hour])`
  with a documented load shape, defaulting to a residential peak-evening shape.
- Tiered: progressive tiers, plus TOD energy charge where both apply.

Every estimate shows the usage profile and hour it assumed, because a TOD bill
depends on both.

## Choropleth

Sequential green ramp for rates below the comparison utility, diverging at the
PSE benchmark, red above it. `fillOpacity` 0.62 so the basemap reads through.
Selected territory gets a `#1f78b4` outline at weight 2.5.

## Failure handling

- Missing rate record: territory renders neutral gray with a hatch, tooltip
  says "rate not yet collected". Never silently zero-fills.
- Malformed `rates.json`: the page loads the map and shows a visible error
  banner rather than a blank screen.
- Tile provider down: basemap is a background, so territories still render.

## Testing

- `tools/validate_data.py` asserts every territory in the GeoJSON has a rate
  record, no duplicate ids, and TOD periods cover 24h without gaps or overlaps.
- Bill math is checked against hand-computed cases: flat 1,000 kWh at 7.42¢
  plus $21.50 fixed = $95.70; TOD profile sums to the same monthly kWh.
- Visual check in a real browser at 1440x900 and a narrow viewport.

## Deliverables

1. `index.html` working locally via `python3 -m http.server` from `~/dev/pudmap`.
2. `data/boundaries.geojson`, `data/rates.json`, both validated.
3. `tools/refresh_rates.py` and `tools/build_boundaries.py` re-runnable.
4. `README.md` with data sources, the honesty caveats, and refresh instructions.
