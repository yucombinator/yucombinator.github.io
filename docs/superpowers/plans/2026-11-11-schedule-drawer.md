# Schedule Drawer and Route Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a schedule drawer to every In Motion page: a selected run shows its stop-by-stop timetable, route selection shows the day's runs, and a footer button searches routes and opens their schedules.

**Architecture:** The build pipeline emits one lazy, self-contained timetable JSON per route index. The shared engine renders a non-modal drawer over the map, replaces the old bottom route panel, and synchronizes run mode with follow. Search uses the already-loaded route table; stop departures stay out of scope.

**Tech Stack:** Python 3.12 GTFS builder, vanilla JavaScript/canvas shared engine, CSS, static GitHub Pages, existing browser smoke harness.

**Spec:** `docs/superpowers/specs/2026-11-11-schedule-explorer-design.md`

## Global Constraints

- Initial `data.json` and `data-<day>.json` payloads must not grow by timetable data.
- Timetables are lazy per-route files at `schedules/<route-index>.json` under each city.
- Published GTFS times are authoritative. Blank times are interpolated only between published timepoints and are marked `published: 0`.
- A timetable run needs at least two published timepoints.
- Schedule times are seconds from the service-day start and may exceed `86400`; display with the existing `fmt()` convention.
- The drawer replaces `#routePanel`; do not leave two route-summary surfaces.
- Run identity across days is `(trip_id, start)`, not the day-scoped array index.
- Only active runs start follow; an inactive run opens run mode without follow.
- Live vehicles open route mode only; no fabricated trip association.
- Search covers routes, not a global stop-departure board.
- All four city pages share the engine; no city-specific branches.
- Every timetable fetch uses `?v=${window.MOTION_VERSION}`.
- Update `stamp_version.py`, `check_data.py`, `check_schedules.py`, and the CI config with the new assets.

## Review Focus

- **Timepoint-only feeds:** a San Francisco route with blank intermediate times must still produce a timetable, with interpolated rows visibly marked. Covered in Task 1 and Task 2.
- **Frequency-expanded runs:** duplicate trips must each get a distinct run key and shifted timetable while keeping the same stop sequence. Covered in Task 2.
- **Inactive run selection:** a route's 07:00 run selected at 15:00 must not enter an invisible follow state. Covered in Task 4.
- **Cross-day identity:** switching from weekday to Saturday must retain the same run by `(trip, start)` when it exists and fall back cleanly when it does not. Covered in Task 5.
- **Drawer replacement:** removing `#routePanel` must not leave the old panel styles, mobile expansion, or duplicate summary visible. Covered in Task 3 and Task 6.

---

### Task 1: Interpolate timepoint-only stop rows

**Files:**
- Modify: `visualizations/_shared/motion_build.py`
- Create: `visualizations/tests/test_schedule_build.py`

**Interfaces:**
- Consumes: existing `haversine_km(lat1, lon1, lat2, lon2)` in `motion_build.py`.
- Produces: `interpolate_stop_times(rows, stop_meta, offset=0) -> list[list] | None`
  - `rows`: iterable of `(seq: int, stop_id: str, arr: int | None, dep: int | None)`, including blank times.
  - `stop_meta`: `{stop_id: (lat: float, lon: float)}`.
  - Returns `[[seq, stop_id, arr, dep, published]]` sorted by sequence, with `published` equal to `1` only when the original row had both arrival and departure, or `None` when fewer than two published rows exist.

- [ ] **Step 1: Write the failing test**

Create `visualizations/tests/test_schedule_build.py`:

