#!/usr/bin/env python3
"""Vancouver in Motion: TransLink + nearby BC Transit/ferries -> ../data.json."""
import csv
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
import motion_build as mb  # noqa: E402

FEEDS = [
    {"id": "translink", "agency": "TransLink",
     "url": "https://gtfs-static.translink.ca/gtfs/google_transit.zip",
     "kind": "translink", "color": "0072bc"},
    {"id": "bct_fv", "agency": "BC Transit — Fraser Valley",
     "url": "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=13",
     "kind": "local", "color": "c96a2a"},
    {"id": "bct_sunshine", "agency": "BC Transit — Sunshine Coast",
     "url": "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=18",
     "kind": "local", "color": "1f8a9e"},
    {"id": "bct_squamish", "agency": "BC Transit — Squamish",
     "url": "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=43",
     "kind": "local", "color": "2e9e6b"},
    {"id": "bct_whistler", "agency": "BC Transit — Whistler",
     "url": "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=44",
     "kind": "local", "color": "7b4fd0"},
    {"id": "bct_pemberton", "agency": "BC Transit — Pemberton",
     "url": "https://bct.tmix.se/Tmix.Cap.TdExport.WebApi/gtfs/?operatorIds=50",
     "kind": "local", "color": "b0873a"},
    {"id": "bcferries", "agency": "BC Ferries",
     "url": "https://data.trilliumtransit.com/gtfs/bcferries-bc-ca/bcferries-bc-ca.zip",
     "kind": "bcferries", "color": "1b4f8f",
     "filter_routes": ["Tsawwassen", "Horseshoe Bay"]},
    {"id": "aquabus", "agency": "Aquabus",
     "url": "https://aquabusferries.github.io/gtfs-feed/aquabus-bc-ca.zip",
     "kind": "aquabus", "color": "e5a50a"},
    {"id": "hullo", "agency": "Hullo",
     "url": "https://hullo.com/gtfs/gtfs-hullo.zip",
     "kind": "hullo", "color": "ff6a3d"},
    {"id": "fcf", "agency": "False Creek Ferries (approx.)",
     "kind": "ferry", "color": "2b6cb0"},
]

FCF_DOCKS = {
    "SB": (49.27664, -123.13708, "Sunset Beach"),
    "MM": (49.27793, -123.14469, "Maritime Museum"),
    "GI": (49.27195, -123.13395, "Granville Island"),
    "DL": (49.27049, -123.12521, "David Lam Park"),
    "YT": (49.27172, -123.11795, "Yaletown"),
    "SP": (49.27102, -123.11553, "Spyglass Place"),
    "PN": (49.27422, -123.10980, "Plaza of Nations"),
    "OV": (49.27135, -123.10790, "Olympic Village"),
    "OVL": (49.27247, -123.10568, "The Village"),
}
FCF_ROUTES = [
    ("FCF1", "Sunset Beach - Granville Island", ["SB", "GI"], 180, 300),
    ("FCF2", "Maritime Museum - Granville Island", ["MM", "GI"], 240, 900),
    ("FCF3", "Village - Granville Island",
     ["OVL", "OV", "PN", "SP", "YT", "DL", "GI"], 1500, 480),
]


def write_fcf_feed(path, feed):
    os.makedirs(path, exist_ok=True)

    def write(name, header, rows):
        with open(os.path.join(path, name), "w", newline="", encoding="utf-8") as fh:
            wr = csv.writer(fh)
            wr.writerow(header)
            wr.writerows(rows)

    write("agency.txt",
          ["agency_id", "agency_name", "agency_url", "agency_timezone", "agency_lang"],
          [["fcf", "False Creek Ferries (approximate)",
            "https://granvilleislandferries.bc.ca", "America/Vancouver", "en"]])
    write("routes.txt",
          ["route_id", "agency_id", "route_short_name", "route_long_name",
           "route_type", "route_color", "route_text_color"],
          [[rid, "fcf", "", label, 4, feed["color"], "ffffff"]
           for rid, label, _, _, _ in FCF_ROUTES])
    write("calendar.txt",
          ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday",
           "saturday", "sunday", "start_date", "end_date"],
          [["daily", 1, 1, 1, 1, 1, 1, 1, "20200101", "20500101"]])
    write("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"],
          [[sid, f"{name} ferry dock", lat, lon]
           for sid, (lat, lon, name) in FCF_DOCKS.items()])
    shape_rows, trip_rows, st_rows = [], [], []
    for rid, _, stops, run, headway in FCF_ROUTES:
        for direction, seq in ((0, stops), (1, list(reversed(stops)))):
            shape_id = f"{rid}_{direction}"
            for i, sid in enumerate(seq):
                lat, lon, _ = FCF_DOCKS[sid]
                shape_rows.append([shape_id, lat, lon, i + 1])
            step = run / max(1, len(seq) - 1)
            at, end = 7 * 3600, 21 * 3600
            while at < end:
                tid = f"{rid}_{direction}_{at}"
                trip_rows.append([tid, rid, "daily", shape_id, direction])
                for i, sid in enumerate(seq):
                    t = at + round(step * i)
                    st_rows.append([tid, mb.hhmmss(t), mb.hhmmss(t), sid, i + 1])
                at += headway
    write("shapes.txt",
          ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"], shape_rows)
    write("trips.txt", ["trip_id", "route_id", "service_id", "shape_id", "direction_id"],
          trip_rows)
    write("stop_times.txt",
          ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
          st_rows)
    open(os.path.join(path, ".ok"), "w").close()
    print(f"  ~ {feed['id']}: approximated {len(trip_rows)} ferry trips", file=sys.stderr)


for feed in FEEDS:
    if feed["id"] == "fcf":
        feed["approx_writer"] = write_fcf_feed


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    kind = feed["kind"]
    if kind == "translink":
        if route_type == 1:
            return ("subway", (route_color or "0033a0").lstrip("#").lower())
        if route_type == 2:
            return ("gorail", (route_color or "87189d").lstrip("#").lower())
        if route_type == 4:
            return ("ferry", (route_color or "746661").lstrip("#").lower())
        if route_type == 3:
            if re.match(r"^R\d+$", route_short.strip()) or re.search(r"b-line", route_name, re.I):
                return ("brt", (route_color or "008522").lstrip("#").lower())
            return ("localbus", (route_color or feed["color"]).lstrip("#").lower())
        return None
    if kind in ("bcferries", "aquabus", "hullo", "ferry"):
        return ("ferry", feed["color"])
    return ("localbus", feed["color"])


CFG = {
    "city": "Metro Vancouver and the Fraser Valley",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Vancouver",
    "zoneLabel": "PT",
    "lat0": 49.25,
    "sun": (49.2827, -123.1207),
    "modes": ["subway", "streetcar", "lrt", "gorail", "gobus", "localbus", "brt", "up", "ferry"],
    "railModes": ["subway", "lrt", "gorail", "up"],
    "feeds": FEEDS,
    "classify": classify,
}

if __name__ == "__main__":
    mb.run(CFG)
