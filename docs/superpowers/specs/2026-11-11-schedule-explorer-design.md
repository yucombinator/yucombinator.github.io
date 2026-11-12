# Schedule drawer and route search

Date: 2026-11-11
Status: proposed
Scope: `visualizations/` — shared engine, build pipeline, Seattle/Toronto/Vancouver/San Francisco pages

## Intent

Let a visitor inspect the timetable behind a moving service without leaving the map.

Clicking a scheduled trip opens an optional schedule drawer for that individual run: route, direction, day, and every stop with its scheduled time. The drawer is optional in use: it can be closed without stopping follow. Clicking a route line opens the same drawer in route mode with the day's runs. A button at the bottom of the drawer opens a route search; selecting a route loads its timetable in place.

The map remains the primary surface. The initial page payload must not grow by the full timetable.

## Goals

- Show exact scheduled arrival/departure times for the selected run, not times inferred from animation profiles.
- Keep the drawer useful while following a scheduled trip: highlight the next stop and keep it in view.
- Open route timetables from a route selection or route search.
- Work for all four cities and all three service days, with the existing dark/light themes.
- Preserve map interaction and follow behavior when the drawer is open.
- Make the feature keyboard accessible and usable as a desktop side drawer or mobile bottom sheet.

## Non-goals

- Journey planning or transfer itineraries.
- Real-time predictions, delays, cancellations, or live ETAs.
- A stop-level departure board. Search covers routes; stops are wayfinding inside a route timetable.
- Shareable/deep-linkable schedule URLs in this pass.
- Changes to the animation, map projection, vehicle follow camera, or chart.
- Rebuilding the live feed to add trip IDs. Live vehicles show route-level schedule context only.

## Current state

- `_shared/motion.js` renders the map and owns route selection and follow state.
- Clicking an arrow or route line calls `startFollow()`/`selectRoute()` and currently opens the compact `#routePanel` at the bottom.
- `data.json` / `data-<day>.json` store each trip as `[shape, start, end, route]`; the active day's trip array is the identity used by `follow.trip`.
- `_shared/motion_build.py` reads full GTFS `stop_times.txt` and keeps `trip_times` while building dwell/time profiles, then discards per-stop times from the output. It currently drops rows whose arrival/departure values are blank, which matters for timepoint-only feeds.
- `stops-<feed>.json` only carries a representative stop sequence per route plus aggregate distance/run time. It is not a timetable.
- Frequencies are expanded into individual map runs with `emit(tid, t, at, at + duration)`, reusing the template trip's stop pattern.
- Live vehicles carry route and position, not a trip ID; see `seattle-in-motion/worker/src/gtfsrt.js`.

## Approaches considered

### A. One schedule drawer in the existing page — chosen

Add a shared drawer component. It is a right-hand panel on desktop and a bottom sheet on mobile. Run selection, route selection, and search all render into it. Route timetables are fetched lazily and cached.

Why: it matches the requested interaction, reuses the existing selection/follow state, and avoids a second navigation model. The main cost is refactoring the current bottom route panel and getting mobile layout right.

### B. Separate `/schedule` page

A full page with route search and timetable tables. Better for sharing and exploration, but it duplicates chrome/navigation, splits the map from the schedule, and is a larger project. Rejected for this pass; the drawer can later link out to such a page.

### C. Run-only drawer using existing animation profiles

Cheapest implementation, but profile times are representative, omit exact stop times, and disagree with GTFS for short-turn and frequency runs. It would not be a trustworthy timetable. Rejected.

## Design

### Data model and build output

Extend `motion_build.py` to retain the information it already reads.

1. Capture `trip_headsign` and `direction_id` from `trips.txt` into `local_trips`.
2. Generate one schedule file per route:
   `visualizations/<city>-in-motion/schedules/<route-index>.json`

   `route-index` is the integer route pointer used by `routeIds`/the `trips` rows. It is the sorted route order already used by `route_keys` in the builder and `Object.keys(D.routes)` in the runtime. The schedule file is written for every route with at least one timed run, across all configured service days.

