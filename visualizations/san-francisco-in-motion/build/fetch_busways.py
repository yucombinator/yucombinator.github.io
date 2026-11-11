#!/usr/bin/env python3
"""Build ../busways.json: Bay Area dedicated busways and major bus lanes.

Only mapped infrastructure is drawn. BRT routes themselves are not used as a
proxy. Re-run when a corridor opens; the output is committed and is not part
of the daily GTFS refresh.

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
UA = "sf-in-motion/1.0 (yuchenhou.com)"
BOUNDS = "(37.2,-123.1,38.2,-121.5)"

# OSM names -> display group. Longer/more specific names first.
CORRIDORS = [
    ("International Boulevard", "AC Transit Tempo · International Blvd"),
    ("Van Ness Bus Rapid Transit", "Van Ness BRT"),
    ("Van Ness Avenue", "Van Ness BRT"),
    ("Geary Boulevard", "Geary Rapid · Geary Blvd"),
    ("Geary Street", "Geary Rapid · Geary Blvd"),
    ("Mission Street", "Mission St transit lanes"),
    ("Transbay Bus Ramp", "Transbay Bus Ramp"),
    ("Sutter Street", "Sutter/Post transit lanes"),
    ("Post Street", "Sutter/Post transit lanes"),
    ("Market Street", "Market St transit lanes"),
    ("Alum Rock Avenue", "Alum Rock Ave bus lanes"),
]
_NAMES = "|".join(n for n, _ in CORRIDORS)

QUERY_DEDICATED = f"""[out:json][timeout:180];
way["highway"="busway"]{BOUNDS};
out tags geom;"""
QUERY_LANES = f"""[out:json][timeout:180];
way["name"~"{_NAMES}"][~"^(busway.*|lanes:bus.*|bus:lanes.*|lanes:psv.*)$"~"."]{BOUNDS};
out tags geom;"""

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]


def overpass(query):
    last = None
    for _ in range(2):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(
                    url,
                    data=urllib.parse.urlencode({"data": query}).encode(),
                    headers={"User-Agent": UA},
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except Exception as exc:  # noqa: BLE001
                last = exc
                print(f"  ! {url.split('/')[2]}: {type(exc).__name__}", file=sys.stderr)
    raise last


def group_for(tags):
    name = tags.get("name", "")
    for street, label in CORRIDORS:
        if street.lower() in name.lower():
            return label
    return None


def dp(points, tol=0.00008):
    if len(points) <= 2:
        return points
    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = points[a]
        bx, by = points[b]
        dx, dy = bx - ax, by - ay
        norm = math.hypot(dx, dy) or 1
        best = -1
        bestd = 0
        for i in range(a + 1, b):
            px, py = points[i]
            d = abs(dy * px - dx * py + bx * ay - by * ax) / norm
            if d > bestd:
                bestd, best = d, i
        if bestd > tol:
            keep[best] = True
            stack.extend([(a, best), (best, b)])
    return [p for p, k in zip(points, keep) if k]


def collect(elements, groups, source):
    for e in elements:
        tags = e.get("tags") or {}
        label = group_for(tags)
        if not label:
            continue
        geom = e.get("geometry") or []
        pts = [[round(g["lat"], 6), round(g["lon"], 6)] for g in geom if g.get("lat") is not None]
        if len(pts) < 2:
            continue
        pts = dp(pts)
        groups.setdefault(label, []).append(pts)


def main():
    groups = {}
    for label, query in (("dedicated", QUERY_DEDICATED), ("lanes", QUERY_LANES)):
        try:
            data = overpass(query)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {label}: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        collect(data.get("elements", []), groups, label)
        print(f"  {label}: {len(data.get('elements', []))} ways", file=sys.stderr)

    out = []
    for name in sorted(groups):
        lines = groups[name]
        # Keep the overlay legible: cap duplicate fragments per group.
        if len(lines) > 160:
            lines = lines[:160]
        out.append({"name": name, "lines": lines, **({"solid": True} if "BRT" in name or "Tempo" in name else {})})
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({"groups": out}, fh, ensure_ascii=False, separators=(",", ":"))
    for g in out:
        print(f"  {g['name']:40s} {len(g['lines']):4d} ways", file=sys.stderr)
    print(f"wrote {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
