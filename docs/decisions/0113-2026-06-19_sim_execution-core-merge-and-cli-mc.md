# ADR 0113 — Merging the Sim Execution Core (CLI/GUI Sharing `advance_steps`) Plus Adding MC to the CLI

**Date**: 2026-06-19
**Status**: accepted
**Scope**: sim_engine (`regimen_runner.py` / `simulator_engine.py` / `session_manager.py` /
`mc_utils.py`), sim_cli (`main.py` / `runner.py`)

---

## Background

The user asked for an assessment of how fully sim's execution actually converges between the CLI and the GUI, with instructions to "merge wherever it can be merged" — not a local patch, but wanting the GUI's execution core to directly reuse the CLI's methods rather than maintaining two parallel implementations.

The investigation found that the CLI's `run_simulation` (`simulator_engine.py`, running straight through to completion then writing a CSV) and the GUI's `batch_steps` (`session_manager.py`, polled in batches, supporting pause/MC) each hand-wrote their own version of the "`apply_regimens` -> `model.step()` -> record one output row" loop body — both did share the underlying `apply_regimens`/`model.step()` functions, but the loop itself (how it's chunked, how rows are collected, how `step`/`time` accumulate) was two independent pieces of code that merely happened to look alike, not a true convergence.

Separately, the CLI's `--sim` had no Monte Carlo capability at all (multiple runs, parameter sampling) — not "inconsistent with the GUI," but simply "nothing to compare against." The user explicitly asked for this to be added, so the CLI and GUI could be checked directly against each other using the same master seed.

## Decision

### 1. Extracting a shared single/multi-step execution core, `advance_steps`

A new `regimen_runner.py::advance_steps(model, regimens, step_size, n_steps, start_step, start_time, output_variables, sim_start_date)` wraps the "apply_regimens -> model.step() -> collect one row {step, time, **vars}" loop body into a single function, returning `(rows, end_step, end_time)`. It lives in `regimen_runner.py` (rather than `simulator_engine.py` or `session_manager.py`) because those two files import each other (`simulator_engine.py` uses `session_manager.py` via `SessionManagerMixin`), and placing it in `regimen_runner.py`, which both already depend on, avoids a circular import.

- The **CLI**'s `run_simulation`: the original `while` loop is now split into chunked calls to `advance_steps` by `pause_every` (the whole thing runs in one chunk when there's no interactive pause); the outer loop keeps only the CSV row assembly and the pause-callback check — the pause/`q`-to-stop-early semantics are completely unchanged (the original code already only checked `self.running` at chunk boundaries).
- The **GUI**'s `batch_steps`: both the single-run path and the MC multi-run path now call `advance_steps` for their loop bodies, with `session['current_step']`/`session['time']` (or each run's own) passed in to support resuming across multiple polls.

The 4 existing test cases in `tests/test_sim_cli_consistency.py` served as the regression safety net for this refactor — all of them kept passing before and after, confirming that "extracting a shared function" introduced no behavior change by itself.

### 2. Extracting a shared seed-derivation function, `derive_seed_list`

A new `mc_utils.py::derive_seed_list(session_seed, n_runs)` extracts the logic that used to be inlined in `start_session()`: `master_rng = np.random.default_rng(session_seed)` deriving a `seed_list`. The GUI's `start_session` now calls it; the CLI's new MC capability (below) calls it too — this is the key to both sides being able to reproduce the same set of per-run seeds from the same master seed.

### 3. Adding `--mc-runs N` / `--seed X` to the CLI

`sim_cli/main.py` gains two new parameters; `runner.py::run_sim` passes them through to
`SimulatorEngine.run_simulation_mc()` (a new method, `simulator_engine.py`):

- `n_runs == 1`: unchanged behavior (deterministic, ADR 0045).
- `n_runs > 1`: `derive_seed_list` derives a `seed_list`; each run does `clone_model` +
  `apply_parameter_sampling` + `advance_steps`, writing `<stem>__run{i}.csv`
  (or `<stem>__<plan_id>__run{i}.csv` with multiple plans).

