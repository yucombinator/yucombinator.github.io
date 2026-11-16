"""Falcon Bus (Falcon Transportation Solutions) — the commuter operators that
replaced On-It in June 2026 on the Cochrane and Okotoks corridors.

Falcon publishes no map and no machine-readable data, so the alignments here are
corridor approximations between the published stops and the timetable's
departure lists are transcribed from falconbus.ca/schedules.
"""

COCHRANE_PATH = [
    (51.189285, -114.471195),   # Cochrane, The Station (360 Railway St W)
    (51.1906, -114.4520),       # Hwy 1A eastbound
    (51.1830, -114.4090),
    (51.1620, -114.3470),
    (51.1390, -114.2690),
    (51.1210, -114.2010),       # Hwy 1A / Stoney Trail NW
    (51.1020, -114.1620),       # Crowchild Trail NW
    (51.086623, -114.132521),   # Brentwood LRT, university side
    (51.080658, -114.130391),   # University ICT Loop
    (51.0670, -114.1180),       # Crowchild Trail S
    (51.0497, -114.0720),       # 4 Av SW at 1 St SW
    (51.044573, -114.072733),   # 9 Av SW at 4-5 St SW
]

OKOTOKS_PATH = [
    (50.731108, -113.964838),   # Okotoks Recreation Centre, 99 Okotoks Dr
    (50.7600, -113.9850),
    (50.8200, -114.0150),       # Hwy 2 northbound
    (50.8900, -114.0450),
    (50.9600, -114.0650),
    (51.0086, -114.0735),       # Chinook Centre
    (51.044573, -114.072733),   # 9 Av SW at 4-5 St SW
]

COCHRANE_STOPS = [
    ("Cochrane \u2014 The Station", 51.189285, -114.471195),
    ("Brentwood LRT Station", 51.086623, -114.132521),
    ("University of Calgary (ICT)", 51.080658, -114.130391),
    ("4 Av SW at 1 St SW", 51.0497, -114.0720),
    ("9 Av SW at 4\u20135 St SW", 51.044573, -114.072733),
]

OKOTOKS_STOPS = [
    ("Okotoks Recreation Centre", 50.731108, -113.964838),
    ("Chinook Centre", 51.0086, -114.0735),
    ("4 Av SW at 1 St SW", 51.0497, -114.0720),
    ("9 Av SW at 4\u20135 St SW", 51.044573, -114.072733),
]


def feed(cache):
    return {
        "id": "falcon",
        "agency": "Falcon Bus",
        "url": "https://falconbus.ca/schedules/",
        "color": "d64123",
        "kind": "falcon",
        "routes": [
            {
                "id": "cochrane", "short": "C", "long": "Cochrane \u2013 Calgary (Falcon)",
                "color": "d64123", "run": 5400,
                "dirs": [
                    {"path": COCHRANE_PATH, "stops": COCHRANE_STOPS,
                     "span": {"weekday": ["06:25", "08:00", "10:00", "15:30", "17:30"]}},
                    {"path": COCHRANE_PATH[::-1], "stops": list(reversed(COCHRANE_STOPS)),
                     "span": {"weekday": ["07:15", "09:00", "14:30", "16:20", "18:00"]}},
                ],
            },
            {
                "id": "okotoks", "short": "O", "long": "Okotoks \u2013 Calgary (Falcon)",
                "color": "d64123", "run": 2700,
                "dirs": [
                    {"path": OKOTOKS_PATH, "stops": OKOTOKS_STOPS,
                     "span": {"weekday": ["06:25", "13:45"]}},
                    {"path": OKOTOKS_PATH[::-1], "stops": list(reversed(OKOTOKS_STOPS)),
                     "span": {"weekday": ["13:00", "16:25"]}},
                ],
            },
        ],
    }
