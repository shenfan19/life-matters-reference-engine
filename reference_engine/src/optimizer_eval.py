"""Simulation execution + objective/constraint evaluation for the optimizer.

_run_sim() drives one full simulation given a decoded {variable: events} map
(built by optimizer_engine.run_optimizer()'s _build_regimen_events closure);
_eval_F()/_eval_G() reduce the resulting per-variable history into the
objective vector and constraint-violation vector the NSGA-II/scipy backends
in optimizer_backends.py expect.
"""

from typing import Dict, List

from .schedule_runner import apply_schedules, precompute_sustained_divisors
from .optimizer_parsing import _parse_condition


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


def _run_sim(model, schedule_events_by_var: Dict[str, List[Dict]],
             step_size_sec: float, total_steps: int,
             sim_start_date: str = '') -> Dict[str, List[float]]:
    """Run a full simulation and return per-variable history lists.

    Uses apply_schedules() from schedule_runner (pulse reset + accumulate) — same
    kernel as the GUI sim path, eliminating the duplicate implementation.
    """
    model.reset_simulation()

    # Convert dict format → list format expected by apply_schedules
    schedules_list = [
        {'variable': var_name, 'events': evts}
        for var_name, evts in schedule_events_by_var.items()
    ]
    # ADR 0131: precompute sustained-mode value/_n_steps divisors once per run
    schedules_list = precompute_sustained_divisors(schedules_list, step_size_sec)

    history: Dict[str, List[float]] = {n: [] for n in model.variables}
    for i in range(total_steps):
        prev_t = i * step_size_sec
        apply_schedules(model, schedules_list, prev_t, prev_t + step_size_sec, sim_start_date)
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
    every timestep. Any explicit `metric` (`final`/`mean`/`max`/`min`) reduces
    the trajectory via `_eval_metric` first and checks the bound against that
    single value instead — e.g. `metric: mean` for a constraint meant to read
    as an overall/average floor rather than an always-on per-timestep bound
    (a deliberate dip, such as a scheduled full-rest day, shouldn't violate it).
    """
    G = []
    for con in constraints:
        vals = history.get(con['variable'], [0.0])
        op, threshold = _parse_condition(con.get('condition', '<= 0'))
        metric = con.get('metric')
        if metric:
            val = _eval_metric(vals, metric)
            if op in ('<=', '<'):
                G.append(val - threshold)
            else:
                G.append(threshold - val)
        elif op in ('<=', '<'):
            G.append(max(vals) - threshold)
        else:
            G.append(threshold - min(vals))
    return G
