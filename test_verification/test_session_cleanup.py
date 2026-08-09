"""Regression test for P0 public-deployment requirement: idle GUI sessions must
be destroyed after SESSION_IDLE_TIMEOUT_SECONDS of inactivity, so zombie
sessions don't accumulate and exhaust server resources. See
2026-06-25_task_prelaunch-publish-verification-checklist.md §4.
"""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from reference_engine.src.reference_engine import ReferenceEngine  # noqa: E402
from reference_engine.src.session_manager import SESSION_IDLE_TIMEOUT_SECONDS  # noqa: E402

MODELS_DIR = ROOT / 'models'
MODEL_NAME = 'test_fixtures/valid/test_valid_equation_condition'


def _make_session():
    engine = ReferenceEngine(models_directory=str(MODELS_DIR))
    result = engine.start_session(MODEL_NAME, time_hours=24)
    assert result['success'], result.get('error')
    return engine, result['data']['session_id']


def test_stale_session_is_removed():
    engine, session_id = _make_session()
    engine.sessions[session_id]['last_active'] -= (SESSION_IDLE_TIMEOUT_SECONDS + 1)

    removed = engine.cleanup_stale_sessions()

    assert removed == [session_id]
    assert session_id not in engine.sessions


def test_active_session_is_kept():
    engine, session_id = _make_session()

    removed = engine.cleanup_stale_sessions()

    assert removed == []
    assert session_id in engine.sessions


def test_batch_steps_refreshes_last_active():
    engine, session_id = _make_session()
    engine.sessions[session_id]['last_active'] -= (SESSION_IDLE_TIMEOUT_SECONDS + 1)

    result = engine.batch_steps(session_id, steps=1)

    assert result['success'], result.get('error')
    removed = engine.cleanup_stale_sessions()
    assert removed == []
    assert session_id in engine.sessions
