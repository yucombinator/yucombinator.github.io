#!/usr/bin/env python3
"""Structural checks on immiflow/data/flow.json. Exit 1 on any failure."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / "data" / "flow.json"
TRACKS = {"student", "employment", "family", "humanitarian", "origin"}
AGENCIES = {"USCIS", "DOL", "State Dept", None}


def fail(errors, msg):
    errors.append(msg)


def validate(flow):
    errors = []
    nodes = {}
    for n in flow["nodes"]:
        if n["id"] in nodes:
            fail(errors, f"duplicate node id: {n['id']}")
        nodes[n["id"]] = n

    for n in flow["nodes"]:
        if n["track"] not in TRACKS:
            fail(errors, f"{n['id']}: unknown track {n['track']!r}")
        if n.get("agency") not in AGENCIES:
            fail(errors, f"{n['id']}: bad agency {n.get('agency')!r}")
        if n.get("form") and not n.get("waits"):
            fail(errors, f"{n['id']}: has a form but no wait rows")
        if n.get("form") and n.get("agency") is None:
            fail(errors, f"{n['id']}: has a form but no agency")
        for shared in n.get("sharedWith", []):
            if shared not in TRACKS:
                fail(errors, f"{n['id']}: bad sharedWith {shared!r}")
        for w in n.get("waits", []):
            if not w.get("category"):
                fail(errors, f"{n['id']}: wait row with no category")
            for field in ("regular", "premium", "bulletin", "backlogs"):
                if field in w and not isinstance(w[field], (str, type(None))):
                    fail(errors, f"{n['id']}/{w.get('category')}: {field} must be a string or null")

    for e in flow["edges"]:
        for end in (e["v"], e["w"]):
            if end not in nodes:
                fail(errors, f"edge {e['v']}->{e['w']}: unknown node {end!r}")

    # reachability from the start node
    adj = {}
    for e in flow["edges"]:
        adj.setdefault(e["v"], []).append(e["w"])
    seen, stack = set(), ["start"]
    while stack:
        cur = stack.pop()
        if cur in seen:
            continue
        seen.add(cur)
        stack.extend(adj.get(cur, []))
    for nid in nodes:
        if nid not in seen:
            fail(errors, f"{nid} is unreachable from 'start'")

    return errors


def main():
    if not FLOW.exists():
        print(f"FAIL: {FLOW} does not exist", file=sys.stderr)
        return 1
    try:
        flow = json.loads(FLOW.read_text())
    except json.JSONDecodeError as exc:
        print(f"FAIL: flow.json is not valid JSON: {exc}", file=sys.stderr)
        return 1
    errors = validate(flow)
    if errors:
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        print(f"FAIL: {len(errors)} problem(s)", file=sys.stderr)
        return 1
    print(f"OK: {len(flow['nodes'])} nodes, {len(flow['edges'])} edges, all reachable")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
