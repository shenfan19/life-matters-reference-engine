"""Regression test for P1/P2 public-deployment resource protection: global caps
on concurrent optimization jobs and simulation sessions, so many simultaneous
GUI users can't exhaust server resources. See
2026-06-25_task_prelaunch-publish-verification-checklist.md §4.
"""

import sys
from pathlib import Path

import pytest
from fastapi import HTTPException

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402

# Import the package first, above, while only ROOT is on sys.path — inserting
# reference_engine/src ahead of ROOT would shadow the `reference_engine`
# package with the flat reference_engine/src/reference_engine.py module and
# break its internal relative imports (`from .model_structure import ...`).
sys.path.insert(0, str(ROOT / 'reference_engine' / 'src'))
import app_state  # noqa: E402
from paths import MAX_CONCURRENT_OPTS, MAX_CONCURRENT_SIMS  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'test/valid/test_formula_condition'


@pytest.fixture
def clean_app_state():
    """app_state.engine/optimizer_jobs are process-wide singletons — snapshot
    and restore around each test so this file can't leak state into other
    tests (or into a real server process importing the same module)."""
    saved_engine, saved_jobs = app_state.engine, app_state.optimizer_jobs
    app_state.optimizer_jobs = {}
    yield
    app_state.engine, app_state.optimizer_jobs = saved_engine, saved_jobs


def test_check_optimizer_capacity_allows_under_limit(clean_app_state):
    app_state.optimizer_jobs = {f'job-{i}': {'status': 'running'} for i in range(MAX_CONCURRENT_OPTS - 1)}
    app_state.check_optimizer_capacity()  # must not raise


def test_check_optimizer_capacity_blocks_at_limit(clean_app_state):
    app_state.optimizer_jobs = {f'job-{i}': {'status': 'running'} for i in range(MAX_CONCURRENT_OPTS)}
    with pytest.raises(HTTPException) as exc_info:
        app_state.check_optimizer_capacity()
    assert exc_info.value.status_code == 503


def test_check_optimizer_capacity_ignores_completed_jobs(clean_app_state):
    """A finished job stays in optimizer_jobs (the frontend still polls its
    result) but must not count against the concurrency limit."""
    app_state.optimizer_jobs = {
        f'done-{i}': {'status': 'completed'} for i in range(MAX_CONCURRENT_OPTS * 3)
    }
    app_state.check_optimizer_capacity()  # must not raise


def test_check_sim_capacity_allows_under_limit(clean_app_state):
    app_state.engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    for _ in range(MAX_CONCURRENT_SIMS - 1):
        result = app_state.engine.start_session(MODEL_NAME, time_hours=24)
        assert result['success'], result.get('error')
    app_state.check_sim_capacity()  # must not raise


def test_check_sim_capacity_blocks_at_limit(clean_app_state):
    app_state.engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    for _ in range(MAX_CONCURRENT_SIMS):
        result = app_state.engine.start_session(MODEL_NAME, time_hours=24)
        assert result['success'], result.get('error')
    with pytest.raises(HTTPException) as exc_info:
        app_state.check_sim_capacity()
    assert exc_info.value.status_code == 503


def test_check_sim_capacity_noop_before_engine_initialized(clean_app_state):
    app_state.engine = None
    app_state.check_sim_capacity()  # must not raise — nothing to protect yet