`run_simulation_all_plans` gains `n_runs`/`seed` parameters; when `n_runs > 1`, each plan now calls
`run_simulation_mc` (instead of `run_simulation`), with the filename gaining an extra `__run{i}` suffix; when `n_runs == 1`, the paths and filenames are exactly as before, so existing users are unaffected.

#### A real bug found and fixed during implementation

The first version of `run_simulation_mc` was written in the order "clone -> run this run to completion right away -> clone for the next run," but run 0 ran directly on `base_model` (with no clone) in place — meaning that by the time run 0 finished, `base_model` had already been mutated into its post-run terminal state, so when run 1 called `clone_model(base_model)`, it was cloning run 0's terminal state, not the initial state! This differs from the GUI's `start_session`, which prepares every run's model (clone plus sampling) before any run begins stepping. The new MC-consistency test in `tests/test_sim_cli_consistency.py` (below), run against the pre-merge code, did produce a genuine inconsistency (a history-dependent Accumulator variable like `peak_plasma` drifted numerically on runs 1/2). The fix was to split "cloning all runs" and "running all runs" into two separate phases, aligned with `start_session`'s order. Once again, "write the test first, and the test actually catches the bug" validated the methodology ADR 0111/0112 have been using all along.

### 4. Test coverage

Two new test cases in `tests/test_sim_cli_consistency.py`:

- `test_mc_runs_match_with_same_seed`: compares the CLI's `run_simulation_mc(n_runs=3, seed=19)` against the GUI's `start_session(sim_runs=3, seed=19)`, run by run, comparing the derived seeds and the post-sampling final state, requiring an exact match.
- `test_opt_unedited_gui_override_matches_cli_cold_start`: compares the `optimizer_override` the unedited GUI path sends to the backend (taken directly from the YAML's own `optimizer.startpoint/objectives/constraints/algorithm`, representing a faithful frontend round trip — already verified lossless for the T1-T4 fixtures by ADR 0112's `optUtils.test.ts`) against the CLI's cold start (which overrides only `warm_start`), requiring an exact match. This also corrects the inaccurate conclusion in ADR 0111 that "opt showed no divergence."

## Out of scope for this round

- Merging the opt path's execution core: opt's simulation execution (`optimizer_engine.py::_run_sim`) already calls
  `apply_regimens` (not this round's `advance_steps`) and is left unchanged for now — opt's loop structure (a fitness function called repeatedly, needing only the terminal state each time, not a step-by-step record) differs from sim's step-by-step recording needs, and forcing it onto the same `advance_steps` has no clear payoff; left as an option to evaluate if needed in the future.
- Changing `derive_seed_list`'s own seed-derivation algorithm to something else: the current approach (deriving from `np.random.default_rng`) is what the GUI already uses — this round only extracted it as shared code, without changing the algorithm.

## Result

```
sim_engine/src/regimen_runner.py      added advance_steps (the shared CLI/GUI step-loop core)
sim_engine/src/simulator_engine.py    run_simulation now calls advance_steps; added run_simulation_mc;
                                       run_simulation_all_plans gained n_runs/seed parameters
sim_engine/src/session_manager.py     the single/multi-run paths of batch_steps now call advance_steps;
                                       start_session now calls derive_seed_list
sim_engine/src/mc_utils.py            added derive_seed_list
sim_cli/main.py                       added --mc-runs / --seed parameters
sim_cli/runner.py                     run_sim gained n_runs/seed parameters, passed through plus filename handling
tests/test_sim_cli_consistency.py     added 2 test cases (MC consistency + opt consistency)
docs/cli.md                           the "Relationship with the GUI" table gained an MC row
```

## Related

- ADR 0045 — the MC probabilistic-simulation architecture
- ADR 0072 — a test imports the engine-layer functions directly
- ADR 0101 — the CLI as a publicly released interface
- ADR 0110 / 0111 / 0112 — earlier work from the same round of sim/opt consistency investigation
