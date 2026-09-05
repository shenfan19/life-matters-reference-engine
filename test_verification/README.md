# test_verification — the pytest verification suite for the engine code

`test_verification/` is the repository's Python unit/regression test suite, driven by `pytest`, and what it verifies is **whether the code in `cli/` and `reference_engine/` itself implements what it's supposed to** — not whether some specific model YAML's numbers match the literature/clinical common sense (that belongs to `models/validation/`, see "Relationship with `models/test_fixtures/` and `models/validation/`" below).

## What this directory does / doesn't do

**What it does**:
- Asserts that a given Python function/interface produces the expected output for a given input (e.g. `apply_schedules()`'s pulse reset should not be clamped by the bounds lower floor: `test_schedule_runner.py`).
- Puts a "regression lock" on a historical bug — once a bug is fixed, a new test case reproducing it is added, so any later change that makes it fail again means the bug has come back (almost every file's docstring in this directory states the corresponding bug background and where it was fixed).
- Verifies that the CLI and GUI paths produce exactly the same result when they share the same engine layer (`test_sim_cli_consistency.py`).
- Verifies that the engine reliably fails, with the error propagated to the caller, when it encounters a structurally or configurationally broken model YAML (`errors/`).
- Verifies that some specific model's variable follows the numerical relationship (monotonicity, linear scaling, etc.) expected from that model's own equations, across multiple parameter values (`models/`).

**What it doesn't do**:
- It does not verify a model's scientific/literature credibility (whether `daily_dose` should be 200mg is not answered here).
- It does not run real browser/GUI interactions (that's `gui/e2e/`, see "What is a smoke test" below).
- It does not do performance/load testing.

## Input / output

- **Input**: each test file is self-contained Python code that `import`s the engine-layer modules directly (e.g. `reference_engine.src.reference_engine.ReferenceEngine`), without going through the CLI's `argparse` layer or starting an HTTP server (a constraint from ADR 0072). Some tests load a fixture YAML from `models/test_fixtures/valid/` or `models/test_fixtures/invalid/` as input data.
- **Output**: standard pytest results — PASS/FAIL per `test_*` function, printing the specific assertion diff on failure (not a generated Markdown report like `cli/batch.py`).

## Running

```bash
./scripts/test.sh         # configured via scripts/pytest.ini; use this script instead of calling pytest directly, runs everything
pytest -c scripts/pytest.ini test_verification   # the equivalent manual invocation
pytest test_verification/errors/           # only run the error-detection cases
pytest test_verification/models/           # only run the numerical-regression cases
pytest test_verification/test_schedule_runner.py::test_pulse_value_not_inflated_by_nonzero_bounds_floor
```

## Directory structure

```
test_verification/
├── verification_report.md       # the methodology and current results for engine implementation correctness + numerical precision (the Verify side)
├── test_capacity_limits.py       # concurrency throttling (a P1/P2 public-deployment protection)
├── test_same_day_duration.py     # simulation-duration regression for a same-day model (start_date == end_date)
├── test_schedule_runner.py       # a regression for apply_schedules()'s pulse reset
├── test_session_cleanup.py       # GUI session idle-timeout cleanup (a P0 public-deployment requirement)
├── test_sim_cli_consistency.py   # CLI/GUI path consistency (ADR 0045/0110/0112/0113)
├── errors/                       # regressions for the error-detection mechanism, see errors/README.md
└── models/                       # single-model variable numerical regressions, see models/README.md
```

## What is a smoke test — and why this directory is mostly not one

The terminology is often confused; ordered from shallow to deep in coverage/depth:

- **A smoke test**: runs through the most basic golden path once, confirming only "the system isn't completely broken," without digging into whether the details are correct. Characterized by broad coverage, few assertions, and fast execution. This repository's real smoke test is `gui/e2e/specs/run-simulation.spec.ts` — selecting a model in a real browser, clicking simulate, and confirming the result panel actually received data points, nothing more, with no check on whether the numbers are correct.
- **A unit test**: targets one function/a small piece of logic, asserting specific behavior, with narrow coverage and precise assertions. Most of this directory's `errors/`, `test_schedule_runner.py`, etc. fall into this category.
- **A regression test**: not necessarily a test for "new" functionality, but a lock case written for a historical bug that's already been fixed, meant to prevent that same bug from being reintroduced later. Almost every file in this directory carries both identities, "unit test" and "regression test" — first a regression lock (the docstring states which fix it corresponds to), which incidentally also verifies normal behavior.
- **A consistency/integration test**: verifies a result is consistent across multiple modules or paths (such as the CLI and GUI code paths), broader in coverage than a unit test but still making precise assertions, not just "it runs." `test_sim_cli_consistency.py` falls into this category.

In one sentence: **a smoke test asks "is the system still alive," this directory asks "was this line of code written correctly."**

## Relationship with `models/test_fixtures/` and `models/validation/`

The YAML under `models/test_fixtures/valid/` and `models/test_fixtures/invalid/` is "data," and the pytest cases in this directory (`test_verification/`) are "assertions" — the two test the same thing (whether the engine code is written correctly), just split across two repositories: quite a few tests read `models/test_fixtures/valid/*.yaml` directly as input (e.g. `test_same_day_duration.py` reads `test_valid_same_day_duration.yaml`), asserting on the engine code's behavior, not the model's scientific content; a batch-running approach like `cli/batch.py --input-dir test_fixtures/valid` is just another way of driving the same role.

`models/validation/` (including `validation_report.md`) is an entirely different matter — it tests whether a specific model's output matches the literature/clinical common sense ("validate"), with no content overlap with this directory or with `models/test_fixtures/`; it is simply the other half of the same layered-validation effort, with the methodological relationship described at the start of `verification_report.md`.
