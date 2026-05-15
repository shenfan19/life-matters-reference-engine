"""
LifeMatters Optimizer Engine.

YAML-driven optimizer: reads model.optimizer block and runs NSGA-II or scipy.
All optimization parameters (objectives, constraints, regimen, algorithm) come
from the YAML file — no hardcoded targets or search spaces.

Replaces the former optimizer_engine.py (hardcoded grid/GA approach, deleted
in refactor 2026-05-02). Entry point: run_optimizer().
"""

import logging
import re
import numpy as np
from typing import Dict, Any, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ── helpers ────────────────────────────────────────────────────────────────────

def _parse_condition(cond: str) -> Tuple[str, float]:
    m = re.match(r'^([<>]=?)\s*(-?\d+(?:\.\d+)?)', cond.strip())
    if m:
        return m.group(1), float(m.group(2))
    return ('<=', 0.0)




def _eval_metric(history: List[float], metric: str) -> float:
    if not history:
        return 0.0
    if metric == 'final':
        return history[-1]
    elif metric == 'max':
        return max(history)
    elif metric == 'min':
        return min(history)
    elif metric == 'mean':
        return sum(history) / len(history)
    return history[-1]


def _run_sim(model, regimen_events_by_var: Dict[str, List[Dict]],
             step_size_sec: float, total_steps: int,
             sim_start_date: str = '') -> Dict[str, List[float]]:
    """Run a full simulation and return per-variable history lists.

    Uses SimulatorEngine._apply_regimens (pulse reset + accumulate) — same
    kernel as the GUI sim path, eliminating the duplicate implementation.
    """
    from .model_structure.base import TIME_UNIT_SECONDS
    from .simulator_engine import SimulatorEngine

    unit_sec = TIME_UNIT_SECONDS.get(getattr(model, 'time_unit', 'second'), 1.0)
    native_step = step_size_sec / unit_sec

    model.reset_simulation()

    if not hasattr(model, 'manual_overrides'):
        model.manual_overrides = {}
    for var_name in regimen_events_by_var:
        model.manual_overrides[var_name] = True

    # Convert dict format → list format expected by the shared _apply_regimens
    regimens_list = [
        {'variable': var_name, 'events': evts}
        for var_name, evts in regimen_events_by_var.items()
    ]

    history: Dict[str, List[float]] = {n: [] for n in model.variables}
    for i in range(total_steps):
        prev_t = i * step_size_sec
        SimulatorEngine._apply_regimens(model, regimens_list, prev_t, prev_t + step_size_sec,
                                        sim_start_date)
        model.step(native_step)
        for n, v in model.variables.items():
            history[n].append(v.value)

    return history


def _eval_F(history: Dict[str, List[float]], objectives: List[Dict]) -> List[float]:
    """Objective vector (pymoo convention: all minimized)."""
    F = []
    for obj in objectives:
        raw = _eval_metric(history.get(obj['variable'], [0.0]), obj.get('metric', 'final'))
        F.append(-raw if obj.get('direction', 'minimize') == 'maximize' else raw)
    return F


def _eval_G(history: Dict[str, List[float]], constraints: List[Dict]) -> List[float]:
    """Constraint violations (G[i] > 0 = violated)."""
    G = []
    for con in constraints:
        vals = history.get(con['variable'], [0.0])
        op, threshold = _parse_condition(con.get('condition', '<= 0'))
        if op in ('<=', '<'):
            G.append(max(vals) - threshold)
        else:
            G.append(threshold - min(vals))
    return G


# ── main entry ─────────────────────────────────────────────────────────────────

