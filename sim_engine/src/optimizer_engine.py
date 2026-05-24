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

def _expand_time_window(window: str, opt_step: str = '1h') -> List[str]:
    """Expand "HH:MM~HH:MM" to discrete slot list at given granularity."""
    start_str, end_str = [s.strip() for s in window.split('~')]
    h0, m0 = map(int, start_str.split(':'))
    h1, m1 = map(int, end_str.split(':'))
    step_min = 15 if opt_step == '15min' else 60
    slots, t, end_t = [], h0 * 60 + m0, h1 * 60 + m1
    while t <= end_t:
        slots.append(f'{t // 60:02d}:{t % 60:02d}')
        t += step_min
    return slots


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
        for key in ('regimen', 'inputs', 'objectives', 'constraints', 'algorithm', 'method',
                    'start_date', 'end_date', 'step_size', 'schedules'):
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
        # New format: each entry with 'optimize' sub-block is a decision variable.
        # Each entry may enable T1 (value), T2 (time), T3 (days), T4 (date_start).
        # Integer dims use continuous relaxation: bounds stored as float, rounded on decode.
        opt_entries = [e for e in inputs_def if 'optimize' in e]
        fixed_entries = [e for e in inputs_def if 'optimize' not in e]
        if not opt_entries:
            return {"success": False, "error": "No inputs with optimize: sub-block defined"}

        # var_specs: ordered list of (kind, metadata) for each x dimension
        var_specs: List[Dict] = []
        lo_list: List[float] = []
        hi_list: List[float] = []

        for e in opt_entries:
            opt = e.get('optimize', {})
            var = e.get('variable', '')
            time_val = e.get('time', '08:00')
            label = e.get('label', f"{var} {time_val}")

            # T1: value (always present when optimize: block exists)
            val_bounds = opt.get('value', [0.0, 1.0])
            var_specs.append({'kind': 'value', 'variable': var, 'time': time_val,
                              'label': label, 'entry': e})
            lo_list.append(float(val_bounds[0])); hi_list.append(float(val_bounds[1]))

            # T2: time window → integer slot index (continuous relaxation)
            if opt.get('time') and e.get('time_window'):
                slots = _expand_time_window(e['time_window'], e.get('opt_step', '1h'))
                var_specs.append({'kind': 'time', 'variable': var, 'slots': slots, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(len(slots) - 1))

            # T3: days pattern → integer pattern index (continuous relaxation)
            if opt.get('days') and e.get('days_options'):
                patterns = e['days_options']
                var_specs.append({'kind': 'days', 'variable': var, 'patterns': patterns, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(len(patterns) - 1))

            # T4a: date start → integer day offset (continuous relaxation)
            if opt.get('date_start') and e.get('date_start_window'):
                from datetime import date as _date
                w_parts = e['date_start_window'].split('~')
                w_start = w_parts[0].strip(); w_end = w_parts[1].strip()
                n_days = (_date.fromisoformat(w_end) - _date.fromisoformat(w_start)).days
                var_specs.append({'kind': 'date_start', 'variable': var,
                                  'window_start': w_start, 'n_days': n_days, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(n_days))

            # T4b: date end → integer day offset (continuous relaxation)
            if opt.get('date_end') and e.get('date_end_window'):
                from datetime import date as _date
                w_parts = e['date_end_window'].split('~')
                w_start = w_parts[0].strip(); w_end = w_parts[1].strip()
                n_days = (_date.fromisoformat(w_end) - _date.fromisoformat(w_start)).days
                var_specs.append({'kind': 'date_end', 'variable': var,
                                  'window_start': w_start, 'n_days': n_days, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(n_days))

        # Build labels and reg_variable for result metadata
        reg_variable = opt_entries[0].get('variable', '')
        reg_events = [{'label': s['label'], 'variable': s['variable']}
                      for s in var_specs if s['kind'] == 'value']

        bounds_lo = np.array(lo_list, dtype=float)
        bounds_hi = np.array(hi_list, dtype=float)
        n_var = len(var_specs)

        # Pre-build fixed inputs map: fixed_entries from optimizer.inputs + optimizer.schedules background
        fixed_events_map: Dict[str, List[Dict]] = {}
        for e in fixed_entries:
            v = e.get('variable', '')
            if v:
                fixed_events_map.setdefault(v, []).append(
                    {'time': e.get('time', '08:00'), 'value': float(e.get('value', 0))}
                )
        # optimizer.schedules: fixed background inputs (if present, takes precedence over simulation.schedules
        # for those variables via manual_overrides; absent → simulation.schedules applies as fallback)
        for sched in opt_block.get('schedules', []):
            v = sched.get('variable', '')
            if v:
                ev: Dict[str, Any] = {'time': sched.get('time', '08:00'), 'value': float(sched.get('value', 0))}
                if sched.get('days'):
                    ev['days'] = sched['days']
                if sched.get('valid_start'):
                    ev['valid_start'] = sched['valid_start']
                if sched.get('valid_end'):
                    ev['valid_end'] = sched['valid_end']
                fixed_events_map.setdefault(v, []).append(ev)

        def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
            from datetime import date as _date, timedelta
            events_map: Dict[str, List[Dict]] = {k: list(v) for k, v in fixed_events_map.items()}
            # First pass: collect decoded values per entry (keyed by entry id)
            decoded: Dict[int, Dict] = {}
            for i, spec in enumerate(var_specs):
                eid = id(spec['entry'])
                if eid not in decoded:
                    decoded[eid] = {
                        'variable': spec['variable'],
                        'time': spec['entry'].get('time', '08:00'),
                        'days': spec['entry'].get('days'),
                        'valid_start': None,
                    }
                d = decoded[eid]
                if spec['kind'] == 'value':
                    d['value'] = float(x[i])
                elif spec['kind'] == 'time':
                    si = max(0, min(len(spec['slots']) - 1, int(round(float(x[i])))))
                    d['time'] = spec['slots'][si]
                elif spec['kind'] == 'days':
                    pi = max(0, min(len(spec['patterns']) - 1, int(round(float(x[i])))))
                    d['days'] = spec['patterns'][pi]
                elif spec['kind'] == 'date_start':
                    offset = max(0, min(spec['n_days'], int(round(float(x[i])))))
                    d['valid_start'] = str(_date.fromisoformat(spec['window_start'])
                                          + timedelta(days=offset))
                elif spec['kind'] == 'date_end':
                    offset = max(0, min(spec['n_days'], int(round(float(x[i])))))
                    d['valid_end'] = str(_date.fromisoformat(spec['window_start'])
                                        + timedelta(days=offset))
            # Second pass: build events list
            for d in decoded.values():
                ev: Dict = {'time': d['time'], 'value': float(d.get('value', 0))}
                if d.get('days') is not None:
                    ev['days'] = d['days']
                if d.get('valid_start'):
                    ev['valid_start'] = d['valid_start']
                if d.get('valid_end'):
                    ev['valid_end'] = d['valid_end']
                events_map.setdefault(d['variable'], []).append(ev)
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
    # opt_block.start_date / end_date / step_size override simulation block values
    sim_data = base_model.simulator
    _opt_step_cfg = opt_block.get('step_size')
    if _opt_step_cfg and isinstance(_opt_step_cfg, dict):
        _unit_to_sec = {'second': 1.0, 'minute': 60.0, 'hour': 3600.0, 'day': 86400.0}
        step_size = float(_opt_step_cfg.get('value', 1)) * _unit_to_sec.get(
            str(_opt_step_cfg.get('unit', 'second')).lower(), 1.0)
    else:
        step_size = float(base_model.simulator.get('step_size', 86400.0))
    sim_start_date: str = str(opt_block.get('start_date') or sim_data.get('start_date', ''))
    try:
        from datetime import date as _date
        sd = sim_start_date
        ed = str(opt_block.get('end_date') or sim_data.get('end_date', ''))
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
    # mc.seed 优先；回退到 algorithm.seed；最终默认 42
    mc_seed = int(mc_cfg.get('seed', opt_block.get('algorithm', {}).get('seed', 42)))

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
