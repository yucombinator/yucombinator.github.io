#!/usr/bin/env python3
"""Static contract checks for the unified In Motion framework."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SHARED = ROOT / "_shared"
CITIES = sorted(p for p in ROOT.iterdir() if p.is_dir() and (p / "city.js").exists())
fails = []


def fail(msg):
    fails.append(msg)
    print("FAIL:", msg)


def load_config(city):
    text = (city / "city.js").read_text()
    return json.loads(text.split("=", 1)[1].strip().rstrip(";"))


def main():
    registry = json.loads(
        (SHARED / "cities.js").read_text().split("=", 1)[1].strip().rstrip(";"))
    slugs = {c["slug"] for c in registry}
    folders = {c.name for c in CITIES}
    if slugs != folders:
        fail(f"registry {sorted(slugs)} != folders {sorted(folders)}")

    for city in CITIES:
        cfg = load_config(city)
        data = json.loads((city / "data.json").read_text())
        data_modes = {v["m"] for v in data["routes"].values()}
        cfg_modes = {m["key"] for m in cfg["modes"]}
        if data_modes - cfg_modes:
            fail(f"{city.name}: data modes missing from config: {data_modes - cfg_modes}")
        for m in cfg["modes"]:
            if not m.get("label") or not m.get("color") or not m.get("radius"):
                fail(f"{city.name}: incomplete mode {m}")
        legend_modes = [e["mode"] for e in cfg["legend"]]
        if len(legend_modes) != len(set(legend_modes)):
            fail(f"{city.name}: duplicate legend mode")
        for e in cfg["legend"]:
            if e["mode"] not in cfg_modes:
                fail(f"{city.name}: legend mode {e['mode']} not in modes")
            if not e.get("dot") and not e.get("swatches"):
                fail(f"{city.name}: legend {e['mode']} has no colour")
            if e.get("tip") is not None:
                if not e.get("tipId"):
                    fail(f"{city.name}: legend {e['mode']} tooltip missing tipId")
                for row in e["tip"]:
                    if not re.fullmatch(r"#[0-9a-fA-F]{3,6}", row.get("color", "")):
                        fail(f"{city.name}: bad tip colour {row}")
                    if not row.get("text"):
                        fail(f"{city.name}: empty tip label in {e['mode']}")
        html = (city / "index.html").read_text()
        for asset in ("../_shared/motion.css", "../_shared/motion.js",
                      "../_shared/cities.js", "../_shared/version.js", "city.js"):
            if asset not in html:
                fail(f"{city.name}: index missing {asset}")
        accent = re.search(r":root\{--accent:(#[0-9a-fA-F]{6})\}", html)
        if not accent or accent.group(1).lower() != cfg["accent"].lower():
            fail(f"{city.name}: accent mismatch")
        if "app.js" in html:
            fail(f"{city.name}: still references per-city app.js")

    engine = (SHARED / "motion.js").read_text()
    for leak in ("America/", "Toronto", "Vancouver", "Seattle", "TTC", "TransLink"):
        if leak in engine:
            fail(f"motion.js leaks city constant: {leak}")

    print(f"{len(CITIES)} cities, {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
