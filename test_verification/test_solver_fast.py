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


def _numbers(text):
    """CSV text as rows of floats, for a comparison that allows rounding in the last digits."""
    if not isinstance(text, str):
        return text
    return [[float(x) for x in line.split(',')] if i else line for i, line in enumerate(text.splitlines())]


@pytest.mark.skipif('numba' not in {s['id'] for s in solver_mod.list_solvers()}, reason='numba is not installed')
@pytest.mark.parametrize('name', [f'test_fixtures/valid/{n}' for n in FIXTURES] + REAL)
def test_numba_matches_reference(name, tmp_path):
    ref = _numbers(_run(name, 'reference', tmp_path))
    got = _numbers(_run(name, 'numba', tmp_path))
    if not isinstance(ref, list):
        assert got == ref
        return
    assert len(got) == len(ref) and got[0] == ref[0]
    for a, b in zip(ref[1:], got[1:]):
        assert b == pytest.approx(a, rel=1e-9, abs=1e-12)


DIV_ZERO_MODEL = """
metadata:
  name: test_div_zero
  lm_format_version: "1.0"
  description: {problem: p, result: r, limitations: l}
  tags: [test]
variables:
  x: {type: state, value: 1.0, unit: au, bounds: [0.0, 100.0], description: d}
  y: {type: state, value: 0.0, unit: au, bounds: [-100.0, 100.0], description: d}
equations:
  grow:
    description: x doubles until it hits its bound
    condition: true
    dynamics: {x: "x * 2"}
    priority: 2
  ratio:
    description: divides by zero once x leaves zero, so the assignment must be skipped
    condition: true
    dynamics: {y: "1 / (x - x)"}
    priority: 1
simulation:
  step_size: {value: 1, unit: day}
  start_date: "2026-01-01"
  end_date: "2026-01-10"
  output_variables: [x, y]
references: ["TEST"]
"""


def test_numba_hands_division_by_zero_to_the_python_semantics(tmp_path):
    (tmp_path / 'test_div_zero.yaml').write_text(DIV_ZERO_MODEL, encoding='utf-8')
    outs = {}
    for sid in ('reference', 'fast', 'numba'):
        solver_mod.set_default_solver(sid)
        try:
            engine = ReferenceEngine(models_directory=str(tmp_path))
            assert engine.load_models(['test_div_zero'])
            out = tmp_path / f'{sid}.csv'
            result = engine.run_simulation(None, 240.0, output_path=str(out))
            assert result['success'], result.get('error')
            outs[sid] = out.read_text(encoding='utf-8')
        finally:
            solver_mod.set_default_solver('reference')
    assert outs['fast'] == outs['reference'] == outs['numba']
    assert all(line.split(',')[-1] == '0.0' for line in outs['reference'].splitlines()[1:])


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


def test_optimizer_on_each_solver_gives_the_same_front():
    from reference_engine.src.optimizer_engine import run_optimizer
    fronts = {}
    for sid in ('reference', 'fast', 'numba'):
        if sid not in {s['id'] for s in solver_mod.list_solvers()}:
            continue
        engine = ReferenceEngine(models_directory=str(MODELS))
        r = run_optimizer(engine, 'test_fixtures/valid/test_valid_opt_t1_pareto',
                          optimizer_override={'solver': sid, 'algorithm': {'population_size': 8, 'generations': 3, 'seed': 3}},
                          progress_callback=lambda entry: False)
        assert r['success'], r.get('error')
        assert r['solver']['id'] == sid
        fronts[sid] = [(tuple(p['x']), tuple(p['f'])) for p in r['pareto_front']]
    ref = fronts['reference']
    for sid, front in fronts.items():
        assert len(front) == len(ref)
        for (x1, f1), (x2, f2) in zip(ref, front):
            assert x2 == pytest.approx(x1, rel=1e-9, abs=1e-12) and f2 == pytest.approx(f1, rel=1e-9, abs=1e-12)


def test_environment_variable_and_unknown_default():
    import subprocess, os
    r = subprocess.run([sys.executable, '-c',
                        'from reference_engine.src.solver import get_solver; print(get_solver().id)'],
                       cwd=str(ROOT), capture_output=True, text=True, env={**os.environ, 'LM_SOLVER': 'fast'})
    assert r.stdout.strip() == 'fast', r.stderr
    with pytest.raises(KeyError):
        solver_mod.set_default_solver('nope')


def test_gui_session_runs_on_the_named_solver():
    out = {}
    for sid in ('reference', 'fast', 'numba'):
        engine = ReferenceEngine(models_directory=str(MODELS))
        r = engine.start_session('test_fixtures/valid/test_valid_pulse_reset_bounds_floor', time_hours=96.0,
                                 step_size=3600.0, solver=sid)
        assert r['success'], r.get('error')
        assert r['data']['solver']['id'] == sid
        b = engine.batch_steps(r['data']['session_id'], 96)
        assert b['success'], b.get('error')
        out[sid] = b['data']['outputs']
    assert out['fast'] == out['reference']
    assert len(out['numba']) == len(out['reference'])
    for a, b in zip(out['reference'], out['numba']):
        assert b == pytest.approx(a, rel=1e-9, abs=1e-12)


def test_session_with_an_unknown_solver_fails_cleanly():
    engine = ReferenceEngine(models_directory=str(MODELS))
    r = engine.start_session('test_fixtures/valid/test_valid_pulse_reset_bounds_floor', time_hours=24.0,
                             step_size=3600.0, solver='nope')
    assert not r['success'] and 'nope' in r['error']
