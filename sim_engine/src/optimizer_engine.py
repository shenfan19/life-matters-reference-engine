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

    Uses apply_regimens() from regimen_runner (pulse reset + accumulate) — same
    kernel as the GUI sim path, eliminating the duplicate implementation.
    """
    from .regimen_runner import apply_regimens

    model.reset_simulation()

    if not hasattr(model, 'manual_overrides'):
        model.manual_overrides = {}
    for var_name in regimen_events_by_var:
        model.manual_overrides[var_name] = True

    # Convert dict format → list format expected by apply_regimens
    regimens_list = [
        {'variable': var_name, 'events': evts}
        for var_name, evts in regimen_events_by_var.items()
    ]

    history: Dict[str, List[float]] = {n: [] for n in model.variables}
    for i in range(total_steps):
        prev_t = i * step_size_sec
        apply_regimens(model, regimens_list, prev_t, prev_t + step_size_sec, sim_start_date)
        model.step(step_size_sec)
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
    """Constraint violations (G[i] > 0 = violated).

    Default (no `metric`): trajectory-wide max/min, i.e. the bound must hold at
    every timestep. `metric: final` checks only the end-of-simulation value,
    for constraints that represent a treatment endpoint/goal rather than an
    always-on safety bound (e.g. variables that start outside the bound).
    """
    G = []
    for con in constraints:
        vals = history.get(con['variable'], [0.0])
        op, threshold = _parse_condition(con.get('condition', '<= 0'))
        metric = con.get('metric')
        if metric == 'final':
            val = vals[-1] if vals else 0.0
            if op in ('<=', '<'):
                G.append(val - threshold)
            else:
                G.append(threshold - val)
        elif op in ('<=', '<'):
            G.append(max(vals) - threshold)
        else:
            G.append(threshold - min(vals))
    return G


# ── main entry ─────────────────────────────────────────────────────────────────

def run_optimizer(simulator_engine, model_name: str,
                  folder: Optional[str] = None, progress_callback=None,
                  optimizer_override: Optional[Dict] = None,
                  log_cb=None) -> Dict[str, Any]:
    """
    Run the optimizer defined in YAML optimizer: block.
    Returns {success, method, objectives, pareto_front, best_x, best_f, n_solutions}.
    pareto_front is a list of {x: [...], f: [...]} dicts (raw, not sign-flipped).

    optimizer_override: if provided, merges into the YAML optimizer: block (GUI overrides YAML).
    Decision variables are defined in optimizer.schedules (entries with optimize: sub-block).
    """
    from .simulator_engine import SimulatorEngine

    # ── load model ────────────────────────────────────────────────────────────
    if not simulator_engine.load_models([model_name], folder):
        return {"success": False, "error": f"Cannot load model: {model_name}"}

    base_model = simulator_engine.current_model
    opt_block: Dict = dict(base_model.optimizer)

    # Apply frontend override (GUI state takes precedence over YAML defaults)
    if optimizer_override:
        for key in ('objectives', 'constraints', 'algorithm', 'method',
                    'start_date', 'end_date', 'step_size', 'schedules'):
            if key in optimizer_override:
                opt_block[key] = optimizer_override[key]

    if not opt_block.get('objectives'):
        return {"success": False, "error": "No objectives configured (add optimizer: block in YAML or set targets in UI)"}

    # ── log model info ────────────────────────────────────────────────────────
    if log_cb:
        n_vars = len(base_model.variables)
        n_formulas = len(base_model.formulas) if hasattr(base_model, 'formulas') else 0
        log_cb(f"Model: {model_name} ({n_vars} vars, {n_formulas} formulas)")
        prov_imports = (base_model.provenance or {}).get('imports', [])
        if prov_imports:
            log_cb(f"Imports: {', '.join(prov_imports)}")

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

    # ── parse decision variables from optimizer.schedules ─────────────────────
    schedules_def = opt_block.get('schedules', [])
    if not schedules_def:
        return {"success": False, "error": "No optimizer.schedules defined"}

    opt_entries = [e for e in schedules_def if 'optimize' in e]
    fixed_entries = [e for e in schedules_def if 'optimize' not in e]
    if not opt_entries:
        return {"success": False, "error": "No entries with optimize: sub-block in optimizer.schedules"}

    var_specs: List[Dict] = []
    lo_list: List[float] = []
    hi_list: List[float] = []

    for e in opt_entries:
        opt = e.get('optimize', {})
        var = e.get('variable', '')
        time_val = e.get('time', '08:00')
        label = e.get('label', f"{var} {time_val}")

        # T1: optimize.value = [lo, hi]
        val_bounds = opt.get('value')
        if val_bounds is not None:
            var_specs.append({'kind': 'value', 'variable': var, 'time': time_val,
                              'label': label, 'entry': e})
            lo_list.append(float(val_bounds[0])); hi_list.append(float(val_bounds[1]))

        # T2: optimize.time = ["HH:MM", "HH:MM"]
        t2 = opt.get('time')
        if isinstance(t2, list) and len(t2) == 2:
            slots = _expand_time_window(f"{t2[0]}~{t2[1]}", opt.get('time_step', '1h'))
            var_specs.append({'kind': 'time', 'variable': var, 'slots': slots, 'entry': e})
            lo_list.append(0.0); hi_list.append(float(len(slots) - 1))

        # T3: optimize.days_pool + optimize.days_n
        days_pool = opt.get('days_pool')
        if days_pool:
            from itertools import combinations as _combos
            n_range = opt.get('days_n', [1, len(days_pool)])
            min_n, max_n = int(n_range[0]), int(n_range[1])
            all_patterns = [list(c) for n in range(min_n, max_n + 1)
                            for c in _combos(days_pool, n)]
            if all_patterns:
                var_specs.append({'kind': 'days', 'variable': var,
                                  'patterns': all_patterns, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(len(all_patterns) - 1))

        # T4: optimize.date_range = [[start_lo, start_hi], [end_lo, end_hi]]
        date_range_opt = opt.get('date_range')
        if isinstance(date_range_opt, list) and len(date_range_opt) == 2:
            from datetime import date as _date
            sw, ew = date_range_opt[0], date_range_opt[1]
            n_s = (_date.fromisoformat(str(sw[1])) - _date.fromisoformat(str(sw[0]))).days
            var_specs.append({'kind': 'date_start', 'variable': var,
                              'window_start': str(sw[0]), 'n_days': n_s, 'entry': e})
            lo_list.append(0.0); hi_list.append(float(n_s))
            n_e = (_date.fromisoformat(str(ew[1])) - _date.fromisoformat(str(ew[0]))).days
            if n_e > 0:
                var_specs.append({'kind': 'date_end', 'variable': var,
                                  'window_start': str(ew[0]), 'n_days': n_e, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(n_e))

    if not var_specs:
        return {"success": False, "error": "No decision dimensions found in optimize: blocks"}

    if log_cb:
        obj_strs = [f"{'↑' if o.get('direction') == 'maximize' else '↓'}{o['variable']}({o.get('metric','final')})"
                    for o in objectives]
        log_cb(f"Objectives ({len(objectives)}): {', '.join(obj_strs)}")
        if constraints:
            con_strs = [f"{c['variable']}{c.get('condition','')}" for c in constraints]
            log_cb(f"Constraints ({len(constraints)}): {', '.join(con_strs)}")
        dec_vars = list({s['variable'] for s in var_specs})
        log_cb(f"Decision vars ({len(var_specs)} dims): {', '.join(dec_vars)}")
        method = opt_block.get('method', 'nsga2')
        algo = opt_block.get('algorithm', {})
        pop = algo.get('population_size', 50)
        gen = algo.get('n_generations', 80)
        log_cb(f"Algorithm: {method}, pop={pop}, gen={gen}")

    reg_variable = opt_entries[0].get('variable', '')
    reg_events = [{'label': s['label'], 'variable': s['variable']}
                  for s in var_specs if s['kind'] == 'value']

    bounds_lo = np.array(lo_list, dtype=float)
    bounds_hi = np.array(hi_list, dtype=float)
    n_var = len(var_specs)

    # Fixed events from fixed_entries (no optimize: block)
    fixed_events_map: Dict[str, List[Dict]] = {}
    for e in fixed_entries:
        v = e.get('variable', '')
        if not v:
            continue
        ev_f: Dict[str, Any] = {'time': e.get('time', '08:00'), 'value': float(e.get('value', 0))}
        if e.get('days'):
            ev_f['days'] = e['days']
        dr = e.get('date_range')
        if isinstance(dr, list) and len(dr) == 2:
            ev_f['valid_start'] = str(dr[0]); ev_f['valid_end'] = str(dr[1])
        if e.get('mode'):
            ev_f['mode'] = e['mode']
        if e.get('time_range'):
            ev_f['time_range'] = e['time_range']
        fixed_events_map.setdefault(v, []).append(ev_f)

    def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
        from datetime import date as _date, timedelta
        events_map: Dict[str, List[Dict]] = {k: list(v) for k, v in fixed_events_map.items()}
        decoded: Dict[int, Dict] = {}
        for i, spec in enumerate(var_specs):
            eid = id(spec['entry'])
            if eid not in decoded:
                e0 = spec['entry']
                d0: Dict[str, Any] = {
                    'variable': spec['variable'],
                    'time': e0.get('time', '08:00'),
                    'days': e0.get('days'),
                    'value': float(e0.get('value', 0)),
                    'valid_start': None,
                    'valid_end': None,
                    'mode': e0.get('mode'),
                    'time_range': e0.get('time_range'),
                }
                dr = e0.get('date_range')
                if isinstance(dr, list) and len(dr) == 2:
                    d0['valid_start'] = str(dr[0]); d0['valid_end'] = str(dr[1])
                decoded[eid] = d0
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
                d['valid_start'] = str(_date.fromisoformat(spec['window_start']) + timedelta(days=offset))
            elif spec['kind'] == 'date_end':
                offset = max(0, min(spec['n_days'], int(round(float(x[i])))))
                d['valid_end'] = str(_date.fromisoformat(spec['window_start']) + timedelta(days=offset))
        for d in decoded.values():
            ev2: Dict = {'time': d['time'], 'value': float(d.get('value', 0))}
            if d.get('days') is not None:
                ev2['days'] = d['days']
            if d.get('valid_start'):
                ev2['valid_start'] = d['valid_start']
            if d.get('valid_end'):
                ev2['valid_end'] = d['valid_end']
            if d.get('mode'):
                ev2['mode'] = d['mode']
            if d.get('time_range'):
                ev2['time_range'] = d['time_range']
            events_map.setdefault(d['variable'], []).append(ev2)
        return events_map

    # ── simulation parameters ─────────────────────────────────────────────────
    # opt_block.start_date / end_date / step_size override simulation block values
    sim_data = base_model.simulator
    _opt_step_cfg = opt_block.get('step_size')
    if _opt_step_cfg and isinstance(_opt_step_cfg, dict):
        _unit_to_sec = {'minute': 60.0, 'hour': 3600.0, 'day': 86400.0}
        step_size = float(_opt_step_cfg.get('value', 1)) * _unit_to_sec.get(
            str(_opt_step_cfg.get('unit', 'minute')).lower(), 60.0)
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
    mc_runs = max(1, int(mc_cfg.get('runs', 1)))
    # optimizer.mc.seed 独立于 algorithm.seed（algorithm.seed 只用于 NSGA-II）
    mc_seed_raw = mc_cfg.get('seed')
    mc_seed = int(mc_seed_raw) if mc_seed_raw is not None else None

    # Collect MC distributions once
    from .mc_utils import collect_param_distributions, apply_parameter_sampling, clone_model
    param_distributions = collect_param_distributions(base_model)
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
        return clone_model(m)

    def evaluate(x: np.ndarray) -> Tuple[List[float], List[float]]:
        """Return (F_mean, G_mean) averaged over mc_runs."""
        events_map = _build_regimen_events(x)
        F_accum = np.zeros(n_obj)
        G_accum = np.zeros(max(n_con, 1))

        for _ in range(mc_runs):
            m = _clone(base_model)
            if param_distributions:
                run_rng = np.random.default_rng(int(rng_master.integers(0, 2**31)))
                apply_parameter_sampling(m, param_distributions, rng=run_rng)
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

class _StopOptimization(Exception):
    """Raised by progress callback to request graceful early stop."""


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
            def __init__(self):
                super().__init__()
                self.latest_front = []  # saved each generation for early-stop recovery

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
                        self.latest_front = front  # keep latest for early-stop recovery
                    if CV is not None and len(CV) > 0:
                        cv_arr = np.asarray(CV, dtype=float).reshape(-1)
                        entry['feasible_ratio'] = float(np.mean(cv_arr <= 1e-9))
                        entry['mean_cv'] = float(np.mean(np.maximum(cv_arr, 0)))
                        entry['max_cv'] = float(np.max(np.maximum(cv_arr, 0)))
                    should_stop = progress_callback(entry)
                    if should_stop:
                        raise _StopOptimization()

        _cb = _ProgressCb() if progress_callback else None

        # Build initial population: warm-start from previous results if available.
        # Filter solutions whose dimension matches current n_var to avoid shape errors.
        sampling = None
        if warm_x:
            valid_warm = [x for x in warm_x if len(x) == n_var]
            if valid_warm:
                rng = np.random.default_rng(seed)
                warm = np.clip(np.array(valid_warm, dtype=float), xl, xu)
                n_warm = len(warm)
                if n_warm >= pop_size:
                    sampling = warm[:pop_size]
                else:
                    n_fill = pop_size - n_warm
                    fill = xl + rng.random((n_fill, n_var)) * (xu - xl)
                    sampling = np.vstack([warm, fill])

        problem = LMProblem()
        algo = NSGA2(pop_size=pop_size) if sampling is None else NSGA2(pop_size=pop_size, sampling=sampling)
        termination = get_termination("n_gen", n_gen)

        _stopped_early = False
        try:
            res = pymoo_minimize(problem, algo, termination, seed=seed, verbose=False, callback=_cb)
        except _StopOptimization:
            _stopped_early = True
            res = None

        # Early stop: use latest saved Pareto front from callback
        if _stopped_early or res is None or res.X is None:
            if _cb and _cb.latest_front:
                front = _cb.latest_front
                best = front[0]
                return {
                    "success": True,
                    "method": "nsga2",
                    "pareto_front": front,
                    "n_solutions": len(front),
                    "best_x": best['x'],
                    "best_f": best['f'],
                    "stopped": True,
                }
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
            "stopped": False,
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
