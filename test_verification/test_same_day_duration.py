"""Regression test: a same-day model (start_date == end_date) must simulate
the full 24 hours, not a 0/1-hour stub.

`cli/runner.py::_time_hours()` and `optimizer_engine.py`'s internal duration
calc both derived simulated duration as `(end - start).days * 24`, floored to
a token minimum for the zero-day case (`max(1.0, ...)` in the CLI, `max(0, ...)`
in the GUI's `dateToHours`). For a same-day model this is 0 days, so the floor
kicked in and the whole run covered only 1 hour (CLI) or 0 hours (GUI) starting
at midnight — any regimen event scheduled later in the day (e.g. 18:00) fell
outside that window and never fired for the entire run. See
models/test_fixtures/valid/test_valid_same_day_duration.yaml.
"""

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from cli.runner import _time_hours  # noqa: E402
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'test_fixtures/valid/test_valid_same_day_duration'


def test_time_hours_same_day_is_full_day():
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    assert engine.load_models([MODEL_NAME]), 'failed to load fixture model'
    assert _time_hours(engine) == pytest.approx(24.0)


def test_same_day_regimen_fires(tmp_path):
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    assert engine.load_models([MODEL_NAME]), 'failed to load fixture model'
    engine.current_model.schedule_entries = engine.current_model.plans['default']

    hours = _time_hours(engine)
    csv_path = tmp_path / 'same_day.csv'
    result = engine.run_simulation(None, hours, output_path=str(csv_path))
    assert result['success'], result.get('error')

    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    assert rows, 'simulation produced no rows'
    dose_total = float(rows[-1]['dose_total'])
    assert dose_total == pytest.approx(5.0, abs=1e-9), (
        f"dose_total={dose_total}, expected 5.0 "
        f"(0.0 would indicate the same-day duration bug has regressed — "
        f"the 18:00 event never fired)"
    )