3. Handle timepoint-only feeds. Some operators publish arrival/departure times only at selected stops; San Francisco has several such feeds. The builder must keep stop rows with blank times, not discard them.

   - Keep every stop row in sequence order.
   - Use the published times where present.
   - Between two published timepoints, fill blank times by linear interpolation proportional to stop-to-stop distance (haversine), falling back to equal intervals when distance is zero. Interpolated dwell is zero.
   - Store a per-row `published` flag so the drawer can mark interpolated rows with a leading `~` and explain “some times interpolated between published timepoints” in the footer.
   - A run qualifies for a timetable when it has at least two published timepoints. A run with fewer than two is omitted; the route can still animate it. This is the exception to the run-count equality test below.

4. File shape (compact JSON, one self-contained file per route):

```json
{
  "route": "puget:1",
  "stops": [
    ["Capitol Hill Station", 47.6195, -122.3208],
    ["Westlake Station", 47.6115, -122.3375]
  ],
  "days": {
    "weekday": {
      "runs": [
        {
          "i": 1234,
          "trip": "trip-id",
          "dir": 0,
          "headsign": "Capitol Hill",
          "start": 25200,
          "end": 27120,
          "stops": [[0, 25200, 25200, 1], [1, 25260, 25260, 1]]
        }
      ]
    },
    "saturday": { "runs": [] },
    "sunday": { "runs": [] }
  }
}
```

- `stops` is a route-local stop table: `[raw GTFS name, lat, lon]`. Deduplicate by stop ID. The client applies the existing `cleanStopName()` display cleanup.
- Each run's `stops` rows are `[stop-table index, arrival seconds, departure seconds, published]`, where `published` is `1` for a real GTFS timepoint and `0` for an interpolated time.
- `i` is the run's index in that service day's `trips` array. This maps a followed scheduled trip (`follow.trip`) to its run without adding trip IDs to the map payload.
- `trip` plus `start` form the stable run key for cross-day matching. `trip` is no longer debug-only.
- `start`/`end` mirror the first departure and last arrival and let the drawer render a compact run row before expanding stops.
- Times remain seconds from the service-day start and may exceed `86400` for overnight service. The client formats with the existing `fmt()` convention.
- A run is omitted only when it has fewer than two published timepoints; the map may still animate it.

5. Build from the final emitted day list, not from raw `day_trips`, so schedule indexes stay aligned with the emitted `trips` rows that survive shape filtering. For each emitted run:

   - Find the template rows in `trip_times` for `(feed, trip_id)`, including rows with blank times.
   - For a frequency-expanded run emitted at `at`, shift every template arrival/departure by `at - template_t0`. The template duration is preserved.
   - For a normal run, use the actual rows.
   - Interpolate blank rows as described above and mark their published flag `0`.
   - Sort by stop sequence; keep the exact stop sequence for that trip, including short-turn variants.
   - Record the final emitted run index as `i`.

6. Add the schedule files to `stamp_version.py`'s asset digest so a timetable change invalidates `?v=` and browser caches. The files are loaded with `?v=${window.MOTION_VERSION}`.

7. Keep the initial `data.json` and day payloads unchanged. The drawer is the only consumer of `schedules/`.

### Runtime and state

Add a schedule panel state separate from map selection:

```js
schedulePanel: {
  open: false,
  mode: 'run' | 'route' | 'search',
  routePtr: -1,
  runIndex: -1,        // active-day trips index, for follow and highlighting
  runKey: null,        // [trip_id, start] for cross-day identity
  day: null,
  previousMode: null,
  autoScroll: true
}
```

Add a `schedulesCache` keyed by route pointer. `loadRouteSchedule(routePtr)` fetches once, validates `doc.route === routeIds[routePtr]`, and caches the promise/result. A failed fetch leaves the drawer's route summary visible and offers a retry; it does not block animation.

**The drawer replaces the existing bottom `#routePanel`.** Remove that block from `.panel`, move its route header/stats into the drawer's route mode, and let the drawer be the only route-detail surface. `selectRoute()` opens the drawer instead of showing `#routePanel`; `panelMain` stays available so playback and day controls remain usable. There must not be two route summaries.

Selection behavior:

