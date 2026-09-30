#!/usr/bin/env python3
"""Structural checks on immiflow/data/flow.json. Exit 1 on any failure."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
FLOW = ROOT / "data" / "flow.json"
TRACKS = {"student", "employment", "family", "humanitarian", "origin"}
AGENCIES = {"USCIS", "DOL", "State Dept", None}
NODE_KEYS = ("id", "track", "label", "form", "agency", "waits")
EDGE_KEYS = ("v", "w")
WAIT_FIELDS = ("regular", "premium", "bulletin", "backlogs")


def fail(errors, msg):
    errors.append(msg)


def validate(flow):
    errors = []
    for key in ("nodes", "edges"):
        if not isinstance(flow.get(key), list):
            fail(errors, f"flow.json: missing or non-list {key!r}")
    if errors:
        return errors

    # Pass 1: every node must carry its required keys before it can be judged.
    nodes = {}
    for i, n in enumerate(flow["nodes"]):
        if not isinstance(n, dict):
            fail(errors, f"node #{i}: not an object")
            continue
        missing = [k for k in NODE_KEYS if k not in n]
        if missing:
            fail(errors, f"node #{i}: missing required key(s) {', '.join(missing)}")
            continue
        if n["id"] in nodes:
            fail(errors, f"duplicate node id: {n['id']}")
        nodes[n["id"]] = n

    for n in flow["nodes"]:
        if not isinstance(n, dict) or any(k not in n for k in NODE_KEYS):
            continue  # already reported above; do not pile on
        if n["track"] not in TRACKS:
            fail(errors, f"{n['id']}: unknown track {n['track']!r}")
        if n["agency"] not in AGENCIES:
            fail(errors, f"{n['id']}: bad agency {n['agency']!r}")
        if n["form"] and not n["waits"]:
            fail(errors, f"{n['id']}: has a form but no wait rows")
        if n["form"] and n["agency"] is None:
            fail(errors, f"{n['id']}: has a form but no agency")
        # Every step must say something in words, or it renders as a blank box.
        if not n["form"] and not n.get("chip"):
            fail(errors, f"{n['id']}: needs a chip or a form so the node says something")
        for shared in n.get("sharedWith", []):
            if shared not in TRACKS:
                fail(errors, f"{n['id']}: bad sharedWith {shared!r}")
        for w in n["waits"]:
            if not w.get("category"):
                fail(errors, f"{n['id']}: wait row with no category")
            # An absent value is an error: absence must be spelled null, not omitted.
            for field in WAIT_FIELDS:
                if field not in w:
                    fail(errors, f"{n['id']}/{w.get('category')}: {field} is missing, use null")
                elif not isinstance(w[field], (str, type(None))):
                    fail(errors, f"{n['id']}/{w.get('category')}: {field} must be a string or null")

    for i, e in enumerate(flow["edges"]):
        if not isinstance(e, dict):
            fail(errors, f"edge #{i}: not an object")
            continue
        missing = [k for k in EDGE_KEYS if k not in e]
        if missing:
            fail(errors, f"edge #{i}: missing required key(s) {', '.join(missing)}")
            continue
        for end in (e["v"], e["w"]):
            if end not in nodes:
                fail(errors, f"edge {e['v']}->{e['w']}: unknown node {end!r}")

    # reachability from the start node
    adj = {}
    for e in flow["edges"]:
        if isinstance(e, dict) and all(k in e for k in EDGE_KEYS):
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
