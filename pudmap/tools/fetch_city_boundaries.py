#!/usr/bin/env python3
"""Fetch real city boundaries for the utilities whose service area is a city.

Seattle City Light serves the City of Seattle and nothing else, but the
nearest-service-centre model gave it a 45 km square that spilled east over
Bellevue and into Puget Sound Energy's territory. For every municipal utility
the service area IS a city limit, so the fix is to use the actual boundary
instead of a radius.

Pulls each city's administrative polygon from OpenStreetMap via Nominatim and
writes data/boundaries/municipal_boundaries.geojson, keyed by utility id.
Cached: re-running only fetches what is missing.

Usage:
    /tmp/transitenv/bin/python tools/fetch_city_boundaries.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UTILITIES = os.path.join(ROOT, "data", "utilities.json")
OUT_DIR = os.path.join(ROOT, "data", "boundaries")
OUT = os.path.join(OUT_DIR, "municipal_boundaries.geojson")
UA = "pudmap/1.0 (Washington utility boundary research; 17 one-off city lookups)"


def fetch(city):
    q = urllib.parse.quote(f"{city}, Washington, USA")
    url = (f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
           f"&polygon_geojson=1&limit=1")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        hits = json.load(resp)
    if not hits:
        return None
    return hits[0].get("geojson")


def main():
    with open(UTILITIES) as fh:
        roster = json.load(fh)
    municipals = [u for u in roster["utilities"] if u["type"] == "municipal"]

    cached = {}
    if os.path.exists(OUT):
        with open(OUT) as fh:
            cached = json.load(fh)

    for u in municipals:
        uid, city = u["id"], u["primary_city"]
        if uid in cached:
            print(f"  cached  {uid:26s} {city}")
            continue
        try:
            geom = fetch(city)
        except Exception as exc:                       # noqa: BLE001 - report and continue
            print(f"  FAILED  {uid:26s} {city}: {exc}")
            continue
        if not geom or geom.get("type") != "Polygon":
            print(f"  no polygon  {uid:26s} {city}")
            continue
        cached[uid] = geom
        print(f"  fetched {uid:26s} {city} ({len(geom['coordinates'][0])} points)")
        time.sleep(1.1)                              # Nominatim: <=1 req/sec

    os.makedirs(OUT_DIR, exist_ok=True)
    with open(OUT, "w") as fh:
        json.dump(cached, fh)
    print(f"{len(cached)}/{len(municipals)} municipal boundaries -> {OUT}")


if __name__ == "__main__":
    main()
