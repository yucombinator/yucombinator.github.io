#!/usr/bin/env python3
"""Make the published service areas a clean partition so nothing is drawn twice.

The WUTC/Ecology polygons are authoritative but not topologically disjoint:
54 pairs overlap, several badly — Kittitas County PUD sits 43.5% inside Puget
Sound Energy's polygon, and half of Ellensburg is inside both PSE and Kittitas.
Left alone, whichever polygon draws last silently paints over its neighbour and
the shared border looks wrong.

Rule: draw smallest first, then subtract everything already placed, so a
specific operator keeps its own ground and the broad IOU sweep is trimmed back
around it. Drawing the other way round was measured and is wrong: it strips
Kittitas County PUD of 43% of its area to Puget Sound Energy, which is the
opposite of what the overlap means. The downloaded source is never modified —
the overlaps are reported, not hidden.
"""
import json
import os
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "data", "source", "wutc_ecology_service_areas.geojson")
CURATED = os.path.join(ROOT, "data", "service_areas_curated.geojson")
OUT = os.path.join(ROOT, "data", "boundaries.geojson")
MIN_AREA = 1e-6   # ~0.007 km2: drop sliver fragments, keep real pieces


def main():
    with open(SRC) as fh:
        src = json.load(fh)
    props_by_name = {}
    source_url = None
    if os.path.exists(CURATED):
        with open(CURATED) as fh:
            curated = json.load(fh)
        source_url = curated.get("source")
        props_by_name = {f["properties"]["official_name"]: f["properties"]
                         for f in curated["features"]}

    items = []
    for f in src["features"]:
        name = f["properties"].get("Name", "").strip()
        if not name:
            continue
        props = dict(props_by_name.get(name) or {})
        props.setdefault("id", name.lower().replace(" ", "_")[:40])
        props.setdefault("name", name)
        props["official_name"] = name
        items.append((name, shape(f["geometry"]), props))
    # smallest first: a specific operator outranks a broad sweep
    items.sort(key=lambda it: it[1].area)

    placed, cleaned, removed = None, [], []
    for name, geom, props in items:
        if placed is not None:
            overlap = geom.intersection(placed)
            if not overlap.is_empty and overlap.area > MIN_AREA:
                pct = 100 * overlap.area / geom.area
                if pct >= 0.5:
                    removed.append((name, overlap.area, pct))
                geom = geom.difference(placed)
        if geom.is_empty:
            continue
        placed = geom if placed is None else unary_union([placed, geom])
        for part in (list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]):
            if part.area < MIN_AREA:
                continue
            point = part.representative_point()
            out = dict(props)
            out["label_at"] = [round(point.y, 4), round(point.x, 4)]
            cleaned.append({
                "type": "Feature",
                "id": f"{props['id']}--{name}",
                "properties": out,
                "geometry": mapping(part),
            })

    with open(OUT, "w") as fh:
        json.dump({
            "type": "FeatureCollection",
            "source": source_url,
            "overlaps_removed": len(removed),
            "features": cleaned,
        }, fh)
    print(f"{len(cleaned)} polygons, {len(removed)} overlaps trimmed -> {OUT}")
    for name, area, pct in sorted(removed, key=lambda r: -r[2])[:8]:
        print(f"  {name:42.42s} gave up {pct:5.1f}% to a neighbour")


if __name__ == "__main__":
    main()