- **Scheduled arrow click**: keep the existing follow behavior. Open `schedulePanel` in `run` mode for `follow.trip`. Load the route schedule and find the run with `i === follow.trip`; set `runKey` from that run's `trip` and `start`.
- **Route line click**: select the route without starting follow (existing behavior). Open `route` mode.
- **Live vehicle click**: keep live follow. Open `route` mode, not `run` mode; display “Live vehicle · route timetable” and do not invent a trip association.
- **Search result route click**: select the route, open `route` mode, and load the timetable. Do not start follow.
- **Run row click in route mode**: find that run's `i`; switch to `run` mode. Start follow only if the run is active at the current clock. If it is outside its active window, do not start follow and show “Not active at HH:MM”; the map stays where it is. If it is active, follow as above.
- **Close drawer**: hide it; keep follow and route selection active. The map tooltip continues to identify the followed vehicle.
- **Escape**: in search mode, leave search; otherwise close the drawer; otherwise preserve the existing behavior of stopping follow/clearing selection.
- **Day switch**: keep the drawer open. If a run is selected, look it up by `runKey` in the new day's schedule. Keep run mode when found; otherwise switch to route mode and show “not running on this day.” A run with a different `i` on the new day is still the same run when `trip` and `start` match. Route mode already reloads for the selected day from the same schedule file.
- **Chart / speed / scrubber changes**: do not use the current animation clock to fake schedule times. Run view highlights the next scheduled stop from the timetable; the clock is only used to show progress while following.

Panel updates while following must be throttled (about once per second) and must not rebuild the entire drawer every animation frame. Stop highlight/next-stop state should update in place.

### Drawer UI

Create `#schedulePanel` as a shared, non-modal drawer. It can be emitted by the shared engine or added once to each city `index.html`; use the shared engine so the four pages cannot drift.

Desktop:

- Fixed right side, above the bottom playback `.panel`; width about 360–400 px.
- Header: route dot, route short/long name, mode/operator, close button.
- Body: scrollable.
- Footer: `Search routes & schedules` button.

Mobile:

- Bottom sheet above the bottom playback `.panel`, max-height about 65–70vh.
- Same header/body/footer; close button remains reachable.
- The sheet must not prevent map dragging outside it.

Run mode:

- Header: route number/name, direction/headsign, service date, “Following” state when applicable.
- Stop list: departure/arrival time, stop name, current/next marker. The next stop is highlighted; completed stops are muted.
- Interpolated times are prefixed `~` and the footer notes that some times were interpolated between published timepoints.
- If the run is not active at the current clock, show “Not active at HH:MM” rather than a follow state.
- While following, auto-scroll to keep the next stop visible unless the user has manually scrolled. Provide a “Recenter” affordance after manual scroll.
- A compact summary line shows first–last time and stop count.

Route mode:

- Route summary: trips today, first/last, peak headway, stop count, distance/run time from the existing route stats.
- Direction/headsign groups for the selected day; runs sorted by start time. Show at most the day's runs; no pagination needed because a route timetable is bounded.
- Each run row: start time → end time, headsign, stop count. Selecting it enters run mode; it starts follow only when the run is active at the current clock.
- If no runs for the day, show a clear empty state.

Search mode:

- Replaces the drawer body with a search input and results.
- Search routes by short name, long name, agency, and mode. Results show route dot/number/name/operator.
- Selecting a result loads route mode. Search is not a global stop departure board.
- Keyboard: arrow keys move results, Enter selects, Escape backs out.
- Persist the search string only in memory for the open drawer; do not write it to storage.

### Styling and accessibility

- Reuse the existing palette/canvas theme variables and `.rtitle`, `.rdot`, `.rstats` conventions where possible.
- Drawer is non-modal: `role="region"` with `aria-labelledby`; focus moves to the close button on open, and to the search input on entering search.
- `aria-live="polite"` for the follow/next-stop status; do not announce every clock tick.
- All controls keyboard reachable; honor `prefers-reduced-motion` for any drawer animation.
- Time values use tabular numerals.
- If the drawer hides the followed vehicle, do not change the camera automatically; the user can close the drawer. (No map padding change in this pass.)

### Files and responsibilities

