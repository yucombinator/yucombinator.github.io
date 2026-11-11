#!/usr/bin/env python3
"""Shared In Motion build pipeline: GTFS feeds -> city data.json.

A city build supplies feeds, a classifier, timezone/projection and optional
extras; everything else (service days, frequencies, stops payloads, shape
simplification, dwell profiles, histograms) lives here.
"""
import csv
import json
import math
import os
import shutil
import sys
import urllib.request
import zipfile
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# Three service days, picked at build time: the most recent Wednesday (a plain
# weekday) plus the most recent Saturday and Sunday, so the run shows how
# weekend service thins out.
WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July",
               "August", "September", "October", "November", "December"]


def make_day_specs(cfg):
    """The three service days, picked in the city's local timezone."""
    tz = ZoneInfo(cfg["timeZone"])
    ref = cfg.get("referenceDate") or os.environ.get("MOTION_REFERENCE_DATE")
    today = date.fromisoformat(ref) if ref else datetime.now(tz).date()
    zone_label = cfg.get("zoneLabel", "PT")

    def one(key, weekday_index):
        d = today - timedelta(days=(today.weekday() - weekday_index) % 7)
        noon = datetime(d.year, d.month, d.day, 12)
        tzname = noon.replace(tzinfo=tz).tzname()
        return {
            "key": key,
            "dow": WEEKDAY_NAMES[weekday_index].lower(),
            "date": d,
            "ymd": d.strftime("%Y%m%d"),
            "iso": d.isoformat(),
            "label": f"{WEEKDAY_NAMES[weekday_index]} · {d.day} {MONTH_NAMES[d.month - 1]} {d.year}",
            "tz": tzname if zone_label == "auto" else zone_label,
        }

    return [one("weekday", 2), one("saturday", 5), one("sunday", 6)]


def sun_times(d, lat, lon, time_zone):
    """Local sunrise/sunset in seconds for the map's latitude/longitude."""
    tz = ZoneInfo(time_zone)
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


def feed_dir(feed, cache):
    """Download and unzip a feed if not cached; synthetic feeds may supply a writer."""
    path = os.path.join(cache, feed["id"])
    marker = os.path.join(path, ".ok")
    if os.path.exists(marker) and os.path.exists(os.path.join(path, "routes.txt")):
        return path
    if feed.get("approx_writer"):
        feed["approx_writer"](path, feed)
        if not (os.path.exists(marker)
                and os.path.exists(os.path.join(path, "routes.txt"))):
            raise RuntimeError(f"{feed['id']}: approx_writer produced no feed")
        return path
    os.makedirs(path, exist_ok=True)
    zip_path = os.path.join(cache, feed["id"] + ".zip")
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
    # Some agencies ship the GTFS files inside a dated top-level folder.
    if not os.path.exists(os.path.join(path, "routes.txt")):
        for entry in os.listdir(path):
            child = os.path.join(path, entry)
            if os.path.isdir(child) and os.path.exists(os.path.join(child, "routes.txt")):
                for name in os.listdir(child):
                    shutil.move(os.path.join(child, name), os.path.join(path, name))
                break
    open(marker, "w").close()
    return path


def read_csv(path, name):
    with open(os.path.join(path, name), newline="", encoding="utf-8-sig") as fh:
        yield from csv.DictReader(fh)


def secs(hhmmss):
    if not hhmmss or not hhmmss.strip():
        return None
    try:
        h, m, s = hhmmss.strip().split(":")
    except ValueError:
        return None
    return int(h) * 3600 + int(m) * 60 + int(s)



