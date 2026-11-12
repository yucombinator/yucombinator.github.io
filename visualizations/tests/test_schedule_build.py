import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "_shared"))
from motion_build import interpolate_stop_times  # noqa: E402


class InterpolateStopTimesTest(unittest.TestCase):
    def test_interpolates_middle_by_distance(self):
        rows = [
            (1, "a", 0, 0),
            (2, "b", None, None),
            (3, "c", 120, 120),
        ]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        self.assertEqual(
            interpolate_stop_times(rows, meta),
            [
                [1, "a", 0, 0, 1],
                [2, "b", 60, 60, 0],
                [3, "c", 120, 120, 1],
            ],
        )

    def test_weights_by_distance(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", 120, 120)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.03)}
        result = interpolate_stop_times(rows, meta)
        self.assertEqual(result[1][2], 40)
        self.assertEqual(result[1][3], 40)

    def test_interpolates_non_collinear_path_by_path_distance(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", 120, 120)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.01, 0.01)}
        result = interpolate_stop_times(rows, meta)
        self.assertAlmostEqual(result[1][2], 60, delta=2)
        self.assertAlmostEqual(result[1][3], 60, delta=2)

    def test_interpolated_rows_do_not_overlap_previous_departure(self):
        rows = [
            (1, "a", 0, 0),
            (2, "b", 120, 180),
            (3, "c", None, None),
            (4, "d", None, None),
            (5, "e", None, None),
            (6, "f", 240, 240),
        ]
        meta = {sid: (0.0, i * 0.01) for i, sid in enumerate("abcdef")}
        result = interpolate_stop_times(rows, meta)
        for prev, row in zip(result, result[1:]):
            self.assertGreaterEqual(row[2], prev[3])

    def test_requires_two_published_timepoints(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", None, None)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        self.assertIsNone(interpolate_stop_times(rows, meta))

    def test_offsets_every_time_and_keeps_flags(self):
        rows = [(1, "a", 0, 0), (2, "b", None, None), (3, "c", 120, 120)]
        meta = {"a": (0.0, 0.0), "b": (0.0, 0.01), "c": (0.0, 0.02)}
        result = interpolate_stop_times(rows, meta, offset=600)
        self.assertEqual([r[2:4] for r in result], [[600, 600], [660, 660], [720, 720]])
        self.assertEqual([r[4] for r in result], [1, 0, 1])


if __name__ == "__main__":
    unittest.main()
