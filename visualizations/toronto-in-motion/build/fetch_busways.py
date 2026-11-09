#!/usr/bin/env python3
"""Build ../busways.json: dedicated busways and RapidTO bus lanes.

Sources OpenStreetMap via Overpass (no key). Two queries:

  1. highway=busway          dedicated transitways (Mississauga, Viva, the
                             Scarborough busway, York University)
  2. busway=lane             painted RapidTO lanes on the corridors in the
     + name filter           city's programme: Eglinton East, Jane, Dufferin,
                             Lawrence East, Finch East, Bathurst, Steeles West

Output is small and committed; corridors change rarely, so this is not part
of the daily GTFS refresh. Re-run it when a corridor opens.

    python3 build/fetch_busways.py
"""

import json
import math
import os
import sys
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "busways.json"))
UA = "toronto-in-motion/1.0 (yuchenhou.com)"
BOUNDS = "(42.9,-81.6,44.7,-77.4)"

RAPIDTO_STREETS = [
    "Eglinton Avenue East", "Jane Street", "Dufferin Street",
    "Lawrence Avenue East", "Finch Avenue East", "Bathurst Street",
    "Steeles Avenue West",
]

QUERY_DEDICATED = f"""[out:json][timeout:120];
way["highway"="busway"]{BOUNDS};
out tags geom;"""

_STREETS = "|".join(RAPIDTO_STREETS)
CITY_BOUNDS = "(43.58,-79.65,43.86,-79.1)"
QUERY_LANES = f"""[out:json][timeout:120];
(
 way["name"~"{_STREETS}"]["lanes:bus"]{CITY_BOUNDS};
 way["name"~"{_STREETS}"]["bus:lanes"]{CITY_BOUNDS};
 way["name"~"{_STREETS}"]["bus_lane"]{CITY_BOUNDS};
 way["name"~"{_STREETS}"]["busway"]{CITY_BOUNDS};
);
out tags geom;"""


ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def overpass(query):
    last = None
    for attempt in range(2):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(
                    url,
                    data=urllib.parse.urlencode({"data": query}).encode(),
                    headers={"User-Agent": UA},
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:          # noqa: BLE001
                last = exc
                print(f"  ! {url.split('/')[2]}: {type(exc).__name__}", file=sys.stderr)
    raise last


def group_for(tags, source):
    name = tags.get("name", "")
    if source == "rapidto":
        for street in RAPIDTO_STREETS:
            if street in name:
                return f"RapidTO · {street}"
        return None
    if "Mississauga Transitway" in name:
        return "Mississauga Transitway"
    if "Scarborough Busway" in name:
        return "Scarborough busway"
    if "York University Busway" in name:
        return "York University busway"
    if "Rapidway" in name:
        return "Viva rapidway"
    for street in RAPIDTO_STREETS:
        if street in name:
            return f"RapidTO · {street}"
    return None


def dp(points, tol):
    if len(points) < 3:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        best_i, best_d = -1, tol * tol
        for i in range(a + 1, b):
            px, py = points[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = ((px - ax) * dx + (py - ay) * dy) / seg2
                t = max(0.0, min(1.0, t))
                qx, qy = ax + t * dx, ay + t * dy
                d2 = (px - qx) ** 2 + (py - qy) ** 2
            if d2 > best_d:
                best_i, best_d = i, d2
        if best_i >= 0:
            keep[best_i] = True
            stack.append((a, best_i))
            stack.append((best_i, b))
    return [p for p, k in zip(points, keep) if k]


def collect(elements, groups, stats, source):
    for el in elements:
        tags = el.get("tags", {})
        name = group_for(tags, source)
        if not name:
            continue
        geom = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if len(geom) < 2:
            continue
        # planar simplification at ~8 m
        lat0 = geom[0][0]
        scale = (111320.0, 111320.0 * math.cos(math.radians(lat0)))
        xy = [(lon * scale[1], lat * scale[0]) for lat, lon in geom]
        simp = dp(xy, 8.0)
        line = [[round(y / scale[0], 6), round(x / scale[1], 6)] for x, y in simp]
        groups.setdefault(name, []).append(line)
        stats[name] = stats.get(name, 0) + 1


DEDICATED_NAMES = {"Mississauga Transitway", "Scarborough busway",
                   "Viva rapidway", "York University busway"}


def main():
    old = {}
    if os.path.exists(OUT):
        try:
            with open(OUT, encoding="utf-8") as fh:
                for g in json.load(fh).get("groups", []):
                    old[g["name"]] = g["lines"]
        except Exception:                     # noqa: BLE001
            old = {}

    groups, stats = {}, {}
    for label, query in (("dedicated", QUERY_DEDICATED), ("rapidto", QUERY_LANES)):
        try:
            data = overpass(query)
        except Exception as exc:              # noqa: BLE001
            print(f"  ! {label}: {type(exc).__name__}: {exc} "
                  f"(keeping the previous {label} corridors)", file=sys.stderr)
            keep = (lambda n: n in DEDICATED_NAMES) if label == "dedicated" \
                else (lambda n: n.startswith("RapidTO"))
            for name, lines in old.items():
                if keep(name):
                    groups[name] = lines
                    stats[name] = len(lines)
            continue
        collect(data.get("elements", []), groups, stats, label)

    out = {"groups": [{"name": n, "lines": ls} for n, ls in sorted(groups.items())]}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    pts = sum(len(line) for g in out["groups"] for line in g["lines"])
    for name, n in sorted(stats.items()):
        print(f"  {name:32s} {n:4d} ways", file=sys.stderr)
    print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.0f} KB  "
          f"({len(groups)} groups, {pts} points)", file=sys.stderr)


if __name__ == "__main__":
    main()
