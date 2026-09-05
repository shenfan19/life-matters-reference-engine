"""Shared mutable state for all route modules.

api_server.py initializes the engine instances during startup;
route files reference these module-level variables directly.
"""

import asyncio
from time import time as _time
from typing import Dict, Any
from fastapi import HTTPException
from paths import (PROJECT_ROOT, SRC_DIR, BACKEND_DIR, MODELS_DIR, OUTPUT_DIR, SCS_MODE,
                    MAX_CONCURRENT_OPTS, MAX_CONCURRENT_SIMS)

plugin_manager = None
loader_engine = None
engine = None
optimizer_jobs: Dict[str, Dict[str, Any]] = {}


def check_write():
    if SCS_MODE:
        raise HTTPException(status_code=403, detail="SCS mode: write operations are disabled")


def check_optimizer_capacity():
    """A P1 resource protection for public deployment: the global cap on concurrent optimization
    jobs, see paths.MAX_CONCURRENT_OPTS. Only counts jobs with status == 'running' — a completed/
    failed/cancelled historical job stays in optimizer_jobs for the frontend to poll its result,
    without occupying a concurrency slot."""
    running = sum(1 for job in optimizer_jobs.values() if job.get('status') == 'running')
    if running >= MAX_CONCURRENT_OPTS:
        raise HTTPException(
            status_code=503,
            detail=f"Too many concurrent optimization jobs running (max {MAX_CONCURRENT_OPTS}); please retry later",
        )


def check_sim_capacity():
    """A P2 resource protection for public deployment: the global cap on concurrent simulation
    sessions, see paths.MAX_CONCURRENT_SIMS. Only counts sessions that aren't finished
    (completed=False) — a finished session stays in engine.sessions for the frontend to poll/
    export its result, without occupying a concurrency slot (matching check_optimizer_capacity()
    only counting jobs with status=='running'). A stale session is reclaimed by
    cleanup_stale_sessions() (ADR 0128) every 5 minutes; together the two prevent an unbounded
    pile-up of zombie/concurrent sessions."""
    if engine is None:
        return
    running = sum(1 for session in engine.sessions.values() if not session.get('completed', False))
    if running >= MAX_CONCURRENT_SIMS:
        raise HTTPException(
            status_code=503,
            detail=f"Too many concurrent simulation sessions (max {MAX_CONCURRENT_SIMS}); please retry later",
        )


def add_log(job: dict, msg: str):
    job['logs'].append({'t': _time(), 'msg': msg})


async def run_optimizer_job(job_id: str, fn):
    job = optimizer_jobs[job_id]
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, fn)
        job['result'] = result
        job['status'] = 'completed' if result.get('success') else 'failed'
        if not result.get('success'):
            job['error'] = result.get('error', 'Unknown error')
            add_log(job, f"Failed: {job['error']}")
        else:
            add_log(job, "Optimization completed.")
    except Exception as e:
        job['status'] = 'failed'
        job['error'] = str(e)
        add_log(job, f"Error: {e}")
