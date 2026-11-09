#!/usr/bin/env python3
"""Build animation data for "Toronto in Motion" from every GTFS feed in the
Greater Golden Horseshoe + Waterloo region.

Output: ../data.json — routes, simplified shapes, one record per weekday trip,
and an activity histogram per mode. Coordinates are integer metres in a single
shared equirectangular projection.
"""
import csv
import html as htmlmod
import json
import math
import os
import re
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


def toronto_today():
    # Service days are local dates; a 05:17 UTC cron is still the previous day
    # in Toronto, and choosing the weekday on the UTC date would skip ahead.
    return datetime.now(ZoneInfo("America/Toronto")).date()


def recent(weekday_index, today=None):
    today = today or toronto_today()
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


def sun_times(d, lat=43.6532, lon=-79.3832):
    """Local sunrise/sunset in seconds for the map's latitude/longitude."""
    tz = ZoneInfo("America/Toronto")
    off = datetime(d.year, d.month, d.day, 12, tzinfo=tz).utcoffset().total_seconds() / 3600
    n = d.timetuple().tm_yday
    b = math.radians(360 / 365 * (n - 81))
    eot = 9.87 * math.sin(2 * b) - 7.53 * math.cos(b) - 1.5 * math.sin(b)
    decl = math.radians(23.44 * math.sin(b))
    solar_noon = 720 - 4 * (lon - 15 * off) - eot
    cos_h = ((math.sin(math.radians(-0.833))
              - math.sin(math.radians(lat)) * math.sin(decl))
             / (math.cos(math.radians(lat)) * math.cos(decl)))
    if cos_h <= -1 or cos_h >= 1:
        return [0, 86400]
    h = math.degrees(math.acos(cos_h)) * 4
    return [int(max(0, min(86400, (solar_noon - h) * 60))),
            int(max(0, min(86400, (solar_noon + h) * 60)))]


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
    {"id": "orillia", "agency": "Orillia Transit",
     "url": "https://metrolinx.tmix.se/gtfs/gtfs-orillia.zip",
     "kind": "local", "color": "c26b3f"},
    # Small operator on the Transit app platform; the public GTFS URL carries
    # their feed token, so this can rot if Midland rotates it.
    {"id": "midpen", "agency": "Mid-Pen Transit",
     "url": "https://midland.usetransit.com/api/1/public/gtfs/2/gtfs.zip"
            "?token=64186b9ee7bea60d7638268206162c0c9c1a3f49e",
     "kind": "local", "color": "7b8f3a"},
    # Niagara's official host redirects to a broken HTTPS endpoint; this is
    # the same GTFSExport bundle its own trip planner consumes.
    {"id": "niagara", "agency": "Niagara Region Transit",
     "url": "http://68.71.24.110/gtfs/GTFSExport.zip",
     "kind": "local", "color": "c04fa0"},
]

MODES = ("subway", "streetcar", "lrt", "gorail", "gobus", "localbus", "up", "ferry")
RAIL_MODES = {"subway", "lrt", "gorail", "up"}


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


def classify(feed, route_id, route_type, route_color=""):
    kind = feed["kind"]
    if kind == "ttc":
        if route_id in TTC_LINES:
            return TTC_LINES[route_id]
        if route_type == 0:
            return ("streetcar", "da251d")
        return ("localbus", "5aa9e6")
    if kind == "go":
        # GO's own feed carries each corridor's colour (Lakeshore West crimson,
        # Kitchener green, Barrie navy, ...). Use it for trains; buses keep one
        # green so the bus network does not turn into confetti.
        if route_type == 2:
            return ("gorail", (route_color or "00853e").lstrip("#").lower())
        return ("gobus", "5aa93f")
    if kind == "up":
        return ("up", (route_color or "0075d2").lstrip("#").lower())
    if kind == "lrt":
        return ("lrt", feed["color"])
    return ("localbus", feed["color"])


