"""Error-detection regression tests: structural/formula validation (validator.py).

Each fixture in models/test_fixtures/invalid/ is intentionally broken in exactly one
way. These tests go through the same path CLI/GUI use to load a model —
ReferenceEngine.load_models() — and assert the failure is both detected
(load_models() returns False) and explained (engine.loader.last_error
contains the specific reason), not just logged and swallowed as a bare
None/False (see models/test_fixtures/invalid/README.md and the LoaderEngine.fetch()
last_error fix this test suite guards against regressing).
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'


def _make_engine() -> ReferenceEngine:
    return ReferenceEngine(models_directory=str(MODELS_DIR))


def test_invalid_step_size_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_step_size'])
    assert 'step_size' in engine.loader.last_error
    assert '正数' in engine.loader.last_error


def test_optimizer_missing_method_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_optimizer_missing_method'])
    assert 'method' in engine.loader.last_error


def test_formula_undefined_variable_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_formula_undefined_var'])
    assert 'undeclared_var' in engine.loader.last_error


def test_formula_deprecated_dt_symbol_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_formula_deprecated_dt'])
    assert 'dt' in engine.loader.last_error
    assert 'step' in engine.loader.last_error
