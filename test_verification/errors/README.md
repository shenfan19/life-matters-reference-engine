# Error-detection regression tests

> Task origin: the error-detection mechanism review (2026-07-05). Unlike
> `test_verification/test_sim_cli_consistency.py` (CLI/GUI path consistency) and
> `test_verification/models/` (single-variable numerical regression), this directory verifies
> the **engine's ability to detect and report a structural/configuration error**: not just that
> it can correctly load a structurally valid model under `models/test_fixtures/valid/`, but that
> it reliably fails when it encounters a deliberately broken model under
> `models/test_fixtures/invalid/`, and surfaces the specific reason to the caller.

## Two preconditions that make this testable

1. **The fixture itself is trustworthy**: each `models/test_fixtures/invalid/*.yaml` deliberately
   breaks exactly one thing, with the rest of its structure valid (see that directory's README
   for the file list), so a test failure points directly to exactly which validation branch broke.
2. **It goes through the real call path, not a low-level internal function**: every test asserts
   via `ReferenceEngine.load_models()` / `run_simulation()` — exactly matching the path the CLI
   (`cli/runner.py`) and GUI (`session_manager.py`) actually use to load a model. This wasn't
   always true: `LoaderEngine.fetch()` (the sole entry point the CLI/GUI use to load a model) used
   to swallow the detailed error message raised by the `Loader`/`Validator`, only logging it,
   leaving the caller with just a bare `None`/`False` and no way to see the specific reason
   (`validate_model()` itself had long been capable of producing a specific error message; the gap
   was in the propagation chain). The fix is in `reference_engine/src/loader_engine.py`'s
   `LoaderEngine.last_error` property; these tests are exactly that fix's regression lock.

## File organization

- `test_structural_errors.py` — `validator.py` (step_size, optimization.method, an equation
  referencing an undeclared variable, the deprecated `dt` symbol)
- `test_import_errors.py` — `loader.py`'s import/YAML-structure validation (a circular import,
  escaping the models root directory, a non-mapping top-level YAML)
- `test_evidence_errors.py` — `loader.py`'s evidence validation (`evidence_type` declared on a
  variable whose role isn't `parameter`, `applies_to` missing `baseline_ref`)
- `test_date_errors.py` — `validation.py` (`end_date` earlier than `start_date`); note that this
  one does **not** fail at the `load_models()` stage, only at `run_simulation()` — the reason is
  noted in the test itself

## Running

```bash
pytest test_verification/errors/
```

## Adding a new error-detection case

First confirm (or add) the corresponding fixture in `models/test_fixtures/invalid/README.md`,
then add an `assert not engine.load_models([...])` plus an assertion that `engine.loader.last_error`
contains the key substring, in the corresponding file here.
