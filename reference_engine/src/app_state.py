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
    """P1 公网部署资源保护：全局并发优化 job 上限，见 paths.MAX_CONCURRENT_OPTS。
    只数 status == 'running' 的 job——completed/failed/cancelled 的历史 job 仍留在
    optimizer_jobs 里供前端轮询结果，不占并发名额。"""
    running = sum(1 for job in optimizer_jobs.values() if job.get('status') == 'running')
    if running >= MAX_CONCURRENT_OPTS:
        raise HTTPException(
            status_code=503,
            detail=f"Too many concurrent optimization jobs running (max {MAX_CONCURRENT_OPTS}); please retry later",
        )


def check_sim_capacity():
    """P2 公网部署资源保护：全局仿真 session 上限，见 paths.MAX_CONCURRENT_SIMS。
    只数未完成（completed=False）的 session——已跑完的 session 仍留在 engine.sessions
    里供前端轮询/导出结果，不占并发名额（对齐 check_optimizer_capacity() 只数
    status=='running' 的 job）。过期 session 由 cleanup_stale_sessions()（ADR 0128）
    每 5 分钟回收，两者共同防止僵尸/并发 session 无限堆积。"""
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
