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


def load_pareto_from_csv(csv_path: Path, n_obj: int) -> List[Dict]:
    """Parse _opt.csv into [{x: [...], f: [...]}] for warm-start.

    The last n_obj columns (by position) are objective values; all preceding
    columns are decision variables. Position-based (not header-name-based) so
    this works whether x columns are still 'x0,x1,...' or carry schedule labels.
    """
    solutions = []
    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            vals = [float(v) for v in row.values()]
            if len(vals) > n_obj:
                solutions.append({'x': vals[:-n_obj], 'f': vals[-n_obj:]})
    return solutions


# ── public runners ────────────────────────────────────────────────────────────

def run_sim(model_path: Path, project_root: Path, csv_path: Path,
            n_runs: int = 1, seed: Optional[int] = None) -> Optional[List[str]]:
    """Run one simulation per simulation.plans entry, writing `<stem>__<plan_id>.csv` each.

    n_runs > 1 runs Monte Carlo (one independently-sampled run per `n_runs`,
    same seed derivation as the GUI's sim_runs — see ADR 0113), writing
    `<stem>__<plan_id>__run{i}.csv` (or `<stem>__run{i}.csv` for a single
    unnamed plan) instead of the single per-plan CSV.

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

    mc_tag = f', mc_runs={n_runs}' if n_runs > 1 else ''
    logger.info(f'Simulation start (all plans): {name}  ({hours / 24:.1f} days)  plans={plan_ids}{mc_tag}')
    print(f'  Running simulation for {len(plan_ids)} plan(s) ({hours / 24:.1f} days each)'
          f'{f", {n_runs} MC runs" if n_runs > 1 else ""}...')

    written: List[str] = []

    def _path_for(plan_id: str, _i: int) -> str:
        if single_unnamed_plan:
            path = csv_path
        else:
            path = csv_path.with_name(f'{csv_path.stem}__{plan_id}{csv_path.suffix}')
        if n_runs == 1:
            written.append(path.name)
        return str(path)

    result = engine.run_simulation_all_plans(name, hours, output_path_fn=_path_for, n_runs=n_runs, seed=seed)
    print()

    if result.get('success'):
        for p in result['plans']:
            r = p['result']
            if n_runs == 1:
                logger.info(f'  Plan {p["plan_id"]}: {r["steps"]} steps')
            else:
                logger.info(f'  Plan {p["plan_id"]}: {n_runs} runs, seed={r["session_seed"]}')
                for run in r['runs']:
                    if run.get('csv_output'):
                        written.append(Path(run['csv_output']).name)
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

    # Pre-load model to extract objectives — needed both to parse a warm-start
    # CSV (split columns x vs. f by position) and for incremental CSV saves.
    # run_optimizer will reload internally; the extra load is a small one-time cost.
    engine.load_models([name])
    objectives: List[Dict] = []
    try:
        objectives = list(engine.current_model.optimizer.get('objectives', []))
    except Exception:
        pass

    override: Dict = {}
    if warm_start is False:
        override['warm_start'] = []   # force cold start
    elif isinstance(warm_start, Path):
        pareto = load_pareto_from_csv(warm_start, len(objectives))
        override['warm_start'] = pareto
        logger.info(f'Warm-start CSV: {warm_start.name}  ({len(pareto)} solutions)')

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
