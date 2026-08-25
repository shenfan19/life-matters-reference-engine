"""
LifeMatters Optimizer Engine.

YAML-driven optimizer: reads model.optimizer block and runs NSGA-II or scipy.
All optimization parameters (objectives, constraints, regimen, algorithm) come
from the YAML file — no hardcoded targets or search spaces.

Replaces the former optimizer_engine.py (hardcoded grid/GA approach, deleted
in refactor 2026-05-02). Entry point: run_optimizer().

Split across four files by responsibility (task: code-trust-verification-infra
task7) — this file keeps only the main flow:
  optimizer_parsing.py   — time-window/condition string parsing helpers
  optimizer_eval.py       — simulation execution + objective/constraint evaluation
  optimizer_backends.py   — the two algorithm backends (NSGA-II, scipy)
  optimizer_engine.py     — run_optimizer() itself, with its three closures
                            (_build_regimen_events / _clone / evaluate)
"""

import numpy as np
from typing import Dict, Any, List, Optional, Tuple

from .optimizer_parsing import _expand_time_window, _hhmm_to_min, _shift_time, _snap_to_step
from .optimizer_eval import _run_sim, _eval_F, _eval_G
from .optimizer_backends import _run_nsga2, _run_scipy
from .validation import validate_simulator_dates, validate_optimizer_regimens
from .schedule_runner import resolve_time_interval


# ── main entry ─────────────────────────────────────────────────────────────────

