"""Anonymous visit counter for the public SCS demo.

Records only a per-day running total — no IP, cookie, user agent, or any other
identifying detail is stored. The count is read back through a private,
token-gated URL (paths.STATS_TOKEN) rather than a login system.
"""

import json
import logging
from datetime import date

from fastapi import APIRouter, HTTPException
from paths import OUTPUT_DIR, STATS_TOKEN

router = APIRouter()
logger = logging.getLogger(__name__)

# Lives under the same configurable output root as everything else (LM_OUTPUT_PATH
# in .env, see paths.py) so migrating the deployment migrates this file with it.
_COUNTER_FILE = OUTPUT_DIR / "visit_count.json"


def _read_by_day() -> dict:
    try:
        return json.loads(_COUNTER_FILE.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write_by_day(by_day: dict):
    _COUNTER_FILE.parent.mkdir(parents=True, exist_ok=True)
    _COUNTER_FILE.write_text(json.dumps(by_day, sort_keys=True), encoding="utf-8")


@router.post("/api/visit")
async def record_visit():
    try:
        by_day = _read_by_day()
        today = date.today().isoformat()  # server-local date (DigitalOcean droplets default to UTC)
        by_day[today] = by_day.get(today, 0) + 1
        _write_by_day(by_day)
    except Exception as e:
        logger.warning(f"Failed to record visit: {e}")
    return {"success": True}


@router.get("/api/stats/{token}")
async def get_stats(token: str):
    if not STATS_TOKEN or token != STATS_TOKEN:
        raise HTTPException(status_code=404)
    by_day = _read_by_day()
    return {"total": sum(by_day.values()), "by_day": dict(sorted(by_day.items()))}
