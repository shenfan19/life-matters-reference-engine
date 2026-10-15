import asyncio
import logging
import time
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from typing import Optional
import app_state
from src.model_serialization import model_to_dict

router = APIRouter()
logger = logging.getLogger(__name__)


# Listing the models loads every model file once, which for a library of thousands of models takes tens of seconds
# and used to run again for every request, so a script or a page asking for the list a few times in a row kept the
# server busy for minutes. The list is kept for a short time, requests that arrive while it is being built wait for
# that one build, and the work runs in a worker thread so the server keeps answering. `?refresh=true` skips the kept list.
SCAN_KEEP_SECONDS = 60
_scan_cache: dict = {}
_scan_lock = None


async def _scan_models_cached(folders, refresh: bool):
    global _scan_lock
    if _scan_lock is None:
        _scan_lock = asyncio.Lock()
    key = tuple(folders) if folders else None
    async with _scan_lock:
        hit = _scan_cache.get(key)
        if hit and not refresh and time.monotonic() - hit[0] < SCAN_KEEP_SECONDS:
            return hit[1]
        models = await run_in_threadpool(app_state.loader_engine.scan_models, folders)
        _scan_cache[key] = (time.monotonic(), models)
        return models


@router.get("/api/models")
async def list_models(folder: Optional[str] = None, refresh: bool = False):
    if app_state.loader_engine is None:
        return {"models": [], "message": "Models system not initialized"}
    try:
        folders = [folder] if folder else None
        models = await _scan_models_cached(folders, refresh)
        return {
            "models": [
                {"name": name, "variables": info["variables"],
                 "equations": info["equations"], "version": info["version"]}
                for name, info in models.items()
            ],
            "total": len(models)
        }
    except Exception as e:
        logger.error(f"Error listing models: {e}")
        return {"models": [], "error": str(e)}


@router.get("/api/models/{model_name}")
async def get_model(model_name: str, folder: Optional[str] = None):
    if app_state.loader_engine is None:
        raise HTTPException(status_code=503, detail="Models system not initialized")
    try:
        model = app_state.loader_engine.fetch(model_name, folder)
        if model is None:
            raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")
        data = model_to_dict(model)
        return {"success": True, "data": data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model: {e}")
        raise HTTPException(status_code=500, detail=str(e))
