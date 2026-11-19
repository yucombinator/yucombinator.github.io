#!/usr/bin/env python3
"""Build ../busways.json: dedicated busways and painted bus lanes in the
Ottawa–Gatineau region, from OpenStreetMap via Overpass (no key).

Only real infrastructure is drawn: dedicated `highway=busway` ways and ways
tagged with bus lanes. BRT routes themselves are not used as a proxy.

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
UA = "ottawa-in-motion/1.0 (yuchenhou.com)"
BOUNDS = "(45.2,-76.2,45.65,-75.35)"

BUS_CORRIDORS = [
    ("Woodroffe Avenue", "Woodroffe Ave · bus lanes"),
    ("Strandherd Drive", "Strandherd Dr · bus lanes"),
    ("Heron Road", "Heron Rd · bus lanes"),
    ("Carling Avenue", "Carling Ave · bus lanes"),
    ("Baseline Road", "Baseline Rd · bus lanes"),
    ("Scott Street", "Scott St · bus lanes"),
    ("Bank Street", "Bank St · bus lanes"),
    ("Walkley Road", "Walkley Rd · bus lanes"),
    ("Greenbank Road", "Greenbank Rd · bus lanes"),
    ("Pinecrest Road", "Pinecrest Rd · bus lanes"),
    ("Earl Armstrong Road", "Earl Armstrong · bus lanes"),
    ("Tenth Line Road", "Tenth Line · bus lanes"),
    ("Boulevard de la Carrière", "Rapibus · de la Carrière"),
    ("Boulevard de la Gappe", "Rapibus · de la Gappe"),
    ("Boulevard Fournier", "Rapibus · Fournier"),
    ("Boulevard des Allumettières", "des Allumettières · bus lanes"),
    ("Boulevard Alexandre-Taché", "Alexandre-Taché · bus lanes"),
    ("Rue Montcalm", "Montcalm · bus lanes"),
    ("Boulevard Gréber", "Gréber · bus lanes"),
    ("Montée Paiement", "Paiement · bus lanes"),
    ("Navaho Drive", "Navaho Dr · bus lanes"),
    ("Campus Avenue", "Campus Ave · bus lanes"),
    ("Boulevard de la Cité-des-Jeunes", "Cité-des-Jeunes · bus lanes"),
]

NAMES = "|".join(name for name, _ in BUS_CORRIDORS)

QUERY_DEDICATED = f"""[out:json][timeout:120];
way["highway"="busway"]{BOUNDS};
out tags geom;"""

QUERY_LANES = f"""[out:json][timeout:120];
way["name"~"{NAMES}"][~"^(busway.*|lanes:bus.*|bus:lanes.*|lanes:psv.*)$"~"."]{BOUNDS};
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


def dp(points, tolerance):
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
        best_i, best_d = -1, tolerance * tolerance
        for i in range(a + 1, b):
            px, py = points[i]
            if seg2 == 0:
                d2 = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
                qx, qy = ax + t * dx, ay + t * dy
                d2 = (px - qx) ** 2 + (py - qy) ** 2
            if d2 > best_d:
                best_i, best_d = i, d2
        if best_i >= 0:
            keep[best_i] = True
            stack.append((a, best_i))
            stack.append((best_i, b))
    return [p for p, k in zip(points, keep) if k]


def group_for(tags, source):
    name = tags.get("name", "")
    if source == "dedicated":
        return "STO Rapibus · dedicated busway"
    for street, label in BUS_CORRIDORS:
        if street in name:
            return label
    return None


def collect(elements, groups, source):
    for el in elements:
        name = group_for(el.get("tags", {}), source)
        if not name:
            continue
        geom = [(p["lat"], p["lon"]) for p in el.get("geometry", [])]
        if len(geom) < 2:
            continue
        lat0 = geom[0][0]
        scale = (111320.0, 111320.0 * math.cos(math.radians(lat0)))
        xy = [(lon * scale[1], lat * scale[0]) for lat, lon in geom]
        line = [[round(y / scale[0], 6), round(x / scale[1], 6)]
                for x, y in dp(xy, 8.0)]
        groups.setdefault(name, []).append(line)


def main():
    groups = {}
    for source, query in (("dedicated", QUERY_DEDICATED), ("lanes", QUERY_LANES)):
        try:
            data = overpass(query)
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {source}: {type(exc).__name__}: {exc}", file=sys.stderr)
            continue
        collect(data.get("elements", []), groups, source)
        print(f"  {source}: {len(data.get('elements', []))} ways", file=sys.stderr)

    out = {"groups": [
        {"name": name, "solid": name.startswith("STO Rapibus"), "lines": lines}
        for name, lines in sorted(groups.items())
    ]}
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"wrote {OUT} ({len(groups)} corridors)", file=sys.stderr)


if __name__ == "__main__":
    main()
