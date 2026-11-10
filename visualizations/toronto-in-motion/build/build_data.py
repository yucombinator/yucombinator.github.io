#!/usr/bin/env python3
"""Toronto in Motion: Greater Golden Horseshoe GTFS -> ../data.json."""
import html as htmlmod
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
import motion_build as mb  # noqa: E402

FEEDS = [
    {"id": "ttc", "agency": "TTC",
     "url": "https://ckan0.cf.opendata.inter.prod-toronto.ca/dataset/"
            "7795b45e-e65a-4465-81fc-c36b9dfff169/resource/"
            "cfb6b2b8-6191-41e3-bda1-b175c51148cb/download/opendata_ttc_schedules.zip",
     "kind": "ttc"},
    {"id": "go", "agency": "GO",
     "url": "https://assets.metrolinx.com/raw/upload/v1683228856/Documents/Metrolinx/Open%20Data/GO-GTFS.zip",
     "kind": "go"},
    {"id": "up", "agency": "UP Express",
     "url": "https://assets.metrolinx.com/raw/upload/v1682367798/Documents/Metrolinx/Open%20Data/UP-GTFS.zip",
     "kind": "up"},
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
    {"id": "midpen", "agency": "Mid-Pen Transit",
     "url": "https://midland.usetransit.com/api/1/public/gtfs/2/gtfs.zip"
            "?token=64186b9ee7bea60d7638268206162c0c9c1a3f49e",
     "kind": "local", "color": "7b8f3a"},
    {"id": "niagara", "agency": "Niagara Region Transit",
     "url": "http://68.71.24.110/gtfs/GTFSExport.zip",
     "kind": "local", "color": "c04fa0"},
]

TTC_LINES = {
    "1": ("subway", "f8c302"),
    "2": ("subway", "16a753"),
    "4": ("subway", "b32078"),
    "5": ("lrt", "f87005"),
    "6": ("lrt", "8a999a"),
}
BRT_SHADES = {"brampton": "f0a574", "drt": "4fc6ce", "yrt": "b07fd8"}


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    kind = feed["kind"]
    if kind == "ttc":
        if route_id in TTC_LINES:
            return TTC_LINES[route_id]
        if route_type == 0:
            return ("streetcar", "da251d")
        return ("localbus", "5aa9e6")
    if kind == "go":
        if route_type == 2:
            return ("gorail", (route_color or "00853e").lstrip("#").lower())
        return ("gobus", "5aa93f")
    if kind == "up":
        return ("up", (route_color or "0075d2").lstrip("#").lower())
    if kind == "lrt":
        return ("lrt", feed["color"])
    if re.search(r"viva|z[uü]m|pulse", route_name, re.I):
        return ("brt", BRT_SHADES.get(feed["id"], "d7263d"))
    return ("localbus", feed["color"])


FERRY_PAGE = ("https://www.toronto.ca/explore-enjoy/toronto-island-ferries/"
              "ferry-routes-schedules/")
FERRY_CITY_TERMINAL = (43.64036, -79.37508)
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
    tokens = re.compile(r"<h[2-4][^>]*>([\s\S]*?)</h[2-4]>|<table[\s\S]*?</table>", re.I)
    heading, out = "", {}
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
    except Exception as exc:  # noqa: BLE001
        print(f"  ! ferry page: {type(exc).__name__}: {exc}", file=sys.stderr)
        return ""


def add_ferries(ctx):
    schedule = parse_ferry_page(fetch_ferry_page())
    if schedule:
        print(f"  ferry      timetable: {len(schedule)} route(s) from toronto.ca",
              file=sys.stderr)
    else:
        schedule = {k: [(hhmm(a), hhmm(b)) for a, b in FERRY_FALLBACK]
                    for k in FERRY_TERMINALS if k == "ward's island"}
        print("  ! ferry: using the built-in winter timetable", file=sys.stderr)

    routes = ctx["routes"]
    day_trips = ctx["day_trips"]
    day_hist = ctx["day_hist"]
    stop_rows = [[round(FERRY_CITY_TERMINAL[0], 5), round(FERRY_CITY_TERMINAL[1], 5),
                  "Jack Layton Ferry Terminal"]]
    stops = {}
    for term, times in schedule.items():
        slug, label, dock = FERRY_TERMINALS[term]
        route_key = f"ferry:{slug}"
        routes[route_key] = {"s": label, "l": "Toronto Island Ferry", "m": "ferry",
                             "c": "1f8a9e", "a": "Toronto Island Ferry"}
        ctx["raw_shapes"][("ferry", f"to-{slug}")] = [
            (1, FERRY_CITY_TERMINAL[0], FERRY_CITY_TERMINAL[1]),
            (2, dock[0], dock[1]),
        ]
        ctx["raw_shapes"][("ferry", f"from-{slug}")] = [
            (1, dock[0], dock[1]),
            (2, FERRY_CITY_TERMINAL[0], FERRY_CITY_TERMINAL[1]),
        ]
        dock_idx = len(stop_rows)
        stop_rows.append([round(dock[0], 5), round(dock[1], 5), label])
        km = mb.haversine_km(*FERRY_CITY_TERMINAL, *dock)
        stops[slug] = [[0, dock_idx], round(km, 1), 600]
        for spec in ctx["DAY_SPECS"]:
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
    with open(os.path.join(ctx["out_dir"], "stops-ferry.json"), "w",
              encoding="utf-8") as fh:
        json.dump({"s": stop_rows, "r": stops}, fh, separators=(",", ":"))
    print(f"  ferry      stops: {len(stop_rows)} terminals, {len(stops)} route(s)",
          file=sys.stderr)


CFG = {
    "city": "Greater Golden Horseshoe",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Toronto",
    "zoneLabel": "auto",
    "lat0": 43.70,
    "sun": (43.6532, -79.3832),
    "modes": ["subway", "streetcar", "lrt", "gorail", "gobus", "localbus", "brt", "up", "ferry"],
    "railModes": ["subway", "lrt", "gorail", "up"],
    "feeds": FEEDS,
    "classify": classify,
    "expandFrequencies": False,
    "extras": add_ferries,
}

if __name__ == "__main__":
    mb.run(CFG)
