import logging
from fastapi import APIRouter, HTTPException
from typing import Optional
import app_state
from src.model_serialization import model_to_dict

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/api/models")
async def list_models(folder: Optional[str] = None):
    if app_state.loader_engine is None:
        return {"models": [], "message": "Models system not initialized"}
    try:
        folders = [folder] if folder else None
        models = app_state.loader_engine.scan_models(folders)
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
        return {"success": True, "data": data, **data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model: {e}")
        raise HTTPException(status_code=500, detail=str(e))
