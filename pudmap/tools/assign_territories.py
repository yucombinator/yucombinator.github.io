#!/usr/bin/env python3
"""Approximate Washington utility territories: county clip + Voronoi partition.

Washington does not publish PUD service boundaries as open data. This builds an
honest geometric approximation instead of a raster one:

  * Each county is split by the perpendicular bisectors between the utility
    service centers that serve it (a Voronoi partition), so shared borders are
    straight lines and adjacent territories meet exactly with no seam.
  * A utility only claims ground within CLAIM_KM of its own center, and never
    past the midpoint to its nearest neighbour, so a small PUD town does not
    swallow the whole county.
  * Whatever is left over goes to the county's default supplier.
  * The union of all territories is exactly the county, so no sliver of
    basemap shows through at the seams.

The result is a "nearest service center" model, not a legal boundary map. It is
labelled as approximate in the UI, the README, and the GeoJSON properties.

Usage:
    /tmp/transitenv/bin/python tools/assign_territories.py
"""
import json
import math
import os
import sys

from shapely.geometry import LineString, MultiPoint, Point, shape, mapping
from shapely import voronoi_polygons
from shapely.ops import unary_union
from shapely.prepared import prep

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
COUNTIES = os.environ.get("PUD_COUNTIES", os.path.join(ROOT, "data", "us_counties.geojson"))
UTILITIES = os.path.join(ROOT, "data", "utilities.json")
CENTERS = os.path.join(ROOT, "data", "centers.json")
OUT = os.path.join(ROOT, "data", "boundaries.geojson")
CITY_BOUNDARIES = os.path.join(ROOT, "data", "boundaries", "municipal_boundaries.geojson")

CLAIM_KM = 45.0     # how far a service center reaches before the default takes over
SIMPLIFY = 0.0015   # degrees — trims float noise, keeps borders straight
KM_PER_DEG = 111.0


def haversine_km(a, b):
    lat1, lon1 = a
    lat2, lon2 = b
    dlat, dlon = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    h = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    return 2 * KM_PER_DEG * math.asin(math.sqrt(h))


def claim_radius(uid, center, rivals, limit_km):
    """Reach of a service center.

    The half-distance-to-nearest-neighbour rule is deliberately NOT used here.
    It collapses on real data: Snohomish PUD's office sits 0.7 km from a Puget
    Sound Energy office, and Chelan PUD and Cashmere Light are 14 km apart —
    either way half the distance erases a district that serves a real place.
    Instead every utility keeps the full county limit, and the Voronoi bisector
    between two centers is what splits the ground between them. A utility with
    no nearby rival still stops at `limit_km`, so it never swallows a county it
    only partly serves.

    `center` and the rival centers are (x, y) = (lon, lat) because that is what
    shapely uses; haversine_km wants (lat, lon), hence the swap.
    """
    return limit_km


def split_county(county, county_geom, candidates, default_uid, city_bounds=None):
    """Voronoi partition of one county, clipped to each public utility's reach.

    A utility with a real city boundary uses it verbatim — a municipal utility's
    service area is the city limit, so no radius, bisector or disc applies.
    """
    if not candidates:
        return [(default_uid, county_geom)]

    if city_bounds:
        pinned = []
        rest = []
        for uid, center in candidates:
            geom = city_bounds.get(uid)
            if geom is not None:
                city = shape(geom).intersection(county_geom)
                if not city.is_empty and city.area > 0:
                    pinned.append((uid, city))
                    continue
            rest.append((uid, center))
        if pinned:
            taken = unary_union([g for _, g in pinned])
            out = pinned + [(default_uid, county_geom.difference(taken))]
            return [(u, g) for u, g in out if not g.is_empty]
        candidates = rest

    # the default supplier is the county-wide fallback, not a rival to bisect
    publics = spread_coincident([(uid, c) for uid, c in candidates if uid != default_uid])
    if not publics:
        return [(default_uid, county_geom)]

    minx, miny, maxx, maxy = county_geom.bounds
    pad = max(maxx - minx, maxy - miny) * 1.5 + 5.0
    # Only the utility centers are seeds: the surrounding ring exists to give the
    # far field one enclosing cell, not to be bisected against.
    seeds = MultiPoint([Point(c) for _, c in publics])
    cells = voronoi_polygons(seeds, extend_to=county_geom.buffer(pad))
    polys = [p for p in getattr(cells, "geoms", cells) if p.geom_type == "Polygon"]

    def cell_for(point):
        # the cell that actually contains the center, else the nearest one
        for poly in polys:
            if poly.covers(point):
                return poly
        return min(polys, key=lambda p: p.distance(point))

    out = []
    taken = None
    for uid, center in publics:
        cell = cell_for(Point(center))
        radius = claim_radius(uid, center, publics, CLAIM_KM)
        if radius <= 0:
            continue
        disc = claim_shape(center, radius)
        claim = county_geom.intersection(cell).intersection(disc)
        if claim.is_empty or claim.area < county_geom.area * 1e-4:
            continue
        if taken is not None:
            claim = claim.difference(taken)      # never let two territories overlap
        taken = claim if taken is None else unary_union([taken, claim])
        out.append((uid, claim))

    # Whatever is left goes to the county's default supplier, minus anything a
    # county-wide claim already took. This keeps the partition strictly
    # disjoint: no territory overlaps another and no sliver of county is left
    # unpainted.
    claimed = unary_union([g for _, g in out]) if out else None
    leftover = county_geom.difference(claimed) if claimed is not None else county_geom
    if not leftover.is_empty and leftover.area > county_geom.area * 1e-5:
        out.append((default_uid, leftover))
    return out

