"""Sim/CLI 一致性回归测试（ADR 0045, ADR 0110, ADR 0112, ADR 0113）。

按 ADR 0072 的约束，测试直接 import 引擎层 Python 函数，不经 CLI argparse 层、不起 HTTP
server。验证：

1. 给定同一份已解析的 plan/regimen 数据，CLI 路径（`run_simulation`，逐步写 CSV）和 GUI 路径
   （`start_session` + `batch_steps`，逐步内存返回）跑出来的轨迹完全一致。
2. 含分布参数（`parameter: normal(...)` 等）的模型，GUI 在 `sim_runs=1`（未显式要求 MC）时
   必须是确定性结果（取均值），与 CLI 一致 —— 这条用例在 session_manager.py 的 MC 采样修复
   之前会失败，修复后必须通过，作为该 bug 的回归锁定。
3. MC（sim_runs/--mc-runs > 1）：CLI 的 `run_simulation_mc` 与 GUI 的
   `start_session(sim_runs=N, seed=X)` 用同一个 master seed，必须逐 run 逐步产生完全相同的
   采样参数和轨迹（ADR 0113：两边共用 `advance_steps` 执行核心 + `derive_seed_list` 种子派生）。
4. Opt：GUI 路径未编辑时发给后端的 `optimizer_override`（这里直接取 YAML 的
   `optimizer.startpoint/objectives/constraints/algorithm` 本身，代表一次忠实的前端往返——
   已用 `sim_gui/src/components/sim_tab/optUtils.test.ts` 验证过该往返对 T1-T4 fixture 无损）
   跑出的结果，必须与 CLI 冷启动（只覆盖 warm_start）完全一致（ADR 0112：seed 硬编码 + T4
   `validRangeEnabled` 丢字段的回归锁定）。
"""

import csv
import sys
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sim_engine.src.simulator_engine import SimulatorEngine  # noqa: E402

MODELS_DIR = ROOT / 'models'
TOL = 1e-9


def _hours(start_date: str, end_date: str) -> float:
    return max(1.0, (date.fromisoformat(end_date) - date.fromisoformat(start_date)).days * 24.0)


def _make_engine() -> SimulatorEngine:
    return SimulatorEngine(models_directory=str(MODELS_DIR))


def _read_csv(path: Path):
    with open(path, newline='', encoding='utf-8') as f:
        return list(csv.DictReader(f))


def _cli_rows(model_name: str, plan_id: str, hours: float, csv_path: Path):
    """Replicates exactly what sim_cli/runner.py::run_sim does for one plan."""
    engine = _make_engine()
    assert engine.load_models([model_name]), f'failed to load {model_name}'
    engine.current_model.schedule_entries = engine.current_model.plans.get(plan_id, [])
    result = engine.run_simulation(None, hours, output_path=str(csv_path))
    assert result['success'], result.get('error')
    return _read_csv(csv_path)


def _gui_rows(model_name: str, plan_id: str, hours: float, sim_runs: int = 1):
    """Replicates exactly what routes/simulation.py (start_session + batch_steps) does,
    using the same backend-parsed regimen list the CLI uses (current_model.plans[plan_id])."""
    loader_engine = _make_engine()
    assert loader_engine.load_models([model_name]), f'failed to load {model_name}'
    regimens = loader_engine.current_model.plans.get(plan_id, [])

    engine = _make_engine()
    start = engine.start_session(model_name, hours, regimens=regimens, sim_runs=sim_runs)
    assert start['success'], start.get('error')
    session_id = start['data']['session_id']

    rows = []
    while True:
        res = engine.batch_steps(session_id, steps=500)
        assert res['success'], res.get('error')
        rows.extend(res['data']['outputs'])
        if res['data']['completed']:
            break
    return rows


def _assert_rows_match(cli_rows, gui_rows, variables):
    assert len(cli_rows) == len(gui_rows), (
        f'step count mismatch: cli={len(cli_rows)} gui={len(gui_rows)}'
    )
    for i, (cli_row, gui_row) in enumerate(zip(cli_rows, gui_rows)):
        for var in variables:
            cli_val = float(cli_row[var])
            gui_val = float(gui_row[var])
            assert cli_val == pytest.approx(gui_val, abs=TOL, rel=TOL), (
                f"step {i} var '{var}': cli={cli_val} gui={gui_val}"
            )


@pytest.mark.parametrize('plan_id', ['conservative', 'balanced', 'aggressive'])
def test_plans_no_distribution(tmp_path, plan_id):
    """test_plans.yaml has no distribution parameters — CLI and GUI session execution
    must produce byte-identical trajectories given the same backend-parsed regimens."""
    hours = _hours('2026-01-01', '2026-06-30')
    csv_path = tmp_path / f'test_plans_{plan_id}.csv'

    cli_rows = _cli_rows('test_plans', plan_id, hours, csv_path)
    gui_rows = _gui_rows('test_plans', plan_id, hours)

    _assert_rows_match(cli_rows, gui_rows, ['body_weight', 'caloric_deficit', 'exercise_minutes'])


