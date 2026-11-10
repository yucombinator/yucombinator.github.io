#!/usr/bin/env python3
"""Build every city with the shared pipeline and compare against committed data.

Usage: python3 tests/check_data.py [--skip-build]
"""
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CITIES = sorted(p for p in ROOT.iterdir() if p.is_dir() and (p / "city.js").exists())
SKIP = "--skip-build" in sys.argv
fails = []


def normalized(path):
    doc = json.loads(Path(path).read_text())
    doc.pop("built", None)
    return doc


def compare(city, out):
    if normalized(out / "data.json") != normalized(city / "data.json"):
        return "data.json differs"
    for name in ("data-saturday.json", "data-sunday.json"):
        if (out / name).read_bytes() != (city / name).read_bytes():
            return f"{name} differs"
    for name in sorted(p.name for p in city.glob("stops-*.json")):
        if (out / name).read_bytes() != (city / name).read_bytes():
            return f"{name} differs"
    return None


def main():
    for city in CITIES:
        if SKIP:
            print(f"skip build {city.name}")
            continue
        with tempfile.TemporaryDirectory() as tmp:
            env = dict(os.environ, MOTION_OUT=str(Path(tmp) / "data.json"))
            proc = subprocess.run(
                [sys.executable, "build/build_data.py"], cwd=city, env=env,
                capture_output=True, text=True)
            if proc.returncode != 0:
                fails.append(f"{city.name}: build failed\n{proc.stderr[-1500:]}")
                print("FAIL:", city.name, "build failed")
                continue
            problem = compare(city, Path(tmp))
            if problem:
                fails.append(f"{city.name}: {problem}")
                print("FAIL:", city.name, problem)
            else:
                print("ok:", city.name)
    print(f"{len(CITIES)} cities, {len(fails)} failures")
    for f in fails:
        print(f, file=sys.stderr)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
