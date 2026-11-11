#!/usr/bin/env python3
"""Seattle in Motion: Puget Sound consolidated GTFS -> ../data.json."""
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
        "id": "puget", "agency": "Puget Sound",
        "url": "https://gtfs.sound.obaweb.org/prod/gtfs_puget_sound_consolidated.zip",
        "kind": "puget", "color": "2f6db3", "multi_agency": True,
    },
    {
        "id": "muckleshoot", "agency": "Muckleshoot Tribal Transit",
        "url": "https://data.trilliumtransit.com/gtfs/muckleshoot-wa-us/muckleshoot-wa-us.zip",
        "kind": "bus", "color": "c26b3f",
    },
]


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    if agency in ("Amtrak", "Solid Ground EZ Loop"):
        return None
    color = (route_color or "").lstrip("#").lower()
    if route_type == 3:
        if re.search(r"rapid\s*ride|swift|stride|stream", route_name, re.I):
            shades = {
                "Metro Transit": "5b93d6", "Community Transit": "b18cff",
                "Pierce Transit": "d063a6", "Sound Transit": "4fb37f",
            }
            return ("brt", shades.get(agency, "d7263d"))
        bus = {
            "Metro Transit": "2f6db3", "Sound Transit": "007a53",
            "Pierce Transit": "a03b7a", "Community Transit": "8b5cf6",
            "Everett Transit": "b35b1f", "Kitsap Transit": "0e7c86",
            "Intercity Transit": "6a9a2c",
        }
        return ("localbus", bus.get(agency, feed["color"]))
    if route_type == 4:
        ferry = {
            "Washington State Ferries": "79d6a5", "Kitsap Transit": "0070c0",
            "Metro Transit": "4298cc",
        }
        return ("ferry", ferry.get(agency, color or "1b4f8f"))
    if route_type == 2:
        if agency == "Seattle Center Monorail":
            return ("up", "d24b8f")
        return ("gorail", color or "9ab6d3")
    if route_type == 0:
        if agency == "City of Seattle":
            return ("streetcar", color or "f47836")
        return ("lrt", color or "28813f")
    return None


CFG = {
    "city": "Puget Sound",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Los_Angeles",
    "zoneLabel": "PT",
    "lat0": 47.60,
    "sun": (47.6062, -122.3321),
    "modes": ["subway", "streetcar", "lrt", "gorail", "gobus", "localbus", "brt", "up", "ferry"],
    "railModes": ["subway", "lrt", "gorail", "up"],
    "feeds": FEEDS,
    "classify": classify,
}

if __name__ == "__main__":
    mb.run(CFG)
