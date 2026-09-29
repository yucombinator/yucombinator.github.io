#!/usr/bin/env python3
"""Normalize agent-returned rate JSON into data/rates.json.

Subagent output arrives with the harness's `{"item": ...}` wrapper and with
every scalar as a string. This unwraps it, coerces types, and merges the
per-batch files in data/raw/ into one schema-valid rates.json.
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "data", "rates.json")

# utility id -> who sets the rate, for utilities that are not IOU-regulated
BOARD_SET = "Locally elected utility board"

KNOWN_BOARDS = {
    "pud": "Locally elected utility board",
    "municipal": "City council / utility board",
    "iou": "Washington Utilities and Transportation Commission",
}


def unwrap(v):
    """Unwrap the harness's {"item": x} JSON-mode envelope."""
    while isinstance(v, dict) and set(v.keys()) == {"item"}:
        v = v["item"]
    return v


def deep_unwrap(v):
    v = unwrap(v)
    if isinstance(v, dict):
        return {k: deep_unwrap(x) for k, x in v.items()}
    if isinstance(v, list):
        return [deep_unwrap(x) for x in v]
    return v


def num(v, cast=float):
    if v is None or v == "" or v == "null" or v == "n/a":
        return None
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip().replace("$", "").replace(",", "")
    try:
        return cast(s)
    except ValueError:
        return None


def truthy(v):
    if isinstance(v, bool):
        return v
    return str(v).strip().lower() in ("true", "yes", "y", "1")


def normalize_util(u):
    r = u.get("residential") or {}
    out = {
        "id": u["id"],
        "name": u.get("name", u["id"]),
        "type": u.get("type", "pud"),
        "service_area": u.get("service_area", ""),
        "primary_city": u.get("primary_city", ""),
        "residential": {
            "energy_cents_kwh": num(r.get("energy_cents_kwh")),
            "fixed_charge_monthly_usd": num(r.get("fixed_charge_monthly_usd")),
            "includes_bpa": truthy(r.get("includes_bpa")),
            "effective": r.get("effective") if r.get("effective") not in ("null", "", None) else None,
            "source": r.get("source") if r.get("source") not in ("null", "", None) else None,
            "rate_set_by": r.get("rate_set_by") or KNOWN_BOARDS.get(u.get("type", "pud"), BOARD_SET),
            "tiers": [],
        },
        "tod": None,
        "notes": u.get("notes", ""),
    }
    tiers = unwrap(r.get("tiers"))
    if isinstance(tiers, list):
        for t in tiers:
            if isinstance(t, dict) and num(t.get("up_to_kwh")) is not None:
                out["residential"]["tiers"].append({
                    "up_to_kwh": num(t["up_to_kwh"]),
                    "cents_kwh": num(t.get("cents_kwh")),
                })
    tod = unwrap(u.get("tod"))
    if isinstance(tod, dict) and isinstance(unwrap(tod.get("periods")), list) and tod["periods"]:
        periods = []
        for p in tod["periods"]:
            if not isinstance(p, dict) or num(p.get("cents_kwh")) is None:
                continue
            periods.append({
                "name": p.get("name", "period"),
                "start": str(p.get("start", "00:00"))[:5],
                "end": str(p.get("end", "24:00"))[:5],
                "cents_kwh": num(p["cents_kwh"]),
                "weekdays_only": truthy(p.get("weekdays_only")),
            })
        if periods:
            out["tod"] = {"periods": periods, "seasons": unwrap(tod.get("seasons")) or []}
    return out


def main():
    if not os.path.isdir(RAW):
        print("missing data/raw/", file=sys.stderr)
        return 1
    merged, seen = {}, []
    for name in sorted(os.listdir(RAW)):
        if not name.endswith(".json"):
            continue
        with open(os.path.join(RAW, name)) as fh:
            payload = deep_unwrap(json.load(fh))
        utils = payload.get("utilities") if isinstance(payload, dict) else payload
        if isinstance(utils, dict) and "utilities" in utils:
            utils = utils["utilities"]
        for u in utils or []:
            if not isinstance(u, dict) or "id" not in u:
                continue
            n = normalize_util(u)
            if n["id"] in merged:
                print(f"  duplicate {n['id']} in {name}, keeping first")
                continue
            merged[n["id"]] = n
            seen.append(n["id"])

    out = {
        "generated": "assembled by tools/normalize_rates.py from data/raw/*.json",
        "benchmark": "pse",
        "utilities": [merged[k] for k in sorted(merged)],
    }
    with open(OUT, "w") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)

    priced = [u for u in out["utilities"]
              if u["residential"]["energy_cents_kwh"] is not None
              or u["residential"]["tiers"] or u["tod"]]
    print(f"{len(out['utilities'])} utilities, {len(priced)} with a rate -> {OUT}")
    for u in out["utilities"]:
        if u not in priced:
            print(f"  no rate: {u['id']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
