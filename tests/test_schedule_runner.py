"""Regression test: pulse reset must not be clamped to a variable's bounds[0].

apply_schedules() (schedule_runner.py) is documented to zero every controlled
variable at the start of each step before re-accumulating the firing event's
value (model.md pulse semantics). Before this fix, the reset went through the
bounds-clamped setter, so an input variable with `bounds[0] > 0` had its "off"
state pulled up to bounds[0] instead of true 0 — silently inflating every
firing step's effective value by bounds[0] (e.g. bounds=[0.3, 2.0], regimen
value=0.8 produced 1.1, not 0.8). See models/test/valid/test_pulse_reset_bounds_floor.yaml.
"""

import csv
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'


def test_pulse_value_not_inflated_by_nonzero_bounds_floor(tmp_path):
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    model_name = 'test/valid/test_pulse_reset_bounds_floor'
    assert engine.load_models([model_name]), 'failed to load fixture model'
    engine.current_model.schedule_entries = engine.current_model.plans['default']

    hours = (date(2026, 1, 5) - date(2026, 1, 1)).days * 24.0
    csv_path = tmp_path / 'pulse_reset.csv'
    result = engine.run_simulation(None, hours, output_path=str(csv_path))
    assert result['success'], result.get('error')

    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))

    assert rows, 'simulation produced no rows'
    for row in rows:
        dose = float(row['dose'])
        assert dose == pytest.approx(0.8, abs=1e-9), (
            f"step {row['step']}: dose={dose}, expected 0.8 "
            f"(1.1 would indicate the bounds[0]=0.3 reset-clamp bug has regressed)"
        )


def test_apply_schedules_dow_aligned_to_sim_start_date():
    """days filter must use the real calendar weekday, not prev_day_idx % 7.

    2026-01-01 is a Thursday. A schedule with days=[Thu] must fire on day 0
    (Thu) and day 7 (next Thu), and must not fire on day 1 (Fri).
    The old bug hardcoded day-0=Mon via prev_day_idx % 7, which would have
    fired on day 3 (the index it mistakenly mapped to Thu) instead.
    """
    from reference_engine.src.schedule_runner import apply_schedules

    class _Var:
        def __init__(self):
            self.value = 0.0

    class _Model:
        def __init__(self):
            self.variables = {'dose': _Var()}

        def set_variable_value(self, name, val):
            self.variables[name].value = val

    schedules = [{
        'variable': 'dose',
        'events': [{'days': ['Thu'], 'value': 1.0, 'time_start': '08:00', 'time_end': '08:00'}],
    }]
    sim_start = '2026-01-01'  # Thursday
    step = 86400.0

    model = _Model()
    apply_schedules(model, schedules, 0.0, step, sim_start_date=sim_start)
    assert model.variables['dose'].value == pytest.approx(1.0), \
        'day 0 (Thu): event should have fired'

    model = _Model()
    apply_schedules(model, schedules, step, 2 * step, sim_start_date=sim_start)
    assert model.variables['dose'].value == pytest.approx(0.0), \
        'day 1 (Fri): event must not fire (days=[Thu] only)'

    model = _Model()
    apply_schedules(model, schedules, 7 * step, 8 * step, sim_start_date=sim_start)
    assert model.variables['dose'].value == pytest.approx(1.0), \
        'day 7 (next Thu): event should fire again'
