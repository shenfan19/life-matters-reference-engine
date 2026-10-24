# Solvers

> A solver is the one place that advances a model through time. Simulation, Monte Carlo, the GUI sessions and the optimizer all call the registered solver instead of stepping the model themselves. The decision is [ADR 0163](decisions/0163-2026-10-23_sim_pluggable-solver-and-views.md).

## The solvers that ship

| Solver | What it is | Speed against `reference` | When it is used |
| --- | --- | --- | --- |
| `reference` | The fixed-step solver the engine always had: equations evaluated in order by `ModelStructure.step()` | 1 | The default, and the gold standard the others are checked against |
| `fast` | The same equations, in the same order, over one flat list of values instead of the model's variable objects, the symbol table and the history of every assignment | about 2.3 | Anywhere the reference solver is used, when speed matters |
| `numba` | The whole run, every step and every equation, compiled to one function | about 3 once compiled, 2.6 on an optimization | Long runs, optimizations, Monte Carlo. Needs numba, which is optional |

`numba` falls back to `fast` for what it cannot reproduce exactly: a division by zero, a value that is not finite, a model with a step hook, an equation that did not compile. The result is then the one the equation semantics give.

The equations are a discrete update rule, not a rate: each step they run in priority order, each assignment reads the current values and is clamped to the variable's bounds. A solver that integrates differently is a different model, so every solver has to reproduce `reference`, not just approximate the dynamics.

## Choosing a solver

| Where | How |
| --- | --- |
| Command line | `lm-sim model.yaml --solver fast` |
| Any process, including the API server | environment variable `LM_SOLVER=numba` |
| One optimization | `solver: numba` in the `optimization:` block, or in the optimizer override of the GUI |
| GUI | the solver selector in the toolbar, shown when the backend offers more than one. The choice is kept in the browser and sent with every simulation and optimization |
| API | `GET /api/solvers` lists the solvers and their capabilities. `POST /api/simulation/start` takes an optional `solver` |

A result names the solver that produced it (`solver: {id, version, capabilities}`), because a published result and a validation grade mean something only together with the solver and its version.

## Capabilities

A solver lists what it provides, and a consumer asks for what it needs.

| Capability | Meaning | Provided by |
| --- | --- | --- |
| `evaluate` | Black-box evaluation: inputs in, trajectory out | all |
| `events` | Pulses and windows in the input signal | all |
| `stochastic` | Parameter sampling for random models | all |
| `snapshot` | `snapshot(model)` and `restore(model, snap)`, to resume a run or try several futures from one state | all |
| `batch` | Many evaluations at once | none yet |
| `gradient` | Sensitivities of the outputs to inputs and parameters | none yet |

The optimizer backends name their needs in `optimizer_backends.BACKEND_REQUIRES`, and `pick_solver(required, solver_id)` returns a solver that has them or fails with the missing ones listed. A gradient method would therefore be offered only a solver with `gradient`.

## The pieces around a solver

| Piece | Where | What it does |
| --- | --- | --- |
| Input signal | `schedule_runner.InputSignal`, `compute_inputs`, `input_trajectory` | Turns the schedules into what each controlled variable receives in a step window. The window, day, date range and `delivery` rules (ADR 0131, 0132) live here and nowhere else, so a solver does not implement them again. `apply_inputs` writes a signal into a model |
| Trajectory | `result.Trajectory` | The one result form: step numbers, times, one list per variable, and the solver. `rows()` gives the one-dict-per-step form that sessions and CSV read |
| Registry | `solver.py` | `register_solver`, `get_solver`, `set_default_solver`, `find_solvers`, `pick_solver`, `list_solvers` |

## Adding a solver

1. Subclass `Solver` in `reference_engine/src/`, give it an `id`, a `version` and its `capabilities`, and implement `advance(model, schedules, step_size, n_steps, start_step, start_time, output_variables, sim_start_date)`. Read the schedules through `InputSignal`, not by re-implementing them.
2. Call `register_solver(MySolver())`, for example from `solver.py` the way `fast` and `numba` are imported.
3. Add it to the conformance suite `test_verification/test_solver_fast.py`: the same models are run to CSV under the reference solver and yours and the files must agree (identical for an exact solver, within a relative 1e-9 for a compiled one). The optimizer front and a GUI session are compared too.
4. A solver may be used for published results only while that suite passes for it.

## Checking that nothing changed

`test_verification/behavior_snapshot/` keeps a hash of the full output of fixed simulation, Monte Carlo and optimization cases. `golden.json` was recorded before the solver refactor and the current default solver reproduces it. The simulation and Monte Carlo part runs as a test (`test_behavior_snapshot.py`); the optimization part takes minutes and is run by hand with `python test_verification/behavior_snapshot/behavior_snapshot.py snapshot OUT.json` followed by `compare golden.json OUT.json`. Replace the golden file only when a change is meant to alter results.
