"""Error-detection regression tests: import/YAML-shape validation (loader.py).

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


def test_circular_import_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_import_circular_a'])
    assert '循环' in engine.loader.last_error


def test_circular_import_is_rejected_from_either_side():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_import_circular_b'])
    assert '循环' in engine.loader.last_error


def test_import_escaping_models_root_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_import_escapes_root'])
    assert '超出 models 目录' in engine.loader.last_error


def test_non_dict_yaml_is_rejected():
    engine = _make_engine()
    assert not engine.load_models(['test_fixtures/invalid/test_invalid_yaml_not_dict'])
    assert 'Invalid YAML' in engine.loader.last_error
