"""Error-detection regression tests: evidence-block validation (loader.py).

See test_structural_errors.py for the rationale (assert on the real
load_models() path + engine.loader.last_error, not just a bare False).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'


def _make_engine() -> ReferenceEngine:
    return ReferenceEngine(models_directory=str(MODELS_DIR))


def test_evidence_type_on_non_parameter_role_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_evidence_name_collision'])
    assert 'baseline_rate' in engine.loader.last_error
    assert 'parameter' in engine.loader.last_error


def test_evidence_applies_to_missing_baseline_ref_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_evidence_missing_baseline_ref'])
    assert 'baseline_ref' in engine.loader.last_error