```python
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "_shared"))
from motion_build import interpolate_stop_times  # noqa: E402


class InterpolateStopTimesTest(unittest.TestCase):
    def test_interpolates_middle_by_distance(self):
        rows = [
            (1, "a", 0, 0),
            (2, "b", None, None),
            (3, "c", 120, 120),
        ]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        self.assertEqual(
            interpolate_stop_times(rows, meta),
            [
                [1, "a", 0, 0, 1],
                [2, "b", 60, 60, 0],
                [3, "c", 120, 120, 1],
            ],
        )

    def test_weights_by_distance(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", 120, 120)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.03)}
        result = interpolate_stop_times(rows, meta)
        self.assertEqual(result[1][2], 40)
        self.assertEqual(result[1][3], 40)

    def test_requires_two_published_timepoints(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", None, None)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        self.assertIsNone(interpolate_stop_times(rows, meta))

    def test_offsets_every_time_and_keeps_flags(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", 120, 120)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        result = interpolate_stop_times(rows, meta, offset=600)
        self.assertEqual([r[2:4] for r in result], [[600, 600], [660, 660], [720, 720]])
        self.assertEqual([r[4] for r in result], [1, 0, 1])


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `python3 visualizations/tests/test_schedule_build.py -v`
Expected: FAIL with `ImportError: cannot import name 'interpolate_stop_times'`.

- [ ] **Step 3: Implement `interpolate_stop_times`**

Add it near `haversine_km` in `motion_build.py`. It must:
- Preserve sequence order.
- Use `arr`/`dep` when present; if only one is present, use the present value for both.
- Fill blank rows between timed rows by linear distance interpolation using `haversine_km`; use equal intervals when total distance is zero.
- Copy the nearest timed boundary for leading/trailing blank rows.
- Add `offset` to every resulting arrival/departure.
- Count a row as published only if the original `arr` and `dep` were both non-`None`.
- Return `None` if fewer than two published rows exist.

- [ ] **Step 4: Run the test to verify it passes**

Run: `python3 visualizations/tests/test_schedule_build.py -v`
Expected: `OK` with 4 tests.

- [ ] **Step 5: Commit**

```bash
git add visualizations/_shared/motion_build.py visualizations/tests/test_schedule_build.py
git commit -m "Build interpolated schedule stop rows"
```

---

### Task 2: Emit lazy per-route timetable files

**Files:**
- Modify: `visualizations/_shared/motion_build.py`
- Modify: `visualizations/_shared/stamp_version.py`
- Modify: `visualizations/tests/check_data.py`
- Create: `visualizations/tests/check_schedules.py`
- Modify: `visualizations/tests/README.md`
- Generate: `visualizations/<city>-in-motion/schedules/<route-index>.json`

**Interfaces:**
- Consumes: `interpolate_stop_times(rows, stop_meta, offset=0)` from Task 1.
- Produces: a schedule file per route index with:
  - `route`: route key string.
  - `stops`: `[[name, lat, lon], ...]`.
  - `days`: `{"weekday": {"runs": []}, "saturday": {...}, "sunday": {...}}`.
  - Each run: `{"i": int, "trip": str, "dir": int, "headsign": str, "start": int, "end": int, "stops": [[stopIndex, arr, dep, published], ...]}`.
  - Every route gets a file; a route with no qualifying runs gets empty `runs` lists.
- Produces: `check_schedules.py` exits nonzero if any committed schedule file violates that contract.

- [ ] **Step 1: Write the failing schedule checker**

Create `visualizations/tests/check_schedules.py` for all cities. It must:
- Discover cities by the existing `city.js` rule.
- Load the base `data.json` and each configured day payload (`data.json` for the base weekday, `data-<day>.json` for weekend files); for each route key at index `i`, load `schedules/<i>.json`.
- Assert the file exists for every route, including routes with empty day lists.
- Assert `route` matches the route key, and every configured day key exists.
- Assert every run's `i` is within that day payload's `trips` length and that trip row's route field is the route index.
- Assert `i` values are unique per day; runs sharing a `trip` have different `start` values and the same stop count (frequency expansion); each run has at least two rows, at least two `published == 1`, and non-decreasing times.
- Print `N cities, M routes, 0 failures` on success.

Run it first:
`python3 visualizations/tests/check_schedules.py`
Expected: FAIL because the `schedules/` files do not exist.

- [ ] **Step 2: Capture the data the timetable needs**

In `motion_build.py`:
- Add `headsign` and `direction` to every `local_trips` record from `trips.txt` (`trip_headsign`, `direction_id`).
- Add `trip_schedule_rows = {}` keyed `(feed_id, trip_id)`, populated from every `stop_times.txt` row, including rows with blank times. Do not change the existing `trip_times` rows used by animation profiles.
- Keep `offset` support so a frequency-expanded run can shift a template’s times.

- [ ] **Step 3: Generate route timetable files**

After the final emitted day lists and `route_index` exist, build schedule files from the emitted day list, not from raw `day_trips`, so `i` matches the surviving `trips` row order.

For each emitted run:
- Find its template rows in `trip_schedule_rows`.
- For frequency runs, use `offset = emitted_t0 - template_t0`; otherwise `0`.
- Call `interpolate_stop_times`.
- Skip the run if it returns `None`.
- Add a route-local stop table entry for each used stop (`raw name`, lat, lon), deduplicated by stop ID.
- Append the run with its final emitted index as `i`, source `trip` id, `dir`, `headsign`, `start`, `end`, and stop rows.
- Fail the build if an emitted run with at least two published timepoints produced no schedule row; this catches index or interpolation regressions.

Write one file per route index:
`os.path.join(out_dir, "schedules", f"{route_index}.json")`

with `separators=(",", ":")`. Write every route, including routes with empty day lists. Create the `schedules/` directory when writing.

- [ ] **Step 4: Include schedules in cache busting**

In `stamp_version.py`, add each city’s `schedules/*.json` files to `ASSETS`. Ensure the existing `?v=` stamping flow covers the new fetch query.

- [ ] **Step 5: Add schedule parity to `check_data.py`**

After comparing existing data/stops, compare the temp output’s `schedules/` directory against the committed one:
- Same file names on both sides.
- Byte-for-byte equal contents.

- [ ] **Step 6: Rebuild and verify**

Run:
```bash
for d in visualizations/*-in-motion; do python3 "$d/build/build_data.py"; done
python3 visualizations/tests/check_schedules.py
```
Expected: schedule files generated; checker prints `4 cities, N routes, 0 failures`.

Then run:
```bash
python3 visualizations/tests/check_data.py
python3 visualizations/_shared/stamp_version.py
python3 visualizations/_shared/stamp_version.py --check
```
Expected: parity passes; stamp reports the new version and check passes.

- [ ] **Step 7: Document the generated data and commit**

Update `visualizations/tests/README.md` with `check_schedules.py` and the new `schedules/` payload. Commit generated files.

```bash
git add visualizations
git commit -m "Generate per-route schedule payloads"
```

---

### Task 3: Add the drawer shell and route mode

**Files:**
- Modify: `visualizations/_shared/motion.js`
- Modify: `visualizations/_shared/motion.css`
- Modify: `visualizations/seattle-in-motion/index.html`
- Modify: `visualizations/toronto-in-motion/index.html`
- Modify: `visualizations/vancouver-in-motion/index.html`
- Modify: `visualizations/san-francisco-in-motion/index.html`
- Create: `visualizations/tests/runtime-schedule.js`

**Interfaces:**
- Consumes: `D.routes`, `routeIds`, `routeSlot`, `routeMode`, `routeStats(idx)`, `loadRouteSchedule` data format from Task 2.
- Produces:
  - `loadRouteSchedule(routePtr: number) -> Promise<object | null>`
  - `openSchedulePanel(mode: 'route'|'run'|'search', routePtr: number, runKey: [string, number] | null = null, runIndex = -1) -> void`
  - `closeSchedulePanel() -> void`
  - `renderScheduleRoute(routePtr: number, day: string) -> void`
  - `window.__timSchedule` with `openRouteByIndex(index)`, `openRunByIndex(routeIndex, runIndex)`, `openSearch()`, `close()`, `state()` for the browser test harness.

- [ ] **Step 1: Write the failing browser check**

Create `visualizations/tests/runtime-schedule.js` with `runScheduleSmoke(base)`:
- Open one city page and wait for `#loading.done`.
- Call `window.__timSchedule.openRouteByIndex(0)`.
- Wait for `#schedulePanel:not([hidden])`.
- Assert the panel has the route name, a run list or a clear empty state, and a `#scheduleSearch` button.
- Assert no duplicate `#routePanel` is visible.
- Assert the old `#routePanel` element is absent.

Run it via the browser harness; expected first run fails because `#schedulePanel` and `window.__timSchedule` do not exist.

- [ ] **Step 2: Create the drawer markup and state**

In `motion.js`:
- Add `schedulePanel = { open:false, mode:null, routePtr:-1, runIndex:-1, runKey:null, day:null, previousMode:null, autoScroll:true }`.
- Add `scheduleCache = new Map()`.
- Create the drawer DOM once during boot: `aside#schedulePanel[hidden]` containing a header with `#schName`, `#schMeta`, `#schDot`, `#schClose`; a scrollable `#schBody`; and a footer `#scheduleSearch`.
- Remove the old `#routePanel` block from all four city `index.html` files.
- Move the route header/stats rendering to the drawer. Keep the existing `routeStats()` calculations but write them into `#schBody` route mode rather than the removed `#rStats`.

- [ ] **Step 3: Implement lazy loading and route mode**

Add `loadRouteSchedule(routePtr)`:
- Fetch `schedules/${routePtr}.json?v=${window.MOTION_VERSION || 'local'}`.
- Validate `doc.route === routeIds[routePtr]`.
- Cache the promise/result.
- On failure, render the route summary plus a retry message; do not throw uncaught.

`renderScheduleRoute(routePtr, day)` must show:
- Route dot, short/long name, mode/operator.
- Existing stats: trips today, stops, km, end-to-end minutes, average speed, headway, first/last.
- Runs grouped by `dir`/`headsign`, sorted by `start`; each row exposes `data-run-key` with `trip` and `start` for the next task.
- Empty state when no runs exist for the day.

`openSchedulePanel('route', routePtr)` opens the drawer, loads the schedule, renders route mode, and focuses `#schClose`. Wire `selectRoute(idx)` to open route mode after it sets the route header; remove its old `#routePanel` show/hide and mobile expansion logic, and make `clearSelection()` close the drawer instead of hiding `#routePanel`. `closeSchedulePanel()` hides the drawer without stopping follow or clearing selection.

- [ ] **Step 4: Add desktop/mobile CSS and set `window.__timSchedule`**

Style:
- Desktop: fixed right panel above the playback `.panel`, width 360–400 px, scrollable body, theme-aware.
- Mobile: bottom sheet above the playback panel, max-height 65–70vh, map still draggable outside.
- Reuse existing `.rtitle`, `.rdot`, `.rstats`, colors, and tabular numerals.
- Remove obsolete `#routePanel` CSS selectors, the mobile `.panel.collapsed #routePanel` rule, and the mobile panel expansion triggered by `selectRoute`.
- Give the drawer `role="region"` and `aria-labelledby`; focus `#schClose` on open and the search input on entering search; honor `prefers-reduced-motion` for its transitions.

Expose the test hook at the end of `boot()`:
```js
window.__timSchedule = {
  openRouteByIndex: (i) => openSchedulePanel('route', i),
  openSearch: () => openSchedulePanel('search', selected),
  openRunByIndex: (routeIndex, runIndex) => openSchedulePanel('run', routeIndex, null, runIndex),
  close: closeSchedulePanel,
  state: () => ({ ...schedulePanel }),
};
```

- [ ] **Step 5: Run the browser check**

Run it via the browser harness against a local static server.
Expected: panel opens, route name/stats render, search button exists, no `#routePanel`.

- [ ] **Step 6: Commit**

```bash
git add visualizations/_shared/motion.js visualizations/_shared/motion.css \
  visualizations/*-in-motion/index.html visualizations/tests/runtime-schedule.js
git commit -m "Add schedule drawer shell and route mode"
```

---

### Task 4: Add run mode and follow synchronization

**Files:**
- Modify: `visualizations/_shared/motion.js`
- Modify: `visualizations/_shared/motion.css`
- Modify: `visualizations/tests/runtime-schedule.js`

**Interfaces:**
- Consumes: `schedulePanel`, `scheduleCache`, `loadRouteSchedule`, `openSchedulePanel`, `closeSchedulePanel`, `startFollow`, `stopFollow`, `follow.trip`, `curDay`.
- Produces: `renderScheduleRun(routePtr: number, runKey: [string, number]) -> void`; `updateScheduleFollow(now: number) -> void`; `window.__timSchedule.openRunByIndex(routeIndex: number, runIndex: number) -> void`.

- [ ] **Step 1: Extend the failing browser check**

Add assertions:
- `window.__timSchedule.openRunByIndex(routeIndex, runIndex)` opens run mode with a route header, at least two stop rows, and times.
- The run's `Not active at HH:MM` or `Following` label matches whether `state.t` is inside the run window.
- Closing the drawer preserves the follow state when a scheduled follow is active.
- Inactive run selection does not create a `follow` with no screen position.

- [ ] **Step 2: Implement run mode**

`renderScheduleRun` must:
- Find the run by `runKey` in `scheduleCache` for the current day; if absent, fall back to route mode with `not running on this day`.
- Render the route header, direction/headsign, date, first–last, and stop list.
- Prefix interpolated times with `~`; add the interpolation note when any row has `published === 0`.
- Mark the next stop based on `state.t` and `run.stops`; muted completed stops.
- Auto-scroll to the next stop unless `schedulePanel.autoScroll` is false; show `Recenter` after manual scroll.
- Use the existing `fmt()` for display; keep extended seconds in logic.

- [ ] **Step 3: Wire selection and inactive runs**

- `startFollow('scheduled', { trip, route })` must open run mode for `follow.trip` after `selectRoute` with `runIndex = follow.trip` and no `runKey`. When the schedule loads, resolve that run, set `runKey`, and render it. Live `startFollow` must continue to open route mode only.
- Selecting a run row in route mode: open run mode; call `startFollow` only when the run is active at `state.t` (including the next-day wrap for overnight runs); otherwise set `follow = null` and show `Not active at HH:MM`.
- Closing the drawer must not call `stopFollow`.
- `stopFollow` must leave the drawer open and switch the run header to non-following state.

- [ ] **Step 4: Synchronize follow without rebuilding the drawer**

Add `updateScheduleFollow(now)` and call it from the draw loop at most once per second:
- If mode is run and the selected run is active, find the next stop index; update the existing row classes and `aria-live` status.
- Do not re-render the stop list or reset scroll every frame.
- If follow ends, remove the following state but keep run mode.

- [ ] **Step 5: Run the browser check**

Expected: active scheduled run shows `Following`; inactive run shows `Not active`; closing preserves follow; stop list updates without layout churn.

- [ ] **Step 6: Commit**

```bash
git add visualizations/_shared/motion.js visualizations/_shared/motion.css visualizations/tests/runtime-schedule.js
git commit -m "Add run schedule mode and follow sync"
```

---

### Task 5: Add route search and cross-day identity

**Files:**
- Modify: `visualizations/_shared/motion.js`
- Modify: `visualizations/_shared/motion.css`
- Modify: `visualizations/tests/runtime-schedule.js`

**Interfaces:**
- Consumes: `openSchedulePanel`, `renderScheduleRoute`, `renderScheduleRun`, `schedulePanel.runKey`, route data.
- Produces: `renderScheduleSearch(query: string) -> void`; `selectScheduleRoute(routePtr: number) -> void`; cross-day run lookup by `(trip, start)`.

- [ ] **Step 1: Extend the failing browser check**

Add assertions:
- `#scheduleSearch` click opens search mode with a focused input.
- Typing a route short or long name filters results; Enter or click opens route mode for that route.
- Escape in search mode returns to the previous drawer view.
- Switching from weekday to Saturday keeps a matching run in run mode; a missing run falls back to route mode with `not running on this day`.
- Cross-day matching uses `trip` + `start`, not `i`.

- [ ] **Step 2: Implement search**

- `renderScheduleSearch(query)` filters `routeIds` by short name, long name, agency, and mode; render matching rows with dot/number/name/operator.
- Keep the current query in `schedulePanel.query`; no local storage.
- Arrow keys move an active result; Enter selects; Escape calls `openSchedulePanel(previousMode, routePtr)`.
- `selectScheduleRoute(routePtr)` selects the route (without follow), loads the route schedule, and renders route mode.

- [ ] **Step 3: Implement cross-day run lookup**

When `activateDay` changes the day and the drawer is open:
- If mode is route, re-render route mode for the new day.
- If mode is run, find a run whose `trip` and `start` match `schedulePanel.runKey` in the new day.
- Found: set `runIndex` to that day's `i` and re-render run mode.
- Missing: render route mode and show `not running on this day`.

- [ ] **Step 4: Run the browser check**

Expected: search filters and selects routes; Escape returns to the prior view; the cross-day test passes for a route with both weekday and weekend runs.

- [ ] **Step 5: Commit**

```bash
git add visualizations/_shared/motion.js visualizations/_shared/motion.css visualizations/tests/runtime-schedule.js
git commit -m "Add schedule route search and cross-day runs"
```

---

### Task 6: Final integration, tests, and documentation

**Files:**
- Modify: `visualizations/tests/check_configs.py`
- Modify: `visualizations/tests/runtime-smoke.js`
- Modify: `.github/workflows/check-in-motion.yml`
- Modify: `visualizations/_shared/README.md`
- Modify: `docs/superpowers/specs/2026-11-11-schedule-explorer-design.md` only if implementation changes a decision

**Interfaces:**
- Consumes: all previous tasks’ output.
- Produces: a fully verified feature with no stale `#routePanel`, stamped assets, and documented tests.

- [ ] **Step 1: Extend static checks**

In `check_configs.py`, assert each city page still loads the shared assets and does not contain `id="routePanel"`. Do not assert on incidental copy.

- [ ] **Step 2: Extend the existing smoke suite**

Add a `schedule` section to `runtime-smoke.js` or call `runScheduleSmoke`:
- Scheduled arrow/run opens the drawer.
- Route line/search opens route mode.
- Search filters routes.
- Mobile viewport uses the sheet.
- Live vehicle opens route mode with the live explanation.
- Escape ordering and follow persistence.

Do not pin transient route names or stop counts unless the test fetches the matching schedule file; stale counts must not break the suite.

- [ ] **Step 3: Add the schedule checker to CI**

Add `python3 visualizations/tests/check_schedules.py` to `.github/workflows/check-in-motion.yml` after the static config check. The data parity workflow already rebuilds schedules through `check_data.py`.

- [ ] **Step 4: Run all offline checks**

```bash
python3 visualizations/tests/check_configs.py
python3 visualizations/tests/test_schedule_build.py -v
python3 visualizations/tests/check_schedules.py
python3 visualizations/tests/check_data.py
python3 visualizations/_shared/stamp_version.py --check
```
Expected: all pass.

- [ ] **Step 5: Run browser smoke**

Start a local static server and run both `runtime-smoke.js` and `runtime-schedule.js` through the browser harness. Expected: all cities pass; inspect the drawer visually at desktop and mobile widths.

- [ ] **Step 6: Update docs and commit**

Document `schedules/`, the lazy fetch, and the new test in `_shared/README.md` and `tests/README.md`. Commit.

```bash
git add visualizations docs/superpowers
git commit -m "Finish schedule drawer integration and tests"
```