def run_optimizer(simulator_engine, model_name: str,
                  folder: Optional[str] = None, progress_callback=None,
                  optimizer_override: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Run the optimizer defined in YAML optimizer: block.
    Returns {success, method, objectives, pareto_front, best_x, best_f, n_solutions}.
    pareto_front is a list of {x: [...], f: [...]} dicts (raw, not sign-flipped).

    optimizer_override: if provided, merges into the YAML optimizer: block (GUI overrides YAML).
    Supports two input-variable formats:
      - inputs: [{variable, time, optimize: {value: [lo, hi]}, ...}]  (new, multi-var)
      - regimen: {variable, events: [{time, dose_bounds, ...}]}        (legacy, single-var)
    """
    from .simulator_engine import SimulatorEngine

    # ── load model ────────────────────────────────────────────────────────────
    if not simulator_engine.load_models([model_name], folder):
        return {"success": False, "error": f"Cannot load model: {model_name}"}

    base_model = simulator_engine.current_model
    opt_block: Dict = dict(base_model.optimizer)

    if not opt_block:
        return {"success": False, "error": "No optimizer: block in YAML"}

    # Apply frontend override (GUI state takes precedence over YAML defaults)
    if optimizer_override:
        for key in ('regimen', 'inputs', 'objectives', 'constraints', 'algorithm', 'method'):
            if key in optimizer_override:
                opt_block[key] = optimizer_override[key]

    # ── parse objectives ──────────────────────────────────────────────────────
    objectives: List[Dict] = []
    if 'objectives' in opt_block:
        objectives = list(opt_block['objectives'])
    elif 'objective' in opt_block:
        objectives = [opt_block['objective']]
    if not objectives:
        return {"success": False, "error": "No objectives defined"}

    # ── parse constraints ─────────────────────────────────────────────────────
    constraints: List[Dict] = list(opt_block.get('constraints', []))

    # ── parse decision variables: inputs: (new) or regimen: (legacy) ─────────
    inputs_def = opt_block.get('inputs', [])
    if inputs_def:
        # New format: each entry with 'optimize' sub-block is a decision variable
        opt_entries = [e for e in inputs_def if 'optimize' in e]
        fixed_entries = [e for e in inputs_def if 'optimize' not in e]
        if not opt_entries:
            return {"success": False, "error": "No inputs with optimize: sub-block defined"}

        decisions = [{
            'variable': e.get('variable', ''),
            'time': e.get('time', '08:00'),
            'label': e.get('label', f"{e.get('variable','')} {e.get('time','')}"),
            'dose_bounds': e.get('optimize', {}).get('value', [0.0, 1.0]),
        } for e in opt_entries]

        reg_variable = decisions[0]['variable']  # primary var (for result field)
        reg_events = decisions  # used for labels at result

        bounds_lo = np.array([d['dose_bounds'][0] for d in decisions], dtype=float)
        bounds_hi = np.array([d['dose_bounds'][1] for d in decisions], dtype=float)
        n_var = len(decisions)

        # Pre-build fixed inputs (not decision vars, fire every step)
        fixed_events_map: Dict[str, List[Dict]] = {}
        for e in fixed_entries:
            v = e.get('variable', '')
            if v:
                fixed_events_map.setdefault(v, []).append(
                    {'time': e.get('time', '08:00'), 'value': float(e.get('value', 0))}
                )

        def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
            events_map: Dict[str, List[Dict]] = {k: list(v) for k, v in fixed_events_map.items()}
            for i, d in enumerate(decisions):
                events_map.setdefault(d['variable'], []).append(
                    {'time': d['time'], 'value': float(x[i])}
                )
            return events_map
    else:
        # Legacy regimen: format (single variable)
        regimen_def = opt_block.get('regimen', {})
        reg_variable = regimen_def.get('variable', '')
        reg_events = regimen_def.get('events', [])

        if not reg_variable or not reg_events:
            return {"success": False, "error": "No decision variables defined (use inputs: or regimen:)"}

        bounds_lo = np.array([e.get('dose_bounds', [0.0, 1.0])[0] for e in reg_events], dtype=float)
        bounds_hi = np.array([e.get('dose_bounds', [0.0, 1.0])[1] for e in reg_events], dtype=float)
        n_var = len(reg_events)

        def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
            return {reg_variable: [
                {'time': reg_events[i].get('time', '08:00'), 'value': float(x[i])}
                for i in range(n_var)
            ]}

    # ── simulation parameters ─────────────────────────────────────────────────
    step_size: float = float(base_model.simulator.get('step_size', 86400.0))
    sim_data = base_model.simulator
    sim_start_date: str = str(sim_data.get('start_date', ''))
    try:
        from datetime import date as _date
        sd = sim_start_date
        ed = str(sim_data.get('end_date', ''))
        if not sd or not ed:
            raise ValueError("no start/end date")
        sy, sm, sdd_ = [int(x) for x in sd.split('-')]
        ey, em, edd_ = [int(x) for x in ed.split('-')]
        if sy >= 1 and ey >= 1:
            total_days = (_date(ey, em, edd_) - _date(sy, sm, sdd_)).days
        else:
            total_days = (ey - sy) * 365 + (em - sm) * 30 + (edd_ - sdd_)
        time_hours = max(1.0, total_days * 24.0)
    except Exception:
        time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0
    total_steps = max(1, int(time_hours * 3600.0 / step_size))

    # ── MC settings ───────────────────────────────────────────────────────────
    mc_cfg = opt_block.get('mc', {})
    mc_enabled = mc_cfg.get('enabled', False)
    mc_runs = max(1, int(mc_cfg.get('sim_runs', 1))) if mc_enabled else 1
    mc_seed = int(opt_block.get('algorithm', {}).get('seed', 42))

    # Collect MC distributions once
    param_distributions = SimulatorEngine._collect_param_distributions(base_model)
    base_model.param_distributions = param_distributions

    # ── algo settings ─────────────────────────────────────────────────────────
    algo_cfg = opt_block.get('algorithm', {})
    pop_size = int(algo_cfg.get('population_size', 50))
    n_gen = int(algo_cfg.get('n_generations', 80))
    seed = int(algo_cfg.get('seed', 42))
    method_raw = str(opt_block.get('method', 'nsga2')).lower()

    n_obj = len(objectives)
    n_con = len(constraints)

    # ── evaluation function ───────────────────────────────────────────────────
    rng_master = np.random.default_rng(mc_seed)

    def _clone(m):
        return simulator_engine._clone_model(m)

    def evaluate(x: np.ndarray) -> Tuple[List[float], List[float]]:
        """Return (F_mean, G_mean) averaged over mc_runs."""
        events_map = _build_regimen_events(x)
        F_accum = np.zeros(n_obj)
        G_accum = np.zeros(max(n_con, 1))

        for _ in range(mc_runs):
            m = _clone(base_model)
            if param_distributions:
                run_rng = np.random.default_rng(int(rng_master.integers(0, 2**31)))
                SimulatorEngine._apply_parameter_sampling(m, param_distributions, rng=run_rng)
            hist = _run_sim(m, events_map, step_size, total_steps, sim_start_date)
            F_accum += np.array(_eval_F(hist, objectives))
            if n_con:
                G_accum += np.array(_eval_G(hist, constraints))

        F_mean = (F_accum / mc_runs).tolist()
        G_mean = (G_accum / mc_runs).tolist() if n_con else []
        return F_mean, G_mean

    # ── warm-start: seed population from existing results ─────────────────────
    # Reads optimizer.results.pareto_front from the YAML (or from optimizer_override)
    warm_front = []
    existing_results = opt_block.get('results') or {}
    if isinstance(existing_results, dict):
        warm_front = existing_results.get('pareto_front', [])
    # Override from GUI (GUI can explicitly pass warm_start=[{x:[...]}, ...])
    if optimizer_override and 'warm_start' in optimizer_override:
        warm_front = optimizer_override['warm_start']
    warm_x = [p['x'] for p in warm_front if isinstance(p, dict) and 'x' in p]

    # ── run optimizer ─────────────────────────────────────────────────────────
    if n_obj >= 2 or method_raw in ('nsga2', 'nsga-ii', 'moea/d'):
        result = _run_nsga2(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi,
                            pop_size, n_gen, seed, objectives,
                            progress_callback=progress_callback, warm_x=warm_x)
    elif method_raw in ('l-bfgs-b', 'l_bfgs_b'):
        result = _run_scipy(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi, method='L-BFGS-B',
                            progress_callback=progress_callback)
    elif method_raw == 'nelder-mead':
        result = _run_scipy(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi, method='Nelder-Mead',
                            progress_callback=progress_callback)
    else:
        result = _run_nsga2(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi,
                            pop_size, n_gen, seed, objectives, progress_callback=progress_callback)

    result['objectives'] = objectives
    result['regimen_variable'] = reg_variable
    result['regimen_event_labels'] = [e.get('label', f'Event {i+1}') for i, e in enumerate(reg_events)]
    result['time_hours'] = time_hours
    return result


# ── NSGA-II ────────────────────────────────────────────────────────────────────

def _run_nsga2(evaluate, n_var, n_obj, n_con, xl, xu, pop_size, n_gen, seed, objectives,
               progress_callback=None, warm_x=None):
    try:
        from pymoo.algorithms.moo.nsga2 import NSGA2
        from pymoo.core.problem import Problem
        from pymoo.optimize import minimize as pymoo_minimize
        from pymoo.termination import get_termination
        from pymoo.core.callback import Callback as _PymooCallback

        class LMProblem(Problem):
            def __init__(self):
                super().__init__(n_var=n_var, n_obj=n_obj, n_ieq_constr=n_con,
                                 xl=xl, xu=xu)

            def _evaluate(self, X, out, *args, **kwargs):
                F_list, G_list = [], []
                for x in X:
                    f, g = evaluate(x)
                    F_list.append(f)
                    G_list.append(g)
                out['F'] = np.array(F_list)
                if n_con:
                    out['G'] = np.array(G_list)

        class _ProgressCb(_PymooCallback):
            def notify(self, algorithm):
                if progress_callback is not None and algorithm.opt is not None:
                    F = algorithm.opt.get('F')
                    X = algorithm.opt.get('X')
                    CV = algorithm.pop.get('CV') if algorithm.pop is not None else None
                    best_f = float(np.min(F)) if F is not None and len(F) > 0 else None
                    entry = {
                        'iteration': algorithm.n_gen,
                        'fitness': best_f,
                        'n_eval': algorithm.evaluator.n_eval,
                    }
                    if F is not None and len(F) > 0:
                        F_arr = np.atleast_2d(F)
                        X_arr = np.atleast_2d(X) if X is not None else None
                        front = []
                        for i in range(len(F_arr)):
                            f_display = []
                            for j, obj in enumerate(objectives):
                                raw = -F_arr[i][j] if obj.get('direction', 'minimize') == 'maximize' else F_arr[i][j]
                                f_display.append(float(raw))
                            point = {'f': f_display}
                            if X_arr is not None and i < len(X_arr):
                                point['x'] = X_arr[i].tolist()
                            front.append(point)
                        entry['pareto_front'] = front
                        entry['pareto_count'] = len(front)
                        entry['objective_ranges'] = [
                            {
                                'min': float(min(p['f'][j] for p in front)),
                                'max': float(max(p['f'][j] for p in front)),
                            }
                            for j in range(len(objectives))
                        ]
                    if CV is not None and len(CV) > 0:
                        cv_arr = np.asarray(CV, dtype=float).reshape(-1)
                        entry['feasible_ratio'] = float(np.mean(cv_arr <= 1e-9))
                        entry['mean_cv'] = float(np.mean(np.maximum(cv_arr, 0)))
                        entry['max_cv'] = float(np.max(np.maximum(cv_arr, 0)))
                    progress_callback(entry)

        _cb = _ProgressCb() if progress_callback else None

        # Build initial population: warm-start from previous results if available
        sampling = None
        if warm_x:
            rng = np.random.default_rng(seed)
            warm = np.array(warm_x, dtype=float)
            warm = np.clip(warm, xl, xu)
            n_warm = len(warm)
            if n_warm >= pop_size:
                sampling = warm[:pop_size]
            else:
                n_fill = pop_size - n_warm
                fill = xl + rng.random((n_fill, len(xl))) * (xu - xl)
                sampling = np.vstack([warm, fill])

        problem = LMProblem()
        algo = NSGA2(pop_size=pop_size) if sampling is None else NSGA2(pop_size=pop_size, sampling=sampling)
        termination = get_termination("n_gen", n_gen)
        res = pymoo_minimize(problem, algo, termination, seed=seed, verbose=False, callback=_cb)

        if res.X is None:
            return {"success": False, "error": "NSGA-II returned no solutions"}

        X = np.atleast_2d(res.X)
        F = np.atleast_2d(res.F)  # pymoo signs (minimize convention)

        # Build pareto front (restore signs for display)
        pareto_front = []
        for i in range(len(X)):
            f_display = []
            for j, obj in enumerate(objectives):
                raw = -F[i][j] if obj.get('direction', 'minimize') == 'maximize' else F[i][j]
                f_display.append(float(raw))
            pareto_front.append({'x': X[i].tolist(), 'f': f_display})

        # Best solution: first on Pareto front (sorted by first objective)
        best = pareto_front[0]

        return {
            "success": True,
            "method": "nsga2",
            "pareto_front": pareto_front,
            "n_solutions": len(pareto_front),
            "best_x": best['x'],
            "best_f": best['f'],
        }

    except ImportError:
        return {"success": False, "error": "pymoo not installed. Run: pip install pymoo"}
    except Exception as e:
        logger.exception("NSGA-II failed")
        return {"success": False, "error": str(e)}


# ── Single-objective scipy ─────────────────────────────────────────────────────

def _run_scipy(evaluate, n_var, n_obj, n_con, xl, xu, method='L-BFGS-B', progress_callback=None):
    try:
        from scipy.optimize import minimize as sp_minimize

        _iters = [0]

        def _scalar(x):
            f, _ = evaluate(np.array(x))
            val = float(f[0]) if f else float('inf')
            _iters[0] += 1
            if progress_callback:
                progress_callback({'iteration': _iters[0], 'fitness': val})
            return val

        x0 = (xl + xu) / 2.0
        bounds = list(zip(xl, xu))

        if method == 'Nelder-Mead':
            res = sp_minimize(_scalar, x0, method='Nelder-Mead')
        else:
            res = sp_minimize(_scalar, x0, method='L-BFGS-B', bounds=bounds)

        if not res.success and res.fun == float('inf'):
            return {"success": False, "error": f"scipy {method} failed: {res.message}"}

        x_opt = res.x.tolist()
        f_opt, _ = evaluate(np.array(x_opt))

        return {
            "success": True,
            "method": method,
            "pareto_front": [{"x": x_opt, "f": f_opt}],
            "n_solutions": 1,
            "best_x": x_opt,
            "best_f": f_opt,
        }
    except Exception as e:
        logger.exception(f"scipy {method} failed")
        return {"success": False, "error": str(e)}
