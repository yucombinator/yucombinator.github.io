#!/usr/bin/env python3
"""Build the map's territories from the official WUTC / Ecology service areas.

Source: Washington Utilities and Transportation Commission + Department of Ecology,
"Electric Utility Service Areas" (ArcGIS Enterprise, gis.ecology.wa.gov,
/serverext/rest/services/CPR/CPR/MapServer/0), 65 polygons. This is real
published service territory data, not a model.

Utilities we have no residential rate for — co-ops, mutuals, naval bases and
other small operators — are kept in the map and simply render gray, so a gap in
our rates never silently redraws a boundary.

Usage:
    /tmp/transitenv/bin/python tools/build_service_areas.py
"""
import json
import os
import re
import urllib.request

from shapely.geometry import shape

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")
SOURCE = os.path.join(DATA, "source", "wutc_ecology_service_areas.geojson")
OUT = os.path.join(DATA, "boundaries.geojson")

QUERY = ("https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/MapServer/0/query"
         "?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&f=geojson")
SOURCE_URL = "https://gis.ecology.wa.gov/serverext/rest/services/CPR/CPR/MapServer/0"
# the WAF rejects curl's default agent outright
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120 Safari/537.36")

# Official service-area name -> our utility id. Only names we can match with
# certainty are listed; anything else keeps its own name and renders unpriced.
NAME_TO_ID = {
    "Puget Sound Energy": "pse",
    "Avista (WA)": "avista",
    "Pacific Power (WA)": "pacific_power",
    "Seattle City Light": "seattle_city_light",
    "Tacoma Power": "tacoma_power",
    "Richland Energy Services": "city_of_richland",
    "Centralia City Light": "centralia_city_light",
    "Port Angeles Light Operations": "port_angeles_city_light",
    "City of Blaine": "city_of_blaine",
    "Sumas, City of": "city_of_sumas",
    "Coulee Dam, Town of": "city_of_coulee_dam",
    "Ruston, Town Of": "town_of_ruston",
    "Steilacoom Electric Utility": "town_of_steilacoom",
    "Eatonville Electric Department": "town_of_eatonville",
    "Milton Electric Division": "city_of_milton",
    "Ellensburg Electric Division": "city_of_ellensburg",
    "McCleary Light & Power": "city_of_mccleary",
    "Cheney Light Department": "city_of_cheney",
    "Chewelah Electric Department": "city_of_chewelah",
    "Snohomish County PUD #1": "snohomish_pud",
    "Whatcom County PUD #1": "whatcom_pud",
    "Clallam County PUD #1": "clallam_pud",
    "Cowlitz County PUD #1": "cowlitz_pud",
    "Clark County PUD #1": "clark_pud",
    "Grays Harbor County PUD #1": "grays_harbor_pud",
    "Wahkiakum County PUD #1": "wahkiakum_pud",
    "Lewis County PUD #1": "lewis_pud",
    "Jefferson County PUD #1": "jefferson_pud",
    "Mason County PUD #1": "mason_pud_1",
    "Mason County PUD #3": "mason_pud_3",
    "Douglas County PUD #1": "douglas_pud",
    "Chelan County PUD #1": "chelan_pud",
    "Kittitas PUD #1": "kittitas_pud",
    "Klickitat County PUD #1": "klickitat_pud",
    "Skamania County PUD #1": "skamania_pud",
    "Grant County PUD #2": "grant_pud",
    "Franklin County PUD #1": "franklin_pud",
    "Benton County PUD #1": "benton_pud",
    "Asotin County PUD #1": "asotin_pud",
    "Ferry County PUD #1": "ferry_pud",
    "Pend Oreille County PUD #1": "pend_oreille_pud",
    "Pacific County PUD #2": "pacific_pud",
    "Okanogan County PUD #1": "okanogan_pud",
}