- `_shared/motion_build.py`: capture headsign/direction; generate schedule files; update output and stamp inputs.
- `_shared/motion.js`: state, fetch/cache, drawer rendering, run/route/search modes, follow synchronization, keyboard handling.
- `_shared/motion.css`: desktop drawer, mobile sheet, run rows, search results, themes.
- `_shared/version.js`: regenerated by `stamp_version.py`.
- Four city `index.html` files only if the drawer markup is not engine-emitted; if emitted, no page changes beyond the regenerated version tag.
- `_shared/stamp_version.py`: include `schedules/*.json`.
- `tests/check_data.py`: compare schedule files as part of the rebuild.
- `tests/runtime-smoke.js`: add drawer/search/follow checks.
- `tests/README.md` / `_shared/README.md`: document the new data file and test.

### Tests

Build/data:

- Every route with at least one qualifying run has a schedule file.
- For every day and route, the number of run records equals the number of dated `trips` rows for that route that have at least two published timepoints; the exception is documented per run.
- Every recorded `i` indexes the matching day's trip row; every run has at least two published timepoints.
- Stop times are non-decreasing within a run; first/last match the run's start/end.
- Interpolated rows carry `published: 0`; at least the endpoints of every run are published.
- Frequency-expanded runs have shifted times but the same stop sequence as the template.
- Rebuilding all cities produces identical schedule files (subject to normal sorting/rounding).
- `stamp_version.py --check` passes.

Runtime smoke:

- Click a scheduled arrow: drawer opens in run mode, route name appears, at least two stop rows and times appear.
- Follow continues after closing the drawer; tooltip/follow state remains.
- Click a route line: route mode appears with runs; selecting an active run enters run mode and follows; selecting an inactive run enters run mode without follow and shows “Not active”.
- Search button opens search; typing filters routes; selecting a route opens route mode.
- Day switch keeps the drawer; a cross-day run stays in run mode when its `trip`/`start` key exists, otherwise route mode shows “not running on this day.”
- Escape closes search, then drawer, then follow in that order.
- Mobile viewport: drawer is a bottom sheet, close/search controls reachable.
- Live vehicle click opens route mode with the live explanation, not a fabricated run.
- A San Francisco timepoint-only route renders interpolated rows and the interpolation note.

## Risks and mitigations

- **Payload size**: per-route schedule files are loaded only when needed; initial map data stays unchanged. Validate gzip size on the largest routes during implementation.
- **Timepoint-only feeds**: several San Francisco operators publish only timepoints. Blank rows must be kept and interpolated; omitting any run with a blank row would remove most of those routes from the timetable. Interpolated rows are marked, and the run-count test explicitly allows the fewer-than-two-timepoint exception.
- **Frequency expansion**: indexes and shifted times must follow the same emitted list as `trips`; build from the final emitted runs, not raw GTFS templates.
- **Short-turn trips**: use each trip's actual stop sequence, not the representative route stop pattern.
- **Overnight times**: keep extended seconds internally; display with existing `fmt()` behavior; do not clamp at midnight.
- **Live feed lacks trip IDs**: show route-level context only; do not guess.
- **Inactive run follow**: route mode lists the whole day; selecting an off-clock run must not enter a follow state that has no screen position. Only active runs start follow.
- **Duplicate route detail**: the drawer replaces `#routePanel`; the old bottom route details and its mobile panel-expansion behavior must be removed, not left hidden.
- **Cross-day identity**: `i` is day-scoped; use the `(trip, start)` run key for day-switch matching.
- **Drawer/map collision**: desktop drawer is fixed above the playback panel; mobile is a sheet. Test at the existing responsive breakpoints.
- **Route identity**: schedule filename uses the route index; add tests to lock the route ordering invariant or switch to an explicit manifest if route ordering becomes unstable.

## Left to the builder

- Exact responsive breakpoints and drawer widths beyond the ranges above.
- Visual details of run rows, stop markers, empty states, and search highlighting.
- Whether to add a small “Schedule” affordance in the existing route header, beyond opening automatically on selection.
- Whether an optional route manifest is preferable to index-based filenames if the repository adds many more cities.
- Exact wording of live/empty/error states.
