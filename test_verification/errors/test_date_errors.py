"""Error-detection regression test: upfront date-range validation (validation.py).

Unlike the other test_verification/errors/ fixtures, this one loads fine — end_date <
start_date is not a structural error checked by Validator.validate_model(),
only by validate_simulator_dates(), which run_simulation()/run_simulation_mc()/
start_session() call upfront (ADR 0118). So the failure only surfaces when
actually running the model, not at load_models() time.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'


def test_end_date_before_start_date_loads_but_fails_to_run():
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    assert engine.load_models(['test_fixtures/invalid/test_invalid_date_range'])

    result = engine.run_simulation('test_fixtures/invalid/test_invalid_date_range', 24.0)

    assert result['success'] is False
    assert 'end_date' in result['error']
    assert 'is before' in result['error']
