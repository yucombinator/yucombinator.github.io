#!/usr/bin/env python3
"""Build ../busways.json: dedicated busways and painted bus lanes around Puget
Sound, from OpenStreetMap via Overpass (no key).

Only real infrastructure is drawn: dedicated busways plus ways tagged with
bus lanes on the corridors where they exist. BRT routes themselves are not
used as a proxy (Swift Orange, for example, runs mostly in general traffic).

Re-run when a corridor opens; the output is committed and not part of the
daily GTFS refresh.

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
UA = "seattle-in-motion/1.0 (yuchenhou.com)"
BOUNDS = "(47.0,-122.7,48.15,-121.9)"

BUS_CORRIDORS = [
    ("Aurora Avenue North", "RapidRide E / Swift Blue · Aurora Ave N"),
    ("Pacific Highway South", "RapidRide A · Pacific Hwy S"),
    ("Rainier Avenue South", "RapidRide · Rainier Ave S"),
    ("Madison Street", "RapidRide G · Madison St"),
    ("3rd Avenue", "Downtown · 3rd Ave"),
    ("4th Avenue South", "SODO · 4th Ave S"),
    ("Spring Street", "Downtown · Spring St"),
    ("Montlake Boulevard", "Montlake · bus lanes"),
]

QUERY_DEDICATED = f"""[out:json][timeout:180];
way["highway"="busway"]{BOUNDS};
out tags geom;"""

_NAMES = "|".join(n for n, _ in BUS_CORRIDORS)
QUERY_LANES = f"""[out:json][timeout:180];
(
 way["name"~"{_NAMES}"][~"^(busway.*|lanes:bus.*|bus:lanes.*|lanes:psv.*)$"~"."]{BOUNDS};
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
    if source == "lanes":
        for street, label in BUS_CORRIDORS:
            if street in name:
                return label
        return None
    # dedicated highway=busway ways: reuse the corridor labels when named
    for street, label in BUS_CORRIDORS:
        if street in name:
            return label
    if name:
        return name
    return "Dedicated busway"


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


LANE_GROUP_PREFIXES = {label for _, label in BUS_CORRIDORS}


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
    for label, query in (("dedicated", QUERY_DEDICATED), ("lanes", QUERY_LANES)):
        try:
            data = overpass(query)
        except Exception as exc:              # noqa: BLE001
            print(f"  ! {label}: {type(exc).__name__}: {exc} "
                  f"(keeping the previous {label} corridors)", file=sys.stderr)
            keep = (lambda n: True) if label == "dedicated" \
                else (lambda n: n in LANE_GROUP_PREFIXES)
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
