#!/usr/bin/env python3
"""Fetch public GTFS-Realtime vehicle positions and write ../live.json.

No API keys and no third-party services: the agencies below publish anonymous
GTFS-RT vehicle feeds. The page fetch is blocked by CORS, so this script is the
only way to get the bytes into the static site; run it whenever a fresh
snapshot is wanted:

    python3 build/fetch_live.py

Output: ../live.json
    generated  epoch milliseconds
    feeds      feed ids that have live coverage
    routes     "feed:route_id" keys, matching data.json
    v          [route_index, lat, lon, bearing, timestamp_ms]
"""

import json
import os
import struct
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(os.path.join(HERE, "..", "live.json"))

# feed id (as used in data.json) -> GTFS-RT vehicle positions URL
FEEDS = {
    "ttc": "https://bustime.ttc.ca/gtfsrt/vehicles",
    "brampton": "https://gtfs-rt-merge.prod.bt-cadavl.com/BramptonTransit/GTFS/merged_VehiclePosition.pb",
    "yrt": "https://rtu.york.ca/gtfsrealtime/VehiclePositions",
    "drt": "https://drtonline.durhamregiontransit.com/gtfsrealtime/VehiclePositions",
    "hsr": "https://opendata.hamilton.ca/GTFS-RT/GTFS_VehiclePositions.pb",
    "grt_bus": "https://webapps.regionofwaterloo.ca/api/grt-routes/api/vehiclepositions/1",
    "grt_lrt": "https://webapps.regionofwaterloo.ca/api/grt-routes/api/vehiclepositions/2",
    "guelph": "https://glphprdtmgtfs.glphtrpcloud.com/tmgtfsrealtimewebservice/vehicle/vehiclepositions.pb",
    "burlington": "https://opendata.burlington.ca/gtfs-rt/GTFS_VehiclePositions.pb",
}


# --- minimal protobuf reader (only the GTFS-RT fields we need) -------------

def varint(buf, i):
    v = shift = 0
    while True:
        b = buf[i]
        i += 1
        v |= (b & 0x7F) << shift
        if not b & 0x80:
            return v, i
        shift += 7


def fields(buf):
    """Yield (field_number, wire_type, value) over a protobuf message."""
    i, n = 0, len(buf)
    while i < n:
        key, i = varint(buf, i)
        num, wt = key >> 3, key & 7
        if wt == 0:
            v, i = varint(buf, i)
        elif wt == 2:
            ln, i = varint(buf, i)
            v = buf[i:i + ln]
            i += ln
        elif wt == 5:
            v = buf[i:i + 4]
            i += 4
        elif wt == 1:
            v = buf[i:i + 8]
            i += 8
        else:
            raise ValueError("wire type %d" % wt)
        yield num, wt, v


def f32(b):
    return struct.unpack("<f", b)[0]


def parse_vehicle_position(buf):
    route = lat = lon = bearing = ts = None
    for num, wt, v in fields(buf):
        if num == 1 and wt == 2:            # trip
            for tn, tw, tv in fields(v):
                if tn == 5 and tw == 2:     # route_id
                    route = tv.decode("utf-8", "replace")
        elif num == 2 and wt == 2:          # position
            for pn, pw, pv in fields(v):
                if pn == 1 and pw == 5:
                    lat = f32(pv)
                elif pn == 2 and pw == 5:
                    lon = f32(pv)
                elif pn == 3 and pw == 5:
                    bearing = f32(pv)
        elif num == 5 and wt == 0:          # timestamp
            ts = v
    return route, lat, lon, bearing, ts


def parse_feed(buf):
    out = []
    for num, wt, v in fields(buf):
        if num != 2 or wt != 2:             # FeedEntity
            continue
        for en, ew, ev in fields(v):
            if en == 4 and ew == 2:         # vehicle
                out.append(parse_vehicle_position(ev))
    return out


# ---------------------------------------------------------------------------

def fetch(feed):
    url = FEEDS[feed]
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        buf = resp.read()
    return feed, parse_feed(buf)


def main():
    started = time.time()
    results = []
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        futures = {pool.submit(fetch, f): f for f in FEEDS}
        for fut, feed in futures.items():
            try:
                results.append(fut.result())
            except Exception as exc:                     # noqa: BLE001
                print(f"  ! {feed}: {type(exc).__name__}: {exc}", file=sys.stderr)

    route_keys = []
    route_index = {}
    vehicles = []
    feeds_ok = []
    for feed, rows in sorted(results):
        kept = 0
        for route, lat, lon, bearing, ts in rows:
            if not route or lat is None or lon is None:
                continue
            key = f"{feed}:{route}"
            idx = route_index.get(key)
            if idx is None:
                idx = len(route_keys)
                route_index[key] = idx
                route_keys.append(key)
            vehicles.append([
                idx,
                round(lat, 5),
                round(lon, 5),
                round(bearing, 1) if bearing is not None else -1,
                int(ts) * 1000 if ts else 0,
            ])
            kept += 1
        if kept:
            feeds_ok.append(feed)
        print(f"  {feed:10s} {kept:5d} vehicles", file=sys.stderr)

    doc = {
        "generated": int(time.time() * 1000),
        "feeds": feeds_ok,
        "routes": route_keys,
        "v": vehicles,
    }
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump(doc, fh, separators=(",", ":"))
    print(f"wrote {OUT}  {os.path.getsize(OUT)/1024:.0f} KB  "
          f"({len(vehicles)} vehicles, {len(route_keys)} routes, "
          f"{time.time() - started:.1f}s)", file=sys.stderr)


if __name__ == "__main__":
    main()
