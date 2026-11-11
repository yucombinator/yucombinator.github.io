#!/usr/bin/env python3
"""San Francisco in Motion: Muni, BART and Caltrain GTFS -> ../data.json."""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
import motion_build as mb  # noqa: E402

FEEDS = [
    {
        "id": "sfmta", "agency": "Muni",
        "url": "https://muni-gtfs.apps.sfmta.com/data/muni_gtfs-current.zip",
        "kind": "muni", "color": "d7263d",
    },
    {
        "id": "bart", "agency": "BART",
        "url": "https://www.bart.gov/dev/schedules/google_transit.zip",
        "kind": "bart", "color": "f2c94c",
    },
    {
        "id": "caltrain", "agency": "Caltrain",
        "url": "https://data.trilliumtransit.com/gtfs/caltrain-ca-us/caltrain-ca-us.zip",
        "kind": "caltrain", "color": "e31837",
    },
]


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    color = (route_color or "").lstrip("#").lower()
    if feed["id"] == "bart":
        return ("subway", color or "f2c94c")
    if feed["id"] == "caltrain":
        return ("gorail", color or "e31837")
    if route_type == 0:
        return ("lrt", color or "d7263d")
    if route_type == 5:
        return ("streetcar", color or "f28e2b")
    return ("localbus", "2f6db3")


CFG = {
    "city": "San Francisco",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Los_Angeles",
    "zoneLabel": "PT",
    "lat0": 37.77,
    "sun": (37.7749, -122.4194),
    "modes": ["subway", "lrt", "streetcar", "localbus", "gorail"],
    "railModes": ["subway", "lrt", "streetcar", "gorail"],
    "feeds": FEEDS,
    "classify": classify,
}

if __name__ == "__main__":
    mb.run(CFG)
