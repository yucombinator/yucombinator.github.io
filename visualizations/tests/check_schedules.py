#!/usr/bin/env python3
"""Validate the per-route schedule payloads against the shipped data."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITIES = sorted(p for p in ROOT.iterdir() if p.is_dir() and (p / "city.js").exists())
fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL:", msg)


def load_day_payload(city, base, key):
    if key in base["days"]:
        return base["days"][key]
    path = city / f"data-{key}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def check_city(city):
    base = json.loads((city / "data.json").read_text())
    route_keys = list(base["routes"])
    days = base["order"]
    day_data = {}
    for key in days:
        payload = load_day_payload(city, base, key)
        if payload is None:
            fail(f"{city.name}: missing data-{key}.json")
            return 0
        day_data[key] = payload

    checked = 0
    for idx, route_key in enumerate(route_keys):
        path = city / "schedules" / f"{idx}.json"
        if not path.exists():
            fail(f"{city.name}: missing {path.relative_to(ROOT)}")
            continue
        try:
            doc = json.loads(path.read_text())
        except Exception as exc:
            fail(f"{city.name}: invalid {path.name}: {exc}")
            continue
        if doc.get("route") != route_key:
            fail(f"{city.name}: {path.name} route {doc.get('route')!r} != {route_key!r}")
        if not isinstance(doc.get("stops"), list):
            fail(f"{city.name}: {path.name} has no stops table")
            continue
        if not isinstance(doc.get("days"), dict):
            fail(f"{city.name}: {path.name} has no days object")
            continue
        if set(doc["days"]) != set(days):
            fail(f"{city.name}: {path.name} days {sorted(doc['days'])} != {sorted(days)}")
        for day in days:
            trips = day_data[day]["trips"]
            runs = doc["days"].get(day, {}).get("runs")
            if not isinstance(runs, list):
                fail(f"{city.name}: {path.name} {day} has no runs list")
                continue
            seen = set()
            by_trip = {}
            for run in runs:
                i = run.get("i")
                if not isinstance(i, int) or not (0 <= i < len(trips)):
                    fail(f"{city.name}: {path.name} {day} bad i {i!r}")
                    continue
                if i in seen:
                    fail(f"{city.name}: {path.name} {day} duplicate i {i}")
                seen.add(i)
                if trips[i][3] != idx:
                    fail(f"{city.name}: {path.name} {day} i {i} route {trips[i][3]} != {idx}")
                stops = run.get("stops")
                if not isinstance(stops, list) or len(stops) < 2:
                    fail(f"{city.name}: {path.name} {day} i {i} has <2 stops")
                    continue
                if run.get("start") != stops[0][2] or run.get("end") != stops[-1][1]:
                    fail(f"{city.name}: {path.name} {day} i {i} start/end disagree with stops")
                if sum(1 for row in stops if isinstance(row, list) and len(row) > 3
                       and row[3] == 1) < 2:
                    fail(f"{city.name}: {path.name} {day} i {i} has <2 published rows")
                prev = None
                for row in stops:
                    if not (isinstance(row, list) and len(row) == 4
                            and isinstance(row[0], int)
                            and 0 <= row[0] < len(doc["stops"])
                            and isinstance(row[1], int)
                            and isinstance(row[2], int)
                            and row[3] in (0, 1)):
                        fail(f"{city.name}: {path.name} {day} i {i} bad stop row {row!r}")
                        break
                    if row[1] > row[2] or (prev is not None and row[1] < prev):
                        fail(f"{city.name}: {path.name} {day} i {i} non-monotonic times")
                        break
                    prev = row[2]
                trip = run.get("trip")
                if trip in by_trip:
                    old = by_trip[trip]
                    if old["start"] == run.get("start"):
                        fail(f"{city.name}: {path.name} {day} duplicate start for {trip}")
                    if len(old["stops"]) != len(stops):
                        fail(f"{city.name}: {path.name} {day} frequency stop count differs")
                else:
                    by_trip[trip] = run
        checked += 1
    return checked


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--city', choices=[c.name for c in CITIES])
    args = parser.parse_args()
    cities = [c for c in CITIES if args.city in (None, c.name)]
    routes = 0
    for city in cities:
        routes += check_city(city)
    print(f"{len(cities)} cities, {routes} routes, {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
