# Seattle live snapshot Worker

A keyless, 1-minute Cloudflare Worker that merges public GTFS-Realtime
vehicle-position feeds into the `live.json` shape used by the In Motion engine.

```
GET /live.json
{
  "generated": 1762400000000,
  "feeds": ["sound", "kcm", ...],
  "routes": ["puget:100479", ...],
  "v": [[routeIndex, lat, lon, bearing, timestampMs], ...]
}
```

## Sources (no keys)

- Sound Transit — `feeds.sound-transit.continuousgtfs.io/vehicle_positions.pb`
- King County Metro — `kcm-alerts-realtime-prod/vehiclepositions.pb`
- Community Transit — `commtrans-realtime-prod/vehiclepositions.pb`
- Kitsap Transit — `kttracker.com/gtfsrt/vehicles`
- Intercity Transit — `rideralerts` GTFS-Realtime

Pierce Transit's feed returns 401 without an API key, and Everett Transit's
vehicle entities carry no `route_id`; both stay on the scheduled layer. The
engine already treats live routes as an overlay: routes absent from the feed
keep their timetable arrows.

Route IDs were verified against `../data.json`: 100% of the live route IDs
matched `puget:<route_id>` for the five feeds above (~737 vehicles at test
time).

## Cache and latency

- HTTP: Cache API, 60 s TTL; a miss rebuilds from the five feeds.
- Cron: `* * * * *` warms the cache; Cloudflare scheduled invocations count as
  requests and run within the same 10 ms free CPU budget.
- Cache API is per-data-center; a request in another colo may rebuild once per
  60 s. At this traffic level that is negligible.
- Stale-while-error: if a rebuild fails, the last cached snapshot is served
  with `x-stale: 1`.

Measured parser CPU locally: ~1.9 ms for all five feeds (~75 KB), comfortably
inside the free plan's 10 ms cap.

## Cost

- **Workers Free + Cache API: $0** — 100k requests/day, 5 cron triggers,
  1,440 minutely runs (~43k/month), 10 ms CPU per invocation. No KV needed.
- Workers Paid: $5/month minimum (10M requests, 30M CPU-ms included) if the
  free CPU cap is ever exceeded.
- Avoid KV on Free: 1-minute writes = 1,440/day > the 1,000/day free write
  limit. R2 (free tier) or paid KV are alternatives if a durable snapshot is
  preferred over per-colo cache.

## Deploy

```bash
cd visualizations/seattle-in-motion/worker
bun install            # installs wrangler
npx wrangler login
npx wrangler deploy    # prints https://seattle-live.<account>.workers.dev
```

Then set `liveUrls: ["https://seattle-live.<account>.workers.dev/live.json"]`
and enable live mode in `seattle-in-motion/city.js` (client wiring is not done
yet). No Cloudflare secrets or API keys are involved.

## Tests

```bash
bun test
```

- parser/merge produces >100 vehicles and prefixed route keys
- every configured URL is HTTPS and contains no key/token
- handler serves CORS JSON and reuses the cached snapshot
- scheduled handler warms the cache
- >95% of live route IDs exist in the static Seattle payload
