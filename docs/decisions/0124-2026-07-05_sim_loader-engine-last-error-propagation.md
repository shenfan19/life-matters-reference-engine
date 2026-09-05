# 0124 — LoaderEngine error-message propagation: `fetch()` gains `last_error`

**Date**: 2026-07-05
**Status**: Accepted

---

## Background

Reviewing the current state of the engine's error-detection mechanism found that `Loader`/`Validator` (`model_structure/loader.py`, `model_structure/validator.py`) already generate specific, readable error messages (e.g. "circular import detected," "formula missing step_unit," "evidence name collides with variables") — but `LoaderEngine.fetch()` (`loader_engine.py`), the sole entry point through which the CLI/GUI load a model, only writes `e` to the log in its `except Exception as e` branch and returns a bare `None`.

`ReferenceEngine.load_models()` returns only the boolean `self.loader.fetch(...) is not None`, which propagates further up to `run_simulation`/`run_simulation_mc`/`run_simulation_all_plans` (`reference_engine.py`), `start_session` (`session_manager.py`), and `run_optimizer` (`optimizer_engine.py`), everywhere degrading into the same hardcoded fallback: "Cannot load model: {model_name}" — the specific cause can only be found by digging through the log file, and the JSON `{"success": false, "error": "Cannot load model: xxx"}` returned to the frontend by the GUI gives no indication of what actually went wrong.

This means the "error-detection mechanism" is complete in its validation logic itself, but there is a gap in how the error message propagates along the main call path — it was detected, but not communicated clearly.

## Decision

Add a `self.last_error: Optional[str]` attribute to `LoaderEngine`:

- `fetch()` resets it to `None` at the start; each of the three failure branches (circular dependency, file not found, `load_model`/`validate_model` raising an exception) writes its specific message into `self.last_error`, then logs and returns `None` as before.
- The callers (3 sites in `reference_engine.py`, 1 in `session_manager.py`, 1 in `optimizer_engine.py`) had their hardcoded fallback message changed to `self.loader.last_error or f"Cannot load model: {model_name}"` — if `last_error` has a value, use it; if not (which should not happen in theory, kept only as a fallback against a bare null-pointer-style error) fall back to the old wording.

This does not change the return type of `fetch()`/`load_models()` (still `Optional[ModelStructure]`/`bool`); `last_error` is a side-channel attribute, introducing no new exception type or return-value schema change — fully backward compatible.

### Why not have `fetch()` raise an exception directly

Existing callers of `fetch()` (`scan_models()`, which scans the whole library in bulk, and `merge_models()`) depend on its contract of "returning `None` on failure" to skip a bad model and continue to the next one; switching to raising an exception would require touching the try/except structure at each of these call sites. Adding only an optional error-message side channel keeps the change surface small and behavior unchanged.

## Outcome

- `reference_engine/src/loader_engine.py`: new `self.last_error`, written at the three failure points in `fetch()`
- `reference_engine/src/reference_engine.py`: 3 sites (`run_simulation`, `run_simulation_mc`, `run_simulation_all_plans`) changed to prefer displaying `self.loader.last_error`
- `reference_engine/src/session_manager.py`: same for `start_session`
- `reference_engine/src/optimizer_engine.py`: same for `run_optimizer`
- Regression coverage: all 11 test cases in `tests/errors/` (see ADR 0125 in the life-matters-models repository) now pass by asserting that `ReferenceEngine.load_models()` sets `engine.loader.last_error` to a message containing the specific cause, rather than only asserting the return value is `False` — this is precisely the gap being fixed here.

## Open items

- The CLI's single-model path (`cli/main.py`) currently still only prints "Simulation failed. Check log for details.," without surfacing `result['error']` to the terminal — this is a separate CLI interaction-experience issue, out of scope for this change.
