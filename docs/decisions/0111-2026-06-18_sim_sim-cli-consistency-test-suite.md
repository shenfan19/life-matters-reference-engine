# ADR 0111 — The Sim/CLI Consistency Regression Test Suite

**Date**: 2026-06-18
**Status**: Accepted
**Scope**: sim_engine (test infrastructure, the repository's first automated test suite)

---

## Background

The "Relationship with the GUI" section of `docs/cli.md` states "the CLI and GUI share the same engine layer, with a consistent result format, and are interoperable" — this is a promise to external users (including AI agents, see ADR 0101), but until now no automated means existed to verify it.
Investigation confirmed this promise once did not hold (see the part of [ADR 0110](0110-2026-06-17_sim_unify-plan-schedule-parsing.md) about the plan/regimen parsing's dual implementation), and found a separate bug in `session_manager.py::start_session()`: for a model containing a distribution parameter (`parameter: normal(...)`, etc.), when `sim_runs=1` (MC not explicitly requested), it still sampled randomly instead of taking the mean as specified by [ADR 0045](0045-2026-04-30_sim_mc-probabilistic-simulation-and-random-parameter-architecture.md) — causing the GUI's default run result and the CLI's to never match, and the GUI's own result to not even be reproducible with itself.

This is a single-file bug fix (adding an `n_runs > 1` condition to the per-run sampling check in `session_manager.py`), which by the project's ADR criteria would not need its own entry; but since the problem itself is about "consistency of results between two formal interfaces," an automated test that keeps a long-term eye on this is needed, rather than relying on manual investigation to discover it each time.

## Decision

**Add a `tests/` directory, the repository's first automated test suite, dedicated to verifying that the CLI and GUI paths give consistent simulation results for the same model.**

Following the constraint [ADR 0072](0072-2026-05-15_project_gui-only-no-cli.md) already established — "tests directly import the engine-layer Python functions, not going through the CLI's parsing layer" — `tests/test_sim_cli_consistency.py` does not fork a `sim_cli/main.py` subprocess or start an HTTP server; it imports `sim_engine.src.simulator_engine.SimulatorEngine` directly:

- **The CLI path**: `engine.run_simulation()` / `run_simulation_all_plans()` (writes CSV, reads it back for comparison)
- **The GUI path**: `engine.start_session()` plus `batch_steps()` (returns in memory, compared directly)
- Both paths are fed the same `current_model.plans[plan_id]` (the backend's already-parsed regimen data, the sole source since ADR 0110), comparing every output variable's value step by step, requiring exact numerical agreement

Test cases:
1. `models/test/test_plans.yaml` (no distribution parameters) times 3 plans: purely verifies whether the CLI's continuous `run_simulation` loop and the GUI's `start_session`/`batch_steps` batched loop, two different execution mechanisms, produce the same trajectory when fed the same regimen data.
2. `models/test/test_mc_distributions.yaml` (has distribution parameters): the GUI path at `sim_runs=1`, pinning down a regression for the MC-determinism bug above — after verification, this case is confirmed to fail when the bug is reintroduced and pass once fixed.

### Accompanying infrastructure

- Added `pytest.ini` (`testpaths = tests`). The repository root at the time had a `pyproject.toml` that was not valid TOML (just an informal note); pytest would by default try to parse it as a configuration source and error out; `pytest.ini` takes higher priority and sidesteps this problem, without changing `pyproject.toml` itself at the time. **Update on 2026-07-24**: confirmed this file was indeed just an informal note on the asteval/numexpr/sympy choice, with no tool referencing it, and it has been deleted. The current `testpaths` value is actually `test_verification` (the test directory was later reorganized from `tests` to `test_verification`; the `tests` recorded in this entry is the old name at the time this ADR was written, not retroactively updated). `pytest.ini` itself, along with `.pre-commit-config.yaml`, were also moved from the repository root to `scripts/` on the same day (renamed to drop `.pre-commit-config.yaml`'s leading dot), so the root no longer holds a pure tooling-config file: pytest now uses a `scripts/test.sh` wrapper call (internally `pytest -c scripts/pytest.ini test_verification`); pre-commit regenerates `.git/hooks/pre-commit` with `pre-commit install -c scripts/pre-commit-config.yaml`, and still triggers automatically on `git commit`, with no extra step needed.

## Out of scope for this round

- ~~Not verifying the optimizer (`--opt`) path's consistency: the CLI's and GUI's opt routes both call the same `sim_engine.src.optimizer_engine.run_optimizer` directly, and no divergence was found, so a dedicated test isn't needed for now.~~
  **Correction (see [ADR 0112](0112-2026-06-19_sim_opt-startpoint-faithfulness-fix.md))**: at the time, only "both sides call the same function" was confirmed, without checking whether the `optimizer_override` passed in was equivalent — a later investigation found the GUI had always hardcoded `algorithm.seed` to `42`, and the T4 (`optimize.date_range`) search dimension was silently dropped in a frontend round-trip; both have since been fixed, and an opt-consistency test has been added (see ADR 0112/0113).
- Not verifying the frontend TypeScript's plan-mapping logic (the part ADR 0110 handled): that is pure field mapping, already verified through actual browser testing, and out of scope for this Python test suite.

## Result

```
tests/test_sim_cli_consistency.py   Added, 4 test cases
pytest.ini                          Added
sim_engine/src/session_manager.py   Added an n_runs > 1 condition to start_session()'s sampling check (an ADR 0045 regression fix)
```

## Related

- ADR 0045 — the MC probabilistic-simulation architecture (the original decision that "MC=1 means deterministic mode, taking the mean")
- ADR 0072 — tests directly import engine-layer functions, not going through the CLI's parsing layer
- ADR 0101 — the CLI upgraded to a public release interface (result consistency matters especially to AI/automated users)
- ADR 0110 — a single source for Plan/Schedule parsing
- `docs/cli.md`'s "Relationship with the GUI" section's "consistent result format" promise
