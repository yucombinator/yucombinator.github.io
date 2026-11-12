#!/usr/bin/env python3
"""Static contract checks for the unified In Motion framework."""
import json
import re
import sys
from pathlib import Path
from zoneinfo import ZoneInfo

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
        if not (isinstance(cfg.get("camera"), list) and len(cfg["camera"]) == 3
                and all(isinstance(x, (int, float)) for x in cfg["camera"])):
            fail(f"{city.name}: invalid camera")
        b = cfg.get("inBounds")
        if not (isinstance(b, list) and len(b) == 4 and b[0] < b[2] and b[1] < b[3]):
            fail(f"{city.name}: invalid inBounds")
        for key in ("busModes", "trainModes", "brandedModes", "railModes"):
            if set(cfg.get(key, [])) - cfg_modes:
                fail(f"{city.name}: {key} has non-modes {set(cfg.get(key, [])) - cfg_modes}")
        if set(cfg.get("dwellSeconds", {})) - cfg_modes:
            fail(f"{city.name}: dwellSeconds has non-modes")
        for k, v in cfg.get("dwellSeconds", {}).items():
            if not isinstance(v, (int, float)) or v < 0:
                fail(f"{city.name}: bad dwellSeconds[{k}]")
        if not cfg.get("storageKey"):
            fail(f"{city.name}: missing storageKey")
        if cfg.get("slug") != city.name:
            fail(f"{city.name}: slug {cfg.get('slug')} != folder")
        if not cfg.get("timeZone"):
            fail(f"{city.name}: missing timeZone")
        else:
            try:
                ZoneInfo(cfg["timeZone"])
            except Exception:
                fail(f"{city.name}: invalid timeZone {cfg['timeZone']}")
        tip_ids = [e.get("tipId") for e in cfg["legend"] if e.get("tip")]
        if len(tip_ids) != len(set(tip_ids)):
            fail(f"{city.name}: duplicate tipId")
        cam = cfg.get("camera")
        b = cfg.get("inBounds")
        if cam and b and not (b[0] <= cam[0] <= b[2] and b[1] <= cam[1] <= b[3]):
            fail(f"{city.name}: camera outside inBounds")
        legend_modes = [e["mode"] for e in cfg["legend"]]
        if cfg_modes - set(legend_modes):
            fail(f"{city.name}: modes without legend: {cfg_modes - set(legend_modes)}")
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
        if 'id="routePanel"' in html:
            fail(f"{city.name}: stale routePanel markup")

    for name in ("motion.js", "motion.css", "motion_build.py"):
        text = (SHARED / name).read_text()
        for leak in ("America/", "Toronto", "Vancouver", "Seattle", "TTC",
                     "TransLink", "SeaBus", "Aquabus", "Puget"):
            if leak in text:
                fail(f"{name} leaks city constant: {leak}")
    if not (ROOT.parent / ".nojekyll").exists():
        fail(".nojekyll missing at repo root (GitHub Pages skips _shared/)")

    print(f"{len(CITIES)} cities, {len(fails)} failures")
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
