#!/usr/bin/env python3
"""Build animation data for "Toronto in Motion" from every GTFS feed in the
Greater Golden Horseshoe + Waterloo region.

Output: ../data.json — routes, simplified shapes, one record per weekday trip,
and an activity histogram per mode. Coordinates are integer metres in a single
shared equirectangular projection.
"""
import csv
import json
import math
import os
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "gtfs")
OUT = os.path.abspath(os.path.join(HERE, "..", "data.json"))

TARGET_DAY = "2026-11-11"          # a regular Wednesday
TARGET_YMD = TARGET_DAY.replace("-", "")
DOW = "wednesday"

# Official TTC line colours; Lines 5 and 6 are coded as trams in the TTC feed.
TTC_LINES = {
    "1": ("subway", "f8c302"),
    "2": ("subway", "16a753"),
    "4": ("subway", "b32078"),
    "5": ("lrt", "f87005"),
    "6": ("lrt", "8a999a"),
}

# id, label, url, colour for local buses, and mode rules
FEEDS = [
    {
        "id": "ttc", "agency": "TTC",
        "url": "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
               "7795b45e-e65a-4465-81fc-c36b9dfff169/resource/"
               "cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip",
        "kind": "ttc",
    },
    {
        "id": "go", "agency": "GO",
        "url": "https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
        "kind": "go",
    },
    {
        "id": "up", "agency": "UP Express",
        "url": "https://assets.metrolinx.com/raw/upload/v1682367798/Documents/Metrolinx/Open%20Data/UP-GTFS.zip",
        "kind": "up",
    },
    {"id": "miway", "agency": "MiWay", "url": "https://www.miapp.ca/GTFS/google_transit.zip",
     "kind": "local", "color": "2f6fd0"},
    {"id": "brampton", "agency": "Brampton Transit",
     "url": "https://www.arcgis.com/sharing/rest/content/items/a355aabd5a8c490186bdce559c9c75fb/data",
     "kind": "local", "color": "e07b39"},
    {"id": "yrt", "agency": "YRT", "url": "https://www.yrt.ca/google/google_transit.zip",
     "kind": "local", "color": "8a4fb5"},
    {"id": "drt", "agency": "Durham RT", "url": "https://maps.durham.ca/OpenDataGTFS/GTFS_Durham_TXT.zip",
     "kind": "local", "color": "12a5b0"},
    {"id": "oakville", "agency": "Oakville Transit",
     "url": "https://www.arcgis.com/sharing/rest/content/items/d78a1c1ad6a940009de8b68839a8f606/data",
     "kind": "local", "color": "3f8f6b"},
    {"id": "burlington", "agency": "Burlington Transit",
     "url": "https://opendata.burlington.ca/gtfs-rt/GTFS_Data.zip",
     "kind": "local", "color": "c9a227"},
    {"id": "hsr", "agency": "HSR", "url": "https://opendata.hamilton.ca/GTFS-Static/google_transit.zip",
     "kind": "local", "color": "c2456b"},
    {"id": "grt_bus", "agency": "GRT",
     "url": "https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/1",
     "kind": "local", "color": "00838f"},
    {"id": "grt_lrt", "agency": "ION",
     "url": "https://webapps.regionofwaterloo.ca/api/grt-routes/api/staticfeeds/2",
     "kind": "lrt", "color": "00b3b0"},
    {"id": "guelph", "agency": "Guelph Transit",
     "url": "https://drive.usercontent.google.com/download?id=1SsCgQ0agO_EONavJoOuBPMlbcu2VcUs4&export=download",
     "kind": "local", "color": "8d6e63"},
    {"id": "barrie", "agency": "Barrie Transit",
     "url": "http://www.myridebarrie.ca/gtfs/Google_transit.zip",
     "kind": "local", "color": "546e7a"},
]

MODES = ("subway", "streetcar", "lrt", "gorail", "gobus", "localbus", "up")


def read_csv(path, name):
    with open(os.path.join(path, name), newline="", encoding="utf-8-sig") as fh:
        yield from csv.DictReader(fh)


def secs(hhmmss):
    h, m, s = hhmmss.strip().split(":")
    return int(h) * 3600 + int(m) * 60 + int(s)


