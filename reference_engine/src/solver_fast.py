"""The fast fixed-step solver.

It runs the same equations as the reference solver, in the same order, on the same inputs, but
without the per-step bookkeeping the model object does for interactive use: values live in one
flat list instead of Variable objects and the asteval symbol table, the equation functions are
called with positional arguments built from fixed indices, and the history of every assignment
is not recorded. The input signal is read from schedule_runner.compute_inputs, so the schedule
semantics are not implemented a second time.

It must reproduce the reference solver. The conformance suite in test_verification/test_solver_fast.py
compares the two over the fixture models, and a model it cannot run exactly (a step hook, or an
equation that failed to compile to a function) is handed to the reference solver unchanged.
"""

import logging
from typing import Dict, List, Sequence, Tuple

from .model_structure.base import TIME_UNIT_SECONDS
from .schedule_runner import InputSignal
from .solver import CAP_EVALUATE, CAP_EVENTS, CAP_SNAPSHOT, CAP_STOCHASTIC, ReferenceSolver, Solver, register_solver

logger = logging.getLogger(__name__)

_CONSTANT_SYMS = {
    'MINUTE': 60.0, 'HOUR': 3600.0, 'DAY': 86400.0,
    'WEEK': 604800.0, 'MONTH': 2592000.0, 'YEAR': 31536000.0,
}
_STEP_SYMS = ('step', 'step_size', 'dt')
_TIME_SYMS = ('t', 'time')


def _can_run_fast(model) -> bool:
    if any(model.hooks.get(k) for k in ('pre_step', 'post_step')):
        return False
    if not hasattr(model, '_sorted_equations'):
        model._build_equation_cache()
    for cache in model._equation_cache.values():
        raw_cond, cond_fn, _ = cache['cond']
        if isinstance(raw_cond, str) and cond_fn is None:
            return False
        for fn, _params, raw in cache['dyn'].values():
            if isinstance(raw, str) and fn is None:
                return False
    return True


class FastSolver(Solver):
    id = 'fast'
    version = '1'
    capabilities = frozenset({CAP_EVALUATE, CAP_EVENTS, CAP_STOCHASTIC, CAP_SNAPSHOT})

    def __init__(self):
        self._reference = ReferenceSolver()

    def advance(self, model, schedules, step_size, n_steps, start_step, start_time,
                output_variables, sim_start_date=''):
        if not _can_run_fast(model):
            return self._reference.advance(model, schedules, step_size, n_steps, start_step,
                                           start_time, output_variables, sim_start_date)

        names = list(model.variables)
        index = {n: i for i, n in enumerate(names)}
        vars_ = [model.variables[n] for n in names]
        vals = [v.value for v in vars_]
        lo = [v.bounds[0] if v.bounds else float('-inf') for v in vars_]
        hi = [v.bounds[1] if v.bounds else float('inf') for v in vars_]

        unit_sec = TIME_UNIT_SECONDS.get(getattr(model, 'time_unit', 'minute'), 60.0)
        plan = self._plan(model, index, step_size, unit_sec)
        out_idx = [(n, index[n]) for n in output_variables]

        signal_of = InputSignal(schedules, sim_start_date) if schedules else None
        rows: List[Dict] = []
        step, time = start_step, start_time
        model_time = model.time
        for _ in range(n_steps):
            prev_time, next_time = time, time + step_size
            if signal_of is not None:
                signal = signal_of.at(prev_time, next_time)
                for var in signal:
                    if var in index:
                        vals[index[var]] = 0.0
                for var, deltas in signal.items():
                    i = index.get(var)
                    if i is None:
                        continue
                    for d in deltas:
                        vals[i] = max(min(vals[i] + d, hi[i]), lo[i])

            t_now = model_time / unit_sec
            for cond, dyn, syms in plan:
                syms['t'] = t_now
                syms['time'] = t_now
                if cond is not None:
                    kind, fn, argspec = cond
                    if kind == 'fn':
                        try:
                            ok = fn(*[vals[i] if i >= 0 else syms[n] for i, n in argspec])
                        except Exception as err:
                            logger.error("Error in condition: %s", err)
                            continue
                    else:
                        ok = fn
                    if not ok:
                        continue
                for i, fn, argspec, literal in dyn:
                    try:
                        new = fn(*[vals[j] if j >= 0 else syms[n] for j, n in argspec]) if fn is not None else literal
                    except Exception as err:
                        logger.error("Error evaluating dynamics: %s", err)
                        continue
                    if new is None:
                        continue
                    if i >= 0:
                        vals[i] = max(min(new, hi[i]), lo[i])

            model_time += step_size
            step += 1
            time = next_time
            row = {'step': step, 'time': time}
            for n, i in out_idx:
                row[n] = vals[i]
            rows.append(row)

        # write the state back so the model can be inspected or advanced by any solver afterwards
        for v, x in zip(vars_, vals):
            v.value = x
        for n, i in index.items():
            model.asteval.symtable[n] = vals[i]
        model.current_step += n_steps
        model.time = model_time
        return rows, step, time

    @staticmethod
    def _plan(model, index, step_size, unit_sec) -> List[Tuple]:
        """Per equation, in priority order: its condition, its assignments and the step symbols it reads."""
        plan = []
        for eq_name, equation in model._sorted_equations:
            cache = model._equation_cache[eq_name]
            eq_sec = getattr(equation, 'step_size_sec', None) or step_size
            eq_step = step_size / eq_sec if eq_sec else step_size / unit_sec  # as the reference: 1.0 unless the equation declares its own unit
            syms = dict(_CONSTANT_SYMS)
            for s in _STEP_SYMS:
                syms[s] = eq_step
            for s in _TIME_SYMS:
                syms[s] = 0.0

            def spec(params):
                return [(index.get(n, -1), n) for n in params]

            raw_cond, cond_fn, cond_params = cache['cond']
            if cond_fn is not None:
                cond = ('fn', cond_fn, spec(cond_params))
            elif isinstance(raw_cond, str):
                raise AssertionError('checked by _can_run_fast')
            else:
                cond = ('const', raw_cond if raw_cond is not None else True, None)
            dyn = []
            for var_name, (fn, params, raw) in cache['dyn'].items():
                dyn.append((index.get(var_name, -1), fn, spec(params) if params is not None else [], raw))
            plan.append((cond, dyn, syms))
        return plan


register_solver(FastSolver())