def run_optimizer(engine, model_name: str,
                  folder: Optional[str] = None, progress_callback=None,
                  optimizer_override: Optional[Dict] = None,
                  log_cb=None) -> Dict[str, Any]:
    """
    Run the optimizer defined in YAML optimization: block.
    Returns {success, method, objectives, pareto_front, best_x, best_f, n_solutions}.
    pareto_front is a list of {x: [...], f: [...]} dicts (raw, not sign-flipped).

    optimizer_override: if provided, merges into the YAML optimization: block (GUI overrides YAML).
    Decision variables are defined in optimization.startpoint.regimens (entries with optimize: sub-block).
    """
    # ── load model ────────────────────────────────────────────────────────────
    if not engine.load_models([model_name], folder):
        return {"success": False, "error": engine.loader.last_error or f"Cannot load model: {model_name}"}

    base_model = engine.current_model
    opt_block: Dict = dict(base_model.optimizer)

    # Apply frontend override (GUI state takes precedence over YAML defaults)
    if optimizer_override:
        for key in ('objectives', 'constraints', 'algorithm', 'method',
                    'start_date', 'end_date', 'step_size', 'startpoint', 'mc'):
            if key in optimizer_override:
                opt_block[key] = optimizer_override[key]

    if not opt_block.get('objectives'):
        return {"success": False, "error": "No objectives configured (add optimization: block in YAML or set targets in UI)"}

    # ── log model info ────────────────────────────────────────────────────────
    if log_cb:
        n_vars = len(base_model.variables)
        n_equations = len(base_model.equations) if hasattr(base_model, 'equations') else 0
        log_cb(f"Model: {model_name} ({n_vars} vars, {n_equations} equations)")
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

    # ── parse decision variables from optimization.startpoint.regimens ──────────
    regimens_def = (opt_block.get('startpoint') or {}).get('regimens', [])
    if not regimens_def:
        return {"success": False, "error": "No optimization.startpoint.regimens defined"}

    opt_entries = [e for e in regimens_def if 'optimize' in e]
    fixed_entries = [e for e in regimens_def if 'optimize' not in e]
    if not opt_entries:
        return {"success": False, "error": "No entries with optimize: sub-block in optimization.startpoint.regimens"}

    try:
        validate_optimizer_regimens(regimens_def)
    except ValueError as e:
        return {"success": False, "error": str(e)}

    var_specs: List[Dict] = []
    lo_list: List[float] = []
    hi_list: List[float] = []

    for e in opt_entries:
        opt = e.get('optimize', {})
        var = e.get('variable', '')
        time_val = resolve_time_interval(e)[0]
        label = e.get('label', f"{var} {time_val}")

        # T1: optimize.value = [lo, hi]
        val_bounds = opt.get('value')
        if val_bounds is not None:
            v_lo, v_hi = float(val_bounds[0]), float(val_bounds[1])
            var_specs.append({'kind': 'value', 'variable': var, 'time': time_val,
                              'label': label, 'entry': e,
                              'lo': v_lo, 'hi': v_hi, 'step': opt.get('value_step')})
            lo_list.append(v_lo); hi_list.append(v_hi)

        # T2: optimize.time_start = ["HH:MM", "HH:MM"].
        # 1-dim: only time_start is searched, time_end follows at a fixed offset
        # (= the entry's own time_end - time_start, ADR 0100).
        # 2-dim: optional optimize.time_end = ["HH:MM", "HH:MM"] searches the
        # interval end independently.
        t2 = opt.get('time_start')
        if isinstance(t2, list) and len(t2) == 2:
            slots = _expand_time_window(f"{t2[0]}~{t2[1]}", opt.get('time_step', '1h'))
            var_specs.append({'kind': 'time_start', 'variable': var, 'slots': slots, 'entry': e})
            lo_list.append(0.0); hi_list.append(float(len(slots) - 1))

            t2e = opt.get('time_end')
            if isinstance(t2e, list) and len(t2e) == 2:
                slots_e = _expand_time_window(f"{t2e[0]}~{t2e[1]}", opt.get('time_step', '1h'))
                var_specs.append({'kind': 'time_end', 'variable': var, 'slots': slots_e, 'entry': e})
                lo_list.append(0.0); hi_list.append(float(len(slots_e) - 1))

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
        time_start, time_end = resolve_time_interval(e)
        ev_f: Dict[str, Any] = {
            'value': float(e.get('value', 0)),
            'time_start': time_start,
            'time_end': time_end,
        }
        if e.get('days'):
            ev_f['days'] = e['days']
        dr = e.get('date_range')
        if isinstance(dr, list) and len(dr) == 2:
            ev_f['valid_start'] = str(dr[0]); ev_f['valid_end'] = str(dr[1])
        if e.get('delivery') == 'level':
            ev_f['delivery'] = 'level'
        fixed_events_map.setdefault(v, []).append(ev_f)

    def _build_regimen_events(x: np.ndarray) -> Dict[str, List[Dict]]:
        from datetime import date as _date, timedelta
        events_map: Dict[str, List[Dict]] = {k: list(v) for k, v in fixed_events_map.items()}
        decoded: Dict[int, Dict] = {}
        for i, spec in enumerate(var_specs):
            eid = id(spec['entry'])
            if eid not in decoded:
                e0 = spec['entry']
                e0_time_start, e0_time_end = resolve_time_interval(e0)
                d0: Dict[str, Any] = {
                    'variable': spec['variable'],
                    'time_start': e0_time_start,
                    'time_end': e0_time_end,
                    'days': e0.get('days'),
                    'value': float(e0.get('value', 0)),
                    'valid_start': None,
                    'valid_end': None,
                    'delivery': e0.get('delivery'),
                }
                # T4 end window collapsed (ew[0] == ew[1], not searched): the
                # fixed date never gets a `date_end` var_spec (see parsing
                # above), so it must be seeded here or it silently reverts to
                # "no end date" instead of the declared fixed terminus.
                date_range_opt0 = e0.get('optimize', {}).get('date_range')
                if isinstance(date_range_opt0, list) and len(date_range_opt0) == 2:
                    ew0 = date_range_opt0[1]
                    if str(ew0[0]) == str(ew0[1]):
                        d0['valid_end'] = str(ew0[0])
                dr = e0.get('date_range')
                if isinstance(dr, list) and len(dr) == 2:
                    d0['valid_start'] = str(dr[0]); d0['valid_end'] = str(dr[1])
                # T2 (ADR 0100): whether time_end is searched independently (2-dim)
                # vs. following time_start at a fixed offset (1-dim).
                opt0 = e0.get('optimize', {})
                t2e0 = opt0.get('time_end')
                d0['_time2dim'] = isinstance(t2e0, list) and len(t2e0) == 2
                d0['_width_min'] = max(0, _hhmm_to_min(d0['time_end']) - _hhmm_to_min(d0['time_start']))
                decoded[eid] = d0
            d = decoded[eid]
            if spec['kind'] == 'value':
                step = spec.get('step')
                if step and step > 0:
                    d['value'] = _snap_to_step(float(x[i]), spec['lo'], spec['hi'], float(step))
                else:
                    d['value'] = float(x[i])
            elif spec['kind'] == 'time_start':
                si = max(0, min(len(spec['slots']) - 1, int(round(float(x[i])))))
                d['time_start'] = spec['slots'][si]
                if not d['_time2dim']:
                    d['time_end'] = _shift_time(d['time_start'], d['_width_min'])
            elif spec['kind'] == 'time_end':
                si = max(0, min(len(spec['slots']) - 1, int(round(float(x[i])))))
                d['time_end'] = spec['slots'][si]
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
            ev2: Dict = {
                'value': float(d.get('value', 0)),
                'time_start': d['time_start'], 'time_end': d['time_end'],
            }
            if d.get('days') is not None:
                ev2['days'] = d['days']
            if d.get('valid_start'):
                ev2['valid_start'] = d['valid_start']
            if d.get('valid_end'):
                ev2['valid_end'] = d['valid_end']
            if d.get('delivery') == 'level':
                ev2['delivery'] = 'level'
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
    end_date_raw: str = str(opt_block.get('end_date') or sim_data.get('end_date', ''))
    try:
        validate_simulator_dates(sim_start_date or None, end_date_raw or None, context='optimization')
    except ValueError as e:
        return {"success": False, "error": str(e)}
    try:
        from datetime import date as _date
        sd = sim_start_date
        ed = end_date_raw
        if not sd or not ed:
            raise ValueError("no start/end date")
        sy, sm, sdd_ = [int(x) for x in sd.split('-')]
        ey, em, edd_ = [int(x) for x in ed.split('-')]
        if sy >= 1 and ey >= 1:
            total_days = (_date(ey, em, edd_) - _date(sy, sm, sdd_)).days
        else:
            total_days = (ey - sy) * 365 + (em - sm) * 30 + (edd_ - sdd_)
        # max(total_days, 1) not max(total_days*24, 1.0): a same-day model
        # (start_date == end_date, total_days == 0) represents one full
        # calendar day, not a token 1-hour stub — the old floor left any
        # regimen event scheduled after 01:00 unreachable (ADR: single-day
        # sub-day-step models never fired their schedule).
        time_hours = max(total_days, 1) * 24.0
    except Exception:
        time_hours = float(base_model.simulator.get('total_time', 1)) * step_size / 3600.0
    total_steps = max(1, int(time_hours * 3600.0 / step_size))

    # ── MC settings ───────────────────────────────────────────────────────────
    mc_cfg = opt_block.get('mc', {})
    mc_runs = max(1, int(mc_cfg.get('runs', 1)))
    # optimization.mc.seed 独立于 algorithm.seed（algorithm.seed 只用于 NSGA-II）
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
    # Reads optimization.results.pareto_front from the YAML (or from optimizer_override)
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
        result = _run_scipy(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi, objectives,
                            method='L-BFGS-B', progress_callback=progress_callback)
    elif method_raw == 'nelder-mead':
        result = _run_scipy(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi, objectives,
                            method='Nelder-Mead', progress_callback=progress_callback)
    else:
        result = _run_nsga2(evaluate, n_var, n_obj, n_con, bounds_lo, bounds_hi,
                            pop_size, n_gen, seed, objectives, progress_callback=progress_callback)

    # T1 value_step: the raw x recorded by the backend is the algorithm's
    # continuous internal vector (same as every other tier), not the snapped
    # value _build_regimen_events used to run the simulation — without this,
    # pareto_front/best_x would still show the pre-snap decimals evaluate()
    # never actually simulated. Snap here so recorded x matches simulated x.
    stepped = [(i, s) for i, s in enumerate(var_specs)
               if s['kind'] == 'value' and s.get('step') and s['step'] > 0]
    if stepped and result.get('success'):
        def _snap_x(xvec):
            xvec = list(xvec)
            for i, s in stepped:
                xvec[i] = _snap_to_step(float(xvec[i]), s['lo'], s['hi'], float(s['step']))
            return xvec
        for p in result.get('pareto_front', []):
            if 'x' in p:
                p['x'] = _snap_x(p['x'])
        if result.get('best_x'):
            result['best_x'] = _snap_x(result['best_x'])

    _kind_suffix = {'time_start': ' [time]', 'time_end': ' [time_end]', 'days': ' [days]',
                     'date_start': ' [date]', 'date_end': ' [date_end]'}
    decision_var_labels = [spec['entry'].get('label', spec['variable']) + _kind_suffix.get(spec['kind'], '')
                            for spec in var_specs]

    result['objectives'] = objectives
    result['regimen_variable'] = reg_variable
    result['regimen_event_labels'] = [e.get('label', f'Event {i+1}') for i, e in enumerate(reg_events)]
    result['decision_var_labels'] = decision_var_labels
    result['time_hours'] = time_hours
    return result
