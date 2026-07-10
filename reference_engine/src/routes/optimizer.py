import asyncio
import functools
import uuid
from time import time as _time
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import app_state

router = APIRouter()


class YamlOptRequest(BaseModel):
    model_name: str
    folder: Optional[str] = None
    optimizer_override: Optional[Dict[str, Any]] = None


class ExportModelRequest(BaseModel):
    model_key: str           # path relative to models/, e.g. "papers/paper2/foo.yaml"
    results: Dict[str, Any]  # the optimizer.results block to embed
    flatten_imports: bool = False  # if True, resolve all imports into a single flat YAML


class ExportOptCsvRequest(BaseModel):
    job_id: str
    model_key: str  # used only to name the output subfolder, e.g. "papers/paper2/foo"


@router.post("/api/optimizer/run_yaml")
async def run_yaml_optimization(request: YamlOptRequest):
    """Run optimizer using YAML optimizer: block (NSGA-II / L-BFGS-B / Nelder-Mead).
    optimizer_override merges GUI state into the YAML block before running.
    """
    if app_state.engine is None:
        raise HTTPException(status_code=503, detail="Reference engine not initialized")
    app_state.check_optimizer_capacity()
    try:
        from src.optimizer_engine import run_optimizer
        job_id = str(uuid.uuid4())
        job_history: list = []
        job: Dict[str, Any] = {
            'status': 'running',
            'history': job_history,
            'logs': [{'t': _time(), 'msg': f"Loading model: {request.model_name}"}],
            'result': None,
            'error': None,
            'start_time': _time(),
            'job_type': 'yaml',
            'method': 'nsga2',
        }
        app_state.optimizer_jobs[job_id] = job

        def progress_cb(entry: dict):
            job_history.append(entry)
            it = entry.get('iteration', len(job_history))
            f = entry.get('fitness')
            ne = entry.get('n_eval')
            if it % 5 == 0 or it == 1:
                parts = [f"Gen {it}"]
                if f is not None:
                    parts.append(f"best={f:.4f}")
                if ne:
                    parts.append(f"eval={ne}")
                app_state.add_log(job, "  ".join(parts))

        app_state.add_log(job, "Starting optimizer...")
        log_cb = lambda msg: app_state.add_log(job, msg)
        fn = functools.partial(run_optimizer, app_state.engine,
                               request.model_name, request.folder, progress_cb,
                               request.optimizer_override, log_cb=log_cb)
        asyncio.create_task(app_state.run_optimizer_job(job_id, fn))
        return {'success': True, 'job_id': job_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/optimizer/status/{job_id}")
async def get_optimizer_status(job_id: str):
    if job_id not in app_state.optimizer_jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {job_id}")
    job = app_state.optimizer_jobs[job_id]
    return {
        'job_id': job_id,
        'status': job['status'],
        'history': list(job['history']),
        'logs': list(job['logs']),
        'result': job.get('result'),
        'error': job.get('error'),
        'elapsed': _time() - job.get('start_time', _time()),
        'iteration': len(job['history']),
        'method': job.get('method', ''),
        'job_type': job.get('job_type', ''),
    }


@router.post("/api/optimizer/export-model")
async def export_model_with_results(request: ExportModelRequest):
    """Read model YAML, embed optimizer.results in memory, return YAML text.
    The server file is NEVER modified — this is a stateless operation.
    """
    import yaml
    try:
        models_root = app_state.MODELS_DIR
        target = models_root / request.model_key.lstrip('/')
        if not str(target.resolve()).startswith(str(models_root.resolve())):
            raise HTTPException(status_code=400, detail="Path outside models/")
        if not target.exists():
            raise HTTPException(status_code=404, detail=f"Model file not found: {request.model_key}")

        if request.flatten_imports:
            try:
                from src.model_structure import ModelStructure
                ms = ModelStructure(str(models_root))
                data = ms._load_model_data(str(target), request.model_key)
                data.pop('_sources', None)
                data['imports'] = []
            except Exception:
                with open(target, 'r', encoding='utf-8') as f:
                    data = yaml.safe_load(f) or {}
        else:
            with open(target, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}

        if not isinstance(data.get('optimizer'), dict):
            raise HTTPException(status_code=400, detail="Model has no optimizer: block")

        data['optimizer']['results'] = request.results
        text = yaml.dump(data, allow_unicode=True, default_flow_style=False,
                         sort_keys=False, indent=2)
        name = (data.get('metadata') or {}).get('name', target.stem)
        return {'success': True, 'text': text, 'filename': f"{name}.yaml"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/optimizer/export-csv")
async def export_optimizer_csv(request: ExportOptCsvRequest):
    """Write the job's Pareto front to <OUTPUT_DIR>/<model>/ as a CSV, same format/
    naming convention as the CLI's _opt.csv (reference_engine/src/csv_export.py, shared
    with cli/output.py — neither entry point depends on the other).
    Local-disk mirror of "保存结果到模型" — never touches the model YAML.
    """
    if request.job_id not in app_state.optimizer_jobs:
        raise HTTPException(status_code=404, detail=f"Job not found: {request.job_id}")
    job = app_state.optimizer_jobs[request.job_id]
    result = job.get('result')
    if not result or not result.get('pareto_front'):
        raise HTTPException(status_code=400, detail="No Pareto front to export for this job")

    import os
    from datetime import datetime
    from csv_export import write_opt_csv

    model_stem = os.path.splitext(os.path.basename(request.model_key))[0]
    out_dir = app_state.OUTPUT_DIR / model_stem
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    csv_path = out_dir / f'{model_stem}_{ts}_opt.csv'
    write_opt_csv(result.get('pareto_front', []), result.get('objectives', []), csv_path,
                  x_labels=result.get('decision_var_labels'))
    return {'success': True, 'csv_path': str(csv_path)}


@router.delete("/api/optimizer/job/{job_id}")
async def cancel_optimizer_job(job_id: str):
    if job_id not in app_state.optimizer_jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    app_state.optimizer_jobs[job_id]['status'] = 'cancelled'
    app_state.add_log(app_state.optimizer_jobs[job_id], "Cancelled by user.")
    return {'success': True}
