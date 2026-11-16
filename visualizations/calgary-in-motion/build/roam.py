"""Roam Transit (Banff and Canmore), rebuilt from the operator's own material.

Roam's last published GTFS feed is dated 25 July 2024 and its service ended
2024-12-31, so it cannot drive a 2026 animation. Its alignments and stop
sequences are still right for the Bow Valley corridors, so they are used for
geometry only; spans and headways come from the fall/winter 2026 timetables
(effective 2026-09-28), cross-checked against the October 2026 board report
("service every 25 minutes" on 1 and 2, "approximately every 40 minutes,
6:30 a.m. to 9 p.m." on 7, "every 30 minutes" on 12).

Seasonal routes that are not running this season are omitted: Route 4 (Cave &
Basin), Route 6 (Lake Minnewanka) and Route 11 (Lake Louise local) finished
with the summer season, and Route 9 (Johnston Canyon) is suspended until the
canyon reopens, which the operator expects around the end of November 2026.
"""
SERVICE_URL = ("https://data.trilliumtransit.com/gtfs/roamtransit-banff-ab-ca/"
               "roamtransit-banff-ab-ca.zip")

# short_name -> (long name, weekday, saturday, sunday, run seconds)
# spans are [first HH:MM, last HH:MM, headway seconds]; None = no service.
SPANS = {
    "1": ("Banff Local \u2014 Sulphur Mountain", ["05:15", "22:52", 1500],
          ["05:15", "22:52", 1500], ["06:15", "22:52", 1500], 1500),
    "2": ("Banff Local \u2014 Tunnel Mountain", ["06:38", "23:10", 1500],
          ["06:38", "23:10", 1500], ["07:00", "23:10", 1500], 1500),
    "3": ("Canmore \u2014 Banff Regional", ["05:50", "22:50", 1440],
          ["05:50", "22:50", 1440], ["06:50", "22:50", 1440], 3300),
    "5C": ("Canmore Local \u2014 Cougar Creek", ["05:52", "22:58", 2280],
           ["05:52", "22:58", 2280], ["07:00", "22:58", 2280], 2400),
    "5T": ("Canmore Local \u2014 Three Sisters", ["05:55", "23:16", 2340],
           ["05:55", "23:16", 2340], ["07:00", "23:16", 2340], 2400),
    "8X": ("Lake Louise \u2014 Banff Express", ["06:15", "21:40", 4500],
           ["06:15", "21:40", 4500], ["06:15", "21:40", 4500], 3600),
    "12": ("Canmore Local \u2014 Grassi Lakes / Palliser", ["06:53", "19:04", 1740],
           ["06:53", "19:04", 1740], ["07:30", "19:04", 1740], 2400),
}

# Route 7 postdates the 2024 feed, so its alignment is drawn from the stop
# locations in the 2026 timetable (Fenlands -> train station -> downtown ->
# Surprise Corner -> Banff Centre).
ROUTE_7 = {
    "id": "7",
    "short": "7",
    "long": "Fenlands \u2014 Banff Centre",
    "color": "6f7f8a",
    "run": 1200,
    "path": [
        (51.18306, -115.57867),   # Fenlands Recreation Centre
        (51.18191, -115.57581),   # Banff Train Station North
        (51.17924, -115.56941),   # downtown, Banff Avenue
        (51.17300, -115.56300),   # Buffalo Street
        (51.16762, -115.55983),   # Surprise Corner East
        (51.17050, -115.56000),   # St Julien Road
        (51.17400, -115.56000),   # Banff Centre
    ],
    "stops": [
        ("Fenlands Recreation Centre", 51.18306, -115.57867),
        ("Banff Train Station North", 51.18191, -115.57581),
        ("High School Transit Field", 51.17924, -115.56941),
        ("Surprise Corner East", 51.16762, -115.55983),
        ("Banff Centre", 51.17400, -115.56000),
    ],
    "span": {"weekday": ["06:45", "20:39", 2340],
             "saturday": ["06:45", "20:39", 2340],
             "sunday": ["06:45", "20:39", 2340]},
}


def feed(cache):
    import os

    import sources

    routes = sources.read_gtfs_routes(SERVICE_URL,
                                      os.path.join(cache, "_src", "roam"))
    out = []
    for rid, meta in sorted(routes.items(), key=lambda kv: kv[1]["short"]):
        short = meta["short"]
        spec = SPANS.get(short)
        if not spec:
            continue
        long_name, wd, sa, su, run = spec
        span = {"weekday": wd, "saturday": sa, "sunday": su}
        out.append({
            "id": rid, "short": short, "long": long_name,
            "color": meta["color"] or "e87722", "run": run,
            "dirs": [
                {"path": meta["path"], "stops": meta["stops"], "span": span},
                {"path": meta["path"][::-1], "stops": list(reversed(meta["stops"])),
                 "span": span},
            ],
        })

    out.append({
        "id": ROUTE_7["id"], "short": ROUTE_7["short"], "long": ROUTE_7["long"],
        "color": ROUTE_7["color"], "run": ROUTE_7["run"],
        "dirs": [
            {"path": ROUTE_7["path"], "stops": ROUTE_7["stops"],
             "span": ROUTE_7["span"]},
            {"path": ROUTE_7["path"][::-1],
             "stops": list(reversed(ROUTE_7["stops"])), "span": ROUTE_7["span"]},
        ],
    })

    if len(out) < 6:
        raise RuntimeError(f"Roam: only {len(out)} routes matched SPANS")
    return {
        "id": "roam",
        "agency": "Roam Transit",
        "url": "https://roamtransit.com/schedules-routes/",
        "color": "e87722",
        "kind": "roam",
        "routes": out,
    }
