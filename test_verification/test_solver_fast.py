"""Conformance: the fast solver must reproduce the reference solver (ADR 0163).

The same model is run to a CSV under each solver and the files are compared line by line, so any
difference in an equation, in the order they run, in the bounds or in the input signal shows up."""

import sys
import time
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src import solver as solver_mod  # noqa: E402
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

MODELS = ROOT / 'models'
FIXTURES = sorted(p.stem for p in (MODELS / 'test_fixtures' / 'valid').glob('*.yaml'))
REAL = sorted(p.relative_to(MODELS).with_suffix('').as_posix()
              for p in (MODELS / 'references').rglob('*.yaml'))[:60]


def _run(model_name, solver_id, tmp_path, hours=96.0):
    solver_mod.set_default_solver(solver_id)
    try:
        engine = ReferenceEngine(models_directory=str(MODELS))
        if not engine.load_models([model_name]):
            return None
        plans = getattr(engine.current_model, 'plans', None) or {}
        if plans.get('default'):
            engine.current_model.schedule_entries = plans['default']
        out = tmp_path / f'{solver_id}.csv'
        result = engine.run_simulation(None, hours, output_path=str(out))
        if not result.get('success'):
            return ('error', result.get('error'))
        assert result['solver']['id'] == solver_id
        return out.read_text(encoding='utf-8')
    finally:
        solver_mod.set_default_solver('reference')


@pytest.mark.parametrize('name', [f'test_fixtures/valid/{n}' for n in FIXTURES] + REAL)
def test_fast_matches_reference(name, tmp_path):
    ref = _run(name, 'reference', tmp_path)
    fast = _run(name, 'fast', tmp_path)
    assert fast == ref


def test_fast_histories_identical_and_faster_on_long_runs():
    """Solver.run over 20000 steps of reference models: identical histories, less total time."""
    total = {'reference': 0.0, 'fast': 0.0}
    compared = 0
    for name in REAL[:25]:
        runs = {}
        for sid in total:
            engine = ReferenceEngine(models_directory=str(MODELS))
            if not engine.load_models([name]):
                break
            t0 = time.perf_counter()
            hist = solver_mod.get_solver(sid).run(engine.current_model, [], 60.0, 20000)
            runs[sid] = (time.perf_counter() - t0, hist)
        else:
            assert runs['fast'][1] == runs['reference'][1], name
            for sid in total:
                total[sid] += runs[sid][0]
            compared += 1
    assert compared >= 5
    print(f"{compared} models: reference {total['reference']:.2f}s, fast {total['fast']:.2f}s")
    assert total['fast'] < total['reference']
