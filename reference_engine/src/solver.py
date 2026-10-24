"""Solver interface: the one place that advances a model through time.

Simulation (CLI and GUI sessions), Monte Carlo and the optimizer all move a model
forward through a Solver instead of calling ModelStructure.step() themselves, so a
different computational core can be registered next to the reference one without
touching any of them (ADR 0160).

A solver declares what it can do as a set of capability names. A consumer that
needs a capability asks the registry for a solver that has it; the optimizer
backends in optimizer_backends.py declare the capabilities they need the same way.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Sequence, Tuple

from .result import Trajectory
from .schedule_runner import advance_steps, precompute_sustained_divisors

# Capability names. A solver lists the ones it provides.
CAP_EVALUATE = 'evaluate'        # black-box evaluation: inputs in, trajectory out
CAP_BATCH = 'batch'              # many evaluations at once, for populations and Monte Carlo
CAP_GRADIENT = 'gradient'        # sensitivities of outputs to inputs and parameters
CAP_SNAPSHOT = 'snapshot'        # save and restore the state mid-run
CAP_EVENTS = 'events'            # pulses and threshold events
CAP_STOCHASTIC = 'stochastic'    # random models and parameter sampling


class Solver(ABC):
    """Advances a model by a number of fixed steps under a list of input schedules."""

    id: str = ''
    version: str = ''
    capabilities: frozenset = frozenset()

    @abstractmethod
    def advance(self, model, schedules: list, step_size: float, n_steps: int,
                start_step: int, start_time: float, output_variables: Sequence[str],
                sim_start_date: str = '') -> Tuple[List[Dict], int, float]:
        """Advance `model` by `n_steps`. Returns (rows, end_step, end_time), one row per
        step as {'step', 'time', **{variable: value}}."""

    def simulate(self, model, schedules: list, step_size: float, n_steps: int,
                 sim_start_date: str = '') -> Trajectory:
        """Reset `model`, run it from time zero and return the trajectory of every variable,
        stamped with this solver's identity."""
        model.reset_simulation()
        schedules = precompute_sustained_divisors(schedules, step_size)
        names = list(model.variables)
        rows, _, _ = self.advance(model, schedules, step_size, n_steps, 0, 0.0, names, sim_start_date)
        return Trajectory.from_rows(rows, names, self.info())

    def run(self, model, schedules: list, step_size: float, n_steps: int,
            sim_start_date: str = '') -> Dict[str, List[float]]:
        """`simulate`, reduced to the per-variable history the optimizer evaluates."""
        return self.simulate(model, schedules, step_size, n_steps, sim_start_date).history()

    def info(self) -> Dict:
        return {'id': self.id, 'version': self.version, 'capabilities': sorted(self.capabilities)}


class ReferenceSolver(Solver):
    """The existing fixed-step solver: equations evaluated in order by ModelStructure.step().

    It is the gold standard other solvers are checked against, so its behaviour is the
    behaviour the engine had before solvers became pluggable."""

    id = 'reference'
    version = '1'
    capabilities = frozenset({CAP_EVALUATE, CAP_EVENTS, CAP_STOCHASTIC})

    def advance(self, model, schedules, step_size, n_steps, start_step, start_time,
                output_variables, sim_start_date=''):
        return advance_steps(model, schedules, step_size, n_steps, start_step, start_time,
                             list(output_variables), sim_start_date=sim_start_date)


DEFAULT_SOLVER_ID = ReferenceSolver.id
_default_id = DEFAULT_SOLVER_ID
_REGISTRY: Dict[str, Solver] = {}


def register_solver(solver: Solver) -> None:
    if not solver.id:
        raise ValueError('a solver needs an id')
    _REGISTRY[solver.id] = solver


def get_solver(solver_id: Optional[str] = None) -> Solver:
    """The solver registered under `solver_id`, or the default one."""
    key = solver_id or _default_id
    try:
        return _REGISTRY[key]
    except KeyError:
        raise KeyError(f"unknown solver '{key}', registered: {sorted(_REGISTRY)}") from None


def set_default_solver(solver_id: str) -> None:
    """Make `solver_id` the solver every caller gets when it does not name one."""
    global _default_id
    get_solver(solver_id)
    _default_id = solver_id


def list_solvers() -> List[Dict]:
    return [s.info() for s in _REGISTRY.values()]


def find_solvers(required: Sequence[str]) -> List[Solver]:
    """Every registered solver that provides all of the `required` capabilities."""
    need = set(required)
    return [s for s in _REGISTRY.values() if need <= s.capabilities]


def pick_solver(required: Sequence[str], solver_id: Optional[str] = None) -> Solver:
    """The solver a consumer with `required` capabilities runs on.

    A named solver is used if it has the capabilities, otherwise the call fails with the
    missing ones listed. Without a name the default solver is used if it fits, else the
    first registered solver that does."""
    need = set(required)
    if solver_id:
        chosen = get_solver(solver_id)
        missing = need - chosen.capabilities
        if missing:
            raise ValueError(f"solver '{chosen.id}' lacks {sorted(missing)}")
        return chosen
    default = get_solver()
    if need <= default.capabilities:
        return default
    fits = find_solvers(required)
    if not fits:
        raise ValueError(f"no registered solver provides {sorted(need)}")
    return fits[0]


register_solver(ReferenceSolver())

from . import solver_fast  # noqa: E402,F401  (registers the fast solver)
from . import solver_numba  # noqa: E402,F401  (registers the compiled solver when numba is installed)
