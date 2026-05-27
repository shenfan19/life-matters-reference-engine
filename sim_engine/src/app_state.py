"""Shared mutable state for all route modules.

api_server.py initializes the engine instances during startup;
route files reference these module-level variables directly.
"""

from pathlib import Path
import os
import asyncio
from time import time as _time
from typing import Dict, Any
from fastapi import HTTPException

CURRENT_FILE = Path(__file__).resolve()
SRC_DIR = CURRENT_FILE.parent
BACKEND_DIR = SRC_DIR.parent
PROJECT_ROOT = BACKEND_DIR.parent

SCS_MODE = os.getenv("SCS_MODE", "false").lower() == "true"

plugin_manager = None
loader_engine = None
simulator_engine = None
optimizer_jobs: Dict[str, Dict[str, Any]] = {}


def check_write():
    if SCS_MODE:
        raise HTTPException(status_code=403, detail="SCS mode: write operations are disabled")


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
