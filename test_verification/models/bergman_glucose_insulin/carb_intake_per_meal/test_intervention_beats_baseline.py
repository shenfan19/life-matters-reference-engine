"""Multi-value test template for `carb_intake_per_meal` (test_verification/models/README.md).

bergman_glucose_sim.yaml's insulin_sensitivity_dynamics/fasting_glucose_dynamics/
hba1c_dynamics combine three intervention inputs (carb_intake_per_meal, exercise_met_min,
fasting_window_hours) that each independently improve glycemic control in the same
direction (lower carb, more exercise, longer fasting window all help — see
metadata.description and metadata.todo in the YAML). The named plans span
no-intervention baseline ("ifg_no_intervention": high carb, no exercise, no fasting
window) through increasingly aggressive combined interventions
("ada_standard" -> "fasting_exercise_optimized" -> "joint_optimized", each strictly
dominating the previous on all three input dimensions).

This asserts two things, both confirmed by directly running the four plans (not
guessed from the equation):

1. Every intervention plan ends with strictly higher final insulin_sensitivity and
   strictly lower final hba1c than the no-intervention baseline — the core claim of
   the model ("any of these plans beats doing nothing"), with a wide margin (~0.008
   AU / ~0.01% respectively — real physiological gaps, not float noise).
2. insulin_sensitivity has a full strict ordering across all four plans (the ~0.003-
   0.008 AU gaps between intervention tiers are wide enough to be a meaningful
   regression signal). hba1c does NOT get a full strict ordering asserted among the
   three intervention plans — per metadata.todo, hba1c's equilibrium is dominated by
   fasting_glucose_target=5.5 regardless of intervention intensity (documented
   theoretical floor ≈6.06%), so the gaps between ada_standard/fasting_exercise_
   optimized/joint_optimized are ~1e-5, too close to the model's own known
   degeneracy to be a reliable ordering signal — asserting it would make this test
   flaky under routine parameter tuning that doesn't actually change the model's
   qualitative behavior.
"""

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'papers/s2/bergman_glucose/bergman_glucose_sim'
HOURS = 182 * 24  # model's simulation window: 2026-01-01..2026-07-01 (26 weeks)

PLANS_LEAST_TO_MOST_INTENSIVE = [
    'ifg_no_intervention',
    'ada_standard',
    'fasting_exercise_optimized',
    'joint_optimized',
]

# Documented theoretical floor (metadata.description.result): with
# fasting_glucose_target=5.5, hba1c's equilibrium is ~6.06% regardless of
# intervention intensity — any intervention plan should land within this band.
HBA1C_THEORETICAL_FLOOR_BAND = (6.0, 6.06)


def _final_row(plan_id: str, tmp_path: Path) -> dict:
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    assert engine.load_models([MODEL_NAME]), f'failed to load {MODEL_NAME}'
    engine.current_model.schedule_entries = engine.current_model.plans.get(plan_id, [])
    csv_path = tmp_path / f'{plan_id}.csv'
    result = engine.run_simulation(None, HOURS, output_path=str(csv_path))
    assert result['success'], result.get('error')
    with open(csv_path, newline='', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
    return rows[-1]


@pytest.fixture(scope='module')
def final_rows(tmp_path_factory):
    return {
        plan_id: _final_row(plan_id, tmp_path_factory.mktemp(plan_id))
        for plan_id in PLANS_LEAST_TO_MOST_INTENSIVE
    }


def test_insulin_sensitivity_strictly_ordered_by_intervention_intensity(final_rows):
    values = [float(final_rows[p]['insulin_sensitivity']) for p in PLANS_LEAST_TO_MOST_INTENSIVE]
    assert values == sorted(values), (
        f'insulin_sensitivity not monotonically increasing across '
        f'{PLANS_LEAST_TO_MOST_INTENSIVE}: {values}'
    )
    assert len(set(values)) == len(values), 'expected strictly distinct values, got a tie'


def test_every_intervention_plan_beats_no_intervention_baseline(final_rows):
    baseline = final_rows['ifg_no_intervention']
    baseline_insulin = float(baseline['insulin_sensitivity'])
    baseline_hba1c = float(baseline['hba1c'])

    for plan_id in PLANS_LEAST_TO_MOST_INTENSIVE[1:]:
        row = final_rows[plan_id]
        assert float(row['insulin_sensitivity']) > baseline_insulin + 0.005, (
            f'{plan_id} insulin_sensitivity should clearly exceed the no-intervention baseline'
        )
        assert float(row['hba1c']) < baseline_hba1c - 0.005, (
            f'{plan_id} hba1c should clearly be below the no-intervention baseline'
        )
        lo, hi = HBA1C_THEORETICAL_FLOOR_BAND
        assert lo < float(row['hba1c']) < hi, (
            f'{plan_id} hba1c={row["hba1c"]} outside the documented theoretical-floor band {HBA1C_THEORETICAL_FLOOR_BAND}'
        )
