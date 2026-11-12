import csv
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "_shared"))
import motion_build as mb  # noqa: E402


def write_feed(path, feed):
    os.makedirs(path, exist_ok=True)

    def write(name, header, rows):
        with open(os.path.join(path, name), "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(header)
            w.writerows(rows)

    write("agency.txt", ["agency_id", "agency_name", "agency_url", "agency_timezone"],
          [["mini", "Mini Transit", "https://example.test", "America/Los_Angeles"]])
    write("routes.txt", ["route_id", "agency_id", "route_short_name", "route_long_name", "route_type", "route_color"],
          [["A", "mini", "A", "Frequency Route", 3, "2f6db3"],
           ["B", "mini", "B", "Timepoint Route", 3, "2f6db3"]])
    write("calendar.txt", ["service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"],
          [["daily", 1, 1, 1, 1, 1, 1, 1, "20200101", "20500101"]])
    write("stops.txt", ["stop_id", "stop_name", "stop_lat", "stop_lon"],
          [["A0", "A first", 47.600, -122.330], ["A1", "A middle", 47.610, -122.330],
           ["A2", "A last", 47.620, -122.330], ["B0", "B first", 47.600, -122.340],
           ["B1", "B middle", 47.610, -122.340], ["B2", "B last", 47.620, -122.340]])
    write("shapes.txt", ["shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"],
          [["shape_A", 47.600, -122.330, 1], ["shape_A", 47.610, -122.330, 2], ["shape_A", 47.620, -122.330, 3],
           ["shape_B", 47.600, -122.340, 1], ["shape_B", 47.610, -122.340, 2], ["shape_B", 47.620, -122.340, 3]])
    write("trips.txt", ["trip_id", "route_id", "service_id", "shape_id", "trip_headsign", "direction_id"],
          [["A_freq", "A", "daily", "shape_A", "A last", 0],
           ["A_night", "A", "daily", "shape_A", "A last", 0],
           ["B_timepoint", "B", "daily", "shape_B", "B last", 0]])
    write("frequencies.txt", ["trip_id", "start_time", "end_time", "headway_secs"],
          [["A_freq", "07:00:00", "09:00:00", 1800]])
    write("stop_times.txt", ["trip_id", "arrival_time", "departure_time", "stop_id", "stop_sequence"],
          [["A_freq", "07:00:00", "07:00:00", "A0", 1], ["A_freq", "07:10:00", "07:10:00", "A1", 2],
           ["A_freq", "07:20:00", "07:20:00", "A2", 3],
           ["A_night", "24:10:00", "24:10:00", "A0", 1], ["A_night", "24:20:00", "24:20:00", "A1", 2],
           ["A_night", "24:30:00", "24:30:00", "A2", 3],
           ["B_timepoint", "06:00:00", "06:00:00", "B0", 1], ["B_timepoint", "", "", "B1", 2],
           ["B_timepoint", "06:20:00", "06:20:00", "B2", 3]])
    Path(path, ".ok").write_text("ok")


def classify(feed, route_id, route_type, route_color="", agency="", route_name="", route_short=""):
    return ("localbus", "2f6db3")


class SyntheticBuildTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.out = Path(self.tmp.name) / "data.json"
        self.cfg = {
            "city": "Mini",
            "cache": str(Path(self.tmp.name) / "cache"),
            "out": str(self.out),
            "timeZone": "America/Los_Angeles",
            "zoneLabel": "PT",
            "lat0": 47.6,
            "sun": (47.6, -122.33),
            "modes": ["localbus"],
            "busModes": ["localbus"],
            "trainModes": [],
            "feeds": [{"id": "mini", "agency": "Mini Transit", "kind": "bus",
                       "color": "2f6db3", "approx_writer": write_feed}],
            "classify": classify,
        }
        mb.run(self.cfg)
        self.data = json.loads(self.out.read_text())
        self.route_index = {k: i for i, k in enumerate(self.data["routes"])}

    def schedule(self, route):
        idx = self.route_index[route]
        path = Path(self.tmp.name) / "schedules" / f"{idx}.json"
        return json.loads(path.read_text())

    def test_frequency_runs_share_trip_and_shift_times(self):
        runs = self.schedule("mini:A")["days"]["weekday"]["runs"]
        freq = [r for r in runs if r["trip"] == "A_freq"]
        self.assertGreaterEqual(len(freq), 2)
        self.assertEqual(len({r["start"] for r in freq}), len(freq))
        self.assertTrue(all(r["stops"][0][2] == r["start"] for r in freq))
        self.assertTrue(all([row[2] for row in r["stops"]] == [x + (r["start"] - 25200) for x in [25200, 25800, 26400]] for r in freq))

    def test_timepoint_blanks_are_interpolated_and_marked(self):
        runs = self.schedule("mini:B")["days"]["weekday"]["runs"]
        run = next(r for r in runs if r["trip"] == "B_timepoint")
        self.assertEqual([row[3] for row in run["stops"]], [1, 0, 1])
        self.assertEqual(run["stops"][1][2], 22200)

    def test_overnight_run_is_exported_with_extended_time(self):
        runs = self.schedule("mini:A")["days"]["weekday"]["runs"]
        run = next(r for r in runs if r["trip"] == "A_night")
        self.assertGreaterEqual(run["start"], 86400)
        self.assertEqual(run["start"], 87000)


if __name__ == "__main__":
    unittest.main()
