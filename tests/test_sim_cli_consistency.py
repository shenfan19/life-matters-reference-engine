"""Sim/CLI 一致性回归测试（ADR 0045, ADR 0110）。

按 ADR 0072 的约束，测试直接 import 引擎层 Python 函数，不经 CLI argparse 层、不起 HTTP
server。验证两件事：

1. 给定同一份已解析的 plan/regimen 数据，CLI 路径（`run_simulation`，逐步写 CSV）和 GUI 路径
   （`start_session` + `batch_steps`，逐步内存返回）跑出来的轨迹完全一致。
2. 含分布参数（`parameter: normal(...)` 等）的模型，GUI 在 `sim_runs=1`（未显式要求 MC）时
   必须是确定性结果（取均值），与 CLI 一致 —— 这条用例在 session_manager.py 的 MC 采样修复
   之前会失败，修复后必须通过，作为该 bug 的回归锁定。
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
