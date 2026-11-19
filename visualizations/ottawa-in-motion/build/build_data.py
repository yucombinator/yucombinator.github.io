#!/usr/bin/env python3
"""Ottawa in Motion: OC Transpo + STO GTFS -> ../data.json."""
import os
import re
import shutil
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
import motion_build as mb  # noqa: E402

FEEDS = [
    {
        "id": "oc", "agency": "OC Transpo",
        "url": "https://oct-gtfs-emasagcnfmcgeham.z01.azurefd.net/public-access/GTFSExport.zip",
        "kind": "oc", "color": "0057b8",
    },
    {
        "id": "sto", "agency": "STO",
        "url": "https://contenu.sto.ca/GTFS/GTFS.zip",
        # The live STO export currently publishes an empty stop_times.txt.
        # Fall back to the last complete public snapshot until it is repaired.
        "fallback_url": "https://web.archive.org/web/20260813104437id_/https://contenu.sto.ca/GTFS/GTFS.zip",
        "kind": "sto", "color": "00a19a",
    },
]

OC_RAIL_COLOURS = {"1": "d30f1d", "2": "508128", "4": "0980a5"}


def classify(feed, route_id, route_type, route_color="", agency="", route_name="",
             route_short=""):
    short = (route_short or "").strip()
    name = (route_name or "").upper()
    color = (route_color or "").lstrip("#").lower()

    if feed["kind"] == "oc":
        if route_type == 0:
            return ("lrt", OC_RAIL_COLOURS.get(short, color or "d30f1d"))
        if route_type == 3:
            bus = color if re.fullmatch(r"[0-9a-f]{6}", color) and color not in ("ffffff", "fff") else "0057b8"
            return ("localbus", bus)
        return None

    if feed["kind"] == "sto":
        if "RAPIBUS" in name or short in ("100", "200", "400", "800"):
            return ("brt", "8e44ad")
        if route_type == 3:
            return ("localbus", "00a19a")
    return None


CFG = {
    "city": "Ottawa",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Toronto",
    "zoneLabel": "ET",
    "lat0": 45.42,
    "sun": (45.4215, -75.6972),
    "modes": ["lrt", "brt", "localbus"],
    "railModes": ["lrt"],
    "feeds": FEEDS,
    "classify": classify,
}

if __name__ == "__main__":
    # Anchor on a Saturday at least a week out so the weekday, Saturday and
    # Sunday samples all fall inside OC Transpo's current board period.
    from datetime import date, timedelta
    if not os.environ.get("MOTION_REFERENCE_DATE"):
        today = date.today()
        ref = today + timedelta(days=(5 - today.weekday()) % 7)
        if (ref - today).days < 7:
            ref += timedelta(days=7)
        CFG["referenceDate"] = ref.isoformat()

    for feed in FEEDS:
        path = mb.feed_dir(feed, CFG["cache"])
        if feed["id"] == "sto" and os.path.getsize(os.path.join(path, "stop_times.txt")) == 0:
            print("  ! STO stop_times.txt is empty; using the last complete snapshot",
                  file=sys.stderr)
            shutil.rmtree(path)
            try:
                os.remove(os.path.join(CFG["cache"], feed["id"] + ".zip"))
            except FileNotFoundError:
                pass
            feed["url"] = feed["fallback_url"]
            mb.feed_dir(feed, CFG["cache"])
    mb.run(CFG)
