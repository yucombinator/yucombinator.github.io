# Tests

- `check_configs.py` — city.js vs data.json contract, legend/tooltip integrity,
  registry/folder consistency, accent match, no per-city `app.js`.
- `check_data.py` — rebuilds every city with `_shared/motion_build.py` into a
  temp dir and compares `data.json`, both weekend files, every
  `stops-*.json`, and every `schedules/*.json` file byte-for-byte (ignoring
  the `built` timestamp).
- `check_schedules.py` — validates committed lazy timetables: every route
  file exists, run indexes point at the matching day trips, times are
  monotonic, and interpolated rows are marked.
- `test_schedule_build.py` — unit tests for timepoint interpolation,
  including distance weighting and avoidance of overlapping dwells.
- `app.spec.js` — Playwright desktop/mobile/landscape checks against a deterministic `?test=1` page.
- `live.spec.js` — Playwright production checks (custom domain, current asset version, schedule payload, mobile Routes entry).
- `test_synthetic_build.py` — offline synthetic GTFS build covering frequency, timepoint blanks, and 24h+ runs.
- `runtime-schedule.js` — legacy browser checks for the schedule drawer: opening
  route mode, run mode, follow persistence, inactive runs, route search,
  Escape ordering, and the mobile sheet.
- `runtime-smoke.js` — browser checks used during the migration: load, total and
  per-mode counts at 12:00 (playback paused first), legend order, tooltip rows,
  city menu labels, accent, tooltip hover, BRT toggle, Saturday switch, and the
  hover-ring stability test. Expected values: `runtime-expected.json`.
  Run it from an omp eval kernel:

  ```js
  const schedule = await Bun.file("visualizations/tests/runtime-schedule.js").text();
  eval(schedule);
  const src = await Bun.file("visualizations/tests/runtime-smoke.js").text();
  eval(src);
  await runRuntimeSmoke("http://localhost:8741/visualizations");
  ```

  The smoke expectations use fixed 12:00 counts, so they go stale after a
  nightly GTFS refresh; refresh `runtime-expected.json` with it. It is a
  migration/UI check, not a deploy gate.

CI: `.github/workflows/check-in-motion.yml` runs the config contract, synthetic builder tests, schedule payload contract, and stamp check on every visualizations change; `.github/workflows/check-browser.yml` runs Playwright; `.github/workflows/check-production.yml` runs the deployed-site check daily. `check-in-motion-parity.yml` rebuilds all
cities weekly/manually because it needs the GTFS downloads. The San Francisco
parity build needs `BAY_AREA_511_KEY` (or a populated ACE GTFS cache); without
it the ACE route is absent and parity fails independently of this feature.

The pre-unification captures were used only during the migration and are kept
in the branch history, not as test fixtures.

## Portable browser suite

```bash
cd visualizations/tests
npm ci
npx playwright install chromium
npx playwright test
```

Playwright runs desktop, mobile, landscape, and an axe-core drawer scan against
a deterministic `?test=1` page. The deployed-site monitor is:

```bash
npx playwright test --config=playwright.live.config.js
```

The legacy `runtime-smoke.js` / `runtime-schedule.js` eval harnesses remain for
manual investigation; they are not the deploy gate.
