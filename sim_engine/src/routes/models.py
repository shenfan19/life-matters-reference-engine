import logging
from fastapi import APIRouter, HTTPException
from typing import Optional
import app_state

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
                 "formulas": info["formulas"], "version": info["version"]}
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
        model = app_state.loader_engine.fetch(model_name, folder, use_cache=False)
        if model is None:
            raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")
        metadata = {
            "name": model.metadata.name if model.metadata else "",
            "version": model.metadata.version if model.metadata else "",
            "author": model.metadata.author if model.metadata else "",
            "description": model.metadata.description if model.metadata else ""
        }
        variables = {
            var_name: {
                "description": var.description, "value": var.value, "unit": var.unit,
                "type": var.type.value if hasattr(var.type, 'value') else str(var.type),
                "reference": var.reference,
            }
            for var_name, var in model.variables.items()
        }
        formulas = {
            f_name: {
                "description": f.description, "condition": f.condition,
                "priority": f.priority, "dynamics": f.dynamics,
                "reference": f.reference,
            }
            for f_name, f in model.formulas.items()
        }
        provenance = getattr(model, 'provenance', {}) or {}
        data = {
            "metadata": metadata, "variables": variables, "formulas": formulas,
            "simulation": model.simulator, "simulator": model.simulator,
            "optimizer": model.optimizer,
            "plans": model.plans,
            "imports": provenance.get('imports', []),
            "provenance": provenance, "resolved": True,
        }
        return {"success": True, "data": data, **data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting model: {e}")
        raise HTTPException(status_code=500, detail=str(e))
