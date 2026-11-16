"""Airdrie Transit, rebuilt from the City's own GIS layers and PDF timetables.

Geometry comes from Airdrie's open-data route and stop layers (the City
describes them as GTFS-derived). Spans, headways and run times come from the
route timetables effective 2026-01-01.
"""
import os

import sources

ROUTES_URL = ("https://hub.arcgis.com/api/v3/datasets/"
              "e4625b7cf3634377a945d89e7d7c1fb3_0/downloads/data"
              "?format=geojson&spatialRefId=4326&where=1%3D1")
STOPS_URL = ("https://hub.arcgis.com/api/v3/datasets/"
             "d9b33fa361d949e3af9f403cfa9f3aa8_0/downloads/data"
             "?format=geojson&spatialRefId=4326&where=1%3D1")

WEEKDAY = ["06:00", "20:00", 1800]
SATURDAY = ["07:00", "20:00", 3600]

CACHE_NAME = "airdrie"


def _geometry(cache):
    base = os.path.join(cache, "_src")
    lines = sources.read_lines(sources.fetch_json(ROUTES_URL,
                                                  os.path.join(base, "airdrie-routes.geojson")))
    points = sources.read_points(sources.fetch_json(STOPS_URL,
                                                   os.path.join(base, "airdrie-stops.geojson")))

    def path(name):
        return lines[name][0]["path"]

    def stops(name, tolerance=90.0):
        return sources.snap_stops(path(name), points, tolerance)

    return path, stops, points


def _loop(path_a, path_b):
    """Join two complementary halves of a loop into one circuit."""
    cat = list(path_a) + list(path_b)
    return sources.stitch([cat])


def feed(cache):
    path, stops, pts = _geometry(cache)

    r1_loop = _loop(path("Route 1 Outbound"), path("Route 1 Inbound"))
    r3_loop = _loop(path("Route 3 Outbound"), path("Route 3 Inbound"))
    r900 = path("Route 900 Inbound")            # Rundle LRT -> Airdrie, 24 stops
    r900_rev = r900[::-1]
    r901 = path("Route 901AM Outbound")         # downtown -> Airdrie
    r902 = path("Route 902AM Outbound")         # downtown -> Airdrie

    return {
        "id": "airdrie",
        "agency": "Airdrie Transit",
        "url": "https://www.airdrie.ca/transit",
        "color": "0b5cad",
        "kind": "airdrie",
        "routes": [
            {
                "id": "1", "short": "1", "long": "South Terminal / Kings Heights loop",
                "color": "0b5cad", "run": 3300,
                "dirs": [{
                    "path": r1_loop,
                    "stops": sources.snap_stops(r1_loop, pts),
                    "span": {"weekday": WEEKDAY, "saturday": SATURDAY},
                }],
            },
            {
                "id": "3", "short": "3", "long": "South Terminal / Bayside loop",
                "color": "0b5cad", "run": 3420,
                "dirs": [{
                    "path": r3_loop,
                    "stops": sources.snap_stops(r3_loop, pts),
                    "span": {"weekday": WEEKDAY, "saturday": SATURDAY},
                }],
            },
            {
                "id": "900", "short": "900", "long": "Airdrie \u2013 CrossIron Mills \u2013 Rundle LRT",
                "color": "1266a8", "run": 3300,
                "dirs": [
                    {"path": r900_rev, "stops": sources.snap_stops(r900_rev, pts),
                     "span": {"weekday": ["06:15", "21:15", 3600],
                              "saturday": ["06:15", "21:15", 3600],
                              "sunday": ["08:15", "19:15", 3600]}},
                    {"path": r900, "stops": sources.snap_stops(r900, pts),
                     "span": {"weekday": ["06:35", "21:35", 3600],
                              "saturday": ["06:35", "21:35", 3600],
                              "sunday": ["08:35", "19:35", 3600]}},
                ],
            },
            {
                "id": "901", "short": "901", "long": "ICE \u2014 East Airdrie / Downtown Calgary",
                "color": "0b5cad", "run": 2520,
                "dirs": [
                    {"path": r901[::-1], "stops": sources.snap_stops(r901[::-1], pts),
                     "span": {"weekday": ["06:00", "06:20"]}},
                    {"path": r901, "stops": sources.snap_stops(r901, pts),
                     "span": {"weekday": ["15:30", "17:00"]}},
                ],
            },
            {
                "id": "902", "short": "902", "long": "ICE \u2014 West Airdrie / Downtown Calgary",
                "color": "0b5cad", "run": 4380,
                "dirs": [
                    {"path": r902[::-1], "stops": sources.snap_stops(r902[::-1], pts),
                     "span": {"weekday": ["06:13", "06:38", "06:55", "07:22",
                                          "15:20", "15:40", "16:00", "16:35"]}},
                    {"path": r902, "stops": sources.snap_stops(r902, pts),
                     "span": {"weekday": ["07:26", "07:50", "08:15", "08:44",
                                          "16:00", "16:20", "16:40", "17:20"]}},
                ],
            },
        ],
    }
