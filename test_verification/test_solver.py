"""The solver interface (ADR 0160): the reference solver must reproduce the plain
ModelStructure.step() loop exactly, and the registry must negotiate capabilities."""

import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402
from reference_engine.src.schedule_runner import apply_schedules, precompute_sustained_divisors  # noqa: E402
from reference_engine.src import solver as solver_mod  # noqa: E402
from reference_engine.src.solver import (  # noqa: E402
    CAP_EVALUATE, CAP_GRADIENT, ReferenceSolver, Solver, find_solvers, get_solver, list_solvers,
    register_solver,
)

MODEL = 'test_fixtures/valid/test_valid_pulse_reset_bounds_floor'


def _model():
    engine = ReferenceEngine(models_directory=str(ROOT / 'models'))
    assert engine.load_models([MODEL])
    model = engine.current_model
    return model, [{'variable': 'dose', 'events': [{'time_start': '00:00', 'time_end': '00:00', 'value': 0.8}]}]


def _legacy_loop(model, schedules, step, n):
    """The loop optimizer_eval._run_sim had before solvers: the behaviour to preserve."""
    model.reset_simulation()
    schedules = precompute_sustained_divisors(schedules, step)
    history = {k: [] for k in model.variables}
    for i in range(n):
        apply_schedules(model, schedules, i * step, (i + 1) * step, '')
        model.step(step)
        for k, v in model.variables.items():
            history[k].append(v.value)
    return history


def test_reference_solver_matches_plain_step_loop():
    model, schedules = _model()
    expected = _legacy_loop(model, schedules, 3600.0, 48)
    model2, schedules2 = _model()
    got = get_solver().run(model2, schedules2, 3600.0, 48)
    assert got.keys() == expected.keys()
    for name in expected:
        assert got[name] == pytest.approx(expected[name], abs=1e-12), name


def test_advance_resumes_across_calls():
    model, schedules = _model()
    schedules = precompute_sustained_divisors(schedules, 3600.0)
    s = get_solver()
    names = list(model.variables)
    whole, _, _ = s.advance(model, schedules, 3600.0, 20, 0, 0.0, names)
    model2, _ = _model()
    first, step, t = s.advance(model2, schedules, 3600.0, 8, 0, 0.0, names)
    second, step, t = s.advance(model2, schedules, 3600.0, 12, step, t, names)
    assert step == 20 and t == pytest.approx(20 * 3600.0)
    assert first + second == whole


def test_registry_default_and_unknown():
    assert get_solver().id == 'reference'
    assert any(s['id'] == 'reference' for s in list_solvers())
    with pytest.raises(KeyError):
        get_solver('nope')


def test_capability_negotiation():
    assert get_solver() in find_solvers([CAP_EVALUATE])
    assert find_solvers([CAP_GRADIENT]) == []

    class Fake(ReferenceSolver):
        id = 'fake-gradient'
        capabilities = frozenset({CAP_EVALUATE, CAP_GRADIENT})

    register_solver(Fake())
    try:
        assert [s.id for s in find_solvers([CAP_GRADIENT])] == ['fake-gradient']
    finally:
        solver_mod._REGISTRY.pop('fake-gradient')


def test_solver_needs_an_id():
    class Anonymous(Solver):
        def advance(self, *a, **k):
            return [], 0, 0.0

    with pytest.raises(ValueError):
        register_solver(Anonymous())


def test_pick_solver_reports_missing_capability():
    from reference_engine.src.solver import pick_solver
    assert pick_solver(['evaluate']).id == 'reference'
    with pytest.raises(ValueError):
        pick_solver(['gradient'])
    with pytest.raises(ValueError):
        pick_solver(['gradient'], 'reference')


def test_optimizer_runs_on_the_chosen_solver_and_records_it():
    from reference_engine.src.optimizer_engine import run_optimizer
    engine = ReferenceEngine(models_directory=str(ROOT / 'models'))
    result = run_optimizer(engine, 'test_fixtures/valid/test_valid_opt_t1_single',
                           optimizer_override={'algorithm': {'population_size': 6, 'generations': 2, 'seed': 1}},
                           progress_callback=lambda entry: False)
    assert result['success'], result.get('error')
    assert result['solver']['id'] == 'reference'
    assert 'evaluate' in result['solver']['capabilities']


def test_solvers_endpoint():
    sys.path.insert(0, str(ROOT / 'reference_engine'))
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from routes.solvers import router
    app = FastAPI()
    app.include_router(router)
    data = TestClient(app).get('/api/solvers').json()
    assert data['success'] and data['solvers'][0]['id'] == 'reference'