def hhmmss(sec):
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"



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
    exceptions = []
    if os.path.exists(os.path.join(path, "calendar_dates.txt")):
        exceptions = list(read_csv(path, "calendar_dates.txt"))
        for row in exceptions:
            if row["date"] == spec["ymd"]:
                if row["exception_type"] == "1":
                    svc.add(row["service_id"])
                elif row["exception_type"] == "2":
                    svc.discard(row["service_id"])
    if svc:
        return svc
    # Some boards (notably BC Transit's seasonal systems) publish no
    # calendar.txt at all: their whole schedule lives in calendar_dates.txt.
    # Borrow the services from the nearest date with the same weekday.
    if exceptions and counts:
        weekday = datetime.strptime(spec["ymd"], "%Y%m%d").date().weekday()
        by_date = {}
        for row in exceptions:
            if row["exception_type"] != "1":
                continue
            d = datetime.strptime(row["date"], "%Y%m%d").date()
            if d.weekday() == weekday:
                by_date.setdefault(d, set()).add(row["service_id"])
        ranked = sorted(by_date, key=lambda d: abs((d - spec["date"]).days))
        for pick in ranked:
            cand = by_date[pick]
            if sum(counts.get(sid, 0) for sid in cand):
                svc = cand
                print(f"  ! {os.path.basename(path)}: no service on {spec['iso']}, "
                      f"using {pick.isoformat()}", file=sys.stderr)
                break
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



