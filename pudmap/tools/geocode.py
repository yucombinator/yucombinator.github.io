#!/usr/bin/env python3
"""Geocode each utility's service city to [lat, lon] via OpenStreetMap Nominatim.

Cached in data/centers.json. Nominatim's usage policy allows a modest volume
with a real User-Agent, so this sleeps between requests and reuses the cache.

Usage:
    /tmp/transitenv/bin/python tools/geocode.py
"""
import json
import os
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
UTILITIES = os.path.join(ROOT, "data", "utilities.json")
CACHE = os.path.join(ROOT, "data", "centers.json")
UA = "pudmap/1.0 (Washington PUD rate map; one-off geocode of ~40 towns)"


def lookup(city, state="WA"):
    q = urllib.parse.quote(f"{city}, {state}, USA")
    url = f"https://nominatim.openstreetmap.org/search?q={q}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=20) as resp:
        hits = json.load(resp)
    if not hits:
        return None
    return [round(float(hits[0]["lat"]), 4), round(float(hits[0]["lon"]), 4)]


def main():
    with open(UTILITIES) as fh:
        roster = json.load(fh)
    cache = {}
    if os.path.exists(CACHE):
        with open(CACHE) as fh:
            cache = json.load(fh)

    missing = [u for u in roster["utilities"] if u["id"] not in cache]
    print(f"{len(cache)} cached, {len(missing)} to look up")
    for u in missing:
        try:
            hit = lookup(u["primary_city"])
        except Exception as exc:                      # noqa: BLE001 - report, keep going
            print(f"  ! {u['id']} ({u['primary_city']}): {exc}")
            continue
        if hit:
            cache[u["id"]] = hit
            print(f"  {u['id']:26s} {u['primary_city']:20s} {hit}")
        else:
            print(f"  ? {u['id']} ({u['primary_city']}): no geocode result")
        time.sleep(1.1)                              # Nominatim: <=1 req/sec

    with open(CACHE, "w") as fh:
        json.dump(cache, fh, indent=2, sort_keys=True)
    print(f"cached {len(cache)} centers -> {CACHE}")


if __name__ == "__main__":
    main()
