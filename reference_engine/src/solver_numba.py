"""The compiled fixed-step solver.

The whole run, every step and every equation, is turned into one numba function. The equation
expressions are rewritten from names to slots of a value array, the input signal is computed
ahead of the run by schedule_runner.compute_inputs and passed in as an array, and the loop runs
in machine code. The compiled function is cached by its source, so the thousands of evaluations
of one optimization compile it once.

The compiled code reports division by zero by raising, as Python does, and flags a value that is
not finite. In both cases, and for any model or expression numba cannot compile, the run is done
again by the fast solver from the untouched model, so the result is always the one the equation
semantics give. numba is optional: without it this solver is not registered.

It follows the reference solver to floating point rounding, not bit for bit, because the compiled
math functions may differ in the last digit. The conformance suite compares with a relative
tolerance of 1e-9.
"""

import ast
import hashlib
import logging
import math
from typing import Dict, List

import numpy as np

from .model_structure.base import TIME_UNIT_SECONDS
from .schedule_runner import compute_inputs
from .solver import CAP_EVALUATE, CAP_EVENTS, CAP_STOCHASTIC, Solver, get_solver, register_solver
from .solver_fast import _can_run_fast

try:
    import numba
except ImportError:  # pragma: no cover - exercised only where numba is missing
    numba = None

logger = logging.getLogger(__name__)

_CONSTANTS = {
    'MINUTE': 60.0, 'HOUR': 3600.0, 'DAY': 86400.0,
    'WEEK': 604800.0, 'MONTH': 2592000.0, 'YEAR': 31536000.0,
}
_NAMESPACE = {
    'math': math, 'np': np,
    'sin': math.sin, 'cos': math.cos, 'tan': math.tan, 'asin': math.asin, 'acos': math.acos,
    'atan': math.atan, 'atan2': math.atan2, 'exp': math.exp, 'log': math.log, 'log10': math.log10,
    'sqrt': math.sqrt, 'ceil': math.ceil, 'floor': math.floor,
    'pi': math.pi, 'e': math.e,
}
_COMPILED: Dict[str, object] = {}


class _Rewrite(ast.NodeTransformer):
    """Names of model variables become slots of `vals`; step and time symbols become locals."""

    def __init__(self, index: Dict[str, int], eq: int):
        self.index, self.eq = index, eq

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load):
            if node.id in self.index:
                return ast.copy_location(ast.Subscript(
                    value=ast.Name('vals', ast.Load()), slice=ast.Constant(self.index[node.id]), ctx=ast.Load()), node)
            if node.id in ('step', 'step_size', 'dt'):
                return ast.copy_location(ast.Name(f'es{self.eq}', ast.Load()), node)
            if node.id in ('t', 'time'):
                return ast.copy_location(ast.Name('t_now', ast.Load()), node)
            if node.id in _CONSTANTS:
                return ast.copy_location(ast.Constant(_CONSTANTS[node.id]), node)
        return node


def _rewrite(expr: str, index, eq: int) -> str:
    tree = ast.parse(expr, mode='eval')
    return ast.unparse(ast.fix_missing_locations(_Rewrite(index, eq).visit(tree)))


def _source(model, index: Dict[str, int]) -> str:
    lines = [
        "def _run(vals, lo, hi, eq_steps, contrib, ctrl_idx, n_steps, step_size, t0, unit_sec, out_idx, out):",
        "    mt = t0",
        "    bad = 0",
        "    for k in range(n_steps):",
        "        for c in range(ctrl_idx.shape[0]):",
        "            vals[ctrl_idx[c]] = 0.0",
        "        for c in range(ctrl_idx.shape[0]):",
        "            i = ctrl_idx[c]",
        "            for m in range(contrib.shape[2]):",
        "                d = contrib[k, c, m]",
        "                if d == d:",
        "                    vals[i] = max(min(vals[i] + d, hi[i]), lo[i])",
        "        t_now = mt / unit_sec",
    ]
    for n, (eq_name, _eq) in enumerate(model._sorted_equations):
        cache = model._equation_cache[eq_name]
        lines.append(f"        es{n} = eq_steps[{n}]")
        raw_cond, _fn, _p = cache['cond']
        indent = "        "
        if isinstance(raw_cond, str):
            lines.append(f"        if {_rewrite(raw_cond, index, n)}:")
            indent = "            "
        elif raw_cond is not None and not raw_cond:
            continue
        else:
            lines.append("        if True:")
            indent = "            "
        any_dyn = False
        for var_name, (_f, _params, raw) in cache['dyn'].items():
            slot = index.get(var_name)
            if slot is None:
                continue
            any_dyn = True
            expr = _rewrite(raw, index, n) if isinstance(raw, str) else repr(float(raw))
            lines.append(f"{indent}new = {expr}")
            lines.append(f"{indent}if not (new - new == 0.0):")
            lines.append(f"{indent}    bad = 1")
            lines.append(f"{indent}vals[{slot}] = max(min(new, hi[{slot}]), lo[{slot}])")
        if not any_dyn:
            lines.append(f"{indent}pass")
    lines += [
        "        mt += step_size",
        "        for j in range(out_idx.shape[0]):",
        "            out[k, j] = vals[out_idx[j]]",
        "    return bad",
    ]
    return "\n".join(lines) + "\n"


