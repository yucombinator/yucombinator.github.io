# Calgary live snapshot Worker

A keyless, 1-minute Cloudflare Worker that turns Calgary Transit's public
GTFS-Realtime vehicle-position feed into the `live.json` shape used by the In
Motion engine.

```
GET /live.json
{
  "generated": 1762400000000,
  "feeds": ["calgary"],
  "routes": ["calgary:307-20800", ...],
  "v": [[routeIndex, lat, lon, bearing, timestampMs, "calgary:01388"], ...]
}
```

## Source (no key)

- Calgary Transit — `https://data.calgary.ca/download/am7c-qe3u/application%2Foctet-stream`

The feed carries a `trip_id` but **no `route_id`**, and no timestamp: the
`VehiclePosition.trip` holds only `trip_id`, and field 5 is congestion level,
not time. So the worker:

1. parses the protobuf (a minimal wire parser, no protobuf library),
2. joins each `trip_id` through `live-trips.json`, which `build_data.py` emits
   next to `data.json` from the same GTFS feed the map is drawn from,
3. emits route keys in the engine's `calgary:<route_id>` form.

`live-trips.json` is fetched once per isolate and cached six hours
(`cf.cacheTtl` one day); it is ~400 KB for all 27,900 trips.

A few live trips (~2% at test time, five vehicles) are not in the static feed
at all — Calgary's realtime feed carries occasional extra-board trips the
published schedule omits — and those vehicles are skipped rather than guessed
onto a route.

Trip-update and alert feeds exist (`gs4m-mdc2`, `jhgn-ynqj`) but carry no route
either, so the client stays on scheduled arrows for delays and alerts.

## Cache and latency

- HTTP: Cache API, 60 s TTL; a miss rebuilds from the feed.
- Cron: `* * * * *` warms the cache.
- Stale-while-error: if a rebuild fails, the last cached snapshot is served
  with `x-stale: 1`.

## Tests

```bash
bun test
```

`test/routes.test.js` asserts every live route key exists in the committed
`data.json`, and that `live-trips.json` covers all 271 static route keys — so a
feed change that breaks the join fails the suite instead of silently emptying
Live.

## Deploy

```bash
bun install
npx wrangler login   # once
npx wrangler deploy
```

Public endpoint: `https://calgary-live.seattle-live.workers.dev/live.json`,
which is what `city.js.liveUrls` points at. There is no GitHub Actions
workflow for the Worker; deployment is manual.
