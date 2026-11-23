#!/usr/bin/env python3
"""Calgary in Motion: Calgary Transit GTFS + approximated regional feeds."""
import json
import os
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CITY = HERE.parent
sys.path.insert(0, str(CITY.parent / "_shared"))
sys.path.insert(0, str(HERE))
import motion_build as mb  # noqa: E402
import regional  # noqa: E402

CALGARY = {
    "id": "calgary", "agency": "Calgary Transit",
    "url": "https://data.calgary.ca/download/npk7-z3bj/application%2Fzip",
    "kind": "calgary", "color": "d81b7a",
}

# The feed carries no route colours, so the CTrain lines and the MAX family are
# coloured from the operator's own line branding.
CTRAIN_COLOURS = {"201": "d22630", "202": "0f6fbf"}
MAX_COLOURS = {
    "MG": "00a651",   # MAX Green
    "MO": "f58220",   # MAX Orange
    "MY": "ffc72c",   # MAX Yellow
    "MT": "009ca6",   # MAX Teal
    "MP": "7b2d8e",   # MAX Purple
    "302": "b5121b",  # BRT Southeast
}

CACHE = HERE / "gtfs"

FEEDS = [CALGARY] + [
    dict(feed, approx_writer=regional.write_feed)
    for feed in regional.build_feeds(str(CACHE))
]


def classify(feed, route_id, route_type, route_color="", agency="", route_name="",
             route_short=""):
    if feed["kind"] == "calgary":
        if route_type == 0:
            return ("lrt", CTRAIN_COLOURS.get(route_short.strip(), "d22630"))
        if route_type == 3:
            short = route_short.strip()
            if short in MAX_COLOURS:
                return ("brt", MAX_COLOURS[short])
            if re.search(r"\bMAX\b|bus rapid", route_name, re.I):
                return ("brt", "7b2d8e")
            return ("localbus", feed["color"])
        return None
    return ("regionalbus", (route_color or feed["color"]).lstrip("#").lower())


def extra_outputs(ctx):
    """Calgary's vehicle-position feed carries a trip_id but no route_id.

    Emit a trip -> route-key table so the live worker can put each vehicle on a
    static route; the feed is keyless but route-less, so this is the only way
    to join the two without a key.
    """
    keys = sorted(ctx["routes"])
    index = {key: i for i, key in enumerate(keys)}
    trips = {}
    for feed in FEEDS:
        path = os.path.join(CFG["cache"], feed["id"])
        for row in mb.read_csv(path, "trips.txt"):
            key = f"{feed['id']}:{row['route_id']}"
            if key in index:
                trips[row["trip_id"]] = index[key]
    out = os.path.join(ctx["out_dir"], "live-trips.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump({"routes": keys, "trips": trips}, fh, separators=(",", ":"))
    print(f"wrote {out}  {os.path.getsize(out)/1e6:.2f} MB  ({len(trips)} trips)",
          file=sys.stderr)


CFG = {
    "city": "Calgary and the Bow Valley",
    "cache": str(CACHE),
    "out": os.environ.get("MOTION_OUT", str(CITY / "data.json")),
    "timeZone": "America/Edmonton",
    "zoneLabel": "MT",
    "lat0": 51.05,
    "sun": (51.0447, -114.0719),
    "modes": ["lrt", "brt", "localbus", "regionalbus"],
    "railModes": ["lrt"],
    "feeds": FEEDS,
    "classify": classify,
    "extras": extra_outputs,
}

if __name__ == "__main__":
    # The build labels its three days "the latest weekday / Saturday / Sunday",
    # and Calgary Transit marks statutory holidays with calendar_dates
    # exceptions (Remembrance Day runs a Saturday schedule). Anchoring on such
    # a Wednesday would show a Saturday timetable under the Weekday tab, so
    # step the reference date back until none of the three days is an exception.
    from datetime import date, datetime, timedelta
    from zoneinfo import ZoneInfo

    for feed in FEEDS:
        mb.feed_dir(feed, CFG["cache"])
    exceptions = set()
    for feed in FEEDS:
        path = os.path.join(CFG["cache"], feed["id"])
        cal_dates = os.path.join(path, "calendar_dates.txt")
        if os.path.exists(cal_dates):
            exceptions |= {row["date"] for row in mb.read_csv(path, "calendar_dates.txt")}

    today = datetime.now(ZoneInfo(CFG["timeZone"])).date()
    if os.environ.get("MOTION_REFERENCE_DATE"):
        CFG["referenceDate"] = os.environ["MOTION_REFERENCE_DATE"]
    else:
        for offset in range(14):
            ref = today - timedelta(days=offset)
            specs = mb.make_day_specs(dict(CFG, referenceDate=ref.isoformat()))
            if not any(spec["ymd"] in exceptions for spec in specs):
                CFG["referenceDate"] = ref.isoformat()
                print(f"reference date {ref.isoformat()} "
                      f"({', '.join(s['iso'] for s in specs)})", file=sys.stderr)
                break

    mb.run(CFG)
    if CFG.get("referenceDate"):
        out = Path(CFG["out"])
        doc = json.loads(out.read_text())
        doc["referenceDate"] = CFG["referenceDate"]
        out.write_text(json.dumps(doc, separators=(",", ":")))
