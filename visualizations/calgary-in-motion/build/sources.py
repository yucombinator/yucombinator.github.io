"""Geometry helpers for the approximated regional feeds.

Airdrie publishes its route alignments and bus stops as ArcGIS GeoJSON even
though it publishes no GTFS. This module turns those layers into the polylines
and ordered stop lists the synthetic feed writer needs.
"""
import json
import math
import os
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " \
     "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"


def fetch_json(url, dest):
    """Download once into dest, then reuse the cached copy."""
    if os.path.exists(dest) and os.path.getsize(dest) > 1000:
        return json.load(open(dest, encoding="utf-8"))
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp, open(dest, "wb") as out:
        out.write(resp.read())
    return json.load(open(dest, encoding="utf-8"))


def metres(a, b):
    return math.hypot((a[0] - b[0]) * 110_574,
                      (a[1] - b[1]) * 111_320 * math.cos(math.radians(a[0])))


def dedupe(points, gap=6.0):
    out = [points[0]]
    for p in points[1:]:
        if metres(out[-1], p) >= gap:
            out.append(p)
    return out


def stitch(parts, gap=60.0):
    """Join MultiLineString parts end-to-end into one polyline."""
    parts = [list(p) for p in parts if len(p) > 1]
    if not parts:
        return []
    parts.sort(key=len, reverse=True)
    chain = parts.pop(0)
    while parts:
        tail = chain[-1]
        best = None
        for index, part in enumerate(parts):
            for flip in (False, True):
                cand = part[::-1] if flip else part
                d = metres(tail, cand[0])
                if best is None or d < best[0]:
                    best = (d, index, cand)
        d, index, cand = best
        if d > gap:
            # Disconnected remainder (a detour that doubles back); drop it
            # rather than draw a straight line across the city.
            parts.pop(index)
            continue
        chain.extend(cand[1:])
        parts.pop(index)
    return dedupe(chain)


def read_lines(collection):
    """{name: [{dir, path}]} from an ArcGIS line layer."""
    out = {}
    for feature in collection["features"]:
        props = feature["properties"]
        name = props.get("SHAPE_NAME") or props.get("Name") or props.get("name")
        if not name:
            continue
        geom = feature["geometry"]
        kind = geom["type"]
        raw_parts = [geom["coordinates"]] if kind == "LineString" else geom["coordinates"]
        parts = [[(lat, lon) for lon, lat in part] for part in raw_parts]
        out.setdefault(name, []).append({
            "dir": (props.get("SHAPE_DIR") or "").lower(),
            "path": stitch(parts),
        })
    return out


def read_points(collection):
    out = []
    for feature in collection["features"]:
        props = feature["properties"]
        name = props.get("stop_name") or props.get("stopname") or props.get("Name")
        lat = props.get("stop_lat", props.get("LAT"))
        lon = props.get("stop_lon", props.get("LON"))
        if name and lat is not None and lon is not None:
            out.append(((name or "").strip(), float(lat), float(lon)))
    return out


def cum(path):
    total = [0.0]
    for a, b in zip(path, path[1:]):
        total.append(total[-1] + metres(a, b))
    return total


def read_gtfs_routes(zip_url, dest_dir):
    """Per-route geometry and stop sequence from a published GTFS zip.

    Roam's last GTFS feed (July 2024) is used for alignments only: its
    timetables are years out of date, but the corridors in Banff and Canmore
    have not moved, and the current PDF timetables are used for the times.
    """
    import csv
    import io
    import zipfile

    Path = __import__("pathlib").Path
    dest = Path(dest_dir)
    dest.mkdir(parents=True, exist_ok=True)
    zip_path = dest / "feed.zip"
    if not zip_path.exists() or zip_path.stat().st_size < 1000:
        req = urllib.request.Request(zip_url, headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=120) as resp, open(zip_path, "wb") as out:
            out.write(resp.read())

    with zipfile.ZipFile(zip_path) as zf:
        def rows(name):
            with zf.open(name) as fh:
                return list(csv.DictReader(io.TextIOWrapper(fh, encoding="utf-8-sig")))

        routes = {r["route_id"]: r for r in rows("routes.txt")}
        stops = {s["stop_id"]: (s["stop_name"], float(s["stop_lat"]), float(s["stop_lon"]))
                 for s in rows("stops.txt")}
        trips = rows("trips.txt")
        stop_times = rows("stop_times.txt")
        shapes = {}
        for s in rows("shapes.txt"):
            shapes.setdefault(s["shape_id"], []).append(
                (int(s["shape_pt_sequence"]), float(s["shape_pt_lat"]), float(s["shape_pt_lon"])))

    by_trip = {}
    for row in stop_times:
        by_trip.setdefault(row["trip_id"], []).append(
            (int(row["stop_sequence"]), row["stop_id"]))
    best = {}
    for trip in trips:
        rid = trip["route_id"]
        seq = sorted(by_trip.get(trip["trip_id"], []))
        if rid not in best or len(seq) > len(best[rid][1]):
            best[rid] = (trip.get("shape_id"), seq)

    out = {}
    for rid, (shape_id, seq) in best.items():
        pts = sorted(shapes.get(shape_id, []))
        path = [(lat, lon) for _, lat, lon in pts]
        stop_list = [stops[sid] for _, sid in seq if sid in stops]
        if len(path) > 1 and stop_list:
            out[rid] = {
                "name": routes[rid].get("route_long_name") or routes[rid].get("route_short_name"),
                "short": routes[rid].get("route_short_name") or rid,
                "color": (routes[rid].get("route_color") or "").lstrip("#").lower(),
                "path": path,
                "stops": stop_list,
            }
    return out


def snap_stops(path, stops, tolerance=90.0):
    """Order official stops along the path, keeping only those on it."""
    lat0 = sum(p[0] for p in path) / len(path)
    kx = 111_320 * math.cos(math.radians(lat0))
    ky = 110_574

    def xy(lat, lon):
        return lon * kx, lat * ky

    total = cum(path)
    hits = []
    for name, lat, lon in stops:
        px, py = xy(lat, lon)
        best = None
        for i in range(len(path) - 1):
            ax, ay = xy(*path[i])
            bx, by = xy(*path[i + 1])
            dx, dy = bx - ax, by - ay
            seg = dx * dx + dy * dy
            t = 0.0 if seg == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg))
            qx, qy = ax + t * dx, ay + t * dy
            d = math.hypot(px - qx, py - qy)
            if best is None or d < best[0]:
                best = (d, total[i] + t * (total[i + 1] - total[i]))
        if best and best[0] <= tolerance:
            hits.append((best[1], name, lat, lon))
    hits.sort()
    seen, out = set(), []
    for _, name, lat, lon in hits:
        key = name.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append((name, lat, lon))
    return out
