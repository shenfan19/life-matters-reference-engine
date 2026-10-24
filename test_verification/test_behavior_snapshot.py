"""The simulation and Monte Carlo cases of the behavior snapshot must still hash the same as golden.json.

The optimization cases take minutes and are run by hand: python test_verification/behavior_snapshot/behavior_snapshot.py"""

import json
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent / 'behavior_snapshot'
sys.path.insert(0, str(HERE))

import behavior_snapshot as snap  # noqa: E402


def test_simulation_and_monte_carlo_match_the_golden_hashes():
    golden = json.loads((HERE / 'golden.json').read_text(encoding='utf-8'))
    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td)
        now = {**snap.snapshot_sim(tmp), **snap.snapshot_mc(tmp)}
    assert now, 'no cases ran'
    for key, value in now.items():
        assert golden[key] == value, key
