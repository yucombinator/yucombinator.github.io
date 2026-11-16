"""Hand-built GTFS for the Calgary region's non-GTFS operators.

Calgary Transit is the only operator in the Calgary region that publishes a
GTFS feed. Airdrie Transit, Cochrane COLT, On-It Regional Transit and Roam
Transit publish PDF timetables only, so their routes are rebuilt here from the
published spans, headways and corridors.

Everything this module emits is an approximation: departures follow the
published headway across the published service span rather than a stop-by-stop
timetable, and stop times are spread by distance.
"""
import csv
import math
import os
import sys

DAYS = ("weekday", "saturday", "sunday")
DOW = {
    "weekday": ("monday", "tuesday", "wednesday", "thursday", "friday"),
    "saturday": ("saturday",),
    "sunday": ("sunday",),
}


def hm(value):
    """'05:30' -> 19800 seconds."""
    h, m = value.split(":")
    return int(h) * 3600 + int(m) * 60


def hhmmss(sec):
    sec = int(round(sec))
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


def km(a, b):
    r = 6371.0088
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp = p2 - p1
    dl = math.radians(b[1] - a[1])
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def stop_times(stops, run):
    """Spread the end-to-end run time over the stops by distance."""
    gaps = [km((a[1], a[2]), (b[1], b[2])) for a, b in zip(stops, stops[1:])]
    total = sum(gaps) or 1.0
    times, at = [], 0.0
    for gap in gaps:
        times.append(at)
        at += run * gap / total
    times.append(run)
    return times


def departures(span):
    """[first, last, headway] or an explicit list of HH:MM departures."""
    if not span:
        return []
    if isinstance(span, str):
        span = [span]
    if len(span) == 1 and isinstance(span[0], (list, tuple)):
        span = span[0]
    if len(span) == 3 and isinstance(span[2], (int, float)) and span[2] >= 60:
        first, last, headway = hm(span[0]), hm(span[1]), int(span[2])
        return list(range(first, last + 1, headway))
    return [hm(t) for t in span]


def write_feed(path, feed):
    """approx_writer hook: emit a minimal GTFS directory for one operator."""
    os.makedirs(path, exist_ok=True)
    routes, trips, stop_rows, shape_rows, st_rows = [], [], [], [], []
    seen_stops = set()

    for route in feed["routes"]:
        rid = route["id"]
        routes.append([rid, feed["id"], route.get("short", rid), route.get("long", ""),
                       route.get("type", 3), route.get("color", feed["color"]), "ffffff"])

        for direction, spec in enumerate(route["dirs"]):
            stops = [(name, lat, lon) for name, lat, lon in spec["stops"]]
            times = stop_times(stops, spec.get("run", route["run"]))
            for name, lat, lon in stops:
                sid = f"{rid}_{lat:.5f}_{lon:.5f}"
                if sid not in seen_stops:
                    seen_stops.add(sid)
                    stop_rows.append([sid, name, lat, lon])

            shape_id = f"{rid}_{direction}"
            for seq, (lat, lon) in enumerate(spec["path"], start=1):
                shape_rows.append([shape_id, lat, lon, seq])

            for day in DAYS:
                for at in departures(spec.get("span", {}).get(day)):
                    tid = f"{rid}_{day}_{direction}_{int(at)}"
                    trips.append([tid, rid, day, shape_id, direction, stops[-1][0]])
                    for seq, ((_, _, _), offset) in enumerate(zip(stops, times), start=1):
                        name, lat, lon = stops[seq - 1]
                        sid = f"{rid}_{lat:.5f}_{lon:.5f}"
                        clock = hhmmss(at + offset)
                        st_rows.append([tid, clock, clock, sid, seq])

    def write(name, header, rows):
        with open(os.path.join(path, name), "w", newline="", encoding="utf-8") as fh:
            out = csv.writer(fh)
            out.writerow(header)
            out.writerows(rows)

    write("agency.txt",
          ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
          [[feed["id"], feed["agency"], feed.get("url", ""), "America/Edmonton", "en"]])
    write("routes.txt",
          ["route_id", "agency_id", "route_short_name", "route_long_name",
           "route_type", "route_color", "route_text_color"], routes)
    write("trips.txt",
          ["trip_id", "route_id", "service_id", "shape_id", "direction_id", "trip_headsign"],
          trips)
    write("stop_times.txt",
          ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"], st_rows)
    write("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"], stop_rows)
    write("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
          shape_rows)
    write("calendar.txt",
          ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
           "saturday", "sunday", "start_date", "end_date"],
          [[day] + [1 if d in DOW[day] else 0 for d in
                    ("monday", "tuesday", "wednesday", "thursday", "friday",
                     "saturday", "sunday")] + ["20200101", "20500101"] for day in DAYS])
    open(os.path.join(path, ".ok"), "w").close()
    print(f"  ~ {feed['id']}: {len(feed['routes'])} routes, {len(trips)} trips", file=sys.stderr)


def build_feeds(cache):
    """Approximated operator feeds, each written through write_feed()."""
    import airdrie
    import cochrane
    import falcon
    import roam

    return [airdrie.feed(cache), cochrane.feed(cache), falcon.feed(cache),
            roam.feed(cache)]