def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp_ = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp_ / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def nearest_frac(xy, cum, total, px, py):
    """Fraction along a polyline of the closest point to (px, py)."""
    best, bf = float("inf"), 0.0
    for i in range(1, len(xy)):
        ax, ay = xy[i - 1]
        bx, by = xy[i]
        dx, dy = bx - ax, by - ay
        l2 = dx * dx + dy * dy or 1.0
        t = ((px - ax) * dx + (py - ay) * dy) / l2
        t = max(0.0, min(1.0, t))
        qx, qy = ax + t * dx, ay + t * dy
        d2 = (px - qx) ** 2 + (py - qy) ** 2
        if d2 < best:
            best = d2
            bf = (cum[i - 1] + t * (cum[i] - cum[i - 1])) / total
    return bf


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
dwell_raw = {}       # (feed, shape_id, stops) -> [(lat, lon), ...]
trip_pattern = {}    # (feed, trip_id) -> dwell_raw key
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
        mode, color = classify(feed, rid, rtype, row.get("route_color", ""))
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

    # first/last stop time per trip, plus a stop count so the stops payload can
    # use the fullest trip per route as its representative
    st = os.path.join(path, "stop_times.txt")
    stop_counts = {}
    if os.path.exists(st):
        for row in read_csv(path, "stop_times.txt"):
            tid = row["trip_id"]
            t = local_trips.get(tid)
            if t is None:
                continue
            arr = secs(row["arrival_time"])
            dep = secs(row["departure_time"])
            if t["t0"] is None or dep < t["t0"]:
                t["t0"] = dep
            if t["t1"] is None or arr > t["t1"]:
                t["t1"] = arr
            stop_counts[tid] = stop_counts.get(tid, 0) + 1

    # one representative trip per route: the one visiting the most stops
    rep_trip = {}
    for tid, n in stop_counts.items():
        t = local_trips.get(tid)
        if not t or not t["shape"]:
            continue
        route = t["route"]
        cur = rep_trip.get(route)
        if cur is None or n > stop_counts[cur]:
            rep_trip[route] = tid

    rail_trip_ids = {tid for tid, t in local_trips.items()
                     if routes.get(t["route"], {}).get("m") in RAIL_MODES}
    seq_ids = set(rep_trip.values()) | rail_trip_ids
    rep_seq = {tid: [] for tid in seq_ids}
    if rep_seq:
        for row in read_csv(path, "stop_times.txt"):
            tid = row["trip_id"]
            if tid in rep_seq:
                rep_seq[tid].append((int(row["stop_sequence"]), row["stop_id"]))

    # which shapes each route uses, for projecting its stops onto them
    route_shapes = {}
    for t in local_trips.values():
        if t["shape"]:
            route_shapes.setdefault(t["route"], set()).add(t["shape"])

    stop_meta = {}
    sp = os.path.join(path, "stops.txt")
    if os.path.exists(sp):
        for row in read_csv(path, "stops.txt"):
            stop_meta[row["stop_id"]] = (
                float(row["stop_lat"]), float(row["stop_lon"]),
                row.get("stop_name") or "",
            )

    # stops payload: a per-feed stop table plus a stop-index list per route
    feed_stops = {}
    feed_stop_index = {}
    feed_stop_rows = []
    for route_key, tid in rep_trip.items():
        seq = sorted(rep_seq.get(tid) or [])
        idxs = []
        last = None
        for _, sid in seq:
            meta = stop_meta.get(sid)
            if not meta or sid == last:
                continue
            last = sid
            si = feed_stop_index.get(sid)
            if si is None:
                si = len(feed_stop_rows)
                feed_stop_index[sid] = si
                feed_stop_rows.append([round(meta[0], 5), round(meta[1], 5), meta[2]])
            idxs.append(si)
        if len(idxs) >= 2:
            km = 0.0
            for a, b in zip(idxs, idxs[1:]):
                ka, kb = feed_stop_rows[a], feed_stop_rows[b]
                km += haversine_km(ka[0], ka[1], kb[0], kb[1])
            t = local_trips.get(tid) or {}
            run = max(0, (t.get("t1") or 0) - (t.get("t0") or 0))
            feed_stops[route_key.split(":", 1)[1]] = [idxs, round(km, 1), run]
    if feed_stops:
        out_path = os.path.join(os.path.dirname(OUT), f"stops-{feed['id']}.json")
        with open(out_path, "w", encoding="utf-8") as fh:
            json.dump({"s": feed_stop_rows, "r": feed_stops}, fh, separators=(",", ":"))
        print(f"  {feed['id']:10s} stops: {len(feed_stop_rows)} stops, "
              f"{len(feed_stops)} routes", file=sys.stderr)

    for spec in DAY_SPECS:
        services = active_services(path, spec, svc_counts)
        hist = day_hist[spec["key"]]
        kept = 0
        for tid, t in local_trips.items():
            if t["service"] not in services:
                continue
            if t["t0"] is None or not t["shape"]:
                continue
            # GTFS keeps overnight service on an extended clock (the TTC feed
            # runs to 30:00). Clamping at 24:00 used to delete every trip that
            # starts after midnight, which emptied 00:00-05:00 on the map.
            t0 = max(0, t["t0"])
            t1 = max(t0 + 30, min(2 * 86_400, t["t1"]))
            day_trips[spec["key"]].append((feed["id"], t["shape"], t0, t1, t["route"], tid))
            shape_ids.add((feed["id"], t["shape"]))
            kept += 1
            mode = routes[t["route"]]["m"]
            for b in range(t0 // 600, (t1 - 1) // 600 + 1):
                lo = max(t0, b * 600)
                hi = min(t1, (b + 1) * 600)
                if hi > lo:
                    hist[mode][b % 144] += hi - lo
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

    # Dwell inputs keyed by (shape, stop pattern): an express trip must not
    # inherit the local trip's stops on the same shape.
    for tid in rail_trip_ids:
        t = local_trips[tid]
        shape_id = t["shape"]
        seq = sorted(rep_seq.get(tid) or [])
        if not shape_id or len(seq) < 2:
            continue
        stops = tuple(sid for _, sid in seq)
        coords = []
        for sid in stops:
            meta = stop_meta.get(sid)
            if meta:
                coords.append((meta[0], meta[1]))
        if len(coords) < 2:
            continue
        key = (feed["id"], shape_id, stops)
        if key not in dwell_raw:
            dwell_raw[key] = coords
        trip_pattern[(feed["id"], tid)] = key


# --- Toronto Island Ferry -------------------------------------------------
# The City publishes the ferry timetable as HTML tables, one per route, and
# swaps them seasonally (summer adds Centre Island and Hanlan's Point). The
# build scrapes the page so the daily refresh tracks the season; the winter
# table below is only a fallback if the page cannot be parsed.
FERRY_PAGE = ("https://www.toronto.ca/explore-enjoy/toronto-island-ferries/"
              "ferry-routes-schedules/")
FERRY_CITY_TERMINAL = (43.64036, -79.37508)     # Jack Layton Ferry Terminal
FERRY_TERMINALS = {
    "centre island": ("CENTRE", "Centre Island", (43.62196, -79.37889)),
    "hanlan's point": ("HANLANS", "Hanlan's Point", (43.62789, -79.38907)),
    "ward's island": ("WARD", "Ward's Island", (43.63143, -79.35764)),
}
FERRY_FALLBACK = [("06:30", "06:45"), ("07:00", "07:15"), ("07:30", "07:45"),
                  ("08:15", "08:30"), ("09:00", "09:15"), ("09:30", "09:45"),
                  ("10:30", "10:45"), ("11:30", "11:45"), ("12:00", "12:15"),
                  ("12:30", "12:45"), ("13:30", "13:45"), ("14:00", "14:15"),
                  ("14:30", "14:45"), ("15:30", "15:45"), ("16:00", "16:15"),
                  ("16:30", "16:45"), ("17:30", "17:45"), ("18:00", "18:15"),
                  ("18:30", "18:45"), ("19:30", "19:45"), ("20:30", "20:45"),
                  ("21:30", "21:45"), ("22:30", "22:45"), ("23:00", "23:15"),
                  ("23:30", "23:45")]


def hhmm(value):
    h, m = value.split(":")
    return int(h) * 3600 + int(m) * 60


def ferry_clock(text):
    s = text.lower().replace("*", "").replace("\u202f", " ").strip()
    s = s.replace("noon", "12:00 p.m.").replace("midnight", "12:00 a.m.")
    m = re.search(r"(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m", s)
    if not m:
        return None
    h = int(m.group(1)) % 12
    if m.group(3) == "p":
        h += 12
    return h * 3600 + int(m.group(2) or 0) * 60


def parse_ferry_page(text):
    """Return {terminal_key: [(city_seconds, island_seconds), ...]}."""
    tokens = re.compile(r"<h[2-4][^>]*>([\s\S]*?)</h[2-4]>|<table[\s\S]*?</table>", re.I)
    heading = ""
    out = {}
    for m in tokens.finditer(text):
        tok = m.group(0)
        if tok.lower().startswith("<h"):
            heading = re.sub(r"\s+", " ",
                             htmlmod.unescape(re.sub(r"<[^>]+>", " ", m.group(1)))
                             ).strip().lower()
            heading = heading.replace("\u2019", "'").replace("\u2018", "'")
            continue
        key = next((k for k in FERRY_TERMINALS if k in heading), None)
        if not key:
            continue
        times = []
        for row in re.findall(r"<tr[\s\S]*?</tr>", tok, re.I):
            cells = [re.sub(r"\s+", " ",
                            htmlmod.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
                     for c in re.findall(r"<t[dh][^>]*>[\s\S]*?</t[dh]>", row, re.I)]
            cells = [c for c in cells if c]
            if len(cells) < 2:
                continue
            a, b = ferry_clock(cells[0]), ferry_clock(cells[1])
            if a is not None and b is not None:
                times.append((a, b))
        if len(times) >= 5:
            out[key] = times
    return out


def fetch_ferry_page():
    try:
        req = urllib.request.Request(FERRY_PAGE, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=45) as resp:
            return resp.read().decode("utf-8", "replace")
    except Exception as exc:                     # noqa: BLE001
        print(f"  ! ferry page: {type(exc).__name__}: {exc}", file=sys.stderr)
        return ""


ferry_schedule = parse_ferry_page(fetch_ferry_page())
if ferry_schedule:
    print(f"  ferry      timetable: {len(ferry_schedule)} route(s) from toronto.ca",
          file=sys.stderr)
else:
    ferry_schedule = {k: [(hhmm(a), hhmm(b)) for a, b in FERRY_FALLBACK]
                      for k in FERRY_TERMINALS if k == "ward's island"}
    print("  ! ferry: using the built-in winter timetable", file=sys.stderr)

ferry_stop_rows = [[round(FERRY_CITY_TERMINAL[0], 5), round(FERRY_CITY_TERMINAL[1], 5),
                    "Jack Layton Ferry Terminal"]]
ferry_stops = {}
for term, times in ferry_schedule.items():
    slug, label, dock = FERRY_TERMINALS[term]
    route_key = f"ferry:{slug}"
    routes[route_key] = {"s": label, "l": "Toronto Island Ferry", "m": "ferry",
                         "c": "1f8a9e", "a": "Toronto Island Ferry"}
    raw_shapes[("ferry", f"to-{slug}")] = [
        (1, FERRY_CITY_TERMINAL[0], FERRY_CITY_TERMINAL[1]),
        (2, dock[0], dock[1]),
    ]
    raw_shapes[("ferry", f"from-{slug}")] = [
        (1, dock[0], dock[1]),
        (2, FERRY_CITY_TERMINAL[0], FERRY_CITY_TERMINAL[1]),
    ]
    dock_idx = len(ferry_stop_rows)
    ferry_stop_rows.append([round(dock[0], 5), round(dock[1], 5), label])
    km = haversine_km(*FERRY_CITY_TERMINAL, *dock)
    ferry_stops[slug] = [[0, dock_idx], round(km, 1), 600]

    for spec in DAY_SPECS:
        hist = day_hist[spec["key"]]
        for city_dep, island_dep in times:
            for t0, shape in ((city_dep, f"to-{slug}"), (island_dep, f"from-{slug}")):
                t1 = t0 + 600
                day_trips[spec["key"]].append(("ferry", shape, t0, t1, route_key, None))
                for b in range(t0 // 600, (t1 - 1) // 600 + 1):
                    lo = max(t0, b * 600)
                    hi = min(t1, (b + 1) * 600)
                    if hi > lo:
                        hist["ferry"][b % 144] += hi - lo

with open(os.path.join(os.path.dirname(OUT), "stops-ferry.json"), "w",
          encoding="utf-8") as fh:
    json.dump({"s": ferry_stop_rows, "r": ferry_stops}, fh, separators=(",", ":"))
print(f"  ferry      stops: {len(ferry_stop_rows)} terminals, "
      f"{len(ferry_stops)} route(s)", file=sys.stderr)

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
    # Keep Douglas-Peucker's adaptive points. The old length-based cap
    # subsampled uniformly and threw away the very points DP had kept at
    # corners, which is what made the 506 cut across intersections. 12 m
    # tolerance instead of 20 m also keeps a tram visibly on its street.
    simp = dp(clean, 12.0)
    projected[key] = simp
    for x, y in simp:
        minx, maxx = min(minx, x), max(maxx, x)
        miny, maxy = min(miny, y), max(maxy, y)

shape_keys = sorted(projected)
shape_index = {k: i for i, k in enumerate(shape_keys)}

dwell_out = []
profile_index = {}
for key in sorted(dwell_raw):
    rows = dwell_raw[key]
    pts = projected.get(key[:2])
    if not pts or len(pts) < 2:
        continue
    cum = [0.0]
    for i in range(1, len(pts)):
        cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0],
                                        pts[i][1] - pts[i - 1][1]))
    total = cum[-1]
    if total <= 0:
        continue
    prof = sorted(nearest_frac(pts, cum, total, lon * KX, lat * KY)
                  for lat, lon in rows)
    clean = [prof[0]]
    for f in prof[1:]:
        if f > clean[-1] + 0.0005:
            clean.append(f)
    if len(clean) >= 2:
        profile_index[key] = len(dwell_out)
        dwell_out.append([round(f, 4) for f in clean])
