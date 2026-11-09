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
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "gtfs")
OUT = os.path.abspath(os.path.join(HERE, "..", "data.json"))

# Three service days, picked at build time: the most recent Wednesday (a plain
# weekday) plus the most recent Saturday and Sunday, so the run shows how
# weekend service thins out.
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def recent(weekday_index, today=None):
    today = today or date.today()
    return today - timedelta(days=(today.weekday() - weekday_index) % 7)


def day_spec(key, weekday_index):
    d = recent(weekday_index)
    noon = datetime(d.year, d.month, d.day, 12)
    tz = ZoneInfo("America/Toronto")
    return {
        "key": key,
        "dow": WEEKDAY_NAMES[weekday_index].lower(),
        "date": d,
        "ymd": d.strftime("%Y%m%d"),
        "iso": d.isoformat(),
        "label": f"{WEEKDAY_NAMES[weekday_index]} · {d.day} {MONTH_NAMES[d.month - 1]} {d.year}",
        "tz": noon.replace(tzinfo=tz).tzname(),
    }


DAY_SPECS = [
    day_spec("weekday", 2),    # most recent Wednesday
    day_spec("saturday", 5),
    day_spec("sunday", 6),
]

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
    # Metrolinx-hosted feeds for the fast-growing 905 fringes of the GGH
    {"id": "milton", "agency": "Milton Transit",
     "url": "https://metrolinx.tmix.se/gtfs/gtfs-milton.zip",
     "kind": "local", "color": "7fa650"},
    {"id": "simcoe", "agency": "Simcoe County LINX",
     "url": "https://metrolinx.tmix.se/gtfs/gtfs-simcoe.zip",
     "kind": "local", "color": "b06fd0"},
    {"id": "orangeville", "agency": "Orangeville Transit",
     "url": "https://metrolinx.tmix.se/gtfs/gtfs-orangeville.zip",
     "kind": "local", "color": "d0563a"},
    {"id": "kawartha", "agency": "Lindsay Transit",
     "url": "https://metrolinx.tmix.se/gtfs/gtfs-kawartha.zip",
     "kind": "local", "color": "4f8fd0"},
    # Niagara's official host redirects to a broken HTTPS endpoint; this is
    # the same GTFSExport bundle its own trip planner consumes.
    {"id": "niagara", "agency": "Niagara Region Transit",
     "url": "http://68.71.24.110/gtfs/GTFSExport.zip",
     "kind": "local", "color": "c04fa0"},
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


def active_services(path, spec, counts):
    """Service ids running on spec's date, with a like-for-like fallback."""
    svc = set()
    calendar = []
    cal = os.path.join(path, "calendar.txt")
    if os.path.exists(cal):
        calendar = list(read_csv(path, "calendar.txt"))
        for row in calendar:
            if row.get(spec["dow"]) == "1" and row["start_date"] <= spec["ymd"] <= row["end_date"]:
                svc.add(row["service_id"])
    if os.path.exists(os.path.join(path, "calendar_dates.txt")):
        for row in read_csv(path, "calendar_dates.txt"):
            if row["date"] == spec["ymd"]:
                if row["exception_type"] == "1":
                    svc.add(row["service_id"])
                elif row["exception_type"] == "2":
                    svc.discard(row["service_id"])
    if svc:
        return svc
    # The feed has no service on that date. If its calendar covers this
    # weekday in some other window (usually a stale or future board period),
    # borrow the busiest matching service; otherwise the agency really does
    # not run that day (e.g. Orangeville on Sunday) and the day is empty.
    if not counts:
        return set()
    same_dow = [r["service_id"] for r in calendar if r.get(spec["dow"]) == "1"]
    if not same_dow:
        return set()
    best = max(same_dow, key=lambda sid: counts.get(sid, 0))
    print(f"  ! {os.path.basename(path)}: no service on {spec['iso']}, "
          f"using {best}", file=sys.stderr)
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
day_trips = {spec["key"]: [] for spec in DAY_SPECS}   # (feed, shape, t0, t1, route)
day_hist = {spec["key"]: {m: [0] * 144 for m in MODES} for spec in DAY_SPECS}
shape_ids = set()

