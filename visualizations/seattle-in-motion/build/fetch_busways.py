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

# OSM splits the bus-only stretches into short lane ways. These curated
# centerlines fill the gaps: RapidRide G runs 1st–18th on Madison, and the
# downtown 3rd Avenue bus corridor runs Battery–James.
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
    [47.607869,-122.328574], [47.607948,-122.328476], [47.607978,-122.328405], [47.608066,-122.328193],
    [47.608179,-122.327921], [47.60829,-122.327659], [47.608362,-122.327486], [47.608417,-122.327357],
    [47.608462,-122.327247], [47.608537,-122.327067], [47.60864,-122.326824], [47.608757,-122.326547],
    [47.608839,-122.326345], [47.608848,-122.326226], [47.608895,-122.326111], [47.60907,-122.325685],
    [47.609153,-122.325583], [47.609165,-122.325554], [47.609231,-122.325387], [47.609276,-122.325278],
    [47.609339,-122.325127], [47.609375,-122.325041], [47.609448,-122.324869], [47.609464,-122.324832],
    [47.609482,-122.324789], [47.609543,-122.324646], [47.609597,-122.324517], [47.609611,-122.324483],
    [47.609682,-122.324316], [47.609764,-122.324119], [47.609806,-122.32402], [47.609842,-122.323932],
    [47.609925,-122.323733], [47.610005,-122.323538], [47.610031,-122.323475], [47.610059,-122.32341],
    [47.610113,-122.323283], [47.610139,-122.323221], [47.610222,-122.323027], [47.61027,-122.322915],
    [47.610286,-122.322781], [47.610666,-122.321898], [47.610727,-122.321826], [47.61077,-122.321721],
    [47.610817,-122.321606], [47.610847,-122.321535], [47.61096,-122.32126], [47.611029,-122.321103],
    [47.611109,-122.320919], [47.611134,-122.32086], [47.611154,-122.320816], [47.611172,-122.320772],
    [47.611205,-122.320691], [47.611229,-122.320633], [47.611304,-122.320453], [47.611551,-122.319857],
    [47.611685,-122.319533], [47.611722,-122.319446], [47.611756,-122.319364], [47.611768,-122.319335],
    [47.612142,-122.318446], [47.612228,-122.31824], [47.612232,-122.31823], [47.612309,-122.318045],
    [47.612437,-122.317724], [47.61275,-122.316988], [47.612827,-122.316803], [47.612941,-122.316623],
    [47.61296,-122.316577], [47.612977,-122.316537], [47.613343,-122.315636], [47.613352,-122.315534],
    [47.613396,-122.315429], [47.613588,-122.314963], [47.613804,-122.314442], [47.613838,-122.314363],
    [47.613894,-122.31423], [47.613939,-122.314122], [47.614095,-122.313754], [47.614125,-122.313682],
    [47.614135,-122.313658], [47.614174,-122.313566], [47.614207,-122.313488], [47.614219,-122.313457],
    [47.614475,-122.312846], [47.614495,-122.312796], [47.614547,-122.312671], [47.614845,-122.311951],
    [47.614851,-122.311937], [47.615038,-122.311483], [47.615068,-122.311414], [47.615138,-122.311251],
    [47.61518,-122.31115], [47.615411,-122.310587], [47.615534,-122.310286], [47.615592,-122.310146],
    [47.615627,-122.310061], [47.61568,-122.309934], [47.61609,-122.308954], [47.616128,-122.308864],
]

THIRD_NAME = "Downtown · 3rd Ave"
THIRD_CONNECTOR = [
    [47.614567,-122.344571], [47.614376,-122.344252], [47.614267,-122.344069], [47.613987,-122.343601],
    [47.61393,-122.343505], [47.613887,-122.34343], [47.613796,-122.343273], [47.613222,-122.342282],
    [47.613171,-122.342196], [47.613112,-122.342093], [47.612745,-122.341471], [47.612608,-122.341238],
    [47.612526,-122.341098], [47.612459,-122.340983], [47.612408,-122.340897], [47.612346,-122.340791],
    [47.612065,-122.340314], [47.6117,-122.339712], [47.611633,-122.339601], [47.611598,-122.339543],
    [47.611558,-122.339484], [47.611518,-122.339438], [47.611474,-122.339395], [47.611031,-122.338983],
    [47.611006,-122.33896], [47.610834,-122.338802], [47.610745,-122.338721], [47.61067,-122.338651],
    [47.61017,-122.338192], [47.609991,-122.338027], [47.609808,-122.337858], [47.609765,-122.33782],
    [47.609703,-122.337762], [47.609575,-122.337645], [47.609102,-122.33721], [47.608823,-122.336953],
    [47.608756,-122.336891], [47.608689,-122.33683], [47.608493,-122.33665], [47.608167,-122.336348],
    [47.607831,-122.336041], [47.607762,-122.335978], [47.607717,-122.335936], [47.607115,-122.335385],
    [47.607045,-122.335321], [47.607005,-122.335284], [47.606926,-122.335212], [47.606537,-122.334866],
    [47.606399,-122.334743], [47.606336,-122.334686], [47.606273,-122.334627], [47.605692,-122.334084],
    [47.605629,-122.334026], [47.605579,-122.33398], [47.605447,-122.333865], [47.605303,-122.333735],
    [47.604975,-122.333441], [47.60491,-122.333383], [47.604845,-122.333322], [47.604324,-122.332837],
    [47.604269,-122.332786], [47.604194,-122.332716], [47.60414,-122.332667], [47.604012,-122.33255],
    [47.603833,-122.332387], [47.603544,-122.332123], [47.603482,-122.332068],
]

SOLID_GROUPS = {G_NAME, THIRD_NAME}
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

    if G_NAME in groups:
        groups[G_NAME] = [G_CONNECTOR]
        stats[G_NAME] = 1
    if THIRD_NAME in groups:
        groups[THIRD_NAME] = [THIRD_CONNECTOR]
        stats[THIRD_NAME] = 1

    out = {"groups": [
        {"name": n, "lines": ls, **({"solid": True} if n in SOLID_GROUPS else {})}
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