def _compile(model, index):
    src = _source(model, index)
    key = hashlib.sha1(src.encode()).hexdigest()
    fn = _COMPILED.get(key)
    if fn is None:
        ns = dict(_NAMESPACE)
        exec(compile(src, f'<lm-numba-{key[:8]}>', 'exec'), ns)
        fn = numba.njit(error_model='python')(ns['_run'])
        _COMPILED[key] = fn
    return fn


class NumbaSolver(Solver):
    id = 'numba'
    version = '1'
    capabilities = frozenset({CAP_EVALUATE, CAP_EVENTS, CAP_STOCHASTIC})

    def advance(self, model, schedules, step_size, n_steps, start_step, start_time,
                output_variables, sim_start_date=''):
        fallback = get_solver('fast')
        if n_steps <= 0 or not _can_run_fast(model):
            return fallback.advance(model, schedules, step_size, n_steps, start_step, start_time,
                                    output_variables, sim_start_date)
        names = list(model.variables)
        index = {n: i for i, n in enumerate(names)}
        try:
            fn = _compile(model, index)
            vars_ = [model.variables[n] for n in names]
            vals = np.array([float(v.value) for v in vars_])
            lo = np.array([v.bounds[0] if v.bounds else -np.inf for v in vars_], dtype=float)
            hi = np.array([v.bounds[1] if v.bounds else np.inf for v in vars_], dtype=float)
            unit_sec = TIME_UNIT_SECONDS.get(getattr(model, 'time_unit', 'minute'), 60.0)
            eq_steps = np.array([
                (step_size / getattr(eq, 'step_size_sec', None) if getattr(eq, 'step_size_sec', None)
                 else step_size / unit_sec)
                for _n, eq in model._sorted_equations
            ] or [0.0], dtype=float)

            times = self._times(start_time, step_size, n_steps)
            ctrl = sorted({s.get('variable', '') for s in schedules} & set(index)) if schedules else []
            contrib = np.full((n_steps, max(len(ctrl), 1), 1), np.nan)
            if ctrl:
                signals: List[Dict[str, List[float]]] = [
                    compute_inputs(schedules, times[k], times[k + 1], sim_start_date)
                    for k in range(n_steps)
                ]
                width = max([len(d) for s in signals for d in s.values()] + [1])
                contrib = np.full((n_steps, len(ctrl), width), np.nan)
                for k, sig in enumerate(signals):
                    for c, var in enumerate(ctrl):
                        for m, d in enumerate(sig.get(var, ())):
                            contrib[k, c, m] = d
            ctrl_idx = np.array([index[v] for v in ctrl], dtype=np.int64)
            out_idx = np.array([index[v] for v in output_variables], dtype=np.int64)
            out = np.empty((n_steps, max(len(out_idx), 1)))
            bad = fn(vals, lo, hi, eq_steps, contrib, ctrl_idx, n_steps, step_size, float(model.time),
                     unit_sec, out_idx, out)
            if bad:
                raise ArithmeticError('a value was not finite')
        except Exception as err:
            logger.debug("numba solver handed the run to the fast solver: %s", err)
            return fallback.advance(model, schedules, step_size, n_steps, start_step, start_time,
                                    output_variables, sim_start_date)

        rows = []
        step, time = start_step, start_time
        for k in range(n_steps):
            step += 1
            time = times[k + 1]
            row = {'step': step, 'time': time}
            for j, n in enumerate(output_variables):
                row[n] = float(out[k, j])
            rows.append(row)
        for v, x in zip(vars_, vals):
            v.value = float(x)
        for n, i in index.items():
            model.asteval.symtable[n] = float(vals[i])
        for _ in range(n_steps):
            model.time += step_size
        model.current_step += n_steps
        return rows, step, time

    @staticmethod
    def _times(start: float, step_size: float, n: int) -> List[float]:
        """Time after each step, added up one step at a time as the reference solver does."""
        out = [start]
        for _ in range(n):
            out.append(out[-1] + step_size)
        return out


if numba is not None:
    register_solver(NumbaSolver())
