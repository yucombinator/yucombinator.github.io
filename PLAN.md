# Future transit alignments — sourcing plan

This note records how the `future` layer gets its geometry. Future projects are
not in GTFS or GTFS-Realtime, so their alignments, headways and opening dates are
curated. The layer is opt-in (`Future` legend toggle) and uses one ghost color.

## Data shape

Each city's `city.js` has a `future` array:

```js
{
  id: "ontario-line",
  name: "Ontario Line",
  mode: "train" | "lrt" | "brt",
  modeLabel: "Subway",
  status: "under construction" | "in design" | "planned",
  opening: "2031 target" | "TBD",
  headwayMin: 3,
  travelMin: 35,
  shape: [[lon, lat], ...]
}
```

Only train, LRT and BRT projects belong here. The renderer uses a uniform ghost
line, dashed casing, and moving arrows at the stated headway. Future projects do
not enter service counts or live fallback logic.

## Source priority

1. **OpenStreetMap railway construction/proposed alignment** for rail projects.
2. **Agency project pages / GIS** when OSM has no usable mapped alignment.
3. **Existing GTFS route shape** when the future service follows an existing
   corridor (for example, Stride buses on I-405/SR 522).
4. **Manual station/bridge waypoints** only as a last resort, clearly treated as
   a planning approximation.

## OSM railway query

Use a bounding box around the city and extract ways plus relations:

```overpass
[out:json][timeout:180];
(
  way["railway"="construction"](SOUTH,WEST,NORTH,EAST);
  way["railway"="proposed"](SOUTH,WEST,NORTH,EAST);
  relation["railway"="construction"](SOUTH,WEST,NORTH,EAST);
  relation["railway"="proposed"](SOUTH,WEST,NORTH,EAST);
);
out tags geom;
```

Examples that worked:

- Toronto: `43.2,-80.0,44.0,-79.0` — Ontario Line, Scarborough, Eglinton West,
  Yonge North, Hamilton LRT, Hurontario LRT.
- Vancouver: `49.0,-123.3,49.35,-122.5` — Surrey Langley SkyTrain.
- Seattle: `47.0,-122.6,48.2,-121.9` — Tacoma Dome Link Extension. OSM does not
  currently have usable mapped West Seattle/Ballard/Everett Link alignments.

Named ways are also useful:

```overpass
way["name"="Broadway Extension"](49.2,-123.25,49.3,-123.0);
out tags geom;
```

## Turning OSM ways into one line

OSM usually splits a project into many ways and has both travel directions.
Build a graph from way endpoints, find the shortest path between the nearest
endpoints to the project's start and end, concatenate the way geometry, then
simplify with Douglas–Peucker at ~10–12 m. Discard duplicate reverse-direction
ways. Validate:

- first/last points are at the intended terminals;
- the line does not cross water or unrelated corridors;
- the line is continuous with no large jumps;
- `[[lon,lat], ...]` order, 6 decimal places.

The helper used during this work lives in `/tmp/osm_shape.py` in the session
history; reproduce the same graph + `dp(points, 10)` logic if needed.

## When OSM has no rail alignment

- **Stride BRT (Seattle):** use the existing GTFS shapes for Sound Transit 535
  (Lynnwood–Bellevue), 560 (Bellevue–Burien), and 522 (Lake City–Bothell).
- **West Seattle Link:** station/bridge waypoints from Sound Transit planning
  documents; treat as approximate until agency GIS is imported.
- **Everett Link:** use the 512 GTFS shape along I-5.
- **BRT on roads:** use OSM road ways by `ref`/name or an existing bus route
  shape; do not use railway geometry.

## Dates and frequencies

Opening values are **targets**, not guarantees. Use `"TBD"` when an agency has
not committed to a date. Frequencies are approximate headways used only for the
ghost animation; label them simply as “headway”, not “inferred”.

## Adding a project

1. Add/verify the project status and target on the agency page.
2. Source the alignment with the priority order above.
3. Insert the project in the city's `future` array.
4. Run `python3 _shared/stamp_version.py` and `python3 tests/check_configs.py`.
5. Open the city locally, toggle **Future**, and verify:
   - line follows the corridor and does not enter water;
   - arrows animate at the stated headway;
   - hover shows status, target, and headway;
   - default toggle remains off.
6. Commit; deploy only after review.

## Bay Area note

For the new San Francisco/Bay Area city, use Muni, BART and Caltrain GTFS as the
initial executable schedule. Future alignments are not part of this first build;
if future projects are added, follow the same source and validation rules.
