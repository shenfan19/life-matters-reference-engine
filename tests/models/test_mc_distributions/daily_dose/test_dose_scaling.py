"""Multi-value test template for `daily_dose` (tests/models/README.md).

test_mc_distributions.yaml's drug_absorption/elimination formulas are linear in
daily_dose (no saturation term), so doubling/3.5x the dose must scale the
deterministic steady-state plasma_conc and peak_plasma by the same ratio, for
every value daily_dose takes across the model's plans (low/moderate/high
dose). This is a relational check, not a hardcoded golden value: it survives
formula tweaks that change the absolute numbers but keep the linearity.
"""

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'test_mc_distributions'
HOURS = (58) * 24  # model's simulation window: 2026-01-01..2026-02-28

DAILY_DOSE_MG = {
    'low_dose': 100.0,
    'moderate_dose': 200.0,
    'high_dose': 350.0,
}


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
def low_dose_baseline(tmp_path_factory):
    tmp_path = tmp_path_factory.mktemp('low_dose_baseline')
    row = _final_row('low_dose', tmp_path)
    return {
        'dose': DAILY_DOSE_MG['low_dose'],
        'plasma_conc': float(row['plasma_conc']),
        'peak_plasma': float(row['peak_plasma']),
    }


@pytest.mark.parametrize('plan_id', ['moderate_dose', 'high_dose'])
def test_daily_dose_scales_steady_state_linearly(tmp_path, plan_id, low_dose_baseline):
    row = _final_row(plan_id, tmp_path)
    dose_ratio = DAILY_DOSE_MG[plan_id] / low_dose_baseline['dose']

    assert float(row['plasma_conc']) == pytest.approx(
        low_dose_baseline['plasma_conc'] * dose_ratio, rel=1e-6
    )
    assert float(row['peak_plasma']) == pytest.approx(
        low_dose_baseline['peak_plasma'] * dose_ratio, rel=1e-6
    )
