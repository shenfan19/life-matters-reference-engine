"""NSGA-II and single-objective scipy optimizer backends.

Both take a model-agnostic `evaluate(x) -> (F, G)` callback built by
optimizer_engine.run_optimizer() — these backends only know about the
search/optimization loop, not regimens, simulation, or YAML parsing.
"""

import logging
import numpy as np
from typing import Dict, List

logger = logging.getLogger(__name__)


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

def _restore_signs(f: List[float], objectives: List[Dict]) -> List[float]:
    """Convert pymoo minimize-convention values back to display values."""
    return [-f[j] if obj.get('direction', 'minimize') == 'maximize' else f[j]
            for j, obj in enumerate(objectives)]


# Penalty applied per unit of constraint violation (G[i] > 0) for solvers
# (L-BFGS-B, Nelder-Mead) that don't support general constraints natively.
_CONSTRAINT_PENALTY = 1e6


def _run_scipy(evaluate, n_var, n_obj, n_con, xl, xu, objectives, method='L-BFGS-B', progress_callback=None):
    try:
        from scipy.optimize import minimize as sp_minimize

        _iters = [0]

        def _scalar(x):
            f, g = evaluate(np.array(x))
            val = float(f[0]) if f else float('inf')
            if g:
                val += _CONSTRAINT_PENALTY * sum(max(0.0, gi) for gi in g)
            _iters[0] += 1
            if progress_callback:
                f_display = _restore_signs(f, objectives)
                progress_callback({
                    'iteration': _iters[0],
                    'fitness': val,
                    'n_eval': _iters[0],
                    'feasible_ratio': 1.0 if not g or max(g) <= 1e-9 else 0.0,
                    'pareto_front': [{'f': f_display}],
                })
            return val

        x0 = (xl + xu) / 2.0
        bounds = list(zip(xl, xu))

        if method == 'Nelder-Mead':
            res = sp_minimize(_scalar, x0, method='Nelder-Mead', bounds=bounds)
        else:
            res = sp_minimize(_scalar, x0, method='L-BFGS-B', bounds=bounds)

        if not res.success and res.fun == float('inf'):
            return {"success": False, "error": f"scipy {method} failed: {res.message}"}

        x_opt = np.clip(res.x, xl, xu).tolist()
        f_opt, _ = evaluate(np.array(x_opt))
        f_display = _restore_signs(f_opt, objectives)

        return {
            "success": True,
            "method": method,
            "pareto_front": [{"x": x_opt, "f": f_display}],
            "n_solutions": 1,
            "best_x": x_opt,
            "best_f": f_display,
        }
    except Exception as e:
        logger.exception(f"scipy {method} failed")
        return {"success": False, "error": str(e)}
