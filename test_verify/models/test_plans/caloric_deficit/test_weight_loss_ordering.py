"""Multi-value test template for `caloric_deficit` (test_verify/models/README.md).

test_plans.yaml's weight_dynamics is monotone in caloric_deficit and exercise_minutes
(both strictly reduce body_weight, no interaction term, no offsetting effect) — so the
three named plans (conservative < balanced < aggressive, both by deficit and by
exercise load) must produce a strict final-body_weight ordering:
aggressive < balanced < conservative < initial (90.0 kg).

This is a relational check (ordering), not a hardcoded golden value: it survives
formula tweaks that change the absolute numbers but keep both inputs' sign and
relative magnitude. It also guards the `max(50.0, ...)` floor clamp in
weight_dynamics — if a future parameter change pushed any plan's loss past the
floor before the others, the strict ordering would collapse into an equality and
this test would catch it (see floor-margin assertions below).
"""

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'test_plans'
HOURS = 180 * 24  # model's simulation window: 2026-01-01..2026-06-30
BODY_WEIGHT_FLOOR = 50.0
INITIAL_WEIGHT = 90.0


def _final_body_weight(plan_id: str, tmp_path: Path) -> float:
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    assert engine.load_models([MODEL_NAME]), f'failed to load {MODEL_NAME}'
    engine.current_model.schedule_entries = engine.current_model.plans.get(plan_id, [])
    csv_path = tmp_path / f'{plan_id}.csv'
    result = engine.run_simulation(None, HOURS, output_path=str(csv_path))
    assert result['success'], result.get('error')
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    return float(rows[-1]['body_weight'])


def test_higher_deficit_and_exercise_load_yields_strictly_lower_final_weight(tmp_path_factory):
    conservative = _final_body_weight('conservative', tmp_path_factory.mktemp('conservative'))
    balanced = _final_body_weight('balanced', tmp_path_factory.mktemp('balanced'))
    aggressive = _final_body_weight('aggressive', tmp_path_factory.mktemp('aggressive'))

    assert INITIAL_WEIGHT > conservative > balanced > aggressive

    # Margin from the max(50.0, ...) clamp: if any plan's loss got close enough to the
    # floor to clamp, the strict ordering above could hold by coincidence rather than
    # by the formula's actual monotonicity. Fail loudly instead of passing by luck.
    for label, value in [('conservative', conservative), ('balanced', balanced), ('aggressive', aggressive)]:
        assert value > BODY_WEIGHT_FLOOR + 1.0, (
            f'{label} final body_weight={value} too close to the {BODY_WEIGHT_FLOOR} floor clamp; '
            'ordering assertion above would no longer be a meaningful monotonicity check'
        )
