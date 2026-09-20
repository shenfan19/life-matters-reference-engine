"""Shared fixture for the scenario level regression tests under test_verification/models.

`run_scenario(model, plan_id, tmp_path, step_days=None)` runs one plan of a scenario file from the
model library through the engine layer and returns every output column as a list of floats. The
model library is taken from `LM_MODELS_PATH`, and tests that need a scenario the library does not
contain are skipped, so the suite still runs where life-matters-models is not checked out.
"""

import csv
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from reference_engine.src import paths  # noqa: E402
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402


def require_scenario(model):
    if not (Path(paths.MODELS_DIR) / (model + '.yaml')).exists():
        pytest.skip(f'{model} is not in the model library at {paths.MODELS_DIR}')


@pytest.fixture
def run_scenario():
    def run(model, plan_id, tmp_path, step_days=None, days=730):
        require_scenario(model)
        engine = ReferenceEngine(models_directory=str(paths.MODELS_DIR))
        assert engine.load_models([model]), engine.loader.last_error
        current = engine.current_model
        current.schedule_entries = current.plans.get(plan_id, [])
        if step_days:
            current.simulator['step_size'] = step_days * 86400.0
        csv_path = tmp_path / f'{plan_id}_{step_days or "native"}.csv'
        result = engine.run_simulation(None, days * 24, output_path=str(csv_path))
        assert result['success'], result.get('error')
        with open(csv_path, newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))
        return {k: [float(r[k]) for r in rows] for k in rows[0]}

    return run
