#!/usr/bin/env python3
"""Build compact animation data for "Toronto in Motion" from TTC GTFS.

Output: ../data.json  (routes, simplified shapes, one record per weekday trip,
and an activity histogram per mode). All coordinates are integer metres in a
local equirectangular projection.
"""
import csv
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GTFS = os.path.join(HERE, "gtfs")
OUT = os.path.abspath(os.path.join(HERE, "..", "data.json"))

# A representative regular weekday (Wednesday) inside the calendar window.
TARGET_DAY = "2026-11-11"
DOW = "wednesday"

MODE_NAMES = {0: "streetcar", 1: "subway", 2: "rail", 3: "bus"}


GTFS_URL = (
    "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
    "7795b45e-e65a-4465-81fc-c36b9dfff169/resource/"
    "cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip"
)


def ensure_gtfs():
    """Download and unzip the TTC feed if build/gtfs is missing."""
    if os.path.isdir(GTFS) and os.listdir(GTFS):
        return
    import urllib.request
    import zipfile

    os.makedirs(GTFS, exist_ok=True)
    zip_path = os.path.join(HERE, "ttc.zip")
    if not os.path.exists(zip_path):
        print("downloading TTC GTFS…", file=sys.stderr)
        urllib.request.urlretrieve(GTFS_URL, zip_path)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(GTFS)


def read_csv(name):
    with open(os.path.join(GTFS, name), newline="", encoding="utf-8-sig") as fh:
        yield from csv.DictReader(fh)


def secs(hhmmss):
    h, m, s = hhmmss.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def weekday_services():
    svc = set()
    for row in read_csv("calendar.txt"):
        if row[DOW] == "1" and row["start_date"] <= TARGET_DAY.replace("-", "") <= row["end_date"]:
            svc.add(row["service_id"])
    for row in read_csv("calendar_dates.txt"):
        if row["date"] == TARGET_DAY.replace("-", ""):
            if row["exception_type"] == "1":
                svc.add(row["service_id"])
            elif row["exception_type"] == "2":
                svc.discard(row["service_id"])
    return svc


