# Toronto live snapshot Worker

A keyless, one-minute Cloudflare Worker that merges public GTFS-Realtime
vehicle-position feeds into the `live.json` shape used by the In Motion engine.

```
GET /live.json
{
  "generated": 1762400000000,
  "feeds": ["ttc", "brampton", ...],
  "routes": ["ttc:1", "miway:1", ...],
  "v": [[routeIndex, lat, lon, bearing, timestampMs, "feed:vehicleId"], ...]
}
```

## Sources (no keys)

- TTC — `gtfsrt.ttc.ca/vehicles/position?format=binary`
- Brampton Transit — `gtfs-rt-merge.prod.bt-cadavl.com/.../merged_VehiclePosition.pb`
- Durham Region Transit — `drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions`
- MiWay — `miapp.ca/GTFS_RT/Vehicle/VehiclePositions.pb`
- York Region Transit — `rtu.york.ca/gtfsrealtime/VehiclePositions`
- Grand River Transit / ION — `vehiclepositions/1` and `/2`
- Hamilton Street Railway — `opendata.hamilton.ca/GTFS-RT/...`
- Guelph Transit — `glphprdtmgtfs.glphtrpcloud.com/...`
- Burlington Transit — `opendata.burlington.ca/gtfs-rt/...`
- Barrie Transit — `myridebarrie.ca/gtfs/GTFS_VehiclePositions.pb`

GO Transit/Metrolinx and UP Express require API access, and Oakville and the
remaining small agencies do not publish vehicle positions. They stay on the
scheduled layer; the client labels them `(scheduled)` on hover.

Route IDs were checked against `../data.json`: 525 live route IDs across 11
feeds, with only two unmatched route IDs (DRT 801 and YRT 81313), so coverage
is effectively complete for the feeds above (~3,280 vehicles at test time).

## Cache and latency

- HTTP: Cache API, 60 s TTL; a miss rebuilds from the feeds.
- Cron: `* * * * *` warms the cache.
- Cache API is per-data-center; a request in another colo may rebuild once per
  60 s.
- Stale-while-error: if a rebuild fails, the last cached snapshot is served
  with `x-stale: 1`.

The TTC protobuf alone parses in roughly 13 ms locally; with all 11 feeds the
build is near or above the Workers Free 10 ms CPU cap, so production may need
the flat **$5/month Workers Paid** plan if Cloudflare reports CPU-limit errors.

## Deploy

```bash
cd visualizations/toronto-in-motion/worker
bun install
npx wrangler login
npx wrangler deploy    # https://toronto-live.<account>.workers.dev
```

Then set `liveUrls: ["https://toronto-live.<account>.workers.dev/live.json"]`
in `toronto-in-motion/city.js`.

## Tests

```bash
bun test
```

- parser/merge produces live rows and prefixed route keys
- every configured URL is HTTPS and contains no key/token
- handler serves CORS JSON and reuses the cached snapshot
- scheduled handler warms the cache
- >93% of live route IDs exist in the static Toronto payload