def test_mc_distribution_sim_runs_1_is_deterministic(tmp_path):
    """test_mc_distributions.yaml has normal/uniform/lognormal parameters. With sim_runs=1
    (no explicit MC request), GUI must use the distribution mean — same as CLI, which never
    samples. This is the regression guard for the session_manager.py MC determinism fix
    (ADR 0045: 'MC=1 deterministic mode uses the mean')."""
    hours = _hours('2026-01-01', '2026-02-28')
    csv_path = tmp_path / 'test_mc_moderate.csv'

    cli_rows = _cli_rows('test_mc_distributions', 'moderate_dose', hours, csv_path)
    gui_rows = _gui_rows('test_mc_distributions', 'moderate_dose', hours, sim_runs=1)

    _assert_rows_match(cli_rows, gui_rows, ['plasma_conc', 'peak_plasma', 'daily_dose'])


def test_mc_runs_match_with_same_seed():
    """CLI's run_simulation_mc(n_runs=3, seed=19) and GUI's
    start_session(sim_runs=3, seed=19) must derive the identical per-run seeds and produce
    bit-identical sampled parameters + trajectories (ADR 0113: shared advance_steps core +
    derive_seed_list). Regression guard for the sim execution-core merge."""
    model_name = 'test_mc_distributions'
    plan_id = 'low_dose'
    hours = _hours('2026-01-01', '2026-02-28')
    n_runs, seed = 3, 19

    cli_engine = _make_engine()
    assert cli_engine.load_models([model_name])
    cli_engine.current_model.schedule_entries = cli_engine.current_model.plans.get(plan_id, [])
    cli_result = cli_engine.run_simulation_mc(None, hours, n_runs=n_runs, seed=seed)
    assert cli_result['success'], cli_result.get('error')
    assert cli_result['session_seed'] == seed

    loader_engine = _make_engine()
    assert loader_engine.load_models([model_name])
    regimens = loader_engine.current_model.plans.get(plan_id, [])
    gui_engine = _make_engine()
    start = gui_engine.start_session(model_name, hours, regimens=regimens, sim_runs=n_runs, seed=seed)
    assert start['success'], start.get('error')
    session_id = start['data']['session_id']
    while True:
        res = gui_engine.batch_steps(session_id, steps=2000)
        assert res['success'], res.get('error')
        if res['data']['completed']:
            break

    gui_runs = gui_engine.sessions[session_id]['runs']
    assert len(cli_result['runs']) == len(gui_runs) == n_runs

    for cli_run, gui_run in zip(cli_result['runs'], gui_runs):
        assert cli_run['seed'] == gui_run['seed']
        gui_model = gui_run['model']
        for var in ('plasma_conc', 'peak_plasma', 'clearance_rate', 'bioavailability', 'volume_dist'):
            cli_val = cli_run['state'][var]['value']
            gui_val = gui_model.variables[var].value
            assert cli_val == pytest.approx(gui_val, abs=TOL, rel=TOL), (
                f"run {cli_run['run_idx']} var '{var}': cli={cli_val} gui={gui_val}"
            )


def test_opt_unedited_gui_override_matches_cli_cold_start():
    """An unedited GUI run sends optimizer_override built from the YAML's own
    startpoint/objectives/constraints/algorithm (proven lossless for T1-T4 by
    optUtils.test.ts). CLI's cold start only overrides warm_start. Both must produce the
    identical optimizer result — regression guard for ADR 0112 (algorithm.seed hardcoding +
    T4 validRangeEnabled bug, both previously caused this to diverge silently)."""
    from sim_engine.src.optimizer_engine import run_optimizer

    model_name = 'test/test_opt_t1_single'

    cli_engine = _make_engine()
    cli_result = run_optimizer(cli_engine, model_name, optimizer_override={'warm_start': []})
    assert cli_result['success'], cli_result.get('error')

    gui_engine = _make_engine()
    assert gui_engine.load_models([model_name])
    opt_block = gui_engine.current_model.optimizer
    gui_override = {
        'startpoint': opt_block['startpoint'],
        'objectives': opt_block['objectives'],
        'constraints': opt_block.get('constraints', []),
        'algorithm': opt_block['algorithm'],
        'warm_start': [],
    }
    gui_result = run_optimizer(gui_engine, model_name, optimizer_override=gui_override)
    assert gui_result['success'], gui_result.get('error')

    assert cli_result['best_x'] == pytest.approx(gui_result['best_x'], abs=TOL, rel=TOL)
    assert cli_result['best_f'] == pytest.approx(gui_result['best_f'], abs=TOL, rel=TOL)
