"""Sim and opt execution: loads engine, runs, returns results."""

import logging
import sys
from datetime import date
from pathlib import Path
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger('lm_cli')


# ── engine bootstrap ──────────────────────────────────────────────────────────

def _bootstrap(project_root: Path) -> None:
    """Add project root to sys.path so sim_engine is importable as a package."""
    s = str(project_root)
    if s not in sys.path:
        sys.path.insert(0, s)


def _make_engine(project_root: Path):
    from sim_engine.src.simulator_engine import SimulatorEngine
    models_dir = project_root / 'models'
    return SimulatorEngine(models_directory=str(models_dir))


def _model_name(model_path: Path, project_root: Path) -> str:
    """Return path relative to models/, without extension (for engine load)."""
    models_dir = project_root / 'models'
    try:
        rel = model_path.with_suffix('').relative_to(models_dir)
        return str(rel).replace('\\', '/')
    except ValueError:
        # Outside models/ – pass absolute path (loader supports it)
        return str(model_path)


def _time_hours(engine) -> float:
    sim = engine.current_model.simulator
    start, end = str(sim.get('start_date', '')), str(sim.get('end_date', ''))
    if start and end:
        try:
            return max(1.0, (date.fromisoformat(end) - date.fromisoformat(start)).days * 24.0)
        except ValueError:
            pass
    return float(sim.get('total_time', 24))


# ── public runners ────────────────────────────────────────────────────────────

def run_sim(model_path: Path, project_root: Path, csv_path: Path) -> bool:
    _bootstrap(project_root)
    engine = _make_engine(project_root)
    name = _model_name(model_path, project_root)

    if not engine.load_models([name]):
        logger.error(f'Cannot load model: {name}')
        return False

    hours = _time_hours(engine)
    logger.info(f'Simulation start: {name}  ({hours / 24:.1f} days)')
    print(f'  Running simulation ({hours / 24:.1f} days)...')

    result = engine.run_simulation(name, hours, output_path=str(csv_path))
    print()

    if result.get('success'):
        logger.info(f'Simulation complete: {result["steps"]} steps → {csv_path.name}')
        return True

    logger.error(f'Simulation failed: {result.get("error")}')
    return False


def run_opt(model_path: Path, project_root: Path,
            warm_start: bool, opt_callback: Callable) -> Optional[Dict[str, Any]]:
    _bootstrap(project_root)
    engine = _make_engine(project_root)
    name = _model_name(model_path, project_root)

    from sim_engine.src.optimizer_engine import run_optimizer

    override: Dict = {}
    if not warm_start:
        override['warm_start'] = []   # force cold start even if model has stored results

    logger.info(f'Optimizer start: {name}  (warm_start={warm_start})')
    result = run_optimizer(
        engine, name,
        progress_callback=opt_callback,
        optimizer_override=override or None,
    )
    print()   # newline after last \r progress line

    if not result.get('success'):
        logger.error(f'Optimizer failed: {result.get("error")}')
        return None

    tag = ' (stopped early)' if result.get('stopped') else ''
    logger.info(f'Optimizer complete{tag}: {result.get("n_solutions")} solutions')
    return result
