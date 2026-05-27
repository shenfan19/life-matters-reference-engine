from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import app_state

router = APIRouter()


class RegimenEventData(BaseModel):
    variable: str
    time: str
    value: float
    days: Optional[List[str]] = None
    date_range: Optional[str] = None
    label: Optional[str] = None


class RegimenData(BaseModel):
    variable: str
    events: List[RegimenEventData]


class SimulationStartRequest(BaseModel):
    model_name: str
    folder: Optional[str] = None
    time_hours: float = 24.0
    step_size: float = 3600.0
    input_params: Optional[Dict[str, Any]] = None
    regimens: Optional[List[RegimenData]] = None
    sim_runs: int = 1
    seed: Optional[int] = None


class SimulationStepRequest(BaseModel):
    session_id: str
    steps: int = 1
    input_changes: Optional[Dict[str, Any]] = None


class SessionRequest(BaseModel):
    session_id: str


@router.post("/api/simulation/start")
async def start_simulation(request: SimulationStartRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    try:
        regimens_raw = [r.dict() for r in request.regimens] if request.regimens else None
        result = app_state.simulator_engine.start_session(
            model_name=request.model_name,
            folder=request.folder,
            time_hours=request.time_hours,
            step_size=request.step_size,
            input_params=request.input_params,
            regimens=regimens_raw,
            sim_runs=max(1, request.sim_runs),
            seed=request.seed,
        )
        if result['success']:
            return result
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to start simulation'))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/simulation/step")
@router.post("/api/simulation/batch")
async def simulation_step(request: SimulationStepRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    try:
        result = app_state.simulator_engine.batch_steps(
            session_id=request.session_id,
            steps=request.steps,
            input_changes=request.input_changes
        )
        if result['success']:
            return result
        raise HTTPException(status_code=500, detail=result.get('error', 'Failed to execute simulation steps'))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/simulation/session/{session_id}")
async def get_simulation_session(session_id: str):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    result = app_state.simulator_engine.get_session_info(session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=404, detail=result.get('error', 'Session not found'))


@router.post("/api/simulation/pause")
async def pause_simulation(request: SessionRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    result = app_state.simulator_engine.pause_session(request.session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=500, detail=result.get('error', 'Failed to pause simulation'))


@router.post("/api/simulation/resume")
async def resume_simulation(request: SessionRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    result = app_state.simulator_engine.resume_session(request.session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=500, detail=result.get('error', 'Failed to resume simulation'))


@router.post("/api/simulation/reset")
async def reset_simulation(request: SessionRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    result = app_state.simulator_engine.reset_session(request.session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=500, detail=result.get('error', 'Failed to reset simulation'))


@router.post("/api/simulation/export")
async def export_simulation(request: SessionRequest):
    if app_state.simulator_engine is None:
        raise HTTPException(status_code=503, detail="Simulator engine not initialized")
    result = app_state.simulator_engine.export_session_csv(request.session_id)
    if result['success']:
        return result
    raise HTTPException(status_code=500, detail=result.get('error', 'Failed to export simulation data'))
