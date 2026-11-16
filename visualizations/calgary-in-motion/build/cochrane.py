"""Cochrane COLT local transit, rebuilt from the Town's GIS layers.

Geometry comes from Cochrane's GeoHub (COLT fixed routes and stops, refreshed
2026-11-02); spans and headways from the 2026 brochures. COLT runs Mon-Sat,
hourly, with the final trip of each route not operating on Saturdays.
"""
import os

import sources

ROUTES_URL = ("https://services5.arcgis.com/M1SNYuFIW9v2gSO7/arcgis/rest/services/"
              "COLT_Bus_Fixed_Routes/FeatureServer/33/query"
              "?where=1%3D1&outFields=*&outSR=4326&f=geojson")
STOPS_URL = ("https://services5.arcgis.com/M1SNYuFIW9v2gSO7/arcgis/rest/services/"
             "COLT_Bus_Stops/FeatureServer/16/query"
             "?where=1%3D1&outFields=*&outSR=4326&f=geojson")

CACHE_NAME = "cochrane"


def every(first, last, step, offset=0):
    """Departure list from HH:MM..HH:MM every step seconds."""
    start = secs_of(first) + offset
    end = secs_of(last)
    return [fmt(t) for t in range(start, end + 1, step)]


def secs_of(value):
    h, m = value.split(":")
    return int(h) * 3600 + int(m) * 60


def fmt(sec):
    sec %= 24 * 3600
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}"


def feed(cache):
    base = os.path.join(cache, "_src")
    # COLT groups its segments by RouteNum rather than SHAPE_NAME, so the raw
    # collection is read directly instead of through read_lines().
    per_route = {}
    raw = sources.fetch_json(ROUTES_URL, os.path.join(base, "colt-routes.geojson"))
    for feature in raw["features"]:
        props = feature["properties"]
        num = str(props.get("RouteNum"))
        geom = feature["geometry"]
        parts = ([geom["coordinates"]] if geom["type"] == "LineString"
                 else geom["coordinates"])
        per_route.setdefault(num, []).extend(
            [[(lat, lon) for lon, lat in part] for part in parts])

    stops_by_route = {}
    raw_stops = sources.fetch_json(STOPS_URL, os.path.join(base, "colt-stops.geojson"))
    for feature in raw_stops["features"]:
        props = feature["properties"]
        if props.get("Stop_Type") != "Fixed Route":
            continue
        nums = [n.strip() for n in str(props.get("Route_Number") or "").split(",")]
        for num in nums:
            stops_by_route.setdefault(num, []).append(
                (props["Stop_Name____"].strip(), props["Latitude"], props["Longitude"]))

    routes = []
    specs = {
        "1": ("Sunset Ridge \u2013 Downtown \u2013 SLS Centre", "06:18", "17:09", "16:09", 2940),
        "2": ("Heritage Hills \u2013 Downtown \u2013 Cochrane Arena", "06:34", "17:25", "16:25", 3060),
        "3": ("Fireside \u2013 Downtown \u2013 SLS Centre", "06:17", "18:17", "17:17", 3600),
    }
    for num, (long_name, first, weekday_last, saturday_last, run) in specs.items():
        path = sources.stitch(per_route[num])
        stops = sources.snap_stops(path, stops_by_route.get(num, []))
        if len(stops) < 2:
            raise RuntimeError(f"COLT route {num}: only {len(stops)} stops snapped")
        span = {
            # Hourly in total: each direction every 2 h, offset by 1 h.
            "weekday": [every(first, weekday_last, 7200),
                        every(first, weekday_last, 7200, 3600)],
            "saturday": [every(first, saturday_last, 7200),
                         every(first, saturday_last, 7200, 3600)],
        }
        routes.append({
            "id": num, "short": num, "long": long_name,
            "color": "2e7d32", "run": run,
            "dirs": [
                {"path": path, "stops": stops,
                 "span": {"weekday": span["weekday"][0], "saturday": span["saturday"][0]}},
                {"path": path[::-1], "stops": list(reversed(stops)),
                 "span": {"weekday": span["weekday"][1], "saturday": span["saturday"][1]}},
            ],
        })

    return {
        "id": "cochrane",
        "agency": "Cochrane COLT",
        "url": "https://www.cochrane.ca/town-services/roads-transportation/transit",
        "color": "2e7d32",
        "kind": "cochrane",
        "routes": routes,
    }
