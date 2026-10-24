# 0163 — Pluggable Solvers and Views: Simulation, Optimization and the Model Editor as Registered Parts

**Date**: 2026-10-23
**Status**: ✅ accepted

---

## Background

The engine had one way to advance a model through time and it was called directly from five places: the command line run, the GUI session batches, the Monte Carlo runs, the optimizer, and the tests. The optimizer reached into `ModelStructure.step()` through its own copy of the step loop. The GUI had three built-in views, Overview, Simulation and Optimization, and the model editor, all wired by hand into one component, while plugin views (ADR 0157) went through a separate path. Neither the computational core nor the built-in views could be replaced or extended without editing the code that uses them.

## Decision

**1. One solver interface.** `reference_engine/src/solver.py` defines `Solver` with `advance(model, schedules, step_size, n_steps, start_step, start_time, output_variables, sim_start_date)` and `run(...)`, which resets the model and returns the whole history. Every caller that moves a model forward asks `get_solver()` for the solver and no longer calls the step loop itself: `ReferenceEngine.run_simulation`, the Monte Carlo runs, the session batches of the GUI and `optimizer_eval._run_sim`. The optimizer and the simulator can no longer drift apart, because they share the same call.

**2. The reference solver keeps the old behaviour exactly.** `ReferenceSolver` wraps `advance_steps`, the fixed-step solver that evaluates equations in order. It is the gold standard other solvers are measured against. A test runs the old hand-written loop and the solver on the same model and requires the same history.

**3. Capabilities.** A solver lists what it provides: `evaluate`, `batch`, `gradient`, `snapshot`, `events`, `stochastic`. `find_solvers(required)` returns the registered solvers that have all of them, so an optimizer that needs gradients is only offered a solver that has them. Only the reference solver is registered. The registry exists so a second solver can be added without touching the callers.

**4. Not changed.** The meaning of the equations, the input semantics of ADR 0131 and ADR 0132, and the result format. A second solver has to reproduce the reference solver within a tolerance before it may be used for results that are published.
