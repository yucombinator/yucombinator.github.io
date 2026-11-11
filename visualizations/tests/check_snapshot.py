#!/usr/bin/env python3
"""Fail closed when a GTFS snapshot looks incomplete or stale.

Compares a freshly built city payload with the copy committed in HEAD:
relative floors catch a half-downloaded feed, the feed-set check catches a
single agency disappearing, and the date check catches frozen service days.

    python3 tests/check_snapshot.py --city vancouver-in-motion
    python3 tests/check_snapshot.py --city seattle-in-motion --data-dir /tmp/new
"""
import argparse
import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
MIN_TRIP_RATIO = 0.80
MIN_STRUCT_RATIO = 0.95
MAX_AGE_DAYS = 10
# Conservative floors so a bad previous commit cannot make the relative
# checks meaningless. Raise them when a city grows, never lower silently.
FLOORS = {
    "vancouver-in-motion": {"trips": 20000, "routes": 250, "shapes": 800,
                            "saturday": 15000, "sunday": 13000},
    "seattle-in-motion": {"trips": 15000, "routes": 300, "shapes": 800,
                          "saturday": 10000, "sunday": 9000},
}


def load(path):
    return json.loads(Path(path).read_text())


def committed(city, name):
    proc = subprocess.run(
        ["git", "show", f"HEAD:visualizations/{city}/{name}"],
        cwd=REPO, capture_output=True, text=True)
    if proc.returncode != 0:
        return None
    try:
        return json.loads(proc.stdout)
    except json.JSONDecodeError:
        return None


def feeds(doc):
    return {k.split(":", 1)[0] for k in (doc.get("routes") or {})}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", required=True)
    ap.add_argument("--data-dir", default=None)
    args = ap.parse_args()
    city = args.city
    data_dir = Path(args.data_dir) if args.data_dir else ROOT / city
    cfg = json.loads((ROOT / city / "city.js").read_text()
                     .split("=", 1)[1].strip().rstrip(";"))
    tz = ZoneInfo(cfg["timeZone"])
    fails = []

    def fail(msg):
        fails.append(msg)
        print("FAIL:", msg)

    cur = load(data_dir / "data.json")
    prev = committed(city, "data.json")
    key = (cur.get("order") or ["weekday"])[0]
    day = (cur.get("days") or {}).get(key) or {}
    trips = len(day.get("trips") or [])
    routes = len(cur.get("routes") or {})
    shapes = len(cur.get("shapes") or {})
    print(f"{city}: {day.get('label')} · {trips} weekday trips, "
          f"{routes} routes, {shapes} shapes")

    try:
        stamp = date.fromisoformat(day["date"])
    except Exception:
        fail(f"weekday date missing/invalid: {day.get('date')!r}")
        stamp = None
    if stamp:
        age = (datetime.now(tz).date() - stamp).days
        print(f"  snapshot age: {age} days")
        if age > MAX_AGE_DAYS:
            fail(f"weekday snapshot is {age} days old")

    floor = FLOORS.get(city, {})
    if floor.get("trips") and trips < floor["trips"]:
        fail(f"weekday trips {trips} below floor {floor['trips']}")
    if floor.get("routes") and routes < floor["routes"]:
        fail(f"routes {routes} below floor {floor['routes']}")
    if floor.get("shapes") and shapes < floor["shapes"]:
        fail(f"shapes {shapes} below floor {floor['shapes']}")
    if prev:
        pday = (prev.get("days") or {}).get((prev.get("order") or ["weekday"])[0]) or {}
        p_trips = len(pday.get("trips") or [])
        p_routes = len(prev.get("routes") or {})
        p_shapes = len(prev.get("shapes") or {})
        if p_trips and trips < p_trips * MIN_TRIP_RATIO:
            fail(f"weekday trips {trips} < {int(p_trips * MIN_TRIP_RATIO)} "
                 f"(80% of committed {p_trips})")
        if p_routes and routes < p_routes * MIN_STRUCT_RATIO:
            fail(f"routes {routes} < 95% of committed {p_routes}")
        if p_shapes and shapes < p_shapes * MIN_STRUCT_RATIO:
            fail(f"shapes {shapes} < 95% of committed {p_shapes}")
        lost = feeds(prev) - feeds(cur)
        if lost:
            fail(f"feeds missing from this build: {sorted(lost)}")
        print(f"  feeds: {len(feeds(cur))} present, none dropped")
    else:
        print("  no committed copy; relative checks skipped")

    for name in ("saturday", "sunday"):
        try:
            other = load(data_dir / f"data-{name}.json")
        except FileNotFoundError:
            fail(f"data-{name}.json missing")
            continue
        n = len(other.get("trips") or [])
        print(f"  {name}: {n} trips")
        if floor.get(name) and n < floor[name]:
            fail(f"{name} trips {n} below floor {floor[name]}")
        pdoc = committed(city, f"data-{name}.json")
        if pdoc and pdoc.get("trips") and n < len(pdoc["trips"]) * MIN_TRIP_RATIO:
            fail(f"{name} trips {n} < 80% of committed {len(pdoc['trips'])}")

    # Stops payloads back the route panel; a feed that produced no stops must
    # not ship, and previously present files must not disappear.
    cur_stops = {p.name for p in data_dir.glob("stops-*.json")}
    tree = subprocess.run(
        ["git", "ls-tree", "--name-only", "HEAD", f"visualizations/{city}/"],
        cwd=REPO, capture_output=True, text=True, check=True).stdout
    prev_stops = {Path(line).name for line in tree.splitlines()
                  if Path(line).name.startswith("stops-") and line.endswith(".json")}
    for name in sorted(prev_stops - cur_stops):
        fail(f"{name} disappeared")
    for name in sorted(cur_stops):
        doc = load(data_dir / name)
        n = len((doc.get("r") or {}))
        if n == 0:
            fail(f"{name} has no routes")
        old = committed(city, name)
        if old and old.get("r") and n < len(old["r"]) * MIN_STRUCT_RATIO:
            fail(f"{name} routes {n} < 95% of committed {len(old['r'])}")
    print(f"  stops files: {len(cur_stops)}")

    if fails:
        print(f"{city}: {len(fails)} failure(s)", file=sys.stderr)
        return 1
    print(f"{city}: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