def run(cfg):
    CACHE = cfg["cache"]
    FEEDS = cfg["feeds"]
    MODES = tuple(cfg["modes"])
    RAIL_MODES = set(cfg.get("railModes", ["subway", "lrt", "gorail", "up"]))
    DAY_SPECS = make_day_specs(cfg)
    LAT0 = cfg["lat0"]
    KX = math.cos(math.radians(LAT0)) * 111_320.0
    KY = 110_574.0
    OUT = cfg["out"]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    out_dir = os.path.dirname(OUT)


    routes = {}          # "feed:route" -> meta
    raw_shapes = {}      # (feed, shape_id) -> [(lat, lon)]
    dwell_raw = {}       # (feed, shape_id, stops) -> [(lat, lon), ...]
    trip_pattern = {}    # (feed, trip_id) -> dwell_raw key
    day_trips = {spec["key"]: [] for spec in DAY_SPECS}   # (feed, shape, t0, t1, route)
    trip_meta = {}        # (feed, trip) -> (shape, first_lat, first_lon, last_lat, last_lon)
    trip_times = {}       # (feed, trip) -> [(seq, stop_id, arrival, departure)]
    stop_meta_all = {}    # (feed, stop) -> (lat, lon)
    day_hist = {spec["key"]: {m: [0] * 144 for m in MODES} for spec in DAY_SPECS}
    shape_ids = set()

    for feed in FEEDS:
        path = feed_dir(feed, CACHE)
        if not path:
            continue

        agency_names = {}
        if feed.get("multi_agency"):
            apath = os.path.join(path, "agency.txt")
            if os.path.exists(apath):
                for row in read_csv(path, "agency.txt"):
                    agency_names[row["agency_id"]] = row.get("agency_name") or ""

        # routes
        local_routes = {}
        for row in read_csv(path, "routes.txt"):
            rid = row["route_id"]
            if feed.get("filter_routes"):
                name = row.get("route_long_name") or ""
                if not any(k.lower() in name.lower() for k in feed["filter_routes"]):
                    continue
            rtype = int(row.get("route_type", 3))
            agency = (agency_names.get(row.get("agency_id"), feed["agency"])
                  if feed.get("multi_agency") else feed["agency"])
            route_name = ((row.get("route_short_name") or "") + " "
                          + (row.get("route_long_name") or ""))
            cls = cfg["classify"](feed, rid, rtype, row.get("route_color", ""), agency, route_name,
                                  row.get("route_short_name") or "")
            if not cls:
                continue
            mode, color = cls
            key = f"{feed['id']}:{rid}"
            local_routes[rid] = key
            routes[key] = {
                "s": row.get("route_short_name") or "",
                "l": row.get("route_long_name") or "",
                "m": mode,
                "c": color,
                "a": agency,
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
                "first_stop": None,
                "last_stop": None,
                "first_seq": None,
                "last_seq": None,
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
                if arr is None or dep is None:
                    continue
                if t["t0"] is None or dep < t["t0"]:
                    t["t0"] = dep
                if t["t1"] is None or arr > t["t1"]:
                    t["t1"] = arr
                try:
                    seq = int(row["stop_sequence"])
                except (KeyError, ValueError):
                    seq = 0
                if t["first_stop"] is None or seq < t["first_seq"]:
                    t["first_stop"], t["first_seq"] = row.get("stop_id"), seq
                if t["last_stop"] is None or seq > t["last_seq"]:
                    t["last_stop"], t["last_seq"] = row.get("stop_id"), seq
                trip_times.setdefault((feed["id"], tid), []).append(
                    (seq, row.get("stop_id"), arr, dep))
                stop_counts[tid] = stop_counts.get(tid, 0) + 1

        # GTFS frequencies: the trip times are a template, not a single run.
        freqs = {}
        fp = os.path.join(path, "frequencies.txt")
        if os.path.exists(fp):
            for row in read_csv(path, "frequencies.txt"):
                freqs.setdefault(row["trip_id"], []).append(
                    (secs(row["start_time"]), secs(row["end_time"]),
                     max(60, int(row["headway_secs"]))))

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

        stop_meta = {}
        sp = os.path.join(path, "stops.txt")
        if os.path.exists(sp):
            for row in read_csv(path, "stops.txt"):
                stop_meta[row["stop_id"]] = (
                    float(row["stop_lat"]), float(row["stop_lon"]),
                    row.get("stop_name") or "",
                )
        for sid, meta in stop_meta.items():
            stop_meta_all[(feed["id"], sid)] = (meta[0], meta[1])
        for tid, t in local_trips.items():
            a = stop_meta.get(t.get("first_stop") or "")
            b = stop_meta.get(t.get("last_stop") or "")
            if a and b and t.get("shape"):
                trip_meta[(feed["id"], tid)] = (t["shape"], a[0], a[1], b[0], b[1])

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
            def emit(tid, t, start, end):
                # GTFS keeps overnight service on an extended clock. Clamping at 24:00 used to delete every trip that
                # starts after midnight, which emptied 00:00-05:00 on the map.
                t0 = max(0, start)
                t1 = max(t0 + 30, min(2 * 86_400, end))
                day_trips[spec["key"]].append((feed["id"], t["shape"], t0, t1, t["route"], tid))
                shape_ids.add((feed["id"], t["shape"]))
                mode = routes[t["route"]]["m"]
                for b in range(t0 // 600, (t1 - 1) // 600 + 1):
                    lo = max(t0, b * 600)
                    hi = min(t1, (b + 1) * 600)
                    if hi > lo:
                        hist[mode][b % 144] += hi - lo

            for tid, t in local_trips.items():
                if t["service"] not in services:
                    continue
                if t["t0"] is None or not t["shape"]:
                    continue
                if cfg.get("expandFrequencies", True) and tid in freqs:
                    # headway service: one arrow per departure, same template stops
                    dur = t["t1"] - t["t0"]
                    for start, end, headway in freqs[tid]:
                        at = start
                        while at < end:
                            emit(tid, t, at, at + dur)
                            kept += 1
                            at += headway
                    continue
                emit(tid, t, t["t0"], t["t1"])
                kept += 1
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



    if cfg.get("extras"):
        cfg["extras"]({
            "routes": routes, "raw_shapes": raw_shapes, "day_trips": day_trips,
            "day_hist": day_hist, "DAY_SPECS": DAY_SPECS, "MODES": MODES,
            "out_dir": out_dir, "shape_ids": shape_ids, "CACHE": CACHE,
        })

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

    # Short-turn trips reuse their route's full shape. Without trimming, the
    # animation starts them at the shape's endpoint and runs them over the
    # whole line, which is how a Spring District -> Redmond trip appeared to
    # fly from Lynnwood. Record the first/last stop fraction along the shape.
    trip_offsets = {}
    for (fid, tid), (shape_id, lat1, lon1, lat2, lon2) in trip_meta.items():
        pts = projected.get((fid, shape_id))
        if not pts or len(pts) < 2:
            continue
        cum = [0.0]
        for i in range(1, len(pts)):
            cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0],
                                            pts[i][1] - pts[i - 1][1]))
        total = cum[-1]
        if total <= 0:
            continue
        a = nearest_frac(pts, cum, total, lon1 * KX, lat1 * KY)
        b = nearest_frac(pts, cum, total, lon2 * KX, lat2 * KY)
        trip_offsets[(fid, tid)] = (round(a, 4), round(b, 4))

    # Actual stop-to-stop schedules, normalized per trip and deduplicated by
    # shape/stop pattern. This replaces the end-to-end + assumed-dwell model
    # whenever a complete stop_times profile exists.
    time_profiles = []
    time_profile_index = {}
    trip_time_profile = {}
    for (fid, tid), rows in trip_times.items():
        meta = trip_meta.get((fid, tid))
        if not meta or len(rows) < 2:
            continue
        shape_id = meta[0]
        pts = projected.get((fid, shape_id))
        if not pts or len(pts) < 2:
            continue
        rows = sorted(rows, key=lambda r: r[0])
        first_dep = rows[0][3]
        last_arr = rows[-1][2]
        if first_dep is None or last_arr is None or last_arr <= first_dep:
            continue
        total = last_arr - first_dep
        cum = [0.0]
        for i in range(1, len(pts)):
            cum.append(cum[-1] + math.hypot(pts[i][0] - pts[i - 1][0],
                                            pts[i][1] - pts[i - 1][1]))
        shape_total = cum[-1]
        if shape_total <= 0:
            continue
        pos, times = [], []
        for i, (seq, sid, arr, dep) in enumerate(rows):
            sm = stop_meta_all.get((fid, sid))
            if sm is None or arr is None or dep is None:
                pos, times = [], []
                break
            p = nearest_frac(pts, cum, shape_total, sm[1] * KX, sm[0] * KY)
            af = max(0.0, min(1.0, (arr - first_dep) / total))
            df = max(0.0, min(1.0, (dep - first_dep) / total))
            if i == 0:
                pos.append(round(p, 4)); times.append(0.0)
            else:
                pos.append(round(p, 4)); times.append(round(af, 5))
            if i < len(rows) - 1 and df > af + 0.00001:
                pos.append(round(p, 4)); times.append(round(df, 5))
        if len(pos) < 2:
            continue
        # Normalize the final arrival to exactly 1 and keep times monotonic.
        times[-1] = 1.0
        if any(times[i] < times[i - 1] for i in range(1, len(times))):
            continue
        sig = (shape_id, tuple(r[1] for r in rows))
        idx = time_profile_index.get(sig)
        if idx is None:
            idx = len(time_profiles)
            time_profile_index[sig] = idx
            time_profiles.append([pos, times])
        trip_time_profile[(fid, tid)] = idx

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
        trips_list, prof_list, start_list, end_list = [], [], [], []
        time_prof_list = []
        has_offsets = False
        has_time_profiles = False
        for fid, sid, t0, t1, rk, tid in day_trips[key]:
            if (fid, sid) not in shape_index:
                continue
            trips_list.append([shape_index[(fid, sid)], t0, t1, route_index[rk]])
            prof_list.append(profile_index.get(trip_pattern.get((fid, tid)), -1)
                             if tid is not None else -1)
            a, b = trip_offsets.get((fid, tid), (0.0, 1.0))
            start_list.append(a)
            end_list.append(b)
            tp = trip_time_profile.get((fid, tid), -1)
            time_prof_list.append(tp)
            if tp >= 0:
                has_time_profiles = True
            if a > 0.0001 or b < 0.9999:
                has_offsets = True
        days_out[key] = {
            "label": spec["label"],
            "date": spec["iso"],
            "tz": spec["tz"],
            "sun": sun_times(spec["date"], cfg["sun"][0], cfg["sun"][1], cfg["timeZone"]),
            "trips": trips_list,
            **({"tripStart": start_list, "tripEnd": end_list} if has_offsets else {}),
            **({"tripTimeProfile": time_prof_list} if has_time_profiles else {}),
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
        "city": cfg["city"],
        "built": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "GTFS feeds: " + ", ".join(f["agency"] for f in FEEDS)
                  + " (" + ", ".join(spec["label"] for spec in DAY_SPECS) + ")",
        "fit": [pct(allxs, 0.002), pct(allys, 0.002), pct(allxs, 0.998), pct(allys, 0.998)],
        "proj": {"lat0": LAT0, "kx": KX, "ky": KY, "x0": minx, "y0": miny},
        **({"timeProfiles": time_profiles} if time_profiles else {}),
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
