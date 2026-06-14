"""Sim and opt execution: loads engine, runs, returns results."""

import csv
import logging
import sys
from datetime import date
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Union

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


def load_pareto_from_csv(csv_path: Path) -> List[Dict]:
    """Parse _opt.csv into [{x: [...], f: [...]}] for warm-start.

    x columns are named x0, x1, ...; all other columns are f values.
    """
    solutions = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            x_items = sorted(
                [(int(k[1:]), float(v)) for k, v in row.items()
                 if k.startswith('x') and k[1:].isdigit()],
                key=lambda t: t[0],
            )
            f_vals = [float(v) for k, v in row.items()
                      if not (k.startswith('x') and k[1:].isdigit())]
            if x_items:
                solutions.append({'x': [v for _, v in x_items], 'f': f_vals})
    return solutions


# ── public runners ────────────────────────────────────────────────────────────

def run_sim(model_path: Path, project_root: Path, csv_path: Path) -> Optional[List[str]]:
    """Run one simulation per simulation.plans entry, writing `<stem>__<plan_id>.csv` each.

    Returns the list of written CSV filenames, or None on failure.
    """
    _bootstrap(project_root)
    engine = _make_engine(project_root)
    name = _model_name(model_path, project_root)

    if not engine.load_models([name]):
        logger.error(f'Cannot load model: {name}')
        return None

    hours = _time_hours(engine)
    plan_ids = list(engine.current_model.plans.keys()) or ['default']
    single_unnamed_plan = plan_ids == ['default']

    logger.info(f'Simulation start (all plans): {name}  ({hours / 24:.1f} days)  plans={plan_ids}')
    print(f'  Running simulation for {len(plan_ids)} plan(s) ({hours / 24:.1f} days each)...')

    written: List[str] = []

    def _path_for(plan_id: str, _i: int) -> str:
        if single_unnamed_plan:
            path = csv_path
        else:
            path = csv_path.with_name(f'{csv_path.stem}__{plan_id}{csv_path.suffix}')
        written.append(path.name)
        return str(path)

    result = engine.run_simulation_all_plans(name, hours, output_path_fn=_path_for)
    print()

    if result.get('success'):
        for p in result['plans']:
            logger.info(f'  Plan {p["plan_id"]}: {p["result"]["steps"]} steps')
        return written

    logger.error(f'Simulation failed: {result.get("error")}')
    return None


def run_opt(model_path: Path, project_root: Path,
            warm_start: Union[bool, Path],
            opt_callback: Callable,
            incremental_csv: Optional[Path] = None) -> Optional[Dict[str, Any]]:
    """Run optimizer.

    warm_start:
      False       – cold start (ignores stored YAML results)
      True        – warm start from model YAML optimizer.results
      Path        – warm start from a specific _opt.csv file
    incremental_csv:
      If given, overwrites this path with the current Pareto front after every
      generation so partial results survive an interrupted run.
    """
    _bootstrap(project_root)
    engine = _make_engine(project_root)
    name = _model_name(model_path, project_root)

    from sim_engine.src.optimizer_engine import run_optimizer

    override: Dict = {}
    if warm_start is False:
        override['warm_start'] = []   # force cold start
    elif isinstance(warm_start, Path):
        pareto = load_pareto_from_csv(warm_start)
        override['warm_start'] = pareto
        logger.info(f'Warm-start CSV: {warm_start.name}  ({len(pareto)} solutions)')

    # Pre-load model to extract objectives for incremental CSV saves.
    # run_optimizer will reload internally; the extra load is a small one-time cost.
    objectives: List[Dict] = []
    if incremental_csv:
        engine.load_models([name])
        try:
            objectives = list(engine.current_model.optimizer.get('objectives', []))
        except Exception:
            pass

    # Wrap callback: per-generation display + incremental save
    if incremental_csv and objectives:
        from output import write_opt_csv as _write_csv

        def _callback(entry: dict) -> bool:
            front = entry.get('pareto_front', [])
            if front:
                _write_csv(front, objectives, incremental_csv)
            return opt_callback(entry) if opt_callback else False
    else:
        _callback = opt_callback

    logger.info(f'Optimizer start: {name}  (warm_start={warm_start!r})')
    result = run_optimizer(
        engine, name,
        progress_callback=_callback,
        optimizer_override=override or None,
    )
    print()   # newline after last \r progress line

    if not result.get('success'):
        logger.error(f'Optimizer failed: {result.get("error")}')
        return None

    tag = ' (stopped early)' if result.get('stopped') else ''
    logger.info(f'Optimizer complete{tag}: {result.get("n_solutions")} solutions')
    return result