def feed_dir(feed):
    """Download and unzip a feed if not cached."""
    path = os.path.join(CACHE, feed["id"])
    marker = os.path.join(path, ".ok")
    if os.path.exists(marker):
        return path
    os.makedirs(path, exist_ok=True)
    zip_path = os.path.join(CACHE, feed["id"] + ".zip")
    if not os.path.exists(zip_path):
        print(f"  ↓ {feed['id']} ({feed['url'][:60]}…)", file=sys.stderr)
        req = urllib.request.Request(feed["url"], headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp, open(zip_path, "wb") as out:
            while chunk := resp.read(1 << 20):
                out.write(chunk)
    try:
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(path)
    except zipfile.BadZipFile:
        print(f"  ! {feed['id']} did not return a zip", file=sys.stderr)
        return None
    open(marker, "w").close()
    return path


def active_services(path):
    """Service ids running on TARGET_DAY; fall back to the busiest service."""
    svc = set()
    cal = os.path.join(path, "calendar.txt")
    if os.path.exists(cal):
        for row in read_csv(path, "calendar.txt"):
            if row[DOW] == "1" and row["start_date"] <= TARGET_YMD <= row["end_date"]:
                svc.add(row["service_id"])
    if os.path.exists(os.path.join(path, "calendar_dates.txt")):
        for row in read_csv(path, "calendar_dates.txt"):
            if row["date"] == TARGET_YMD:
                if row["exception_type"] == "1":
                    svc.add(row["service_id"])
                elif row["exception_type"] == "2":
                    svc.discard(row["service_id"])
    if svc:
        return svc
    # fallback: the service with the most trips
    counts = {}
    for row in read_csv(path, "trips.txt"):
        sid = row.get("service_id")
        counts[sid] = counts.get(sid, 0) + 1
    if not counts:
        return set()
    best = max(counts, key=counts.get)
    print(f"  ! {os.path.basename(path)}: no service on {TARGET_DAY}, using {best}", file=sys.stderr)
    return {best}


def classify(feed, route_id, route_type):
    kind = feed["kind"]
    if kind == "ttc":
        if route_id in TTC_LINES:
            return TTC_LINES[route_id]
        if route_type == 0:
            return ("streetcar", "da251d")
        return ("localbus", "5aa9e6")
    if kind == "go":
        return ("gorail", "00853e") if route_type == 2 else ("gobus", "5aa93f")
    if kind == "up":
        return ("up", "3867d6")
    if kind == "lrt":
        return ("lrt", feed["color"])
    return ("localbus", feed["color"])


def dp(points, tol):
    """Douglas-Peucker on [(x, y)]."""
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


LAT0 = 43.70
KX = math.cos(math.radians(LAT0)) * 111_320.0
KY = 110_574.0

routes = {}          # "feed:route" -> meta
raw_shapes = {}      # (feed, shape_id) -> [(lat, lon)]
trips = []           # (feed, shape_key, t0, t1, route_key)
hist = {m: [0] * 144 for m in MODES}

for feed in FEEDS:
    path = feed_dir(feed)
    if not path:
        continue
    services = active_services(path)
    if not services:
        print(f"  ! {feed['id']}: no services", file=sys.stderr)
        continue

    # routes
    local_routes = {}
    for row in read_csv(path, "routes.txt"):
        rid = row["route_id"]
        rtype = int(row.get("route_type", 3))
        mode, color = classify(feed, rid, rtype)
        key = f"{feed['id']}:{rid}"
        local_routes[rid] = key
        routes[key] = {
            "s": row.get("route_short_name") or "",
            "l": row.get("route_long_name") or "",
            "m": mode,
            "c": color,
            "a": feed["agency"],
        }

    # trips on the target service day
    local_trips = {}
    for row in read_csv(path, "trips.txt"):
        if row["service_id"] not in services:
            continue
        rid = row["route_id"]
        if rid not in local_routes:
            continue
        key = f"{feed['id']}:{row['trip_id']}"
        local_trips[row["trip_id"]] = {
            "route": local_routes[rid],
            "shape": row.get("shape_id", ""),
            "t0": None,
            "t1": None,
        }

    # first/last stop time per trip
    st = os.path.join(path, "stop_times.txt")
    if os.path.exists(st):
        for row in read_csv(path, "stop_times.txt"):
            t = local_trips.get(row["trip_id"])
            if t is None:
                continue
            a = secs(row["arrival_time"])
            d = secs(row["departure_time"])
            if t["t0"] is None or d < t["t0"]:
                t["t0"] = d
            if t["t1"] is None or a > t["t1"]:
                t["t1"] = a

    # shapes
    shape_ids = {t["shape"] for t in local_trips.values() if t["shape"]}
    for row in read_csv(path, "shapes.txt"):
        sid = row["shape_id"]
        if sid in shape_ids:
            raw_shapes.setdefault((feed["id"], sid), []).append(
                (int(row["shape_pt_sequence"]), float(row["shape_pt_lat"]), float(row["shape_pt_lon"]))
            )

    kept = 0
    for tid, t in local_trips.items():
        if t["t0"] is None or not t["shape"]:
            continue
        t0 = max(0, min(86_399, t["t0"]))
        t1 = max(t0 + 30, min(86_400, t["t1"]))
        trips.append((feed["id"], t["shape"], t0, t1, t["route"]))
        kept += 1
        mode = routes[t["route"]]["m"]
        if mode not in hist:
            hist[mode] = [0] * 144
        for b in range(t0 // 600, min(143, (t1 - 1) // 600) + 1):
            lo = max(t0, b * 600)
            hi = min(t1, (b + 1) * 600)
            if hi > lo:
                hist[mode][b] += hi - lo
    print(f"  {feed['id']:10s} {kept:6d} trips  ({feed['agency']})", file=sys.stderr)

print(f"total trips: {len(trips)}  routes: {len(routes)}  shapes: {len(raw_shapes)}", file=sys.stderr)

# ---- project + simplify shapes
minx = miny = float("inf")
maxx = maxy = float("-inf")
projected = {}
for key, pts in raw_shapes.items():
    pts = sorted(pts)
    xy = [(lon * KX, lat * KY) for _, lat, lon in pts]
    clean = [xy[0]]
    for p in xy[1:]:
        if (p[0] - clean[-1][0]) ** 2 + (p[1] - clean[-1][1]) ** 2 >= 9:
            clean.append(p)
    simp = dp(clean, 30.0)
    if len(simp) > 80:
        step = len(simp) / 80.0
        simp = [simp[min(len(simp) - 1, int(i * step))] for i in range(80)]
    projected[key] = simp
    for x, y in simp:
        minx, maxx = min(minx, x), max(maxx, x)
        miny, maxy = min(miny, y), max(maxy, y)

shape_keys = sorted(projected)
shape_index = {k: i for i, k in enumerate(shape_keys)}
shapes = [[[round(x - minx), round(y - miny)] for x, y in projected[k]] for k in shape_keys]

route_keys = sorted(routes)
route_index = {k: i for i, k in enumerate(route_keys)}
route_out = {k: routes[k] for k in route_keys}

trip_out = [
    [shape_index[(fid, sid)], t0, t1, route_index[rk]]
    for fid, sid, t0, t1, rk in trips
    if (fid, sid) in shape_index
]

hist_out = {m: [round(v / 600.0, 1) for v in arr] for m, arr in hist.items() if any(arr)}

allxs = sorted(p[0] for s in shapes for p in s)
allys = sorted(p[1] for s in shapes for p in s)


def pct(arr, f):
    return arr[max(0, min(len(arr) - 1, int(len(arr) * f)))]


doc = {
    "city": "Greater Golden Horseshoe",
    "source": "GTFS feeds: TTC, GO, UP Express, MiWay, Brampton, YRT, Durham, Oakville, Burlington, HSR, GRT/ION, Guelph, Barrie (weekday of 2026-11-11)",
    "fit": [pct(allxs, 0.002), pct(allys, 0.002), pct(allxs, 0.998), pct(allys, 0.998)],
    "proj": {"lat0": LAT0, "kx": KX, "ky": KY, "x0": minx, "y0": miny},
    "routes": route_out,
    "shapes": shapes,
    "trips": trip_out,
    "hist": hist_out,
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, separators=(",", ":"))

print(
    f"wrote {OUT}  {os.path.getsize(OUT)/1e6:.2f} MB  "
    f"({len(shapes)} shapes, {sum(len(s) for s in shapes)} points)",
    file=sys.stderr,
)
