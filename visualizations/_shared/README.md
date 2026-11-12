# In Motion framework

One engine and one build pipeline for every city page.

```
_shared/
  motion.js        renderer, chart, scrubber, schedule drawer, search, city switcher
  motion.css       shared layout/theme; accent comes from --accent
  cities.js        registry used by the city switcher
  version.js       generated asset+data version (stamp_version.py)
  motion_build.py  GTFS -> data.json pipeline (shared by every city)
  stamp_version.py content hash -> version.js + ?v= tags (run before deploy)
toronto-in-motion/
  city.js          city config: modes, legend, camera, timezone, storage slug
  build/build_data.py
                   classifer + feed list + city extras (e.g. island ferry)
  index.html       copy/meta only; loads the shared engine
vancouver-in-motion/…  seattle-in-motion/…
tests/
  check_configs.py static contract checks
  check_data.py    rebuild every city and compare with committed data/schedules
  check_schedules.py validate lazy route timetables
  runtime-smoke.js browser checks (load, counts, tooltips, BRT toggle, hover)
  runtime-schedule.js browser checks (drawer, run mode, search, day switch)
```

## Adding a city

1. Create `visualizations/<city>-in-motion/` with `index.html` (copy a sibling,
   update title/meta/About) and `city.js`.
2. Add `build/build_data.py` declaring feeds, a `classify(feed, route_id,
   route_type, route_color, agency, route_name, route_short)` function returning
   `(mode, hex)` or `None`, then `CFG` and `mb.run(CFG)`.
3. Add a `data/` folder? No: run `python3 build/build_data.py` to write
   `data.json`, `data-saturday.json`, `data-sunday.json`, `stops-*.json` and
   the lazy `schedules/<route-index>.json` timetables.
4. Add the city to `_shared/cities.js` and the hand-written cards in `../index.html`.
5. Run `python3 _shared/stamp_version.py` and the tests. `.nojekyll` at the repo
   root keeps GitHub Pages from skipping `_shared/` (Jekyll ignores `_` dirs).

## Conventions

- Modes are data: a mode key appears in `city.js.modes` only if the city has it.
- Renderer behaviour is canonical: `busModes` fade at region zoom, `trainModes`
  use rail arrows. No city branches in `motion.js`.
- Colours are per-route from the feed; operator palettes live in the city
  classifier. BRT is its own mode and may use per-operator shades.
- `viewInBounds`, camera, timezone, zone label and storage slug are config.
- `motion_build.expandFrequencies` defaults to true; Toronto sets it false to
  preserve its long-standing schedule data.
- `storageKey` keeps the legacy payload prefixes (tim/van/sea) so returning
  visitors keep their saved camera and panel state.

## Tests

```bash
python3 tests/check_configs.py
python3 tests/check_data.py          # rebuilds all cities, compares JSON/stops/schedules
python3 tests/check_schedules.py     # validates committed route timetables
python3 _shared/stamp_version.py --check
```

The browser smoke suites are `tests/runtime-smoke.js` and
`tests/runtime-schedule.js`; load each in an omp eval kernel (see the header
comments) and run `runRuntimeSmoke(<base url>)` and
`runScheduleSmoke(<base url>)`. The existing expected values live in
`tests/runtime-expected.json`.

## Schedule drawer

The drawer is created by `motion.js`; no city page needs schedule markup.
`motion_build.py` writes one compact timetable per route index and service day.
The engine fetches it only when a route or run is opened, using
`schedules/${routeIndex}.json?v=${window.MOTION_VERSION}`. Interpolated
stop rows carry `published: 0` and render with a leading `~`.

## Note

Shared styles use `color-mix(in srgb, var(--accent) N%, transparent)`, which
needs Chrome 111+/Safari 16.2+. Bump `stamp_version.py`'s hash inputs when
adding a new shared asset.