shapes = [[[round(x - minx), round(y - miny)] for x, y in projected[k]] for k in shape_keys]

route_keys = sorted(routes)
route_index = {k: i for i, k in enumerate(route_keys)}
route_out = {k: routes[k] for k in route_keys}

days_out = {}
for spec in DAY_SPECS:
    key = spec["key"]
    trips_list, prof_list = [], []
    for fid, sid, t0, t1, rk, tid in day_trips[key]:
        if (fid, sid) not in shape_index:
            continue
        trips_list.append([shape_index[(fid, sid)], t0, t1, route_index[rk]])
        prof_list.append(profile_index.get(trip_pattern.get((fid, tid)), -1)
                         if tid is not None else -1)
    days_out[key] = {
        "label": spec["label"],
        "date": spec["iso"],
        "tz": spec["tz"],
        "sun": sun_times(spec["date"]),
        "trips": trips_list,
        "prof": prof_list,
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
    "built": datetime.now(ZoneInfo("America/Toronto")).isoformat(timespec="seconds"),
    "source": "GTFS feeds: " + ", ".join(f["agency"] for f in FEEDS)
              + " (" + ", ".join(spec["label"] for spec in DAY_SPECS) + ")",
    "fit": [pct(allxs, 0.002), pct(allys, 0.002), pct(allxs, 0.998), pct(allys, 0.998)],
    "proj": {"lat0": LAT0, "kx": KX, "ky": KY, "x0": minx, "y0": miny},
    "routes": route_out,
    "shapes": shapes,
    "dwell": dwell_out,
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