def dp(points, tol):
    """Douglas-Peucker on a list of (x, y)."""
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best_i, best_d = -1, tol * tol
        for i in range(a + 1, b):
            px, py = points[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = max(0.0, min(1.0, t))
                qx, qy = ax + t * dx, ay + t * dy
                d2 = (px - qx) ** 2 + (py - qy) ** 2
            if d2 > best_d:
                best_i, best_d = i, d2
        if best_i >= 0:
            keep[best_i] = True
            stack.append((a, best_i))
            stack.append((best_i, b))
    return [p for p, k in zip(points, keep) if k]


def main():
    ensure_gtfs()
    services = weekday_services()
    print(f"weekday services: {len(services)}", file=sys.stderr)

    routes = {}
    for row in read_csv("routes.txt"):
        rt = int(row["route_type"])
        routes[row["route_id"]] = {
            "s": row.get("route_short_name") or "",
            "l": row.get("route_long_name") or "",
            "m": MODE_NAMES.get(rt, "other"),
        }
    print(f"routes: {len(routes)}", file=sys.stderr)

    # --- trips for the target service day
    trips = {}
    shapes_used = set()
    for row in read_csv("trips.txt"):
        if row["service_id"] not in services:
            continue
        if row["route_id"] not in routes:
            continue
        trips[row["trip_id"]] = {
            "route": row["route_id"],
            "shape": row.get("shape_id", ""),
            "t0": None,
            "t1": None,
        }
        if row.get("shape_id"):
            shapes_used.add(row["shape_id"])
    print(f"trips on {TARGET_DAY}: {len(trips)}  shapes: {len(shapes_used)}", file=sys.stderr)

    # --- first/last stop time per trip
    n = 0
    for row in read_csv("stop_times.txt"):
        t = trips.get(row["trip_id"])
        if t is None:
            continue
        a = secs(row["arrival_time"])
        d = secs(row["departure_time"])
        if t["t0"] is None or d < t["t0"]:
            t["t0"] = d
        if t["t1"] is None or a > t["t1"]:
            t["t1"] = a
        n += 1
    print(f"stop_times rows used: {n}", file=sys.stderr)

    # --- shapes
    # A handful of TTC shape points sit far outside the city (bad coordinates
    # in the feed). Drop anything outside a generous Toronto envelope.
    LAT_MIN, LAT_MAX = 43.55, 43.92
    LON_MIN, LON_MAX = -79.70, -79.10
    raw_shapes = {}
    dropped = 0
    for row in read_csv("shapes.txt"):
        sid = row["shape_id"]
        if sid not in shapes_used:
            continue
        lat, lon = float(row["shape_pt_lat"]), float(row["shape_pt_lon"])
        if not (LAT_MIN <= lat <= LAT_MAX and LON_MIN <= lon <= LON_MAX):
            dropped += 1
            continue
        raw_shapes.setdefault(sid, []).append(
            (int(row["shape_pt_sequence"]), lat, lon)
        )
    raw_shapes = {k: v for k, v in raw_shapes.items() if len(v) >= 2}
    print(f"shape points dropped as out-of-bounds: {dropped}", file=sys.stderr)
    print(f"shapes loaded: {len(raw_shapes)}", file=sys.stderr)

    lat0 = 43.70
    kx = math.cos(math.radians(lat0)) * 111_320.0
    ky = 110_574.0

    def project(lat, lon):
        return lon * kx, lat * ky

    # bounds first, to emit integer metres relative to min
    minx = miny = float("inf")
    for pts in raw_shapes.values():
        for _, lat, lon in pts:
            x, y = project(lat, lon)
            minx, miny = min(minx, x), min(miny, y)

    shape_ids = sorted(raw_shapes)
    shape_index = {sid: i for i, sid in enumerate(shape_ids)}
    shapes = []
    for sid in shape_ids:
        pts = sorted(raw_shapes[sid])
        xy = [project(lat, lon) for _, lat, lon in pts]
        # de-duplicate consecutive points closer than 3 m
        clean = [xy[0]]
        for p in xy[1:]:
            if (p[0] - clean[-1][0]) ** 2 + (p[1] - clean[-1][1]) ** 2 >= 9:
                clean.append(p)
        simp = dp(clean, 25.0)
        if len(simp) > 90:
            step = len(simp) / 90.0
            simp = [simp[min(len(simp) - 1, int(i * step))] for i in range(90)]
        shapes.append([[round(x - minx), round(y - miny)] for x, y in simp])
    print(
        f"points: {sum(len(s) for s in shapes)} (raw {sum(len(v) for v in raw_shapes.values())})",
        file=sys.stderr,
    )

    # --- trip records and histogram
    recs = []
    hist = {m: [0] * 144 for m in ("streetcar", "subway", "rail", "bus", "other")}
    for tid, t in trips.items():
        if t["t0"] is None or not t["shape"]:
            continue
        t0 = max(0, min(86_399, t["t0"]))
        t1 = max(t0 + 30, min(86_400, t["t1"]))
        mode = routes[t["route"]]["m"]
        recs.append([shape_index[t["shape"]], t0, t1, t["route"]])
        # histogram: count trip-minutes falling into each 10-minute bucket
        start_b = t0 // 600
        end_b = (t1 - 1) // 600
        for b in range(start_b, min(143, end_b) + 1):
            lo = max(t0, b * 600)
            hi = min(t1, (b + 1) * 600)
            if hi > lo:
                hist[mode][b] += hi - lo
    print(f"trip records: {len(recs)}", file=sys.stderr)

    hist_minutes = {
        m: [round(v / 600.0, 1) for v in arr] for m, arr in hist.items() if any(arr)
    }

    # fit box: 0.5th–99.5th percentile of all shape points, so a handful of
    # far-flung shapes don't shrink the map
    allxs = sorted(p[0] for shp in shapes for p in shp)
    allys = sorted(p[1] for shp in shapes for p in shp)
    def pct(arr, f):
        return arr[max(0, min(len(arr) - 1, int(len(arr) * f)))]
    doc = {
        "city": "Toronto",
        "proj": {"lat0": lat0, "kx": kx, "ky": ky, "x0": minx, "y0": miny},
        "fit": [pct(allxs, 0.005), pct(allys, 0.005), pct(allxs, 0.995), pct(allys, 0.995)],
        "source": "TTC GTFS (Open Data, City of Toronto), weekday of 2026-11-11",
        "bbox": [0, 0, round(max(max(p[0] for p in s) for s in shapes)), 0],
        "routes": routes,
        "shapes": shapes,
        "trips": recs,
        "hist": hist_minutes,
    }
    # height from data
    doc["bbox"][3] = max(max(p[1] for p in s) for s in shapes)

    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"wrote {OUT}  {os.path.getsize(OUT)/1e6:.2f} MB", file=sys.stderr)


if __name__ == "__main__":
    main()