def claim_shape(center, radius_km):
    """Service-area shape around a center: a rounded square, not a circle.

    A disc betrays itself as an obvious circle on a map, which reads as a
    drawing artifact rather than a boundary. A square with rounded corners is
    the shape people expect of a service territory, and the Voronoi bisector
    still cuts it against its neighbours.
    """
    half = radius_km / KM_PER_DEG
    return Point(center).buffer(half, quad_segs=6, cap_style=3, join_style=3)


def spread_coincident(publics):
    """Nudge apart centers that geocode to the same point.

    Port Angeles City Light and Clallam PUD are both in Port Angeles, so both
    geocode to the same coordinate. A Voronoi needs distinct seeds or one
    utility vanishes without a trace, so coincident centers are pushed apart
    along a small circle — enough to give each a real cell, far less than the
    distance to any other town.
    """
    nudged, seen = [], {}
    for uid, center in publics:
        key = (round(center[0], 4), round(center[1], 4))
        n = seen.get(key, 0)
        seen[key] = n + 1
        if n == 0:
            nudged.append((uid, center))
            continue
        angle = 2 * math.pi * n / 4
        nudged.append((uid, (center[0] + 0.14 * math.cos(angle),
                              center[1] + 0.14 * math.sin(angle))))
    return nudged


def main():
    with open(COUNTIES) as fh:
        counties = json.load(fh)
    with open(UTILITIES) as fh:
        roster = json.load(fh)
    with open(CENTERS) as fh:
        centers = json.load(fh)
    # Municipal utilities serve a city, not a radius around their office.
    # Without this, Seattle City Light's 45 km claim reached east over Bellevue,
    # which Puget Sound Energy actually serves.
    city_bounds = {}
    if os.path.exists(CITY_BOUNDARIES):
        with open(CITY_BOUNDARIES) as fh:
            city_bounds = json.load(fh)

    utils = {u["id"]: u for u in roster["utilities"]}
    by_county = {}
    for u in roster["utilities"]:
        for c in u["counties"]:
            by_county.setdefault(c, []).append(u["id"])
    default_by_county = roster.get("county_default", {})

    wa = {f["properties"]["NAME"]: shape(f["geometry"])
          for f in counties["features"] if f["id"].startswith("53")}

    # Build the partition county by county. Each county is divided once and the
    # pieces are recorded against a per-county "already taken" geometry, so no
    # territory can ever overlap another and no sliver of county is left bare.
    claims = []
    for county, county_geom in wa.items():
        candidates = []
        for uid in by_county.get(county, []):
            if uid in centers:
                # centers.json is [lat, lon]; shapely points are (x, y) = (lon, lat)
                lat, lon = centers[uid]
                candidates.append((uid, (lon, lat)))

        county_wide = [uid for uid, u in utils.items()
                       if u.get("county_wide") and county in u["counties"]]
        if county_wide:
            for uid in county_wide:
                claims.append((uid, county, county_geom))
            continue

        default_uid = default_by_county.get(county, "pse")
        if default_uid not in utils:
            default_uid = "pse"
        for uid, geom in split_county(county, county_geom, candidates, default_uid, city_bounds):
            if not geom.is_empty:
                claims.append((uid, county, geom))

    # A final snap: buffer/disc intersections leave sub-0.1% slivers where two
    # territories graze. Shrinking each piece by a sliver-sized buffer and
    # re-expanding it removes them, so the partition is visually seam-free.
    snap = 0.0002
    cleaned = []
    for uid, county, geom in claims:
        shrunk = geom.buffer(-snap).buffer(snap)
        if not shrunk.is_empty and shrunk.area > geom.area * 0.5:
            cleaned.append((uid, county, shrunk))
        else:
            cleaned.append((uid, county, geom))
    claims = cleaned

    features = []
    for uid, county, geom in claims:
        geom = geom.simplify(SIMPLIFY, preserve_topology=True)
        parts = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        for part in parts:
            if part.area < 1e-9 or not part.is_valid:
                continue
            point = part.representative_point()
            features.append({
                "type": "Feature",
                "id": f"{uid}--{county}",
                "properties": {
                    "id": uid,
                    "name": utils[uid]["name"],
                    "type": utils[uid]["type"],
                    "county": county,
                    "approximate": True,
                    "center": centers.get(uid, []),
                    # [lat, lon] to match centers.json, which Nominatim fills lat-first
                    "label_at": [round(point.y, 4), round(point.x, 4)],
                },
                "geometry": mapping(part),
            })

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump({"type": "FeatureCollection", "features": features}, fh)
    print(f"{len(features)} territory polygons covering "
          f"{len({f['properties']['id'] for f in features})} utilities -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