for feed in FEEDS:
    path = feed_dir(feed)
    if not path:
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

    # every trip in the feed, tagged with its service id (read once)
    local_trips = {}
    svc_counts = {}
    for row in read_csv(path, "trips.txt"):
        rid = row["route_id"]
        if rid not in local_routes:
            continue
        sid = row["service_id"]
        local_trips[row["trip_id"]] = {
            "route": local_routes[rid],
            "shape": row.get("shape_id", ""),
            "service": sid,
            "t0": None,
            "t1": None,
        }
        svc_counts[sid] = svc_counts.get(sid, 0) + 1

    # first/last stop time per trip
    st = os.path.join(path, "stop_times.txt")
    if os.path.exists(st):
        for row in read_csv(path, "stop_times.txt"):
            t = local_trips.get(row["trip_id"])
            if t is None:
                continue
            arr = secs(row["arrival_time"])
            dep = secs(row["departure_time"])
            if t["t0"] is None or dep < t["t0"]:
                t["t0"] = dep
            if t["t1"] is None or arr > t["t1"]:
                t["t1"] = arr

    for spec in DAY_SPECS:
        services = active_services(path, spec, svc_counts)
        hist = day_hist[spec["key"]]
        kept = 0
        for tid, t in local_trips.items():
            if t["service"] not in services:
                continue
            if t["t0"] is None or not t["shape"]:
                continue
            t0 = max(0, min(86_399, t["t0"]))
            t1 = max(t0 + 30, min(86_400, t["t1"]))
            day_trips[spec["key"]].append((feed["id"], t["shape"], t0, t1, t["route"]))
            shape_ids.add((feed["id"], t["shape"]))
            kept += 1
            mode = routes[t["route"]]["m"]
            for b in range(t0 // 600, min(143, (t1 - 1) // 600) + 1):
                lo = max(t0, b * 600)
                hi = min(t1, (b + 1) * 600)
                if hi > lo:
                    hist[mode][b] += hi - lo
        print(f"  {feed['id']:10s} {spec['key']:8s} {kept:6d} trips  ({feed['agency']})",
              file=sys.stderr)

    # shapes used by any of the three days
    wanted = {sid for fid, sid in shape_ids if fid == feed["id"]}
    if wanted:
        for row in read_csv(path, "shapes.txt"):
            sid = row["shape_id"]
            if sid in wanted:
                raw_shapes.setdefault((feed["id"], sid), []).append(
                    (int(row["shape_pt_sequence"]), float(row["shape_pt_lat"]),
                     float(row["shape_pt_lon"]))
                )

print(f"routes: {len(routes)}  shapes: {len(raw_shapes)}  "
      + "  ".join(f"{k}: {len(v)} trips" for k, v in day_trips.items()), file=sys.stderr)

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
    simp = dp(clean, 20.0)
    # Cap by length, not a flat 80 points: a 130 km GO bus shape squeezed
    # into 80 points was 1.7 km per segment and read as a jagged polygon.
    length = sum(((simp[i][0] - simp[i - 1][0]) ** 2 + (simp[i][1] - simp[i - 1][1]) ** 2) ** 0.5
                 for i in range(1, len(simp)))
    cap = max(80, min(700, int(length / 150) + 1))
    if len(simp) > cap:
        step = len(simp) / cap
        simp = [simp[min(len(simp) - 1, int(i * step))] for i in range(cap)]
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

days_out = {}
for spec in DAY_SPECS:
    key = spec["key"]
    days_out[key] = {
        "label": spec["label"],
        "date": spec["iso"],
        "tz": spec["tz"],
        "trips": [
            [shape_index[(fid, sid)], t0, t1, route_index[rk]]
            for fid, sid, t0, t1, rk in day_trips[key]
            if (fid, sid) in shape_index
        ],
        "hist": {
            m: [round(v / 600.0, 1) for v in arr]
            for m, arr in day_hist[key].items() if any(arr)
        },
    }

# The first day ships with the shared shapes/routes; the other two are fetched
# on demand so the initial page load stays close to one service day of trips.
BASE_KEY = DAY_SPECS[0]["key"]
for spec in DAY_SPECS[1:]:
    key = spec["key"]
    day_path = os.path.join(os.path.dirname(OUT), f"data-{key}.json")
    with open(day_path, "w", encoding="utf-8") as fh:
        json.dump(days_out[key], fh, separators=(",", ":"))
    print(f"wrote {day_path}  {os.path.getsize(day_path)/1e6:.2f} MB", file=sys.stderr)

days_out = {BASE_KEY: days_out[BASE_KEY]}

allxs = sorted(p[0] for s in shapes for p in s)
allys = sorted(p[1] for s in shapes for p in s)


def pct(arr, f):
    return arr[max(0, min(len(arr) - 1, int(len(arr) * f)))]


doc = {
    "city": "Greater Golden Horseshoe",
    "source": "GTFS feeds: " + ", ".join(f["agency"] for f in FEEDS)
              + " (" + ", ".join(spec["label"] for spec in DAY_SPECS) + ")",
    "fit": [pct(allxs, 0.002), pct(allys, 0.002), pct(allxs, 0.998), pct(allys, 0.998)],
    "proj": {"lat0": LAT0, "kx": KX, "ky": KY, "x0": minx, "y0": miny},
    "routes": route_out,
    "shapes": shapes,
    "days": days_out,
    "order": [spec["key"] for spec in DAY_SPECS],
}

with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(doc, fh, separators=(",", ":"))

print(
    f"wrote {OUT}  {os.path.getsize(OUT)/1e6:.2f} MB  "
    f"({len(shapes)} shapes, {sum(len(s) for s in shapes)} points)",
    file=sys.stderr,
)
