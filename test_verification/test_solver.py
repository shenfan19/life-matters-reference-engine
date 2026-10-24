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
    # routes use the `src.` import root of the API server, so it runs in its own interpreter
    import subprocess
    code = (
        "from fastapi import FastAPI\n"
        "from fastapi.testclient import TestClient\n"
        "from routes.solvers import router\n"
        "app = FastAPI(); app.include_router(router)\n"
        "d = TestClient(app).get('/api/solvers').json()\n"
        "assert d['success'] and d['solvers'][0]['id'] == 'reference', d\n"
    )
    r = subprocess.run([sys.executable, '-c', code], cwd=str(ROOT / 'reference_engine' / 'src'),
                       capture_output=True, text=True,
                       env={**__import__('os').environ, 'PYTHONPATH': str(ROOT / 'reference_engine')})
    assert r.returncode == 0, r.stderr



def test_input_signal_is_pure_and_apply_matches_apply_schedules():
    from reference_engine.src.schedule_runner import apply_inputs, compute_inputs, input_trajectory
    model, schedules = _model()
    schedules = precompute_sustained_divisors(schedules, 3600.0)
    sig = compute_inputs(schedules, 0.0, 3600.0)
    assert set(sig) == {'dose'} and sig['dose'] == [0.8]
    assert compute_inputs(schedules, 3600.0, 7200.0) == {'dose': []}
    # the signal alone, no model, is what a compiled solver reads
    traj = input_trajectory(schedules, 3600.0, 48)
    assert traj[0] == {'dose': 0.8} and traj[1] == {'dose': 0.0} and traj[24] == {'dose': 0.8}
    # writing the signal gives the same state as apply_schedules
    m1, _ = _model()
    m2, _ = _model()
    apply_schedules(m1, schedules, 0.0, 3600.0)
    apply_inputs(m2, sig)
    assert m1.variables['dose'].value == m2.variables['dose'].value == pytest.approx(0.8)


def test_blank_variable_name_is_ignored():
    from reference_engine.src.schedule_runner import compute_inputs
    assert compute_inputs([{'variable': '', 'events': [{'value': 1}]}], 0.0, 3600.0) == {}


def test_trajectory_roundtrip_and_solver_stamp():
    from reference_engine.src.result import Trajectory
    model, schedules = _model()
    traj = get_solver().simulate(model, schedules, 3600.0, 10)
    assert len(traj) == 10 and traj.solver['id'] == 'reference'
    assert traj.step == list(range(1, 11))
    again = Trajectory.from_rows(traj.rows(), list(traj.columns), traj.solver)
    assert again == traj
    assert traj.history() is traj.columns


def test_simulation_result_names_the_solver(tmp_path):
    engine = ReferenceEngine(models_directory=str(ROOT / 'models'))
    assert engine.load_models([MODEL])
    engine.current_model.schedule_entries = engine.current_model.plans['default']
    result = engine.run_simulation(None, 48.0, output_path=str(tmp_path / 'r.csv'))
    assert result['success'], result.get('error')
    assert result['solver']['id'] == 'reference'