# The official layer has no county field, but most names state it outright
# ("Snohomish County PUD #1"). Cities are mapped by hand.
NAME_COUNTY = {
    "City of Blaine": "Whatcom", "Sumas, City of": "Whatcom",
    "City of Cascade Locks": "Clark", "Coulee Dam, Town of": "Grant",
    "Ruston, Town Of": "Pierce", "Steilacoom Electric Utility": "Pierce",
    "Eatonville Electric Department": "Pierce", "Milton Electric Division": "Pierce",
    "Ellensburg Electric Division": "Kittitas", "McCleary Light & Power": "Grays Harbor",
    "Cheney Light Department": "Spokane", "Chewelah Electric Department": "Stevens",
    "Port Angeles Light Operations": "Clallam", "Centralia City Light": "Lewis",
    "Richland Energy Services": "Benton",
}
COUNTY_WORDS = (
    "Snohomish Whatcom Clallam Cowlitz Clark Grays Harbor Wahkiakum Lewis Jefferson "
    "Mason Douglas Chelan Kittitas Klickitat Skamania Grant Franklin Benton Asotin "
    "Ferry Pend_Oreille Pacific Okanogan Spokane Yakima Adams Whitman Stevens"
).replace("_", " ").split()


def county_for(name):
    if name in NAME_COUNTY:
        return NAME_COUNTY[name]
    words = re.split(r"\W+", name)
    for w in words:
        if w in COUNTY_WORDS:
            return w
    return None


def slug(name):
    s = name.lower()
    s = re.sub(r"[^a-z0-9]+", "_", s).strip("_")
    return s[:48]


def fetch():
    if os.path.exists(SOURCE) and os.path.getsize(SOURCE) > 10000:
        with open(SOURCE) as fh:
            return json.load(fh)
    req = urllib.request.Request(QUERY, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=120) as resp:
        payload = resp.read()
    os.makedirs(os.path.dirname(SOURCE), exist_ok=True)
    with open(SOURCE, "wb") as fh:
        fh.write(payload)
    return json.loads(payload)


def main():
    with open(os.path.join(ROOT, "data", "utilities.json")) as fh:
        roster = json.load(fh)
    # county for utilities whose official name does not state one
    # ("Seattle City Light"), taken from the roster's county mapping
    county_of_id = {}
    for county, uid in (roster.get("county_default") or {}).items():
        county_of_id.setdefault(uid, county)
    for u in roster["utilities"]:
        for county in u.get("counties", []):
            county_of_id.setdefault(u["id"], county)
    kind = {u["id"]: u["type"] for u in roster["utilities"]}
    pretty = {u["id"]: u["name"] for u in roster["utilities"]}

    data = fetch()
    features, seen, unmatched = [], set(), []

    for f in data.get("features", []):
        name = f["properties"].get("Name", "").strip()
        if not name:
            continue
        uid = NAME_TO_ID.get(name)
        if uid is None:
            uid = slug(name)
            unmatched.append(name)
        seen.add(uid)
        # label anchor: a point guaranteed inside the polygon
        point = shape(f["geometry"]).representative_point()
        features.append({
            "type": "Feature",
            "id": f"{uid}--{slug(name)}",
            "properties": {
                "id": uid,
                "name": pretty.get(uid, name),
                "official_name": name,
                "type": kind.get(uid, "other"),
                "county": county_for(name) or county_of_id.get(uid),
                "label_at": [round(point.y, 4), round(point.x, 4)],
                "priced": uid in kind and uid in pretty,
                "source": "WUTC / WA Dept. of Ecology service areas",
            },
            "geometry": f["geometry"],
        })

    with open(OUT, "w") as fh:
        json.dump({
            "type": "FeatureCollection",
            "source": SOURCE_URL,
            "features": features,
        }, fh)

    rated = sum(1 for f in features if f["properties"]["priced"])
    print(f"{len(features)} service areas from WUTC/Ecology -> {OUT}")
    print(f"  {rated} have a collected rate, {len(features) - rated} render gray")
    if unmatched:
        print(f"  {len(unmatched)} unmatched (kept their own names):")
        for n in sorted(unmatched):
            print(f"    - {n}")


if __name__ == "__main__":
    main()
