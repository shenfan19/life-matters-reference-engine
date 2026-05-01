"""
YAML-schema aware optimizer for LifeMatters.
Reads model.optimizer block and runs NSGA-II or scipy single-objective.
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


_DAY_MAP = {'mon': 0, 'tue': 1, 'wed': 2, 'thu': 3, 'fri': 4, 'sat': 5, 'sun': 6}


def _apply_regimen_events(model, regimen_events_by_var: Dict[str, List[Dict]],
                          prev_time: float, step_size: float):
    """Fire regimen events whose time falls in [prev_time, prev_time+step_size).

    Respects optional 'days' list on each event (e.g. ['Mon', 'Wed', 'Fri']).
    When step_size >= 86400, ev_sec is always within the window so the only
    filter is the days mask.
    """
    next_time = prev_time + step_size
    prev_sod = prev_time % 86400
    next_sod = next_time % 86400
    day_crossed = int(next_time / 86400) > int(prev_time / 86400)
    day_idx = int(prev_time / 86400)
    dow = day_idx % 7  # 0=Mon … 6=Sun

    for var_name, events in regimen_events_by_var.items():
        if var_name not in model.variables:
            continue
        for ev in events:
            # Days-of-week filter (absent = every day)
            days_filter = ev.get('days', [])
            if days_filter:
                allowed = {_DAY_MAP[d.lower()[:3]] for d in days_filter
                           if d.lower()[:3] in _DAY_MAP}
                if dow not in allowed:
                    continue

            try:
                hh, mm = map(int, ev['time'].split(':'))
            except Exception:
                continue
            ev_sec = hh * 3600 + mm * 60

            if step_size >= 86400:
                # Daily step: event always fires (time filter already covered by days)
                fires = True
            else:
                fires = (ev_sec >= prev_sod or ev_sec < next_sod) if day_crossed \
                    else (prev_sod <= ev_sec < next_sod)

            if fires:
                model.set_variable_value(var_name, float(ev['value']))


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
             step_size_sec: float, total_steps: int) -> Dict[str, List[float]]:
    """Run a full simulation and return per-variable history lists.

    step_size_sec: step size in SECONDS (from model.simulator['step_size']).
    model.step() expects native units, so we divide by unit_sec internally.
    Adds regimen variables to model.manual_overrides so the built-in YAML
    schedule does not override the optimizer's chosen doses.
    """
    from .model_structure.base import TIME_UNIT_SECONDS
    unit_sec = TIME_UNIT_SECONDS.get(getattr(model, 'time_unit', 'second'), 1.0)
    native_step = step_size_sec / unit_sec  # e.g. 86400/86400 = 1.0 for day-step model

    model.reset_simulation()

    # Suppress YAML schedules for variables the optimizer controls
    if not hasattr(model, 'manual_overrides'):
        model.manual_overrides = {}
    for var_name in regimen_events_by_var:
        model.manual_overrides[var_name] = True

    history: Dict[str, List[float]] = {n: [] for n in model.variables}
    for i in range(total_steps):
        prev_t = i * step_size_sec   # seconds-based timeline for regimen timing
        _apply_regimen_events(model, regimen_events_by_var, prev_t, step_size_sec)
        model.step(native_step)      # native units for formula 'step' symbol
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

def run_yaml_optimizer(simulator_engine, model_name: str,
                       folder: Optional[str] = None, progress_callback=None) -> Dict[str, Any]:
    """
    Run the optimizer defined in YAML optimizer: block.
    Returns {success, method, objectives, pareto_front, best_x, best_f, n_solutions}.
    pareto_front is a list of {x: [...], f: [...]} dicts (raw, not sign-flipped).
    """
    from .simulator_engine import SimulatorEngine

    # ── load model ────────────────────────────────────────────────────────────
    if not simulator_engine.load_models([model_name], folder):
        return {"success": False, "error": f"Cannot load model: {model_name}"}

    base_model = simulator_engine.current_model
    opt_block: Dict = dict(base_model.optimizer)

    if not opt_block:
        return {"success": False, "error": "No optimizer: block in YAML"}

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

    # ── parse regimen (decision variables) ───────────────────────────────────
    regimen_def = opt_block.get('regimen', {})
    reg_variable = regimen_def.get('variable', '')
    reg_events = regimen_def.get('events', [])

    if not reg_variable or not reg_events:
        return {"success": False, "error": "No regimen variable/events defined"}

    bounds_lo = np.array([e.get('dose_bounds', [0.0, 1.0])[0] for e in reg_events], dtype=float)
    bounds_hi = np.array([e.get('dose_bounds', [0.0, 1.0])[1] for e in reg_events], dtype=float)
    n_var = len(reg_events)

    # ── simulation parameters ─────────────────────────────────────────────────
    step_size: float = float(base_model.simulator.get('step_size', 86400.0))
    # time_hours from start_date / end_date stored in simulator block
    sim_data = base_model.simulator
    try:
        from datetime import date as _date
        sd = str(sim_data.get('start_date', '2026-01-01'))
        ed = str(sim_data.get('end_date', '2026-12-31'))
        sy, sm, sdd_ = [int(x) for x in sd.split('-')]
        ey, em, edd_ = [int(x) for x in ed.split('-')]
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

    def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
        return {reg_variable: [
            {'time': reg_events[i].get('time', '08:00'), 'value': float(x[i])}
            for i in range(n_var)
        ]}

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
            hist = _run_sim(m, events_map, step_size, total_steps)
            F_accum += np.array(_eval_F(hist, objectives))
            if n_con:
                G_accum += np.array(_eval_G(hist, constraints))

        F_mean = (F_accum / mc_runs).tolist()
        G_mean = (G_accum / mc_runs).tolist() if n_con else []
        return F_mean, G_mean

    # ── run optimizer ─────────────────────────────────────────────────────────
    if n_obj >= 2 or method_raw in ('nsga2', 'nsga-ii', 'moea/d'):
        result = _run_nsga2(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi,
                            pop_size, n_gen, seed, objectives, progress_callback=progress_callback)
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
               progress_callback=None):
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
                    best_f = float(np.min(F)) if F is not None and len(F) > 0 else None
                    progress_callback({
                        'iteration': algorithm.n_gen,
                        'fitness': best_f,
                        'n_eval': algorithm.evaluator.n_eval,
                    })

        _cb = _ProgressCb() if progress_callback else None

        problem = LMProblem()
        algo = NSGA2(pop_size=pop_size)
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
