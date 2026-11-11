#!/usr/bin/env python3
"""San Francisco in Motion: Bay Area GTFS feeds -> ../data.json."""
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
import motion_build as mb  # noqa: E402

API511 = os.environ.get("BAY_AREA_511_KEY", "").strip()

def feed511(operator, fallback):
    """Current 511 GTFS when a key is available, otherwise a direct fallback."""
    if API511:
        return f"https://api.511.org/transit/datafeeds?operator_id={operator}&api_key={API511}"
    return fallback


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
        "kind": "rail", "color": "e31837",
    },
    {
        "id": "actransit", "agency": "AC Transit",
        "url": feed511("AC", "https://opendata.actransit.org/dataset/d564998d-ed9a-4f32-8838-99737c4a66fc/resource/d4aef7d8-d501-4a7e-a7c4-3f4dddd0e5cc/download/aug2025.zip"),
        "kind": "bus", "color": "fd7e14",
    },
    {
        "id": "vta", "agency": "VTA",
        "url": "https://gtfs.vta.org/gtfs_vta.zip",
        "kind": "vta", "color": "2f9e44",
    },
    {
        "id": "samtrans", "agency": "SamTrans",
        "url": feed511("SM", "https://www.samtrans.com/Assets/GTFS/samtrans/ST-GTFS.zip"),
        "kind": "bus", "color": "7b61ff",
    },
    {
        "id": "goldengate", "agency": "Golden Gate Transit",
        "url": "https://realtime.goldengate.org/gtfsstatic/GTFSTransitData.zip",
        "kind": "mixed", "color": "e8590c",
    },
    {
        "id": "sfbayferry", "agency": "SF Bay Ferry",
        "url": "https://gtfs.sanfranciscobayferry.com/gtfs.zip",
        "kind": "ferry", "color": "0ea5e9",
    },
    {
        "id": "smart", "agency": "SMART",
        "url": "https://data.trilliumtransit.com/gtfs/smart-ca-us/smart-ca-us.zip",
        "kind": "rail", "color": "d6336c",
    },
    {
        "id": "countyconnection", "agency": "County Connection",
        "url": "https://data.trilliumtransit.com/gtfs/countyconnection-ca-us/countyconnection-ca-us.zip",
        "kind": "bus", "color": "f59f00",
    },
    {
        "id": "unioncity", "agency": "Union City Transit",
        "url": feed511("UC", "https://data.trilliumtransit.com/gtfs/unioncity-ca-us/unioncity-ca-us.zip"),
        "kind": "bus", "color": "7048e8",
    },
    {
        "id": "westcat", "agency": "WestCAT",
        "url": "https://data.trilliumtransit.com/gtfs/westcat-ca-us/westcat-ca-us.zip",
        "kind": "bus", "color": "20c997",
    },
    {
        "id": "soltrans", "agency": "SolTrans",
        "url": "https://data.trilliumtransit.com/gtfs/soltrans-ca-us/soltrans-ca-us.zip",
        "kind": "bus", "color": "845ef7",
    },
    {
        "id": "vine", "agency": "VINE",
        "url": feed511("VN", "https://data.trilliumtransit.com/gtfs/vinetransit-ca-us/vinetransit-ca-us.zip"),
        "kind": "bus", "color": "e64980",
    },
    {
        "id": "petaluma", "agency": "Petaluma Transit",
        "url": "https://data.trilliumtransit.com/gtfs/petalumatransit-petaluma-ca-us/petalumatransit-petaluma-ca-us.zip",
        "kind": "bus", "color": "12b886",
    },
    {
        "id": "fairfield", "agency": "Fairfield Transit",
        "url": "https://data.trilliumtransit.com/gtfs/fairfield-ca-us/fairfield-ca-us.zip",
        "kind": "bus", "color": "fab005",
    },
    {
        "id": "riovista", "agency": "Rio Vista Delta Breeze",
        "url": "https://data.trilliumtransit.com/gtfs/riovista-ca-us/riovista-ca-us.zip",
        "kind": "bus", "color": "4dabf7",
    },
    {
        "id": "sonomacounty", "agency": "Sonoma County Transit",
        "url": "https://data.trilliumtransit.com/gtfs/sonomacounty-ca-us/sonomacounty-ca-us.zip",
        "kind": "bus", "color": "f06595",
    },
    {
        "id": "santarosa", "agency": "Santa Rosa CityBus",
        "url": feed511("SR", "https://data.trilliumtransit.com/gtfs/santarosa-ca-us/santarosa-ca-us.zip"),
        "kind": "bus", "color": "9775fa",
    },
    {
        "id": "marin", "agency": "Marin Transit",
        "url": "https://marintransit.gov/data/google_transit.zip",
        "kind": "bus", "color": "15aabf",
    },
    {
        "id": "missionbay", "agency": "Mission Bay TMA",
        "url": "https://data.trilliumtransit.com/gtfs/missionbaytma-ca-us/missionbaytma-ca-us.zip",
        "kind": "bus", "color": "22b8cf",
    },
    {
        "id": "tideline", "agency": "Tideline Water Taxi",
        "url": "https://data.trilliumtransit.com/gtfs/tidelinewatertaxi-ca-us/tidelinewatertaxi-ca-us.zip",
        "kind": "ferry", "color": "06b6d4",
    },
    {
        "id": "emerygoround", "agency": "Emery Go-Round",
        "url": "https://data.trilliumtransit.com/gtfs/emerygoround-ca-us/emerygoround-ca-us.zip",
        "kind": "bus", "color": "94d82d",
    },
    {
        "id": "mountainview", "agency": "Mountain View MVgo",
        "url": "https://mvgo.org/data/gtfs.zip",
        "kind": "bus", "color": "fcc419",
    },
    {
        "id": "capitolcorridor", "agency": "Capitol Corridor",
        "url": "https://data.trilliumtransit.com/gtfs/capitolcorridor-ca-us/capitolcorridor-ca-us.zip",
        "kind": "rail", "color": "f03e3e",
    },
    {
        "id": "ace", "agency": "Altamont Corridor Express",
        "url": feed511("CE", ""), "kind": "rail", "color": "e8590c",
    },
    {
        "id": "dumbarton", "agency": "Dumbarton Express",
        "url": feed511("DE", ""), "kind": "bus", "color": "f59f00",
    },
    {
        "id": "tridelta", "agency": "Tri Delta Transit",
        "url": feed511("3D", ""), "kind": "bus", "color": "f06595",
    },
    {
        "id": "sanleandro", "agency": "San Leandro LINKS",
        "url": feed511("SL", ""), "kind": "bus", "color": "20c997",
    },
    {
        "id": "southcity", "agency": "South San Francisco Shuttle",
        "url": feed511("SS", ""), "kind": "bus", "color": "9775fa",
    },
    {
        "id": "vacaville", "agency": "Vacaville City Coach",
        "url": feed511("VC", ""), "kind": "bus", "color": "12b886",
    },
    {
        "id": "lavta", "agency": "LAVTA / Wheels",
        "url": "https://data.trilliumtransit.com/gtfs/lavta-ca-us/lavta-ca-us.zip",
        "kind": "bus", "color": "f59f00",
    },
    {
        "id": "scmtd", "agency": "Santa Cruz METRO",
        "url": "https://developer.scmetro.org/gtfs.zip",
        "kind": "bus", "color": "0ea5e9",
    },
    {
        "id": "santacruzer", "agency": "Santa Cruz Cruzer",
        "url": "https://www.pinpointavl.com/santacruzer.zip",
        "kind": "bus", "color": "22b8cf",
    },
    {
        "id": "commuteorg", "agency": "Commute.org",
        "url": "https://data.trilliumtransit.com/gtfs/commute-ca-us/commute-ca-us.zip",
        "kind": "bus", "color": "94d82d",
    },
    {
        "id": "stanford", "agency": "Stanford Marguerite",
        "url": "https://transportation-forms.stanford.edu/google/google_transit.zip",
        "kind": "bus", "color": "ff922b",
    },
]


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    """Map each operator's GTFS route types into the shared visual modes."""
    color = (route_color or "").strip().lstrip("#").lower()
    kind = feed.get("kind", "bus")
    fallback = feed.get("color", "2f6db3")
    if feed["id"] == "sfmta":
        if route_id == "F":
            return ("streetcar", color or "b49a36")
        if route_type == 0:
            return ("lrt", color or "d7263d")
        if route_type == 5:
            return ("streetcar", color or "f28e2b")
        return ("localbus", "2f6db3")
    if feed["id"] == "bart":
        return ("subway", color or "f2c94c")
    if kind == "ferry" or route_type == 4:
        return ("ferry", color or fallback)
    if kind == "vta" and route_type == 0:
        return ("lrt", color or fallback)
    if kind == "rail" or route_type == 2:
        return ("gorail", color or fallback)
    if route_type == 0:
        return ("lrt", color or fallback)
    if route_type == 5:
        return ("streetcar", color or fallback)
    return ("regionalbus", color or fallback)



CFG = {
    "city": "San Francisco",
    "cache": str(HERE / "gtfs"),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Los_Angeles",
    "zoneLabel": "PT",
    "lat0": 37.77,
    "sun": (37.7749, -122.4194),
    "modes": ["subway", "lrt", "streetcar", "localbus", "regionalbus", "gorail", "ferry"],
    "railModes": ["subway", "lrt", "streetcar", "gorail", "ferry"],
    "feeds": [f for f in FEEDS if f["url"]],
    "classify": classify,
}

if __name__ == "__main__":
    mb.run(CFG)
