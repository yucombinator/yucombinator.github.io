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

# Documented BAT stretch on SR 99/Evergreen Way in Snohomish County: WSDOT's
# 2026 SR 99 study lists complete BAT lanes from 156th to 212th St SW. OSM
# does not tag those lanes, so this corridor is clipped from the road's own
# geometry by latitude instead of by lane tags.
BAT_BOUNDS = "(47.782,-122.37,47.87,-122.25)"
BAT_RANGES = [(47.7860, 47.8070), (47.8055, 47.8585)]
BAT_NAME = "Swift Blue · SR 99 BAT lanes (156th–212th + Edmonds)"

# OSM splits Madison St into short lane ways with gaps between 1st and 8th.
# This centerline follows the street geometry so RapidRide G reads as one
# continuous busway there; east of 8th keeps the individually tagged ways.
G_NAME = "RapidRide G · Madison St"
G_CONNECTOR = [
    [47.604693,-122.336247], [47.604748,-122.336114], [47.604759,-122.336089], [47.604949,-122.335631],
    [47.605101,-122.335266], [47.605157,-122.335131], [47.605189,-122.335058], [47.605214,-122.334998],
    [47.605266,-122.334878], [47.605387,-122.334593], [47.605401,-122.33456], [47.605584,-122.334131],
    [47.605629,-122.334026], [47.60567,-122.333927], [47.60603,-122.33305], [47.606061,-122.332975],
    [47.606087,-122.332913], [47.606137,-122.332792], [47.606381,-122.332209], [47.606501,-122.331923],
    [47.606544,-122.33182], [47.606594,-122.331701], [47.606782,-122.331254], [47.60683,-122.331139],
    [47.60698,-122.330806], [47.607019,-122.330714], [47.607054,-122.330632], [47.607456,-122.329673],
    [47.607487,-122.3296], [47.607541,-122.329485], [47.607728,-122.329031], [47.60774,-122.32888],
    [47.607869,-122.328574], [47.607948,-122.328476],
]

QUERY_BAT = f"""[out:json][timeout:120];
(
 way["name"~"Pacific Highway|Evergreen Way|Highway 99"]{BAT_BOUNDS};
 way["ref"~"^(SR|WA) 99$"]{BAT_BOUNDS};
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


def collect_bat(elements, groups, stats):
    def inside(lat):
        return any(lo <= lat <= hi for lo, hi in BAT_RANGES)

    def emit(seg):
        if len(seg) < 2:
            return
        lat0 = seg[0][0]
        sx, sy = 111320.0 * math.cos(math.radians(lat0)), 111320.0
        simp = dp([(lon * sx, lat * sy) for lat, lon in seg], 8.0)
        lines.append([[round(y / sy, 6), round(x / sx, 6)] for x, y in simp])

    lines = []
    for el in elements:
        run = []
        for p in el.get("geometry", []):
            lat, lon = p["lat"], p["lon"]
            if inside(lat):
                run.append((lat, lon))
            elif run:
                emit(run)
                run = []
        emit(run)
    if lines:
        groups[BAT_NAME] = lines
        stats[BAT_NAME] = len(lines)


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
    for label, query in (("dedicated", QUERY_DEDICATED), ("lanes", QUERY_LANES),
                         ("bat", QUERY_BAT)):
        try:
            data = overpass(query)
        except Exception as exc:              # noqa: BLE001
            print(f"  ! {label}: {type(exc).__name__}: {exc} "
                  f"(keeping the previous {label} corridors)", file=sys.stderr)
            keep = ((lambda n: True) if label == "dedicated" else
                    (lambda n: n == BAT_NAME) if label == "bat" else
                    (lambda n: n in LANE_GROUP_PREFIXES))
            for name, lines in old.items():
                if keep(name):
                    groups[name] = lines
                    stats[name] = len(lines)
            continue
        if label == "bat":
            collect_bat(data.get("elements", []), groups, stats)
        else:
            collect(data.get("elements", []), groups, stats, label)

    g_lines = groups.get(G_NAME)
    if g_lines is not None:
        groups[G_NAME] = [G_CONNECTOR] + [
            line for line in g_lines if min(p[1] for p in line) > -122.3285
        ]
        stats[G_NAME] = len(groups[G_NAME])

    out = {"groups": [
        {"name": n, "lines": ls, **({"solid": True} if n == G_NAME else {})}
        for n, ls in sorted(groups.items())
    ]}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    pts = sum(len(line) for g in out["groups"] for line in g["lines"])
    for name, n in sorted(stats.items()):
        print(f"  {name:32s} {n:4d} ways", file=sys.stderr)
    print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.0f} KB  "
          f"({len(groups)} groups, {pts} points)", file=sys.stderr)


if __name__ == "__main__":
    main()
